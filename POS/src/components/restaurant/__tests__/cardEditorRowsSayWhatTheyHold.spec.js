/**
 * //// Neoffice — added file (no upstream equivalent). The list of the card editor says what each row holds without a click (NeoResto lot 1, product owner, 03.11.2026: « sans aucun clic, on ne
 * //// voit pas grand-chose »): the dish's picture (else its colour and initial), its name and its code, its family, its price (the card's, else the global one in grey), its colour as an
 * //// edge; and a heading may be a sub-category, one level under the category above it, which the save keeps.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		Array.isArray(args) ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
	Input: { template: "<input />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ tillRestaurant: "The Bistro", ofTheRestaurant: () => ({ restaurant: "The Bistro" }) }),
}))

const { default: CardEditor } = await import("../CardEditor.vue")

const ROWS = [
	{ item_type: "Category", label: "Drinks" },
	{ item_type: "Category", label: "Wines", is_subcategory: 1 },
	{ item_type: "Item", item: "RED-1", item_name: "", price: 0, disabled: 0 },
	{ item_type: "Item", item: "WHITE-1", price: 7.5, disabled: 0 },
	{ item_type: "Category", label: "Starters" },
	{ item_type: "Item", item: "SOUP-1", price: 0, disabled: 0 },
]
const EXTRA = {
	"RED-1": { item_name: "Gamay", image: "", custom_color: "", service_color: "#C1372C", item_group: "Red wines", default_price: 6.5, description: "A glass", badges: [], spice_level: 0 },
	"WHITE-1": { item_name: "Chasselas", image: "/files/white.png", custom_color: "#E0980F", service_color: "#D9B84A", item_group: "White wines", default_price: 6, badges: [], spice_level: 0 },
	"SOUP-1": { item_name: "Soup of the day", image: "", custom_color: "", service_color: "", item_group: "Starters", default_price: 9.5, badges: [], spice_level: 0 },
}

let saved

async function editor() {
	saved = null
	call.mockReset()
	call.mockImplementation(async (method, args) => {
		if (method === "pos_next.api.restaurant.get_restaurant_cards") return [{ name: "Lunch", card_name: "Lunch", is_active: 1, is_permanent: 0 }]
		if (method === "frappe.client.get" && args.doctype === "Restaurant Card") return { name: "Lunch", card_name: "Lunch", is_active: 1, items: ROWS }
		if (method === "pos_next.api.restaurant.get_card_items_extra") return EXTRA
		if (method === "pos_next.api.restaurant.get_card_items_stock") return {}
		if (method === "frappe.client.save") saved = args.doc
		return null
	})
	const wrapper = mount(CardEditor, {
		props: { modelValue: true },
		global: { stubs: { CreateItemDialog: true, ItemEditPanel: true, MenuDesignerDialog: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	await wrapper.vm.loadCardDetail("Lunch")
	await flushPromises()
	return wrapper
}

const rowOf = (wrapper, text) => wrapper.findAll("[data-card-row]").find((row) => row.text().includes(text))

describe("a row of the card editor", () => {
	beforeEach(() => {})

	it("says the name of the dish and its code, not the code alone", async () => {
		const wrapper = await editor()
		const gamay = rowOf(wrapper, "Gamay")

		expect(gamay.get("[data-row-name]").text()).toBe("Gamay")
		expect(gamay.text()).toContain("RED-1")
	})

	it("says the family of the dish", async () => {
		const wrapper = await editor()

		expect(rowOf(wrapper, "Gamay").get("[data-row-group]").text()).toBe("Red wines")
	})

	it("says the card's price, else the global price in grey", async () => {
		const wrapper = await editor()

		expect(rowOf(wrapper, "Chasselas").get("[data-row-price]").text()).toBe("7.50")
		const gamay = rowOf(wrapper, "Gamay").get("[data-row-price]")
		expect(gamay.text()).toContain("6.50")
		expect(gamay.text()).toContain("Global")
		expect(gamay.find(".text-gray-400").exists()).toBe(true)
	})

	it("shows the picture of the dish, else its initial on its colour", async () => {
		const wrapper = await editor()

		expect(rowOf(wrapper, "Chasselas").get("[data-row-image]").attributes("src")).toBe("/files/white.png")
		const gamay = rowOf(wrapper, "Gamay")
		expect(gamay.find("[data-row-image]").exists()).toBe(false)
		expect(gamay.get("[data-row-initial]").text()).toBe("G")
	})

	it("carries the colour of the dish as an edge: its own, else its family's, else none", async () => {
		const wrapper = await editor()

		expect(rowOf(wrapper, "Chasselas").attributes("style")).toContain("border-left: 4px solid rgb(224, 152, 15)")
		expect(rowOf(wrapper, "Gamay").attributes("style")).toContain("border-left: 4px solid rgb(193, 55, 44)")
		expect(rowOf(wrapper, "Soup of the day").attributes("style")).toBeUndefined()
	})
})

describe("a sub-category in the card editor", () => {
	it("is a heading one level under the category above it, with its items one level deeper", async () => {
		const wrapper = await editor()

		expect(rowOf(wrapper, "Wines").text()).toContain("Sub-category")
		expect(rowOf(wrapper, "Wines").classes()).toContain("ml-4")
		expect(rowOf(wrapper, "Gamay").classes()).toContain("ml-8")
		expect(rowOf(wrapper, "Soup of the day").classes()).toContain("ml-4")
		expect(rowOf(wrapper, "Drinks").text()).not.toContain("Sub-category")
	})

	it("is added by its own button", async () => {
		const wrapper = await editor()

		await wrapper.get("[data-add-subcategory]").trigger("click")
		wrapper.vm.newCategoryName = "Beers"
		wrapper.vm.addCategory()

		const added = wrapper.vm.cardDetail.items.at(-1)
		expect(added).toMatchObject({ item_type: "Category", label: "Beers", is_subcategory: true })
	})

	it("is kept by the save", async () => {
		const wrapper = await editor()

		await wrapper.vm.saveCard()

		const rows = saved.items
		expect(rows.find((row) => row.label === "Wines").is_subcategory).toBe(1)
		expect(rows.find((row) => row.label === "Drinks").is_subcategory).toBe(0)
		expect(rows.find((row) => row.item === "RED-1").is_subcategory).toBe(0)
	})
})
