/**
 * //// Neoffice — added file (no upstream equivalent). The Print button of a table's QR dialog puts a ticket on the till's receipt printer
 * //// (NeoRestau lot 1, task 53): the call it makes, the states it shows, and when (only then) the browser prints instead.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const server = vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
	return { calls: [], print: null, status: [], fail: null, statusFails: false }
})
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() }))

vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		const name = method.split(".").pop()
		server.calls.push({ name, method, args })
		if (name === "print_table_qr_ticket") {
			if (server.fail) throw server.fail
			return server.print
		}
		if (name === "ticket_status") {
			if (server.statusFails) throw new Error("offline")
			return server.status.length > 1 ? server.status.shift() : server.status[0]
		}
		return {}
	}),
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/utils/logger", () => ({ logger: { create: () => new Proxy({}, { get: () => vi.fn() }) } }))

const { BUSY_PHASES, PRINT_METHOD, STATUS_METHOD, usePrintTableQr } = await import("../usePrintTableQr")
const { POLL_MS, SHOWN_MS } = await import("@/utils/provisionalTicket")

const named = (name) => server.calls.filter((call) => call.name === name)
const printed = (values = {}) => ({
	printed: true,
	no_printer: false,
	printer: "Receipt printer",
	printer_online: true,
	job_token: "job-1",
	valid_minutes: 15,
	duplicate: false,
	...values,
})
const refusal = (excType, message) => Object.assign(new Error(excType), { exc_type: excType, messages: [message] })

let printInBrowser
let button

function setUp(options = {}) {
	printInBrowser = vi.fn()
	button = usePrintTableQr({ token: "tok-abc", posProfile: "Restaurant till", printInBrowser, ...options })
	return button
}

beforeEach(() => {
	vi.useFakeTimers()
	server.calls = []
	server.print = printed()
	server.status = [{ status: "Pending", printer_online: true }]
	server.fail = null
	server.statusFails = false
	for (const fn of Object.values(toast)) fn.mockReset()
	setUp()
})
afterEach(() => {
	vi.useRealTimers()
})

describe("the call it makes", () => {
	it("asks the server for the ticket with the guest token and the till, and nothing else", async () => {
		await button.print()

		expect(PRINT_METHOD).toBe("pos_next.api.table_qr_ticket.print_table_qr_ticket")
		expect(named("print_table_qr_ticket")).toHaveLength(1)
		expect(named("print_table_qr_ticket")[0].args).toEqual({ token: "tok-abc", pos_profile: "Restaurant till" })
	})

	it("names the table too when the dialog knows it", async () => {
		setUp({ table: "tbl-0001" })

		await button.print()

		expect(named("print_table_qr_ticket")[0].args).toEqual({
			token: "tok-abc",
			pos_profile: "Restaurant till",
			table: "tbl-0001",
		})
	})

	it("reads the token and the till when the button is tapped, whether they are values, refs or getters", async () => {
		const till = ref("Till one")
		let token = "first"
		setUp({ token: () => token, posProfile: till })
		till.value = "Till two"
		token = "second"

		await button.print()

		expect(named("print_table_qr_ticket")[0].args).toEqual({ token: "second", pos_profile: "Till two" })
	})

	it("sends no text and no address of its own: the server works them out from the token", async () => {
		await button.print()

		expect(Object.keys(named("print_table_qr_ticket")[0].args).sort()).toEqual(["pos_profile", "token"])
	})
})

describe("where the paper stands", () => {
	it("says Sending while the server is asked, then Printing while the printer has it", async () => {
		let answer
		server.print = new Promise((resolve) => {
			answer = resolve
		})
		const tap = button.print()

		expect(button.state.phase).toBe("sending")
		expect(button.label.value).toBe("Sending…")
		answer(printed())
		await tap

		expect(button.state.phase).toBe("printing")
		expect(button.label.value).toBe("Printing…")
	})

	it("follows the paper with the bill's own status call until the printer confirms it, then says Printed and goes back to Print", async () => {
		server.status = [{ status: "Pending", printer_online: true }, { status: "Fetched", printer_online: true }, { status: "Printed" }]

		expect(await button.print()).toBe("queued")
		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(button.state.phase).toBe("printing")
		await vi.advanceTimersByTimeAsync(POLL_MS * 2)

		expect(named("ticket_status").map((call) => call.args)).toEqual([{ job: "job-1" }, { job: "job-1" }, { job: "job-1" }])
		expect(STATUS_METHOD).toBe("cloudprnt.provisional_ticket.ticket_status")
		expect(button.state.phase).toBe("printed")
		expect(button.label.value).toBe("Printed")
		await vi.advanceTimersByTimeAsync(SHOWN_MS + 1)
		expect(button.state.phase).toBe("idle")
		expect(button.label.value).toBe("Print")
	})

	it("says the printer is offline, with how long the paper waits, and goes on to Printed when it is back", async () => {
		server.print = printed({ printer_online: false })
		server.status = [{ status: "Pending", printer_online: false }, { status: "Printed" }]

		await button.print()

		expect(button.state.phase).toBe("offline")
		expect(button.label.value).toBe("Printer offline")
		expect(button.state.text).toBe("Printer offline: the ticket will come out when it is back (15 min)")
		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(button.state.phase).toBe("offline")
		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(button.state.phase).toBe("printed")
	})

	it("says Not printed, and why, when the printer fails or the paper expires", async () => {
		for (const status of ["Failed", "Expired"]) {
			setUp()
			server.status = [{ status, reason: "Paper out" }]

			await button.print()
			await vi.advanceTimersByTimeAsync(POLL_MS)

			expect(button.state.phase).toBe("failed")
			expect(button.state.text).toBe("Not printed: Paper out")
			expect(toast.showError).toHaveBeenLastCalledWith("Not printed: Paper out")
			expect(printInBrowser).not.toHaveBeenCalled()
		}
	})

	it("keeps what it said when the status cannot be read, then goes back to Print", async () => {
		server.statusFails = true

		await button.print()
		await vi.advanceTimersByTimeAsync(POLL_MS)

		expect(button.state.phase).toBe("printing")
		await vi.advanceTimersByTimeAsync(SHOWN_MS + 1)
		expect(button.state.phase).toBe("idle")
	})

	it("follows the first tap's paper when the server says the second tap is the same paper", async () => {
		server.print = printed({ duplicate: true, job_token: "job-first" })

		await button.print()
		await vi.advanceTimersByTimeAsync(POLL_MS)

		expect(named("ticket_status")[0].args).toEqual({ job: "job-first" })
	})

	it("says Printing without following when the first tap is still being queued (no job yet)", async () => {
		server.print = printed({ duplicate: true, job_token: null })

		await button.print()
		await vi.advanceTimersByTimeAsync(POLL_MS * 3)

		expect(button.state.phase).toBe("printing")
		expect(named("ticket_status")).toHaveLength(0)
	})
})

describe("a tap while the paper is on its way", () => {
	it("does nothing more: the table gets one paper, a second tap or a double tap included", async () => {
		const first = button.print()
		const second = button.print()
		await Promise.all([first, second])

		expect(named("print_table_qr_ticket")).toHaveLength(1)
		expect(await button.print()).toBe("busy")
		expect(named("print_table_qr_ticket")).toHaveLength(1)
		expect(BUSY_PHASES).toEqual(["sending", "printing", "offline"])
	})

	it("is allowed again once the paper is out, to print another", async () => {
		server.status = [{ status: "Printed" }]
		await button.print()
		await vi.advanceTimersByTimeAsync(POLL_MS)
		expect(button.busy.value).toBe(false)

		await button.print()

		expect(named("print_table_qr_ticket")).toHaveLength(2)
	})
})

describe("when the browser prints it", () => {
	it("prints from the browser when, and only when, the server says the till has no printer", async () => {
		server.print = { printed: false, no_printer: true }

		const result = await button.print()

		expect(result).toBe("browser")
		expect(printInBrowser).toHaveBeenCalledTimes(1)
		expect(toast.showInfo).toHaveBeenCalledWith("This till has no ticket printer: the QR code prints from the browser")
		expect(button.state.phase).toBe("idle")
		expect(named("ticket_status")).toHaveLength(0)
	})

	it("does not print from the browser when the paper is on its way", async () => {
		await button.print()

		expect(printInBrowser).not.toHaveBeenCalled()
	})

	it("says so, and does not crash, when the browser cannot print either", async () => {
		server.print = { printed: false, no_printer: true }
		printInBrowser.mockImplementation(() => {
			throw new Error("blocked")
		})

		expect(await button.print()).toBe("none")
		expect(toast.showError).toHaveBeenCalledWith("Failed to print the QR code")
	})

	it("does nothing, and says so, when the server printed nothing and names no reason", async () => {
		server.print = { printed: false, no_printer: false }

		expect(await button.print()).toBe("none")
		expect(printInBrowser).not.toHaveBeenCalled()
		expect(toast.showInfo).toHaveBeenCalledWith("Nothing was printed")
	})
})

describe("a refusal of the server", () => {
	it("is shown as plain words and prints nothing, from the browser either", async () => {
		for (const excType of ["PermissionError", "ValidationError", "DoesNotExistError", "RateLimitExceededError"]) {
			setUp()
			server.fail = refusal(excType, { message: "<b>This QR code is no longer valid:</b> make a new one" })

			const result = await button.print()

			expect(result).toBe("refused")
			expect(button.state.phase).toBe("failed")
			expect(button.state.text).toBe("Not printed: This QR code is no longer valid: make a new one")
			expect(toast.showError).toHaveBeenLastCalledWith("Not printed: This QR code is no longer valid: make a new one")
			expect(printInBrowser).not.toHaveBeenCalled()
		}
	})

	it("is followed by a Print button that works again", async () => {
		server.fail = refusal("ValidationError", "No")
		await button.print()
		expect(button.busy.value).toBe(false)
		server.fail = null

		await button.print()

		expect(named("print_table_qr_ticket")).toHaveLength(2)
	})

	it("falls back on the exception's name when the server gave no words", async () => {
		server.fail = refusal("PermissionError", "")

		await button.print()

		expect(button.state.text).toBe("Not printed: PermissionError")
	})

	it("is the same when the server cannot be reached: shown, never printed from the browser, never a crash", async () => {
		server.fail = new TypeError("Failed to fetch")

		const result = await button.print()

		expect(result).toBe("failed")
		expect(button.state.text).toBe("Not printed: The printer could not be reached")
		expect(printInBrowser).not.toHaveBeenCalled()
	})
})
