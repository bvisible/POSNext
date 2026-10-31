/**
 * //// Neoffice — added file (no upstream equivalent). A setting saved at the till that changes what it sells (its
 * //// price list, its item groups, its brands, the variants) reaches the till's items at once, from the server: the
 * //// browser's copy of the items keeps the old prices, and a cart line takes the price the till shows (NeoRestau
 * //// lot 1, task 13, fix round 1).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h } from "vue"

const server = vi.hoisted(() => ({
	price: 4.5,
	groups: ["Drinks", "Pastries"],
	brands: ["House"],
}))
const settingsState = vi.hoisted(() => ({ showVariantsAsItems: false }))

const call = vi.hoisted(() =>
	vi.fn(async (method, params = {}) => {
		switch (method) {
			case "pos_next.api.pos_profile.get_pos_profile_data":
				return {
					pos_profile: { item_groups: server.groups.map((item_group) => ({ item_group })) },
					item_groups_hierarchy: server.groups.map((item_group) => ({ item_group, child_groups: [] })),
				}
			case "pos_next.api.items.get_items_count":
				return 2
			case "pos_next.api.items.get_items":
			case "pos_next.api.items.get_items_bulk":
				return [
					{ item_code: "COFFEE", item_name: "Coffee", item_group: "Drinks", rate: server.price },
					{ item_code: "TART", item_name: "Tart", item_group: "Pastries", rate: 6 },
				]
			case "pos_next.api.items.get_brands":
				return server.brands.map((brand) => ({ brand }))
			default:
				return []
		}
	})
)

const cache = vi.hoisted(() => new Map())

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("frappe-ui", () => ({
	call,
	createResource: (options) => {
		const run = async (params) => {
			const data = await call(options.url, params || options.makeParams?.() || {})
			options.onSuccess?.(data)
			return data
		}
		return { reload: () => run(), submit: (params) => run(params), fetch: () => run() }
	},
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false }))
vi.mock("@/utils/offline/items", () => ({ updateItemBatchSerialData: vi.fn(async () => {}) }))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: {
		getCacheStats: vi.fn(async () => ({ items: cache.size, cacheReady: cache.size > 0, lastSync: null })),
		isCacheReady: vi.fn(async () => cache.size > 0),
		searchCachedItems: vi.fn(async (_term, limit = 50) => [...cache.values()].slice(0, limit)),
		searchCachedItemsByGroup: vi.fn(async () => []),
		searchCachedItemsByBrand: vi.fn(async () => []),
		countCachedItemsByGroup: vi.fn(async () => 0),
		cacheItems: vi.fn(async (items) => {
			for (const item of items) cache.set(item.item_code, { ...item })
		}),
		clearItemsCache: vi.fn(async () => cache.clear()),
		removeItemsByGroups: vi.fn(async () => {}),
		setShowVariantsAsItems: vi.fn(async () => {}),
	},
}))
vi.mock("@/composables/useRealtimePosProfile", () => ({
	useRealtimePosProfile: () => ({ onPosProfileUpdate: () => () => {} }),
}))
vi.mock("@/stores/posSettings", () => {
	const store = {
		settings: {},
		get showVariantsAsItems() {
			return settingsState.showVariantsAsItems
		},
		reloadSettings: vi.fn(async () => {
			// The saved value, as the server now answers it
			settingsState.showVariantsAsItems = true
			return true
		}),
	}
	return { usePOSSettingsStore: () => store }
})
vi.mock("@/stores/posShift", () => {
	const store = { profileName: "Counter", profileWarehouse: "", currentProfile: { name: "Counter" } }
	return { usePOSShiftStore: () => store }
})
vi.mock("@/stores/stock", () => {
	const store = {
		init: vi.fn(),
		update: vi.fn(),
		applyUpdates: vi.fn(),
		reserve: vi.fn(),
		refresh: vi.fn(async () => {}),
		refreshFromServer: vi.fn(async () => {}),
		getDisplayStock: vi.fn(() => 0),
		server: {},
	}
	return { useStockStore: () => store }
})

const { useItemSearchStore } = await import("@/stores/itemSearch")
const { usePOSEventsStore } = await import("@/stores/posEvents")
const { useCatalogueRefresh, CATALOGUE_CHANGED } = await import("../useCatalogueRefresh")

const Till = defineComponent({
	setup() {
		useCatalogueRefresh()
		return () => h("div")
	},
})

function asked(method) {
	return call.mock.calls.filter(([name]) => name === method)
}

async function aTillThatHasItsItems() {
	const itemStore = useItemSearchStore()
	await itemStore.setPosProfile("Counter", false)
	await itemStore.loadAllItems("Counter")
	await flushPromises()
	expect(itemStore.allItems.find((item) => item.item_code === "COFFEE").rate).toBe(4.5)
	expect(cache.get("COFFEE").rate).toBe(4.5)
	call.mockClear()
	mount(Till)
	return itemStore
}

function saved(changes) {
	usePOSEventsStore().emit(CATALOGUE_CHANGED, { changes })
}

describe("a catalogue setting saved at the till", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		cache.clear()
		call.mockClear()
		server.price = 4.5
		server.groups = ["Drinks", "Pastries"]
		server.brands = ["House"]
		settingsState.showVariantsAsItems = false
	})

	it("brings the new price list's prices from the server, not from the browser's copy", async () => {
		const itemStore = await aTillThatHasItsItems()
		server.price = 5
		saved(["selling_price_list"])
		await vi.waitFor(
			() => expect(itemStore.allItems.find((item) => item.item_code === "COFFEE").rate).toBe(5),
			{ timeout: 1000 }
		)
		expect(asked("pos_next.api.items.get_items").length).toBeGreaterThan(0)
		// The browser's copy is rewritten as well: a later load from it shows the new price
		await vi.waitFor(() => expect(cache.get("COFFEE").rate).toBe(5), { timeout: 1000 })
	})

	it("reads the till's item groups and brands again, and forgets a group it no longer offers", async () => {
		const itemStore = await aTillThatHasItsItems()
		await itemStore.loadBrands()
		itemStore.selectedItemGroup = "Pastries"
		call.mockClear()
		server.groups = ["Drinks"]
		server.brands = ["House", "Roastery"]
		saved(["item_groups", "custom_brands_table"])
		await vi.waitFor(
			() => expect(itemStore.itemGroups.map((group) => group.item_group)).toEqual(["Drinks"]),
			{ timeout: 1000 }
		)
		await vi.waitFor(
			() => expect(itemStore.brands.map((row) => row.brand)).toEqual(["House", "Roastery"]),
			{ timeout: 1000 }
		)
		expect(itemStore.profileItemGroups.map((group) => group.item_group)).toEqual(["Drinks"])
		await vi.waitFor(() => expect(itemStore.selectedItemGroup).toBeNull(), { timeout: 1000 })
		expect(asked("pos_next.api.pos_profile.get_pos_profile_data").length).toBe(1)
	})

	it("asks for the variants as the till now shows them", async () => {
		await aTillThatHasItsItems()
		saved(["show_variants_as_items"])
		await vi.waitFor(() => expect(asked("pos_next.api.items.get_items").length).toBeGreaterThan(0), {
			timeout: 1000,
		})
		const [, params] = asked("pos_next.api.items.get_items").at(-1)
		expect(params.show_variants_as_items).toBe(1)
	})

	it("has the last word over a load from the browser's copy started by a new warehouse in the same save", async () => {
		const itemStore = await aTillThatHasItsItems()
		server.price = 5
		// The new warehouse's own event reloads the items from the browser's copy first (POSSale.handleWarehouseChanged)
		itemStore.invalidateCache()
		const fromTheCopy = itemStore.loadAllItems("Counter")
		saved(["warehouse", "selling_price_list"])
		await fromTheCopy
		await vi.waitFor(
			() => expect(itemStore.allItems.find((item) => item.item_code === "COFFEE").rate).toBe(5),
			{ timeout: 1000 }
		)
		await flushPromises()
		expect(itemStore.allItems.find((item) => item.item_code === "COFFEE").rate).toBe(5)
	})
})
