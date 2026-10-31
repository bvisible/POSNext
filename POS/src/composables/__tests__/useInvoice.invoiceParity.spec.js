/**
 * //// Neoffice — added file (no upstream equivalent). The till shows what the invoice will hold, to the cent (NeoRestau
 * //// lot 1, Ruling 70): the VAT, the grand total and the Swiss 0.05 rounding of a cart, its lines as ERPNext forms them
 * //// (a rate at the cent), its header discount spread before the tax, its takeaway rates. Each cart below goes through
 * //// the till's own code (useInvoice) and its figures are checked against ERPNext's, worked by hand; the payload the
 * //// till sends and the figures it shows are kept in pos_next/tests/fixtures/till_invoice_parity.json, which the Python
 * //// suite (test_till_totals_match_the_invoice) submits as real invoices and compares with. Run with
 * //// UPDATE_PARITY_FIXTURE=1 to write the table again after a deliberate change, then run the Python suite.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createPinia, setActivePinia } from "pinia"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({
	createResource: () => ({
		submit: vi.fn(),
		fetch: vi.fn(),
		reload: vi.fn(),
		data: null,
	}),
	call: vi.fn(),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => true,
	getCachedItem: vi.fn(async () => undefined),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))

const { initPrecision, roundCurrency, roundTotal } = await import(
	"@/utils/currency"
)
const { useInvoice } = await import("../useInvoice")

const FIXTURE = new URL(
	"../../../../pos_next/tests/fixtures/till_invoice_parity.json",
	import.meta.url,
)

// The till's rows: the Swiss layout item by item (one row per VAT account at 0)
const TAX_ROWS = [
	{
		account_head: "VAT 8.1",
		description: "VAT 8.1 %",
		charge_type: "On Net Total",
		rate: 0,
	},
	{
		account_head: "VAT 2.6",
		description: "VAT 2.6 %",
		charge_type: "On Net Total",
		rate: 0,
	},
]
const ON_SITE = JSON.stringify({ "VAT 8.1": 8.1, "VAT 2.6": 0 })
const TAKEAWAY = JSON.stringify({ "VAT 8.1": 0, "VAT 2.6": 2.6 })
// The items of the Python fixture (test_takeaway_tax_category): a dish with its own takeaway row, an alcohol with
// none, a dessert whose item group carries the takeaway row
const MAPS = {
	food: { item_tax_rate: ON_SITE, takeaway_item_tax_rate: TAKEAWAY },
	alcohol: { item_tax_rate: ON_SITE, takeaway_item_tax_rate: ON_SITE },
	dessert: { item_tax_rate: ON_SITE, takeaway_item_tax_rate: TAKEAWAY },
}

// The carts, and what ERPNext makes of them (each worked through calculate_taxes_and_totals)
const CARTS = [
	{
		name: "a coffee at 4.20 on site",
		inclusive: true,
		lines: [{ item: "food", price: 4.2 }],
		erpnext: { vat: 0.32, grand_total: 4.2, rounded_total: 4.2 },
	},
	{
		name: "a takeaway order: two dishes at 6.50 and a beer at 4.20",
		inclusive: true,
		takeaway: true,
		lines: [
			{ item: "food", price: 6.5, qty: 2 },
			{ item: "alcohol", price: 4.2 },
		],
		erpnext: {
			vat: 0.65,
			grand_total: 17.2,
			rounded_total: 17.2,
			accounts: { "VAT 8.1": 0.32, "VAT 2.6": 0.33 },
		},
	},
	{
		name: "prices without tax: 1.30 and 1.31",
		inclusive: false,
		lines: [
			{ item: "food", price: 1.3 },
			{ item: "alcohol", price: 1.31 },
		],
		erpnext: { vat: 0.21, grand_total: 2.82, rounded_total: 2.8 },
	},
	{
		name: "5.00 off a dish at 20.00",
		inclusive: true,
		lines: [{ item: "food", price: 20 }],
		headerDiscount: 5,
		erpnext: { vat: 1.12, grand_total: 15, rounded_total: 15 },
	},
	{
		name: "10.00 off 100.00 without tax",
		inclusive: false,
		lines: [{ item: "food", price: 100 }],
		headerDiscount: 10,
		erpnext: { vat: 7.35, grand_total: 98.1, rounded_total: 98.1 },
	},
	{
		name: "7 % off three dishes at 10.81",
		inclusive: true,
		lines: [{ item: "food", price: 10.81, qty: 3, percentage: 7 }],
		erpnext: {
			vat: 2.26,
			grand_total: 30.15,
			rounded_total: 30.15,
			line: 30.15,
		},
	},
	{
		name: "1.00 off three dishes at 10.81",
		inclusive: true,
		lines: [{ item: "food", price: 10.81, qty: 3, amount: 1 }],
		erpnext: {
			vat: 2.36,
			grand_total: 31.44,
			rounded_total: 31.45,
			line: 31.44,
		},
	},
	{
		name: "a dish to take away at 6.50 and a dessert at 6.50, each line's VAT rounded first",
		inclusive: true,
		takeaway: true,
		roundRowWise: true,
		lines: [
			{ item: "food", price: 6.5 },
			{ item: "dessert", price: 6.5 },
		],
		erpnext: { vat: 0.32, grand_total: 13, rounded_total: 13 },
	},
	{
		name: "a dish at 12.50 without tax to take away: half a cent of VAT",
		inclusive: false,
		takeaway: true,
		lines: [{ item: "food", price: 12.5 }],
		erpnext: { vat: 0.33, grand_total: 12.83, rounded_total: 12.85 },
	},
	{
		name: "a price edited by the cashier, 10.81 sold at 9.50",
		inclusive: true,
		lines: [{ item: "food", price: 10.81, edited: 9.5 }],
		erpnext: { vat: 0.71, grand_total: 9.5, rounded_total: 9.5, line: 9.5 },
	},
]

// The fields of a sent row that make its amounts (the rest of the payload is the kitchen's and the commission's)
const SENT = [
	"qty",
	"rate",
	"price_list_rate",
	"discount_percentage",
	"discount_amount",
	"pricing_rules",
	"is_rate_manually_edited",
	"original_rate",
]

function ring(cart) {
	initPrecision({
		currency: 2,
		float: 3,
		rounding_method: null,
		smallest_currency_fraction: 0.05,
		round_row_wise_tax: cart.roundRowWise ? 1 : 0,
	})
	const inv = useInvoice()
	inv.taxRules.value = TAX_ROWS
	inv.setTaxInclusive(cart.inclusive)
	inv.isTakeaway.value = Boolean(cart.takeaway)
	for (const line of cart.lines) {
		inv.addItem(
			{
				item_code: line.item,
				item_name: line.item,
				rate: line.price,
				price_list_rate: line.price,
				uom: "Nos",
				stock_uom: "Nos",
				conversion_factor: 1,
				...MAPS[line.item],
			},
			line.qty || 1,
		)
		const row = inv.invoiceItems.value.at(-1)
		if (line.percentage) {
			inv.updateItemDiscount(line.item, line.percentage)
		} else if (line.amount) {
			row.discount_amount = line.amount
			row.discount_percentage = 0
			inv.recalculateItem(row)
			inv.rebuildIncrementalCache()
		} else if (line.edited) {
			inv.updateItemRate(line.item, line.edited, true)
		}
	}
	if (cart.headerDiscount)
		inv.applyDiscount({ amount: cart.headerDiscount, code: "PARITY" })
	const rows = inv
		.formatItemsForSubmission(inv.invoiceItems.value)
		.map((row) => ({
			item: row.item_code,
			...Object.fromEntries(
				SENT.filter((field) => row[field] !== undefined).map((field) => [
					field,
					row[field],
				]),
			),
		}))
	return {
		name: cart.name,
		inclusive: cart.inclusive,
		takeaway: Boolean(cart.takeaway),
		round_row_wise_tax: Boolean(cart.roundRowWise),
		discount_amount: inv.effectiveHeaderDiscount.value,
		apply_discount_on: inv.applyDiscountOn.value,
		items: rows,
		till: {
			total_taxes_and_charges: inv.totalTax.value,
			grand_total: inv.grandTotal.value,
			rounded_total: roundCurrency(roundTotal(inv.grandTotal.value)),
			accounts: Object.fromEntries(
				inv.taxesByAccount.value.map((row) => [
					row.account_head,
					row.tax_amount,
				]),
			),
			lines: inv.invoiceItems.value.map((line) => line.amount),
		},
	}
}

describe("the till shows what the invoice will hold", () => {
	beforeEach(() => setActivePinia(createPinia()))
	afterAll(() =>
		initPrecision({ currency: 2, float: 3, rounding_method: null }),
	)

	const rung = []
	for (const cart of CARTS) {
		it(cart.name, () => {
			const till = ring(cart)
			rung.push(till)
			expect(till.till.total_taxes_and_charges).toBe(cart.erpnext.vat)
			expect(till.till.grand_total).toBe(cart.erpnext.grand_total)
			expect(till.till.rounded_total).toBe(cart.erpnext.rounded_total)
			if (cart.erpnext.accounts)
				expect(till.till.accounts).toEqual(cart.erpnext.accounts)
			if (cart.erpnext.line) expect(till.till.lines[0]).toBe(cart.erpnext.line)
		})
	}

	it("keeps the table the Python suite submits in step with the till", () => {
		const table = {
			cases: CARTS.map((cart) => {
				setActivePinia(createPinia())
				return ring(cart)
			}),
		}
		if (process.env.UPDATE_PARITY_FIXTURE) {
			writeFileSync(FIXTURE, `${JSON.stringify(table, null, 1)}\n`)
		}
		expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(table)
		expect(rung).toHaveLength(CARTS.length)
	})
})
