//// Neoffice — added file (no upstream equivalent). The payment window and an appointment paid ahead online whose sale then shrank (NeoSalon, voie 4, 19.11.2026): the surplus is said, never
//// handed back as cash change, and it stays on the customer's account as a credit (the salon's choice of 19.11.2026): the sale is booked. The same source reading as the other specs of the dialog (it is too large to mount here); the arithmetic is in utils/__tests__/onlineSurplus.spec.js.
import { describe, expect, it } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"

describe("the payment window and what was paid online beyond the sale", () => {
	it("measures the cash change without the online surplus", () => {
		expect(dialogSource).toContain("cashChangeOf(totalPaid.value, effectiveGrandTotal.value, onlineSurplus.value)")
		expect(dialogSource).not.toMatch(/const change = totalPaid\.value - effectiveGrandTotal\.value;/)
	})

	it("warns of a large overpayment by the cash change alone, never by what was paid online", () => {
		expect(dialogSource).toContain("const overpay = cashChangeOf(newTotal, grandTotal, onlineSurplus.value);")
		expect(dialogSource).not.toMatch(/const overpay = newTotal - grandTotal;/)
	})

	it("leaves a restaurant its reading: a guest who pays more on a phone leaves a tip", () => {
		expect(dialogSource).toMatch(/restaurantStore\?\.isEnabled \? 0 : onlineSurplusOf\(props\.guestPaidAmount, effectiveGrandTotal\.value\)/)
	})

	it("says the surplus where the change would be", () => {
		expect(dialogSource).toContain('data-test="payment-online-surplus"')
		expect(dialogSource).toContain('__("Overpaid online")')
		expect(dialogSource).toContain("formatCurrency(onlineSurplus)")
	})

	it("books the sale when what was paid ahead online covers it, with no payment line of the till, and never refuses it for a surplus", () => {
		const completes = dialogSource.slice(dialogSource.indexOf("const canComplete = computed(() => {"))
		expect(completes.slice(0, 400)).not.toContain("onlineSurplus")
		expect(completes).toContain("if (paidAheadInFull.value && paymentEntries.value.length === 0) {\n\t\treturn true;")
		expect(dialogSource).toMatch(/const paidAheadInFull = computed\(\n\t\(\) => !restaurantStore\?\.isEnabled && coversTheSale\(props\.guestPaidAmount, effectiveGrandTotal\.value\)/)
		const finalises = dialogSource.slice(dialogSource.indexOf("function finalizePayment(isPartial) {"))
		expect(finalises.slice(0, 1500)).not.toContain("Overpaid online")
	})

	it("says that the difference goes back on her card by default, and offers to keep it as her credit when she asks (information, not a refusal)", () => {
		expect(dialogSource).toContain("the difference goes back to her on the card that paid")
		expect(dialogSource).toContain("at her request, the difference stays on her account as a credit")
		expect(dialogSource).toContain('data-test="payment-online-surplus-keep"')
		expect(dialogSource).toContain('v-model="keepOnlineSurplusAsCredit"')
		expect(dialogSource).not.toContain("The sale cannot be collected while")
	})

	it("keeps the choice off by default, forgets it with the surplus and at each opening, and sends it only with a surplus", () => {
		expect(dialogSource).toContain("const keepOnlineSurplusAsCredit = ref(false);")
		expect(dialogSource).toMatch(/watch\(onlineSurplus, \(surplus\) => \{\n\tif \(surplus <= 0\) keepOnlineSurplusAsCredit\.value = false;/)
		expect(dialogSource).toContain("lockedTerminalPayments.value = [];\n\t\t//// Neoffice — the choice for an online surplus is the sale's, never the next one's")
		expect(dialogSource).toContain("keep_online_surplus_as_credit: onlineSurplus.value > 0 && keepOnlineSurplusAsCredit.value ? 1 : 0,")
	})

	it("carries the choice from the dialog to the server, online and offline", async () => {
		const sale = (await import("../../../pages/POSSale.vue?raw")).default
		const store = (await import("../../../stores/posCart.js?raw")).default
		const invoice = (await import("../../../composables/useInvoice.js?raw")).default
		expect(sale).toContain("keepOnlineSurplusAsCredit: Boolean(paymentData.keep_online_surplus_as_credit),")
		expect(sale).toContain("keep_online_surplus_as_credit: paymentData.keep_online_surplus_as_credit ? 1 : 0,")
		expect(store).toContain("Boolean(options.keepOnlineSurplusAsCredit)")
		expect(invoice).toContain("keepOnlineSurplusAsCredit = false")
		expect(invoice).toContain("submitData.keep_online_surplus_as_credit = 1;")
	})
})
