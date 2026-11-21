/**
 * //// Neoffice — added file (no upstream equivalent). The secondary text of the till reads (neoffice-maintenance#3222, follow-up; product owner: « les textes secondaires de la caisse
 * //// sous 4,5:1, de façon systémique »). The till writes its secondary text as `text-gray-500` and `text-gray-600` (about 960 uses): the preset draws them #999999 and #7C7C7C,
 * //// 2.9:1 and 4.2:1 on white. They are the design system's `--text-secondary` (sand-600, #524B41) in the light theme, once, in the Tailwind configuration (the TEXT colour only: a
 * //// gray-500 border or fill keeps its colour), and the dark theme is index.css's remap of the same classes, which holds on every dark surface of the till. The configuration is
 * //// compiled the way the app's build compiles it and the rules are read; the contrast is computed here, against the surfaces the scan of the screens met.
 * @vitest-environment node
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"
import tailwindcss from "tailwindcss"
import { beforeAll, describe, expect, it } from "vitest"

const here = path.dirname(fileURLToPath(import.meta.url))
const POS = path.resolve(here, "../..")
const indexCss = fs.readFileSync(path.join(POS, "src/index.css"), "utf8")

let css = ""
beforeAll(async () => {
	// Tailwind reads its `content` globs from the working directory: vitest runs from POS/, as the app's own build does
	const previous = process.cwd()
	process.chdir(POS)
	try {
		const result = await postcss([tailwindcss({ config: path.join(POS, "tailwind.config.js") })]).process("@tailwind utilities;", { from: undefined })
		css = result.css
	} finally {
		process.chdir(previous)
	}
}, 180000)

/** The `color` (or `background-color`, `border-color`) a compiled class draws, as `#rrggbb`, or null where the class was not compiled. */
function colourOf(selector, prop = "color") {
	let value = null
	postcss.parse(css).walkRules((r) => {
		if (value || r.selector !== selector) return
		const decl = r.nodes.find((n) => n.type === "decl" && n.prop === prop)
		if (!decl) return
		const m = decl.value.match(/rgb\((\d+) (\d+) (\d+)/)
		if (m) value = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase()
	})
	return value
}

const channel = (v) => {
	const s = v / 255
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
	const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16)))
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

// What the scan of the till's screens met behind a secondary text, in the light theme (the page, a panel, a tile, the agenda's stripes and free hours, a green band) ...
const LIGHT_SURFACES = ["#FFFFFF", "#F8F8F8", "#FEFEFE", "#F3F4F6", "#F3F3F3", "#F6F3ED", "#ECE7DE", "#DDE2EA", "#F2FDF4", "#FAEFE6", "#FFF9F5"]
// ... and in the dark one (what the remaps of bg-white, bg-gray-50/100/200 give, the agenda's free hours, a tile, a clay tint)
const DARK_SURFACES = ["#1C1F26", "#181B21", "#23272F", "#2B2F38", "#2C2D32", "#2D292B", "#3A302E"]

describe("the secondary text of the till in the light theme: the design system's, from the Tailwind configuration", () => {
	it("draws text-gray-500 and text-gray-600 as --text-secondary (sand-600), the preset's greys no more", () => {
		expect(colourOf(".text-gray-500")).toBe("#524B41")
		expect(colourOf(".text-gray-600")).toBe("#524B41")
	})

	it("draws the 600 of an orange and of an amber text as their 700", () => {
		expect(colourOf(".text-orange-600")).toBe("#C2410C")
		expect(colourOf(".text-amber-600")).toBe("#B45309")
	})

	it("reaches 4.5:1 on every light surface the till's screens put behind a secondary text", () => {
		for (const [name, colour] of Object.entries({ gray: "#524B41", orange: "#C2410C", amber: "#B45309" })) {
			for (const surface of name === "gray" ? LIGHT_SURFACES : LIGHT_SURFACES.filter((s) => ["#FFFFFF", "#F8F8F8", "#FFF9F5", "#FEFEFE"].includes(s))) {
				expect(contrast(colour, surface), `${name} ${colour} on ${surface}`).toBeGreaterThanOrEqual(4.5)
			}
		}
	})

	it("changes the text colour only: a gray-500 or gray-600 border, fill or ring keeps its colour", () => {
		for (const [selector, prop] of [[".bg-gray-600", "background-color"], [".bg-gray-500", "background-color"], [".border-gray-500", "border-color"], [".border-gray-600", "border-color"]]) {
			const colour = colourOf(selector, prop)
			if (colour) expect(colour, selector).not.toBe("#524B41")
		}
	})

	it("also draws a placeholder written with the class, and a hover that says it", () => {
		expect(css).toMatch(/\.placeholder\\:text-gray-500::placeholder\s*\{[^}]*rgb\(82 75 65/)
	})

	it("draws a placeholder of the light theme as the sand-500 of the design system (5.1:1 on white), under the class of a placeholder that says its own", () => {
		expect(indexCss).toMatch(/\ninput::placeholder,\s*\ntextarea::placeholder \{ color: #6F665A; \}/)
		for (const surface of ["#FFFFFF", "#F8F8F8"]) expect(contrast("#6F665A", surface), surface).toBeGreaterThanOrEqual(4.5)
	})

	it("gives the till's own muted ink the same colour in the light theme", () => {
		expect(indexCss).toMatch(/--pos-ink-muted:\s*#524B41;/)
	})
})

describe("the secondary text of the till in the dark theme: the remap holds on every dark surface", () => {
	const remap = (cls) => indexCss.match(new RegExp(`\\[data-theme='dark'\\] \\.${cls},\\s*\\.dark \\.${cls} \\{ color: (#[0-9a-fA-F]{6}) !important; \\}`))?.[1]

	it("keeps the !important remap of text-gray-500 and text-gray-600, which wins over a `dark:text-gray-…` class", () => {
		expect(remap("text-gray-500")).toBe("#9aa3b2")
		expect(remap("text-gray-600")).toBe("#9aa3b2")
	})

	it("reaches 4.5:1 on every dark surface the scan met (the former #828b99 was 3.9:1 on a tile)", () => {
		for (const surface of DARK_SURFACES) expect(contrast("#9aa3b2", surface), surface).toBeGreaterThanOrEqual(4.5)
		expect(contrast("#828b99", "#2B2F38")).toBeLessThan(4)
	})

	it("draws a placeholder with the same grey", () => {
		expect(indexCss).toMatch(/\[data-theme='dark'\] input::placeholder,\s*\.dark input::placeholder \{ color: #9aa3b2 !important; \}/)
	})

	it("fades a disabled button of the dark theme, which looked active (« Payment » on an empty cart, « Add » at 0: neoffice-maintenance#3234)", () => {
		expect(indexCss).toMatch(/\[data-theme='dark'\] button:disabled,\s*\.dark button:disabled \{ opacity: 0\.55; \}/)
	})

	it("draws text-pos-action on a dark surface lighter than the clay 600 of the buttons (2.5:1 on the active pill)", () => {
		const colour = indexCss.match(/\[data-theme='dark'\] \.text-pos-action,\s*\.dark \.text-pos-action \{ color: (#[0-9a-fA-F]{6}); \}/)?.[1]
		expect(colour).toBe("#dda479")
		for (const surface of DARK_SURFACES) expect(contrast(colour, surface), surface).toBeGreaterThanOrEqual(4.5)
	})
})

describe("the elements of the till's screens that the scan found under 4.5:1 and that no class of the palette reaches", () => {
	const source = (file) => fs.readFileSync(path.join(POS, file), "utf8")

	it("draws the initials of the avatar in white on clay 600..700 (3.6:1 on 500..600)", () => {
		const menu = source("src/components/common/UserMenu.vue")
		expect(menu).toContain("from-blue-600 to-blue-700")
		expect(menu).not.toContain("from-blue-500 to-blue-600")
	})

	it("draws the monogram of a customer, his address and the caption of a cart thumbnail on a colour that reads", () => {
		const cart = source("src/components/sale/InvoiceCart.vue")
		expect(cart).toContain('class="text-[10px] font-bold text-blue-700"')
		expect(cart).not.toContain('class="text-[10px] font-bold text-blue-600"')
		expect(cart).toContain('class="text-[9px] text-gray-600 truncate flex items-center gap-0.5"')
		expect(cart).not.toContain('class="text-[9px] text-gray-400 truncate flex items-center gap-0.5"')
		// the thumbnail is light in the dark theme too (inline style): a colour the dark remap of the greys does not turn light
		expect(cart).toMatch(/\? 'text-white'\s*: 'text-\[#524B41\]'/)
		expect(cart).not.toMatch(/\? 'text-white'\s*: 'text-gray-(400|500|600)'/)
	})

	it("draws the captions of the list thumbnails of the items the same way", () => {
		const items = source("src/components/sale/ItemsSelector.vue")
		expect(items.match(/: 'text-\[#524B41\]'/g)).toHaveLength(2)
		expect(items).not.toMatch(/\? 'text-white'\s*: 'text-gray-500'/)
	})

	it("draws the pay button as white on green 700 (2.6:1 on 500), the dimmed « submitting » state apart", () => {
		const dialog = source("src/components/sale/PaymentDialog.vue")
		expect(dialog.match(/bg-green-700 text-white active:bg-green-800/g)).toHaveLength(2)
		expect(dialog).not.toContain("bg-green-500 text-white")
		expect(dialog).toContain("bg-green-300 text-white cursor-not-allowed") // a disabled state stays grey on purpose
	})

	it("draws the informative texts of the payment window in gray 600, never the gray 400 of 1.6:1 (a disabled state keeps its grey)", () => {
		const dialog = source("src/components/sale/PaymentDialog.vue")
		expect(dialog).toContain('<span class="text-xs text-gray-600"\n\t\t\t\t\t\t\t\t\t>{{ __("Max") }}')
		expect(dialog).toContain("'text-gray-600' /* //// Neoffice — the currency of the custom amount reads")
		expect(dialog).toContain('class="text-xs text-gray-600 hover:text-red-500 transition-colors"')
		expect(dialog).toContain('class="text-xs text-gray-600 hover:text-gray-800 transition-colors py-1 text-center"')
		expect(dialog).toContain("cursor-not-allowed opacity-60") // a disabled button keeps its grey on purpose
	})

	it("leaves the currency of the custom amount the room it needs in front of the amount (« CHF » over « Personnalisé » on a phone)", () => {
		const dialog = source("src/components/sale/PaymentDialog.vue")
		expect(dialog).toContain("? 'h-7 ps-8 pe-1.5 text-xs'")
		expect(dialog).toContain(": 'h-8 ps-9 pe-2 text-sm'")
		expect(dialog).not.toContain("'h-7 ps-5 pe-1.5 text-xs'")
		expect(dialog).not.toContain("'h-8 ps-6 pe-2 text-sm'")
	})

	it("draws the count of the cart as white on red 700 (3.8:1 on 500)", () => {
		const sale = source("src/pages/POSSale.vue")
		expect(sale).toContain("absolute -top-2 -end-2 bg-red-700 text-white")
		expect(sale).not.toContain("absolute -top-2 -end-2 bg-red-500 text-white")
	})

	it("draws the selected discount-type toggles of the payment window (« % » and « CHF ») as white on orange 700 (3.2:1 on 500)", () => {
		const dialog = source("src/components/sale/PaymentDialog.vue")
		expect(dialog.match(/'bg-orange-700 text-white'/g)).toHaveLength(2)
		expect(dialog).not.toContain("'bg-orange-500 text-white'")
	})

	it("draws the label of an item tile in the ink of the design system, never a grey 800, on a light colour", () => {
		expect(source("src/components/sale/ItemsSelector.vue")).toContain('isLightColor(item.custom_color) ? "text-[#141414]" : "text-white"')
		expect(source("src/components/restaurant/RestaurantCardGrid.vue")).toContain('isLightColor(item.custom_color) ? "text-[#141414]" : "text-white"')
	})
})
