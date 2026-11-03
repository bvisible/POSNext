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
