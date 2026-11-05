/**
 * //// Neoffice — added file (no upstream equivalent). The number of dishes waiting at a table, and the same signal on the tab of its room (NeoResto lot 1; product owner, 05.11.2026:
 * //// « un 2 qui s'agrandit, qui rétrécit, de telle manière qu'on voit vraiment quelque chose qu'il faut faire sur cette table […] si on n'est pas sur la bonne salle, on ne voit pas ce
 * //// qui se passe »). The tile's number GROWS AND SHRINKS (it only faded before), and a room that has tables waiting says so on its tab, in orange, with the same pulse.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
// The store the component reads is reactive, as Pinia's is: a room the fake server creates shows up as a tab
const live = vi.hoisted(() => ({ store: null }))
const toast = vi.hoisted(() => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	handleError: vi.fn(),
}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		args.reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => []) }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
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
vi.mock("@/stores/restaurant", async () => {
	const { reactive } = await import("vue")
	live.store = reactive(restaurantStore)
	return { useRestaurantStore: () => live.store }
})
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")

const ROOM_1 = { name: "r0o1m2h3a4", area_name: "Room 1" }
const ROOM_2 = { name: "r0o2m2h3a4", area_name: "Room 2" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }
const MADE = { name: "n3wr00mh4s", area_name: "Main Hall" }

function theStore(areas) {
	Object.assign(restaurantStore, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas,
		tables: [],
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
		saveAllPositions: vi.fn(async () => {}),
		saveStationPositions: vi.fn(async () => {}),
		saveFloorPlanWalls: vi.fn(async () => {}),
		// The server's answers: a room made is answered as the server does, and the plan reads it again
		createArea: vi.fn(async (name) => {
			const made = { ...MADE, area_name: name }
			live.store.areas = [...live.store.areas, made]
			return made
		}),
		deleteArea: vi.fn(async (name) => {
			live.store.areas = live.store.areas.filter((area) => area.name !== name)
		}),
	})
}


const TABLE = {
	name: "t4bl3h4sh1",
	table_name: "Table 9",
	area: ROOM_1.name,
	status: "Occupied",
	pos_x: 120,
	pos_y: 100,
	width: 104,
	height: 80,
	shape: "rectangle",
	order_summary: { item_count: 3, opened_at: "2026-11-05 13:59:00", opened_by: "AD" },
	waiting_items_count: 2,
}
const ANOTHER_ROOM_TABLE = { ...TABLE, name: "t4bl3h4sh2", table_name: "Table 24", area: ROOM_2.name, waiting_items_count: 0 }
const SECOND_WAITING_IN_ROOM_2 = { ...TABLE, name: "t4bl3h4sh3", table_name: "Table 25", area: ROOM_2.name, pos_x: 300, waiting_items_count: 1 }

describe("what waits at a table", () => {
	let wrapper

	async function floorPlan(tables) {
		theStore([ROOM_1, ROOM_2])
		restaurantStore.tables = tables
		wrapper = mount(FloorPlanEditor, {
			attachTo: document.body,
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	beforeEach(() => {
		localStorage.clear()
	})
	afterEach(() => {
		wrapper?.unmount()
	})

	it("is the number of dishes waiting on the tile, and it GROWS AND SHRINKS instead of fading", async () => {
		await floorPlan([TABLE, ANOTHER_ROOM_TABLE])

		const number = wrapper.get('[data-test="table-waiting"]')
		expect(number.text()).toBe("2")
		expect(number.classes()).toContain("floor-waiting-pulse")
		// `animate-pulse` only takes the opacity to a half: the 2 that "blinked very faintly"
		expect(number.classes()).not.toContain("animate-pulse")
		expect(wrapper.html()).toMatch(/@keyframes floor-waiting-pulse|floor-waiting-pulse/)
	})

	it("is not drawn on a table that has nothing waiting", async () => {
		await floorPlan([{ ...TABLE, waiting_items_count: 0 }])

		expect(wrapper.find('[data-test="table-waiting"]').exists()).toBe(false)
	})

	it("is told on the tab of the room that holds the table, as the number of TABLES that wait, in orange", async () => {
		await floorPlan([TABLE, ANOTHER_ROOM_TABLE, SECOND_WAITING_IN_ROOM_2])

		const [first, second] = wrapper.findAll('[data-test="room-tab"]')
		expect(first.get('[data-test="room-waiting"]').text()).toBe("1")
		expect(first.get('[data-test="room-waiting"]').classes()).toEqual(expect.arrayContaining(["bg-orange-500", "floor-waiting-pulse"]))
		expect(second.get('[data-test="room-waiting"]').text()).toBe("1")
	})

	it("counts tables, not dishes: a table with three dishes waiting is one table", async () => {
		await floorPlan([{ ...TABLE, waiting_items_count: 3 }])

		expect(wrapper.get('[data-test="table-waiting"]').text()).toBe("3")
		expect(wrapper.get('[data-test="room-waiting"]').text()).toBe("1")
	})

	it("leaves the tab of a room with nothing waiting as it was: only the occupied count", async () => {
		await floorPlan([TABLE, ANOTHER_ROOM_TABLE])

		const second = wrapper.findAll('[data-test="room-tab"]')[1]
		expect(second.find('[data-test="room-waiting"]').exists()).toBe(false)
	})

	it("keeps a still ring for whoever turned motion down, in place of the pulse", () => {
		const source = readFileSync(path.resolve(__dirname, "../FloorPlanEditor.vue"), "utf8")
		const reduced = source.slice(source.indexOf("@media (prefers-reduced-motion: reduce)"))

		expect(reduced).toMatch(/\.floor-waiting-pulse\s*\{[^}]*animation: none;[^}]*outline: 2px solid #f55d1a;/)
	})
})
