/**
 * //// Neoffice — added file (no upstream equivalent). The table shows the kitchen's state on a line, except for a station that works on paper alone
 * //// (NeoResto lot 1, Daniel, 02.11.2026: « on n'a plus cette notion du tout affichée sur les tables »). « Waiting » is the waiter's own hold on a course,
 * //// not the kitchen's state: it shows as ever.
 */
import { describe, expect, it } from "vitest"
import { showsKitchenState } from "../lineKitchenState"

const paper = (station) => station === "Kitchen"

describe("the kitchen state of a line at the table", () => {
	it("shows the state of a line of a station with a screen", () => {
		for (const status of ["Pending", "Preparing", "Ready", "Delivered", "Waiting"])
			expect(showsKitchenState({ kds_status: status, preparation_station: "Bar" }, paper)).toBe(true)
	})

	it("shows no state on a line of a station that works on paper alone", () => {
		for (const status of ["Pending", "Preparing", "Ready", "Delivered"])
			expect(showsKitchenState({ kds_status: status, preparation_station: "Kitchen" }, paper)).toBe(false)
	})

	it("still shows the hold of a course at a paper-only station: it is the waiter's", () => {
		expect(showsKitchenState({ kds_status: "Waiting", preparation_station: "Kitchen" }, paper)).toBe(true)
	})

	it("shows nothing on a line that has no state", () => {
		expect(showsKitchenState({ kds_status: "", preparation_station: "Bar" }, paper)).toBe(false)
		expect(showsKitchenState(null, paper)).toBe(false)
	})

	it("shows every state when the till does not know paper-only stations", () => {
		expect(showsKitchenState({ kds_status: "Pending", preparation_station: "Kitchen" })).toBe(true)
	})
})
