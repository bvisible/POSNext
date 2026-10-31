/**
 * //// Neoffice — added file (no upstream equivalent). The classes the kitchen card sizes itself with compile to real rules
 * //// (NeoRestau lot 1, task 38a-1). The card reads its sizes from CSS variables the size chosen sets on the screen
 * //// (`--kds-fs`, `--kds-btn-h`, ...), through Tailwind's arbitrary values: a class that is mistyped, or whose value Tailwind
 * //// cannot read (`text-[var(--x)]` is a colour to Tailwind, `text-[length:var(--x)]` a size), compiles to NOTHING and the element
 * //// silently keeps the browser's size. So the card's source is compiled by the till's own configuration and the rules are read.
 * @vitest-environment node
 */
import fs from "node:fs"
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

// ---- the three kinds of text (task 38a-1, ruling 123): compiled, and read for contrast ----------------------------------------

/** The colour a utility class sets (`color` for text-*, `background-color` for bg-*, `border-color` for border-*), as [r, g, b]. */
function colourOf(selector, prop) {
	let found = null
	postcss.parse(css).walkRules((rule) => {
		if (found || rule.selector !== selector) return
		rule.walkDecls(prop, (decl) => {
			const hex = decl.value.match(/#([0-9a-fA-F]{6})/)
			const rgb = decl.value.match(/rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
			if (hex)
				found = [1, 3, 5].map((i) =>
					Number.parseInt(hex[1].slice(i - 1, i + 1), 16),
				)
			else if (rgb) found = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
		})
	})
	return found
}
const channel = (v) => {
	const x = v / 255
	return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}
// A colour at an opacity over a ground
const over = (colour, alpha, ground) =>
	colour.map((v, i) => Math.round(v * alpha + ground[i] * (1 - alpha)))
const hex = (value) =>
	[1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16))
// The ground of a ticket: white in light, the till's remap of `bg-white` in dark (index.css)
const WHITE = [255, 255, 255]
const DARK_CARD = hex("#1c1f26")

describe("the three kinds of text of a dish compile and read (task 38a-1)", () => {
	it("compile: the size of the text, the red of the allergy, the accent of the remark, the ink of the options", () => {
		expect(
			rulesDeclaring("font-size", "var(--kds-fs-sub,12px)").length,
		).toBeGreaterThan(0)
		expect(colourOf(".text-red-700", "color")).not.toBeNull()
		expect(colourOf(".bg-red-50", "background-color")).not.toBeNull()
		expect(colourOf(".border-red-500", "border-color")).not.toBeNull()
		expect(colourOf(".text-blue-700", "color")).not.toBeNull()
		expect(colourOf(".text-gray-900", "color")).not.toBeNull()
		// The design system's pale red for the allergy in dark: a name the configuration must know
		expect(
			postcss.parse(css).toString().includes("dark\\:text-ds-danger-soft"),
		).toBe(true)
	})

	it("reads in light: the allergy's red on its tint, the remark's accent and the options' ink on the card, 4.5:1 or more", () => {
		const red = colourOf(".text-red-700", "color")
		const tint = colourOf(".bg-red-50", "background-color")
		const accent = colourOf(".text-blue-700", "color")
		const ink = colourOf(".text-gray-900", "color")

		expect(contrast(red, tint)).toBeGreaterThanOrEqual(4.5)
		expect(contrast(accent, WHITE)).toBeGreaterThanOrEqual(4.5)
		expect(contrast(ink, WHITE)).toBeGreaterThanOrEqual(4.5)
	})

	it("reads in dark: the pale red on the tint the till's remap gives the strip, and the remap's accent and ink on the card", () => {
		const css_ = fs.readFileSync(path.join(POS, "src/index.css"), "utf8")
		// The till's dark remap (index.css): what the card, the strip's tint, the accent text and the ink text become
		const strip = css_.match(
			/\.bg-red-50,\s*\n?\s*\[data-theme='dark'\] \.bg-rose-50[^}]*background-color:\s*rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/,
		)
		expect(strip, "the dark remap of bg-red-50 is in index.css").not.toBeNull()
		const tint = over(
			[Number(strip[1]), Number(strip[2]), Number(strip[3])],
			Number(strip[4]),
			DARK_CARD,
		)
		const pale = hex("#F6D2C9") // --red-100 of the design system, `ds-danger-soft`
		expect(contrast(pale, tint)).toBeGreaterThanOrEqual(4.5)

		expect(css_).toMatch(/\.text-blue-700[^}]*color:\s*#dda479/)
		expect(contrast(hex("#dda479"), DARK_CARD)).toBeGreaterThanOrEqual(4.5)
		expect(css_).toMatch(/\.text-gray-900[^}]*color:\s*#f1f3f5/)
		expect(contrast(hex("#f1f3f5"), DARK_CARD)).toBeGreaterThanOrEqual(4.5)
	})
})

// ---- the kitchen's own sizes laid over the shared frame (task 38a-1, ruling 109) --------------------------------------------------

describe("the kitchen frame's classes compile, and win over the shared frame's", () => {
	it("compile as `!important` rules reading the variables of the size, with the dense value as the fallback", () => {
		for (const [prop, value] of [
			["font-size", "var(--kds-fs-table,15px)"],
			["font-size", "var(--kds-fs-num,12px)"],
			["font-size", "var(--kds-fs-timer,13px)"],
			["font-size", "var(--kds-fs,13px)"],
			["padding-left", "var(--kds-pad-x,8px)"],
			["padding-top", "var(--kds-head-py,5px)"],
			["padding-top", "var(--kds-body-py,0px)"],
			["padding-top", "var(--kds-py,3px)"],
		]) {
			const rules = rulesDeclaring(prop, value)
			expect(rules.length, `${prop}: ${value}`).toBeGreaterThan(0)
		}
		// The ones that fight the frame's own `text-xl`, `px-4`, `min-h-[48px]` are `!important`
		for (const [prop, value] of [
			["font-size", "var(--kds-fs-table,15px)"],
			["font-size", "var(--kds-fs,13px)"],
			["padding-left", "var(--kds-pad-x,8px)"],
		])
			expect(
				rulesDeclaring(prop, value).some((rule) => rule.important),
				`${prop}: ${value}`,
			).toBe(true)
		expect(
			rulesDeclaring("min-height", "0px").some((rule) => rule.important),
		).toBe(true)
	})
})
