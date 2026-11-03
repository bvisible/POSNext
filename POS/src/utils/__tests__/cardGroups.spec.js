/**
 * //// Neoffice — added file (no upstream equivalent). A card with two levels (NeoResto lot 1, product owner, 03.11.2026: « des sous-familles : vin blanc, vin rouge, bière… dans les boissons »):
 * //// the groups the till lays out, the two rows of chips (categories, then the sub-categories of the one chosen), and what a choice or a search keeps.
 */
import { describe, expect, it } from "vitest"
import { categoriesOfCard, colorOfGroup, groupsOfCard, subcategoriesOf, visibleGroups } from "../cardGroups"

const category = (label, extra = {}) => ({ item_type: "Category", label, ...extra })
const sub = (label) => category(label, { is_subcategory: 1 })
const dish = (name, extra = {}) => ({ item_type: "Item", item: name, item_name: name, ...extra })

const CARD = [
	category("Starters"),
	dish("Soup"),
	category("Drinks"),
	sub("Beers"),
	dish("Lager", { service_color: "#E0980F" }),
	dish("Wheat", { service_color: "#E0980F" }),
	sub("Wines"),
	dish("Gamay", { service_color: "#C1372C" }),
	category("Desserts"),
	dish("Tiramisu"),
]

describe("the groups of a card", () => {
	it("are a group per category and per sub-category, in order", () => {
		const groups = groupsOfCard(CARD)

		expect(groups.map((g) => [g.category, g.subcategory ?? null, g.items.length])).toEqual([
			["Starters", null, 1],
			["Drinks", null, 0],
			["Drinks", "Beers", 2],
			["Drinks", "Wines", 1],
			["Desserts", null, 1],
		])
	})

	it("keep a card with no sub-category as it always was", () => {
		const groups = groupsOfCard([category("A"), dish("x"), category("B"), dish("y")])

		expect(groups.map((g) => [g.category, g.items.length])).toEqual([["A", 1], ["B", 1]])
		expect(groups.every((g) => g.subcategory === undefined)).toBe(true)
	})

	it("read a sub-category with no category above it as a category of its own", () => {
		const groups = groupsOfCard([sub("Alone"), dish("x")])

		expect(groups).toEqual([{ category: "Alone", items: [expect.objectContaining({ item: "x" })] }])
	})

	it("carry the dishes that stand before any category", () => {
		const groups = groupsOfCard([dish("Loose"), category("A"), dish("x")])

		expect(groups[0]).toEqual({ category: null, items: [expect.objectContaining({ item: "Loose" })] })
	})
})

describe("the two rows of chips", () => {
	it("are the categories, without the sub-categories", () => {
		expect(categoriesOfCard(CARD)).toEqual(["Starters", "Drinks", "Desserts"])
	})

	it("are, under the category chosen, its sub-categories with the colour of their dishes", () => {
		const groups = groupsOfCard(CARD)

		expect(subcategoriesOf(groups, "Drinks")).toEqual([
			{ label: "Beers", color: "#E0980F" },
			{ label: "Wines", color: "#C1372C" },
		])
		expect(subcategoriesOf(groups, "Starters")).toEqual([])
		expect(subcategoriesOf(groups, null)).toEqual([])
	})

	it("take the colour most of the dishes carry, the dish's own before its family's", () => {
		const group = { items: [dish("a", { custom_color: "#112233" }), dish("b", { service_color: "#445566" }), dish("c", { service_color: "#445566" })] }

		expect(colorOfGroup(group)).toBe("#445566")
		expect(colorOfGroup({ items: [dish("a")] })).toBeNull()
		expect(colorOfGroup({ items: [{ item_type: "Menu", service_color: "#445566" }] })).toBeNull()
	})
})

describe("what the till draws", () => {
	const groups = groupsOfCard(CARD)

	it("is everything while nothing is chosen", () => {
		expect(visibleGroups(groups)).toEqual(groups)
	})

	it("is the category chosen, with its sub-categories, nameless as the chip says it", () => {
		const shown = visibleGroups(groups, { category: "Drinks" })

		expect(shown.map((g) => [g.category, g.subcategory ?? null])).toEqual([[null, null], [null, "Beers"], [null, "Wines"]])
	})

	it("is the sub-category chosen only", () => {
		const shown = visibleGroups(groups, { category: "Drinks", subcategory: "Wines" })

		expect(shown).toHaveLength(1)
		expect(shown[0].items.map((i) => i.item)).toEqual(["Gamay"])
	})

	it("is what the search finds, a group with no dish left out", () => {
		const shown = visibleGroups(groups, { query: "ger" })

		expect(shown.map((g) => g.subcategory)).toEqual(["Beers"])
		expect(shown[0].items.map((i) => i.item)).toEqual(["Lager"])
	})

	it("is nothing for a category that is not on the card", () => {
		expect(visibleGroups(groups, { category: "Cheese" })).toEqual([])
	})
})
