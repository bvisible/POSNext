/**
 * //// Neoffice — added file (no upstream equivalent). The phone classes of the kitchen and runner screens are compiled by the till's own Tailwind
 * //// configuration and come out as the rules they need (NeoResto lot 1, smoke-test fix). `max-md:` is the complement of `md:` (below 768 px and from
 * //// 768 px never apply together), which is what keeps the desk's line as it was; the phone's 40 px heights come after the 44, 38 and 32 px they replace in
 * //// the stylesheet, so that they win without `!important`. A class that is mistyped compiles to nothing, and the element is silently left as it was: so
 * //// the screens' sources are compiled, and the rules are read in the stylesheet.
 * @vitest-environment node
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"
import tailwindcss from "tailwindcss"
import loadConfig from "tailwindcss/loadConfig.js"
import { beforeAll, describe, expect, it } from "vitest"

const here = path.dirname(fileURLToPath(import.meta.url))
const POS = path.resolve(here, "../../..")
// The sources the classes are looked for in, and not the whole of `src/**` the till's configuration scans: a spec names the classes it checks, and Tailwind
// would compile them out of the spec's own text, so that a class missing from the screens would still be a rule here
const SOURCES = [
	"src/components/restaurant/ServiceTopBar.vue",
	"src/components/restaurant/SegmentedControl.vue",
	"src/components/restaurant/ThemeButton.vue",
	"src/components/restaurant/RoomStationFilterLine.vue",
	"src/pages/KDS.vue",
	"src/pages/Runner.vue",
]

let css = ""
beforeAll(async () => {
	// Tailwind resolves the relative paths from the working directory: vitest runs from POS/, as the app's own build does
	const previous = process.cwd()
	process.chdir(POS)
	try {
		const config = {
			...loadConfig(path.join(POS, "tailwind.config.js")),
			content: SOURCES,
		}
		const result = await postcss([tailwindcss(config)]).process(
			"@tailwind utilities;",
			{ from: undefined },
		)
		css = result.css
	} finally {
		process.chdir(previous)
	}
}, 120000)

// A class name as the stylesheet writes it in a selector
const escaped = (name) =>
	name.replace(/[^a-zA-Z0-9_-]/g, (c) => (c === "," ? "\\2c " : `\\${c}`))

/** The first rule whose selector holds `selector`, and (through `parent`) the at-rule it sits in. */
function rule(selector) {
	let found = null
	postcss.parse(css).walkRules((r) => {
		if (!found && r.selector.includes(selector)) found = r
	})
	return found
}

describe("the phone classes of the kitchen and runner screens compile (smoke-test fix)", () => {
	it("`max-md:` is the complement of `md:`: what applies below 768 px and what applies from 768 px never apply together", () => {
		const below = rule(".max-md\\:flex")
		const above = rule(".md\\:contents")
		expect(below, "no rule for max-md:flex").toBeTruthy()
		expect(above, "no rule for md:contents").toBeTruthy()
		// A rule is in its at-rule: `@media not all and (min-width: 768px)` and `@media (min-width: 768px)`
		expect(below.parent.params).toMatch(/not all and \(min-width: ?768px\)/)
		expect(above.parent.params).toMatch(/^\(min-width: ?768px\)$/)
	})

	it("every phone class the screens add is a rule, below 768 px", () => {
		for (const name of [
			"max-md:h-auto",
			"max-md:h-9",
			"max-md:h-10",
			"max-md:w-10",
			"max-md:w-full",
			"max-md:flex",
			"max-md:flex-wrap",
			"max-md:items-center",
			"max-md:justify-end",
			"max-md:justify-start",
			"max-md:gap-1.5",
			"max-md:gap-y-1",
			"max-md:py-1.5",
			"max-md:pl-3",
			"max-md:pr-2",
			"max-md:px-3",
			"max-md:ml-0",
			"max-md:empty:hidden",
			"max-md:overflow-x-hidden",
		]) {
			const r = rule(`.${escaped(name)}`)
			expect(r, name).toBeTruthy()
			expect(r.parent.params, name).toMatch(/not all and \(min-width: ?768px\)/)
		}
	})

	it("the phone's 40 px heights come AFTER the 44, 38 and 32 px they replace in the stylesheet, so that they win without `!important`", () => {
		const order = (name) => css.indexOf(`.${escaped(name)}`)
		for (const [phone, desk] of [
			["max-md:h-10", "h-11"],
			["max-md:h-10", "h-8"],
			["max-md:h-10", "h-[38px]"],
			["max-md:w-10", "w-11"],
		])
			expect(order(phone), `${phone} before ${desk}`).toBeGreaterThan(
				order(desk),
			)
	})
})
