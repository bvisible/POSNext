/**
 * //// Neoffice — added file (no upstream equivalent). What a restaurant's phone does once a sale is paid (NeoRestau lot 1, kitchen test of 01.11):
 * //// it goes back to the tables instead of staying on the empty cart tab, and the receipt window closes by itself a moment after Print.
 */
import { describe, expect, it } from "vitest"
import {
	SUCCESS_CLOSE_AFTER_PRINT_MS,
	closeAfterPrintMs,
	tabAfterPayment,
} from "../afterPayment"

describe("the tab a phone goes back to once a sale is paid", () => {
	it("is the items tab of a restaurant's phone, where the floor plan is shown when no table is open", () => {
		expect(tabAfterPayment({ restaurant: true, desktop: false })).toBe("items")
	})

	it("is none on a desktop, whose two panes are always there, nor on a till that is no restaurant's", () => {
		expect(tabAfterPayment({ restaurant: true, desktop: true })).toBeNull()
		expect(tabAfterPayment({ restaurant: false, desktop: false })).toBeNull()
		expect(tabAfterPayment({})).toBeNull()
	})
})

describe("how long the receipt window stays after Print", () => {
	it("is a few seconds in a restaurant: the waiter prints, the window goes, the tables are back", () => {
		expect(closeAfterPrintMs({ restaurant: true })).toBe(SUCCESS_CLOSE_AFTER_PRINT_MS)
		expect(SUCCESS_CLOSE_AFTER_PRINT_MS).toBeGreaterThanOrEqual(2000)
		expect(SUCCESS_CLOSE_AFTER_PRINT_MS).toBeLessThanOrEqual(5000)
	})

	it("is for ever elsewhere: a retail cashier may print, then e-mail the same receipt", () => {
		expect(closeAfterPrintMs({ restaurant: false })).toBe(0)
		expect(closeAfterPrintMs({})).toBe(0)
	})
})
