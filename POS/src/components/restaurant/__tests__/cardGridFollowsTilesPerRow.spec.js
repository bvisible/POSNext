/**
 * //// Neoffice — added file (no upstream equivalent). The grid of a restaurant card follows the till's « Tiles per
 * //// row » (NeoResto lot 1, task 13; product owner, 30.10.2026): « Automatic » keeps the columns by the width of
 * //// the screen exactly as they were, a number from 3 to 8 fixes them, and a dish without a picture then shows its
 * //// name once, in its well, with its price.
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

const AUTOMATIC = ["grid-cols-2", "sm:grid-cols-2", "md:grid-cols-3", "lg:grid-cols-4", "xl:grid-cols-5"]
const DISH = { item: "DISH-1", item_type: "Item", item_name: "Butter croissant", price: 3.5 }
const PICTURED = { ...DISH, item: "DISH-2", item_name: "Tart", image: "/files/tart.jpg" }
const MENU = { item_type: "Menu", menu_name: "Set menu", label: "Set menu", price: 24 }
const GROUPS = [{ category: "Pastries", items: [DISH, PICTURED, MENU] }]

let wrapper

function grid(tilesPerRow, props = {}) {
	wrapper = mount(RestaurantCardGrid, {
		props: { groups: GROUPS, tilesPerRow, formatPrice: (amount) => `CHF ${amount}`, ...props },
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper.find("[data-card-grid]")
}

afterEach(() => wrapper?.unmount())

describe("the restaurant's card grid", () => {
	it("keeps its columns by the width of the screen when automatic", () => {
		const element = grid("Automatic")

		expect(element.classes()).toEqual(expect.arrayContaining(AUTOMATIC))
		expect(element.classes()).not.toContain("tile-grid-fixed")
		expect(element.attributes("style")).toBeUndefined()
	})

	it("shows the number of tiles the till chose, from 3 to 8", () => {
		for (const count of ["3", "6", "8"]) {
			const element = grid(count)

			expect(element.attributes("style")).toContain(`grid-template-columns: repeat(${count}, minmax(0, 1fr))`)
			expect(element.classes()).toContain("tile-grid-fixed")
			for (const automatic of AUTOMATIC) expect(element.classes()).not.toContain(automatic)
			wrapper.unmount()
		}
	})

	it("reads anything out of 3 to 8 as automatic", () => {
		expect(grid("9").classes()).toEqual(expect.arrayContaining(AUTOMATIC))
		wrapper.unmount()
		expect(grid("2").attributes("style")).toBeUndefined()
	})

	it("marks a dish without a picture as text in a fixed grid, and keeps the others as they are", () => {
		grid("7")
		const [dish, pictured, menu] = wrapper.findAll("[data-card-tile]")

		expect(dish.classes()).toContain("tile--text")
		expect(dish.find("[data-well-name]").text()).toBe("Butter croissant")
		expect(pictured.classes()).not.toContain("tile--text")
		expect(menu.classes()).not.toContain("tile--text")
		for (const tile of [dish, pictured, menu]) expect(tile.find("[data-tile-price]").exists()).toBe(true)
	})

	it("adds nothing to the tiles of a picture in the automatic grid, and makes a dish without one a compact tile", () => {
		grid("Automatic")

		for (const tile of wrapper.findAll("[data-card-tile]")) {
			// A dish with no picture to show is a compact tile in every grid (product owner, 03.11.2026); the rest of the fixed grid's work stays with it
			expect(tile.classes().includes("tile--text")).toBe(!tile.find("img").exists() && !tile.text().includes("Menu"))
			expect(tile.find(".tile-name-repeat").exists()).toBe(false)
			expect(tile.find(".tile-price").exists()).toBe(false)
		}
	})

	it("hands the dish touched to the till", async () => {
		grid("6")

		await wrapper.findAll("[data-card-tile]")[0].trigger("click")

		expect(wrapper.emitted("pick")).toEqual([[DISH]])
	})

	it("shows a dish out of stock greyed", () => {
		grid("6", { stockOf: (item) => (item.item === "DISH-1" ? 0 : null) })

		const [dish, pictured] = wrapper.findAll("[data-card-tile]")
		expect(dish.classes()).toContain("cursor-not-allowed")
		//// Neoffice — a sold-out dish says « Sold out » and carries no count (neoffice-maintenance#2163: -3 and -2 beside « Sold out »)
		expect(dish.find("[data-sold-out]").exists()).toBe(true)
		expect(dish.find("[data-stock-badge]").exists()).toBe(false)
		expect(pictured.find("[data-stock-badge]").exists()).toBe(false)
	})
})
