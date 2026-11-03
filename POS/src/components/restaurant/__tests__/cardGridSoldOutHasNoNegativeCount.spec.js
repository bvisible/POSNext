/**
 * //// Neoffice — added file (no upstream equivalent). A sold-out dish of the restaurant card shows « Sold out », and no count
 * //// below zero (neoffice-maintenance#2163, the restaurant film of 02.11.2026: « Épuisé » tiles carried -3 and -2). A site
 * //// that sells beyond its stock takes the stock below zero; the badge printed it.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"

globalThis.__ = (text) => text

const { default: RestaurantCardGrid } = await import("../RestaurantCardGrid.vue")

const DISHES = [
	{ item: "SOUP", item_name: "Soup", item_type: "Item", price: 9 },
	{ item: "CURRY", item_name: "Curry", item_type: "Item", price: 23 },
	{ item: "STEAK", item_name: "Steak", item_type: "Item", price: 39 },
	{ item: "PIE", item_name: "Pie", item_type: "Item", price: 7 },
]
const STOCK = { SOUP: 5, CURRY: -3, STEAK: 0, PIE: null }

function grid() {
	return mount(RestaurantCardGrid, {
		props: { groups: [{ category: "", items: DISHES }], stockOf: (item) => STOCK[item.item] },
		global: { mocks: { __: globalThis.__ } },
	})
}

function tile(wrapper, name) {
	return wrapper.findAll("[data-card-tile]").find((one) => one.get("[data-tile-name]").text() === name)
}

describe("the stock of a dish on the restaurant card (neoffice-maintenance#2163)", () => {
	beforeEach(() => setActivePinia(createPinia()))

	it("counts what is left while some is", () => {
		const soup = tile(grid(), "Soup")

		expect(soup.get("[data-stock-badge]").text()).toBe("5")
		expect(soup.find("[data-sold-out]").exists()).toBe(false)
	})

	it("says « Sold out » and no count once nothing is left, below zero included", () => {
		const wrapper = grid()

		for (const name of ["Curry", "Steak"]) {
			const sold = tile(wrapper, name)
			expect(sold.find("[data-sold-out]").exists(), name).toBe(true)
			expect(sold.find("[data-stock-badge]").exists(), name).toBe(false)
		}
		expect(wrapper.text()).not.toMatch(/-\d/)
	})

	it("shows no count for a dish whose stock is not counted", () => {
		const pie = tile(grid(), "Pie")

		expect(pie.find("[data-stock-badge]").exists()).toBe(false)
		expect(pie.find("[data-sold-out]").exists()).toBe(false)
	})
})
