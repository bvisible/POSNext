/**
 * //// Neoffice — added file (no upstream equivalent). The rules of the payments typed into the payment dialog before the ticket is closed (NeoResto lot 1; product owner, 05.11.2026): a cash entry is taken
 * //// back and paid again with another method, an entry a terminal captured (card, TWINT) is never taken back.
 */
import { describe, expect, it } from "vitest"
import { entryRows, isLockedEntry, lockedEntries, withoutEntry } from "../paymentEntries"

const CASH = { mode_of_payment: "Espèce", amount: 70 }
const CARD = { mode_of_payment: "Carte de crédit", amount: 16.5, is_locked: true, type: "Card" }
const TWINT = { mode_of_payment: "Twint", amount: 10, is_locked: true }

describe("which entry is a terminal's", () => {
	it("is locked only when the terminal says it captured it", () => {
		expect(isLockedEntry(CARD)).toBe(true)
		expect(isLockedEntry(CASH)).toBe(false)
		for (const nothing of [undefined, null, {}, { is_locked: 0 }, { is_locked: false }]) expect(isLockedEntry(nothing)).toBe(false)
	})
})

describe("the rows of the list", () => {
	it("keep the place of each entry in the dialog's list, its method, its amount and whether it is locked", () => {
		expect(entryRows([CASH, CARD])).toEqual([
			{ index: 0, mode: "Espèce", amount: 70, locked: false },
			{ index: 1, mode: "Carte de crédit", amount: 16.5, locked: true },
		])
	})

	it("is empty for no entry, and tolerates an entry with nothing in it", () => {
		expect(entryRows([])).toEqual([])
		expect(entryRows(undefined)).toEqual([])
		expect(entryRows([{}])).toEqual([{ index: 0, mode: "", amount: 0, locked: false }])
	})
})

describe("taking a payment back", () => {
	it("removes a cash entry and leaves the others where they are", () => {
		const entries = [CARD, CASH, TWINT]

		expect(withoutEntry(entries, 1)).toEqual([CARD, TWINT])
		expect(entries).toEqual([CARD, CASH, TWINT])
	})

	it("never removes an entry a terminal captured: the customer has paid it", () => {
		const entries = [CASH, CARD]

		expect(withoutEntry(entries, 1)).toBe(entries)
	})

	it("leaves the list as it is for a place that has no entry", () => {
		const entries = [CASH]

		for (const at of [-1, 1, 5, undefined]) expect(withoutEntry(entries, at)).toBe(entries)
		expect(withoutEntry(undefined, 0)).toEqual([])
	})
})

describe("clearing all", () => {
	it("leaves only what a terminal captured", () => {
		expect(lockedEntries([CASH, CARD, { mode_of_payment: "Espèce", amount: 5 }, TWINT])).toEqual([CARD, TWINT])
		expect(lockedEntries([CASH])).toEqual([])
		expect(lockedEntries(undefined)).toEqual([])
	})
})
