/**
 * //// Neoffice — added file (no upstream equivalent). The pages a client shows its own customers carry none of Neoffice's
 * //// art direction (Jérémy, 05.11.2026; design system §7.6): no clay, which the till paints its blue, indigo, violet and
 * //// purple ramps with (tailwind.config.js), and no Forum. Read from their sources, so that a page written later in the
 * //// till's colours is refused here, not found on a customer's phone.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SRC = fileURLToPath(new URL("../../../", import.meta.url))

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
// The clay and the signal written as colours (#a15a2e, #c2723f, #d68a59, #f55d1a, #aa3700)
const CLAY_HEX = /#(?:a15a2e|c2723f|d68a59|f55d1a|aa3700)\b/gi

describe("the pages a client shows its own customers", () => {
	it.each(PAGES)("%s carries no clay and no Forum", (page) => {
		const source = readFileSync(SRC + page, "utf8")

		expect(source.match(CLAY_CLASS) || []).toEqual([])
		expect(source.match(CLAY_HEX) || []).toEqual([])
		// The face named in a rule (« font-family: "Forum" »), not a word in a comment that says it is gone
		expect(source).not.toMatch(/["']Forum["']/)
	})
})
