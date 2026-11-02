//// Neoffice — added file (no upstream equivalent). The till's arithmetic on the portions the kitchen made (NeoResto lot 1, Daniel, 02.11.2026).
import { describe, expect, it } from "vitest"
import { ADD_CHOICES, leftToSell, whatATapDoes, wholePortions } from "../portions"

describe("what the till may still sell of a counted product", () => {
	it("is what the server says is left, less the cart", () => {
		expect(leftToSell({ left: 5 }, 2)).toBe(3)
		expect(leftToSell({ left: 5 })).toBe(5)
	})

	it("goes below zero when the cart holds more than is left", () => {
		expect(leftToSell({ left: 1 }, 3)).toBe(-2)
	})

	it("is nothing at all for a product nobody counts, or whose portions were made another day", () => {
		expect(leftToSell(null, 2)).toBeNull()
		expect(leftToSell(undefined)).toBeNull()
		expect(leftToSell({ left: null }, 2)).toBeNull()
	})
})

describe("a quantity of portions to add", () => {
	it("is a whole number above zero", () => {
		expect(wholePortions(3)).toBe(3)
		expect(wholePortions("5")).toBe(5)
	})

	it("is nothing else", () => {
		for (const refused of [0, -2, 2.5, "x", "", null, undefined]) expect(wholePortions(refused)).toBeNull()
	})

	it("is offered in a few quick choices the kitchen's answers fit in", () => {
		expect(ADD_CHOICES).toEqual(expect.arrayContaining([2, 3, 5]))
	})
})

describe("what a tap on a tile does", () => {
	it("orders a dish that has portions left, whatever the restaurant chose", () => {
		for (const greyOut of [true, false]) {
			expect(whatATapDoes({ soldOut: false, greyOut, counted: true })).toBe("order")
		}
	})

	it("refuses a sold-out dish where the restaurant greys it out, and opens the addition for a counted one", () => {
		expect(whatATapDoes({ soldOut: true, greyOut: true, counted: false })).toBe("refuse")
		expect(whatATapDoes({ soldOut: true, greyOut: true, counted: true })).toBe("add-portions")
	})

	it("takes the order with a warning where the restaurant does not grey out", () => {
		for (const counted of [true, false]) {
			expect(whatATapDoes({ soldOut: true, greyOut: false, counted })).toBe("warn-and-order")
		}
	})
})
