/**
 * //// Neoffice — added file (no upstream equivalent). The ONE top bar of the kitchen screen and of the runner screen (NeoResto lot 1, task 38a-2,
 * //// rulings 128 and 129). The page opened on three lines (a title that said « preparation » whatever the station, a subtitle, a line of chips)
 * //// before the first ticket. Now ROW 1 is one line: the title names the STATION the screen is opened on, with the count beside it, then the
 * //// actions; ROW 2, the rooms and the stations, is drawn only when there is something to choose.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
	fetchRestaurantSettings: async () => {},
}))

vi.hoisted(() => {
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
const { default: Runner } = await import("../Runner.vue")

const AREAS = [
	{ name: "r1", area_name: "Room 1" },
	{ name: "r2", area_name: "Room 2" },
]
const STATIONS = [
	{
		name: "bar",
		station_name: "Bar",
		color: "#4A6B8F",
		restaurant: "The Bistro",
		use_runner: 1,
	},
	{
		name: "kit",
		station_name: "Cuisine",
		color: "#F55D1A",
		restaurant: "The Bistro",
		use_runner: 1,
	},
]

let created = 0
function ticket(
	name,
	area,
	station = "kit",
	{ qty = 1, status = "Pending" } = {},
) {
	created += 1
	return {
		name,
		area,
		restaurant_table: `table-${name}`,
		table_display_name: `T-${name}`,
		kds_status: status,
		creation: `2026-10-30 12:00:${String(created).padStart(2, "0")}`,
		modified: `2026-10-30 12:00:${String(created).padStart(2, "0")}`,
		items: [
			{
				name: `${name}-0`,
				item_code: `${name}-0`,
				item_name: "Dish",
				qty,
				preparation_station: station,
				station_name: station === "bar" ? "Bar" : "Cuisine",
				station_color: station === "bar" ? "#4A6B8F" : "#F55D1A",
				kds_status: status,
			},
		],
	}
}

let KITCHEN_ORDERS = []
let RUNNER_ORDERS = []
function serve({ areas = AREAS, stations = STATIONS } = {}) {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method.endsWith("get_preparation_stations")) return stations
		if (method.endsWith("get_tables"))
			return { areas, tables: [], stations: [] }
		if (method.endsWith("get_kds_orders")) {
			if (!params.station) return KITCHEN_ORDERS
			return KITCHEN_ORDERS.map((order) => ({
				...order,
				items: order.items.filter(
					(item) => item.preparation_station === params.station,
				),
			})).filter((order) => order.items.length)
		}
		if (method.endsWith("get_runner_orders")) return RUNNER_ORDERS
		return []
	})
}

let opened = []
async function open(Screen, address) {
	window.history.replaceState({}, "", address)
	const wrapper = mount(Screen, {
		global: {
			stubs: { KDSOrderCard: true, RunnerOrderCard: true },
			mocks: { __: globalThis.__, $router: { push: vi.fn() } },
		},
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const kitchen = (query = "") => open(KDS, `/pos/kds${query}`)
const runner = (query = "") => open(Runner, `/pos/runner${query}`)

const rowOne = (wrapper) => wrapper.get('[data-test="top-bar-row1"]')
const chipTexts = (wrapper, group) =>
	wrapper
		.findAll(`[data-test="${group}"] button`)
		.map((button) => button.text().replace(/\s+/g, " "))

beforeEach(() => {
	created = 0
	opened = []
	localStorage.clear()
	document.cookie = "system_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
	document.title = "The till"
	restaurantStore.runnerEnabled = true
	KITCHEN_ORDERS = [
		ticket("A1", "r1", "kit"),
		ticket("A2", "r1", "bar"),
		ticket("B1", "r2", "kit", { status: "Preparing" }),
	]
	RUNNER_ORDERS = [
		ticket("R1", "r1", "kit", { qty: 3, status: "Ready" }),
		ticket("R2", "r2", "bar", { qty: 2, status: "Ready" }),
	]
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	document.cookie = "system_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
})

describe("the kitchen screen's title", () => {
	it("names the station the screen is opened on, with its colour as a dot, and not the word « preparation »", async () => {
		const wrapper = await kitchen("?station=bar")

		expect(wrapper.get('[data-test="page-heading"]').text()).toBe("Bar")
		const dot = wrapper.get('[data-test="title-dot"]')
		expect(dot.element.style.getPropertyValue("--dot-color")).toBe("#4A6B8F")
		expect(wrapper.text()).not.toContain("Preparation Display")
	})

	it("says « All preparations » when no station is chosen, and follows the station chosen on the chips", async () => {
		const wrapper = await kitchen()
		expect(wrapper.get('[data-test="page-heading"]').text()).toBe(
			"All preparations",
		)

		const stationChips = wrapper.findAll('[data-test="stations"] button')
		await stationChips
			.find((chip) => chip.text().startsWith("Cuisine"))
			.trigger("click")
		await flushPromises()

		expect(wrapper.get('[data-test="page-heading"]').text()).toBe("Cuisine")
	})

	it("counts the tickets on the same line as the title, and the count follows the room chosen", async () => {
		const wrapper = await kitchen()
		expect(wrapper.get('[data-test="page-title"]').text()).toContain("3 orders")

		const rooms = wrapper.findAll('[data-test="rooms"] button')
		await rooms
			.find((chip) => chip.text().startsWith("Room 1"))
			.trigger("click")
		await flushPromises()

		expect(wrapper.get('[data-test="page-title"]').text()).toContain("2 orders")
	})

	it("sets the browser tab's title to the page's, and puts the old one back when it goes", async () => {
		const wrapper = await kitchen("?station=kit")
		expect(document.title).toBe("Cuisine")

		wrapper.unmount()
		opened = []

		expect(document.title).toBe("The till")
	})
})

describe("the runner screen's title", () => {
	it("is « Runner », with the dishes that are ready counted by quantity on the same line", async () => {
		const wrapper = await runner()

		expect(wrapper.get('[data-test="page-heading"]').text()).toBe("Runner")
		// 3 plates and 2 plates: five to carry, not two lines
		expect(wrapper.get('[data-test="page-title"]').text()).toContain(
			"5 items ready",
		)
		expect(document.title).toBe("Runner")
	})

	it("adds the room when one is chosen", async () => {
		const wrapper = await runner()

		const rooms = wrapper.findAll('[data-test="rooms"] button')
		await rooms
			.find((chip) => chip.text().startsWith("Room 2"))
			.trigger("click")
		await flushPromises()

		expect(wrapper.get('[data-test="page-heading"]').text()).toBe(
			"Runner · Room 2",
		)
		expect(wrapper.get('[data-test="page-title"]').text()).toContain(
			"2 items ready",
		)
	})
})

describe.each([
	["kitchen", kitchen],
	["runner", runner],
])("the %s bar's row 1", (name, openIt) => {
	it("is ONE line: the title, then the text size, the refresh and the way back, all inside the header", async () => {
		const wrapper = await openIt()

		const row = rowOne(wrapper)
		for (const part of [
			"page-title",
			"text-size",
			"refresh",
			"back-to-pos",
			"completed-toggle",
		]) {
			expect(row.find(`[data-test="${part}"]`).exists(), part).toBe(true)
		}
		// One bar, and no second line of a title and a subtitle
		expect(wrapper.findAll('[data-test="top-bar"]')).toHaveLength(1)
		expect(wrapper.findAll("h1")).toHaveLength(1)
	})

	it("keeps « Show completed » a real checkbox, with its words above 1024 px and an eye of 44 px at 1024 px and below", async () => {
		const wrapper = await openIt()

		const toggle = wrapper.get('[data-test="completed-toggle"]')
		const box = toggle.get('input[type="checkbox"]')
		// Under 1024 px the box and the words are read by a screen reader only, and the eye is what is drawn
		expect(box.classes()).toContain("max-[1024px]:sr-only")
		expect(toggle.get('[data-test="completed-label"]').classes()).toContain(
			"max-[1024px]:sr-only",
		)
		const eye = toggle.get('[data-test="completed-eye"]')
		expect(eye.classes()).toEqual(
			expect.arrayContaining([
				"hidden",
				"max-[1024px]:inline-flex",
				"h-11",
				"w-11",
			]),
		)
		// The words of the control stay in the page for whoever cannot see the eye
		expect(toggle.text()).toContain("Show completed")
	})

	it("has the theme button, a 44 px button between the size of the text and the refresh", async () => {
		const wrapper = await openIt()

		const buttons = [
			...rowOne(wrapper).element.querySelectorAll("button, label"),
		].map((el) => el.dataset.test)
		const at = (part) => buttons.indexOf(part)
		expect(at("theme-button")).toBeGreaterThan(at("text-size"))
		expect(at("theme-button")).toBeLessThan(at("refresh"))
		expect(wrapper.get('[data-test="theme-button"]').classes()).toEqual(
			expect.arrayContaining(["h-11", "w-11"]),
		)
	})

	it("has the way back to the till for a desk session, and none for a tablet's own account", async () => {
		const desk = await openIt()
		expect(desk.find('[data-test="back-to-pos"]').exists()).toBe(true)

		document.cookie = "system_user=no"
		const tablet = await openIt()
		expect(tablet.find('[data-test="back-to-pos"]').exists()).toBe(false)
	})
})

describe("the filters of row 2", () => {
	it("are drawn when there are rooms and stations to choose from", async () => {
		const wrapper = await kitchen()

		expect(chipTexts(wrapper, "rooms")).toEqual([
			"All Areas",
			"Room 1 (2)",
			"Room 2 (1)",
		])
		expect(chipTexts(wrapper, "stations")[0]).toMatch(/^All/)
		expect(wrapper.find('[data-test="filter-line"]').exists()).toBe(true)
	})

	it("have no room chip when the restaurant has one room: « all rooms » alone would do nothing", async () => {
		serve({ areas: [AREAS[0]] })
		const wrapper = await kitchen()

		expect(wrapper.find('[data-test="rooms"]').exists()).toBe(false)
		// The stations are still there
		expect(wrapper.find('[data-test="stations"]').exists()).toBe(true)
	})

	it("have no station chip when the restaurant has one station", async () => {
		serve({ stations: [STATIONS[1]] })
		const wrapper = await kitchen()

		expect(wrapper.find('[data-test="stations"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="rooms"]').exists()).toBe(true)
	})

	it("have no station chip on a tablet bound to its station, and a desk user who opens the same address keeps them", async () => {
		const desk = await kitchen("?station=bar")
		expect(desk.find('[data-test="stations"]').exists()).toBe(true)

		document.cookie = "system_user=no"
		const tablet = await kitchen("?station=bar")
		expect(tablet.find('[data-test="stations"]').exists()).toBe(false)
	})

	it("are not drawn at all when there is nothing to choose: a tablet bound to its station in a restaurant of one room has ONE row", async () => {
		serve({ areas: [AREAS[0]] })
		document.cookie = "system_user=no"
		const wrapper = await kitchen("?station=bar")

		expect(wrapper.find('[data-test="filter-line"]').exists()).toBe(false)
	})

	it("keep the switch of the layout at the end of the filter line when the line is drawn, and lift it to row 1 when it is not", async () => {
		const withChips = await kitchen()
		expect(
			withChips
				.find('[data-test="filter-end"] [data-test="layout-switch"]')
				.exists(),
		).toBe(true)
		expect(rowOne(withChips).find('[data-test="layout-switch"]').exists()).toBe(
			false,
		)

		serve({ areas: [AREAS[0]] })
		document.cookie = "system_user=no"
		const bare = await kitchen("?station=bar")
		expect(bare.find('[data-test="filter-line"]').exists()).toBe(false)
		expect(rowOne(bare).find('[data-test="layout-switch"]').exists()).toBe(true)
	})
})

describe("the chip of what waits at the pass", () => {
	it("stands in row 1 now, not in the filter line", async () => {
		const wrapper = await kitchen()

		expect(rowOne(wrapper).find('[data-test="ready-chip"]').exists()).toBe(true)
		expect(
			wrapper
				.find('[data-test="filter-line"] [data-test="ready-chip"]')
				.exists(),
		).toBe(false)
	})

	it("is 44 px high like the other buttons of the row", async () => {
		const wrapper = await kitchen()

		expect(wrapper.get('[data-test="ready-chip"]').classes()).toContain("h-11")
	})
})
