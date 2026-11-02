/**
 * //// Neoffice — added file (no upstream equivalent). The switch between the restaurant's screens (NeoResto lot 1, task 38a-2, ruling 132). The
 * //// kitchen screen let its user hop from the bar to the kitchen and never to the runner, while the runner could go to either: the screen and the
 * //// filter were mixed. One segmented control, the same on both screens (Preparation, Runner, Floor plan), goes from one screen to another and the
 * //// filters ride along in the address, so that the bar's kitchen leads to the runner of the bar. A tablet paired for its screen keeps that one only.
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
function ticket(name, area, station, status) {
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
				item_name: `Dish of ${name}`,
				qty: 1,
				preparation_station: station,
				station_name: station === "bar" ? "Bar" : "Cuisine",
				station_color: "#4A6B8F",
				kds_status: status,
			},
		],
	}
}

let RUNNER_ORDERS = []
function serve() {
	call.mockReset()
	call.mockImplementation(async (method, params = {}) => {
		if (method.endsWith("get_preparation_stations")) return STATIONS
		if (method.endsWith("get_tables"))
			return { areas: AREAS, tables: [], stations: [] }
		if (method.endsWith("get_kds_orders")) return []
		if (method.endsWith("get_runner_orders")) return RUNNER_ORDERS
		return []
	})
}

let opened = []
let push
async function open(Screen, address) {
	window.history.replaceState({}, "", address)
	push = vi.fn()
	const wrapper = mount(Screen, {
		global: {
			stubs: {
				KDSOrderCard: true,
				RunnerOrderCard: {
					props: ["card"],
					template: '<div data-test="card">{{ card.title }}</div>',
				},
			},
			mocks: { __: globalThis.__, $router: { push } },
		},
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const kitchen = (query = "") => open(KDS, `/pos/kds${query}`)
const runner = (query = "") => open(Runner, `/pos/runner${query}`)
const switchOf = (wrapper) => wrapper.get('[data-test="screen-switch"]')
const labels = (wrapper) =>
	switchOf(wrapper)
		.findAll("button")
		.map((button) => button.text())
const press = async (wrapper, screen) => {
	await switchOf(wrapper).get(`[data-test="screen-${screen}"]`).trigger("click")
	await flushPromises()
}

beforeEach(() => {
	created = 0
	opened = []
	localStorage.clear()
	document.cookie = "system_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
	restaurantStore.runnerEnabled = true
	RUNNER_ORDERS = [
		ticket("R1", "r1", "kit", "Ready"),
		ticket("R2", "r1", "bar", "Ready"),
		ticket("R3", "r2", "bar", "Ready"),
	]
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	document.cookie = "system_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
})

describe.each([
	["kitchen", kitchen, "preparation"],
	["runner", runner, "runner"],
])("the %s screen's switch", (name, openIt, current) => {
	it("offers Preparation, Runner and Floor plan, the current screen lit", async () => {
		const wrapper = await openIt()

		expect(labels(wrapper)).toEqual(["Preparation", "Runner", "Floor plan"])
		const lit = switchOf(wrapper)
			.findAll("button")
			.filter((button) => button.attributes("aria-current") === "page")
		expect(lit).toHaveLength(1)
		expect(lit[0].attributes("data-test")).toBe(`screen-${current}`)
	})

	it("stands on row 1, beside the title", async () => {
		const wrapper = await openIt()

		expect(
			wrapper
				.get('[data-test="top-bar-row1"]')
				.element.contains(switchOf(wrapper).element),
		).toBe(true)
	})

	it("does nothing when the screen that is lit is pressed", async () => {
		const wrapper = await openIt()

		await press(wrapper, current)

		expect(push).not.toHaveBeenCalled()
	})

	it("is not drawn on a tablet signed in with its own account: it was paired for this screen and has no other", async () => {
		document.cookie = "system_user=no"
		const wrapper = await openIt()

		expect(wrapper.find('[data-test="screen-switch"]').exists()).toBe(false)
	})
})

describe("going from the kitchen", () => {
	it("to the runner keeps the filters: the bar's kitchen leads to the runner of the bar, in the room that is on", async () => {
		const wrapper = await kitchen("?station=bar&restaurant=The+Bistro&room=r2")

		await press(wrapper, "runner")

		expect(push).toHaveBeenCalledWith({
			path: "/runner",
			query: { restaurant: "The Bistro", station: "bar", room: "r2" },
		})
	})

	it("to the runner keeps « all »: no station is written when none is chosen", async () => {
		const wrapper = await kitchen()

		await press(wrapper, "runner")

		expect(push).toHaveBeenCalledWith({ path: "/runner", query: {} })
	})

	it("to the runner keeps a station or a room chosen on the chips, not only the ones of the address", async () => {
		const wrapper = await kitchen()
		await wrapper
			.findAll('[data-test="stations"] button')
			.find((chip) => chip.text().startsWith("Cuisine"))
			.trigger("click")
		await wrapper
			.findAll('[data-test="rooms"] button')
			.find((chip) => chip.text().startsWith("Room 1"))
			.trigger("click")
		await flushPromises()

		await press(wrapper, "runner")

		expect(push).toHaveBeenCalledWith({
			path: "/runner",
			query: { station: "kit", room: "r1" },
		})
	})

	it("to the floor plan goes to the till, where « back to POS » goes", async () => {
		const wrapper = await kitchen("?station=bar")

		await press(wrapper, "plan")

		expect(push).toHaveBeenCalledWith({ path: "/" })
	})

	it("does not offer the runner when the restaurant has switched it off", async () => {
		restaurantStore.runnerEnabled = false
		const wrapper = await kitchen()

		expect(labels(wrapper)).toEqual(["Preparation", "Floor plan"])
	})
})

describe("going from the runner", () => {
	it("to the preparation keeps the filters", async () => {
		const wrapper = await runner("?station=kit&room=r1")

		await press(wrapper, "preparation")

		expect(push).toHaveBeenCalledWith({
			path: "/kds",
			query: { station: "kit", room: "r1" },
		})
	})
})

describe("what a screen does with the filters in its address", () => {
	it("shows the runner of the station named in the address, and lights its chip", async () => {
		const wrapper = await runner("?station=bar")

		const cards = wrapper
			.findAll('[data-test="card"]')
			.map((card) => card.text())
		// Two tickets have a dish at the bar; the one of the kitchen alone is not shown
		expect(cards).toEqual(["T-R2", "T-R3"])
		const chips = wrapper.findAll('[data-test="stations"] button')
		expect(
			chips
				.find((chip) => chip.text().startsWith("Bar"))
				.attributes("aria-pressed"),
		).toBe("true")
	})

	it("shows the runner of the room named in the address, over the room the device remembers", async () => {
		localStorage.setItem("pos_runner_area", "r2")
		const wrapper = await runner("?room=r1")

		const cards = wrapper
			.findAll('[data-test="card"]')
			.map((card) => card.text())
		expect(cards).toEqual(["T-R1", "T-R2"])
		expect(wrapper.get('[data-test="page-heading"]').text()).toBe(
			"Runner · Room 1",
		)
	})

	it("opens the kitchen on the room named in the address, over the room the device remembers", async () => {
		localStorage.setItem("pos_kds_area", "r2")
		const wrapper = await kitchen("?room=r1")

		const chip = wrapper
			.findAll('[data-test="rooms"] button')
			.find((button) => button.text().startsWith("Room 1"))
		expect(chip.attributes("aria-pressed")).toBe("true")
	})
})

describe("the runner's own modes", () => {
	it("are named as modes of the screen, By Table, By Station and On the plan, and none of them is called Plan", async () => {
		const wrapper = await runner()

		const modes = wrapper
			.get('[data-test="view-switch"]')
			.findAll("button")
			.map((button) => button.text())
		expect(modes).toEqual(["By Table", "By Station", "On the plan"])
		expect(
			wrapper.findAll("button").some((button) => button.text() === "Plan"),
		).toBe(false)
	})

	it("light the mode in use and change it when another is pressed", async () => {
		const wrapper = await runner()
		const pressed = () =>
			wrapper
				.get('[data-test="view-switch"]')
				.findAll("button")
				.filter((button) => button.attributes("aria-pressed") === "true")
				.map((button) => button.attributes("data-test"))

		expect(pressed()).toEqual(["view-table"])
		await wrapper.get('[data-test="view-station"]').trigger("click")
		expect(pressed()).toEqual(["view-station"])
	})
})
