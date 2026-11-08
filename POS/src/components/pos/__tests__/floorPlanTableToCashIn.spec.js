/**
 * //// Neoffice — added file (no upstream equivalent). A table where everything is served and nothing has moved for the restaurant's minutes is marked « Cash in? » on the
 * //// floor plan (the product owner, 08.11.2026: « le serveur a oublié de fermer la table »; `order_summary.to_cash_in`). The mark asks, it does not block: a tap opens
 * //// the table's order as always.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const server = vi.hoisted(() => ({
	runnerOrders: [],
	reservations: [],
	calls: [],
}))
const socket = vi.hoisted(() => ({ handlers: {} }))
const drag = vi.hoisted(() => ({ start: null }))
const cart = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		const name = String(method).split(".").pop()
		server.calls.push({ name, args })
		if (name === "get_runner_orders") return server.runnerOrders
		if (name === "get_reservations") return server.reservations
		if (name === "open_table") return {}
		return []
	}),
}))
vi.mock("@/socket", () => ({
	initSocket: () => ({
		disconnected: false,
		connect() {},
		on(event, handler) {
			socket.handlers[event] = [...(socket.handlers[event] || []), handler]
		},
		off(event, handler) {
			socket.handlers[event] = handler
				? (socket.handlers[event] || []).filter((h) => h !== handler)
				: []
		},
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showInfo: vi.fn(),
		handleError: vi.fn(),
	}),
}))
vi.mock("@/composables/useDraggable", () => ({
	useDraggable: () => ({
		handleDragStart: (...args) => drag.start?.(...args),
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
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => cart }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till", profileCurrency: "CHF" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")
const { TABLES_VIEW_KEY } = await import("@/composables/useTablesView")
const { LONG_PRESS_MS } = await import("@/composables/useTablePress")

const ROOM = { name: "r0o1m2h3a4", area_name: "Room 1" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }
// The service's clock: 19:58 at the site, in Zurich (UTC+1 since the clocks went back on 25 October), i.e. 18:58 UTC.
// The instant and the site's zone are both fixed, and the site's wall clock is written with Intl for that zone, never with
// the machine's fields: no spec here depends on the zone of the machine that runs it.
const SITE_ZONE = "Europe/Zurich"
const NOW = new Date(Date.UTC(2026, 9, 31, 18, 58, 0))
function seatedAgo(minutes) {
	const at = new Date(NOW.getTime() - minutes * 60000)
	const wall = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone: SITE_ZONE,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(at)
			.map((part) => [part.type, part.value]),
	)
	return `${wall.year}-${wall.month}-${wall.day} ${wall.hour}:${wall.minute}:00.000000`
}
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
		order_summary:
			status === "Occupied"
				? {
						item_count: 2,
						opened_at: seatedAgo(extra.seated ?? 30),
						opened_by: "LM",
						grand_total: 42,
					}
				: null,
		...extra,
	}
}
const T1 = aTable("t4bl3h4sh1", "Table 1", "Occupied", { seated: 50 })
const T2 = aTable("t4bl3h4sh2", "Table 2", "Occupied", { seated: 10 })
const T3 = aTable("t4bl3h4sh3", "Table 3")
const T4 = aTable("t4bl3h4sh4", "Table 4", "Cleaning")
// Everything served, quiet for fifty minutes
const T5 = aTable("t4bl3h4sh5", "Table 5", "Occupied", {
	order_summary: { item_count: 3, opened_at: seatedAgo(90), opened_by: "LM", grand_total: 80, served: true, idle_minutes: 50, to_cash_in: true },
})
const T9 = aTable("t4bl3h4sh9", "Table 9", "Occupied", {
	area: TERRACE.name,
	seated: 5,
})

function theStore(overrides = {}) {
	for (const key of Object.keys(restaurantStore)) delete restaurantStore[key]
	Object.assign(restaurantStore, {
		can: { manage_floor: true, set_table_status: true },
		tillRestaurant: "The Bistro",
		areas: [ROOM, TERRACE],
		tables: [T1, T2, T3, T4, T5, T9],
		floorStations: [],
		takeawayEnabled: true,
		runnerEnabled: true,
		qrOrderingEnabled: true,
		takeawayOrders: [],
		occupiedCountByArea: {},
		hasCardWarning: false,
		restaurantStatus: { warning: null },
		defaultArea: ROOM.name,
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		fetchFromNetwork: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		freeCleaningTables: vi.fn(async () => 0),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
		saveAllPositions: vi.fn(async () => {}),
		saveStationPositions: vi.fn(async () => {}),
		saveFloorPlanWalls: vi.fn(async () => {}),
		...overrides,
	})
}

function withWidth(width) {
	Object.defineProperty(window, "innerWidth", {
		value: width,
		configurable: true,
		writable: true,
	})
}

let wrapper
async function floorPlan({
	width = 390,
	userName = "Lea Martin",
	siteTimezone = SITE_ZONE,
	store = {},
} = {}) {
	withWidth(width)
	theStore(store)
	wrapper = mount(FloorPlanEditor, {
		attachTo: document.body,
		props: { userName, siteTimezone },
		global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

const list = () => wrapper.find('[data-test="tables-list"]')
const canvas = () => wrapper.find('[data-test="floor-canvas"]')
const line = () => wrapper.find('[data-test="floor-line"]')
const shown = (found) =>
	found.exists() && found.element.style.display !== "none"
const cards = () => wrapper.findAll('[data-test="table-card"]')
const cardTitles = () =>
	cards().map((card) => card.find('[data-test="card-title"]').text())
const planTable = (label) =>
	wrapper.findAll('[data-test="table"]').find((el) => el.text().includes(label))
const called = (name) => server.calls.filter((c) => c.name === name)
// A finger by default (the long press is a finger's and a pen's); { pointerType: "mouse" } for a mouse
const pointer = (type, target, { pointerType = "touch", ...init } = {}) => {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: 50,
		clientY: 50,
		...init,
	})
	Object.defineProperty(event, "pointerType", { value: pointerType })
	target.dispatchEvent(event)
	return event
}

const startWidth = window.innerWidth
beforeEach(() => {
	localStorage.clear()
	server.calls = []
	server.reservations = []
	// Table 2's dishes are ready at the pass
	server.runnerOrders = [
		{
			name: "SINV-2",
			restaurant_table: T2.name,
			items: [{ name: "l1", station_type: "Kitchen" }],
		},
	]
	socket.handlers = {}
	drag.start = vi.fn()
	Object.assign(cart, {
		clearCart: vi.fn(async () => {}),
		setRestaurantTable: vi.fn(),
		addItem: vi.fn(),
		$patch: vi.fn(),
		setCustomer: vi.fn(),
	})
	vi.useFakeTimers({
		toFake: [
			"Date",
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
		],
	})
	vi.setSystemTime(NOW)
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	vi.useRealTimers()
	withWidth(startWidth)
})

describe("a table to cash in, on the plan", () => {
	async function thePlan() {
		await floorPlan({ width: 1180 })
	}

	it("wears the « Cash in? » mark with how long nothing has moved, and a table that is not to cash in does not", async () => {
		await thePlan()

		const mark = planTable("Table 5").find('[data-test="table-to-cash-in"]')
		expect(mark.text()).toBe("Cash in?")
		expect(mark.attributes("title")).toBe("Everything is served, nothing has moved for 50 min")
		expect(planTable("Table 1").find('[data-test="table-to-cash-in"]').exists()).toBe(false)
	})

	it("opens its order as a tap on any table does: the mark asks, it blocks nothing", async () => {
		await thePlan()
		const table = planTable("Table 5").element

		pointer("pointerdown", table)
		vi.advanceTimersByTime(100)
		pointer("pointerup", table)
		await flushPromises()

		expect(wrapper.emitted("table-selected")).toEqual([[T5]])
		expect(wrapper.emitted("cleaning-table-clicked")).toBeUndefined()
		expect(called("open_table").map((c) => c.args.table_name)).toEqual([T5.name])
	})

	it("is badged « Cash in? » in the list too", async () => {
		await floorPlan({ width: 390 })

		const card = cards().find((c) => c.find('[data-test="card-title"]').text() === "Table 5")
		expect(card.find('[data-test="badge"]').text()).toBe("Cash in?")
	})
})

