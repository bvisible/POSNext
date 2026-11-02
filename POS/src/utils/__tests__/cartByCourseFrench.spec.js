/**
 * //// Neoffice — added file (no upstream equivalent). The cart of a table's order by course, in French (NeoResto lot 1, Daniel, 01.11): the product owner speaks French, so every string the new header, the rule of the groups
 * //// and the switch of the cart put on a screen has its line in the real catalogue (pos_next/locale/fr.po), and its template line in main.pot. Words the kitchen's ticket already says (« À suivre », the names of the courses) are
 * //// reused, not written again.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../../../../pos_next/locale")
const po = readFileSync(path.join(ROOT, "fr.po"), "utf8")
const pot = readFileSync(path.join(ROOT, "main.pot"), "utf8")
const source = (file) => readFileSync(path.resolve(__dirname, "../..", file), "utf8")

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// The French of a one-line entry, under a context or none
const frenchOf = (msgid, context) => {
	const ctx = context ? `msgctxt "${escape(context)}"\\nmsgid` : "msgid"
	const found = po.match(new RegExp(`(?:^|\\n)${ctx} "${escape(msgid)}"\\nmsgstr "([^"]*)"`))
	return found?.[1]
}

describe("the cart by course, in French", () => {
	it("calls the switch « Replier les services livrés »", () => {
		expect(frenchOf("Fold delivered courses")).toBe("Replier les services livrés")
	})

	it("keeps the template in step: the new string is in main.pot, empty", () => {
		expect(pot).toMatch(/msgid "Fold delivered courses"\nmsgstr ""/)
	})

	it("says the held group as the kitchen's ticket says it", () => {
		expect(frenchOf("Coming Next")).toBe("À suivre")
	})

	it("says the courses as the kitchen's ticket says them", () => {
		expect(frenchOf("Drinks", "Service family")).toBe("Boissons")
		expect(frenchOf("Starters", "Service family")).toBe("Entrées")
		expect(frenchOf("Mains", "Service family")).toBe("Plats")
		expect(frenchOf("Desserts", "Service family")).toBe("Desserts")
	})

	it("says what the fold row does as the kitchen's ticket says it", () => {
		expect(frenchOf("Show or hide the finished dishes")).toBeTruthy()
	})

	it.each([
		["the header of a course", "components/sale/CartCourseHeader.vue"],
		["the rule of the groups", "utils/cartCourses.js"],
	])("has a French line for every string of %s", (_, file) => {
		const msgids = [...source(file).matchAll(/__\(\s*(["'])((?:(?!\1).)+)\1/g)].map((match) => match[2])
		expect(msgids.length).toBeGreaterThan(0)
		for (const msgid of msgids) {
			expect(po, `"${msgid}" has no French`).toMatch(new RegExp(`msgid "${escape(msgid)}"\\nmsgstr "[^"]+"`))
		}
	})
})
