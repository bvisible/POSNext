/**
 * //// Neoffice — added file (no upstream equivalent). The tiles of the restaurant's card at the till take a colour (NeoResto lot 1, product owner, 03.11.2026: « par famille, pour
 * //// retrouver très vite le vin rouge, le vin blanc ») and the till may show no pictures: the colour of a dish is its item's own, else its item group's (`service_color`), a tile
 * //// of a colour has its pale face and its edge, the face replaces the white frame round a picture, and a menu has none.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/composables/useStock", () => ({
	useStock: () => ({ getStockStatus: () => ({ color: "bg-green-500", textColor: "text-white" }) }),
}))

const { default: RestaurantCardGrid } = await import("../RestaurantCardGrid.vue")

const WATER = { item: "W", item_type: "Item", item_name: "Water", price: 4, service_color: "#5B9BD5" }
const WINE = { item: "V", item_type: "Item", item_name: "Red wine", price: 8, service_color: "#C1372C", image: "/files/wine.png" }
const OWN = { item: "O", item_type: "Item", item_name: "Own colour", price: 3, service_color: "#5B9BD5", custom_color: "#EF4444" }
const PLAIN = { item: "P", item_type: "Item", item_name: "Plain", price: 3 }
const MENU = { item_type: "Menu", menu_name: "Set menu", label: "Set menu", price: 24, service_color: "#5B9BD5" }

let wrapper

function grid(props = {}, items = [WATER, WINE, OWN, PLAIN, MENU]) {
	wrapper = mount(RestaurantCardGrid, {
		props: { groups: [{ category: "Drinks", items }], formatPrice: (amount) => `CHF ${amount}`, ...props },
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper.findAll("[data-card-tile]")
}

afterEach(() => wrapper?.unmount())

describe("the tiles of the card", () => {
	it("take the colour of their item group", () => {
		const [water] = grid()

		expect(water.classes()).toContain("tile--colored")
		expect(water.attributes("style")).toContain("--tile-edge: #5B9BD5")
	})

	it("take a pale face of that colour, and a dim one for the dark screen", () => {
		const [water] = grid()

		expect(water.attributes("style")).toMatch(/--tile-soft: #[0-9A-F]{6}/i)
		expect(water.attributes("style")).toMatch(/--tile-dim: rgba\(91, 155, 213, 0\.16\)/)
	})

	it("take their item's own colour before the group's", () => {
		const [, , own] = grid()

		expect(own.attributes("style")).toContain("--tile-edge: #EF4444")
	})

	it("keep the neutral look when neither the item nor its group has a colour", () => {
		const [, , , plain] = grid()

		expect(plain.classes()).not.toContain("tile--colored")
		expect(plain.classes()).toContain("bg-white")
		expect(plain.attributes("style")).toBeUndefined()
	})

	it("leave a menu as it is", () => {
		const [, , , , menu] = grid()

		expect(menu.classes()).not.toContain("tile--colored")
	})

	it("show the pale face round a picture instead of the white frame", () => {
		const [, wine] = grid()

		expect(wine.find("img").exists()).toBe(true)
		expect(wine.classes()).toContain("tile--colored")
		expect(wine.classes()).not.toContain("bg-white")
	})

	it("keep the neutral look when the till shows no colours", () => {
		const tiles = grid({ colors: false })

		for (const tile of tiles) expect(tile.classes()).not.toContain("tile--colored")
		expect(tiles[0].classes()).toContain("bg-white")
	})
})

describe("the pictures of the till", () => {
	it("show on the tiles that have one", () => {
		const [, wine] = grid()

		expect(wine.find("img").exists()).toBe(true)
	})

	it("are left out when the till shows none: the name is the face", () => {
		const [, wine] = grid({ pictures: false })

		expect(wine.find("img").exists()).toBe(false)
		expect(wine.find("[data-well-name]").text()).toBe("Red wine")
	})

	it("do not change a tile that has no picture", () => {
		const [water] = grid({ pictures: false })

		expect(water.find("[data-well-name]").text()).toBe("Water")
		expect(water.classes()).toContain("tile--colored")
	})
})

describe("the sub-categories of the card's grid", () => {
	const GROUPS = [
		{ category: "Drinks", items: [] },
		{ category: "Drinks", subcategory: "Wines", items: [WATER] },
		{ category: "Drinks", subcategory: "Beers", items: [PLAIN] },
	]

	it("have a heading, in the colour of their dishes, and the category's heading is shown once", () => {
		grid({ groups: GROUPS })
		const headings = wrapper.findAll("[data-card-subcategory]")

		expect(headings.map((h) => h.text())).toEqual(["Wines", "Beers"])
		expect(headings[0].find("span").attributes("style")).toContain("background-color: rgb(91, 155, 213)")
		expect(headings[1].find("span").exists()).toBe(false)
		expect(wrapper.findAll("h3").map((h) => h.text())).toEqual(["Drinks"])
	})

	it("show no heading once one of them is chosen", () => {
		grid({ groups: GROUPS, showSubcategories: false })

		expect(wrapper.findAll("[data-card-subcategory]")).toHaveLength(0)
	})

	it("draw no empty grid for a category that has only sub-categories", () => {
		grid({ groups: GROUPS })

		expect(wrapper.findAll("[data-card-grid]")).toHaveLength(2)
	})
})

describe("a dish with no picture to show", () => {
	it("is a compact tile with its name once, in the automatic grid too", () => {
		const [water] = grid({ tilesPerRow: "Automatic" })

		expect(water.classes()).toContain("tile--text")
		expect(water.find("[data-well-name]").text()).toBe("Water")
		// Its name under the well is hidden by the tile's own style (a compact tile says it once): the tile carries the class that does it
		expect(water.classes()).toContain("tile--text")
		expect(water.findAll("[data-tile-name]")).toHaveLength(1)
	})

	it("is every dish when the till shows no pictures, a dish with a picture included", () => {
		const tiles = grid({ pictures: false })

		for (const tile of tiles.slice(0, 4)) expect(tile.classes()).toContain("tile--text")
	})

	it("is not a dish that has its picture shown", () => {
		const [, wine] = grid()

		expect(wine.classes()).not.toContain("tile--text")
	})
})
