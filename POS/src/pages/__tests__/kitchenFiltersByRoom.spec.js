/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen gets the room filter the runner has (NeoRestau
 * //// lot 1, task 9c): the same rooms, from the same read, on the same single line as its stations, with the same
 * //// behaviour. A room shows the tickets of that room's tables; "all rooms" shows everything, takeaway orders
 * //// included (they sit at no table, so they belong to no room).
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

const { default: KDS } = await import("../KDS.vue")

const TABLES = "pos_next.api.restaurant.get_tables"
const STATIONS_READ = "pos_next.api.restaurant.get_preparation_stations"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"

const AREAS = [
	{ name: "r1", area_name: "Room 1" },
	{ name: "r2", area_name: "Room 2" },
	{ name: "r3", area_name: "Terrace" },
	{ name: "r4", area_name: "Garden" },
]
const STATIONS = [
	{ name: "bar", station_name: "Bar", color: "#2C4FA8" },
	{ name: "kit", station_name: "Kitchen", color: "#D68A59" },
]

let created = 0
function ticket(name, area, stations, extra = {}) {
	created += 1
	return {
		name,
		area,
		restaurant_table: area ? `table-${name}` : null,
		table_display_name: area ? `T-${name}` : null,
		kds_status: "Pending",
		creation: `2026-10-30 12:00:${String(created).padStart(2, "0")}`,
		modified: `2026-10-30 12:00:${String(created).padStart(2, "0")}`,
		items: stations.map((station, index) => ({
			name: `${name}-${index}`,
			item_name: "Dish",
			qty: 1,
			preparation_station: station,
			station_name: station,
			kds_status: "Pending",
		})),
		...extra,
	}
}
// Two tickets in Room 1, one in Room 2, one on the Terrace, and a takeaway order that sits at no table
let ORDERS = []
function resetOrders() {
	created = 0
	ORDERS = [
		ticket("A1", "r1", ["kit"]),
		ticket("A2", "r1", ["bar", "kit"]),
		ticket("B1", "r2", ["kit"]),
		ticket("T1", "r3", ["bar"]),
		ticket("TAKE", "", ["kit"], { is_takeaway: 1, takeaway_number: "T-001" }),
	]
}

/** The server as the screen meets it: the rooms, the stations and the orders (cut to one station when it is asked). */
function serve({ areas = AREAS, rooms = "ok" } = {}) {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method === STATIONS_READ) return STATIONS
		if (method === TABLES) {
			if (rooms === "fails") throw new Error("no rooms")
			return { areas, tables: [], stations: [] }
		}
		if (method === KDS_ORDERS) {
			if (!params.station) return ORDERS
			return ORDERS.map((order) => ({
				...order,
				items: order.items.filter(
					(item) => item.preparation_station === params.station,
				),
			})).filter((order) => order.items.length)
		}
		return []
	})
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
		global: {
			stubs: { KDSOrderCard: Ticket },
			mocks: { __: globalThis.__ },
		},
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}

const askedOf = (method) =>
	call.mock.calls
		.filter(([name]) => name === method)
		.map(([, params]) => params)
const shown = (wrapper) =>
	wrapper.findAll(".ticket").map((el) => el.attributes("data-name"))
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
	restaurantStore.tillRestaurant = "The Bistro"
	opened = []
	resetOrders()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the rooms of the kitchen screen", () => {
	it("come from the read the runner takes its own from, for the restaurant of the screen", async () => {
		await open()

		const asked = askedOf(TABLES)
		expect(asked).toHaveLength(1)
		expect(asked[0].restaurant).toBe("The Bistro")
	})

	it("are read for the restaurant named in the address of the screen, as its orders are", async () => {
		await open("?restaurant=The%20Bar")

		expect(askedOf(TABLES).map((params) => params.restaurant)).toEqual([
			"The Bar",
		])
		expect(
			askedOf(KDS_ORDERS).every((params) => params.restaurant === "The Bar"),
		).toBe(true)
	})

	it("are read for the restaurant of the station when a bookmark names a station alone", async () => {
		restaurantStore.tillRestaurant = "The Bistro"
		call.mockImplementation(async (method, params = {}) => {
			if (method === STATIONS_READ)
				return [{ ...STATIONS[0], restaurant: "The Bar" }]
			if (method === TABLES) return { areas: AREAS, tables: [], stations: [] }
			if (method === KDS_ORDERS) return ORDERS
			return []
		})
		await open("?station=bar")

		expect(askedOf(TABLES).map((params) => params.restaurant)).toEqual([
			"The Bar",
		])
	})

	it("sit on the one line of the stations: the rooms on the left, the stations on the right", async () => {
		const wrapper = await open()

		expect(wrapper.findAll('[data-test="filter-line"]')).toHaveLength(1)
		expect(chipTexts(wrapper, "rooms")).toEqual([
			"All Areas",
			"Room 1 2",
			"Room 2 1",
			"Terrace 1",
			"Garden",
		])
		expect(chipTexts(wrapper, "stations")).toEqual([
			"All (5)",
			"Bar 2",
			"Kitchen 4",
		])
		const line = wrapper.find('[data-test="filter-line"]')
		expect([...line.element.children].map((el) => el.dataset.test)).toEqual([
			"rooms",
			"stations",
		])
	})
})

describe("choosing a room on the kitchen screen", () => {
	it('shows every ticket under "all rooms", the takeaway orders included', async () => {
		const wrapper = await open()

		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])
		expect(chip(wrapper, "rooms", "All Areas").attributes("aria-pressed")).toBe(
			"true",
		)
	})

	it("shows the tickets of the tables of that room, and no other", async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Room 1")
		expect(shown(wrapper)).toEqual(["A1", "A2"])

		await choose(wrapper, "rooms", "Terrace")
		expect(shown(wrapper)).toEqual(["T1"])
	})

	it('brings every ticket back under "all rooms"', async () => {
		const wrapper = await open()
		await choose(wrapper, "rooms", "Room 2")
		expect(shown(wrapper)).toEqual(["B1"])

		await choose(wrapper, "rooms", "All Areas")

		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])
	})

	it("counts the active orders and the tickets of each station for the room chosen", async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Room 1")

		expect(chipTexts(wrapper, "stations")).toEqual([
			"All (2)",
			"Bar 1",
			"Kitchen 2",
		])
		expect(wrapper.find("header").text()).toContain("Active Orders: 2")
		// The counts of the rooms stay those of every room: the line still says where the tickets are
		expect(chipTexts(wrapper, "rooms")).toEqual([
			"All Areas",
			"Room 1 2",
			"Room 2 1",
			"Terrace 1",
			"Garden",
		])
	})

	it("keeps the station filter on top of the room: the server is still asked for the station", async () => {
		const wrapper = await open()

		await choose(wrapper, "stations", "Kitchen")
		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "TAKE"])
		expect(askedOf(KDS_ORDERS).some((params) => params.station === "kit")).toBe(
			true,
		)

		await choose(wrapper, "rooms", "Room 1")
		expect(shown(wrapper)).toEqual(["A1", "A2"])

		await choose(wrapper, "stations", "Bar")
		expect(shown(wrapper)).toEqual(["A2"])
	})

	it('takes a station back when it is chosen again, and "all" shows every station', async () => {
		const wrapper = await open()
		await choose(wrapper, "stations", "Bar")
		expect(shown(wrapper)).toEqual(["A2", "T1"])

		await choose(wrapper, "stations", "Bar")
		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])

		await choose(wrapper, "stations", "Kitchen")
		await choose(wrapper, "stations", "All")
		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])
	})

	it("says there is nothing to cook when the room has no ticket, and keeps the line to leave it", async () => {
		const wrapper = await open()

		await choose(wrapper, "rooms", "Garden")

		expect(shown(wrapper)).toEqual([])
		expect(wrapper.text()).toContain("No Active Orders")
		expect(wrapper.find('[data-test="filter-line"]').exists()).toBe(true)
		await choose(wrapper, "rooms", "All Areas")
		expect(shown(wrapper)).toHaveLength(5)
	})

	it("still opens on the station of a bookmark", async () => {
		const wrapper = await open("?station=bar")

		expect(chip(wrapper, "stations", "Bar").attributes("aria-pressed")).toBe(
			"true",
		)
		expect(askedOf(KDS_ORDERS).some((params) => params.station === "bar")).toBe(
			true,
		)
	})
})

describe("the room remembered by the kitchen screen", () => {
	it("is kept for the next time the screen opens", async () => {
		const first = await open()
		await choose(first, "rooms", "Terrace")
		expect(localStorage.getItem("pos_kds_area")).toBe("r3")

		const second = await open()

		expect(shown(second)).toEqual(["T1"])
		expect(chip(second, "rooms", "Terrace").attributes("aria-pressed")).toBe(
			"true",
		)
	})

	it("is dropped when the restaurant no longer has that room: the screen never goes blank", async () => {
		localStorage.setItem("pos_kds_area", "deleted-room")

		const wrapper = await open()

		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])
		expect(chip(wrapper, "rooms", "All Areas").attributes("aria-pressed")).toBe(
			"true",
		)
	})

	it("hides no ticket when the rooms cannot be read at all", async () => {
		localStorage.setItem("pos_kds_area", "r1")
		serve({ rooms: "fails" })
		const error = vi.spyOn(console, "error").mockImplementation(() => {})

		const wrapper = await open()

		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])
		expect(wrapper.find('[data-test="rooms"]').exists()).toBe(false)
		// The stations are still there to choose from
		expect(chipTexts(wrapper, "stations")).toEqual([
			"All (5)",
			"Bar 2",
			"Kitchen 4",
		])
		error.mockRestore()
	})

	it("offers no room filter to a restaurant that has no room", async () => {
		serve({ areas: [] })

		const wrapper = await open()

		expect(wrapper.find('[data-test="rooms"]').exists()).toBe(false)
		expect(shown(wrapper)).toEqual(["A1", "A2", "B1", "T1", "TAKE"])
	})
})
