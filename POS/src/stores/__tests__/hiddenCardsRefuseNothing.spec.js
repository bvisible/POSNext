/**
 * //// Neoffice — added file (no upstream equivalent). Nothing in the till may refuse something because the card a line
 * //// came from is hidden by the opening hours (NeoRestau lot 1, task 25, as the product owner amended it on
 * //// 31.10.2026): a table opened at 13:00 on the noon card is still edited, sent to the kitchen, printed and PAID at
 * //// 14:30, when the hours have taken that card off the till.
 * ////
 * //// A line carries an item, never the card it was picked from, so the only way a hidden card could stop a sale is a
 * //// place of the sale path that reads which cards are on the till. This spec lists those places, one test each, and
 * //// fails the day one of them starts to read the cards (the store's lists, the endpoints that serve them, the
 * //// opening hours' card column). A place that must read them one day is then a decision, not an accident.
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = resolve(__dirname, "../..")
const read = (path) => readFileSync(join(SRC, path), "utf8")

// What reads which cards the till holds: the store's lists, its way of fetching and opening them, the server's
// endpoints, and the column of the opening hours that assigns a card to a slot.
const CARD_AVAILABILITY =
	/\b(shownCards|activeCards|hiddenCards|openedCards|pickableCards|fetchActiveCards|fetchHiddenCards|openCardByHand|closeCardOpenedByHand|get_active_cards|get_other_cards|open_card_outside_hours|restaurant_card|has_active_cards|hasActiveCards)\b/

// The body of a function of a source file, by name, the braces counted from its first one
function bodyOf(path, name) {
	const source = read(path)
	const found = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(
		source,
	)
	expect(found, `${name} is in ${path}`).not.toBeNull()
	const open = source.indexOf("{", source.indexOf(")", found.index))
	let depth = 0
	for (let at = open; at < source.length; at += 1) {
		if (source[at] === "{") depth += 1
		if (source[at] === "}") depth -= 1
		if (depth === 0) return source.slice(found.index, at + 1)
	}
	throw new Error(`${name} is never closed in ${path}`)
}

function filesOf(directory) {
	return readdirSync(join(SRC, directory), { withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(js|vue)$/.test(entry.name))
		.map((entry) => `${directory}/${entry.name}`)
}

const POS_SALE = "pages/POSSale.vue"

// [what the cashier does at 14:30, the code that does it]
const PLACES = [
	[
		"edits a line of an order opened at 13:00",
		() => bodyOf(POS_SALE, "handleEditItem"),
	],
	["edits a line, in the cart", () => read("stores/posCart.js")],
	[
		"edits a line, in its dialog",
		() => read("components/sale/EditItemDialog.vue"),
	],
	[
		"recalls the order of a table (the floor plan)",
		() => bodyOf("components/pos/FloorPlanEditor.vue", "selectTable"),
	],
	[
		"recalls the order of a table (the order screen)",
		() => bodyOf(POS_SALE, "handleTableSelected"),
	],
	["loads a table's draft", () => bodyOf(POS_SALE, "handleLoadTableDraft")],
	[
		"loads an order held on the server",
		() => bodyOf(POS_SALE, "handleLoadServerDraft"),
	],
	["reloads a held draft", () => bodyOf(POS_SALE, "handleLoadDraft")],
	[
		"sends the order to the kitchen",
		() => bodyOf(POS_SALE, "handleSendToKitchen"),
	],
	[
		"sends the order to the kitchen (the items it marks as sent)",
		() => bodyOf(POS_SALE, "handleItemsSentToKitchen"),
	],
	[
		"sends the order to the kitchen (its dialog)",
		() => read("components/sale/SendToKitchenDialog.vue"),
	],
	["goes to the payment", () => bodyOf(POS_SALE, "handleProceedToPayment")],
	["pays, in the till", () => bodyOf(POS_SALE, "handlePaymentCompleted")],
	[
		"pays, in the payment dialog",
		() => read("components/sale/PaymentDialog.vue"),
	],
	[
		"saves, submits and prints the invoice",
		() => read("composables/useInvoice.js"),
	],
	["keeps a draft", () => read("stores/posDrafts.js")],
	["prints the invoice", () => bodyOf(POS_SALE, "handlePrintInvoice")],
	[
		"sells while the till is offline",
		() => filesOf("utils/offline").map(read).join("\n"),
	],
	["syncs what was sold offline", () => read("stores/posSync.js")],
	[
		"syncs what was sold offline (its composable)",
		() => read("composables/useOffline.js"),
	],
	[
		"edits an invoice kept offline",
		() => bodyOf(POS_SALE, "handleEditOfflineInvoice"),
	],
	[
		"reads the kitchen's screen",
		() => read("components/invoices/KDSOrderCard.vue"),
	],
	["reads the runner's screen", () => read("pages/Runner.vue")],
]

describe("at 14:30, with the noon card off the till, the till refuses nothing because of it", () => {
	it.each(PLACES)("the cashier %s", (_what, code) => {
		const source = code()
		expect(source.length).toBeGreaterThan(0)
		expect(source.match(CARD_AVAILABILITY)).toBeNull()
	})

	it("does read the cards where they are sold from: the row of cards and its « ⋯ » (the guard sees them)", () => {
		// The pattern is not blind: it finds the places that do read the cards
		for (const path of [
			"stores/restaurant.js",
			"composables/useCardPicker.js",
			"composables/useRealtimeCards.js",
		]) {
			expect(read(path).match(CARD_AVAILABILITY), path).not.toBeNull()
		}
		expect(bodyOf(POS_SALE, "handleSendToKitchen")).not.toMatch(
			CARD_AVAILABILITY,
		)
		expect(read(POS_SALE)).toMatch(/shownCards/)
	})
})

describe("what the hours decide is what is offered for sale, nothing else", () => {
	it("is read by the store of the cards, their screen and their editors, and by no file of the sale path", () => {
		const readers = [
			...filesOf("stores"),
			...filesOf("composables"),
			...filesOf("pages"),
			...filesOf("components/sale"),
			...filesOf("components/pos"),
			...filesOf("components/restaurant"),
			...filesOf("components/settings"),
			...filesOf("components/invoices"),
		]
			.filter((path) => CARD_AVAILABILITY.test(read(path)))
			.sort()

		// The cards of the till (its store and the « ⋯ » that fetches one), the screen that lays them out, the card editor
		// and the settings that assign cards to slots: nothing else of the till knows which cards are on it.
		expect(readers).toEqual([
			"components/restaurant/CardEditor.vue",
			"components/settings/OpeningHoursEditor.vue",
			"components/settings/TillSettingsScreen.vue",
			"composables/useCardPicker.js",
			"composables/useRealtimeCards.js",
			"pages/POSSale.vue",
			"stores/restaurant.js",
		])
	})
})
