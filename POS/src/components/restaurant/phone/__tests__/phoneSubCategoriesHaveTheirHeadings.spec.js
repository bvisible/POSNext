/**
 * //// Neoffice — added file (no upstream equivalent). On a phone, the sub-categories of a category are told apart in its grid (NeoResto lot 1, product owner, 03.11.2026:
 * //// « une petite ligne de séparation entre les sous-familles, comme sur la caisse »): each opens with a heading, the colour of its dishes, its name and a thin rule, over its first button.
 * //// A sub-category chosen by its chip needs none, and a card with no sub-category has none.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

const state = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => state.cart }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => state.restaurant }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))
vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => state.settings }))

const { default: PhoneOrderScreen } = await import("../PhoneOrderScreen.vue")

const dish = (code, name, extra = {}) => ({ item_type: "Item", item: code, item_name: name, price: 5, ...extra })
const DRINKS = {
	name: "CARD-DRINKS",
	card_name: "Drinks",
	items: [
		{ item_type: "Category", label: "Starters" },
		dish("SOUP", "Soup"),
		{ item_type: "Category", label: "Drinks" },
		dish("WATER", "Water"),
		{ item_type: "Category", label: "Beers", is_subcategory: 1 },
		dish("LAGER", "Lager", { custom_color: "#E0980F" }),
		dish("WHEAT", "Wheat beer", { custom_color: "#E0980F" }),
		{ item_type: "Category", label: "Red wines", is_subcategory: 1 },
		dish("GAMAY", "Gamay", { custom_color: "#C1372C" }),
	],
}
const PLAIN = { name: "CARD-PLAIN", card_name: "Plain", items: [{ item_type: "Category", label: "Cold" }, dish("TEA", "Tea")] }

let wrapper
function screen(card = DRINKS) {
	wrapper = mount(PhoneOrderScreen, {
		props: { cards: [card], selectedCard: card.name, stockOf: () => null },
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const headings = () => wrapper.findAll("[data-sub-heading]")
const grid = () => wrapper.get("[data-card-grid]").element
// The grid's children in order: « heading:Beers » or « button:Lager »
const order = () =>
	[...grid().children].map((child) =>
		child.hasAttribute("data-sub-heading")
			? "heading:" + child.textContent.trim()
			: "button:" + child.querySelector("[data-button-name]").textContent.trim(),
	)

beforeEach(() => {
	state.cart = reactive({
		invoiceItems: [],
		roundedGrandTotal: 0,
		restaurantTable: { name: "TABLE-5", table_name: "Table 5" },
		isTakeaway: false,
		takeawayNumber: null,
	})
	state.restaurant = reactive({ restaurantSettings: {}, activeMenus: [], getModifiersForItem: () => [] })
	state.settings = reactive({ settings: { phone_card_pictures: 0 } })
})

afterEach(() => wrapper?.unmount())

describe("the headings of the sub-categories on a phone", () => {
	it("open each sub-category, over its first button, once the category that holds them is chosen", async () => {
		screen()

		await wrapper.findAll("[data-type-chip]")[2].trigger("click")

		expect(order()).toEqual([
			"button:Water",
			"heading:Beers",
			"button:Lager",
			"button:Wheat beer",
			"heading:Red wines",
			"button:Gamay",
		])
	})

	it("are there in « All » too, between the dishes of the whole card", () => {
		screen()

		expect(order()).toEqual([
			"button:Soup",
			"button:Water",
			"heading:Beers",
			"button:Lager",
			"button:Wheat beer",
			"heading:Red wines",
			"button:Gamay",
		])
	})

	it("carry the colour of the dishes of the sub-category as a dot", () => {
		screen()

		expect(headings()[0].find(".card-heading__dot").attributes("style")).toContain("background-color")
		expect(headings()[1].find(".card-heading__dot").exists()).toBe(true)
	})

	it("span the three columns of the grid, with no button of their own", () => {
		screen()

		expect(headings()[0].classes()).toContain("card-heading")
		expect(headings()[0].attributes("role")).toBe("heading")
		expect(wrapper.findAll("[data-card-button]")).toHaveLength(5)
	})

	it("are not drawn once a sub-category is chosen: its chip says it", async () => {
		screen()
		await wrapper.findAll("[data-type-chip]")[2].trigger("click")

		await wrapper.findAll("[data-sub-chip]")[0].trigger("click")

		expect(headings()).toHaveLength(0)
		expect(order()).toEqual(["button:Lager", "button:Wheat beer"])
	})

	it("do not exist on a card with no sub-category", () => {
		screen(PLAIN)

		expect(headings()).toHaveLength(0)
	})
})
