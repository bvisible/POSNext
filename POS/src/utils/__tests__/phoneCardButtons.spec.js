/**
 * //// Neoffice — added file (no upstream equivalent). What the phone's order screen reads off a restaurant card
 * //// (NeoResto lot 1, task 27; product owner, 31.10.2026, pointing at the waiter mockup): one chip per type of the
 * //// card (its categories, else its items' item groups), one colour per type taken from the items' own colour (the
 * //// Item's custom_color), the quantities already in the order, and the price of a dish with its options.
 */
import { describe, expect, it } from "vitest"
import {
	PHONE_MAX_WIDTH,
	articleCount,
	cardColor,
	cardItemLine,
	cardSections,
	formatCount,
	groupRule,
	orderedByItem,
	phoneOrderShown,
	pricedChoice,
	softTint,
} from "../phoneCard"

const category = (label) => ({ item_type: "Category", label })
const dish = (item, extra = {}) => ({ item_type: "Item", item, item_name: item, price: 10, ...extra })
const menu = (name) => ({ item_type: "Menu", menu: name, menu_name: name, price: 29 })

describe("the colour of a card button", () => {
	it("reads the item's colour as a hex colour, and nothing else", () => {
		expect(cardColor("#4a6b8f")).toBe("#4A6B8F")
		expect(cardColor("#abc")).toBe("#AABBCC")
		expect(cardColor("4A6B8F")).toBe("#4A6B8F")
		for (const none of ["", null, undefined, "red", "#12345", "rgb(1, 2, 3)"]) expect(cardColor(none)).toBeNull()
	})

	it("paints a colour of the design system on its ramp's soft tint, as the waiter mockup pairs them", () => {
		// The mockup's six types: cold, hot, wines, starters, mains, desserts. Mains and desserts share the clay ramp:
		// the darker clay of the desserts takes the deeper tint, so the two stay apart
		for (const [color, tint] of [
			["#4A6B8F", "#EEF2F6"],
			["#BC7D0B", "#FCF2DD"],
			["#9C2920", "#FBEBE7"],
			["#178347", "#E9F7EE"],
			["#C2723F", "#FAEFE6"],
			["#A15A2E", "#F3DECC"],
		]) {
			expect(softTint(color), color).toBe(tint)
			expect(softTint(color.toLowerCase()), color).toBe(tint)
		}
	})

	it("softens any other colour into a light tint of its hue, for the button's background", () => {
		const lightness = (hex) => {
			const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
			return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
		}
		// A purple no ramp of the design system holds: its hue, at the lightness of the « 50 » tints
		const purple = softTint("#7A3E9D")
		expect(lightness(purple)).toBeCloseTo(0.94, 1)
		const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(purple.slice(at, at + 2), 16))
		expect(b).toBeGreaterThan(g)
		expect(r).toBeGreaterThan(g)
		// No hue: a light grey
		expect(softTint("#000000")).toBe("#F0F0F0")
	})
})

describe("the chips of a card", () => {
	const entries = [
		dish("Bread"),
		category("Cold"),
		dish("Water", { custom_color: "#4A6B8F" }),
		dish("Iced tea"),
		category("Wines"),
		dish("Chasselas", { custom_color: "#9C2920" }),
		dish("Pinot", { custom_color: "#9C2920" }),
		dish("Rosé", { custom_color: "#4A6B8F" }),
		category("Nothing yet"),
		category("Mains"),
		menu("Menu of the day"),
		dish("Steak", { custom_color: "#C2723F" }),
	]

	it("are the card's categories in their order, an empty one left out", () => {
		const { chips } = cardSections(entries)

		expect(chips.map((chip) => chip.label)).toEqual(["Cold", "Wines", "Mains"])
	})

	it("take the colour most of their items carry", () => {
		const { chips } = cardSections(entries)

		expect(chips.map((chip) => chip.color)).toEqual(["#4A6B8F", "#9C2920", "#C2723F"])
	})

	it("give an item without a colour its category's colour, and leave the others as they are", () => {
		const { buttons } = cardSections(entries)
		const colourOf = (name) => buttons.find((button) => (button.entry.item_name || button.entry.menu_name) === name).color

		expect(colourOf("Iced tea")).toBe("#4A6B8F")
		expect(colourOf("Rosé")).toBe("#4A6B8F")
		expect(colourOf("Menu of the day")).toBe("#C2723F")
		// Before the first category: no type, no colour of its own
		expect(colourOf("Bread")).toBeNull()
	})

	it("keep every dish and menu of the card in its order, each under its chip", () => {
		const { buttons, chips } = cardSections(entries)

		expect(buttons.map((button) => button.entry.item_name || button.entry.menu_name)).toEqual([
			"Bread",
			"Water",
			"Iced tea",
			"Chasselas",
			"Pinot",
			"Rosé",
			"Menu of the day",
			"Steak",
		])
		expect(buttons[0].chip).toBeNull()
		expect(buttons.filter((button) => button.chip === chips[1].key).map((button) => button.entry.item)).toEqual([
			"Chasselas",
			"Pinot",
			"Rosé",
		])
	})

	it("are the items' item groups when the card has no category", () => {
		const { chips, buttons } = cardSections([
			dish("Water", { item_group: "Drinks", custom_color: "#4A6B8F" }),
			dish("Coffee", { item_group: "Drinks" }),
			dish("Steak", { item_group: "Meat", custom_color: "#9C2920" }),
			menu("Menu of the day"),
		])

		expect(chips.map((chip) => [chip.label, chip.color])).toEqual([
			["Drinks", "#4A6B8F"],
			["Meat", "#9C2920"],
		])
		expect(buttons.map((button) => button.color)).toEqual(["#4A6B8F", "#4A6B8F", "#9C2920", null])
	})

	it("are neutral when no item of the type has a colour", () => {
		const { chips, buttons } = cardSections([category("Desserts"), dish("Sorbet")])

		expect(chips[0].color).toBeNull()
		expect(buttons[0].color).toBeNull()
	})
})

describe("what the order already holds", () => {
	const lines = [
		{ item_code: "WATER", quantity: 2 },
		{ item_code: "WATER", quantity: 1, posa_special_instructions: "no ice" },
		{ item_code: "STEAK", quantity: 1 },
		{ item_code: "STEAK", quantity: 1, is_free_item: 1 },
	]

	it("counts each item's quantity, its lines added up, a gift row left out", () => {
		const ordered = orderedByItem(lines)

		expect(ordered.get("WATER")).toBe(3)
		expect(ordered.get("STEAK")).toBe(1)
		expect(ordered.get("BREAD")).toBeUndefined()
	})

	it("counts the articles of the order", () => {
		expect(articleCount(lines)).toBe(4)
		expect(articleCount([])).toBe(0)
	})

	it("writes a count without needless decimals", () => {
		expect(formatCount(2)).toBe("2")
		expect(formatCount(1.5)).toBe("1.5")
		expect(formatCount(0.333333)).toBe("0.333")
	})
})

describe("the options of a dish", () => {
	const cooking = {
		group_name: "Cooking",
		required: 1,
		selection_type: "Single",
		options: [{ option_name: "Rare" }, { option_name: "Medium" }],
	}
	const side = { group_name: "Side", required: 0, selection_type: "Single", options: [{ option_name: "Fries" }] }
	const sauce = {
		group_name: "Sauce",
		required: 0,
		selection_type: "Multiple",
		options: [
			{ option_name: "Pepper", price_adjustment: 2 },
			{ option_name: "Morels", price_adjustment: 6 },
			{ option_name: "None", price_adjustment: -1.5 },
		],
	}
	const glass = {
		group_name: "Glass",
		required: 1,
		selection_type: "Single",
		options: [
			{ option_name: "1 dl", quantity_value: 1 },
			{ option_name: "3 dl", quantity_value: 3 },
		],
	}

	it("says whether a group is required, one to choose, or optional", () => {
		expect(groupRule(cooking)).toBe("required")
		expect(groupRule(side)).toBe("single")
		expect(groupRule(sauce)).toBe("optional")
	})

	it("prices a portion with its options, then the portions", () => {
		const choice = pricedChoice(42, [cooking, sauce], { Cooking: ["Rare"], Sauce: ["Pepper", "Morels"] }, 2)

		expect(choice.adjustment).toBe(8)
		expect(choice.unit).toBe(50)
		expect(choice.quantity).toBe(2)
		expect(choice.total).toBe(100)
		expect(choice.modifiers).toEqual([
			{ group: "Cooking", options: [{ name: "Rare", price_adjustment: 0 }] },
			{
				group: "Sauce",
				options: [
					{ name: "Pepper", price_adjustment: 2 },
					{ name: "Morels", price_adjustment: 6 },
				],
			},
		])
	})

	it("takes an option that lowers the price", () => {
		expect(pricedChoice(42, [sauce], { Sauce: ["None"] }, 1).total).toBe(40.5)
	})

	it("never prices a portion below zero, as the cart never does", () => {
		const choice = pricedChoice(1, [sauce], { Sauce: ["None"] }, 2)

		expect(choice.unit).toBe(0)
		expect(choice.total).toBe(0)
	})

	it("counts an option that sets the quantity once per portion", () => {
		const choice = pricedChoice(3.2, [glass], { Glass: ["3 dl"] }, 2)

		expect(choice.quantityValue).toBe(3)
		expect(choice.quantity).toBe(6)
		expect(choice.total).toBeCloseTo(19.2, 5)
		expect(choice.modifiers[0].options[0]).toEqual({ name: "3 dl", price_adjustment: 0, quantity_value: 3 })
	})

	it("leaves out a group nothing was chosen in", () => {
		expect(pricedChoice(42, [cooking, side], { Cooking: ["Medium"], Side: [] }, 1).modifiers).toEqual([
			{ group: "Cooking", options: [{ name: "Medium", price_adjustment: 0 }] },
		])
	})
})

describe("the line a card item makes in the order", () => {
	it("carries what the card grid's tap gives a line: code, name, group, price, picture, colour, station", () => {
		const line = cardItemLine(
			{
				item_type: "Item",
				item: "STEAK",
				item_name: "Steak",
				item_group: "Meat",
				price: 0,
				default_price: 36,
				image: "/files/steak.jpg",
				custom_color: "#9C2920",
			},
			(code, group) => (code === "STEAK" && group === "Meat" ? { station: "Kitchen" } : null),
		)

		expect(line).toEqual({
			item_code: "STEAK",
			item_name: "Steak",
			item_group: "Meat",
			rate: 36,
			image: "/files/steak.jpg",
			custom_color: "#9C2920",
			preparation_station: "Kitchen",
			// The units the card grid's touch gives every line (task 22): none known here, so the factor of one stock unit
			conversion_factor: 1,
			item_uoms: [],
		})
	})

	it("has no station when the item goes to none, and falls back to the card's label", () => {
		const line = cardItemLine({ item_type: "Item", item: "X", label: "Label", price: 5 }, () => null)

		expect(line.item_name).toBe("Label")
		expect(line).not.toHaveProperty("preparation_station")
	})
})

describe("the phone's order screen", () => {
	const open = {
		width: 390,
		hasOpenShift: true,
		restaurant: true,
		cards: 2,
		table: { name: "TABLE-5" },
		takeaway: false,
		tab: "items",
		qrShown: false,
	}

	it("shows below 768 px, on the order tab of an open table or takeaway order of a restaurant till with cards", () => {
		expect(PHONE_MAX_WIDTH).toBe(768)
		expect(phoneOrderShown(open)).toBe(true)
		expect(phoneOrderShown({ ...open, width: 360 })).toBe(true)
		expect(phoneOrderShown({ ...open, table: null, takeaway: true })).toBe(true)
	})

	it("leaves the till as it is on a tablet or a computer, on the cart tab, on the floor, and without a card", () => {
		for (const [why, change] of [
			["a tablet", { width: 768 }],
			["a computer", { width: 1366 }],
			["the cart tab", { tab: "cart" }],
			["the floor", { table: null, takeaway: false }],
			["no card", { cards: 0 }],
			["a shop till", { restaurant: false }],
			["no open shift", { hasOpenShift: false }],
		]) {
			expect(phoneOrderShown({ ...open, ...change }), why).toBe(false)
		}
	})

	it("steps aside while the table's QR code shows", () => {
		expect(phoneOrderShown({ ...open, qrShown: true })).toBe(false)
	})
})

describe("the colour of a button of an item group", () => {
	const category_ = (label) => ({ item_type: "Category", label })

	it("is the colour of its item group when the item has none of its own", () => {
		const { buttons } = cardSections([category_("Drinks"), dish("Water", { service_color: "#5B9BD5" })])

		expect(buttons[0].color).toBe("#5B9BD5")
	})

	it("is the item's own colour before its group's", () => {
		const { buttons } = cardSections([category_("Drinks"), dish("Cola", { custom_color: "#EF4444", service_color: "#5B9BD5" })])

		expect(buttons[0].color).toBe("#EF4444")
	})

	it("is the colour of the chip, taken from the groups of its dishes", () => {
		const { chips } = cardSections([category_("Drinks"), dish("Water", { service_color: "#5B9BD5" }), dish("Cola", { service_color: "#5B9BD5" })])

		expect(chips[0].color).toBe("#5B9BD5")
	})

	it("is none when the till asks for no family colours", () => {
		const { buttons, chips } = cardSections([category_("Drinks"), dish("Water", { service_color: "#5B9BD5" })], { familyColours: false })

		expect(buttons[0].color).toBeNull()
		expect(chips[0].color).toBeNull()
	})

	it("keeps the item's own colour when the till asks for no family colours", () => {
		const { buttons } = cardSections([category_("Drinks"), dish("Cola", { custom_color: "#EF4444", service_color: "#5B9BD5" })], { familyColours: false })

		expect(buttons[0].color).toBe("#EF4444")
	})

	it("is none for a colour that is no colour", () => {
		const { buttons } = cardSections([category_("Drinks"), dish("Water", { service_color: "blue" })])

		expect(buttons[0].color).toBeNull()
	})
})

