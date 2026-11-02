/**
 * //// Neoffice — added file (no upstream equivalent). The classes the sections and the tint of the kitchen and runner tickets use are compiled by the
 * //// till's own Tailwind configuration, and the dish's text stays readable on the tint in light AND dark mode (NeoResto lot 1, Daniel's request of 01.11).
 * //// A class that is mistyped compiles to nothing and the element is silently left as it was, so the sources are compiled and what matters is read in the
 * //// stylesheet. The contrast is computed from the colours the stylesheet really gives (the text colours, and the dark remap of the till's `index.css`),
 * //// against the card with the tint composited over it: the tint of EVERY colour, the extremes included (white lifts the card most, and the dark text is
 * //// light), must leave the dish's text at 4.5:1 or more.
 * @vitest-environment node
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"
import tailwindcss from "tailwindcss"
import { beforeAll, describe, expect, it } from "vitest"
import { TINT_ALPHA } from "../../../utils/ticketFamilies.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const POS = path.resolve(here, "../../../..")

let css = ""
beforeAll(async () => {
	// Tailwind reads its `content` globs from the working directory: vitest runs from POS/, as the app's own build does
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

const indexCss = fs.readFileSync(path.join(POS, "src/index.css"), "utf8")

/** The declarations of the first rule whose selector contains `selector` (as the stylesheet writes it). */
function rule(selector) {
	let found = null
	postcss.parse(css).walkRules((r) => {
		if (!found && r.selector.includes(selector)) found = r
	})
	return found
}
const declarations = (r) =>
	Object.fromEntries(
		r.nodes.filter((n) => n.type === "decl").map((n) => [n.prop, n.value]),
	)

// ---- colours ---------------------------------------------------------------------------------------------------------------
const hexFromRgbFunction = (value) => {
	const [r, g, b] = value
		.match(/rgb\((\d+) (\d+) (\d+)/)
		.slice(1)
		.map(Number)
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}
const rgb = (hex) =>
	[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
const channel = (v) => {
	const s = v / 255
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}
/** `over` with `color` laid on it at `alpha`: what the eye sees of a translucent tint on the card. */
const composite = (color, over, alpha) =>
	color.map((v, i) => v * alpha + over[i] * (1 - alpha))

/** The colour a class of the till's dark remap (`index.css`) gives: `[data-theme='dark'] .name { color: #… !important }`. */
function darkRemap(className, property) {
	const found = new RegExp(
		`\\.dark \\.${className}\\s*\\{\\s*${property}:\\s*(#[0-9a-fA-F]{6})`,
	).exec(indexCss)
	if (!found) throw new Error(`no dark remap for .${className}`)
	return found[1].toUpperCase()
}

// The ground of a ticket and the colours of its text, in light mode (the stylesheet's) and dark mode (the till's remap)
const lightCard = () => rgb("#FFFFFF")
const darkCard = () => rgb(darkRemap("bg-white", "background-color"))
const textLight = (name) =>
	hexFromRgbFunction(declarations(rule(`.${name}`)).color)

// Pastel and saturated colours a restaurant may pick, and the extremes
const COLORS = {
	sky: "#CFE8FF",
	mint: "#D8F0D0",
	cream: "#FFE9C7",
	rose: "#F7D9E6",
	lavender: "#E3D9F7",
	peach: "#FFD5C2",
	white: "#FFFFFF",
	black: "#000000",
	red: "#FF0000",
	yellow: "#FFFF00",
	green: "#00FF00",
	blue: "#0000FF",
}

describe("the classes of the sections and of the tint compile", () => {
	it("the tint's class reads the variable the row carries", () => {
		const r = rule(".bg-\\[color\\:var\\(--service-tint\\)\\]")

		expect(r, "no rule for the tint class").toBeTruthy()
		expect(declarations(r)["background-color"]).toBe("var(--service-tint)")
	})

	it("the pressed state of a row is written AFTER the tint, so that it wins over it (same weight, later rule)", () => {
		const tint = css.indexOf(".bg-\\[color\\:var\\(--service-tint\\)\\]")
		const pressed = css.indexOf(".active\\:bg-gray-100")
		const pressedDark = css.indexOf(".dark\\:active\\:bg-gray-700")

		expect(tint).toBeGreaterThan(-1)
		expect(pressed).toBeGreaterThan(tint)
		expect(pressedDark).toBeGreaterThan(tint)
	})

	it("the label and its rule are real rules: capitals, spacing, the dashed border, the column break", () => {
		for (const name of [
			"uppercase",
			"tracking-wider",
			"border-dashed",
			"border-gray-500",
			"text-gray-700",
			"break-inside-avoid",
			"break-after-avoid",
		])
			expect(rule(`.${name}`), `no rule for .${name}`).toBeTruthy()
		const dark = rule(".dark\\:border-gray-600")
		expect(dark, "no rule for dark:border-gray-600").toBeTruthy()
		expect(dark.selector).toContain('[data-theme="dark"]')
		expect(declarations(rule(".break-after-avoid"))["break-after"]).toBe(
			"avoid",
		)
		// The label's size follows the screen's text size, with a fallback
		expect(css).toContain("var(--kds-fs-ref,10px)")
	})
})

describe("the dish's text on a tint in LIGHT mode", () => {
	it("keeps the tint to 16 % of the colour", () => {
		expect(TINT_ALPHA).toBe(0.16)
	})

	for (const [name, hex] of Object.entries(COLORS)) {
		it(`reads at 4.5:1 or more on a tint of ${name} (${hex})`, () => {
			const ground = composite(rgb(hex), lightCard(), TINT_ALPHA)

			expect(
				contrast(rgb(textLight("text-gray-900")), ground),
			).toBeGreaterThanOrEqual(4.5)
		})
	}

	it("the section's label reads on the card at 4.5:1 or more", () => {
		expect(
			contrast(rgb(textLight("text-gray-700")), lightCard()),
		).toBeGreaterThanOrEqual(4.5)
	})
})

describe("the dish's text on a tint in DARK mode", () => {
	for (const [name, hex] of Object.entries(COLORS)) {
		it(`reads at 4.5:1 or more on a tint of ${name} (${hex})`, () => {
			const ground = composite(rgb(hex), darkCard(), TINT_ALPHA)

			// The dish's name and its quantity are `text-gray-900` (the till's dark remap lights it), the options `dark:text-gray-100`
			expect(
				contrast(rgb(darkRemap("text-gray-900", "color")), ground),
			).toBeGreaterThanOrEqual(4.5)
			expect(
				contrast(
					rgb(
						hexFromRgbFunction(
							declarations(rule(".dark\\:text-gray-100")).color,
						),
					),
					ground,
				),
			).toBeGreaterThanOrEqual(4.5)
		})
	}

	it("the section's label reads on the card at 4.5:1 or more (the till's dark remap lights `text-gray-700`)", () => {
		expect(
			contrast(rgb(darkRemap("text-gray-700", "color")), darkCard()),
		).toBeGreaterThanOrEqual(4.5)
	})

	it("the tint stays visible on the dark card: the lightest and the darkest colours both move the ground", () => {
		for (const hex of [COLORS.cream, COLORS.sky, COLORS.mint]) {
			const ground = composite(rgb(hex), darkCard(), TINT_ALPHA)

			expect(contrast(ground, darkCard())).toBeGreaterThan(1.1)
		}
	})
})
