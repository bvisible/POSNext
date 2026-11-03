/**
 * //// Neoffice — added file (no upstream equivalent). The guest's page (the QR code of a table) shows the colour of a dish's family like the till and the waiter's phone do
 * //// (NeoResto lot 1, product owner, 03.11.2026: « la même chose pour la page du client »): the server hands each dish its item group's colour, a tile has its pale face and its
 * //// top edge, a row its edge, and a dish with no picture shows its name (grid) or its first letter (list) on its colour, not six letters cut short.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

const { default: GuestMenuView } = await import("../GuestMenuView.vue")
const { useGuestOrderStore } = await import("@/stores/guestOrder")

const MENU = [
	{
		label: "Drinks",
		menu_items: [
			{ item_code: "B", item_name: "Bruschetta", price: 12, service_color: "#6BAF6B" },
			{ item_code: "V", item_name: "Red wine", price: 8, image: "/files/wine.png", service_color: "#C1372C" },
			{ item_code: "P", item_name: "Plain", price: 3, service_color: "" },
		],
	},
]

async function menu(mode) {
	setActivePinia(createPinia())
	useGuestOrderStore().menuCategories = MENU
	const wrapper = mount(GuestMenuView, { global: { mocks: { __: globalThis.__ } } })
	wrapper.vm.viewMode = mode
	await wrapper.vm.$nextTick()
	return wrapper
}

describe("the guest's menu in the list", () => {
	it("gives a dish of a colour an edge on the left", async () => {
		const wrapper = await menu("list")
		const rows = wrapper.findAll(".row--colored")

		expect(rows).toHaveLength(2)
		expect(rows[0].attributes("style")).toContain("--tile-edge: #6BAF6B")
		expect(rows[1].attributes("style")).toContain("--tile-edge: #C1372C")
	})

	it("shows the first letter of a dish with no picture on its colour, not six cut letters", async () => {
		const wrapper = await menu("list")
		const thumb = wrapper.findAll(".row--colored")[0].find(".w-10.h-10")

		expect(thumb.text()).toBe("B")
		expect(thumb.attributes("style")).toContain("--tile-soft")
	})

	it("keeps a dish's picture as its thumbnail", async () => {
		const wrapper = await menu("list")

		expect(wrapper.findAll(".row--colored")[1].find("img").attributes("src")).toBe("/files/wine.png")
	})

	it("leaves a dish with no colour as it was", async () => {
		const wrapper = await menu("list")
		const plain = wrapper.findAll(".flex.items-center.gap-3").find((row) => row.text().includes("Plain"))

		expect(plain.classes()).not.toContain("row--colored")
		expect(plain.attributes("style")).toBeUndefined()
	})
})

describe("the guest's menu in the grid", () => {
	it("tints the tile of a dish with a colour, with a pale face and a top edge", async () => {
		const wrapper = await menu("grid")
		const tiles = wrapper.findAll(".tile--colored")

		expect(tiles).toHaveLength(2)
		expect(tiles[0].attributes("style")).toContain("--tile-edge: #6BAF6B")
		expect(tiles[0].classes()).not.toContain("bg-white")
	})

	it("shows the name of a dish with no picture on its colour", async () => {
		const wrapper = await menu("grid")
		const well = wrapper.findAll(".tile--colored")[0].find(".aspect-square")

		expect(well.text()).toBe("Bruschetta")
		expect(well.classes()).not.toContain("bg-gray-100")
	})

	it("shows the picture of a dish that has one, inside the colour of its family", async () => {
		const wrapper = await menu("grid")
		const tile = wrapper.findAll(".tile--colored")[1]

		expect(tile.find("img").attributes("src")).toBe("/files/wine.png")
	})

	it("leaves a dish with no colour on the white tile it had", async () => {
		const wrapper = await menu("grid")
		const plain = wrapper.findAll("[class*='rounded-neo-md']").find((tile) => tile.text().includes("Plain"))

		expect(plain.classes()).toContain("bg-white")
		expect(plain.classes()).not.toContain("tile--colored")
	})
})

describe("the guest's menu with sub-categories", () => {
	const SUBS = [
		{ label: "Drinks", menu_items: [{ item_code: "C", item_name: "Cola", price: 5, service_color: "#5B9BD5" }] },
		{ label: "Beers", parent: "Drinks", menu_items: [{ item_code: "L", item_name: "Lager", price: 5, service_color: "#E0980F" }] },
		{ label: "Wines", parent: "Drinks", menu_items: [{ item_code: "G", item_name: "Gamay", price: 7, service_color: "#C1372C" }] },
		{ label: "Desserts", menu_items: [{ item_code: "T", item_name: "Tiramisu", price: 11 }] },
	]

	async function subMenu() {
		setActivePinia(createPinia())
		useGuestOrderStore().menuCategories = SUBS
		const wrapper = mount(GuestMenuView, { global: { mocks: { __: globalThis.__ } } })
		await wrapper.vm.$nextTick()
		return wrapper
	}

	const chipTexts = (wrapper) => wrapper.findAll("button").map((b) => b.text())

	it("has chips for the categories only, until one is chosen", async () => {
		const wrapper = await subMenu()

		expect(wrapper.find("[data-guest-subchips]").exists()).toBe(false)
		expect(chipTexts(wrapper)).toEqual(expect.arrayContaining(["Drinks", "Desserts"]))
		expect(chipTexts(wrapper)).not.toContain("Beers")
	})

	it("shows the sub-categories of the category chosen, with the colour of their dishes", async () => {
		const wrapper = await subMenu()
		wrapper.vm.selectedCategory = "Drinks"
		await wrapper.vm.$nextTick()
		const chips = wrapper.get("[data-guest-subchips]")

		expect(chips.text()).toContain("Beers")
		expect(chips.text()).toContain("Wines")
		expect(chips.findAll("span")[0].attributes("style")).toContain("background-color: rgb(224, 152, 15)")
	})

	it("names a sub-category with its category while no category is chosen", async () => {
		const wrapper = await subMenu()

		expect(wrapper.findAll("h3").map((h) => h.text())).toEqual(["Drinks", "Drinks · Beers", "Drinks · Wines", "Desserts"])
	})

	it("names a sub-category alone under its category, and nothing once one is chosen", async () => {
		const wrapper = await subMenu()
		wrapper.vm.selectedCategory = "Drinks"
		await wrapper.vm.$nextTick()

		expect(wrapper.findAll("h3").map((h) => h.text())).toEqual(["Beers", "Wines"])

		wrapper.vm.selectedSub = "Wines"
		await wrapper.vm.$nextTick()

		expect(wrapper.findAll("h3")).toHaveLength(0)
		expect(wrapper.text()).toContain("Gamay")
		expect(wrapper.text()).not.toContain("Lager")
	})

	it("goes back to every sub-category when another category is chosen", async () => {
		const wrapper = await subMenu()
		wrapper.vm.selectedCategory = "Drinks"
		wrapper.vm.selectedSub = "Wines"
		await wrapper.vm.$nextTick()
		wrapper.vm.selectedCategory = "Desserts"
		await wrapper.vm.$nextTick()

		expect(wrapper.vm.selectedSub).toBeNull()
	})

	it("keeps the chip of a category that has sub-categories only", async () => {
		setActivePinia(createPinia())
		useGuestOrderStore().menuCategories = SUBS.filter((c) => c.label !== "Drinks")
		const wrapper = mount(GuestMenuView, { global: { mocks: { __: globalThis.__ } } })
		await wrapper.vm.$nextTick()

		expect(chipTexts(wrapper)).toEqual(expect.arrayContaining(["Drinks", "Desserts"]))
	})
})
