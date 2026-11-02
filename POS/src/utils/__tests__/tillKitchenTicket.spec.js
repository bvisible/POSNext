/**
 * //// Neoffice — added file (no upstream equivalent). The till prints the kitchen ticket of an open table again (NeoResto lot 1, Daniel, 02.11.2026: a kitchen with
 * //// no screen at all, only tickets, « peut imprimer un ticket s'il en a besoin »). The button is drawn where the order is a saved one with lines at a station that has a
 * //// printer, and one tap asks the SERVER for a COPY on the printer of each such station: the browser prints nothing. The server is a fake that only answers.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[i])) : text)
	return { calls: [], stations: ["Kitchen"], fail: false }
})

vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		const name = method.split(".").pop()
		server.calls.push({ name, args })
		if (name === "kitchen_copy_stations") {
			if (server.fail) throw new Error("no")
			return { stations: server.stations }
		}
		if (name === "print_kitchen_copy") {
			return { printed: true, tickets: [{ station: "Kitchen", job_token: "job-1", printer_online: true }], valid_minutes: 15 }
		}
		return { status: "Pending", printer_online: true, reason: "" }
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock("@/utils/logger", () => ({ logger: { create: () => new Proxy({}, { get: () => vi.fn() }) } }))

const { kitchenTicketButton, printKitchenTicketFromTill, stationsWithAPrinter } = await import("../tillKitchenTicket")
const { copyState } = await import("@/utils/kitchenCopy")

const AT_THE_KITCHEN = { preparation_station: "Kitchen", kds_status: "Pending" }

beforeEach(() => {
	server.calls.length = 0
	server.stations = ["Kitchen"]
	server.fail = false
})

describe("the button of the till", () => {
	it("is drawn for a saved order with lines at a station that has a printer", () => {
		const button = kitchenTicketButton({ invoice: "SINV-1", items: [AT_THE_KITCHEN], printerStations: ["Kitchen"] })

		expect(button.available).toBe(true)
		expect(button.phase).toBe("idle")
	})

	it("is not drawn for an order that is not saved yet", () => {
		expect(kitchenTicketButton({ invoice: "", items: [AT_THE_KITCHEN], printerStations: ["Kitchen"] }).available).toBe(false)
	})

	it("is not drawn when what is at the kitchen has no printer", () => {
		const bar = { preparation_station: "Bar", kds_status: "Pending" }

		expect(kitchenTicketButton({ invoice: "SINV-1", items: [bar], printerStations: ["Kitchen"] }).available).toBe(false)
	})

	it("is not drawn when the lines are held back: they are not at the kitchen", () => {
		const held = { preparation_station: "Kitchen", kds_status: "Waiting" }

		expect(kitchenTicketButton({ invoice: "SINV-1", items: [held], printerStations: ["Kitchen"] }).available).toBe(false)
	})

	it("is not drawn when no station has a printer, or the answer never came", () => {
		expect(kitchenTicketButton({ invoice: "SINV-1", items: [AT_THE_KITCHEN], printerStations: [] }).available).toBe(false)
		expect(kitchenTicketButton({ invoice: "SINV-1", items: [AT_THE_KITCHEN], printerStations: undefined }).available).toBe(false)
	})
})

describe("the stations that have a printer", () => {
	it("are asked of the server for the kitchen's screen, for the restaurant of the till", async () => {
		server.stations = ["Kitchen", "Bar"]

		expect(await stationsWithAPrinter("The Bistro")).toEqual(["Kitchen", "Bar"])
		expect(server.calls[0]).toEqual({ name: "kitchen_copy_stations", args: { screen: "Kitchen", restaurant: "The Bistro" } })
	})

	it("are none when the server cannot be asked: the button stays away", async () => {
		server.fail = true

		expect(await stationsWithAPrinter("The Bistro")).toEqual([])
	})
})

describe("one tap", () => {
	it("asks the server to print a copy of the order's tickets, each station on its own printer, marked as a copy", async () => {
		const answer = await printKitchenTicketFromTill("SINV-9")

		expect(answer).toBe("queued")
		const print = server.calls.find((call) => call.name === "print_kitchen_copy")
		expect(print.args).toEqual({ invoice: "SINV-9", screen: "Kitchen", whole_order: 0, mark_copy: 1 })
		expect(copyState("SINV-9").phase).toBe("printing")
	})

	it("is the button's phase: sending, printing, then what the printer says", async () => {
		await printKitchenTicketFromTill("SINV-10")

		const button = kitchenTicketButton({ invoice: "SINV-10", items: [AT_THE_KITCHEN], printerStations: ["Kitchen"] })

		expect(button.phase).toBe("printing")
		expect(button.text).toBe("Printing…")
	})
})
