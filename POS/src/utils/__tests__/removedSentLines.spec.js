/**
 * //// Neoffice — added file (no upstream equivalent). The dishes a waiter took off an order after they had left for the kitchen (NeoResto lot 1, product owner, 03.11.2026: a dish
 * //// removed, then « Back » without « Send », was lost without a word and the kitchen cooked it). Pure functions: the cart remembers what had left, and compares.
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { linesOfTheSavedOrder, removedSentLines, sentLinesOf } from "../removedSentLines"

const line = (code, quantity, status = "Pending", extra = {}) => ({
	item_code: code,
	item_name: code.toLowerCase(),
	uom: "Nos",
	quantity,
	kds_status: status,
	...extra,
})

describe("the lines that had left for the kitchen", () => {
	it("keeps the lines the kitchen has and leaves out those it has not", () => {
		const lines = [line("SOUP", 1), line("STEAK", 2, "Preparing"), line("TART", 1, ""), line("WINE", 1, "Waiting")]

		expect(sentLinesOf(lines).map((one) => one.item_code)).toEqual(["SOUP", "STEAK"])
	})

	it("adds the lines of one dish together, and keeps its unit apart", () => {
		const sent = sentLinesOf([line("SOUP", 1), line("SOUP", 2, "Ready"), line("SOUP", 1, "Pending", { uom: "Box" })])

		expect(sent).toEqual([
			expect.objectContaining({ item_code: "SOUP", uom: "Nos", quantity: 3 }),
			expect.objectContaining({ item_code: "SOUP", uom: "Box", quantity: 1 }),
		])
	})

	it("does not count the gift row of an offer: nobody ordered it", () => {
		expect(sentLinesOf([line("SOUP", 1), line("SOUP", 1, "Pending", { is_free_item: 1 })])[0].quantity).toBe(1)
	})

	it("is nothing for no lines", () => {
		expect(sentLinesOf(undefined)).toEqual([])
		expect(sentLinesOf([])).toEqual([])
	})
})

describe("the dishes taken off after they had left", () => {
	const before = () => sentLinesOf([line("SOUP", 1), line("STEAK", 2), line("TART", 1)])

	it("is nothing while the order holds what it held", () => {
		expect(removedSentLines(before(), [line("SOUP", 1), line("STEAK", 2), line("TART", 1)])).toEqual([])
	})

	it("names a dish whose line is gone, with its quantity", () => {
		expect(removedSentLines(before(), [line("SOUP", 1), line("TART", 1)])).toEqual([
			expect.objectContaining({ item_code: "STEAK", item_name: "steak", quantity: 2 }),
		])
	})

	it("counts what is missing of a line lowered, not the whole line", () => {
		expect(removedSentLines(before(), [line("SOUP", 1), line("STEAK", 1), line("TART", 1)])).toEqual([
			expect.objectContaining({ item_code: "STEAK", quantity: 1 }),
		])
	})

	it("says nothing of units added, or of a line that was never sent", () => {
		const now = [line("SOUP", 1), line("SOUP", 1, ""), line("STEAK", 2), line("TART", 1), line("CAKE", 1, "")]

		expect(removedSentLines(before(), now)).toEqual([])
	})

	it("does not count a dish put back after it was taken off", () => {
		expect(removedSentLines(before(), [line("SOUP", 1), line("STEAK", 1), line("STEAK", 1), line("TART", 1)])).toEqual([])
	})

	it("says nothing when nothing had left", () => {
		expect(removedSentLines([], [line("SOUP", 1, "")])).toEqual([])
		expect(removedSentLines(undefined, undefined)).toEqual([])
	})
})

describe("what a cancellation saves", () => {
	it("keeps the lines the saved order has, a course held back included, and leaves out a line never sent", () => {
		const lines = [line("SOUP", 1), line("TART", 1, ""), line("WINE", 1, "Waiting"), line("STEAK", 1, "Ready")]

		expect(linesOfTheSavedOrder(lines).map((one) => one.item_code)).toEqual(["SOUP", "WINE", "STEAK"])
	})
})
