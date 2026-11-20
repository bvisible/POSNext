//// Neoffice — added file (no upstream equivalent). The payment window asks for a sales person by the rule of utils/salesPersonLines.js, and says so where nobody can be chosen (neoffice-maintenance#3109).
//// The dialog is read from its source, as the other specs of the dialog do (it is too large to mount): the star, the blocking and the note all read the same computed.
import { describe, expect, it } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"

describe("the payment window's question of a sales person", () => {
	it("reads whether the sale asks for a person from the shared rule, not from a rule of its own", () => {
		expect(dialogSource).toContain("salesPersonIsRequired({")
		expect(dialogSource).toMatch(/const isSalesPersonValid = computed\(\(\) => \{\s*\/\/[^\n]*\n\s*if \(!salesPersonRequired\.value\)/)
	})

	it("stars the field only where it is asked for", () => {
		expect(dialogSource).not.toContain('<span class="text-red-500">*</span>')
		expect(dialogSource.match(/<span v-if="salesPersonRequired" class="text-red-500">\*<\/span>/g)).toHaveLength(2)
	})

	it("knows the list was read only from an answer, and forgets it with the till", () => {
		expect(dialogSource).toMatch(/salesPersonsRead\.value = true;/)
		expect(dialogSource).toMatch(/salesPersons\.value = \[\];\s*salesPersonsRead\.value = false;/)
		expect(dialogSource).toMatch(/\(\) => props\.posProfile,\s*\(\) => \{\s*salesPersonsRead\.value = false;/)
	})

	it("says why nothing is asked where nobody can be chosen", () => {
		expect(dialogSource).toContain('data-test="no-sales-person-to-choose"')
		expect(dialogSource).toContain("No sales person to choose: this sale does not ask for one.")
	})
})
