/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's last action follows the station's runner setting (NeoRestau
 * //// lot 1, task 38a-1, ruling 112), with the real cards.
 * ////
 * //// WITH a runner (the default of a station) a dish that is "Ready" LEAVES the kitchen screen: it took room on every ticket, and
 * //// it is the runner's now. The chip "to deliver (N)" keeps its count in view and opens the list of those dishes, from which a
 * //// dish can be called back to preparation. WITHOUT a runner (a small bistro: the cook walks the plate to the table) a dish being
 * //// prepared has ONE button, "Deliver", which does "ready" and "delivered" in one gesture, and the ticket leaves at once.
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
const { useRunnerTickets } = await import("@/composables/useRunnerTickets")

const TABLES = "pos_next.api.restaurant.get_tables"
const STATIONS_READ = "pos_next.api.restaurant.get_preparation_stations"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"
const UPDATE_ORDER = "pos_next.api.restaurant.update_kds_status"
const UPDATE_ITEM = "pos_next.api.restaurant.update_item_kds_status"

const AREAS = [{ name: "r1", area_name: "Room 1" }]
let STATIONS = []
let ORDERS = []

const station = (name, runner) => ({
	name,
	station_name: name,
	color: "#2C4FA8",
	...(runner === undefined ? {} : { use_runner: runner }),
})
function ticket(name, dishes, extra = {}) {
	return {
		name,
		area: "r1",
		restaurant_table: `table-${name}`,
		table_display_name: `T-${name}`,
		kds_status: "Preparing",
		creation: "2026-10-30 11:00:00.000000",
		modified: "2026-10-30 12:00:00.000000",
		items: dishes.map(([status, stationName = "kit", code], index) => ({
			name: `${name}-${index}`,
			item_code: code || `${name}-ITEM-${index}`,
			item_name: `${name} dish ${index + 1}`,
			qty: 1,
			kds_status: status,
			preparation_station: stationName,
			station_name: stationName,
		})),
		...extra,
	}
}

function serve() {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method === STATIONS_READ) return STATIONS
		if (method === TABLES) return { areas: AREAS, tables: [], stations: [] }
		if (method === KDS_ORDERS) return ORDERS
		return { status: "success" }
	})
}

let opened = []
async function open() {
	window.history.replaceState({}, "", "/pos/kds")
	const wrapper = mount(KDS, {
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
beforeEach(() => {
	opened = []
	restaurantStore.runnerEnabled = true
	STATIONS = [station("kit", 1), station("bar", 0)]
	localStorage.clear()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	// The device's choice is one value for the page, kept between mounts: put it back
	useRunnerTickets().setShowRunnerTickets(true)
})

// A band with no ticket is not drawn (Daniel, 01.11): what it holds is nothing
const titlesIn = (wrapper, band) =>
	wrapper
		.findAll(`[data-test="band-${band}"] [data-test="ticket-title"]`)
		.map((el) => el.text())
const linesOf = (wrapper) =>
	wrapper.findAll('[data-test="ticket-line"]').map((el) => el.text())
const countOnChip = (wrapper) => wrapper.get('[data-test="ready-count"]').text()
const mainButtons = (wrapper) =>
	wrapper
		.findAll('[data-test="ticket"]')
		.map((card) => card.find('[data-test="ticket-main"]').text())

describe("with a runner", () => {
	it("a Ready dish stays on the ticket, struck through: the cook still sees what was sent, and what is left to cook is the cook's", async () => {
		ORDERS = [
			ticket("A", [
				["Ready", "kit", "SOUP"],
				["Preparing", "kit", "STEAK"],
			]),
		]
		const wrapper = await open()

		expect(titlesIn(wrapper, "production")).toEqual(["T-A"])
		expect(linesOf(wrapper).join(" ")).toContain("A dish 1")
		expect(linesOf(wrapper).join(" ")).toContain("A dish 2")
		const lineOf = (name) =>
			wrapper.findAll('[data-test="ticket-line"]').find((line) => line.text().includes(name))
		const sent = lineOf("A dish 1")
		const toCook = lineOf("A dish 2")
		// The dish at the pass is struck through and inert, as a delivered one is; the other is a touch target
		expect(sent.classes()).toContain("line-through")
		expect(toCook.classes()).not.toContain("line-through")
		await sent.trigger("click")
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)
	})

	it("a ticket whose dishes are all Ready STAYS on the screen, every dish struck through, with no button and a pill that says the runner has them (Daniel, 01.11: it must not disappear)", async () => {
		ORDERS = [
			ticket("A", [["Ready"], ["Ready", "kit", "B"]], { kds_status: "Ready" }),
		]
		const wrapper = await open()

		expect(titlesIn(wrapper, "waiting")).toEqual([])
		expect(titlesIn(wrapper, "production")).toEqual(["T-A"])
		expect(wrapper.find('[data-test="ticket"]').exists()).toBe(true)
		// every dish is struck through (a check mark), nothing is left to press
		expect(wrapper.findAll('[data-test="ticket-line-done"]')).toHaveLength(2)
		expect(wrapper.find('[data-test="ticket-main"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-no-dish"]').text()).toBe(
			"With the runner",
		)
	})

	it("the last button of a ticket being cooked is « Mark ready », and it moves the dishes to Ready, not to Delivered", async () => {
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()

		const button = wrapper.get('[data-test="ticket-main"]')
		expect(button.text()).toBe("Mark ready")
		await button.trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(UPDATE_ORDER, {
			invoice_name: "A",
			status: "Ready",
		})
		expect(call).not.toHaveBeenCalledWith(
			UPDATE_ORDER,
			expect.objectContaining({ status: "Delivered" }),
		)
	})

	it("the chip « to deliver » counts what waits at the pass, in dishes, and the list shows those dishes", async () => {
		ORDERS = [
			ticket("A", [
				["Ready", "kit", "SOUP"],
				["Preparing", "kit", "STEAK"],
			]),
			ticket("B", [["Ready", "kit", "FISH"]], { kds_status: "Ready" }),
			ticket("C", [["Ready", "bar", "BEER"]]),
		]
		const wrapper = await open()

		// A's soup and B's fish: the bar's beer is the cook's own to deliver (no runner at the bar), so it is not counted
		expect(countOnChip(wrapper)).toBe("2")
		expect(wrapper.get('[data-test="ready-chip"]').text()).toContain("Ready")

		await wrapper.get('[data-test="ready-chip"]').trigger("click")
		expect(wrapper.find('[data-test="ready-list"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="bands"]').exists()).toBe(false)
		const cards = wrapper
			.get('[data-test="ready-list"]')
			.findAll('[data-test="ticket"]')
		expect(
			cards.map((card) => card.get('[data-test="ticket-title"]').text()),
		).toEqual(["T-A", "T-B"])
		// Each card holds the ready dishes only
		expect(cards[0].findAll('[data-test="ticket-line"]')).toHaveLength(1)
		expect(cards[0].text()).toContain("A dish 1")
		expect(cards[0].text()).not.toContain("A dish 2")
	})

	it("calls a dish back to preparation from the list: it goes back on the ticket of the kitchen", async () => {
		ORDERS = [
			ticket("A", [
				["Ready", "kit", "SOUP"],
				["Preparing", "kit", "STEAK"],
			]),
		]
		const wrapper = await open()
		await wrapper.get('[data-test="ready-chip"]').trigger("click")

		const recall = wrapper.get(
			'[data-test="ready-list"] [data-test="ticket-main"]',
		)
		expect(recall.text()).toBe("Recall to preparation")
		await recall.trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(UPDATE_ITEM, {
			invoice_name: "A",
			item_code: "SOUP",
			status: "Preparing",
		})
		// The dish is the kitchen's again at once: the chip is back to nothing, and the ticket has both dishes
		expect(countOnChip(wrapper)).toBe("0")
	})

	it("the menu of a dish in the list offers En préparation alone: nothing else can be done to what waits at the pass", async () => {
		ORDERS = [ticket("A", [["Ready", "kit", "SOUP"]], { kds_status: "Ready" })]
		const wrapper = await open()
		await wrapper.get('[data-test="ready-chip"]').trigger("click")

		await wrapper
			.get('[data-test="ready-list"] [data-test="ticket-line"]')
			.trigger("click")

		const entries = wrapper
			.get('[data-test="ticket-line-menu"]')
			.findAll('button:not([data-test="menu-close"])')
			.map((button) => button.text())
		expect(entries).toEqual(["Preparing"])
	})

	it("says so when nothing waits at the pass", async () => {
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()
		await wrapper.get('[data-test="ready-chip"]').trigger("click")

		expect(countOnChip(wrapper)).toBe("0")
		expect(wrapper.get('[data-test="ready-list-empty"]').text()).toBe(
			"No dishes to deliver",
		)
	})

	it("the chip is pressed again to go back to the bands", async () => {
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()
		const chip = wrapper.get('[data-test="ready-chip"]')

		await chip.trigger("click")
		expect(chip.attributes("aria-pressed")).toBe("true")
		await chip.trigger("click")

		expect(chip.attributes("aria-pressed")).toBe("false")
		expect(wrapper.find('[data-test="bands"]').exists()).toBe(true)
	})
})

//// Neoffice — the tickets whose dishes are all with the runner stay at the end of the column; a device may leave them off its screen (Daniel, 01.11: « voire pour carrément enlever ? »), by a switch of the screen's panel
describe("the tickets with the runner, on this device", () => {
	const panelSwitch = (wrapper) => wrapper.find('[data-test="runner-tickets"]')
	async function openPanel(wrapper) {
		await wrapper.get('[data-test="awake-settings"]').trigger("click")
		await flushPromises()
	}

	it("are kept by default, after the tickets being cooked, and the panel offers the switch, on", async () => {
		ORDERS = [
			ticket("RUN", [["Ready"]], { kds_status: "Ready", modified: "2026-10-30 12:00:00.000000" }),
			ticket("COOK", [["Preparing"]], { modified: "2026-10-30 12:30:00.000000" }),
		]
		const wrapper = await open()
		await openPanel(wrapper)

		expect(titlesIn(wrapper, "production")).toEqual(["T-COOK", "T-RUN"])
		expect(panelSwitch(wrapper).attributes("aria-checked")).toBe("true")
	})

	it("leave the screen when the switch is turned off, and come back when it is turned on", async () => {
		ORDERS = [
			ticket("RUN", [["Ready"]], { kds_status: "Ready" }),
			ticket("COOK", [["Preparing"]]),
		]
		const wrapper = await open()
		await openPanel(wrapper)

		await panelSwitch(wrapper).trigger("click")
		await flushPromises()
		expect(titlesIn(wrapper, "production")).toEqual(["T-COOK"])
		expect(panelSwitch(wrapper).attributes("aria-checked")).toBe("false")
		expect(window.localStorage.getItem("pos_next_kitchen_runner_tickets")).toBe("hidden")
		// the count of the bar follows what the screen holds
		expect(wrapper.text()).toContain("1 order")

		await panelSwitch(wrapper).trigger("click")
		await flushPromises()
		expect(titlesIn(wrapper, "production")).toEqual(["T-COOK", "T-RUN"])
		expect(wrapper.text()).toContain("2 orders")
	})

	it("do not touch the dishes that wait at the pass: the chip « to deliver » still counts them", async () => {
		ORDERS = [ticket("RUN", [["Ready"]], { kds_status: "Ready" })]
		const wrapper = await open()
		await openPanel(wrapper)

		await panelSwitch(wrapper).trigger("click")
		await flushPromises()

		expect(titlesIn(wrapper, "production")).toEqual([])
		expect(countOnChip(wrapper)).toBe("1")
	})

	it("have no switch where no station has a runner: nothing would ever be with it", async () => {
		STATIONS = [station("kit", 0), station("bar", 0)]
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()
		await openPanel(wrapper)

		expect(panelSwitch(wrapper).exists()).toBe(false)
	})
})

describe("without a runner", () => {
	beforeEach(() => {
		STATIONS = [station("kit", 0), station("bar", 0)]
	})

	it("a dish being prepared has ONE button, « Deliver », and it asks the server for Delivered at once", async () => {
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()

		const button = wrapper.get('[data-test="ticket-main"]')
		expect(button.text()).toBe("Deliver")
		await button.trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(UPDATE_ORDER, {
			invoice_name: "A",
			status: "Delivered",
		})
		// One gesture: « Ready » is never asked for
		expect(call).not.toHaveBeenCalledWith(
			UPDATE_ORDER,
			expect.objectContaining({ status: "Ready" }),
		)
	})

	it("asks for no confirmation, even though the restaurant has a runner screen: this station is delivered by the cook, by design", async () => {
		restaurantStore.runnerEnabled = true
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()

		expect(wrapper.text()).not.toContain("Runner is active")
		expect(call).toHaveBeenCalledWith(
			UPDATE_ORDER,
			expect.objectContaining({ status: "Delivered" }),
		)
	})

	it("the ticket leaves the screen at once, and the screen reads the orders again", async () => {
		ORDERS = [ticket("A", [["Preparing"]])]
		const wrapper = await open()
		const reads = () => call.mock.calls.filter(([m]) => m === KDS_ORDERS).length
		const before = reads()

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()

		expect(wrapper.find('[data-test="ticket"]').exists()).toBe(false)
		expect(reads()).toBeGreaterThan(before)
	})

	it("a Ready dish stays where it is until the cook delivers it, and there is no chip: nothing waits at a pass", async () => {
		ORDERS = [ticket("A", [["Ready"], ["Preparing", "kit", "B"]])]
		const wrapper = await open()

		expect(wrapper.find('[data-test="ready-chip"]').exists()).toBe(false)
		expect(linesOf(wrapper).join(" ")).toContain("A dish 1")
	})
})

describe("when the stations differ", () => {
	it("a ticket with dishes at both goes through the runner as far as the kitchen's dishes are concerned: « Mark ready »", async () => {
		ORDERS = [
			ticket("A", [
				["Preparing", "kit", "STEAK"],
				["Preparing", "bar", "BEER"],
			]),
		]
		const wrapper = await open()

		expect(mainButtons(wrapper)).toEqual(["Mark ready"])
	})

	it("a ticket with the bar's dishes alone is delivered by the cook: « Deliver »", async () => {
		ORDERS = [ticket("B", [["Preparing", "bar", "BEER"]])]
		const wrapper = await open()

		expect(mainButtons(wrapper)).toEqual(["Deliver"])
	})

	it("a station that says nothing keeps the default of the setting, a runner (an old server sends no flag)", async () => {
		STATIONS = [station("kit"), station("bar")]
		ORDERS = [ticket("A", [["Preparing", "kit", "STEAK"]])]
		const wrapper = await open()

		expect(mainButtons(wrapper)).toEqual(["Mark ready"])
		expect(wrapper.find('[data-test="ready-chip"]').exists()).toBe(true)
	})
})

describe("when the restaurant has no runner at all", () => {
	it("the kitchen delivers whatever a station says: no chip, Ready dishes stay, « Deliver » on a ticket being prepared", async () => {
		restaurantStore.runnerEnabled = false
		ORDERS = [ticket("A", [["Ready"], ["Preparing", "kit", "B"]])]
		const wrapper = await open()

		expect(wrapper.find('[data-test="ready-chip"]').exists()).toBe(false)
		expect(linesOf(wrapper).join(" ")).toContain("A dish 1")
		expect(mainButtons(wrapper)).toEqual(["Deliver"])
	})
})
