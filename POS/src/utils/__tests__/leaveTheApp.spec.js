/**
 * //// Neoffice — added file (no upstream equivalent). The phone of a waiter is no way out of the till (the product owner, 08.11.2026): a restaurant till, a phone's width, a user who does not lay the floor
 * //// out. A manager, a tablet, a computer and a till that is no restaurant's keep the way to the back office.
 */
import { describe, expect, it } from "vitest"
import { isTheWaitersPhone } from "../leaveTheApp"

describe("the phone of a waiter", () => {
	it("is a restaurant till on a phone used by someone who does not lay the floor out", () => {
		expect(isTheWaitersPhone({ restaurant: true, phone: true, canManageFloor: false })).toBe(true)
	})

	it("is not the phone of a manager", () => {
		expect(isTheWaitersPhone({ restaurant: true, phone: true, canManageFloor: true })).toBe(false)
	})

	it("is not a tablet nor a computer, whoever uses it", () => {
		expect(isTheWaitersPhone({ restaurant: true, phone: false, canManageFloor: false })).toBe(false)
		expect(isTheWaitersPhone({ restaurant: true, phone: false, canManageFloor: true })).toBe(false)
	})

	it("is not the phone of a till that is no restaurant's", () => {
		expect(isTheWaitersPhone({ restaurant: false, phone: true, canManageFloor: false })).toBe(false)
	})

	it("is never true for a context that says nothing", () => {
		expect(isTheWaitersPhone()).toBe(false)
		expect(isTheWaitersPhone({})).toBe(false)
	})
})
