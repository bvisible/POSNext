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
// What the runner's "new ready dishes" beep opens: one AudioContext per beep, so a count of them is a count of beeps
const beeps = vi.hoisted(() => ({ count: 0 }))
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

// The tables of two rooms, for the plan view
const PLAN_TABLES = [
	{ name: "table-T1", table_name: "T1", area: "r1", pos_x: 10, pos_y: 10 },
	{ name: "table-T5", table_name: "T5", area: "r2", pos_x: 10, pos_y: 10 },
]

/**
 * The server as the runner meets it: it cuts the answer to one room when it is asked for one. `rooms: "fails"` is a
 * restaurant whose rooms cannot be read; `gate` is a promise the rooms wait for (the orders are there before them).
 */
function serve({ rooms = "ok", gate = null } = {}) {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method === TABLES) {
			if (gate) await gate
			if (rooms === "fails") throw new Error("no rooms")
			return { areas: AREAS, tables: PLAN_TABLES, stations: [] }
		}
		if (method === RUNNER_ORDERS)
			return params.area ? ORDERS.filter((o) => o.area === params.area) : ORDERS
		return []
	})
}

class FakeAudioContext {
	constructor() {
		beeps.count += 1
	}
	createOscillator() {
		return { connect() {}, start() {}, stop() {}, frequency: {} }
	}
	createGain() {
		return { connect() {}, gain: { exponentialRampToValueAtTime() {} } }
	}
	get destination() {
		return {}
	}
	get currentTime() {
		return 0
	}
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

/** A promise that a test releases when it chooses: the rooms answer after the orders. */
function deferred() {
	let release
	const promise = new Promise((resolve) => {
		release = resolve
	})
	return { promise, release: () => release() }
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

const refresh = async (wrapper) => {
	await wrapper
		.findAll("button")
		.find((button) => button.text() === "Refresh")
		.trigger("click")
	await flushPromises()
}

beforeEach(() => {
	localStorage.clear()
	opened = []
	beeps.count = 0
	window.AudioContext = FakeAudioContext
	resetOrders()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	window.AudioContext = undefined
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

describe("the counts of the runner", () => {
	it("are the runner's own: a green pill for the dishes ready in a room, a pill of the station's colour with a tick for a station", async () => {
		const wrapper = await open()

		// The runner counts what is READY, and says so in green, the colour of its Ready badges: that meaning is the
		// runner's to give (the kitchen counts open tickets, and has no green for that)
		const rooms = wrapper.findAll('[data-test="room-count"]')
		expect(rooms.map((count) => count.text())).toEqual(["3", "1", "3"])
		for (const count of rooms) {
			expect(count.classes()).toEqual(
				expect.arrayContaining(["bg-green-500", "text-white", "rounded-full"]),
			)
		}
		const stations = wrapper.findAll('[data-test="station-count"]')
		expect(stations.map((count) => count.text())).toEqual(["3✓", "4✓"])
		expect(stations[0].attributes("style")).toContain("rgb(44, 79, 168)")
		expect(stations[1].attributes("style")).toContain("rgb(214, 138, 89)")
		for (const count of stations)
			expect(count.classes()).not.toContain("bg-green-500")
	})

	it("show nothing on a room or a station that has no dish ready", async () => {
		ORDERS = ORDERS.filter((o) => o.name !== "R3")

		const wrapper = await open()

		expect(chipTexts(wrapper, "rooms")).toEqual([
			"All Areas",
			"Room 1 3",
			"Room 2",
			"Terrace 3",
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

	it("does not read the orders again: the screen cuts the list to the room itself", async () => {
		const wrapper = await open()
		const reads = askedOf(RUNNER_ORDERS).length

		await choose(wrapper, "rooms", "Room 1")
		await choose(wrapper, "rooms", "Terrace")
		await choose(wrapper, "rooms", "All Areas")

		expect(askedOf(RUNNER_ORDERS)).toHaveLength(reads)
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

describe("the beep for new ready dishes", () => {
	const orderReadyIn = (name, area, table) => order(name, area, table, ["kit"])

	it("is not rung by choosing another room, nor by the read that follows: only the same scope is compared", async () => {
		const wrapper = await open()

		// Room 2 has 1 dish ready, the Terrace 3: the counts of two scopes, never compared with one another
		await choose(wrapper, "rooms", "Room 2")
		await refresh(wrapper)
		await choose(wrapper, "rooms", "Terrace")
		await refresh(wrapper)
		await choose(wrapper, "rooms", "Room 1")
		await refresh(wrapper)
		await choose(wrapper, "rooms", "All Areas")
		await refresh(wrapper)

		expect(beeps.count).toBe(0)
	})

	it("is not rung by choosing another station either, nor by showing the dishes already delivered", async () => {
		const wrapper = await open()

		await choose(wrapper, "stations", "Bar")
		await refresh(wrapper)
		await choose(wrapper, "stations", "Kitchen")
		await refresh(wrapper)
		const completed = wrapper.find("input[type=checkbox]")
		await completed.setValue(true)
		await refresh(wrapper)

		expect(beeps.count).toBe(0)
	})

	it("is rung when a dish becomes ready in the scope that is on the screen", async () => {
		const wrapper = await open()
		await choose(wrapper, "rooms", "Room 1")
		await refresh(wrapper)
		expect(beeps.count).toBe(0)

		ORDERS = [...ORDERS, orderReadyIn("R5", "r1", "T3")]
		await refresh(wrapper)

		expect(beeps.count).toBe(1)
	})

	it("is not rung by a dish that becomes ready in another room than the one on the screen", async () => {
		const wrapper = await open()
		await choose(wrapper, "rooms", "Room 1")
		await refresh(wrapper)

		ORDERS = [...ORDERS, orderReadyIn("R5", "r3", "T10")]
		await refresh(wrapper)

		expect(beeps.count).toBe(0)
		// ... and it is rung under "all rooms", where that dish is on the screen
		await choose(wrapper, "rooms", "All Areas")
		ORDERS = [...ORDERS, orderReadyIn("R6", "r3", "T11")]
		await refresh(wrapper)
		expect(beeps.count).toBe(1)
	})
})

describe("the room remembered by the runner", () => {
	it("opens the runner on that room, with its chip chosen", async () => {
		localStorage.setItem("pos_runner_area", "r3")

		const wrapper = await open()

		expect(cards(wrapper)).toEqual(["T9"])
		expect(chip(wrapper, "rooms", "Terrace").attributes("aria-pressed")).toBe(
			"true",
		)
		expect(chip(wrapper, "rooms", "All Areas").attributes("aria-pressed")).toBe(
			"false",
		)
	})

	it("is dropped when the restaurant has no such room (deleted, or of another restaurant): every card shows, 'all rooms' is chosen", async () => {
		localStorage.setItem("pos_runner_area", "a-room-of-another-restaurant")

		const wrapper = await open()

		expect(cards(wrapper)).toEqual(["T1", "T2", "T5", "T9"])
		const pressed = wrapper
			.findAll('[data-test="rooms"] button')
			.filter((button) => button.attributes("aria-pressed") === "true")
			.map((button) => button.text())
		expect(pressed).toEqual(["All Areas"])
		// The stations count the same orders as the cards
		expect(chipTexts(wrapper, "stations")[0]).toBe("All (4)")
	})

	it("hides no card when the rooms cannot be read at all", async () => {
		localStorage.setItem("pos_runner_area", "r1")
		serve({ rooms: "fails" })
		const error = vi.spyOn(console, "error").mockImplementation(() => {})

		const wrapper = await open()

		expect(cards(wrapper)).toEqual(["T1", "T2", "T5", "T9"])
		expect(wrapper.find('[data-test="rooms"]').exists()).toBe(false)
		error.mockRestore()
	})

	it("waits for the rooms rather than flash every room's cards", async () => {
		localStorage.setItem("pos_runner_area", "r3")
		const gate = deferred()
		serve({ gate: gate.promise })

		const wrapper = await open()
		// The orders are in, the rooms are not: no card of another room shows, a spinner does
		expect(cards(wrapper)).toEqual([])
		expect(wrapper.find(".animate-spin").exists()).toBe(true)

		gate.release()
		await flushPromises()
		expect(cards(wrapper)).toEqual(["T9"])
		expect(wrapper.find(".animate-spin").exists()).toBe(false)
	})

	it("is not the room the plan view opens on when it no longer exists: the first room is", async () => {
		localStorage.setItem("pos_runner_area", "a-room-that-is-gone")
		const wrapper = await open()

		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Plan")
			.trigger("click")
		await flushPromises()

		expect(wrapper.text()).not.toContain("No tables in this area")
		expect(wrapper.text()).toContain("T1")
		expect(wrapper.text()).not.toContain("T5")
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
