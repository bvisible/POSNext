/**
 * //// Neoffice — added file (no upstream equivalent). The units of a cart line, from whichever source added it
 * //// (NeoResto lot 1, task 22).
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest"
import {
	cardItemToCartItem,
	menuItemToCartItem,
	uomChoices,
	unitsOf,
	withKnownUnits,
} from "../cartLineUnits"

// What each source says of the same bottle of water: stocked by the bottle, sold by the case too (6 bottles)
const CASE = { uom: "Case", conversion_factor: 6 }

describe("unitsOf: the units of a cart line, from whatever its source knows", () => {
	it("a grid item keeps everything it says", () => {
		const gridItem = {
			uom: "Bottle",
			stock_uom: "Bottle",
			conversion_factor: 1,
			item_uoms: [CASE],
		}

		expect(unitsOf(gridItem)).toEqual(gridItem)
	})

	it("a card entry puts the line in the stock unit of the item, worth one", () => {
		const entry = { stock_uom: "Bottle", item_uoms: [CASE] }

		expect(unitsOf(entry)).toEqual({
			uom: "Bottle",
			stock_uom: "Bottle",
			conversion_factor: 1,
			item_uoms: [CASE],
		})
	})

	it("an order row that names only the unit of the line makes it the stock unit when it is worth one stock unit", () => {
		expect(unitsOf({ uom: "Unit", conversion_factor: 1 })).toMatchObject({
			uom: "Unit",
			stock_uom: "Unit",
			item_uoms: [],
		})
		expect(unitsOf({ uom: "Unit" })).toMatchObject({ stock_uom: "Unit" })
	})

	it("an order row in a bigger unit does not make that unit the stock unit", () => {
		expect(unitsOf({ uom: "Case", conversion_factor: 6 })).toEqual({
			uom: "Case",
			stock_uom: undefined,
			conversion_factor: 6,
			item_uoms: [],
		})
	})

	it("a source that knows no unit gives a line without one, never « Nos »", () => {
		const units = unitsOf({ item_code: "wine" })

		expect(units.uom).toBeUndefined()
		expect(units.stock_uom).toBeUndefined()
		expect(units.conversion_factor).toBe(1)
		expect(units.item_uoms).toEqual([])
		expect(JSON.stringify(units)).not.toContain("Nos")
	})
})

describe("uomChoices: the units a cart line can be changed to", () => {
	it("lists the stock unit, then the others of the item", () => {
		expect(uomChoices({ stock_uom: "Bottle", item_uoms: [CASE] })).toEqual([
			"Bottle",
			"Case",
		])
	})

	it("lists a unit once, however many times the item names it", () => {
		const item = {
			stock_uom: "Bottle",
			item_uoms: [{ uom: "Bottle", conversion_factor: 1 }, CASE, CASE],
		}

		expect(uomChoices(item)).toEqual(["Bottle", "Case"])
	})

	it("always holds the unit the line is in", () => {
		expect(uomChoices({ uom: "Case", stock_uom: undefined })).toEqual(["Case"])
		expect(
			uomChoices({ uom: "Box", stock_uom: "Bottle", item_uoms: [CASE] }),
		).toEqual(["Box", "Bottle", "Case"])
	})

	it("never holds an empty choice", () => {
		expect(uomChoices({})).toEqual([])
		expect(
			uomChoices({
				uom: "",
				stock_uom: undefined,
				item_uoms: [{ uom: "" }, { uom: null }, undefined],
			}),
		).toEqual([])
	})
})

describe("cardItemToCartItem: the cart line a restaurant card entry becomes", () => {
	const entry = {
		item_type: "Item",
		item: "wine",
		item_name: "Wine",
		item_group: "Drinks",
		price: 29,
		default_price: 25,
		image: "/files/wine.png",
		custom_color: "#aa3344",
		stock_uom: "Unit",
		item_uoms: [],
	}

	it("keeps what the line showed before, and adds the unit of the item", () => {
		expect(cardItemToCartItem(entry)).toEqual({
			item_code: "wine",
			item_name: "Wine",
			item_group: "Drinks",
			rate: 29,
			image: "/files/wine.png",
			custom_color: "#aa3344",
			uom: "Unit",
			stock_uom: "Unit",
			conversion_factor: 1,
			item_uoms: [],
		})
	})

	it("prices the line at the item's default price when the card gives none, and names it by its label otherwise", () => {
		const line = cardItemToCartItem({
			item: "wine",
			label: "Wine",
			default_price: 25,
			stock_uom: "Unit",
		})

		expect(line).toMatchObject({ rate: 25, item_name: "Wine" })
	})
})

describe("menuItemToCartItem: the cart line of a course item of a chosen menu", () => {
	// What the menu dialog confirms for a course: the first item carries the whole price of the menu
	const chosen = {
		item_code: "water",
		item_name: "Water",
		course_name: "Drink",
		menu_name: "Lunch",
		menu_price: 25,
		is_menu_item: true,
		price_override: 25,
		stock_uom: "Bottle",
		item_uoms: [CASE],
	}

	it("keeps the dish, its share of the price, its menu and its course", () => {
		expect(menuItemToCartItem(chosen)).toMatchObject({
			item_code: "water",
			item_name: "Water",
			rate: 25,
			is_menu_item: true,
			menu_name: "Lunch",
			posa_special_instructions: "[Lunch] Drink",
		})
	})

	it("carries the units of the item the dialog was given", () => {
		expect(menuItemToCartItem(chosen)).toMatchObject({
			uom: "Bottle",
			stock_uom: "Bottle",
			conversion_factor: 1,
			item_uoms: [CASE],
		})
	})

	it("makes no unit up for an item that came without any", () => {
		const line = menuItemToCartItem({
			...chosen,
			stock_uom: undefined,
			item_uoms: undefined,
		})

		expect(line.uom).toBeUndefined()
		expect(line.stock_uom).toBeUndefined()
		expect(line.item_uoms).toEqual([])
	})
})

describe("withKnownUnits: the rows of a stored invoice, given the units the till keeps", () => {
	const known = { item_code: "water", stock_uom: "Bottle", item_uoms: [CASE] }
	const find = vi.fn(async (code) => (code === "water" ? known : null))

	it("gives a row the other units of its item and its stock unit", async () => {
		const [row] = await withKnownUnits(
			[{ item_code: "water", uom: "Bottle", conversion_factor: 1 }],
			find,
		)

		expect(row).toMatchObject({
			uom: "Bottle",
			stock_uom: "Bottle",
			item_uoms: [CASE],
		})
	})

	it("leaves alone a row whose item the till does not know, a row that already has its units and a row without an item", async () => {
		const unknown = { item_code: "wine", uom: "Unit" }
		const complete = { item_code: "water", item_uoms: [CASE], stock_uom: "X" }
		const nothing = { qty: 1 }

		expect(await withKnownUnits([unknown, complete, nothing], find)).toEqual([
			unknown,
			complete,
			nothing,
		])
	})

	it("survives a lookup that fails", async () => {
		const failing = vi.fn(async () => {
			throw new Error("IndexedDB is closed")
		})
		const row = { item_code: "water", uom: "Bottle" }

		expect(await withKnownUnits([row], failing)).toEqual([row])
	})
})
