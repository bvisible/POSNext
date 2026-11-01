/**
 * //// Neoffice — added file (no upstream equivalent). What a service screen needs to put the PRINTER BUTTON on its cards (NeoRestau lot 1, task 44): the
 * //// device's settings, the stations that have a printer (asked of the server, again every minute at most), whether a card draws its button, and the print.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const server = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return { calls: [], stations: ["grill"], fail: false }
})
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		const name = method.split(".").pop()
		server.calls.push({ name, args })
		if (name === "kitchen_copy_stations") {
			if (server.fail) throw new Error("offline")
			return { stations: server.stations }
		}
		if (name === "print_kitchen_copy")
			return { printed: true, tickets: [{ station: "grill", job_token: "j", printer_online: true }], no_printer: [], valid_minutes: 15 }
		return {}
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() }),
}))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

const { PRINTERS_REFRESH_MS, usePrintCopy } = await import("../usePrintCopy")
const { forgetStationsWithoutPrinter } = await import("@/utils/kitchenCopy")

const ticket = (name, ...stations) => ({
	name,
	items: stations.map((station) => ({ preparation_station: station, kds_status: "Pending" })),
})
const named = (name) => server.calls.filter((call) => call.name === name)

beforeEach(() => {
	localStorage.clear()
	server.calls = []
	server.stations = ["grill"]
	server.fail = false
	forgetStationsWithoutPrinter()
	vi.useRealTimers()
})

describe("the stations that have a printer", () => {
	it("are asked of the server for the screen and the restaurant it shows", async () => {
		const copy = usePrintCopy("Kitchen", { restaurant: () => ({ restaurant: "The Bistro" }) })

		await copy.refreshPrinters({ force: true })

		expect(named("kitchen_copy_stations")[0].args).toEqual({ screen: "Kitchen", restaurant: "The Bistro" })
		expect(copy.printerStations.value).toEqual(["grill"])
		expect(copy.hasPrinters.value).toBe(true)
	})

	it("are asked again once a minute at most, unless the screen forces it", async () => {
		vi.useFakeTimers()
		const copy = usePrintCopy("Kitchen")

		await copy.refreshPrinters({ force: true })
		await copy.refreshPrinters()
		await copy.refreshPrinters()
		expect(named("kitchen_copy_stations")).toHaveLength(1)

		vi.advanceTimersByTime(PRINTERS_REFRESH_MS + 1)
		server.stations = ["grill", "bar"]
		await copy.refreshPrinters()
		expect(named("kitchen_copy_stations")).toHaveLength(2)
		expect(copy.printerStations.value).toEqual(["grill", "bar"])
	})

	it("keep what the screen knew when the server cannot be reached for a moment: the buttons do not blink out", async () => {
		const copy = usePrintCopy("Kitchen")
		await copy.refreshPrinters({ force: true })

		server.fail = true
		await copy.refreshPrinters({ force: true })

		expect(copy.printerStations.value).toEqual(["grill"])
	})

	it("are none until the server has answered: no button yet, and no choice to make", () => {
		const copy = usePrintCopy("Kitchen")

		expect(copy.hasPrinters.value).toBe(false)
		expect(copy.canPrint(ticket("A", "grill"))).toBe(false)
	})
})

describe("whether a card draws its button", () => {
	it("is yes on the kitchen screen for a ticket with a dish at a station that has a printer", async () => {
		const copy = usePrintCopy("Kitchen")
		await copy.refreshPrinters({ force: true })

		expect(copy.canPrint(ticket("A", "grill", "bar"))).toBe(true)
		expect(copy.canPrint(ticket("B", "bar"))).toBe(false)
	})

	it("follows the station the screen is opened on, as the screen changes it", async () => {
		const station = ref("bar")
		const copy = usePrintCopy("Kitchen", { station })
		await copy.refreshPrinters({ force: true })

		expect(copy.canPrint(ticket("A", "grill", "bar"))).toBe(false)
		station.value = "grill"
		expect(copy.canPrint(ticket("A", "grill", "bar"))).toBe(true)
	})

	it("is no on the runner screen until its setting is switched on, which takes effect and is kept on the device", async () => {
		const copy = usePrintCopy("Runner")
		await copy.refreshPrinters({ force: true })
		const card = { invoiceName: "SINV-1", items: [{ preparation_station: "grill", kds_status: "Ready" }] }

		expect(copy.canPrint(card)).toBe(false)
		copy.setSetting("runner_print_button", true)
		expect(copy.canPrint(card)).toBe(true)
		expect(usePrintCopy("Runner").settings.value.runner_print_button).toBe(true)
	})

	it("is no for a card that holds no single order (the runner's view by station)", async () => {
		const copy = usePrintCopy("Runner")
		copy.setSetting("runner_print_button", true)
		await copy.refreshPrinters({ force: true })

		expect(copy.canPrint({ key: "grill", items: [{ preparation_station: "grill", kds_status: "Ready" }] })).toBe(false)
	})

	it("is no where the device switched the kitchen's button off", async () => {
		const copy = usePrintCopy("Kitchen")
		await copy.refreshPrinters({ force: true })

		copy.setSetting("kitchen_print_button", false)

		expect(copy.canPrint(ticket("A", "grill"))).toBe(false)
	})

	it("takes no setting that is not one", () => {
		const copy = usePrintCopy("Kitchen")

		copy.setSetting("print_scope", "whatever")
		copy.setSetting("rest_after_minutes", 5)

		expect(copy.settings.value.print_scope).toBe("station")
		expect(localStorage.length).toBe(0)
	})
})

describe("the print", () => {
	it("goes to the server with the station the screen is opened on and the settings of the device", async () => {
		const station = ref("grill")
		const copy = usePrintCopy("Kitchen", { station })
		copy.setSetting("print_scope", "order")

		await copy.print(ticket("SINV-77", "grill"))

		expect(named("print_kitchen_copy")[0].args).toEqual({
			invoice: "SINV-77",
			screen: "Kitchen",
			station: "grill",
			whole_order: 1,
			mark_copy: 1,
		})
	})

	it("names a runner's card by its order", async () => {
		const copy = usePrintCopy("Runner")

		await copy.print({ invoiceName: "SINV-88", items: [] })

		expect(named("print_kitchen_copy")[0].args.invoice).toBe("SINV-88")
		expect(copy.stateOf({ invoiceName: "SINV-88" }).phase).toBe("printing")
	})
})
