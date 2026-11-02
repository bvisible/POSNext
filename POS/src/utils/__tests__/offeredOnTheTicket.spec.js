/**
 * //// Neoffice — added file (no upstream equivalent). « Offert » on what the guest reads (NeoResto lot 1, task 24): the
 * //// receipt the till prints itself (offline, or when the server print cannot open) and the table's provisional bill show
 * //// the offered line at its list price, 0.00 charged, and « Offert » under it, never as a discount.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.frappe = { boot: { lang: "fr" } }
	// The msgid and its context, as the till's __() receives them
	globalThis.__ = (s, args, ctx) => {
		const text = args
			? String(s).replace(/\{(\d+)\}/g, (m, i) => args[i] ?? m)
			: s
		return ctx ? `${text}[${ctx}]` : text
	}
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

const { initPrecision } = await import("../currency")
const { buildReceiptHTML, printProvisionalTicket } = await import(
	"../printInvoice"
)
const { OFFER_CONTEXT } = await import("../offeredRows")

// The two lines of a table: two tiramisus paid, one offered (what formatItemsForSubmission sends)
const ITEMS = [
	{
		item_code: "TIRAMISU",
		item_name: "Tiramisu",
		qty: 2,
		rate: 9.5,
		price_list_rate: 9.5,
		discount_percentage: 0,
		discount_amount: 0,
	},
	{
		item_code: "TIRAMISU",
		item_name: "Tiramisu",
		qty: 1,
		rate: 0,
		price_list_rate: 9.5,
		discount_percentage: 100,
		discount_amount: 9.5,
		posa_is_offered: 1,
	},
]

/** The HTML of one item row of a receipt: from its name to the next row. */
function rows(html) {
	return html.split('<div class="item-row">').slice(1)
}

describe("the receipt the till prints", () => {
	it("shows the offered line at 0.00 with « Offert » under it, and no discount line", () => {
		initPrecision({ currency: 2, number_format: "#'###.##" })
		const html = buildReceiptHTML({
			name: "ACC-SINV-2026-00042",
			posting_date: "2026-10-31",
			posting_time: "21:30:00",
			currency: "CHF",
			items: ITEMS,
			grand_total: 19,
			payments: [{ mode_of_payment: "Cash", amount: 19 }],
			paid_amount: 19,
		})
		const [paid, offered] = rows(html)
		expect(paid).toContain("2 × 9.50")
		expect(paid).toContain("19.00")
		expect(paid).not.toContain(`Offered[${OFFER_CONTEXT}]`)
		expect(offered).toContain("1 × 9.50")
		expect(offered).toContain("0.00")
		expect(offered).toContain(`Offered[${OFFER_CONTEXT}]`)
		expect(offered).not.toContain("Discount")
		expect(offered).not.toContain("-9.50")
	})
})

describe("the table's provisional bill", () => {
	afterEach(() => vi.unstubAllGlobals())

	it("shows the offered line at 0.00 with « Offert » under it", () => {
		const written = []
		vi.stubGlobal("window", {
			open: () => ({
				document: { write: (html) => written.push(html), close: vi.fn() },
			}),
		})
		printProvisionalTicket({
			tableName: "Table 2",
			company: "Bistro",
			// The cart rows, as the till keeps them: the offered row at its list price, 100 % off
			items: [
				{
					item_code: "TIRAMISU",
					item_name: "Tiramisu",
					quantity: 2,
					rate: 9.5,
					price_list_rate: 9.5,
				},
				{
					item_code: "TIRAMISU",
					item_name: "Tiramisu",
					quantity: 1,
					rate: 9.5,
					price_list_rate: 9.5,
					discount_percentage: 100,
					discount_amount: 9.5,
					amount: 0,
					posa_is_offered: 1,
				},
			],
			grand_total: 19,
		})
		const [paid, offered] = rows(written.join(""))
		expect(paid).toContain("19.00")
		expect(offered).toContain("0.00")
		expect(offered).toContain(`Offered[${OFFER_CONTEXT}]`)
		expect(offered).not.toContain("Discount")
	})
})
