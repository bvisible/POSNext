/**
 * //// Neoffice — added file (no upstream equivalent). The price terms of a cart line: whether two lines bill one unit the
 * //// same way, and what a unit added to a line takes from it (NeoResto lot 1, task 22, fix round 2).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import {
	carriedPriceTerms,
	priceTermsOf,
	samePriceTerms,
	storedRowTerms,
} from "../linePriceTerms"

const plain = { rate: 29, price_list_rate: 29 }
const byHand = {
	rate: 25,
	price_list_rate: 29,
	is_rate_manually_edited: 1,
	original_rate: 29,
}

describe("priceTermsOf", () => {
	it("a line at the list price bills the list price", () => {
		expect(priceTermsOf(plain)).toEqual({ manual: false, rate: 29, discount: 0 })
	})

	it("a rate set by hand wins over the list price", () => {
		expect(priceTermsOf(byHand)).toEqual({ manual: true, rate: 25, discount: 0 })
	})

	it("a discount counts in percent", () => {
		expect(priceTermsOf({ ...plain, discount_percentage: 10 }).discount).toBe(10)
	})

	it("nothing bills nothing", () => {
		expect(priceTermsOf(null)).toEqual({ manual: false, rate: 0, discount: 0 })
	})
})

describe("samePriceTerms", () => {
	it("two plain lines of the same price bill the same way", () => {
		expect(samePriceTerms(plain, { ...plain, quantity: 3 })).toBe(true)
	})

	it("a rate set by hand and the list price do not, even at the same figure", () => {
		expect(samePriceTerms(plain, { ...plain, is_rate_manually_edited: 1 })).toBe(false)
	})

	it("two rates set by hand at different prices do not", () => {
		expect(samePriceTerms(byHand, { ...byHand, rate: 30 })).toBe(false)
	})

	it("a discount makes the difference", () => {
		expect(samePriceTerms(plain, { ...plain, discount_percentage: 10 })).toBe(false)
		expect(
			samePriceTerms(
				{ ...plain, discount_percentage: 10 },
				{ ...plain, discount_percentage: 10.00001 },
			),
		).toBe(true)
	})
})

describe("carriedPriceTerms", () => {
	it("carries the discount, and the rate set by hand with the price it replaced", () => {
		expect(
			carriedPriceTerms({ ...byHand, discount_percentage: 10 }),
		).toEqual({
			discount_percentage: 10,
			is_rate_manually_edited: 1,
			original_rate: 29,
		})
	})

	it("carries no rate set by hand for a line that has none", () => {
		expect(carriedPriceTerms(plain)).toEqual({ discount_percentage: 0 })
	})
})

describe("storedRowTerms", () => {
	it("takes the discount out of a stored row, whose rate is already net of it", () => {
		const row = { ...byHand, rate: 7.2, discount_percentage: 10, discount_amount: 0 }
		expect(storedRowTerms(row).discount_percentage).toBe(0)
	})

	it("keeps the discount of a row at the list price, whose rate is net of it, and says the cart must take it (#2074)", () => {
		const row = { rate: 9, price_list_rate: 10, discount_percentage: 10, discount_amount: 1, is_rate_manually_edited: 0 }
		const line = storedRowTerms(row)

		expect(line.discount_percentage).toBe(10)
		expect(line.discount_amount).toBe(0)
		expect(line.carries_price_terms).toBe(true)
		expect(line.rate).toBe(9)
		expect(line.price_list_rate).toBe(10)
		expect(row.discount_percentage).toBe(10)
		expect(row.discount_amount).toBe(1)
		expect(row.carries_price_terms).toBeUndefined()
	})

	it("derives the percentage of a row discounted by an amount from its list price and its net rate", () => {
		const line = storedRowTerms({ rate: 8, price_list_rate: 10, discount_percentage: 0, discount_amount: 2 })

		expect(line.discount_percentage).toBeCloseTo(20, 6)
		expect(line.carries_price_terms).toBe(true)
	})

	it("bills a row without a discount as it always did, and says its terms too so that it never joins a discounted line", () => {
		const row = { rate: 10, price_list_rate: 10, discount_percentage: 0, discount_amount: 0 }

		expect(storedRowTerms(row)).toEqual({ ...row, carries_price_terms: true })
		expect(storedRowTerms({ rate: 10, discount_percentage: 0 }).discount_percentage).toBe(0)
	})

	it("leaves an offered row and a free row to the cart's own terms", () => {
		const offered = { rate: 0, price_list_rate: 10, discount_percentage: 100, posa_is_offered: 1 }
		const free = { rate: 0, price_list_rate: 0, discount_percentage: 0, is_free_item: 1 }

		expect(storedRowTerms(offered)).toEqual({ ...offered, discount_percentage: 0 })
		expect(storedRowTerms(free)).toEqual(free)
	})

	it("keeps the rest of the row, the rate set by hand included, and does not change the row it is given", () => {
		const row = { ...byHand, rate: 7.2, discount_percentage: 10, qty: 2 }
		const line = storedRowTerms(row)

		expect(line).toEqual({ ...row, discount_percentage: 0 })
		expect(row.discount_percentage).toBe(10)
	})
})
