//// Neoffice — added file (no upstream equivalent). The payment window shows the people the lines name, instead of a picker that does nothing (neoffice-maintenance#3184).
//// The dialog is read from its source, as the other specs of the dialog do (it is too large to mount): the note, the list of the people and the team the sale sends all read the shared
//// rules of utils/salesPersonLines.js (their behaviour is pinned in utils/__tests__/salesPersonLinesKept.spec.js).
import { describe, expect, it } from "vitest"
import dialogSource from "../PaymentDialog.vue?raw"

describe("the payment window where the lines name their person", () => {
	it("reads which lines keep their person from the shared rules, not from a rule of its own", () => {
		expect(dialogSource).toContain("everyLineNamesItsPerson(props.items)")
		expect(dialogSource).toContain("someLinesNameTheirPerson(props.items)")
		expect(dialogSource).toContain("personsOfTheLines(props.items)")
		expect(dialogSource).not.toContain("allItemsHaveSalesPerson")
	})

	it("shows the people of the lines in place of the picker, where every line names its person", () => {
		expect(dialogSource).toContain('v-if="everyLineKeepsItsPerson" data-test="lines-keep-their-person"')
		expect(dialogSource).toContain('data-test="line-person"')
		// the picker (single or multiple mode) is the branch after it, never beside it
		expect(dialogSource).toMatch(/<template v-else-if="settingsStore\.isSingleSalesPerson">/)
		expect(dialogSource).not.toMatch(/<template v-if="settingsStore\.isSingleSalesPerson">/)
	})

	it("says that the choice only reaches the lines without a person, where some lines have one and some do not", () => {
		expect(dialogSource).toContain('v-if="someLinesKeepTheirPerson"')
		expect(dialogSource).toContain('data-test="lines-keep-their-person-note"')
		expect(dialogSource).toContain("This choice applies to the lines without a sales person.")
	})

	it("no longer says that the choice is optional where it reaches nothing", () => {
		expect(dialogSource).not.toContain("invoice-level selection is optional")
	})

	it("sends the team of the sale from the rule, in both places that complete a sale, never the raw selection", () => {
		expect(dialogSource).toContain("salesTeamOfTheSale({ lines: props.items, selected: selectedSalesPersons.value })")
		expect(dialogSource.match(/sales_team: salesTeamOfTheInvoice\.value\.length > 0 \? salesTeamOfTheInvoice\.value : null,/g)).toHaveLength(2)
		expect(dialogSource).not.toContain("sales_team: selectedSalesPersons.value.length > 0 ? selectedSalesPersons.value : null,")
	})

	it("does not say that nobody can be chosen above a list of people it shows", () => {
		expect(dialogSource).toContain('v-if="nobodyToChoose && linesThatAskForAPerson.length > 0 && !everyLineKeepsItsPerson"')
	})
})
