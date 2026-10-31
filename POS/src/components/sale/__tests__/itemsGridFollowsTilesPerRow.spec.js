/**
 * //// Neoffice — added file (no upstream equivalent). The shop's item grid follows the till's « Tiles per row »
 * //// (NeoRestau lot 1, task 13; product owner, 30.10.2026): « Automatic » keeps the columns by the width of the
 * //// pane exactly as they were, a number from 3 to 8 fixes them, and an item without a picture then shows its name
 * //// once, in its well. The list view is unchanged.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const settings = vi.hoisted(() => ({ tiles_per_row: "Automatic" }))
const viewMode = vi.hoisted(() => ({ current: "grid" }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ call: vi.fn() }))
vi.mock("@/stores/posSettings", async () => {
	const { computed, reactive } = await import("vue")
	const { tilesPerRow } = await import("@/utils/tileGrid")
	const state = reactive(settings)
	return {
		usePOSSettingsStore: () => ({
			settings: state,
			displayItemCode: false,
			tilesPerRow: computed(() => tilesPerRow(state.tiles_per_row)).value,
		}),
	}
})
vi.mock("@/stores/itemSearch", async () => {
	const { ref } = await import("vue")
	const items = ref([
		{ item_code: "COFFEE", item_name: "Coffee with cream", rate: 4.5, uom: "Nos", stock_uom: "Nos" },
		{ item_code: "TART", item_name: "Tart", rate: 6, image: "/files/tart.jpg", uom: "Nos", stock_uom: "Nos" },
	])
	const store = {
		filteredItems: items,
		searchTerm: ref(""),
		selectedItemGroup: ref(null),
		selectedBrand: ref(null),
		itemGroups: ref([]),
		brands: ref([]),
		loading: ref(false),
		loadingMore: ref(false),
		hasMore: ref(false),
		cacheSyncing: ref(false),
		cacheStats: ref({}),
		sortBy: ref(null),
		sortOrder: ref("asc"),
		totalServerItems: ref(2),
	}
	for (const name of [
		"cleanup",
		"clearSortFilter",
		"fetchPage",
		"loadAllItems",
		"loadBrands",
		"loadItemGroups",
		"loadMoreItems",
		"setCartItems",
		"setPosProfile",
		"setSelectedBrand",
		"setSelectedItemGroup",
		"setSortFilter",
	]) {
		store[name] = vi.fn()
	}
	return { useItemSearchStore: () => store }
})
vi.mock("@/composables/useStock", () => ({
	useStock: () => ({ getItemStockStatus: () => ({ color: "", textColor: "", label: "" }) }),
}))
vi.mock("@/composables/useItemsViewMode", async () => {
	const { ref } = await import("vue")
	return { useItemsViewMode: () => ({ viewMode: ref(viewMode.current), setViewMode: vi.fn() }) }
})
vi.mock("@/data/session", () => ({ session: { user: "cashier@example.com" } }))
vi.mock("@/composables/useDialogState", async () => {
	const { ref } = await import("vue")
	return { useDialogState: () => ({ isAnyDialogOpen: ref(false) }) }
})
vi.mock("@/composables/useSearchInput", async () => {
	const { ref } = await import("vue")
	return {
		useSearchInput: () => ({
			searchInputRef: ref(null),
			scannerEnabled: ref(false),
			autoAddEnabled: ref(false),
			handleSearchInput: vi.fn(),
			handleKeyDown: vi.fn(),
			handleSearchClick: vi.fn(),
			toggleBarcodeScanner: vi.fn(),
			toggleAutoAdd: vi.fn(),
			focusSearchInput: vi.fn(),
			clearSearchAndResetInput: vi.fn(),
			highlightedCode: ref(null),
			cleanup: vi.fn(),
		}),
	}
})
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showError: vi.fn(), showWarning: vi.fn() }),
}))
vi.mock("@/utils/lowEndOptimizations", () => ({
	createOptimizedClickHandler: () => ({ touchstart: vi.fn(), touchmove: vi.fn(), touchend: vi.fn(), click: vi.fn() }),
	throttleRAF: (fn) => fn,
	addPassiveListener: () => () => {},
	runWhenIdle: (fn) => fn(),
}))
vi.mock("@/utils/performanceConfig", () => ({ performanceConfig: { get: () => 100 } }))
vi.mock("@/utils/stockValidator", () => ({ shouldValidateItemStock: () => false }))

const { default: ItemsSelector } = await import("../ItemsSelector.vue")

const AUTOMATIC_STYLE = "grid-template-columns"
let wrapper

async function itemsGrid(tilesPerRow) {
	settings.tiles_per_row = tilesPerRow
	wrapper = mount(ItemsSelector, {
		props: { posProfile: "Shop till" },
		global: {
			mocks: { __: globalThis.__ },
			stubs: {
				LazyImage: { template: "<img />" },
				ItemsPagination: true,
				WarehouseAvailabilityDialog: true,
			},
		},
	})
	await flushPromises()
	return wrapper.find(".pos-item-grid")
}

beforeEach(() => {
	viewMode.current = "grid"
})

afterEach(() => wrapper?.unmount())

describe("the shop's item grid", () => {
	it("keeps its columns by the width of its pane when automatic", async () => {
		const grid = await itemsGrid("Automatic")

		expect(grid.exists()).toBe(true)
		expect(grid.classes()).not.toContain("tile-grid-fixed")
		expect(grid.attributes("style") || "").not.toContain(AUTOMATIC_STYLE)
	})

	it("shows the number of tiles the till chose", async () => {
		for (const count of ["3", "7", "8"]) {
			const grid = await itemsGrid(count)

			expect(grid.attributes("style")).toContain(`grid-template-columns: repeat(${count}, minmax(0, 1fr))`)
			expect(grid.classes()).toContain("tile-grid-fixed")
			wrapper.unmount()
		}
	})

	it("reads anything out of 3 to 8 as automatic", async () => {
		const grid = await itemsGrid("12")

		expect(grid.attributes("style") || "").not.toContain(AUTOMATIC_STYLE)
	})

	it("marks an item without a picture as text in a fixed grid, and adds nothing when automatic", async () => {
		await itemsGrid("6")
		let tiles = wrapper.findAll(".pos-item-grid > div")
		expect(tiles[0].classes()).toContain("tile--text")
		expect(tiles[1].classes()).not.toContain("tile--text")
		wrapper.unmount()

		await itemsGrid("Automatic")
		tiles = wrapper.findAll(".pos-item-grid > div")
		for (const tile of tiles) expect(tile.classes()).not.toContain("tile--text")
	})

	it("leaves the list view as it was", async () => {
		viewMode.current = "list"
		await itemsGrid("6")

		expect(wrapper.find(".pos-item-grid").exists()).toBe(false)
		expect(wrapper.find("table").exists()).toBe(true)
	})
})
