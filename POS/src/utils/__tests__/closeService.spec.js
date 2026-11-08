/**
 * //// Neoffice — added file (no upstream equivalent). Closing the service of the restaurant (NeoResto lot 1, the product owner, 08.11.2026): the stage of each open order tells what the
 * //// service does with it. The empty tables go by themselves, every other order is settled before the service closes, and the lines say what the closing will do and did.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

import { byItselfLines, canClose, closedLines, leftLine, leftToSettle, neverSentLine, neverSentReason, stagesOf } from "../closeService"

const orders = [
	{ name: "A", stage: "empty" },
	{ name: "B", stage: "never_sent" },
	{ name: "C", stage: "sent" },
	{ name: "D", stage: "holds_money" },
	{ name: "E", stage: "empty" },
]

describe("the stages of the open orders", () => {
	it("groups them by what the server says", () => {
		const stages = stagesOf(orders)

		expect(stages.empty.map((order) => order.name)).toEqual(["A", "E"])
		expect(stages.neverSent.map((order) => order.name)).toEqual(["B"])
		expect(stages.sent.map((order) => order.name)).toEqual(["C"])
		expect(stages.holdsMoney.map((order) => order.name)).toEqual(["D"])
	})

	it("reads nothing as no order", () => {
		for (const nothing of [undefined, null, "x"]) {
			expect(stagesOf(nothing)).toEqual({
				empty: [],
				neverSent: [],
				sent: [],
				holdsMoney: [],
			})
		}
	})

	it("leaves to settle every order but the empty tables", () => {
		expect(leftToSettle(orders).map((order) => order.name)).toEqual(["B", "C", "D"])
	})

	it("closes only when none is left but the empty ones", () => {
		expect(canClose(orders)).toBe(false)
		expect(canClose([{ stage: "empty" }, { stage: "empty" }])).toBe(true)
		expect(canClose([])).toBe(true)
	})
})

describe("the lines", () => {
	it("tells what the closing does by itself, in the singular and the plural, and nothing when it has nothing to do", () => {
		expect(byItselfLines({ empty_orders: 1, tables_to_free: 1, dishes_to_deliver: 1 })).toEqual([
			"1 table opened and left is removed",
			"1 dish of a table already paid is marked delivered",
			"1 table is freed",
		])
		expect(byItselfLines({ empty_orders: 2, tables_to_free: 5, dishes_to_deliver: 3 })).toEqual([
			"2 tables opened and left are removed",
			"3 dishes of tables already paid are marked delivered",
			"5 tables are freed",
		])
		expect(byItselfLines({})).toEqual([])
		expect(byItselfLines(null)).toEqual([])
	})

	it("counts the orders left to settle", () => {
		expect(leftLine(0)).toBe("")
		expect(leftLine(1)).toBe("1 order is left to settle")
		expect(leftLine(4)).toBe("4 orders are left to settle")
	})

	it("says the orders that never left for the kitchen consumed nothing", () => {
		expect(neverSentLine(0)).toBe("")
		expect(neverSentLine(1)).toBe("1 order never left for the kitchen: nothing was consumed")
		expect(neverSentLine(2)).toBe("2 orders never left for the kitchen: nothing was consumed")
	})

	it("writes the reason of the orders cancelled together", () => {
		expect(neverSentReason()).toBe("Never sent to the kitchen")
	})

	it("tells what the closing did, leaving out what it did not", () => {
		expect(
			closedLines({
				orders_settled: 2,
				empty_orders_removed: 1,
				tables_freed: 7,
				dishes_delivered: 3,
			}),
		).toEqual(["2 orders settled", "1 empty table removed", "3 dishes marked delivered", "7 tables freed"])
		expect(closedLines({ orders_settled: 0, tables_freed: 1 })).toEqual(["1 table freed"])
		expect(closedLines(null)).toEqual([])
	})
})
