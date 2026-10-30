/**
 * //// Neoffice — added file (no upstream equivalent). Whether a till is a restaurant till is ticked on the desk's
 * //// POS Settings form and nowhere else (NeoRestau lot 1, task 4; product owner, 30.10.2026): the till's own settings
 * //// screen offers neither the tick nor the choice of the restaurant, and the desk form shows them only where the
 * //// site runs NeoRestau.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function source(rel) {
	return readFileSync(path.resolve(__dirname, rel), "utf8")
}

const DESK_FORM =
	"../../../../../pos_next/pos_next/doctype/pos_settings/pos_settings.json"

describe("the till's settings screen", () => {
	const screen = source("../POSSettings.vue")

	it("offers no tick that makes the till a restaurant till", () => {
		expect(screen).not.toMatch(/enable_restaurant_mode/)
	})

	it("offers no choice of the restaurant the till works for", () => {
		expect(screen).not.toMatch(/\bsettings(\.value)?\.restaurant\b/)
		expect(screen).not.toMatch(/\bsettings(\.value)?\.neorestau_active\b/)
	})
})

describe("the desk's POS Settings form", () => {
	const doctype = JSON.parse(source(DESK_FORM))
	const field = (fieldname) =>
		doctype.fields.find((df) => df.fieldname === fieldname)

	// Frappe evaluates an "eval:" depends_on as `let out = <code>; return out` with the page's globals around it
	function shownWhere(neorestau) {
		const expression = field("section_break_restaurant").depends_on
		expect(expression.startsWith("eval:")).toBe(true)
		const code = `let out = ${expression.slice(5)}; return out`
		const previous = globalThis.frappe
		globalThis.frappe = {
			boot: neorestau === undefined ? {} : { neorestau_active: neorestau },
		}
		try {
			return Boolean(new Function("doc", "parent", code)({}, {}))
		} finally {
			globalThis.frappe = previous
		}
	}

	it("shows its Restaurant section only where the desk was told NeoRestau runs", () => {
		expect(shownWhere(1)).toBe(true)
		expect(shownWhere(0)).toBe(false)
		expect(shownWhere(undefined)).toBe(false)
	})

	it("keeps the tick and the restaurant picker inside that section", () => {
		const order = doctype.field_order
		const start = order.indexOf("section_break_restaurant")
		const end = order.findIndex(
			(name, i) => i > start && name.startsWith("section_break_"),
		)

		const inside = order.slice(start, end)
		expect(inside).toContain("enable_restaurant_mode")
		expect(inside).toContain("restaurant")
		// A restaurant needs the tick: the picker keeps its own rule inside the section
		expect(field("restaurant").depends_on).toBe("enable_restaurant_mode")
	})
})
