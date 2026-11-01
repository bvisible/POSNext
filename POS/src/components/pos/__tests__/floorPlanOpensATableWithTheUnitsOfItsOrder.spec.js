/**
 * //// Neoffice — added file (no upstream equivalent). Opening a table on the floor plan puts the lines of its order in
 * //// the cart with their units (NeoRestau lot 1, task 22, fix round 1). The read answers the unit of each line, its
 * //// stock unit, its factor and the item's other units; the floor plan makes the cart line of each row, and a row it
 * //// forgot to hand over left the line without them (« Nos » and an empty unit select in the dialog), with nothing
 * //// failing. Two rounds of the same dish that the server holds as two rows stay two lines.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const order = vi.hoisted(() => ({ value: null }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method) =>
		method === "pos_next.api.restaurant.open_table" ? order.value : [],
	),
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		handleError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/composables/useDraggable", () => ({
	useDraggable: () => ({
		handleDragStart: vi.fn(),
		handleResizeStart: vi.fn(),
		destroy: vi.fn(),
	}),
}))
vi.mock("@/composables/useCanvasGestures", () => ({
	useCanvasGestures: () => ({
		zoomLevel: ref(1),
		panX: ref(0),
		panY: ref(0),
		transformStyle: ref({}),
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
		zoomReset: vi.fn(),
		resetPan: vi.fn(),
		cleanup: vi.fn(),
	}),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till" }),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")
const { usePOSCartStore } = await import("@/stores/posCart")

const TABLE = {
	name: "t1",
	table_name: "T1",
	area: "room-1",
	status: "Occupied",
	capacity: 4,
	shape: "Square",
	pos_x: 10,
	pos_y: 20,
	width: 100,
	height: 100,
}

// What open_table answers for a table with an order: three rows, two of them the same wine (two rounds)
const ORDER = {
	name: "SINV-0001",
	customer: null,
	kds_status: "Pending",
	paid_amount: 0,
	tip_total: 0,
	is_new: false,
	items: [
		{
			item_code: "wine",
			item_name: "Wine",
			qty: 4,
			rate: 29,
			uom: "Unit",
			stock_uom: "Unit",
			conversion_factor: 1,
			item_uoms: [],
			kds_status: "Pending",
		},
		{
			item_code: "wine",
			item_name: "Wine",
			qty: 1,
			rate: 29,
			uom: "Unit",
			stock_uom: "Unit",
			conversion_factor: 1,
			item_uoms: [],
			kds_status: "Pending",
		},
		{
			item_code: "water",
			item_name: "Water",
			qty: 2,
			rate: 27,
			uom: "Case",
			stock_uom: "Bottle",
			conversion_factor: 6,
			item_uoms: [{ uom: "Case", conversion_factor: 6 }],
			kds_status: "Pending",
		},
	],
}

describe("opening a table puts the lines of its order in the cart with their units", () => {
	let wrapper
	let cart

	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		order.value = structuredClone(ORDER)
		Object.assign(restaurantStore, {
			can: { manage_floor: false },
			tillRestaurant: "The Bistro",
			areas: [{ name: "room-1", area_name: "Room 1" }],
			tables: [TABLE],
			floorStations: [],
			takeawayEnabled: false,
			runnerEnabled: false,
			takeawayOrders: [],
			occupiedCountByArea: {},
			totalOccupiedCount: 0,
			hasCardWarning: false,
			restaurantStatus: { warning: null },
			defaultArea: null,
			ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
			fetchFromNetwork: vi.fn(async () => {}),
			fetchTakeawayOrders: vi.fn(async () => {}),
			startStatusPolling: vi.fn(),
			stopStatusPolling: vi.fn(),
			getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
			getFloorPlanBg: () => "",
		})
	})
	afterEach(() => {
		wrapper?.unmount()
	})

	async function openTheTable() {
		wrapper = mount(FloorPlanEditor, {
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
		await wrapper.vm.selectTable(TABLE)
	}

	it("gives each line its unit, its stock unit, its factor and the item's other units", async () => {
		await openTheTable()

		const lines = cart.invoiceItems
		expect(lines.map((line) => line.item_code)).toEqual([
			"wine",
			"wine",
			"water",
		])
		expect(lines[0]).toMatchObject({
			uom: "Unit",
			stock_uom: "Unit",
			conversion_factor: 1,
			item_uoms: [],
		})
		expect(lines[2]).toMatchObject({
			uom: "Case",
			stock_uom: "Bottle",
			conversion_factor: 6,
		})
		expect(lines[2].item_uoms).toEqual([{ uom: "Case", conversion_factor: 6 }])
	})

	it("keeps the two rounds of the same dish as two lines, each as sent as the server says", async () => {
		await openTheTable()

		const wines = cart.invoiceItems.filter((line) => line.item_code === "wine")
		expect(wines.map((line) => [line.quantity, line.kds_status])).toEqual([
			[4, "Pending"],
			[1, "Pending"],
		])
	})

	it("gives each line the family the server stored, so that a held course can be named and ordered from any till (Daniel, 01.11)", async () => {
		order.value = structuredClone(ORDER)
		order.value.items[0].service_family = "Main"
		order.value.items[1].service_family = "Main"
		order.value.items[2].service_family = "Dessert"
		order.value.items[2].kds_status = "Waiting"

		await openTheTable()

		expect(cart.invoiceItems.map((line) => [line.service_family, line.kds_status])).toEqual([
			["Main", "Pending"],
			["Main", "Pending"],
			["Dessert", "Waiting"],
		])
	})

	it("a line read back from the server takes no new unit: the next card tap is a line of its own", async () => {
		await openTheTable()

		cart.addItem(
			{
				item_code: "wine",
				item_name: "Wine",
				rate: 29,
				uom: "Unit",
				stock_uom: "Unit",
			},
			1,
		)

		const wines = cart.invoiceItems.filter((line) => line.item_code === "wine")
		expect(wines.map((line) => [line.quantity, line.kds_status])).toEqual([
			[4, "Pending"],
			[1, "Pending"],
			[1, ""],
		])
	})
})
