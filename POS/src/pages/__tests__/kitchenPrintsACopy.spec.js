/**
 * //// Neoffice — added file (no upstream equivalent). The printer button on the kitchen screen and on the runner screen (NeoResto lot 1, task 44), through the real
 * //// pages, bands and cards, with a fake server that only answers: the kitchen's button is drawn on the tickets whose station has a printer (the server says which
 * //// have one), the runner's only once its setting is switched on; one tap asks the SERVER to print a copy on the printer of the station the screen is opened on,
 * //// once; a station that turns out to have no printer loses its button; the choices (the button, what prints, the COPY mark) are the device's, made from the
 * //// screen's top bar.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const server = vi.hoisted(() => ({ printers: [], print: null, fail: null }))
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
	Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: KDS } = await import("../KDS.vue")
const { default: Runner } = await import("../Runner.vue")
const { forgetStationsWithoutPrinter } = await import("@/utils/kitchenCopy")

const STATIONS = [
	{ name: "grill", station_name: "Grill", color: "#F55D1A", use_runner: 0 },
	{ name: "bar", station_name: "Bar", color: "#4A6B8F", use_runner: 0 },
]
// The state of a ticket's button is kept by the order's name, for as long as the page lives: each test has orders of its own
let run = 0
const id = (name) => `${name}-${run}`
const kitchenOrder = (name, station, minute) => ({
	name: id(name),
	area: "",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Pending",
	creation: `2026-10-30 12:${minute}:00`,
	modified: `2026-10-30 12:${minute}:00`,
	items: [
		{ name: `${name}-0`, item_code: "X", item_name: "Dish", qty: 1, kds_status: "Pending", kds_batch: 1, preparation_station: station, station_name: station },
	],
})
const runnerOrder = (name, station, minute) => ({
	...kitchenOrder(name, station, minute),
	kds_status: "Ready",
	items: [
		{ name: `${name}-0`, item_name: "Dish", qty: 1, kds_status: "Ready", preparation_station: station, station_name: station, station_color: "#4A6B8F" },
	],
})

function serve() {
	call.mockReset()
	call.mockImplementation(async (method, args) => {
		const name = method.split(".").pop()
		if (name === "get_kds_orders")
			return [kitchenOrder("A", "grill", "00"), kitchenOrder("B", "bar", "01")].filter(
				(order) => !args.station || order.items.some((item) => item.preparation_station === args.station),
			)
		if (name === "get_runner_orders")
			return [runnerOrder("A", "grill", "00"), runnerOrder("B", "bar", "01")]
		if (name === "get_tables") return { areas: [], tables: [], stations: [] }
		if (name === "get_preparation_stations") return STATIONS
		if (name === "kitchen_copy_stations") return { stations: server.printers }
		if (name === "print_kitchen_copy") {
			if (server.fail) throw server.fail
			return (
				server.print || {
					printed: true,
					tickets: [{ station: args.station || "grill", job_token: "job-1", printer: "Kitchen", printer_online: true }],
					no_printer: [],
					valid_minutes: 15,
					duplicate: false,
				}
			)
		}
		if (name === "kitchen_copy_status") return { status: "Pending", printer_online: true, reason: "" }
		return []
	})
}
const named = (name) => call.mock.calls.filter(([method]) => method.endsWith(name))

let opened = []
async function openKitchen(search = "") {
	window.history.replaceState({}, "", `/pos/kds${search}`)
	const wrapper = mount(KDS, { global: { mocks: { __: globalThis.__, $router: { push: vi.fn() } } }, attachTo: document.body })
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
async function openRunner(search = "") {
	window.history.replaceState({}, "", `/pos/runner${search}`)
	const wrapper = mount(Runner, { global: { mocks: { __: globalThis.__, $router: { push: vi.fn() } } }, attachTo: document.body })
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
beforeEach(() => {
	run += 1
	opened = []
	localStorage.clear()
	server.printers = []
	server.print = null
	server.fail = null
	forgetStationsWithoutPrinter()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

const buttons = (wrapper) => wrapper.findAll('[data-test="ticket-print"]')
const ticketOf = (wrapper, table) =>
	wrapper.findAll('[data-test="ticket"]').find((ticket) => ticket.text().includes(table))

describe("the kitchen screen's printer button", () => {
	it("is not drawn, nor its settings, while no station has a printer", async () => {
		const wrapper = await openKitchen()

		expect(buttons(wrapper)).toHaveLength(0)
		expect(wrapper.find('[data-test="print-copy-settings"]').exists()).toBe(false)
		expect(named("kitchen_copy_stations")[0][1]).toMatchObject({ screen: "Kitchen", restaurant: "The Bistro" })
	})

	it("is drawn beside the main button of the tickets that have a dish at a station with a printer, and only of those", async () => {
		server.printers = ["grill"]
		const wrapper = await openKitchen()

		expect(buttons(wrapper)).toHaveLength(1)
		const mine = ticketOf(wrapper, "T-A")
		const names = [...mine.get('[data-test="ticket-actions"]').element.children].map((element) => element.getAttribute("data-test"))
		expect(names).toEqual(["ticket-main", "ticket-print"])
		expect(ticketOf(wrapper, "T-B").find('[data-test="ticket-print"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="print-copy-settings"]').exists()).toBe(true)
	})

	it("follows the station the screen is opened on: the printer of THAT station", async () => {
		server.printers = ["grill"]

		const atTheBar = await openKitchen("?station=bar")
		expect(buttons(atTheBar)).toHaveLength(0)
		atTheBar.unmount()

		const atTheGrill = await openKitchen("?station=grill")
		expect(buttons(atTheGrill)).toHaveLength(1)
	})

	it("is gone where the device switched it off, and the settings stay to switch it on again", async () => {
		server.printers = ["grill"]
		localStorage.setItem("pos_print_copy_kitchen_print_button", "0")
		const wrapper = await openKitchen()

		expect(buttons(wrapper)).toHaveLength(0)
		expect(wrapper.find('[data-test="print-copy-settings"]').exists()).toBe(true)

		await wrapper.get('[data-test="print-copy-settings"]').trigger("click")
		await wrapper.get('[data-test="print-copy-button"]').trigger("click")
		expect(buttons(wrapper)).toHaveLength(1)
		expect(localStorage.getItem("pos_print_copy_kitchen_print_button")).toBe("1")
	})

	it("asks the SERVER for a copy on a tap, once, for the ticket's order and the screen's station, and says it is printing", async () => {
		server.printers = ["grill"]
		const wrapper = await openKitchen("?station=grill")

		await buttons(wrapper)[0].trigger("click")
		await buttons(wrapper)[0].trigger("click")
		await flushPromises()

		const sent = named("print_kitchen_copy")
		expect(sent).toHaveLength(1)
		expect(sent[0][0]).toBe("pos_next.api.kitchen_events.print_kitchen_copy")
		expect(sent[0][1]).toEqual({ invoice: id("A"), screen: "Kitchen", station: "grill", whole_order: 0, mark_copy: 1 })
		expect(buttons(wrapper)[0].attributes("data-print-state")).toBe("printing")
		expect(wrapper.get('[data-test="ticket-print-state"]').text()).toBe("Printing…")
	})

	it("sends the settings the device chose from the top bar: the whole order, and no COPY mark", async () => {
		server.printers = ["grill"]
		const wrapper = await openKitchen("?station=grill")

		await wrapper.get('[data-test="print-copy-settings"]').trigger("click")
		await wrapper.get('[data-test="print-copy-scope"]').setValue("order")
		await wrapper.get('[data-test="print-copy-mark"]').trigger("click")
		await buttons(wrapper)[0].trigger("click")
		await flushPromises()

		expect(named("print_kitchen_copy")[0][1]).toMatchObject({ whole_order: 1, mark_copy: 0 })
		expect(localStorage.getItem("pos_print_copy_print_scope")).toBe("order")
		expect(localStorage.getItem("pos_print_copy_mark_copy")).toBe("0")
	})

	it("loses its button for a station the server says has no printer after all", async () => {
		server.printers = ["grill"]
		server.print = { printed: false, tickets: [], no_printer: ["grill"], valid_minutes: 0, duplicate: false }
		const wrapper = await openKitchen("?station=grill")

		await buttons(wrapper)[0].trigger("click")
		await flushPromises()

		expect(buttons(wrapper)).toHaveLength(0)
	})

	it("says why when the server refuses, and keeps its button", async () => {
		server.printers = ["grill"]
		server.fail = { exc_type: "PermissionError", messages: [{ message: "Not permitted" }] }
		const wrapper = await openKitchen("?station=grill")

		await buttons(wrapper)[0].trigger("click")
		await flushPromises()

		expect(buttons(wrapper)).toHaveLength(1)
		expect(wrapper.get('[data-test="ticket-print-state"]').text()).toBe("Not printed: Not permitted")
	})
})

describe("the runner screen's printer button", () => {
	it("is OFF to begin with, although the station has a printer; its settings are there to switch it on", async () => {
		server.printers = ["grill"]
		const wrapper = await openRunner()

		expect(buttons(wrapper)).toHaveLength(0)
		expect(named("kitchen_copy_stations")[0][1]).toMatchObject({ screen: "Runner" })

		await wrapper.get('[data-test="print-copy-settings"]').trigger("click")
		const toggle = wrapper.get('[data-test="print-copy-button"]')
		expect(toggle.attributes("aria-label")).toBe("Print button on the runner screen")
		expect(toggle.attributes("aria-checked")).toBe("false")
		await toggle.trigger("click")

		expect(buttons(wrapper)).toHaveLength(1)
		expect(localStorage.getItem("pos_print_copy_runner_print_button")).toBe("1")
	})

	it("is drawn beside « Deliver » of the tickets whose station has a printer once it is switched on", async () => {
		server.printers = ["grill"]
		localStorage.setItem("pos_print_copy_runner_print_button", "1")
		const wrapper = await openRunner()

		const cards = wrapper.findAll('[data-test="runner-ticket"]')
		expect(cards).toHaveLength(2)
		expect(buttons(wrapper)).toHaveLength(1)
		const names = [...buttons(wrapper)[0].element.parentElement.children].map((element) => element.getAttribute("data-test"))
		expect(names).toEqual(["ticket-main", "ticket-print"])
	})

	it("asks the SERVER for a copy on a tap, once, with the runner's screen", async () => {
		server.printers = ["grill"]
		localStorage.setItem("pos_print_copy_runner_print_button", "1")
		const wrapper = await openRunner()

		await buttons(wrapper)[0].trigger("click")
		await buttons(wrapper)[0].trigger("click")
		await flushPromises()

		const sent = named("print_kitchen_copy")
		expect(sent).toHaveLength(1)
		expect(sent[0][1]).toEqual({ invoice: id("A"), screen: "Runner", whole_order: 0, mark_copy: 1 })
		expect(named("mark_items_delivered")).toHaveLength(0)
	})

	it("has no button on a station with no printer, and no settings while no station has one", async () => {
		localStorage.setItem("pos_print_copy_runner_print_button", "1")
		const wrapper = await openRunner()

		expect(buttons(wrapper)).toHaveLength(0)
		expect(wrapper.find('[data-test="print-copy-settings"]').exists()).toBe(false)
	})
})
