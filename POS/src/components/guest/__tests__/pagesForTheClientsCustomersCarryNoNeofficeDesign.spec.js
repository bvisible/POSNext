/**
 * //// Neoffice — added file (no upstream equivalent). The pages a client shows its own customers carry none of Neoffice's
 * //// art direction (Jérémy, 05.11.2026; design system §7.6): no clay, which the till paints its blue, indigo, violet and
 * //// purple ramps with (tailwind.config.js), and no Forum. Read from their sources, so that a page written later in the
 * //// till's colours is refused here, not found on a customer's phone. A field names its own focus colour: the forms
 * //// plugin would give it the till's blue-600, clay, which no class in the source shows.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The app's src folder, from this file's own path (jsdom's URL does not take a file address)
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..") + "/"

const PAGES = [
	"pages/GuestOrder.vue",
	"pages/TakeawayOrder.vue",
	"pages/GuestReservation.vue",
	"pages/PublicMenu.vue",
	"pages/ShopScan.vue",
	"components/guest/GuestAccountSheet.vue",
	"components/guest/GuestCart.vue",
	"components/guest/GuestCheckout.vue",
	"components/guest/GuestMenuView.vue",
	"components/shop/ShopCart.vue",
	"components/shop/ShopCounter.vue",
	"components/shop/ShopScanner.vue",
	"utils/menuQrSheet.js",
	"utils/shopPoster.js",
]

// A Tailwind class of a ramp the till maps to clay, with or without a variant (`active:bg-blue-700`)
const CLAY_CLASS = /(?<![\w-])(?:[a-z]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|accent)-(?:blue|indigo|violet|purple)-\d{2,3}\b/g
// A selection stands in ink, as a chosen slot of the reservation does: never a tint of amber
const AMBER_SELECTION = /\? ?['"]bg-amber-100 text-amber-800/g
// The clay and the signal written as colours (#a15a2e, #c2723f, #d68a59, #f55d1a, #aa3700)
const CLAY_HEX = /#(?:a15a2e|c2723f|d68a59|f55d1a|aa3700)\b/gi

// The fields of a Vue template: a <template> keeps what it holds in its `content`, which querySelectorAll does not search
function fieldsOf(root) {
	return [
		...root.querySelectorAll("input, textarea, select"),
		...[...root.querySelectorAll("template")].flatMap((inner) => fieldsOf(inner.content)),
	]
}

describe("the pages a client shows its own customers", () => {
	it.each(PAGES)("%s carries no clay and no Forum", (page) => {
		const source = readFileSync(SRC + page, "utf8")

		expect(source.match(CLAY_CLASS) || []).toEqual([])
		expect(source.match(CLAY_HEX) || []).toEqual([])
		expect(source.match(AMBER_SELECTION) || []).toEqual([])
		// The face named in a rule (« font-family: "Forum" »), not a word in a comment that says it is gone
		expect(source).not.toMatch(/["']Forum["']/)
	})

	it.each(PAGES.filter((page) => page.endsWith(".vue")))("%s gives each field its own focus colour", (page) => {
		const source = readFileSync(SRC + page, "utf8")
		const template = source.slice(source.indexOf("<template>") + "<template>".length, source.lastIndexOf("</template>"))
		const page_ = new DOMParser().parseFromString(`<template>${template}</template>`, "text/html")
		const fields = fieldsOf(page_)
			// A field the guest never sees (a trap for robots, a hidden value) has no focus to colour
			.filter((field) => field.getAttribute("class") && field.getAttribute("tabindex") !== "-1")

		// Its own focus: Tailwind's focus border and ring, or a `:focus` rule of one of its classes in the page's own style
		const focused = (classes) =>
			(/focus:border-/.test(classes) && /focus:ring-/.test(classes)) ||
			classes.split(/\s+/).some((name) => name && source.includes(`.${name}:focus`))
		const bare = fields.map((field) => field.getAttribute("class")).filter((classes) => !focused(classes))
		expect(bare).toEqual([])
	})
})
