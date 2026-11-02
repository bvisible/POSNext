/**
 * //// Neoffice — added file (no upstream equivalent). The dark classes of the till's floor plan and list of tables are compiled by the till's own
 * //// Tailwind configuration and come out as the rules they need (NeoResto lot 1, smoke-test fix). A class that is mistyped, or a colour the configuration
 * //// does not name (`dark:text-ds-sucess`), compiles to nothing and the element is silently left as it was. So the sources are compiled, and what matters
 * //// is read in the stylesheet: the rules exist, they sit in the dark scope, and the colours are the design system's.
 * //// The CONTRAST is computed here from those compiled colours and from the till's own dark remap (index.css), the way a browser composes them: every text
 * //// of the plan's tiles, of the list and of its controls against the surface it is drawn on (4.5:1 at least, 3:1 for a wall), and the five states of a
 * //// table against each other (a fill or an edge far enough apart to be told at a glance). A browser measured the real screens (this fix's browser
 * //// harness); this keeps the pairs from drifting.
 * @vitest-environment node
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"
import tailwindcss from "tailwindcss"
import loadConfig from "tailwindcss/loadConfig.js"
import { beforeAll, describe, expect, it } from "vitest"
import { onDark } from "@/utils/stationColors"

const here = path.dirname(fileURLToPath(import.meta.url))
const POS = path.resolve(here, "../../../..")
// The sources the classes are looked for in. NOT the whole of `src/**` the till's configuration scans: a spec names the classes it checks, and Tailwind would
// compile them out of the spec's own text, so that a class missing from the screens would still be a rule here
const SOURCES = [
	"src/components/pos/FloorPlanEditor.vue",
	"src/components/pos/FloorPlanWalls.vue",
	"src/components/restaurant/TablesList.vue",
	"src/components/restaurant/TableCard.vue",
	"src/components/restaurant/TablesPhoneTop.vue",
	"src/components/restaurant/TablesViewSwitch.vue",
	"src/components/restaurant/tablesListLook.js",
]

let css = ""
let remaps = null
beforeAll(async () => {
	// The till's own configuration (and frappe-ui's preset, which Node's own loader cannot resolve: Tailwind loads it), scanning only the sources above.
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
	remaps = postcss.parse(
		fs.readFileSync(path.join(POS, "src/index.css"), "utf8"),
	)
}, 120000)

// A class name as the stylesheet writes it in a selector
const escaped = (name) =>
	name.replace(/[^a-zA-Z0-9_-]/g, (c) => (c === "," ? "\\2c " : `\\${c}`))

/** The first rule whose selector holds `selector`, and the at-rule it sits in (null at the top level). */
function rule(selector) {
	let found = null
	postcss.parse(css).walkRules((r) => {
		if (!found && r.selector.includes(selector)) found = r
	})
	return found
}
const declaration = (r, prop) =>
	r.nodes.find((n) => n.type === "decl" && n.prop === prop)

// ---- colours, as the browser composes them ---------------------------------------------------------------------------------
/** A CSS colour as [r, g, b, a]: `rgb(61 190 116 / 0.2)`, `rgb(20 20 20 / var(--tw-text-opacity, 1))`, `rgba(255,251,245,0.10)`, `#181b21`. */
function parse(value) {
	const text = value.replace(/!important/, "").trim()
	const hex = /^#([0-9a-f]{6})$/i.exec(text)
	if (hex)
		return [0, 2, 4]
			.map((i) => Number.parseInt(hex[1].slice(i, i + 2), 16))
			.concat(1)
	const fn = /^rgba?\(([^)]*(?:\([^)]*\))?[^)]*)\)$/.exec(text)
	if (!fn) throw new Error(`cannot read the colour ${value}`)
	const [channels, alpha] = fn[1].split("/").map((part) => part.trim())
	const [r, g, b, fourth] = channels.split(/[\s,]+/).filter(Boolean)
	let a = 1
	if (fourth !== undefined) a = Number(fourth)
	else if (alpha !== undefined && !alpha.startsWith("var(")) a = Number(alpha)
	return [Number(r), Number(g), Number(b), a]
}
const over = ([r, g, b, a], [R, G, B]) => [
	r * a + R * (1 - a),
	g * a + G * (1 - a),
	b * a + B * (1 - a),
]
const flat = (colour, ground) =>
	colour[3] === 1 ? colour.slice(0, 3) : over(colour, ground)
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
// CIE76 colour difference, for « are these two states told apart at a glance »
function lab([r, g, b]) {
	const [R, G, B] = [r, g, b].map(channel)
	const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
	const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
	const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
	const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
	return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const deltaE = (a, b) => {
	const [A, B] = [lab(a), lab(b)]
	return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

/** The colour a compiled class sets (`background-color`, `color`, `border-color`), as [r, g, b, a]. */
function colourOf(className, prop = "color") {
	const r = rule(`.${escaped(className)}`)
	expect(r, `no rule for ${className}`).toBeTruthy()
	const d = declaration(r, prop)
	expect(d, `${className} sets no ${prop}`).toBeTruthy()
	return parse(d.value)
}
/** What the till's own dark remap (index.css, `[data-theme='dark'] .class { … !important }`) makes of a light class: the LAST rule that names it wins. */
function remap(className, prop) {
	let value = null
	remaps.walkRules((r) => {
		const names = r.selector.split(",").map((s) => s.trim())
		if (names.includes(`[data-theme='dark'] .${className}`)) {
			const d = declaration(r, prop)
			if (d) value = d.value
		}
	})
	expect(
		value,
		`the till's dark remap has no ${prop} for .${className}`,
	).toBeTruthy()
	return parse(value)
}

describe("the dark classes of the plan and the list compile (smoke-test fix)", () => {
	it("every dark class the two screens add is a rule, in the dark scope", () => {
		for (const name of [
			"dark:bg-[#181b21]",
			"dark:bg-[#1c1f26]",
			"dark:[--plan-dot:rgba(255,255,255,0.1)]",
			"bg-[radial-gradient(circle,var(--plan-dot)_1px,transparent_1px)]",
			"dark:[&&]:!bg-[rgba(255,251,245,0.10)]",
			"dark:[&&]:!text-ds-sand-300",
			"dark:border-ds-sand-400",
			"dark:border-ds-sand-300",
			"dark:hover:border-ds-sand-300",
			"dark:bg-ds-sand-400",
			"dark:bg-ds-success",
			"dark:bg-ds-success/20",
			"dark:hover:bg-ds-success",
			"dark:text-ds-success",
			"dark:text-ds-success-soft",
			"dark:text-ds-danger",
			"dark:text-ds-danger-soft",
			"dark:text-ds-warning",
			"dark:text-ds-sand-300",
			"dark:text-ds-paper",
			"dark:text-ds-ink",
			"dark:bg-ds-paper",
			"dark:border-ds-paper",
			"dark:bg-transparent",
			"dark:bg-black/60",
			"dark:bg-[rgba(255,251,245,0.10)]",
			"dark:border-[rgba(255,251,245,0.14)]",
			"dark:border-[rgba(255,251,245,0.24)]",
			"dark:hover:bg-[rgba(255,251,245,0.10)]",
			"dark:active:bg-[rgba(255,251,245,0.14)]",
			"dark:active:bg-[rgba(255,251,245,0.10)]",
			"text-[color:var(--station-color)]",
			"dark:text-[color:var(--station-on-dark)]",
			"text-[#374151]",
		]) {
			const r = rule(`.${escaped(name)}`)
			expect(r, name).toBeTruthy()
			if (name.startsWith("dark:"))
				expect(r.selector, name).toContain('[data-theme="dark"]')
		}
	})

	it("every design-system token a dark class names in the sources of the plan and the list is a colour the configuration has: no mistyped name compiles to nothing", () => {
		const used = new Set()
		for (const file of SOURCES)
			for (const [token] of fs
				.readFileSync(path.join(POS, file), "utf8")
				.matchAll(/dark:(?:[^\s"'`]*:)?[^\s"'`]*\bds-[a-z0-9-]+(?:\/\d+)?/g))
				used.add(token)
		expect(used.size).toBeGreaterThanOrEqual(12)
		for (const name of used)
			expect(rule(`.${escaped(name)}`), name).toBeTruthy()
	})

	it("a doubled selector outranks the till's `!important` remap of the grey text and of the tints, which a plain dark class never did", () => {
		for (const name of [
			"dark:[&&]:!text-ds-sand-300",
			"dark:[&&]:!bg-[rgba(255,251,245,0.10)]",
		]) {
			const r = rule(`.${escaped(name)}`)
			// The class twice in the selector (two classes and the attribute outweigh the remap's one class and the attribute), and `!important` as the remap is
			expect(
				r.selector.split(escaped(name)).length - 1,
				name,
			).toBeGreaterThanOrEqual(2)
			expect(r.nodes.find((n) => n.type === "decl").important, name).toBe(true)
		}
	})

	it("the design system's dark colours are named in the configuration as the design system writes them", () => {
		const hex = ([r, g, b]) =>
			`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase()
		// tokens/colors.css in its dark scope: the paper colour, the secondary and tertiary text; readme 9.1: the dark ramp of the status colours
		expect(hex(colourOf("dark:text-ds-paper"))).toBe("#FFFDF8")
		expect(hex(colourOf("dark:text-ds-sand-300"))).toBe("#BFB5A4")
		expect(hex(colourOf("dark:bg-ds-sand-400", "background-color"))).toBe(
			"#968C7C",
		)
		expect(hex(colourOf("dark:text-ds-success"))).toBe("#3DBE74")
		expect(hex(colourOf("dark:text-ds-warning"))).toBe("#E6A93B")
		expect(hex(colourOf("dark:text-ds-danger"))).toBe("#FF6369")
		expect(hex(colourOf("dark:text-ds-ink"))).toBe("#141414")
	})
})

describe("the floor plan's tiles in dark mode (smoke-test fix): every word reads, every state is told apart", () => {
	const CANVAS = () => parse("#181b21")
	const canvas = () =>
		flat(colourOf("dark:bg-[#181b21]", "background-color"), CANVAS())
	// The fill of a tile in dark: the till's remap of the light tint over the canvas (and the neutral of a table being cleaned, set by this task)
	const FILLS = () => ({
		Empty: flat(remap("bg-green-50", "background-color"), canvas()),
		Occupied: flat(remap("bg-red-50", "background-color"), canvas()),
		Reserved: flat(remap("bg-yellow-50", "background-color"), canvas()),
		Paid: flat(remap("bg-blue-50", "background-color"), canvas()),
		Cleaning: flat(
			colourOf("dark:[&&]:!bg-[rgba(255,251,245,0.10)]", "background-color"),
			canvas(),
		),
	})
	const text = (name) => colourOf(name).slice(0, 3)

	it("the canvas is the ground the till's dark remap gives `bg-gray-50`, and the dots are faint", () => {
		expect(canvas().map(Math.round)).toEqual(
			flat(remap("bg-gray-50", "background-color"), canvas()).map(Math.round),
		)
		const dot = rule(
			".dark\\:\\[--plan-dot\\:rgba\\(255\\2c 255\\2c 255\\2c 0\\.1\\)\\]",
		)
		expect(dot).toBeTruthy()
		expect(declaration(dot, "--plan-dot").value.replace(/\s/g, "")).toBe(
			"rgba(255,255,255,0.1)",
		)
	})

	it("the name of every tile reads on its fill, whatever its state", () => {
		const name = remap("text-gray-900", "color").slice(0, 3)
		for (const [state, fill] of Object.entries(FILLS()))
			expect(contrast(name, fill), state).toBeGreaterThanOrEqual(4.5)
	})

	it("the state word of a tile reads on its fill: success, warning, danger of the dark ramp, the clay of the till's remap, the neutral's secondary text", () => {
		const fills = FILLS()
		const pairs = {
			"Empty: Vide": [text("dark:text-ds-success"), fills.Empty],
			"Occupied: the word": [text("dark:text-ds-danger"), fills.Occupied],
			"Reserved: Réservé": [text("dark:text-ds-warning"), fills.Reserved],
			"Paid: Payé and its tick": [
				remap("text-blue-600", "color").slice(0, 3),
				fills.Paid,
			],
			"Cleaning: Nettoyage": [text("dark:text-ds-sand-300"), fills.Cleaning],
		}
		for (const [what, [fg, bg]] of Object.entries(pairs))
			expect(contrast(fg, bg), what).toBeGreaterThanOrEqual(4.5)
	})

	it("what an order of the tile says reads on it: the count, the waiting badge, the time, the initials", () => {
		const fills = FILLS()
		// The count: the pale red on the red wash (the till's remap of `bg-red-100`) over the red tile
		const count = flat(remap("bg-red-100", "background-color"), fills.Occupied)
		expect(
			contrast(text("dark:text-ds-danger-soft"), count),
		).toBeGreaterThanOrEqual(4.5)
		// The waiting badge: ink on the orange (white on it was 3.2:1)
		const orange = colourOf("bg-orange-500", "background-color").slice(0, 3)
		expect(contrast(text("dark:text-ds-ink"), orange)).toBeGreaterThanOrEqual(
			4.5,
		)
		expect(contrast([255, 255, 255], orange)).toBeLessThan(4.5)
		// The time, and the initials of who opened it (the clay of the till's remap of `text-blue-600`)
		expect(
			contrast(text("dark:[&&]:!text-ds-sand-300"), fills.Occupied),
		).toBeGreaterThanOrEqual(4.5)
		expect(
			contrast(remap("text-blue-600", "color").slice(0, 3), fills.Occupied),
		).toBeGreaterThanOrEqual(4.5)
	})

	it("the plan's own controls read: the arrows toggle in ink on the success green, the phone's hint in the secondary text, a wall against the canvas", () => {
		expect(
			contrast(
				text("dark:text-ds-ink"),
				colourOf("dark:bg-ds-success", "background-color").slice(0, 3),
			),
		).toBeGreaterThanOrEqual(4.5)
		expect(
			contrast(text("dark:text-ds-sand-300"), canvas()),
		).toBeGreaterThanOrEqual(4.5)
		// A wall is a graphic that tells the room apart: 3:1 (the slate it was is 1.7:1 on the dark canvas)
		const wall = colourOf("dark:text-ds-sand-400").slice(0, 3)
		expect(contrast(wall, canvas())).toBeGreaterThanOrEqual(3)
		expect(contrast(parse("#374151").slice(0, 3), canvas())).toBeLessThan(3)
	})

	it("a station's name on the plan, lightened for the dark canvas, reads on the canvas washed with the station's own colour", () => {
		for (const color of [
			"#2C4FA8",
			"#D68A59",
			"#F55D1A",
			"#4A6B8F",
			"#6B7280",
		]) {
			const rgb = parse(color).slice(0, 3)
			const ground = canvas().map((v, i) => v + (rgb[i] - v) * 0.125)
			expect(
				contrast(parse(onDark(color)).slice(0, 3), ground),
				color,
			).toBeGreaterThanOrEqual(4.5)
		}
	})

	it("the five states are told apart by their fill or by their edge, whatever the pair", () => {
		const fills = FILLS()
		// The edges as the plan draws them in dark: the dark ramp's 800 of the state's colour (the clay for Paid), the tertiary text colour for Cleaning
		const edges = {
			Empty: colourOf("dark:border-green-800", "border-color").slice(0, 3),
			Occupied: colourOf("dark:border-red-800", "border-color").slice(0, 3),
			Reserved: colourOf("dark:border-yellow-800", "border-color").slice(0, 3),
			Paid: colourOf("dark:border-blue-800", "border-color").slice(0, 3),
			Cleaning: colourOf("dark:border-ds-sand-400", "border-color").slice(0, 3),
		}
		const states = Object.keys(fills)
		for (let a = 0; a < states.length; a += 1)
			for (let b = a + 1; b < states.length; b += 1) {
				const apart = Math.max(
					deltaE(fills[states[a]], fills[states[b]]),
					deltaE(edges[states[a]], edges[states[b]]),
				)
				expect(apart, `${states[a]} and ${states[b]}`).toBeGreaterThanOrEqual(
					12,
				)
			}
	})

	it("a table being cleaned is the neutral in dark (the light mode draws it as a plain tile: emerald is not one of this build's colours)", () => {
		expect(rule(".bg-emerald-50")).toBeFalsy()
		expect(rule(".border-emerald-300")).toBeFalsy()
		// Which is why the till's remap tinted it green like a free table inside a near-black edge: the green and the neutral are not the same fill
		const green = flat(remap("bg-emerald-50", "background-color"), canvas())
		expect(deltaE(green, FILLS().Cleaning)).toBeGreaterThan(12)
	})
})

describe("the list of tables in dark mode (smoke-test fix): every word reads on its surface", () => {
	const ground = () => parse("#181b21").slice(0, 3)
	const card = () =>
		colourOf("dark:bg-[#1c1f26]", "background-color").slice(0, 3)
	const text = (name) => colourOf(name).slice(0, 3)
	const wash = (name, surface) =>
		flat(colourOf(name, "background-color"), surface)

	it("the cards and the ground are the grounds the till's dark remap gives `bg-white` and `bg-gray-50`", () => {
		expect(card().map(Math.round)).toEqual(
			flat(remap("bg-white", "background-color"), ground()).map(Math.round),
		)
		expect(ground().map(Math.round)).toEqual(
			flat(remap("bg-gray-50", "background-color"), ground()).map(Math.round),
		)
	})

	it("the words of a card: the title, the details, a quiet badge, the QR glyph", () => {
		expect(contrast(text("dark:text-ds-paper"), card())).toBeGreaterThanOrEqual(
			7,
		)
		expect(
			contrast(text("dark:text-ds-sand-300"), card()),
		).toBeGreaterThanOrEqual(4.5)
	})

	it("the badges: the pale pill (paper on its wash), the paid pill (the pale mint on the success tint), the state words of a row", () => {
		const neutral = wash("dark:bg-[rgba(255,251,245,0.10)]", card())
		expect(
			contrast(text("dark:text-ds-paper"), neutral),
		).toBeGreaterThanOrEqual(4.5)
		const paid = wash("dark:bg-ds-success/20", card())
		expect(
			contrast(text("dark:text-ds-success-soft"), paid),
		).toBeGreaterThanOrEqual(4.5)
		for (const name of [
			"dark:text-ds-success",
			"dark:text-ds-warning",
			"dark:text-ds-sand-300",
		])
			expect(contrast(text(name), card()), name).toBeGreaterThanOrEqual(4.5)
		// The clay pill is ink on clay in both modes
		expect(
			contrast([20, 20, 20], parse("#D68A59").slice(0, 3)),
		).toBeGreaterThanOrEqual(4.5)
	})

	it("the filters, the section titles, the empty words and the bar's buttons", () => {
		// The chosen chip: ink on the bright paper
		expect(
			contrast(
				text("dark:text-ds-ink"),
				colourOf("dark:bg-ds-paper", "background-color").slice(0, 3),
			),
		).toBeGreaterThanOrEqual(7)
		// The others, the sections and the empty list: the secondary text on the ground
		expect(
			contrast(text("dark:text-ds-sand-300"), ground()),
		).toBeGreaterThanOrEqual(4.5)
		// The bar's buttons: paper on the bar's card
		expect(contrast(text("dark:text-ds-paper"), card())).toBeGreaterThanOrEqual(
			4.5,
		)
		// The sheet « Open a table »: its free tables in the pale mint on the success tint over the sheet
		const free = wash("dark:bg-ds-success/20", card())
		expect(
			contrast(text("dark:text-ds-success-soft"), free),
		).toBeGreaterThanOrEqual(4.5)
	})

	it("the phone's switch: ink on the paper half, the secondary text on the quiet half", () => {
		expect(
			contrast(
				text("dark:text-ds-ink"),
				colourOf("dark:bg-ds-paper", "background-color").slice(0, 3),
			),
		).toBeGreaterThanOrEqual(7)
		expect(
			contrast(text("dark:text-ds-sand-300"), card()),
		).toBeGreaterThanOrEqual(4.5)
	})
})
