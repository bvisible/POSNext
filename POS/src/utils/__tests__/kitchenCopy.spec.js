/**
 * //// Neoffice — added file (no upstream equivalent). The printer button of the kitchen's and the runner's cards prints a COPY of the ticket (NeoResto lot 1,
 * //// task 44). One tap asks the SERVER to print (the browser prints nothing), on the printer of the station the screen is opened on; the button says where
 * //// the paper stands as the bill's printer button does (sending, printing, printed, printer offline, not printed); a station with no printer is told by the
 * //// server and the button goes; a double tap prints once. The server is a fake that only answers.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (text, args) =>
		args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[i])) : text
	return { calls: [], fail: null, print: null, statuses: [], hold: null }
})
const toasts = vi.hoisted(() => [])

vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		const name = method.split(".").pop()
		server.calls.push({ name, args })
		if (name === "print_kitchen_copy") {
			if (server.hold) await server.hold
			if (server.fail) throw server.fail
			return server.print
		}
		if (name === "kitchen_copy_status")
			return (
				server.statuses.shift() || { status: "Pending", printer_online: true, reason: "" }
			)
		return {}
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: (message) => toasts.push({ type: "success", message }),
		showError: (message) => toasts.push({ type: "error", message }),
		showWarning: (message) => toasts.push({ type: "warning", message }),
		showInfo: (message) => toasts.push({ type: "info", message }),
	}),
}))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

const { POLL_MS, SHOWN_MS } = await import("@/utils/provisionalTicket")
const { resolveCopySettings } = await import("@/utils/printCopy")
const { copyState, forgetStationsWithoutPrinter, printCopyFromScreen, withoutPrinter } = await import(
	"@/utils/kitchenCopy"
)

const named = (name) => server.calls.filter((call) => call.name === name)
const queued = (extra = {}) => ({
	printed: true,
	tickets: [{ station: "grill", job_token: "job-1", printer: "Kitchen", printer_online: true }],
	no_printer: [],
	valid_minutes: 15,
	duplicate: false,
	...extra,
})
let order = 0
const tap = (what = {}) =>
	printCopyFromScreen({
		invoice: `SINV-${order}`,
		screen: "Kitchen",
		station: "grill",
		settings: resolveCopySettings(),
		...what,
	})
const state = () => copyState(`SINV-${order}`)
const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
	order += 1
	vi.useFakeTimers()
	server.calls = []
	server.fail = null
	server.print = queued()
	server.statuses = []
	server.hold = null
	toasts.length = 0
	forgetStationsWithoutPrinter()
})
afterEach(() => {
	vi.useRealTimers()
})

describe("a tap on the printer button", () => {
	it("asks the server to print, once, for the order, the screen and the station the screen is opened on", async () => {
		await tap()

		expect(named("print_kitchen_copy")).toHaveLength(1)
		expect(named("print_kitchen_copy")[0].args).toEqual({
			invoice: `SINV-${order}`,
			screen: "Kitchen",
			station: "grill",
			whole_order: 0,
			mark_copy: 1,
		})
	})

	it("names no station when the screen shows them all, and carries the runner's screen", async () => {
		await tap({ station: null, screen: "Runner" })

		const args = named("print_kitchen_copy")[0].args
		expect(args.screen).toBe("Runner")
		expect("station" in args).toBe(false)
	})

	it("carries the settings of the device that reach the server: the whole order, and no COPY mark", async () => {
		await tap({ settings: resolveCopySettings({ device: { print_scope: "order", mark_copy: false } }) })

		expect(named("print_kitchen_copy")[0].args).toMatchObject({ whole_order: 1, mark_copy: 0 })
	})

	it("prints nothing in the browser", async () => {
		const print = vi.fn()
		window.print = print

		await tap()

		expect(print).not.toHaveBeenCalled()
	})

	it("prints once on a double tap: the second tap, while the first one is on its way, is the same copy", async () => {
		let release
		server.hold = new Promise((resolve) => {
			release = resolve
		})

		const first = tap()
		const second = tap()
		release()
		await Promise.all([first, second])

		expect(named("print_kitchen_copy")).toHaveLength(1)
	})

	it("prints once on a second tap once the copy is on its way, and says it is busy", async () => {
		await tap()

		expect(state().phase).toBe("printing")
		expect(await tap()).toBe("busy")
		expect(named("print_kitchen_copy")).toHaveLength(1)
	})
})

describe("what the button says", () => {
	it("says « Sending… » while the server has not answered, then « Printing… »", async () => {
		let release
		server.hold = new Promise((resolve) => {
			release = resolve
		})

		const pending = tap()
		await settle()
		expect(state()).toEqual({ phase: "sending", text: "Sending…" })

		release()
		await pending
		expect(state()).toEqual({ phase: "printing", text: "Printing…" })
	})

	it("says « Printed » when the printer confirms the copy, and goes back to the printer a few seconds after", async () => {
		server.statuses = [{ status: "Fetched", printer_online: true, reason: "" }, { status: "Printed", printer_online: true, reason: "" }]
		await tap()

		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(state().phase).toBe("printing")
		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(state()).toEqual({ phase: "printed", text: "Printed" })
		expect(named("kitchen_copy_status")[0].args).toEqual({
			invoice: `SINV-${order}`,
			job: "job-1",
			screen: "Kitchen",
		})

		await vi.advanceTimersByTimeAsync(SHOWN_MS)
		expect(state().phase).toBe("idle")
	})

	it("says the printer is off, and for how long the copy waits, when the server says so", async () => {
		server.print = queued({
			tickets: [{ station: "grill", job_token: "job-1", printer: "Kitchen", printer_online: false }],
		})

		await tap()

		expect(state()).toEqual({
			phase: "offline",
			text: "Printer offline: the ticket will come out when it is back (15 min)",
		})
	})

	it("says « Not printed » and why when the printer failed, and tells the cook", async () => {
		server.statuses = [{ status: "Failed", printer_online: true, reason: "Paper empty" }]
		await tap()

		await vi.advanceTimersByTimeAsync(POLL_MS)

		expect(state()).toEqual({ phase: "failed", text: "Not printed: Paper empty" })
		expect(toasts).toContainEqual({ type: "error", message: "Not printed: Paper empty" })
	})

	it("says the same of a copy that expired before its printer came back", async () => {
		server.statuses = [{ status: "Expired", printer_online: false, reason: "Not printed in time" }]
		await tap()

		await vi.advanceTimersByTimeAsync(POLL_MS)

		expect(state().text).toBe("Not printed: Not printed in time")
	})

	it("says « Not printed » with the server's own words when the server refuses", async () => {
		server.fail = { exc_type: "PermissionError", messages: [{ message: "<b>Not permitted</b>" }] }

		const result = await tap()

		expect(result).toBe("failed")
		expect(state()).toEqual({ phase: "failed", text: "Not printed: Not permitted" })
		expect(toasts).toContainEqual({ type: "error", message: "Not printed: Not permitted" })
		// and the button can be pressed again, once the state has gone
		await vi.advanceTimersByTimeAsync(SHOWN_MS)
		expect(state().phase).toBe("idle")
		expect(await tap()).toBe("failed")
		expect(named("print_kitchen_copy")).toHaveLength(2)
	})

	it("follows every ticket of a copy for all the stations: printed once they all are", async () => {
		server.print = queued({
			tickets: [
				{ station: "grill", job_token: "job-1", printer_online: true },
				{ station: "bar", job_token: "job-2", printer_online: true },
			],
		})
		server.statuses = [
			{ status: "Printed", printer_online: true, reason: "" },
			{ status: "Pending", printer_online: true, reason: "" },
			{ status: "Printed", printer_online: true, reason: "" },
			{ status: "Printed", printer_online: true, reason: "" },
		]
		await tap({ station: null })

		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(state().phase).toBe("printing")
		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(state().phase).toBe("printed")
		expect(named("kitchen_copy_status").map((call) => call.args.job)).toEqual(["job-1", "job-2", "job-1", "job-2"])
	})

	it("stops following a copy whose status cannot be read, and keeps what it said for a while", async () => {
		const { call } = await import("@/utils/apiWrapper")
		call.mockImplementationOnce(async () => queued()).mockImplementationOnce(async () => {
			throw new Error("network")
		})
		await tap()

		await vi.advanceTimersByTimeAsync(POLL_MS)

		expect(state().phase).toBe("printing")
		await vi.advanceTimersByTimeAsync(SHOWN_MS)
		expect(state().phase).toBe("idle")
	})
})

describe("a station with no printer", () => {
	it("is told by the server: nothing is queued, the button goes, the cook is told in a word", async () => {
		server.print = { printed: false, tickets: [], no_printer: ["grill"], valid_minutes: 0, duplicate: false }

		const result = await tap()

		expect(result).toBe("no_printer")
		expect(state().phase).toBe("idle")
		expect(withoutPrinter.stations).toEqual(["grill"])
		expect(toasts).toContainEqual({ type: "info", message: "No printer prints for this station" })
		expect(named("kitchen_copy_status")).toHaveLength(0)
	})

	it("is every station when the server names none (no printing app)", async () => {
		server.print = { printed: false, tickets: [], no_printer: [""], valid_minutes: 0, duplicate: false }

		await tap({ station: null })

		expect(withoutPrinter.stations).toEqual(["*"])
	})

	it("is forgotten when the screen reads the stations that have a printer again", async () => {
		server.print = { printed: false, tickets: [], no_printer: ["grill"], valid_minutes: 0, duplicate: false }
		await tap()

		forgetStationsWithoutPrinter()

		expect(withoutPrinter.stations).toEqual([])
	})

	it("is not a failure when the ticket has nothing at the kitchen for the station: the cook is told so", async () => {
		server.print = { printed: false, tickets: [], no_printer: [], valid_minutes: 0, duplicate: false }

		const result = await tap()

		expect(result).toBe("nothing")
		expect(withoutPrinter.stations).toEqual([])
		expect(toasts).toContainEqual({ type: "info", message: "Nothing to print on this ticket" })
	})
})
