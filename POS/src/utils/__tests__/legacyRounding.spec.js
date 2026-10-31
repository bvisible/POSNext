/**
 * //// Neoffice — added file (no upstream equivalent). The till rounds as its site does (NeoRestau lot 1, Ruling 70): a
 * //// site whose System Settings name no rounding method rounds with Frappe's default, « Banker's Rounding (legacy) »,
 * //// where an exact half rounds up at a precision (frappe.utils.data._bankers_rounding_legacy). The till rounded those
 * //// sites' half-cents to even, a cent away from the invoice.
 */
import { afterEach, describe, expect, it } from "vitest"
import { initPrecision, roundCurrency } from "../currency"

describe("the till rounds as its site does", () => {
	afterEach(() =>
		initPrecision({ currency: 2, float: 3, rounding_method: null }),
	)

	it("rounds an exact half-cent up where the site names no method, as Frappe's default does", () => {
		initPrecision({ currency: 2, float: 3, rounding_method: null })
		expect(roundCurrency(0.325)).toBe(0.33)
		expect(roundCurrency(0.125)).toBe(0.13)
		expect(roundCurrency(13.875)).toBe(13.88)
		// Below or above a half, as anywhere
		expect(roundCurrency(0.3249)).toBe(0.32)
		expect(roundCurrency(0.3251)).toBe(0.33)
		// A negative half goes up too (towards zero), as Frappe's floor-based rule does
		expect(roundCurrency(-0.325)).toBe(-0.32)
	})

	it("keeps each method a site names", () => {
		initPrecision({
			currency: 2,
			float: 3,
			rounding_method: "Banker's Rounding (legacy)",
		})
		expect(roundCurrency(0.325)).toBe(0.33)
		initPrecision({
			currency: 2,
			float: 3,
			rounding_method: "Banker's Rounding",
		})
		expect(roundCurrency(0.325)).toBe(0.32)
		initPrecision({
			currency: 2,
			float: 3,
			rounding_method: "Commercial Rounding",
		})
		expect(roundCurrency(0.325)).toBe(0.33)
	})
})
