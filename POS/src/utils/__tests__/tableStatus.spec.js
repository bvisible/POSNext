/**
 * //// Neoffice — added file (no upstream equivalent). What the status of a table says about tapping it: a table that has been paid or is being cleaned has no order to open, the cashier decides what happens to it
 * //// (NeoResto lot 1, Daniel, 01.11). The floor's list and the notice of a guest's order share the rule.
 */
import { describe, expect, it } from "vitest"
import { tableNeedsCleaning } from "../tableStatus"

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
