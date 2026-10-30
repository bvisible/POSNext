/**
 * //// Neoffice — added file (no upstream equivalent). The card editor's « edit the schedule » opens the till's
 * //// settings on their « Hours and cards » tab, for whoever may set the restaurant's hours (NeoRestau lot 1, task
 * //// 13): the hours are the restaurant's settings, which its manager sets too, not only the till manager.
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

	it("shows to whoever may set the restaurant's settings", () => {
		const links = editor.match(/<button v-if="restaurantStore\.can\?\.(\w+)" @click="openScheduleSettings"/g) || []
		expect(links).toHaveLength(2)
		for (const link of links) expect(link).toContain("can?.manage_settings")
	})
})
