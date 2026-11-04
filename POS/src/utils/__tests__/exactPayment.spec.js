/**
 * //// Neoffice — added file (no upstream equivalent). The payment dialog's « exact » button pays the rest with the
 * //// method the cashier picked: with « Carte de crédit » picked it read « Espèces exactes » and booked the sale in cash
 * //// (osiris, 2026-11-04). PaymentDialog.vue is too large to mount here, so the rule is tested on its own
 * //// (utils/exactPayment.js) and its wiring is read in the dialog's source.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { exactPaymentMethod } from "../exactPayment"

const CASH = { mode_of_payment: "Espèce", type: "Cash" }
const CARD = { mode_of_payment: "Carte de crédit", type: "Bank" }
const TWINT = { mode_of_payment: "Twint", type: "Bank" }
const WALLET = { mode_of_payment: "Wallet", type: "Bank" }
const methods = [CASH, CARD, TWINT, WALLET]

const exact = (over = {}) =>
	exactPaymentMethod({
		methods,
		picked: CASH,
		isCash: (m) => m.type === "Cash",
		canPayExact: (m) => m.mode_of_payment !== "Wallet",
		entered: false,
		remaining: 39,
		writingOff: false,
		...over,
	})

describe("the method of the « exact » button", () => {
	it("is the card the cashier picked, not cash", () => {
		expect(exact({ picked: CARD })).toBe(CARD)
		expect(exact({ picked: TWINT })).toBe(TWINT)
	})

	it("is cash when cash is picked, or nothing is", () => {
		expect(exact()).toBe(CASH)
		expect(exact({ picked: null })).toBe(CASH)
	})

	it("falls back on cash for a method that may not take the whole rest, or one the dialog does not offer", () => {
		expect(exact({ picked: WALLET })).toBe(CASH)
		expect(exact({ picked: { mode_of_payment: "Gone" } })).toBe(CASH)
	})

	it("is none once an amount is entered, when nothing is left, or while a write-off settles the rest", () => {
		expect(exact({ picked: CARD, entered: true })).toBeNull()
		expect(exact({ picked: CARD, remaining: 0 })).toBeNull()
		expect(exact({ picked: CARD, writingOff: true })).toBeNull()
		expect(exact({ methods: [CARD], picked: null })).toBeNull()
	})
})

describe("PaymentDialog.vue", () => {
	const source = readFileSync(path.resolve(__dirname, "../../components/sale/PaymentDialog.vue"), "utf8")

	it("asks exactPaymentMethod with the cashier's pick", () => {
		expect(source).toMatch(/exactCashMethod = computed\(\(\) =>\s*exactPaymentMethod\(\{/)
		expect(source).toMatch(/picked: lastSelectedMethod\.value/)
	})

	it("says « Exact cash » only for cash, and opens the terminal of a method that has one", () => {
		expect(source).toMatch(/isCashPaymentMethod\(exactCashMethod\)\s*\?\s*__\("Exact cash \{0\}"/)
		expect(source).toMatch(/__\("Pay with \{0\}", \[exactCashMethod\.mode_of_payment\]\)/)
		expect(source).toMatch(/getMappedDriver\(method\.mode_of_payment\)[^\n]*\n\s*openTerminalDialog\(method\)/)
	})
})
