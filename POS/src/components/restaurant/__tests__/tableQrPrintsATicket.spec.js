/**
 * //// Neoffice — added file (no upstream equivalent). The QR dialog of a table (NeoResto lot 1, task 53): it still draws the code, and its
 * //// Print button now puts a ticket on the till's receipt printer through the server; the browser's print window opens only when the
 * //// server says the till has no printer.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
	return { calls: [], print: null, status: { status: "Pending", printer_online: true } }
})
const toCanvas = vi.hoisted(() => vi.fn(async () => {}))
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() }))

vi.mock("qrcode", () => ({ default: { toCanvas } }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ settings: { pos_profile: "Restaurant till" } }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		const name = method.split(".").pop()
		server.calls.push({ name, args })
		return name === "ticket_status" ? server.status : server.print
	}),
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/utils/logger", () => ({ logger: { create: () => new Proxy({}, { get: () => vi.fn() }) } }))

const { default: TableQRCode } = await import("../TableQRCode.vue")

const URL = "https://shop.example.test/pos/guest/tok-abc"
const named = (name) => server.calls.filter((call) => call.name === name)
let opened = []
let popup

function open(props = {}) {
	const wrapper = mount(TableQRCode, {
		props: { token: "tok-abc", tableName: "Table 5", url: URL, ...props },
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}

async function drawn(wrapper) {
	// the dialog waits a moment for its canvas to be in the page before it draws
	await vi.advanceTimersByTimeAsync(60)
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	vi.useFakeTimers()
	server.calls = []
	server.print = {
		printed: true,
		no_printer: false,
		printer: "Receipt printer",
		printer_online: true,
		job_token: "job-1",
		valid_minutes: 15,
	}
	server.status = { status: "Pending", printer_online: true }
	toCanvas.mockClear()
	for (const fn of Object.values(toast)) fn.mockReset()
	popup = { document: { write: vi.fn(), close: vi.fn() } }
	vi.spyOn(window, "open").mockImplementation(() => popup)
	vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA")
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe("the dialog", () => {
	it("still draws the QR code of the table's link, and shows the table and the link", async () => {
		const wrapper = await drawn(open())

		expect(toCanvas).toHaveBeenCalledTimes(1)
		const [canvas, text, options] = toCanvas.mock.calls[0]
		expect(canvas).toBe(wrapper.get("canvas").element)
		expect(text).toBe(URL)
		expect(options).toMatchObject({ width: 224, margin: 2 })
		expect(wrapper.text()).toContain("QR Code")
		expect(wrapper.text()).toContain("Table 5")
		expect(wrapper.text()).toContain(URL)
	})

	it("closes with Close", async () => {
		const wrapper = await drawn(open())

		await wrapper.findAll("button").find((button) => button.text() === "Close").trigger("click")

		expect(wrapper.emitted("close")).toHaveLength(1)
	})

	it("says Print before anything is tapped, with no state under the buttons", async () => {
		const wrapper = await drawn(open())

		expect(wrapper.get("[data-test=table-qr-print]").text()).toBe("Print")
		expect(wrapper.get("[data-test=table-qr-print]").attributes("disabled")).toBeUndefined()
		expect(wrapper.find("[data-test=table-qr-print-state]").exists()).toBe(false)
	})
})

describe("the Print button", () => {
	it("asks the server for the ticket with the token and the till the page works at, and opens no print window", async () => {
		const wrapper = await drawn(open())

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await flushPromises()

		expect(named("print_table_qr_ticket")).toHaveLength(1)
		expect(named("print_table_qr_ticket")[0].args).toEqual({ token: "tok-abc", pos_profile: "Restaurant till" })
		expect(window.open).not.toHaveBeenCalled()
	})

	it("prints for the till the page hands it when it names one", async () => {
		const wrapper = await drawn(open({ posProfile: "Terrace till" }))

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await flushPromises()

		expect(named("print_table_qr_ticket")[0].args.pos_profile).toBe("Terrace till")
	})

	it("says Printing, and does not take a second tap, while the paper is on its way", async () => {
		const wrapper = await drawn(open())

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test=table-qr-print]").text()).toBe("Printing…")
		expect(wrapper.get("[data-test=table-qr-print]").attributes("disabled")).toBeDefined()
		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		expect(named("print_table_qr_ticket")).toHaveLength(1)
	})

	it("says Printed when the printer has it, and goes back to Print", async () => {
		const wrapper = await drawn(open())
		server.status = { status: "Printed" }

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await vi.advanceTimersByTimeAsync(2000)
		await flushPromises()

		expect(wrapper.get("[data-test=table-qr-print]").text()).toBe("Printed")
		await vi.advanceTimersByTimeAsync(7000)
		await flushPromises()
		expect(wrapper.get("[data-test=table-qr-print]").text()).toBe("Print")
	})

	it("says the printer is off, with what the paper waits for, under the buttons", async () => {
		server.print = { printed: true, printer_online: false, job_token: "job-1", valid_minutes: 15 }
		const wrapper = await drawn(open())

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test=table-qr-print]").text()).toBe("Printer offline")
		expect(wrapper.get("[data-test=table-qr-print-state]").text()).toBe(
			"Printer offline: the ticket will come out when it is back (15 min)",
		)
	})

	it("shows why nothing was printed when the server refuses, and opens no print window", async () => {
		const wrapper = await drawn(open())
		const { call } = await import("@/utils/apiWrapper")
		call.mockImplementationOnce(async () => {
			throw Object.assign(new Error("no"), {
				exc_type: "ValidationError",
				messages: ["This QR code is no longer valid: make a new one"],
			})
		})

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test=table-qr-print-state]").text()).toBe(
			"Not printed: This QR code is no longer valid: make a new one",
		)
		expect(window.open).not.toHaveBeenCalled()
	})

	it("opens the browser's print window with the table and the code when, and only when, the server says the till has no printer", async () => {
		server.print = { printed: false, no_printer: true }
		const wrapper = await drawn(open())

		await wrapper.get("[data-test=table-qr-print]").trigger("click")
		await flushPromises()

		expect(window.open).toHaveBeenCalledTimes(1)
		expect(popup.document.write).toHaveBeenCalledTimes(1)
		const page = popup.document.write.mock.calls[0][0]
		expect(page).toContain("data:image/png;base64,AAAA")
		expect(page).toContain("<h2>Table 5</h2>")
		expect(page).toContain(URL)
		expect(wrapper.get("[data-test=table-qr-print]").text()).toBe("Print")
	})
})
