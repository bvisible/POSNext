/**
 * //// Neoffice — added file (no upstream equivalent). What the status of a table says about tapping it: a table that has been paid or is being cleaned has no order to open, the cashier decides what happens to it
 * //// (NeoResto lot 1, Daniel, 01.11). The floor's list and the notice of a guest's order share the rule.
 */
import { describe, expect, it } from "vitest"
import { tableIsPaidAtService, tableNeedsCleaning } from "../tableStatus"

describe("a table that is tapped but not opened", () => {
	it("is a table that has been paid or is being cleaned", () => {
		expect(tableNeedsCleaning({ status: "Paid" })).toBe(true)
		expect(tableNeedsCleaning({ status: "Cleaning" })).toBe(true)
	})

	it("is no table that is occupied, free or reserved, nor one that is not there", () => {
		for (const status of ["Occupied", "Empty", "Reserved", undefined]) expect(tableNeedsCleaning({ status }), String(status)).toBe(false)
		expect(tableNeedsCleaning(undefined)).toBe(false)
		expect(tableNeedsCleaning(null)).toBe(false)
	})
})

describe("a table paid while dishes are still to serve", () => {
	it("is an occupied table the floor tells is paid", () => {
		expect(tableIsPaidAtService({ status: "Occupied", order_summary: { paid: true, item_count: 2 } })).toBe(true)
	})

	it("is no table with an open order, nor a table that is not occupied, nor one that is not there", () => {
		expect(tableIsPaidAtService({ status: "Occupied", order_summary: { item_count: 2 } })).toBe(false)
		expect(tableIsPaidAtService({ status: "Occupied", order_summary: { paid: false } })).toBe(false)
		expect(tableIsPaidAtService({ status: "Occupied", order_summary: null })).toBe(false)
		for (const status of ["Empty", "Paid", "Cleaning", "Reserved"]) {
			expect(tableIsPaidAtService({ status, order_summary: { paid: true } }), status).toBe(false)
		}
		expect(tableIsPaidAtService(undefined)).toBe(false)
		expect(tableIsPaidAtService(null)).toBe(false)
	})

	it("is not a table that needs cleaning: it is told apart, the cleaning rule does not count it", () => {
		expect(tableNeedsCleaning({ status: "Occupied", order_summary: { paid: true } })).toBe(false)
	})
})
