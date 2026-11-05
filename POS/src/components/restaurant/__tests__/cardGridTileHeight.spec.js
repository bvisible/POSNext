/**
 * //// Neoffice — added file (no upstream equivalent). The tiles of a restaurant card have a height the till chooses (POS Settings.tile_height: Compact, Standard, Large) and a dish with
 * //// no picture says its name ONCE, in the fixed grid too (NeoResto lot 1, product owner, 05.11.2026: « il affiche deux fois le nom », « arriver à caser en hauteur plus de boutons »).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import source from "../RestaurantCardGrid.vue?raw"
import { tileHeightClass, tileHeightOf } from "@/utils/tileGrid"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/composables/useStock", () => ({
	useStock: () => ({ getStockStatus: () => ({ color: "bg-green-500", textColor: "text-white" }) }),
}))

const { default: RestaurantCardGrid } = await import("../RestaurantCardGrid.vue")

const DISH = { item: "DISH-1", item_type: "Item", item_name: "Butter croissant", price: 3.5 }
const PICTURED = { ...DISH, item: "DISH-2", item_name: "Tart", image: "/files/tart.jpg" }
const GROUPS = [{ category: "Pastries", items: [DISH, PICTURED] }]

let wrapper

function grid(props = {}) {
	wrapper = mount(RestaurantCardGrid, {
		props: { groups: GROUPS, formatPrice: (amount) => `CHF ${amount}`, ...props },
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}

afterEach(() => wrapper?.unmount())

describe("the tile height of the till", () => {
	it("reads Compact, Standard and Large, and anything else as Standard", () => {
		expect(tileHeightOf("Compact")).toBe("Compact")
		expect(tileHeightOf("Standard")).toBe("Standard")
		expect(tileHeightOf("Large")).toBe("Large")
		for (const unknown of [undefined, null, "", "compact", "Huge", 3]) expect(tileHeightOf(unknown)).toBe("Standard")
		expect(tileHeightClass("Compact")).toBe("tile-grid-h-compact")
		expect(tileHeightClass("Large")).toBe("tile-grid-h-large")
		expect(tileHeightClass("whatever")).toBe("tile-grid-h-standard")
	})

	it("puts the grid in the class of its height, Standard by default", () => {
		expect(grid().find("[data-card-grid]").classes()).toContain("tile-grid-h-standard")
		wrapper.unmount()
		for (const [height, cls] of [
			["Compact", "tile-grid-h-compact"],
			["Standard", "tile-grid-h-standard"],
			["Large", "tile-grid-h-large"],
		]) {
			expect(grid({ tileHeight: height }).find("[data-card-grid]").classes()).toContain(cls)
			wrapper.unmount()
		}
	})

	it("sizes the picture by the height's ratio, not by a square", () => {
		const tiles = grid({ tileHeight: "Compact" }).findAll("[data-card-tile]")
		const well = tiles[1].find(".tile-well-picture")

		expect(well.exists()).toBe(true)
		expect(tiles[1].html()).not.toContain("aspect-square")
	})
})

describe("a dish with no picture", () => {
	it("is a text tile whatever the grid, so that its name shows once", () => {
		for (const tilesPerRow of ["Automatic", "6"]) {
			const tiles = grid({ tilesPerRow }).findAll("[data-card-tile]")

			expect(tiles[0].classes()).toContain("tile--text")
			expect(tiles[1].classes()).not.toContain("tile--text")
			expect(tiles[0].find("[data-well-name]").text()).toBe("Butter croissant")
			wrapper.unmount()
		}
	})

	it("keeps its name clear of the stock count and of the « + » that overhang its corners", () => {
		const withStock = grid({ stockOf: () => 4 }).findAll("[data-card-tile]")[0]
		expect(withStock.classes()).toContain("tile--badge")
		wrapper.unmount()

		const noStock = grid({ stockOf: () => null }).findAll("[data-card-tile]")[0]
		expect(noStock.classes()).not.toContain("tile--badge")
		wrapper.unmount()

		const soldOut = grid({ stockOf: () => 0 }).findAll("[data-card-tile]")[0]
		expect(soldOut.classes()).not.toContain("tile--badge")
		wrapper.unmount()

		const counted = grid({ stockOf: () => null, countedBy: () => true }).findAll("[data-card-tile]")[0]
		expect(counted.classes()).toContain("tile--badge")
	})
})

describe("the style of the repeated name", () => {
	// jsdom does not run a component's scoped style: the order and the specificity of the two rules are read from the source. The fixed grid's rule for the repeated name used to come
	// AFTER the text tile's rule with the same specificity, so in a fixed grid the name showed under its well too (seen at the till of a restaurant, 05.11.2026)
	it("hides the repeated name of a text tile with a rule that no rule of the fixed grid outweighs", () => {
		const fixedRule = source.indexOf(".tile-grid-fixed .tile-name-repeat {")
		const hideRule = source.indexOf(".tile--text.tile--text .tile-name-repeat")

		expect(fixedRule).toBeGreaterThan(-1)
		expect(hideRule).toBeGreaterThan(fixedRule)
		expect(source.slice(hideRule)).toMatch(/\.tile--text\.tile--text \[data-tile-name\]\s*\{\s*display: none;/)
	})
})
