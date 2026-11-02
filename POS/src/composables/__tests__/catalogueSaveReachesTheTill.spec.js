/**
 * //// Neoffice — added file (no upstream equivalent). A setting saved at the till that changes what it sells (its
 * //// price list, its item groups, its brands, the variants) reaches the till's items at once, from the server: the
 * //// browser's copy of the items keeps the old prices, and a cart line takes the price the till shows (NeoResto
 * //// lot 1, task 13, fix round 1). What the settings no longer offer leaves the browser's copy, the till's open search
 * //// and group tab show the new prices, and a cart already started keeps the prices it announced, which the till
 * //// says once (fix round 2, ruling 81).
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
	// What the till's settings let it offer: the unavailable tart can be hidden
	offersTart: true,
}))
const settingsState = vi.hoisted(() => ({ showVariantsAsItems: false }))
// What reached the server and the browser's copy, in order
const steps = vi.hoisted(() => [])
const realtime = vi.hoisted(() => ({ handlers: [], detached: 0 }))
const cart = vi.hoisted(() => ({ invoiceItems: [] }))
const toast = vi.hoisted(() => ({}))

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
			case "pos_next.api.items.get_items_bulk": {
				steps.push("server items")
				const items = [
					{ item_code: "COFFEE", item_name: "Coffee", item_group: "Drinks", rate: server.price },
					...(server.offersTart ? [{ item_code: "TART", item_name: "Tart", item_group: "Pastries", rate: 6 }] : []),
				]
				// A group asked for: its items only, as the server filters them
				return params.item_group ? items.filter((item) => item.item_group === params.item_group) : items
			}
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
		clearItemsCache: vi.fn(async () => {
			steps.push("clear the copy")
			cache.clear()
		}),
		removeItemsByGroups: vi.fn(async (groups) => {
			let removed = 0
			for (const [code, item] of cache) {
				if (groups.includes(item.item_group)) {
					cache.delete(code)
					removed += 1
				}
			}
			return { removed }
		}),
		setShowVariantsAsItems: vi.fn(async () => {}),
	},
}))
// The profile's realtime event: the store's listener, and whether it was ever detached
vi.mock("@/composables/useRealtimePosProfile", () => ({
	useRealtimePosProfile: () => ({
		onPosProfileUpdate: (handler) => {
			realtime.handlers.push(handler)
			return () => {
				realtime.detached += 1
				realtime.handlers = realtime.handlers.filter((registered) => registered !== handler)
			}
		},
	}),
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => cart }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
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
		server: new Map(),
	}
	return { useStockStore: () => store }
})

vi.hoisted(() => {
	globalThis.__ = (text) => text
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
		server.offersTart = true
		settingsState.showVariantsAsItems = false
		steps.length = 0
		realtime.handlers = []
		realtime.detached = 0
		cart.invoiceItems = []
		Object.assign(toast, { showWarning: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() })
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

	for (const change of ["hide_unavailable_items", "item_groups", "custom_brands_table", "show_variants_as_items"]) {
		it(`forgets in the browser's copy what the till no longer offers (${change})`, async () => {
			const itemStore = await aTillThatHasItsItems()
			server.offersTart = false
			steps.length = 0
			saved([change])
			await vi.waitFor(() => expect(itemStore.allItems.map((item) => item.item_code)).toEqual(["COFFEE"]), {
				timeout: 1000,
			})
			await flushPromises()
			// Cleared before the items are asked for again: an empty search, a page read from the copy or a till gone
			// offline would bring the tart back
			expect(steps.indexOf("clear the copy")).toBeGreaterThan(-1)
			expect(steps.indexOf("clear the copy")).toBeLessThan(steps.lastIndexOf("server items"))
			expect([...cache.keys()]).toEqual(["COFFEE"])
		})
	}

	it("keeps the browser's copy when the price list alone changed (its prices are rewritten)", async () => {
		await aTillThatHasItsItems()
		server.price = 5
		saved(["selling_price_list"])
		await vi.waitFor(() => expect(cache.get("COFFEE").rate).toBe(5), { timeout: 1000 })
		expect(steps).not.toContain("clear the copy")
	})

	it("leaves the profile's realtime listener in place, and purges a group no longer offered through it", async () => {
		const itemStore = await aTillThatHasItsItems()
		const { offlineWorker } = await import("@/utils/offline/workerClient")
		offlineWorker.removeItemsByGroups.mockClear()
		server.groups = ["Drinks"]
		saved(["item_groups"])
		await vi.waitFor(() => expect(itemStore.profileItemGroups.map((group) => group.item_group)).toEqual(["Drinks"]), {
			timeout: 1000,
		})
		await flushPromises()
		expect(realtime.detached).toBe(0)
		expect(realtime.handlers).toHaveLength(1)
		expect(offlineWorker.removeItemsByGroups).toHaveBeenCalledWith(["Pastries"])
		// The profile's own event, coming after, finds nothing left to purge
		await realtime.handlers[0]({ pos_profile: "Counter", item_groups: [{ item_group: "Drinks" }] })
		expect(offlineWorker.removeItemsByGroups).toHaveBeenCalledTimes(1)
	})

	it("shows the new prices in the search the till has open", async () => {
		const itemStore = await aTillThatHasItsItems()
		itemStore.setSearchTerm("Coffee")
		await vi.waitFor(() => expect(itemStore.searchResults.length).toBeGreaterThan(0), { timeout: 2000 })
		server.price = 5
		saved(["selling_price_list"])
		await vi.waitFor(
			() => expect(itemStore.filteredItems.find((item) => item.item_code === "COFFEE").rate).toBe(5),
			{ timeout: 2000 }
		)
		expect(itemStore.searchTerm).toBe("Coffee")
	})

	it("keeps the group tab the till has open, with its items", async () => {
		const itemStore = await aTillThatHasItsItems()
		await itemStore.setSelectedItemGroup("Pastries")
		await flushPromises()
		expect(itemStore.filteredItems.map((item) => item.item_code)).toEqual(["TART"])
		saved(["selling_price_list"])
		await vi.waitFor(() => expect(steps.filter((step) => step === "server items").length).toBeGreaterThan(1), {
			timeout: 1000,
		})
		await flushPromises()
		await flushPromises()
		expect(itemStore.selectedItemGroup).toBe("Pastries")
		expect(itemStore.filteredItems.map((item) => item.item_code)).toEqual(["TART"])
	})

	it("says once that the lines already in the cart keep their price (ruling 81)", async () => {
		await aTillThatHasItsItems()
		cart.invoiceItems = [
			{ item_code: "COFFEE", rate: 4.5, quantity: 2 },
			{ item_code: "TART", rate: 6, quantity: 1 },
		]
		server.price = 5
		saved(["selling_price_list"])
		await vi.waitFor(() => expect(toast.showWarning).toHaveBeenCalledTimes(1), { timeout: 1000 })
		expect(toast.showWarning).toHaveBeenCalledWith("Items already in the cart keep their price")
		// The sale in progress keeps the prices it announced
		expect(cart.invoiceItems[0].rate).toBe(4.5)
	})

	it("says nothing of the cart when it is empty, or when the prices did not change", async () => {
		await aTillThatHasItsItems()
		saved(["selling_price_list"])
		cart.invoiceItems = [{ item_code: "COFFEE", rate: 4.5, quantity: 1 }]
		saved(["hide_unavailable_items"])
		await flushPromises()
		await vi.waitFor(() => expect(steps).toContain("clear the copy"), { timeout: 1000 })
		await flushPromises()
		expect(toast.showWarning).not.toHaveBeenCalled()
	})
})
