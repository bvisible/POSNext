//// Neoffice — added file (no upstream equivalent). The payment window and an appointment paid ahead online whose sale then shrank (NeoSalon, voie 4, 19.11.2026): the surplus is said, never
//// handed back as cash change, and no way to book the sale hides it. The same source reading as the other specs of the dialog (it is too large to mount here); the arithmetic is in utils/__tests__/onlineSurplus.spec.js.
import { describe, expect, it } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"

describe("the payment window and what was paid online beyond the sale", () => {
	it("measures the cash change without the online surplus", () => {
		expect(dialogSource).toContain("cashChangeOf(totalPaid.value, effectiveGrandTotal.value, onlineSurplus.value)")
		expect(dialogSource).not.toMatch(/const change = totalPaid\.value - effectiveGrandTotal\.value;/)
	})

	it("leaves a restaurant its reading: a guest who pays more on a phone leaves a tip", () => {
		expect(dialogSource).toMatch(/restaurantStore\?\.isEnabled \? 0 : onlineSurplusOf\(props\.guestPaidAmount, effectiveGrandTotal\.value\)/)
	})

	it("says the surplus where the change would be", () => {
		expect(dialogSource).toContain('data-test="payment-online-surplus"')
		expect(dialogSource).toContain('__("Overpaid online")')
		expect(dialogSource).toContain("formatCurrency(onlineSurplus)")
	})

	it("does not let the sale be completed, nor finalised by any other way, while there is a surplus", () => {
		const completes = dialogSource.slice(dialogSource.indexOf("const canComplete = computed(() => {"))
		expect(completes.slice(0, 400)).toContain("if (onlineSurplus.value > 0) {\n\t\treturn false;")
		const finalises = dialogSource.slice(dialogSource.indexOf("function finalizePayment(isPartial) {"))
		expect(finalises.slice(0, 1200)).toContain("if (onlineSurplus.value > 0) {")
	})
})
