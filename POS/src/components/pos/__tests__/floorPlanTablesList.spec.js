/**
 * //// Neoffice — added file (no upstream equivalent). The floor plan of the restaurant till shows its tables as a list
 * //// or as the plan (NeoResto lot 1, task 26; product owner, 31.10.2026: « on the phone, show the list of the tables
 * //// by default rather than the plan », « on phones the table's QR code must be easy to reach »). On a phone it opens
 * //// on the list, under the mockup's top (« Tables », the user, the time, « List | Floor plan »); on a tablet and a
 * //// PC on the plan, as before, with a small « Plan | List » before the « ⋯ ». The list reads what the plan reads and
 * //// opens a table as the plan does; a table's QR code is one tap from its card, and a long press on a table of the
 * //// plan shows it, in the service only (the editor keeps its drag).
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
		tables: [T1, T2, T3, T4, T9],
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

describe("on a phone the tables open on the list", () => {
	it("shows the list under the mockup's top, the plan and its line put away", async () => {
		await floorPlan({ width: 390 })

		expect(wrapper.find('[data-test="phone-top-title"]').text()).toBe("Tables")
		expect(wrapper.find('[data-test="phone-top-user"]').text()).toBe(
			"Lea · 19:58",
		)
		expect(
			wrapper.find('[data-test="view-list"]').attributes("aria-pressed"),
		).toBe("true")
		expect(list().exists()).toBe(true)
		expect(shown(canvas())).toBe(false)
		expect(shown(line())).toBe(false)
		// A phone's list ends with its bar
		expect(wrapper.find('[data-test="tables-bar"]').exists()).toBe(true)
	})

	it("lists the floor's tables by urgency: ready at the pass first, then the oldest seated", async () => {
		await floorPlan()

		expect(cardTitles()).toEqual(["Table 2", "Table 1", "Table 9"])
		expect(cards()[0].find('[data-test="badge"]').text()).toBe(
			"Dishes ready at the pass",
		)
		// The free table and the one being cleaned, one line each
		expect(
			wrapper
				.findAll('[data-test="table-row"]')
				.map((row) => row.text().replace(/\s+/g, " ")),
		// Each row opens with the code of its room (kitchen test, 01.11)
		).toEqual(["R01Table 3 Empty", "R01Table 4 Cleaning"])
	})

	it("shows a room's tables under its chip, and every table under « All »", async () => {
		await floorPlan()
		const chips = () => wrapper.findAll('[data-test="room-chip"]')
		expect(chips().map((chip) => chip.text())).toEqual([
			"All · 3",
			"Room 1",
			"Terrace",
		])

		await chips()[2].trigger("click")
		expect(cardTitles()).toEqual(["Table 9"])
		expect(wrapper.findAll('[data-test="table-row"]')).toHaveLength(0)

		await chips()[0].trigger("click")
		expect(cardTitles()).toEqual(["Table 2", "Table 1", "Table 9"])
	})

	it("switches to the plan with its rooms, and remembers it on this device", async () => {
		await floorPlan()

		await wrapper.find('[data-test="view-plan"]').trigger("click")

		expect(list().exists()).toBe(false)
		expect(shown(canvas())).toBe(true)
		expect(shown(line())).toBe(true)
		expect(
			wrapper.findAll('[data-test="room-tab"]').map((tab) => tab.text()),
		).toEqual(["Room 1", "Terrace"])
		// The phone's plan is the mockup's: its rooms, no station chips nor pills, no small switch (the top has one)
		expect(wrapper.find('[data-test="takeaway-pill"]').exists()).toBe(false)
		expect(line().find('[data-test="view-switch"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="plan-hint"]').text()).toBe(
			"Tap a table to open its order · long press: its QR code",
		)
		expect(localStorage.getItem(TABLES_VIEW_KEY)).toBe("plan")

		wrapper.unmount()
		await floorPlan()
		expect(list().exists()).toBe(false)
	})
})

describe("on a tablet and a PC the plan stays, with a small switch before the « ⋯ »", () => {
	it("opens on the plan, as before, and puts « Plan | List » right before the « ⋯ »", async () => {
		await floorPlan({ width: 1180 })

		expect(shown(canvas())).toBe(true)
		expect(list().exists()).toBe(false)
		expect(wrapper.find('[data-test="phone-top-bar"]').exists()).toBe(false)
		const actions = [
			...line().find('[data-test="floor-actions"]').element.children,
		].map((el) => el.dataset.test)
		expect(actions.slice(-2)).toEqual(["view-switch", "floor-line-menu"])
		const halves = line().findAll('[data-test="view-switch"] button')
		expect(halves.map((half) => half.text())).toEqual(["Plan", "List"])
		expect(halves[0].classes()).toContain("h-8")
	})

	it("shows the list under the line, without the line's rooms (the list has its own) nor its bar", async () => {
		await floorPlan({ width: 1180 })

		await line().find('[data-test="view-list"]').trigger("click")

		expect(list().exists()).toBe(true)
		expect(shown(canvas())).toBe(false)
		expect(shown(line())).toBe(true)
		expect(shown(line().find('[data-test="floor-rooms"]'))).toBe(false)
		expect(wrapper.find('[data-test="tables-bar"]').exists()).toBe(false)
		expect(localStorage.getItem(TABLES_VIEW_KEY)).toBe("list")
	})

	it("offers « Free the tables being cleaned » over the plan only: it frees the room on the screen", async () => {
		await floorPlan({ width: 1180 })
		await line().find('[data-test="view-list"]').trigger("click")

		await wrapper.find('[data-test="floor-line-more"]').trigger("click")

		expect(wrapper.find('[data-test="menu-edit-floor-plan"]').exists()).toBe(
			true,
		)
		expect(
			wrapper.find('[data-test="menu-free-cleaning-tables"]').exists(),
		).toBe(false)
	})

	it("shows the plan while it is edited, whatever the view chosen", async () => {
		localStorage.setItem(TABLES_VIEW_KEY, "list")
		await floorPlan({ width: 1180 })
		expect(list().exists()).toBe(true)

		await wrapper.vm.toggleEditMode()
		await flushPromises()

		expect(list().exists()).toBe(false)
		expect(shown(canvas())).toBe(true)
	})
})

describe("a card of the list", () => {
	it("opens its table as a tap on the plan does", async () => {
		await floorPlan()

		await cards()[1].find('[data-test="open-table"]').trigger("click")
		await flushPromises()

		expect(called("open_table").map((c) => c.args.table_name)).toEqual([
			T1.name,
		])
		expect(cart.setRestaurantTable).toHaveBeenCalledWith(T1)
		expect(wrapper.emitted("table-selected")).toEqual([[T1]])
	})

	it("asks for its table's QR code through the till's one entry, and opens nothing", async () => {
		await floorPlan()

		await cards()[0].find('[data-test="table-qr"]').trigger("click")

		expect(wrapper.emitted("show-table-qr")).toEqual([[T2]])
		expect(called("open_table")).toHaveLength(0)
	})

	it("has no QR button where the restaurant takes no QR orders", async () => {
		await floorPlan({ store: { qrOrderingEnabled: false } })

		expect(wrapper.find('[data-test="table-qr"]').exists()).toBe(false)
	})
})

describe("a press on a table of the plan", () => {
	async function thePlan(store = {}) {
		await floorPlan({ width: 1180, store })
	}

	it("opens the table when the finger lifts after a short press", async () => {
		await thePlan()
		const table = planTable("Table 1").element

		pointer("pointerdown", table)
		vi.advanceTimersByTime(100)
		pointer("pointerup", table)
		await flushPromises()

		expect(wrapper.emitted("table-selected")).toEqual([[T1]])
		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
	})

	it("shows the table's QR code after a long press, and opens nothing", async () => {
		await thePlan()
		const table = planTable("Table 3").element

		pointer("pointerdown", table)
		vi.advanceTimersByTime(LONG_PRESS_MS)
		expect(wrapper.emitted("show-table-qr")).toEqual([[T3]])

		pointer("pointerup", table)
		await flushPromises()
		expect(wrapper.emitted("table-selected")).toBeUndefined()
	})

	it("is a pan when it moves: neither the table nor its QR code", async () => {
		await thePlan()
		const table = planTable("Table 1").element

		pointer("pointerdown", table)
		pointer("pointermove", table, { clientX: 90 })
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		pointer("pointerup", table, { clientX: 90 })
		await flushPromises()

		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
		expect(wrapper.emitted("table-selected")).toBeUndefined()
	})

	it("lets the plan hear it in the service, for its pan", async () => {
		await thePlan()
		const heard = vi.fn()
		canvas().element.addEventListener("pointerdown", heard)

		pointer("pointerdown", planTable("Table 1").element)

		expect(heard).toHaveBeenCalledTimes(1)
	})

	it("drags the table in the editor, as before: no QR code, no pan", async () => {
		await thePlan()
		await wrapper.vm.toggleEditMode()
		await flushPromises()
		const heard = vi.fn()
		canvas().element.addEventListener("pointerdown", heard)

		pointer("pointerdown", planTable("Table 3").element)
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)

		expect(drag.start).toHaveBeenCalledTimes(1)
		expect(heard).not.toHaveBeenCalled()
		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
	})

	it("is only a tap where the restaurant takes no QR orders, and on a table being cleaned", async () => {
		await thePlan({ qrOrderingEnabled: false })
		pointer("pointerdown", planTable("Table 3").element)
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
		wrapper.unmount()

		await thePlan()
		pointer("pointerdown", planTable("Table 4").element)
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
	})

	it("keeps the browser's menu of a long press off the table", async () => {
		await thePlan()

		const menu = pointer("contextmenu", planTable("Table 1").element)

		expect(menu.defaultPrevented).toBe(true)
	})
})

describe("the bar at the bottom of a phone's list", () => {
	it("starts a takeaway order as the line's Takeaway does", async () => {
		await floorPlan()

		const [, takeaway] = wrapper
			.find('[data-test="tables-bar"]')
			.findAll("button")
		await takeaway.trigger("click")

		expect(wrapper.emitted("start-takeaway")).toHaveLength(1)
	})

	it("seats the free table picked, as the plan does", async () => {
		await floorPlan()

		await wrapper
			.find('[data-test="tables-bar"]')
			.findAll("button")[0]
			.trigger("click")
		const picks = wrapper.findAll('[data-test="free-table"]')
		expect(picks.map((pick) => pick.text())).toEqual(["Table 3"])
		await picks[0].trigger("click")
		await flushPromises()

		expect(called("open_table").map((c) => c.args.table_name)).toEqual([
			T3.name,
		])
		expect(wrapper.emitted("table-selected")).toEqual([[T3]])
	})
})

describe("« Soon » and the realtime of the plan", () => {
	const booking = (name, time, guests, tables = []) => ({
		name,
		status: "Confirmed",
		reservation_date: "2026-10-31",
		reservation_time: `${time}:00`,
		no_of_guests: guests,
		tables: tables.map((t) => ({
			restaurant_table: t.name,
			table_name: t.table_name,
			area: t.area,
		})),
	})

	it("reads the reservations of the till's restaurant, of today, when the list is shown", async () => {
		server.reservations = [booking("R1", "20:15", 8, [T3])]
		await floorPlan()

		const [asked] = called("get_reservations")
		expect(asked.args).toEqual(
			expect.objectContaining({ date: "2026-10-31", restaurant: "The Bistro" }),
		)
		const card = wrapper.find('[data-test="reservation-card"]')
		expect(card.text().replace(/\s+/g, " ")).toBe(
			"Table 3 reserved 20:15 · 8 guests",
		)
	})

	it("reads no reservation for a plan nobody looks at as a list", async () => {
		await floorPlan({ width: 1180 })

		expect(called("get_reservations")).toHaveLength(0)
	})

	it("follows the plan's events: the pass's orders, the floor, the reservations", async () => {
		await floorPlan()
		expect(cardTitles()[0]).toBe("Table 2")

		// Table 1's dishes come ready at the pass
		server.runnerOrders = [
			{
				name: "SINV-1",
				restaurant_table: T1.name,
				items: [{ name: "l2", station_type: "Kitchen" }],
			},
		]
		for (const handler of socket.handlers.kds_update) handler()
		await flushPromises()
		expect(cardTitles()[0]).toBe("Table 1")

		for (const handler of socket.handlers.table_update) handler()
		expect(restaurantStore.fetchFromNetwork).toHaveBeenCalledTimes(2)

		server.reservations = [booking("R2", "20:30", 2)]
		for (const handler of socket.handlers.reservation_update) handler()
		await flushPromises()
		expect(wrapper.find('[data-test="reservation-card"]').text()).toContain(
			"No table",
		)
	})

	it("polls nothing of its own: the clock only moves the minutes on the screen", async () => {
		await floorPlan()
		const asked = server.calls.length

		vi.advanceTimersByTime(10 * 60 * 1000)
		await flushPromises()

		expect(server.calls.length).toBe(asked)
		expect(cards()[1].find('[data-test="card-details"]').text()).toContain(
			"For 1 h 00",
		)
	})

	it("stops hearing the reservations once gone", async () => {
		await floorPlan()

		wrapper.unmount()
		wrapper = null

		expect(socket.handlers.reservation_update).toEqual([])
	})
})

describe("a mouse on the plan (fix round 1)", () => {
	async function thePlan() {
		await floorPlan({ width: 1366 })
	}
	const mouse = { pointerType: "mouse" }

	it("never shows a QR code, however long it is held: it opens the table when released", async () => {
		await thePlan()
		const table = planTable("Table 1").element

		pointer("pointerdown", table, mouse)
		vi.advanceTimersByTime(650)
		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
		pointer("pointerup", table, mouse)
		await flushPromises()

		expect(wrapper.emitted("table-selected")).toEqual([[T1]])
		expect(wrapper.emitted("show-table-qr")).toBeUndefined()
	})

	it("opens the table on a click that slips 12 px: the plan does not pan from a table under a mouse", async () => {
		await thePlan()
		const heard = vi.fn()
		canvas().element.addEventListener("pointerdown", heard)
		const table = planTable("Table 1").element

		pointer("pointerdown", table, mouse)
		pointer("pointermove", table, { ...mouse, clientX: 62 })
		pointer("pointerup", table, { ...mouse, clientX: 62 })
		await flushPromises()

		expect(heard).not.toHaveBeenCalled()
		expect(wrapper.emitted("table-selected")).toEqual([[T1]])
	})
})

vi.mock("@/utils/openScreen", () => ({ openScreen: vi.fn() }))
const { openScreen } = await import("@/utils/openScreen")

//// Neoffice — the waiter's phone has no door to the kitchen's or the runner's screen (product owner, 06.11.2026: « sur le côté serveur sur l'app mobile, il ne faut pas les boutons
//// d'accès runner et cuisine, ça amène trop de problème »). The tablet's line keeps its station chips and its Runner pill.
describe("no kitchen or runner access on a phone", () => {
	const STATION = {
		name: "ST-KITCHEN",
		station_name: "Kitchen",
		station_type: "Kitchen",
		area: ROOM.name,
		pos_x: 10,
		pos_y: 10,
		width: 120,
		height: 60,
		color: "#6B7280",
	}
	let open
	beforeEach(() => {
		open = vi.spyOn(window, "open").mockImplementation(() => null)
		openScreen.mockClear()
	})
	afterEach(() => open.mockRestore())
	const runner = () => wrapper.find('[data-test="phone-runner"]')
	const stationBox = () =>
		wrapper
			.findAll("div")
			.find((el) => el.classes().includes("absolute") && el.text().trim() === "Kitchen")

	it("has no Runner button in the phone's top, over the list or over the plan, even with dishes waiting at the pass", async () => {
		await floorPlan()
		expect(server.runnerOrders.length).toBeGreaterThan(0)
		expect(runner().exists()).toBe(false)
		expect(wrapper.find('[data-test="phone-top-bar"]').text()).not.toContain("Runner")

		await wrapper.find('[data-test="view-plan"]').trigger("click")
		expect(runner().exists()).toBe(false)
		expect(wrapper.find('[data-test="runner-pill"]').exists()).toBe(false)
	})

	it("a station drawn on the phone's plan is a landmark: touching it opens nothing", async () => {
		await floorPlan({ store: { floorStations: [STATION] } })
		await wrapper.find('[data-test="view-plan"]').trigger("click")
		await flushPromises()

		const box = stationBox()
		expect(box).toBeTruthy()
		expect(box.classes()).not.toContain("cursor-pointer")
		await box.trigger("click")

		expect(openScreen).not.toHaveBeenCalled()
		expect(open).not.toHaveBeenCalled()
	})

	it("on a tablet the station and the runner pill keep opening the kitchen's and the runner's screens", async () => {
		await floorPlan({ width: 1180, store: { floorStations: [STATION] } })

		await wrapper.find('[data-test="station-chip"]').trigger("click")
		expect(openScreen).toHaveBeenCalledWith("/pos/kds?station=ST-KITCHEN&restaurant=The%20Bistro", { samePage: false })

		await wrapper.find('[data-test="runner-pill"]').trigger("click")
		expect(openScreen).toHaveBeenCalledWith("/pos/runner?restaurant=The%20Bistro", { samePage: false })
	})
})

describe("« Soon », the site's clock and midnight (fix round 1)", () => {
	const ZURICH = "Europe/Zurich"
	const booking = (name, date, time, guests = 2) => ({
		name,
		status: "Confirmed",
		reservation_date: date,
		reservation_time: `${time}:00`,
		no_of_guests: guests,
		tables: [],
	})
	const daysAsked = () => called("get_reservations").map((c) => c.args.date)

	it("says the site's time in the phone's top, whatever the device's zone", async () => {
		await floorPlan({ siteTimezone: "Asia/Tokyo" })

		// 19:58 in Zurich is 03:58 the next day in Tokyo
		expect(wrapper.find('[data-test="phone-top-user"]').text()).toBe(
			"Lea · 03:58",
		)
	})

	it("reads the site's today, and tomorrow too from 23:00, and again when that changes", async () => {
		vi.setSystemTime(new Date(Date.UTC(2026, 9, 31, 21, 59, 50)))
		await floorPlan({ siteTimezone: ZURICH })
		expect(daysAsked()).toEqual(["2026-10-31"])

		vi.advanceTimersByTime(30 * 1000)
		await flushPromises()

		expect(daysAsked()).toEqual(["2026-10-31", "2026-10-31", "2026-11-01"])
	})

	it("shows a booking of tomorrow before midnight, and marks a late one", async () => {
		vi.setSystemTime(new Date(Date.UTC(2026, 9, 31, 22, 30)))
		server.reservations = [
			booking("late", "2026-10-31", "23:10"),
			booking("tomorrow", "2026-11-01", "00:15"),
		]
		await floorPlan({ siteTimezone: ZURICH })

		const cards = wrapper.findAll('[data-test="reservation-card"]')
		expect(
			cards.map((card) => card.find('[data-test="late"]').exists()),
		).toEqual([true, false])
		expect(cards[0].text()).toContain("Late")
	})

	it("keeps the last list it read when a refresh fails", async () => {
		server.reservations = [booking("R1", "2026-10-31", "20:15")]
		await floorPlan()
		expect(wrapper.findAll('[data-test="reservation-card"]')).toHaveLength(1)

		const { call } = await import("@/utils/apiWrapper")
		call.mockImplementationOnce(async () => {
			throw new Error("offline")
		})
		for (const handler of socket.handlers.reservation_update) handler()
		await flushPromises()

		expect(wrapper.findAll('[data-test="reservation-card"]')).toHaveLength(1)
	})
})

describe("a floor never laid out, first shown as the list (fix round 1)", () => {
	let width
	beforeEach(() => {
		// The plan's canvas is 390 px wide when shown, and has no width while the list puts it away
		width = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"offsetWidth",
		)
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
			configurable: true,
			get() {
				if (this.dataset?.test !== "floor-canvas") return 0
				return this.style.display === "none" ? 0 : 390
			},
		})
	})
	afterEach(() =>
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", width),
	)

	it("is laid out for the plan's real width once the plan is shown", async () => {
		const atOrigin = ["Table 1", "Table 2", "Table 3", "Table 4"].map(
			(label, at) =>
				aTable(`0r1g1n${at}`, label, "Empty", { pos_x: 0, pos_y: 0 }),
		)
		await floorPlan({ store: { tables: atOrigin } })

		await wrapper.find('[data-test="view-plan"]').trigger("click")
		await flushPromises()

		// 390 px hold three tables of 110 px and their margins: the fourth starts the second row
		const fourth = planTable("Table 4").element.style
		expect([fourth.left, fourth.top]).toEqual(["20px", "150px"])
	})
})
