//// Neoffice — added file (no upstream equivalent). The summary of the payment window for a line a package pays (NeoSalon lots G11; the audit of 18.11): worth 0.00, said by what settles it. The dialog is read from its source,
//// as the other specs of the dialog do: `item.amount || qty × rate` read the 0.00 of such a line as « missing » and drew its full price (« CHF 80.00 » in a total of 0.00).
import { describe, expect, it } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"

describe("the payment window's summary of a line a package pays", () => {
	it("draws the line's own amount, 0.00 included, never `amount || quantity × rate`", () => {
		expect(dialogSource).toContain("formatCurrency(lineAmountOf(item))")
		expect(dialogSource).not.toMatch(/item\.amount\s*\|\|/)
	})

	it("says by what the line is settled", () => {
		expect(dialogSource).toContain('data-test="payment-line-package"')
		expect(dialogSource).toContain("item.package_label")
	})
})
