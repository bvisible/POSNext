/**
 * //// Neoffice — added file (no upstream equivalent). The card editor's « edit the schedule » opens the till's
 * //// settings on their « Hours and cards » tab, for whoever may set the restaurant's hours (NeoRestau lot 1, task
 * //// 13): the hours are the restaurant's settings, which its manager sets too, not only the till manager. And the
 * //// other way round: the settings' « Edit » of a card opens the till's card editor on that card.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const editor = readFileSync(path.resolve(__dirname, "../CardEditor.vue"), "utf8")

describe("the card editor's link to the schedule", () => {
	it("opens the hours tab of the till's settings", () => {
		expect(editor).toMatch(/emit\("open-settings", "hours"\)/)
		expect(editor).not.toMatch(/emit\("open-settings", "restaurant"\)/)
	})

	it("shows to whoever may set the settings of this till's restaurant", () => {
		const links = editor.match(/<button v-if="restaurantStore\.can\?\.(\w+)" @click="openScheduleSettings"/g) || []
		expect(links).toHaveLength(2)
		// The till's own restaurant (the server's right per till), not any restaurant
		for (const link of links) expect(link).toContain("can?.manage_restaurant_settings")
	})
})

describe("the card the till's settings ask for", () => {
	const sale = readFileSync(path.resolve(__dirname, "../../../pages/POSSale.vue"), "utf8")

	it("is the card the editor opens on", () => {
		expect(editor).toMatch(/initialCard: \{ type: String, default: "" \}/)
		expect(editor).toMatch(/selectCard\(props\.initialCard\)/)
	})

	it("is handed by the till from its settings' « Edit » to its card editor", () => {
		expect(sale).toMatch(/<POSSettings[^>]*@open-card="openCardEditor"/s)
		expect(sale).toMatch(/<CardEditor[^>]*:initial-card="cardEditorCard"/s)
	})
})
