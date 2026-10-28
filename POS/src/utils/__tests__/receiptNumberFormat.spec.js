/**
 * //// Neoffice — added file (no upstream equivalent). The receipt the till prints itself
 * //// (buildReceiptHTML) writes its amounts in the site's number format too, like the screen:
 * //// upstream printed toFixed(2), i.e. "1234.50" (product owner's decision, 2026-10-28).
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.frappe = { boot: { lang: "fr" } }
	globalThis.__ = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (m, i) => args[i] ?? m) : s)
})
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))
vi.mock("@/utils/offline/offlineReceiptCache", () => ({ getOfflineReceiptPayload: vi.fn() }))
vi.mock("@/utils/offline/sync", () => ({ getOfflineInvoiceByOfflineId: vi.fn() }))
vi.mock("@/utils/offline/workerClient", () => ({ offlineWorker: {} }))
vi.mock("@/utils/qzTray", () => ({ printHTML: vi.fn() }))

const { initPrecision } = await import("../currency")
const { buildReceiptHTML } = await import("../printInvoice")

describe("receipt amounts", () => {
	it("are written CHF-style on a #'###.## site, whatever the user's language", () => {
		initPrecision({ currency: 2, number_format: "#'###.##" })
		const html = buildReceiptHTML({
			name: "ACC-SINV-2026-00001",
			posting_date: "2026-10-28",
			posting_time: "12:00:00",
			currency: "CHF",
			items: [{ item_code: "TV", item_name: "TV", qty: 1, rate: 1234.5, price_list_rate: 1234.5 }],
			grand_total: 1234567.89,
			payments: [{ mode_of_payment: "Cash", amount: 1234567.89 }],
			paid_amount: 1234567.89,
		})
		expect(html).toContain("1'234.50")
		expect(html).toContain("1'234'567.89")
		expect(html).not.toContain("1234.50")
		expect(html).not.toContain("1 234,50")
	})
})
