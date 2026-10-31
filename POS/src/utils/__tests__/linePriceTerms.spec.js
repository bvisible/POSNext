/**
 * //// Neoffice — added file (no upstream equivalent). The price terms of a cart line: whether two lines bill one unit the
 * //// same way, and what a unit added to a line takes from it (NeoRestau lot 1, task 22, fix round 2).
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

	it("keeps the rest of the row, the rate set by hand included, and does not change the row it is given", () => {
		const row = { ...byHand, rate: 7.2, discount_percentage: 10, qty: 2 }
		const line = storedRowTerms(row)

		expect(line).toEqual({ ...row, discount_percentage: 0 })
		expect(row.discount_percentage).toBe(10)
	})
})
