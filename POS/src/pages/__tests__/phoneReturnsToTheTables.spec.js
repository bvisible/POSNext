/**
 * //// Neoffice — added file (no upstream equivalent). How the till's page wires the phone's return to the tables and the table named in the dialogs (NeoResto lot 1; product owner, 05.11.2026: « je ne sais pas
 * //// quelle table j'ouvre », « il reste planté sur le panier »). The page is too big to mount: its wiring is read from its source, the rules are tested in composables/__tests__/useReturnToTables.spec.js.
 */
import { describe, expect, it } from "vitest"
import source from "../POSSale.vue?raw"

describe("the till's page", () => {
	it("brings a phone back to the tables once the order is left, with the page's own phone test", () => {
		expect(source).toContain('import { useReturnToTables } from "@/composables/useReturnToTables"')
		expect(source).toMatch(/useReturnToTables\(\{ cart: cartStore, ui: uiStore, isPhone: phoneLayout \}\)/)
	})

	it("names the table in the covers' question and in the group's name dialog", () => {
		expect(source).toMatch(/<CoversDialog[^>]*:table="dialogTable"/s)
		expect(source).toMatch(/<NoteNameDialog[^>]*:table="dialogTable"/s)
		expect(source).toContain("notes.label.value || cartStore.restaurantTable.table_name")
	})
})
