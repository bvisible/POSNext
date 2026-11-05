/**
 * //// Neoffice — added file (no upstream equivalent). The reservation screens do not stretch every field across the dialog (NeoResto lot 1,
 * //// product owner, 05.11.2026: « en réservation, c'est la même chose […] il y a des choses à améliorer »): the three filters of the day keep a
 * //// width of their own, the booking form a readable width, centred, and its « Save » stays in view under a long form.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file) => readFileSync(path.resolve(__dirname, "..", file), "utf8")
const rule = (source, selector) => {
	const start = source.indexOf(`\n${selector} {`)
	expect(start, `${selector} is styled`).toBeGreaterThan(-1)
	return source.slice(start, source.indexOf("}", start))
}

describe("the day's filters", () => {
	const list = read("ReservationList.vue")

	it("keep a width that fits what they hold, not a third of the dialog each", () => {
		expect(rule(list, ".filter-input")).toMatch(/flex: 0 1 220px;/)
		expect(rule(list, ".filter-input")).not.toMatch(/flex: 1;/)
	})
})

describe("the booking form", () => {
	const form = read("ReservationForm.vue")

	it("has a readable width and stands at the centre of the dialog", () => {
		expect(rule(form, ".reservation-form")).toMatch(/max-width: 1040px;/)
		expect(rule(form, ".reservation-form")).toMatch(/margin: 0 auto;/)
	})

	it("keeps its buttons in view under a long form", () => {
		expect(rule(form, ".form-actions")).toMatch(/position: sticky;/)
		expect(rule(form, ".form-actions")).toMatch(/bottom: 0;/)
	})
})
