/**
 * //// Neoffice — added file (no upstream equivalent). ERPNext's computation of a sale's taxes and totals, ported for the
 * //// till (utils/invoiceTaxes.js; NeoRestau lot 1, Ruling 70: the screen equals the invoice, to the cent). The figures
 * //// below are ERPNext's own, worked through calculate_taxes_and_totals step by step; the Python suite
 * //// (test_till_totals_match_the_invoice) submits the same carts and compares them with real invoices.
 */
import { afterEach, describe, expect, it } from "vitest"
import { initPrecision } from "../currency"
import { calculateTaxesAndTotals, invoiceLine } from "../invoiceTaxes"

// The Swiss layout item by item: one row per VAT account at 0, the item's map giving the rate
const rows = (included) => [
	{
		account_head: "VAT 8.1",
		charge_type: "On Net Total",
		rate: 0,
		included_in_print_rate: included,
	},
	{
		account_head: "VAT 2.6",
		charge_type: "On Net Total",
		rate: 0,
		included_in_print_rate: included,
	},
]
const ON_SITE = { "VAT 8.1": 8.1, "VAT 2.6": 0 }
const TAKEAWAY = { "VAT 8.1": 0, "VAT 2.6": 2.6 }
const sold = (rate, map, qty = 1, extra = {}) => ({
	rate,
	price_list_rate: rate,
	qty,
	item_tax_rate: map,
	...extra,
})
const vat = (result) =>
	Object.fromEntries(
		result.taxes.map((t) => [
			t.account_head,
			t.tax_amount_after_discount_amount,
		]),
	)

// The fleet's sites name no rounding method: Frappe's default, « Banker's Rounding (legacy) »
const legacy = () =>
	initPrecision({ currency: 2, float: 3, rounding_method: null })

describe("ERPNext's taxes and totals of a till's sale", () => {
	afterEach(legacy)

	it("rounds each line's net, then the VAT once over the cart: a coffee at 4.20 holds 0.32", () => {
		legacy()
		const result = calculateTaxesAndTotals({
			items: [sold(4.2, ON_SITE)],
			taxes: rows(1),
		})
		expect(result.net_total).toBe(3.89)
		expect(result.total_taxes_and_charges).toBe(0.32)
		// The price includes the tax: the rounding gap goes to the grand total, which stays 4.20
		expect(result.grand_total).toBe(4.2)
	})

	it("taxes a mixed takeaway cart per account: 0.33 at 2.6 %, 0.32 at 8.1 %", () => {
		legacy()
		const result = calculateTaxesAndTotals({
			items: [sold(6.5, TAKEAWAY), sold(6.5, TAKEAWAY), sold(4.2, ON_SITE)],
			taxes: rows(1),
		})
		expect(vat(result)).toEqual({ "VAT 8.1": 0.32, "VAT 2.6": 0.33 })
		expect(result.total_taxes_and_charges).toBe(0.65)
		expect(result.grand_total).toBe(17.2)
	})

	it("adds the VAT rounded once to prices without tax: 1.30 + 1.31 is 2.82", () => {
		legacy()
		const result = calculateTaxesAndTotals({
			items: [sold(1.3, ON_SITE), sold(1.31, ON_SITE)],
			taxes: rows(0),
		})
		expect(result.total_taxes_and_charges).toBe(0.21)
		expect(result.grand_total).toBe(2.82)
	})

	it("spreads a header discount over the nets and taxes after it: 20.00 with 5.00 off holds 1.12", () => {
		legacy()
		const result = calculateTaxesAndTotals({
			items: [sold(20, ON_SITE)],
			taxes: rows(1),
			discountAmount: 5,
			applyDiscountOn: "Grand Total",
		})
		expect(result.items[0].net_amount).toBe(13.88)
		expect(result.total_taxes_and_charges).toBe(1.12)
		expect(result.grand_total).toBe(15)
	})

	it("takes a header discount off the total on prices without tax too", () => {
		legacy()
		// 100.00 + 8.10 = 108.10; 10.00 off the grand total: the net bears 9.25 of it, the VAT the rest
		const result = calculateTaxesAndTotals({
			items: [sold(100, ON_SITE)],
			taxes: rows(0),
			discountAmount: 10,
			applyDiscountOn: "Grand Total",
		})
		expect(result.net_total).toBe(90.75)
		expect(result.total_taxes_and_charges).toBe(7.35)
		expect(result.grand_total).toBe(98.1)
	})

	it("rounds each line's VAT first where Accounts Settings asks for it", () => {
		legacy()
		const cart = {
			items: [sold(6.5, TAKEAWAY), sold(6.5, TAKEAWAY), sold(6.5, TAKEAWAY)],
			taxes: rows(1),
		}
		expect(calculateTaxesAndTotals(cart).total_taxes_and_charges).toBe(0.49)
		expect(
			calculateTaxesAndTotals({ ...cart, roundRowWiseTax: true })
				.total_taxes_and_charges,
		).toBe(0.48)
		expect(
			calculateTaxesAndTotals({ ...cart, roundRowWiseTax: true }).grand_total,
		).toBe(19.5)
	})

	it("rounds an exact half-cent up, as Frappe's default method does (the till rounded it to even)", () => {
		// 2.6 % of 12.50 is 0.325
		const cart = { items: [sold(12.5, TAKEAWAY)], taxes: rows(0) }
		legacy()
		expect(calculateTaxesAndTotals(cart).total_taxes_and_charges).toBe(0.33)
		initPrecision({
			currency: 2,
			float: 3,
			rounding_method: "Banker's Rounding",
		})
		expect(calculateTaxesAndTotals(cart).total_taxes_and_charges).toBe(0.32)
	})

	it("forms a line as ERPNext does: a rate at the cent, a percentage of a line with pricing rules recomputed", () => {
		legacy()
		// The till sends 10.05 for 7 % off 10.81: three of them are 30.15
		expect(
			invoiceLine({
				rate: 10.05,
				price_list_rate: 10.81,
				qty: 3,
				discount_percentage: 7,
			}).amount,
		).toBe(30.15)
		// A line with pricing rules takes its rate from its percentage, whatever rate is sent
		expect(
			invoiceLine({
				rate: 10.06,
				price_list_rate: 10.81,
				qty: 3,
				discount_percentage: 7,
				pricing_rules: "PR-1",
			}).amount,
		).toBe(30.15)
		// No rate at all: the list price; a 100 % discount: nothing
		expect(invoiceLine({ rate: 0, price_list_rate: 4.2, qty: 2 }).amount).toBe(
			8.4,
		)
		expect(
			invoiceLine({
				rate: 4.2,
				price_list_rate: 4.2,
				qty: 2,
				discount_percentage: 100,
			}).amount,
		).toBe(0)
	})

	it("leaves out a tax ERPNext marks not applicable to the item", () => {
		legacy()
		const taxes = [
			{
				account_head: "VAT 8.1",
				charge_type: "On Net Total",
				rate: 8.1,
				included_in_print_rate: 1,
			},
		]
		const result = calculateTaxesAndTotals({
			items: [sold(10.81, { "VAT 8.1": "N/A" })],
			taxes,
		})
		expect(result.total_taxes_and_charges).toBe(0)
		expect(result.grand_total).toBe(10.81)
	})

	it("computes a charge on the previous row's total and a fixed « Actual » charge", () => {
		legacy()
		const taxes = [
			{ account_head: "VAT 8.1", charge_type: "On Net Total", rate: 8.1 },
			{
				account_head: "Levy",
				charge_type: "On Previous Row Total",
				rate: 1,
				row_id: 1,
			},
			{ account_head: "Fee", charge_type: "Actual", rate: 0, tax_amount: 2 },
		]
		const result = calculateTaxesAndTotals({
			items: [sold(30, {}), sold(10, {})],
			taxes,
		})
		// 8.1 % of 40.00; 1 % of (each line + its VAT); 2.00 spread over the lines, the last taking the remainder
		expect(vat(result)).toEqual({ "VAT 8.1": 3.24, Levy: 0.43, Fee: 2 })
		expect(result.grand_total).toBe(45.67)
	})

	it("is nothing for an empty cart", () => {
		const result = calculateTaxesAndTotals({ items: [], taxes: rows(1) })
		expect([result.total_taxes_and_charges, result.grand_total]).toEqual([0, 0])
	})
})
