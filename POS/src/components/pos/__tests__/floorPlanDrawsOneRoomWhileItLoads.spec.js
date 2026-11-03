/**
 * //// Neoffice — added file (no upstream equivalent). The floor plan draws the tables of ONE room, from the first frame
 * //// (neoffice-maintenance#2163, the restaurant film of 02.11.2026): on each return to the tables, the tables of every room
 * //// flashed on top of each other for about 0.2 s. The plan chose its room only once the network had answered, and the
 * //// store's tables, replaced by the network's before the rest of the reading (the stations' items, the cards, the
 * //// settings) came back, were drawn meanwhile with no room chosen. The room is now chosen from what the store already
 * //// holds, before the network is read, and a plan with rooms draws nothing while none is chosen.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const live = vi.hoisted(() => ({ store: null }))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => []) }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), handleError: vi.fn() }),
}))
vi.mock("@/composables/useDraggable", () => ({
	useDraggable: () => ({ handleDragStart: vi.fn(), handleResizeStart: vi.fn(), destroy: vi.fn() }),
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
// The store the plan reads is reactive, as Pinia's is: the network's tables landing in it are seen by the plan's watcher
vi.mock("@/stores/restaurant", async () => {
	const { reactive } = await import("vue")
	live.store = reactive(restaurantStore)
	return { useRestaurantStore: () => live.store }
})
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")

const HALL = { name: "h4llh4sh01", area_name: "Hall" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }

function aTable(name, label, area) {
	return { name, table_name: label, area, status: "Empty", capacity: 4, pos_x: 20, pos_y: 20, width: 100, height: 100 }
}
const TABLES = [
	aTable("t4bl3h4sh1", "Hall 1", HALL.name),
	aTable("t4bl3h4sh2", "Hall 2", HALL.name),
	aTable("t4bl3h4sh9", "Terrace 9", TERRACE.name),
]

// The network's reading of the floor: its tables land in the store at once, the rest of the reading answers when `answer`
// is called (restaurant.fetchFromNetwork writes the tables, then reads the stations' items, the cards and the settings)
const network = { answer: null }
function readsTheNetwork() {
	return vi.fn(() => {
		live.store.areas = [HALL, TERRACE]
		live.store.tables = TABLES.map((table) => ({ ...table }))
		return new Promise((resolve) => {
			network.answer = resolve
		})
	})
}

function theStore(tables) {
	for (const key of Object.keys(live.store)) delete live.store[key]
	Object.assign(live.store, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas: [HALL, TERRACE],
		tables,
		floorStations: [],
		takeawayEnabled: false,
		runnerEnabled: false,
		takeawayOrders: [],
		occupiedCountByArea: {},
		totalOccupiedCount: 0,
		hasCardWarning: false,
		restaurantStatus: { warning: null },
		defaultArea: HALL.name,
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		fetchFromNetwork: readsTheNetwork(),
		fetchTakeawayOrders: vi.fn(async () => {}),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
		saveAllPositions: vi.fn(async () => {}),
		saveStationPositions: vi.fn(async () => {}),
		saveFloorPlanWalls: vi.fn(async () => {}),
	})
}

let wrapper
function openThePlan() {
	Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true, writable: true })
	wrapper = mount(FloorPlanEditor, {
		attachTo: document.body,
		global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
	})
}
const drawn = () => wrapper.findAll('[data-test="table"]').map((table) => table.text().match(/(Hall|Terrace) \d/)[0])

describe("the floor plan draws one room while it reads the network (neoffice-maintenance#2163)", () => {
	beforeEach(() => {
		localStorage.clear()
		network.answer = null
	})
	afterEach(() => {
		network.answer?.()
		wrapper?.unmount()
	})

	it("comes back to the room shown last, its tables only, before the network has answered", async () => {
		// The till comes back to the tables: the store holds the floor it read before, the terrace was shown last
		theStore(TABLES.map((table) => ({ ...table })))
		localStorage.setItem("pos_selected_area", TERRACE.name)

		openThePlan()
		await flushPromises()

		expect(live.store.fetchFromNetwork).toHaveBeenCalled()
		expect(network.answer, "the network has not answered yet").toBeTypeOf("function")
		expect(drawn()).toEqual(["Terrace 9"])

		network.answer()
		await flushPromises()
		expect(drawn()).toEqual(["Terrace 9"])
	})

	it("draws no table of any room until a room is chosen, on its first opening", async () => {
		// The first opening: the store holds no floor yet, the network brings it
		theStore([])
		live.store.areas = []

		openThePlan()
		await flushPromises()

		expect(network.answer, "the network has not answered yet").toBeTypeOf("function")
		expect(drawn(), "rooms and no room chosen: no « all rooms » plan").toEqual([])
		expect(wrapper.text(), "nor the empty room's notice").not.toContain("No tables in this area")

		network.answer()
		await flushPromises()
		expect(drawn()).toEqual(["Hall 1", "Hall 2"])
	})
})
