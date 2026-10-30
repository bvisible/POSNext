/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen shows the tickets waiting and the tickets in
 * //// preparation apart, each in order of arrival (NeoRestau lot 1, task 23), in one of two layouts the cook chooses: the
 * //// bands one above the other, or side by side. The product owner asked for it on 30.10, then for it to hold thirty
 * //// tickets in a band on a tablet. This spec reads the screen as the cook meets it; the split and the order themselves are
 * //// tested apart (utils/__tests__/kitchenBands.spec.js).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
}))

vi.hoisted(() => {
	// The app's `__`: indexed placeholders, and a context that changes nothing in English
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: KDS } = await import("../KDS.vue")
const {
	TICKET_AREA,
	TICKET_COLUMN_PRODUCTION,
	TICKET_COLUMN_WAITING,
	TICKET_GRID,
	TICKET_LANE,
	TICKET_SPLIT_PRODUCTION,
	TICKET_SPLIT_WAITING,
} = await import("@/utils/ticketLayout")
const {
	DEFAULT_LAYOUTS,
	LAYOUT_BANDS,
	LAYOUT_COLUMNS,
	LAYOUT_STORAGE_KEY,
	defaultLayout,
} = await import("@/utils/kitchenLayout")
// Both orientations open on the columns today (measured). The tests of what follows the orientation make them differ for
// the length of a test, as they will the day a real tablet asks for it.
const SAVED_DEFAULTS = { ...DEFAULT_LAYOUTS }

const TABLES = "pos_next.api.restaurant.get_tables"
const STATIONS_READ = "pos_next.api.restaurant.get_preparation_stations"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"

const AREAS = [
	{ name: "r1", area_name: "Room 1" },
	{ name: "r2", area_name: "Room 2" },
]
const STATIONS = [
	{ name: "bar", station_name: "Bar", color: "#2C4FA8" },
	{ name: "kit", station_name: "Kitchen", color: "#D68A59" },
]

const tokens = (classes) => classes.split(/\s+/).filter(Boolean)

/**
 * An order as the server sends it. `lines` are the statuses of its dishes, `at` the minute it was last sent (12:MM).
 * A dish is for the station given by `stationOf`, the kitchen unless told.
 */
function order(
	name,
	{ area = "r1", lines = ["Pending"], at = 0, stationOf, ...extra } = {},
) {
	const time = `2026-10-30 12:${String(at).padStart(2, "0")}:00.000000`
	return {
		name,
		area,
		restaurant_table: area ? `table-${name}` : null,
		table_display_name: area ? `T-${name}` : null,
		kds_status: "Pending",
		creation: "2026-10-30 11:00:00.000000",
		modified: time,
		items: lines.map((status, index) => ({
			name: `${name}-${index}`,
			item_name: "Dish",
			qty: 1,
			kds_status: status,
			preparation_station: stationOf ? stationOf(index) : "kit",
			station_name: "Kitchen",
		})),
		...extra,
	}
}

let ORDERS = []
function serve({ areas = AREAS } = {}) {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method === STATIONS_READ) return STATIONS
		if (method === TABLES) return { areas, tables: [], stations: [] }
		if (method === KDS_ORDERS) {
			if (!params.station) return ORDERS
			return ORDERS.map((o) => ({
				...o,
				items: o.items.filter((i) => i.preparation_station === params.station),
			})).filter((o) => o.items.length)
		}
		return []
	})
}

/** A window of the given kind: held upright or not, wide enough for two ticket columns or not. */
function installScreen({ portrait = false, wide = true } = {}) {
	const state = { portrait, wide }
	const registered = []
	const queries = {
		"(orientation: portrait)": () => state.portrait,
		"(min-width: 768px)": () => state.wide,
	}
	window.matchMedia = vi.fn((query) => {
		const read = queries[query] || (() => false)
		return {
			get matches() {
				return read()
			},
			media: query,
			addEventListener: (_, listener) => registered.push({ query, listener }),
			removeEventListener: (_, listener) => {
				const at = registered.findIndex((r) => r.listener === listener)
				if (at >= 0) registered.splice(at, 1)
			},
		}
	})
	const fire = (query) => {
		for (const r of registered.filter((x) => x.query === query))
			r.listener({ matches: queries[query](), media: query })
	}
	return {
		turn(nowPortrait) {
			state.portrait = nowPortrait
			fire("(orientation: portrait)")
		},
		resize(nowWide) {
			state.wide = nowWide
			fire("(min-width: 768px)")
		},
		listeners: () => registered.length,
	}
}

const Ticket = {
	props: ["order"],
	template:
		'<div class="ticket" :data-name="order.name">{{ order.name }}</div>',
}

let opened = []
async function open(search = "") {
	window.history.replaceState({}, "", `/pos/kds${search}`)
	const wrapper = mount(KDS, {
		global: { stubs: { KDSOrderCard: Ticket }, mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const namesIn = (wrapper, band) =>
	wrapper
		.get(`[data-test="band-${band}"]`)
		.findAll(".ticket")
		.map((el) => el.attributes("data-name"))
const headerOf = (wrapper, band) =>
	wrapper
		.get(`[data-test="band-${band}"] [data-test="band-header"]`)
		.text()
		.replace(/\s+/g, " ")
const chip = (wrapper, group, label) => {
	const found = wrapper
		.findAll(`[data-test="${group}"] button`)
		.find((button) => button.text().replace(/\s+/g, " ").startsWith(label))
	if (!found) throw new Error(`no ${group} chip starts with ${label}`)
	return found
}
async function choose(wrapper, group, label) {
	await chip(wrapper, group, label).trigger("click")
	await flushPromises()
}
const switchTo = async (wrapper, layout) => {
	await wrapper
		.get(`[data-test="layout-switch"] [data-layout="${layout}"]`)
		.trigger("click")
	await flushPromises()
}

beforeEach(() => {
	localStorage.clear()
	restaurantStore.tillRestaurant = "The Bistro"
	opened = []
	ORDERS = []
	serve()
	installScreen()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	window.matchMedia = undefined
	Object.assign(DEFAULT_LAYOUTS, SAVED_DEFAULTS)
	vi.restoreAllMocks()
})

describe("the two bands of the kitchen screen", () => {
	it("are on the screen whatever the counts: the waiting tickets first, the tickets in preparation after them", async () => {
		ORDERS = [order("W1"), order("P1", { lines: ["Preparing"] })]
		const wrapper = await open()

		const bands = wrapper.get('[data-test="bands"]')
		expect([...bands.element.children].map((el) => el.dataset.test)).toEqual([
			"band-waiting",
			"band-production",
		])
	})

	it("are there with nothing to cook either: two headers at zero and a line each, never a blank screen", async () => {
		const wrapper = await open()

		expect(headerOf(wrapper, "waiting")).toBe("Pending (0)")
		expect(headerOf(wrapper, "production")).toBe("Preparing (0)")
		expect(
			wrapper.get('[data-test="band-waiting"] [data-test="band-empty"]').text(),
		).toBe("No pending orders")
		expect(
			wrapper
				.get('[data-test="band-production"] [data-test="band-empty"]')
				.text(),
		).toBe("No orders in preparation")
		expect(wrapper.find(".animate-spin").exists()).toBe(false)
	})

	it("sort the tickets by what is begun on them: nothing begun waits, one dish begun is in preparation", async () => {
		ORDERS = [
			order("NONE", { lines: ["Pending", "Pending"], at: 1 }),
			order("ONE", { lines: ["Pending", "Preparing"], at: 2 }),
			order("READY", { lines: ["Ready", "Ready"], at: 3, kds_status: "Ready" }),
			order("ROUND2", { lines: ["Delivered", "Pending"], at: 4 }),
			order("DONE", { lines: ["Delivered"], at: 5, kds_status: "Delivered" }),
		]
		const wrapper = await open()

		expect(namesIn(wrapper, "waiting")).toEqual(["NONE", "ROUND2"])
		expect(namesIn(wrapper, "production")).toEqual(["ONE", "READY"])
		// Delivered: gone from both
		expect(wrapper.text()).not.toContain("DONE")
	})

	it("put the oldest ticket first in each band, whatever order the server sent them in", async () => {
		ORDERS = [
			order("W-LATE", { at: 30 }),
			order("P-LATE", { lines: ["Preparing"], at: 31 }),
			order("W-EARLY", { at: 5 }),
			order("P-EARLY", { lines: ["Preparing"], at: 6 }),
			order("W-MID", { at: 15 }),
		]
		const wrapper = await open()

		expect(namesIn(wrapper, "waiting")).toEqual(["W-EARLY", "W-MID", "W-LATE"])
		expect(namesIn(wrapper, "production")).toEqual(["P-EARLY", "P-LATE"])
	})

	it("carry the number of their tickets in the header", async () => {
		ORDERS = [
			order("W1", { at: 1 }),
			order("W2", { at: 2 }),
			order("W3", { at: 3 }),
			order("P1", { lines: ["Preparing"], at: 4 }),
		]
		const wrapper = await open()

		expect(headerOf(wrapper, "waiting")).toBe("Pending (3)")
		expect(headerOf(wrapper, "production")).toBe("Preparing (1)")
	})

	it("keep a band's header and one short line when it holds nothing, the other band as it was", async () => {
		ORDERS = [order("P1", { lines: ["Preparing"] })]
		const wrapper = await open()

		expect(headerOf(wrapper, "waiting")).toBe("Pending (0)")
		expect(
			wrapper.get('[data-test="band-waiting"] [data-test="band-empty"]').text(),
		).toBe("No pending orders")
		expect(namesIn(wrapper, "production")).toEqual(["P1"])
		expect(
			wrapper
				.find('[data-test="band-production"] [data-test="band-empty"]')
				.exists(),
		).toBe(false)
	})

	it("use the kitchen's own words for the ticket's two steps, the ones its badges already say", async () => {
		const wrapper = await open()

		// "Pending" and "Preparing" are what kitchenStatusLabel() gives the badges, and what the French catalogue turns into
		// "En attente" and "En préparation": the band and its tickets speak the same language
		expect(headerOf(wrapper, "waiting")).toMatch(/^Pending/)
		expect(headerOf(wrapper, "production")).toMatch(/^Preparing/)
	})

	it("show the ticket of a delivered order, in the band of what was begun, only when asked to show what is completed", async () => {
		ORDERS = [
			order("LIVE", { lines: ["Preparing"], at: 1 }),
			order("DONE", { lines: ["Delivered"], at: 2, kds_status: "Delivered" }),
		]
		const wrapper = await open()
		expect(namesIn(wrapper, "production")).toEqual(["LIVE"])

		await wrapper.get('input[type="checkbox"]').setValue(true)

		expect(namesIn(wrapper, "production")).toEqual(["LIVE", "DONE"])
		expect(headerOf(wrapper, "production")).toBe("Preparing (2)")
	})
})

describe("the filters on the two bands", () => {
	beforeEach(() => {
		ORDERS = [
			order("W-R1", { area: "r1", at: 1, stationOf: () => "kit" }),
			order("W-R2", { area: "r2", at: 2, stationOf: () => "bar" }),
			order("P-R1", {
				area: "r1",
				lines: ["Preparing"],
				at: 3,
				stationOf: () => "bar",
			}),
			order("P-R2", {
				area: "r2",
				lines: ["Preparing"],
				at: 4,
				stationOf: () => "kit",
			}),
			order("W-TAKE", {
				area: "",
				at: 5,
				is_takeaway: 1,
				stationOf: () => "kit",
			}),
		]
	})

	it("cut BOTH bands to the room chosen, and count what is left", async () => {
		const wrapper = await open()
		expect(namesIn(wrapper, "waiting")).toEqual(["W-R1", "W-R2", "W-TAKE"])

		await choose(wrapper, "rooms", "Room 1")

		expect(namesIn(wrapper, "waiting")).toEqual(["W-R1"])
		expect(namesIn(wrapper, "production")).toEqual(["P-R1"])
		expect(headerOf(wrapper, "waiting")).toBe("Pending (1)")
		expect(headerOf(wrapper, "production")).toBe("Preparing (1)")
	})

	it("cut BOTH bands to the station chosen, the server being asked for it", async () => {
		const wrapper = await open()

		await choose(wrapper, "stations", "Kitchen")

		expect(
			call.mock.calls.some(([m, p]) => m === KDS_ORDERS && p.station === "kit"),
		).toBe(true)
		expect(namesIn(wrapper, "waiting")).toEqual(["W-R1", "W-TAKE"])
		expect(namesIn(wrapper, "production")).toEqual(["P-R2"])
	})

	it("combine the room and the station in both bands, and keep the empty one's header and line", async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Room 2")
		await choose(wrapper, "stations", "Bar")

		expect(namesIn(wrapper, "waiting")).toEqual(["W-R2"])
		expect(namesIn(wrapper, "production")).toEqual([])
		expect(headerOf(wrapper, "production")).toBe("Preparing (0)")
		expect(
			wrapper
				.get('[data-test="band-production"] [data-test="band-empty"]')
				.text(),
		).toBe("No orders in preparation")
	})

	it("count the active orders of the room in the page header, the two bands together", async () => {
		const wrapper = await open()
		await choose(wrapper, "rooms", "Room 1")

		expect(wrapper.get("header").text()).toContain("Active Orders: 2")
	})
})

describe("a ticket on its way from one band to the other", () => {
	it("moves down to the bands of what is begun when a dish is started, at the next refresh", async () => {
		ORDERS = [
			order("T1", { lines: ["Pending", "Pending"], at: 1 }),
			order("T2", { at: 2 }),
		]
		const wrapper = await open()
		expect(namesIn(wrapper, "waiting")).toEqual(["T1", "T2"])

		// A cook starts a dish of T1 (on this screen or on another one): the server says so at the next read
		ORDERS = [
			order("T1", { lines: ["Preparing", "Pending"], at: 1 }),
			order("T2", { at: 2 }),
		]
		const refresh = wrapper
			.findAll("button")
			.find((b) => b.text() === "Refresh")
		await refresh.trigger("click")
		await flushPromises()

		expect(namesIn(wrapper, "waiting")).toEqual(["T2"])
		expect(namesIn(wrapper, "production")).toEqual(["T1"])
		expect(headerOf(wrapper, "waiting")).toBe("Pending (1)")
		expect(headerOf(wrapper, "production")).toBe("Preparing (1)")
	})

	it("is read again when the kitchen announces a change", async () => {
		ORDERS = [order("T1", { at: 1 })]
		const handlers = {}
		window.frappe = {
			realtime: {
				disconnected: false,
				on: (event, handler) => {
					handlers[event] = handler
				},
				off: () => {},
			},
		}
		const wrapper = await open()
		expect(namesIn(wrapper, "waiting")).toEqual(["T1"])

		ORDERS = [order("T1", { lines: ["Ready"], at: 1, kds_status: "Ready" })]
		handlers.kds_update()
		await flushPromises()

		expect(namesIn(wrapper, "waiting")).toEqual([])
		expect(namesIn(wrapper, "production")).toEqual(["T1"])
		window.frappe = undefined
	})
})

describe("the layout of the bands", () => {
	it("opens on the columns, held flat or upright, when nothing has been chosen", async () => {
		installScreen({ portrait: false })
		const flat = await open()
		expect(flat.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)

		installScreen({ portrait: true })
		const upright = await open()
		expect(upright.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)
	})

	it("opens on the layout of the way the tablet is held when the two ways differ", async () => {
		DEFAULT_LAYOUTS.portrait = LAYOUT_BANDS
		installScreen({ portrait: false })
		const flat = await open()
		expect(flat.get('[data-test="bands"]').attributes("data-layout")).toBe(
			defaultLayout({ portrait: false }),
		)

		installScreen({ portrait: true })
		const upright = await open()
		expect(upright.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"bands",
		)
	})

	it("puts the switch at the end of the filter line, after the stations", async () => {
		const wrapper = await open()

		const line = wrapper.get('[data-test="filter-line"]')
		expect([...line.element.children].map((el) => el.dataset.test)).toEqual([
			"rooms",
			"stations",
			"filter-end",
		])
		expect(
			wrapper
				.get('[data-test="filter-end"] [data-test="layout-switch"]')
				.exists(),
		).toBe(true)
	})

	it("lays the bands one above the other as LANES on the shared lane, the page-level wrapper being no grid", async () => {
		ORDERS = [order("W1"), order("P1", { lines: ["Preparing"] })]
		const wrapper = await open()
		await switchTo(wrapper, LAYOUT_BANDS)

		const area = wrapper.get('[data-test="ticket-area"]')
		expect(area.classes()).toEqual(expect.arrayContaining(tokens(TICKET_AREA)))
		const bands = wrapper.get('[data-test="bands"]')
		expect(bands.attributes("data-layout")).toBe("bands")
		expect(bands.classes()).toEqual(
			expect.arrayContaining(["flex", "flex-col", "h-full"]),
		)
		expect(area.element.contains(bands.element)).toBe(true)
		for (const band of ["waiting", "production"]) {
			const lane = wrapper.get(
				`[data-test="band-${band}"] [data-test="ticket-lane"]`,
			)
			expect(lane.classes()).toEqual(
				expect.arrayContaining(tokens(TICKET_LANE)),
			)
		}
		expect(bands.classes()).not.toContain("grid")
	})

	it("lays the bands side by side as COLUMNS on the shared grid itself: the waiting tickets in its first column, the others in the rest", async () => {
		ORDERS = [order("W1"), order("P1", { lines: ["Preparing"] })]
		const wrapper = await open()
		await switchTo(wrapper, LAYOUT_COLUMNS)

		// The wrapper of the two bands IS the shared grid, with a row as tall as the screen leaves it
		const grid = wrapper.get('[data-test="bands"]')
		expect(grid.attributes("data-layout")).toBe("columns")
		expect(grid.classes()).toEqual(expect.arrayContaining(tokens(TICKET_GRID)))
		expect(grid.classes()).toEqual(
			expect.arrayContaining(["h-full", "grid-rows-[minmax(0,1fr)]"]),
		)
		expect(wrapper.get('[data-test="band-waiting"]').classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_SPLIT_WAITING)),
		)
		expect(wrapper.get('[data-test="band-production"]').classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_SPLIT_PRODUCTION)),
		)
		expect(
			wrapper
				.get('[data-test="band-waiting"] [data-test="ticket-column"]')
				.classes(),
		).toEqual(expect.arrayContaining(tokens(TICKET_COLUMN_WAITING)))
		expect(
			wrapper
				.get('[data-test="band-production"] [data-test="ticket-column"]')
				.classes(),
		).toEqual(expect.arrayContaining(tokens(TICKET_COLUMN_PRODUCTION)))
		expect(wrapper.find('[data-test="ticket-lane"]').exists()).toBe(false)
	})

	it("keeps the same tickets, in the same bands, in either layout", async () => {
		ORDERS = [
			order("W1", { at: 1 }),
			order("W2", { at: 2 }),
			order("P1", { lines: ["Preparing"], at: 3 }),
		]
		const wrapper = await open()
		await switchTo(wrapper, LAYOUT_BANDS)
		const inBands = [
			namesIn(wrapper, "waiting"),
			namesIn(wrapper, "production"),
		]

		await switchTo(wrapper, LAYOUT_COLUMNS)

		expect([
			namesIn(wrapper, "waiting"),
			namesIn(wrapper, "production"),
		]).toEqual(inBands)
		expect(headerOf(wrapper, "waiting")).toBe("Pending (2)")
	})

	it("keeps the choice on this device, and opens on it next time, wherever the tablet is held", async () => {
		const first = await open()
		await switchTo(first, LAYOUT_COLUMNS)
		expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe("columns")

		installScreen({ portrait: true })
		const second = await open()

		expect(second.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)
		expect(
			second
				.get('[data-test="layout-switch"] [data-layout="columns"]')
				.attributes("aria-pressed"),
		).toBe("true")
	})

	it("writes nothing down until the cook has chosen: a layout that came from the orientation is not a choice", async () => {
		await open()
		installScreen({ portrait: true })
		await open()

		expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe(null)
	})

	it("follows the tablet when it is turned, until the cook has chosen", async () => {
		DEFAULT_LAYOUTS.portrait = LAYOUT_BANDS
		const screen = installScreen({ portrait: false })
		const wrapper = await open()
		const layoutOf = () =>
			wrapper.get('[data-test="bands"]').attributes("data-layout")
		expect(layoutOf()).toBe("columns")

		screen.turn(true)
		await flushPromises()
		expect(layoutOf()).toBe("bands")

		screen.turn(false)
		await flushPromises()
		expect(layoutOf()).toBe("columns")
	})

	it("stays where the cook put it when the tablet is turned", async () => {
		DEFAULT_LAYOUTS.portrait = LAYOUT_BANDS
		const screen = installScreen({ portrait: false })
		const wrapper = await open()
		await switchTo(wrapper, LAYOUT_BANDS)

		screen.turn(true)
		await flushPromises()
		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"bands",
		)

		await switchTo(wrapper, LAYOUT_COLUMNS)
		screen.turn(false)
		await flushPromises()
		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)
		screen.turn(true)
		await flushPromises()
		// He pressed the columns: a tablet turned upright does not take it back to the bands the table says
		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)
	})

	it("is always the bands, with no switch to offer, on a screen too narrow for two ticket columns", async () => {
		localStorage.setItem(LAYOUT_STORAGE_KEY, "columns")
		const screen = installScreen({ wide: false })
		const wrapper = await open()

		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"bands",
		)
		expect(wrapper.find('[data-test="layout-switch"]').exists()).toBe(false)

		// The window is made wider: the cook's choice is back
		screen.resize(true)
		await flushPromises()
		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)
		expect(wrapper.find('[data-test="layout-switch"]').exists()).toBe(true)
	})

	it("works with a browser that keeps nothing: the choice holds while the screen is open, and the screen opens all the same", async () => {
		const spy = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("QuotaExceededError")
			})
		const wrapper = await open()

		await switchTo(wrapper, LAYOUT_COLUMNS)

		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			"columns",
		)
		spy.mockRestore()
	})

	it("opens on a browser that has no media queries at all: held flat, wide enough", async () => {
		window.matchMedia = undefined
		const wrapper = await open()

		expect(wrapper.get('[data-test="bands"]').attributes("data-layout")).toBe(
			defaultLayout({ portrait: false }),
		)
		expect(wrapper.find('[data-test="layout-switch"]').exists()).toBe(true)
	})

	it("stops listening to the screen when it is left", async () => {
		const screen = installScreen()
		const wrapper = await open()
		expect(screen.listeners()).toBeGreaterThan(0)

		wrapper.unmount()
		opened = []

		expect(screen.listeners()).toBe(0)
	})
})

describe("a kitchen with a lot to cook", () => {
	it("keeps both bands on the screen with 30 tickets waiting and 15 in preparation, and every ticket in its band", async () => {
		ORDERS = [
			...Array.from({ length: 30 }, (_, i) => order(`W${i + 1}`, { at: i })),
			...Array.from({ length: 15 }, (_, i) =>
				order(`P${i + 1}`, { lines: ["Preparing"], at: i }),
			),
		]
		for (const layout of [LAYOUT_BANDS, LAYOUT_COLUMNS]) {
			localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
			const wrapper = await open()

			expect(headerOf(wrapper, "waiting"), layout).toBe("Pending (30)")
			expect(headerOf(wrapper, "production"), layout).toBe("Preparing (15)")
			expect(namesIn(wrapper, "waiting"), layout).toHaveLength(30)
			expect(namesIn(wrapper, "production"), layout).toHaveLength(15)
			// Oldest first: the first to come is the first to go
			expect(namesIn(wrapper, "waiting")[0]).toBe("W1")
			expect(namesIn(wrapper, "waiting")[29]).toBe("W30")
		}
	})
})
