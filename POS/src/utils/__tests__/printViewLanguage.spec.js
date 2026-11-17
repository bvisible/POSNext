/**
 * //// Neoffice — added file (no upstream equivalent). The receipt of the till opens in the language of the person who prints
 * //// it (neoffice-maintenance#1133). The print window asked for `_lang=en` whatever the site speaks, and an address that
 * //// names its language wins over the document's, the customer's and the format's: a French till printed, and sent by
 * //// e-mail, a receipt in English. Without `_lang` the desk decides — the document's language, its customer's, the
 * //// format's own, else the session's — and a site that speaks no other language prints in the cashier's.
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.frappe = { boot: { lang: "fr" } }
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/\{(\d+)\}/g, (m, i) => args[i] ?? m) : s
})
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))
vi.mock("@/utils/offline/offlineReceiptCache", () => ({
	getOfflineReceiptPayload: vi.fn(),
}))
vi.mock("@/utils/offline/sync", () => ({
	getOfflineInvoiceByOfflineId: vi.fn(),
}))
vi.mock("@/utils/offline/workerClient", () => ({ offlineWorker: {} }))
vi.mock("@/utils/qzTray", () => ({ printHTML: vi.fn() }))

const { printInvoice } = await import("../printInvoice")

afterEach(() => {
	vi.restoreAllMocks()
})

function openedAddress() {
	const open = vi.spyOn(window, "open").mockReturnValue({})
	return async (invoice, format) => {
		await printInvoice(invoice, format)
		return new URL(open.mock.calls.at(-1)[0], "https://till.example")
	}
}

describe("the print window of a receipt", () => {
	it("names no language: the desk picks the document's, the customer's or the session's", async () => {
		const address = await openedAddress()(
			{ name: "ACC-SINV-2026-00001", doctype: "Sales Invoice" },
			"Neopos Receipt",
		)

		expect(address.pathname).toBe("/printview")
		expect(address.searchParams.has("_lang")).toBe(false)
	})

	it("still asks for the receipt format, the invoice and the print dialog", async () => {
		const address = await openedAddress()(
			{ name: "ACC-SINV-2026-00001", doctype: "Sales Invoice" },
			"Neopos Receipt",
		)

		expect(address.searchParams.get("format")).toBe("Neopos Receipt")
		expect(address.searchParams.get("name")).toBe("ACC-SINV-2026-00001")
		expect(address.searchParams.get("trigger_print")).toBe("1")
	})
})
