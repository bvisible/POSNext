/**
 * //// Neoffice — added file (no upstream equivalent). The phone's order screen (NeoRestau lot 1, task 27) is a new
 * //// face on the till's own paths, read here in POSSale.vue: a touch adds a dish exactly as the card grid of a
 * //// tablet does (handleCardItemClick, the same stock rule, the same card), a long press opens the options in the
 * //// sheet that takes the options dialog's place on a phone (the same handle, so every path that opens the dialog
 * //// opens the sheet there), back closes the table as the table banner's « Back » does, and the bottom bar opens
 * //// the cart tab.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { cardItemLine } from "@/utils/phoneCard"

const SOURCE = readFileSync(path.resolve(__dirname, "../POSSale.vue"), "utf8")

/** The opening tag of the first element of that name, attributes included */
function tag(name) {
	const start = SOURCE.indexOf(`<${name}`)
	expect(start, `<${name}> in POSSale.vue`).toBeGreaterThan(-1)
	let depth = 0
	for (let at = start; at < SOURCE.length; at++) {
		const char = SOURCE[at]
		if (char === '"') depth = depth ? 0 : 1
		if (char === ">" && !depth) return SOURCE.slice(start, at + 1)
	}
	throw new Error(`unterminated <${name}>`)
}

/** The value of an attribute of a tag, its whitespace folded */
function attribute(text, name) {
	const found = text.match(new RegExp(`\\s${name.replace(/[.:]/g, "\\$&")}="([^"]*)"`))
	return found ? found[1].replace(/\s+/g, " ").trim() : null
}

describe("the phone's order screen in the till", () => {
	const screen = tag("PhoneOrderScreen")
	const grid = tag("RestaurantCardGrid")

	it("adds a dish through the very handler of the card grid", () => {
		expect(attribute(screen, "@pick")).toBe(attribute(grid, "@pick"))
		expect(attribute(screen, "@pick")).toContain("handleCardItemClick(item)")
		expect(attribute(screen, "@pick")).toContain("handleCardMenuClick(item)")
	})

	it("judges « sold out » with the card grid's stock rule, on the card the till has chosen", () => {
		expect(attribute(screen, ":stock-of")).toBe(attribute(grid, ":stock-of"))
		expect(attribute(screen, "v-model:selected-card")).toBe("selectedCard")
		expect(attribute(screen, ":cards")).toBe("restaurantStore.activeCards")
	})

	it("opens the options in the sheet, a menu in the menu's own dialog", () => {
		const options = attribute(screen, "@options")

		expect(options).toContain("itemModifiersRef")
		expect(options).toContain("openForCardItem(item)")
		expect(options).toContain("handleCardMenuClick(item)")
	})

	it("goes back as the table banner's « Back » does, to the table's QR code, and to the cart tab", () => {
		expect(attribute(screen, "@back")).toBe("closeTable")
		expect(attribute(screen, "@qr")).toBe("handleQRButtonClick")
		expect(attribute(screen, "@open-order")).toBe("handleTabSwitch('cart')")
		expect(attribute(screen, "v-if")).toBe("phoneOrderShown")
	})
})

describe("a long press adds the line a touch would add", () => {
	it("with every field the card grid's touch gives the line (handleCardItemClick)", () => {
		// The touch builds its line in POSSale.vue; the long press in utils/phoneCard.js (cardItemLine). A field the
		// touch gains (a unit, a course) must reach the long press too, or the two lines differ in the kitchen
		const start = SOURCE.indexOf("function handleCardItemClick(cardItem)")
		expect(start, "handleCardItemClick in POSSale.vue").toBeGreaterThan(-1)
		const body = SOURCE.slice(start, SOURCE.indexOf("cartStore.addItem(", start))
		const literal = body.slice(body.indexOf("const item = {"), body.indexOf("};"))
		const touch = new Set([
			...[...literal.matchAll(/^\s*(\w+):/gm)].map((found) => found[1]),
			...[...body.matchAll(/\bitem\.(\w+)\s*=[^=]/g)].map((found) => found[1]),
		])
		const longPress = cardItemLine(
			{
				item_type: "Item",
				item: "STEAK",
				item_name: "Rib steak",
				item_group: "Meat",
				price: 42,
				image: "/files/steak.jpg",
				custom_color: "#C2723F",
			},
			() => ({ station: "Grill" }),
		)

		expect(touch.size).toBeGreaterThan(5)
		expect(Object.keys(longPress).sort()).toEqual([...touch].sort())
	})
})

describe("under the phone's order screen", () => {
	it("the till's own card is not drawn, so its pictures are not loaded", () => {
		// The block that holds the card's grid and its list view
		const grid = SOURCE.indexOf("<RestaurantCardGrid")
		const block = SOURCE.slice(SOURCE.lastIndexOf("<div", grid), grid)
		const opening = block.slice(0, block.indexOf(">") + 1)

		expect(opening).toContain('v-if="!phoneOrderShown"')
		// Nothing else opens between that block and the grid: the list view, its sibling, goes with it
		expect(block.slice(opening.length)).not.toMatch(/<div|<template/)
	})
})

describe("a dish whose price is typed at the till, added by a long press", () => {
	it("is taken back when its price is cancelled", () => {
		const start = SOURCE.indexOf("function handleModifiersSaved(")
		const body = SOURCE.slice(start, SOURCE.indexOf("\n}\n", start))

		expect(body).toMatch(/function handleModifiersSaved\(cartItem, how\)/)
		expect(body).toContain("how?.added")
		expect(body).toContain("onCancel")
		expect(body).toContain("cartStore.removeItem(cartItem)")
	})
})

describe("the options of a dish on a phone", () => {
	it("open in the sheet, through the handle every path of the till opens the options dialog with", () => {
		const sheet = tag("PhoneOptionsSheet")
		const dialog = tag("ItemModifiersDialog")

		expect(attribute(sheet, "ref")).toBe("itemModifiersRef")
		expect(attribute(dialog, "ref")).toBe("itemModifiersRef")
		expect(attribute(sheet, "v-if")).toBe("phoneLayout")
		expect(dialog).toMatch(/\sv-else[\s/>]/)
		expect(attribute(sheet, "@saved")).toBe(attribute(dialog, "@saved"))
	})
})
