/**
 * //// Neoffice — added file (no upstream equivalent). The receipt window says what the customer paid, not the note he
 * //// handed over (neoffice-maintenance#2163, the restaurant film of 02.11.2026): 100 paid for 88 read « Paid: 100.00 »
 * //// with 12 handed back. The till sends the tendered amount and the change; the window says the amount paid, the change
 * //// taken off, and the change on a line of its own.
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"

globalThis.__ = (s) => s

const { usePOSUIStore } = await import("../posUI")

describe("the receipt window after a payment (neoffice-maintenance#2163)", () => {
	let ui
	beforeEach(() => {
		setActivePinia(createPinia())
		ui = usePOSUIStore()
	})

	it("says 88 paid and 12 handed back when 100 were tendered for 88", () => {
		ui.showSuccess("FA-0001", 88, 100, 0, 12)

		expect(ui.lastPaidAmount).toBe(88)
		expect(ui.lastChangeAmount).toBe(12)
		expect(ui.showSuccessDialog).toBe(true)
	})

	it("says the exact amount paid, and no change, when nothing is handed back", () => {
		ui.showSuccess("FA-0002", 56.5, 56.5)

		expect(ui.lastPaidAmount).toBe(56.5)
		expect(ui.lastChangeAmount).toBe(0)
	})

	it("forgets the change of the sale before", () => {
		ui.showSuccess("FA-0003", 88, 100, 0, 12)
		ui.showSuccess("FA-0004", 20, 20, 0, 0)

		expect(ui.lastPaidAmount).toBe(20)
		expect(ui.lastChangeAmount).toBe(0)
	})

	it("keeps the amount paid of a sale put on the customer's account, and what he still owes", () => {
		ui.showSuccess("FA-0005", 14.9, 0, 14.9)

		expect(ui.lastPaidAmount).toBe(0)
		expect(ui.lastDueAmount).toBe(14.9)
		expect(ui.lastChangeAmount).toBe(0)
	})
})
