//// Neoffice — added file (no upstream equivalent). The lines the offers never price: a line a package of sessions pays, an offered one (NeoSalon lots G11; the audit of 18.11). And what a summary
//// says of a line worth 0.00.
import { describe, expect, it } from "vitest"
import { isFixedRow, isPackageRow, lineAmountOf, withoutFixedRows } from "../packageRows"

describe("the lines the offers never price", () => {
	it("tells a line a package pays, an offered one and a paid one", () => {
		expect(isPackageRow({ customer_package: "CPK-1" })).toBe(true)
		expect(isPackageRow({ customer_package: null })).toBe(false)
		expect(isFixedRow({ customer_package: "CPK-1" })).toBe(true)
		expect(isFixedRow({ posa_is_offered: 1 })).toBe(true)
		expect(isFixedRow({ item_code: "A" })).toBe(false)
	})

	it("leaves them out of what the offers engine is sent, and nothing else", () => {
		const data = { customer: "C", items: [{ item_code: "A" }, { item_code: "B", customer_package: "CPK-1" }, { item_code: "C", posa_is_offered: 1 }] }

		expect(withoutFixedRows(data)).toEqual({ customer: "C", items: [{ item_code: "A" }] })
		expect(data.items).toHaveLength(3)
		expect(withoutFixedRows(null)).toBeNull()
	})
})

describe("what a line is worth in a summary", () => {
	it("keeps a 0.00 as it is: a line a package pays, a free one", () => {
		expect(lineAmountOf({ amount: 0, rate: 80, qty: 1 })).toBe(0)
		expect(lineAmountOf({ amount: "0", rate: 80, qty: 1 })).toBe(0)
	})

	it("is its own amount, else its quantity at its price", () => {
		expect(lineAmountOf({ amount: 72, rate: 80, qty: 1 })).toBe(72)
		expect(lineAmountOf({ rate: 9.5, quantity: 2 })).toBe(19)
		expect(lineAmountOf({ price_list_rate: 4, qty: 3 })).toBe(12)
		expect(lineAmountOf(null)).toBe(0)
	})
})
