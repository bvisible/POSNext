/**
 * //// Neoffice — added file (no upstream equivalent). The groups of a table on the floor (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): the plan's tile reads the order summary, which is the SUM of the table's open notes
 * //// (lines, total) and says how many notes there are, so a table with several says « 2 groups » on its tile; and the list of tables has a search field that finds a table by its label or by the name of one of its groups
 * //// (« Dupont » finds « Table 5 »). A table with one note has no such word.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const cart = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => []) }))
vi.mock("@/socket", () => ({
	initSocket: () => ({ disconnected: false, connect() {}, on() {}, off() {} }),
}))
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
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => cart }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till", profileCurrency: "CHF" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")
const { TABLES_VIEW_KEY } = await import("@/composables/useTablesView")

const ROOM = { name: "r0o1m2h3a4", area_name: "Room 1" }
const NOW = new Date(Date.UTC(2026, 9, 31, 18, 58, 0))
const summary = (extra = {}) => ({
	item_count: 7,
	opened_at: "2026-10-31 19:30:00.000000",
	opened_by: "LM",
	grand_total: 120,
	...extra,
})
function aTable(name, label, status = "Empty", extra = {}) {
	return {
		name,
		table_name: label,
		area: ROOM.name,
		status,
		capacity: 4,
		pos_x: 20,
		pos_y: 20,
		width: 100,
		height: 100,
		waiting_items_count: 0,
		qr_waiting_count: 0,
		order_summary: status === "Occupied" ? summary() : null,
		...extra,
	}
}
const TWO = aTable("t-two", "Table 5", "Occupied", { order_summary: summary({ notes_count: 2, note_names: ["Dupont", "Les Martin"] }) })
const ONE = aTable("t-one", "Table 6", "Occupied", { order_summary: summary({ notes_count: 1, note_names: [] }) })
const OLD = aTable("t-old", "Table 7", "Occupied")
const FREE = aTable("t-free", "Table 8")

function theStore() {
	for (const key of Object.keys(restaurantStore)) delete restaurantStore[key]
	Object.assign(restaurantStore, {
		can: { manage_floor: true, set_table_status: true },
		tillRestaurant: "The Bistro",
		areas: [ROOM],
		tables: [TWO, ONE, OLD, FREE],
		floorStations: [],
		takeawayEnabled: true,
		runnerEnabled: true,
		qrOrderingEnabled: false,
		takeawayOrders: [],
		occupiedCountByArea: {},
		hasCardWarning: false,
		restaurantStatus: { warning: null },
		defaultArea: ROOM.name,
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		fetchFromNetwork: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		freeCleaningTables: vi.fn(async () => 0),
		fetchStationItemsMap: vi.fn(async () => {}),
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
async function floorPlan({ view } = {}) {
	Object.defineProperty(window, "innerWidth", { value: view === "list" ? 390 : 1366, configurable: true, writable: true })
	localStorage.clear()
	if (view) localStorage.setItem(TABLES_VIEW_KEY, view)
	theStore()
	wrapper = mount(FloorPlanEditor, {
		attachTo: document.body,
		props: { userName: "Lea Martin", siteTimezone: "Europe/Zurich" },
		global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(NOW)
	Object.assign(cart, { clearCart: vi.fn(async () => {}), setRestaurantTable: vi.fn() })
})
afterEach(() => {
	vi.useRealTimers()
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ""
})

const tile = (label) => wrapper.findAll('[data-test="table"]').find((el) => el.text().includes(label))
const groups = (el) => el.find('[data-test="table-groups"]')
const cardTitles = () => wrapper.findAll('[data-test="table-card"]').map((card) => card.find('[data-test="card-title"]').text())

describe("the tile of a table on the plan", () => {
	it("says « 2 groups » when its order summary counts two notes", async () => {
		await floorPlan()

		expect(groups(tile("Table 5")).text()).toBe("2 groups")
	})

	it("keeps the summed lines of the notes, as the summary gives them", async () => {
		await floorPlan()

		expect(tile("Table 5").text()).toContain("7")
	})

	it("says nothing of groups for a table with one note, or for a summary that says nothing", async () => {
		await floorPlan()

		expect(groups(tile("Table 6")).exists()).toBe(false)
		expect(groups(tile("Table 7")).exists()).toBe(false)
		expect(groups(tile("Table 8")).exists()).toBe(false)
	})
})

describe("the search of the list of tables", () => {
	it("shows every table while nothing is typed", async () => {
		await floorPlan({ view: "list" })

		expect(cardTitles()).toEqual(["Table 5", "Table 6", "Table 7"])
	})

	it("finds a table by the name of one of its groups", async () => {
		await floorPlan({ view: "list" })

		await wrapper.get('[data-test="tables-search"]').setValue("dupont")

		expect(cardTitles()).toEqual(["Table 5"])
	})

	it("finds a table by its label, and gives them all back when the field is emptied", async () => {
		await floorPlan({ view: "list" })
		const field = wrapper.get('[data-test="tables-search"]')

		await field.setValue("table 6")
		expect(cardTitles()).toEqual(["Table 6"])

		await field.setValue("")
		expect(cardTitles()).toEqual(["Table 5", "Table 6", "Table 7"])
	})

	it("says « No table to show » when nothing answers it", async () => {
		await floorPlan({ view: "list" })

		await wrapper.get('[data-test="tables-search"]').setValue("nobody")

		expect(cardTitles()).toEqual([])
		expect(wrapper.find('[data-test="tables-empty"]').exists()).toBe(true)
	})

	it("says « 2 groups » and the names on the card of the table that has them", async () => {
		await floorPlan({ view: "list" })
		const card = wrapper.findAll('[data-test="table-card"]')[0]
		const details = card.get('[data-test="card-details"]').text().replace(/\s+/g, " ")

		expect(details).toMatch(/^2 groups/)
		expect(details.endsWith("Dupont, Les Martin")).toBe(true)
	})
})
