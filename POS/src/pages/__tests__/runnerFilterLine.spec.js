/**
 * //// Neoffice — added file (no upstream equivalent). The runner's room filter and station filter are ONE line
 * //// (NeoRestau lot 1, task 9c): the rooms on the left, the stations on the right, each keeping its counts (the dishes
 * //// that are ready in each room, the dishes that are ready at each station). The counts of the rooms are those of
 * //// every room whichever room is chosen: the line is where the runner sees which room to go to.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	runnerEnabled: true,
	tillRestaurant: "The Bistro",
	fetchRestaurantSettings: async () => {},
}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
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

const { default: Runner } = await import("../Runner.vue")

const TABLES = "pos_next.api.restaurant.get_tables"
const RUNNER_ORDERS = "pos_next.api.restaurant.get_runner_orders"

const AREAS = [
	{ name: "r1", area_name: "Room 1" },
	{ name: "r2", area_name: "Room 2" },
	{ name: "r3", area_name: "Terrace" },
]

let created = 0
const dish = (id, station) => ({
	name: id,
	item_name: `Dish ${id}`,
	qty: 1,
	kds_status: "Ready",
	preparation_station: station,
	station_name: station === "bar" ? "Bar" : "Kitchen",
	station_color: station === "bar" ? "#2C4FA8" : "#D68A59",
})
function order(name, area, table, stations) {
	created += 1
	return {
		name,
		area,
		restaurant_table: `table-${table}`,
		table_display_name: table,
		kds_status: "Preparing",
		creation: `2026-10-30 12:00:${String(created).padStart(2, "0")}`,
		modified: `2026-10-30 12:00:${String(created).padStart(2, "0")}`,
		items: stations.map((station, index) => dish(`${name}-${index}`, station)),
	}
}
// Room 1: 3 dishes ready (2 in the kitchen, 1 at the bar); Room 2: 1; the Terrace: 3 (1 kitchen, 2 bar)
let ORDERS = []
function resetOrders() {
	created = 0
	ORDERS = [
		order("R1", "r1", "T1", ["kit", "kit"]),
		order("R2", "r1", "T2", ["bar"]),
		order("R3", "r2", "T5", ["kit"]),
		order("R4", "r3", "T9", ["kit", "bar", "bar"]),
	]
}

/** The server as the runner meets it: it cuts the answer to one room when it is asked for one. */
function serve() {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method === TABLES) return { areas: AREAS, tables: [], stations: [] }
		if (method === RUNNER_ORDERS)
			return params.area ? ORDERS.filter((o) => o.area === params.area) : ORDERS
		return []
	})
}

const Card = {
	props: ["card", "viewMode"],
	template: '<div class="card" :data-key="card.key">{{ card.title }}</div>',
}

let opened = []
async function open() {
	const wrapper = mount(Runner, {
		global: { stubs: { RunnerOrderCard: Card }, mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}

const askedOf = (method) =>
	call.mock.calls
		.filter(([name]) => name === method)
		.map(([, params]) => params)
const cards = (wrapper) => wrapper.findAll(".card").map((el) => el.text())
const chipTexts = (wrapper, group) =>
	wrapper
		.findAll(`[data-test="${group}"] button`)
		.map((chip) => chip.text().replace(/\s+/g, " "))
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

beforeEach(() => {
	localStorage.clear()
	opened = []
	resetOrders()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the runner's filters", () => {
	it("are ONE line: the rooms on the left, the stations on the right", async () => {
		const wrapper = await open()

		expect(wrapper.findAll('[data-test="filter-line"]')).toHaveLength(1)
		const line = wrapper.find('[data-test="filter-line"]')
		expect([...line.element.children].map((el) => el.dataset.test)).toEqual([
			"rooms",
			"stations",
		])
		// Neither "all rooms" nor "all" is anywhere else on the screen: no second bar
		const alls = wrapper
			.findAll("button")
			.filter((button) => /^All\b/.test(button.text()))
		expect(alls).toHaveLength(2)
		for (const button of alls) {
			expect(line.element.contains(button.element)).toBe(true)
		}
	})

	it("keep the ready count of each room and the ready count of each station", async () => {
		const wrapper = await open()

		expect(chipTexts(wrapper, "rooms")).toEqual([
			"All Areas",
			"Room 1 3",
			"Room 2 1",
			"Terrace 3",
		])
		expect(chipTexts(wrapper, "stations")).toEqual([
			"All (4)",
			"Bar 3✓",
			"Kitchen 4✓",
		])
	})
})

describe("choosing a room on the runner", () => {
	it("shows the cards of that room and remembers the room", async () => {
		const wrapper = await open()
		expect(cards(wrapper)).toEqual(["T1", "T2", "T5", "T9"])

		await choose(wrapper, "rooms", "Room 1")

		expect(cards(wrapper)).toEqual(["T1", "T2"])
		expect(localStorage.getItem("pos_runner_area")).toBe("r1")
		expect(chip(wrapper, "rooms", "Room 1").attributes("aria-pressed")).toBe(
			"true",
		)
	})

	it("keeps the count of every room on the line, not just the room chosen", async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Room 1")

		// The server is not asked to cut the answer to the room: the screen cuts it, and the other rooms keep their count
		expect(
			askedOf(RUNNER_ORDERS).every((params) => params.area === undefined),
		).toBe(true)
		expect(chipTexts(wrapper, "rooms")).toEqual([
			"All Areas",
			"Room 1 3",
			"Room 2 1",
			"Terrace 3",
		])
	})

	it("counts the orders and the ready dishes of the stations for the room chosen", async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Room 1")

		expect(chipTexts(wrapper, "stations")).toEqual([
			"All (2)",
			"Bar 1✓",
			"Kitchen 2✓",
		])
	})

	it('brings every card back under "all rooms"', async () => {
		const wrapper = await open()
		await choose(wrapper, "rooms", "Terrace")
		expect(cards(wrapper)).toEqual(["T9"])

		await choose(wrapper, "rooms", "All Areas")

		expect(cards(wrapper)).toEqual(["T1", "T2", "T5", "T9"])
		expect(localStorage.getItem("pos_runner_area")).toBe("")
	})
})

describe("choosing a station on the runner", () => {
	it("shows the dishes of that station, and takes it back when it is chosen again", async () => {
		const wrapper = await open()

		await choose(wrapper, "stations", "Bar")
		expect(cards(wrapper)).toEqual(["T2", "T9"])
		expect(chip(wrapper, "stations", "Bar").attributes("aria-pressed")).toBe(
			"true",
		)

		await choose(wrapper, "stations", "Bar")
		expect(cards(wrapper)).toEqual(["T1", "T2", "T5", "T9"])
	})

	it('cuts the cards of the room by the station, "all" shows every station again', async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Room 1")
		await choose(wrapper, "stations", "Kitchen")
		expect(cards(wrapper)).toEqual(["T1"])

		await choose(wrapper, "stations", "All")
		expect(cards(wrapper)).toEqual(["T1", "T2"])
	})
})

describe("the plan view of the runner", () => {
	it("keeps the rooms on the line and has no station to choose", async () => {
		const wrapper = await open()
		const plan = wrapper
			.findAll("button")
			.find((button) => button.text() === "Plan")

		await plan.trigger("click")
		await flushPromises()

		expect(wrapper.findAll('[data-test="filter-line"]')).toHaveLength(1)
		expect(wrapper.find('[data-test="rooms"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="stations"]').exists()).toBe(false)
	})
})
