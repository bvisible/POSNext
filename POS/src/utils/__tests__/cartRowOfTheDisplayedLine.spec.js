/**
 * //// Neoffice — added file (no upstream equivalent). The cart shows copies of its lines (nestFreeRows,
 * //// upstream 74c0aee5) while the remove button, the single send to the kitchen and the options dialog
 * //// address a line by identity (the same dish can sit twice, 7e1376a3): every shown line leads back to
 * //// the cart row it was copied from.
 */
import { describe, expect, it } from "vitest"
import { cartRowOf } from "../cartRow"
import { nestFreeRows } from "../gwpSameItemFreeRows"

const line = (code, extra = {}) => ({ item_code: code, uom: "Nos", quantity: 1, rate: 10, ...extra })

describe("a shown line leads back to its cart row", () => {
	it("each paid line and each gift", () => {
		const burger = line("BURGER")
		const fries = line("FRIES")
		const gift = line("SODA", { is_free_item: 1, pricing_rules: "PR-1" })
		burger.pricing_rules = "PR-1"
		const cart = [burger, fries, gift]
		const shown = nestFreeRows(cart)
		expect(shown).toHaveLength(3)
		for (const copy of shown) expect(copy).not.toBe(cartRowOf(copy))
		expect(shown.map(cartRowOf)).toEqual(expect.arrayContaining(cart))
		expect(cartRowOf(shown.find((l) => l.item_code === "SODA"))).toBe(gift)
	})

	it("two lines of the same dish lead back to their own rows", () => {
		const first = line("BURGER", { posa_special_instructions: "no onion" })
		const second = line("BURGER", { posa_special_instructions: "extra cheese" })
		const shown = nestFreeRows([first, second])
		expect(cartRowOf(shown[0])).toBe(first)
		expect(cartRowOf(shown[1])).toBe(second)
	})

	it("a cart row is its own row, and nothing is its own nothing", () => {
		const row = line("BURGER")
		expect(cartRowOf(row)).toBe(row)
		expect(cartRowOf(null)).toBe(null)
		expect(cartRowOf(undefined)).toBe(undefined)
	})

	it("the way back never reaches a payload", () => {
		const shown = nestFreeRows([line("BURGER")])[0]
		expect(JSON.parse(JSON.stringify(shown))).toEqual(JSON.parse(JSON.stringify({ ...line("BURGER"), _bundledFreeQty: 0 })))
		expect(cartRowOf({ ...shown })).toEqual({ ...shown })
	})
})
