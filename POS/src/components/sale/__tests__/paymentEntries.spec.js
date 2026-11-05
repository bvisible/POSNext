/**
 * //// Neoffice — added file (no upstream equivalent). The list of the payments typed so far, in the payment dialog (NeoResto lot 1; product owner, 05.11.2026: « avant la clôture du ticket, repasser ce montant en
 * //// carte ou en Twint si la personne n'a pas assez de cash »): a cash row has a button that takes it back, a terminal's row is locked and has none. The dialog's wiring is read from its source.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"
import PaymentEntries from "../PaymentEntries.vue"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const CASH = { mode_of_payment: "Espèce", amount: 70 }
const CARD = { mode_of_payment: "Carte de crédit", amount: 16.5, is_locked: true }

function list(entries) {
	return mount(PaymentEntries, {
		props: { entries, format: (amount) => `CHF ${Number(amount).toFixed(2)}` },
		global: { mocks: { __: globalThis.__ } },
	})
}

describe("the payments typed so far", () => {
	it("draws nothing when no payment was typed", () => {
		expect(list([]).find('[data-test="payment-entries"]').exists()).toBe(false)
	})

	it("draws one row per payment, with its method and its amount", () => {
		const rows = list([CASH, CARD]).findAll('[data-test="payment-entry"]')

		expect(rows).toHaveLength(2)
		expect(rows[0].find('[data-test="payment-entry-mode"]').text()).toBe("Espèce")
		expect(rows[0].find('[data-test="payment-entry-amount"]').text()).toBe("CHF 70.00")
		expect(rows[1].find('[data-test="payment-entry-amount"]').text()).toBe("CHF 16.50")
	})

	it("lets a cash row be taken back and says which one, by its place in the dialog's list", async () => {
		const wrapper = list([CARD, CASH])

		const buttons = wrapper.findAll('[data-test="payment-entry-remove"]')
		expect(buttons).toHaveLength(1)
		await buttons[0].trigger("click")

		expect(wrapper.emitted("remove")).toEqual([[1]])
	})

	it("locks what a terminal captured: a lock, and no button to take it back", () => {
		const row = list([CARD]).get('[data-test="payment-entry"]')

		expect(row.attributes("data-locked")).toBe("true")
		expect(row.find('[data-test="payment-entry-lock"]').exists()).toBe(true)
		expect(row.find('[data-test="payment-entry-remove"]').exists()).toBe(false)
	})

	it("has a button a finger can hit (36 px at least) with a name for the screen reader", () => {
		const button = list([CASH]).get('[data-test="payment-entry-remove"]')

		expect(button.classes()).toEqual(expect.arrayContaining(["h-9", "w-9"]))
		expect(button.attributes("aria-label")).toBe("Take back this payment")
	})
})

describe("the payment dialog", () => {
	it("draws the list under the totals and takes a payment back through the rules, never by hand", () => {
		expect(dialogSource).toMatch(/<PaymentEntries[^>]*:entries="paymentEntries"[^>]*@remove="takeBackPayment"/)
		expect(dialogSource).toContain("paymentEntries.value = withoutEntry(paymentEntries.value, index)")
	})

	it("keeps what a terminal captured when all the payments are cleared", () => {
		expect(dialogSource).toContain("paymentEntries.value = lockedEntries(paymentEntries.value)")
		expect(dialogSource).not.toMatch(/function clearAll\(\) \{\s*paymentEntries\.value = \[\]/)
	})
})
