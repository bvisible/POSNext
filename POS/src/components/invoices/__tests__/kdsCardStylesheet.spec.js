/**
 * //// Neoffice — added file (no upstream equivalent). The classes the kitchen card sizes itself with compile to real rules
 * //// (NeoRestau lot 1, task 38a-1). The card reads its sizes from CSS variables the size chosen sets on the screen
 * //// (`--kds-fs`, `--kds-btn-h`, ...), through Tailwind's arbitrary values: a class that is mistyped, or whose value Tailwind
 * //// cannot read (`text-[var(--x)]` is a colour to Tailwind, `text-[length:var(--x)]` a size), compiles to NOTHING and the element
 * //// silently keeps the browser's size. So the card's source is compiled by the till's own configuration and the rules are read.
 * @vitest-environment node
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"
import tailwindcss from "tailwindcss"
import { beforeAll, describe, expect, it } from "vitest"

const here = path.dirname(fileURLToPath(import.meta.url))
const POS = path.resolve(here, "../../../..")

let css = ""
beforeAll(async () => {
	const previous = process.cwd()
	process.chdir(POS)
	try {
		const result = await postcss([
			tailwindcss({ config: path.join(POS, "tailwind.config.js") }),
		]).process("@tailwind utilities;", { from: undefined })
		css = result.css
	} finally {
		process.chdir(previous)
	}
}, 120000)

/** The declarations (prop: value, with !important kept) of every rule that declares `prop` as `value`. */
function rulesDeclaring(prop, value) {
	const found = []
	postcss.parse(css).walkRules((rule) => {
		rule.walkDecls(prop, (decl) => {
			if (decl.value.replace(/\s+/g, "") === value.replace(/\s+/g, ""))
				found.push({ selector: rule.selector, important: decl.important })
		})
	})
	return found
}

describe("the sizes the kitchen card reads from the size chosen", () => {
	it("compile: the main button's height and text, the print button's square, the second timer's switch", () => {
		expect(
			rulesDeclaring("height", "var(--kds-btn-h,44px)").length,
		).toBeGreaterThan(0)
		// The Button's own `h-10` must lose: the height is `!important`
		expect(
			rulesDeclaring("height", "var(--kds-btn-h,44px)").some(
				(rule) => rule.important,
			),
		).toBe(true)
		expect(
			rulesDeclaring("width", "var(--kds-btn-h,44px)").length,
		).toBeGreaterThan(0)
		expect(
			rulesDeclaring("font-size", "var(--kds-fs-btn,14px)").length,
		).toBeGreaterThan(0)
		expect(
			rulesDeclaring("display", "var(--kds-tt-d,none)").length,
		).toBeGreaterThan(0)
	})

	it("compile: the room chip and the second timer are sized by a font-size, not read as a colour", () => {
		expect(
			rulesDeclaring("font-size", "var(--kds-fs-ref,11px)").length,
		).toBeGreaterThan(0)
		expect(
			rulesDeclaring("font-size", "var(--kds-fs-tt,10px)").length,
		).toBeGreaterThan(0)
		// A `color` rule reading these variables would be the sign of the wrong reading
		expect(rulesDeclaring("color", "var(--kds-fs-ref,11px)")).toEqual([])
	})
})
