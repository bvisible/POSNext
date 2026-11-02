/**
 * //// Neoffice — added file (no upstream equivalent). The dark classes of the kitchen and runner screens are compiled by the
 * //// till's own Tailwind configuration and come out as the rules the dark mode needs (NeoResto lot 1, task 46). A class that
 * //// is mistyped, or a colour the configuration does not name (`dark:text-ds-danger`), compiles to nothing and the element is
 * //// silently left as it was, which is how a blank button reaches a tablet. So the screens' sources are compiled, and what
 * //// matters is read in the stylesheet: the rules exist, they sit in the dark scope, they carry the design system's colours,
 * //// and the pulses never fade the text. The contrast of the colours is computed, against the card they sit on.
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
const SOURCES = [
	"src/components/invoices/KDSOrderCard.vue",
	"src/components/invoices/RunnerOrderCard.vue",
	// Task 38a-2: the allergy strip moved out of the kitchen card into the piece both cards draw, and the screens have a bar of their own
	"src/components/invoices/TicketDishNotes.vue",
	"src/components/restaurant/ServiceTopBar.vue",
	"src/components/restaurant/SegmentedControl.vue",
	"src/components/restaurant/ThemeButton.vue",
	"src/components/restaurant/KitchenBand.vue",
	"src/components/restaurant/RoomStationFilterLine.vue",
	"src/pages/KDS.vue",
	"src/pages/Runner.vue",
]

let css = ""
beforeAll(async () => {
	// Tailwind loads the configuration itself (it resolves frappe-ui's preset, which Node's own loader cannot), and reads its `content`
	// globs from the working directory: vitest runs from POS/, as the app's own build does
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

/** The declarations of the first rule whose selector contains `selector` (as it is written in the stylesheet). */
function rule(selector) {
	const root = postcss.parse(css)
	let found = null
	root.walkRules((r) => {
		if (!found && r.selector.includes(selector) && r.parent.type !== "atrule")
			found = r
		else if (!found && r.selector.includes(selector)) found = r
	})
	return found
}
const declarations = (r) =>
	Object.fromEntries(
		r.nodes.filter((n) => n.type === "decl").map((n) => [n.prop, n.value]),
	)
function keyframes(name) {
	const root = postcss.parse(css)
	let found = null
	root.walkAtRules("keyframes", (a) => {
		if (a.params === name) found = a
	})
	return found
}

// ---- contrast, for the colours the dark classes name ---------------------------------------------------------------------
const channel = (v) => {
	const s = v / 255
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
	const [r, g, b] = [1, 3, 5].map((i) =>
		channel(Number.parseInt(hex.slice(i, i + 2), 16)),
	)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}
// The ground of a ticket in dark mode: the till's remap of `bg-white` (index.css), the colour the timers and badges sit on
const DARK_CARD = "#1c1f26"
const hexOf = (value) => value.match(/#[0-9a-fA-F]{6}/)?.[0]

describe("the dark classes of the kitchen and runner screens compile (task 46)", () => {
	it("the design system's dark colours are named in the configuration, as the design system writes them", () => {
		// Tailwind writes a colour as `rgb(255 99 105 / var(--tw-text-opacity, 1))`: back to a hex, to compare it with the system's
		const hexFrom = (value) => {
			const [r, g, b] = value
				.match(/rgb\((\d+) (\d+) (\d+)/)
				.slice(1)
				.map(Number)
			return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
		}
		const colour = (name) =>
			hexFrom(declarations(rule(`.dark\\:text-ds-${name}`)).color)
		// The paper and ink of the dark scope, and the status colours of the dark ramp (readme 9.1)
		expect(colour("danger")).toBe("#FF6369")
		expect(colour("warning")).toBe("#E6A93B")
		expect(colour("success")).toBe("#3DBE74")
		expect(colour("success-soft")).toBe("#CBEDD7")
		expect(colour("ink")).toBe("#141414")
	})

	it("the dark text of the main buttons only applies while they are enabled, and under the dark scope", () => {
		const r = rule(".dark\\:enabled\\:text-ink-white")
		expect(r, "no rule for dark:enabled:text-ink-white").toBeTruthy()
		expect(r.selector).toContain('[data-theme="dark"]')
		expect(r.selector).toContain(":enabled")
	})

	it("the dark ink text outranks the white the cards forced on the Button (a dark variant weighs more than a plain class)", () => {
		const dark = rule(".dark\\:enabled\\:text-ink-white").selector
		// [data-theme="dark"] .class:enabled = one attribute, one class, one pseudo-class; `.text-white` is one class
		expect(
			(
				dark.match(
					/\[data-theme="dark"\]|\.dark\\:enabled\\:text-ink-white|:enabled/g,
				) || []
			).length,
		).toBeGreaterThanOrEqual(3)
	})

	// A class name as the stylesheet writes it in a selector
	const escaped = (name) =>
		name.replace(/[^a-zA-Z0-9_-]/g, (c) => (c === "," ? "\\2c " : `\\${c}`))

	it("every other dark class the screens add is a rule too", () => {
		for (const name of [
			"dark:text-ds-danger",
			"dark:text-ds-warning",
			"dark:text-ds-success",
			"dark:text-ds-success-soft",
			"dark:text-ds-ink",
			"dark:bg-ds-success",
			"dark:bg-ds-success/25",
			"dark:bg-black/25",
			"bg-[rgba(255,255,255,0.3)]",
			"dark:animate-late-pulse",
			"dark:animate-ready-pulse",
			"dark:bg-blue-400/25",
			"dark:opacity-75",
			"dark:text-[color:var(--station-ink)]",
			"dark:text-[color:var(--station-on-dark)]",
			"text-[color:var(--station-color)]",
			"dark:bg-[#181b21]",
			"dark:[--plan-dot:rgba(255,255,255,0.1)]",
			"bg-[radial-gradient(circle,var(--plan-dot)_1px,transparent_1px)]",
			"dark:[&:not(:checked)]:bg-transparent",
			"dark:[&:not(:checked)]:ring-ds-sand-400",
		]) {
			expect(rule(escaped(name)), name).toBeTruthy()
		}
	})

	it("every design-system token a dark class names in the screens' sources is a colour the configuration has: no mistyped name compiles to nothing", () => {
		const used = new Set()
		for (const file of SOURCES)
			for (const [token] of fs
				.readFileSync(path.join(POS, file), "utf8")
				.matchAll(/dark:[^\s"'`]*\bds-[a-z0-9-]+(?:\/\d+)?/g))
				used.add(token)
		expect(used.size).toBeGreaterThanOrEqual(8)
		for (const name of used) expect(rule(escaped(name)), name).toBeTruthy()
	})

	it("the order of the stylesheet is what the `!important` variants rely on: Tailwind appends the dark variants AFTER the till's own dark rules", () => {
		// Without a `@tailwind variants` directive Tailwind writes every variant (hover:, dark:, md:) at the very end of the stylesheet,
		// after the till's remap of the greys (index.css). Two `!important` rules of the same weight then go to the later one, which is
		// what lets the doubled selector below win. A `@tailwind variants` placed earlier would hand the win back to the remap.
		for (const file of [
			"src/index.css",
			"node_modules/frappe-ui/src/style.css",
		])
			expect(fs.readFileSync(path.join(POS, file), "utf8"), file).not.toMatch(
				/@tailwind\s+variants/,
			)
	})

	it("a doubled selector outranks the till's `!important` remap of the grey text, which a plain dark class never did", () => {
		const r = rule("dark\\:\\[\\&\\&\\]\\:\\!text-gray-400")
		expect(r, "no rule for the band count").toBeTruthy()
		// Two classes of the element plus the attribute: heavier than `[data-theme='dark'] .text-gray-500` (one attribute, one class)
		const own = (
			r.selector.match(/dark\\:\\\[\\&\\&\\\]\\:\\!text-gray-400/g) || []
		).length
		expect(own).toBeGreaterThanOrEqual(2)
		// `!important`, as the remap it outranks is
		expect(r.nodes.find((node) => node.prop === "color").important).toBe(true)
	})
})

describe("the late timer's pulse never dims the text (task 46)", () => {
	it("`late-pulse` swings the colour and a glow, and has no opacity in it, so that no moment of the blink is dim", () => {
		const k = keyframes("late-pulse")
		expect(k, "no @keyframes late-pulse").toBeTruthy()
		const props = []
		k.walkDecls((d) => props.push(d.prop))
		expect(props).toContain("color")
		expect(props).toContain("text-shadow")
		expect(props).not.toContain("opacity")
	})

	it("`ready-pulse` swells a badge and has no opacity in it either", () => {
		const k = keyframes("ready-pulse")
		expect(k).toBeTruthy()
		const props = []
		k.walkDecls((d) => props.push(d.prop))
		expect(props).toContain("transform")
		expect(props).not.toContain("opacity")
	})

	it("every phase of the late timer reads on the dark card at 4.5:1 or more, where the old pulse reached 1.6:1", () => {
		const k = keyframes("late-pulse")
		const colours = []
		k.walkDecls("color", (d) => colours.push(hexOf(d.value)))
		expect(colours.length).toBeGreaterThanOrEqual(2)
		for (const colour of colours)
			expect(contrast(colour, DARK_CARD), colour).toBeGreaterThanOrEqual(4.5)
		// And the colour it rests on when nothing animates (a reduced-motion setting, a browser without animations)
		expect(contrast("#FF6369", DARK_CARD)).toBeGreaterThanOrEqual(4.5)
		// The red it replaces, for the record: `text-red-600` on the dark card
		expect(contrast("#dc2626", DARK_CARD)).toBeLessThan(4.5)
	})

	it("the slow timer's orange and the success green read on the dark card too", () => {
		expect(contrast("#E6A93B", DARK_CARD)).toBeGreaterThanOrEqual(4.5)
		expect(contrast("#3DBE74", DARK_CARD)).toBeGreaterThanOrEqual(4.5)
	})

	it("the light mode keeps Tailwind's own pulse: `animate-pulse` is still compiled, and still the opacity one", () => {
		const k = keyframes("pulse")
		expect(k).toBeTruthy()
		const props = []
		k.walkDecls((d) => props.push(d.prop))
		expect(props).toContain("opacity")
	})
})

describe("the screens are the ones this spec compiles", () => {
	it("every source it names exists", () => {
		for (const file of SOURCES)
			expect(fs.existsSync(path.join(POS, file)), file).toBe(true)
	})
})
