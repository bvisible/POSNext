//// Neoffice — added file (no upstream equivalent). The payment window and the credit the site offers a customer (NeoSalon, voie 4, 19.11.2026): what she asked to keep, as a credit, of a down
//// payment paid online beyond her sale is hers to spend at her next sale, even where the till's credit setting is off. The same source reading as the other specs of the dialog (too large to mount here).
import { describe, expect, it } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"

describe("the payment window and the credit the site offers a customer", () => {
	it("shows the credit block when the site offers the customer an advance, whatever the till's setting", () => {
		expect(dialogSource).toContain(
			"return props.allowCreditSale || props.allowCustomerCreditPayment || Number(customerBalance.value.offered_credit) > 0;"
		)
	})

	it("reads the balance of every customer, and her credit sources only where the till takes credit", () => {
		expect(dialogSource).toMatch(/if \(customer && company\) \{\n\t\t\tlog\.debug\("\[PaymentDialog\] Pre-fetching customer balance for:", customer\);\n\t\t\tcustomerBalanceResource\.fetch\(\);\n(?:\t\t\t\/\/\/\/[^\n]*\n)?\t\t\tif \(creditEnabled\) customerCreditResource\.fetch\(\);/)
		expect(dialogSource).toMatch(/if \(props\.customer && props\.company\) \{\n\t\t\tcustomerBalanceResource\.fetch\(\);\n\t\t\tif \(creditEnabled\) customerCreditResource\.fetch\(\);/)
		expect(dialogSource).not.toMatch(/if \(creditEnabled && customer && company\)/)
	})

	it("lists her credit sources before the block shows, when the site offers her credit and the till would not", () => {
		expect(dialogSource).toContain("if (Number(data?.offered_credit) > 0 && !(props.allowCreditSale || props.allowCustomerCreditPayment)) {")
		expect(dialogSource).toContain("customerCreditResource.fetch().then(settle, settle);")
	})

	it("never keeps the balance of the customer before while another one's is read", () => {
		expect(dialogSource).toContain("customerBalance.value = { total_outstanding: 0, total_credit: 0, net_balance: 0 };\n\t\tcustomerCredit.value = [];")
	})
})
