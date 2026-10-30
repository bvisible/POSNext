/**
 * //// Neoffice — added file (no upstream equivalent). The item panel of the card editor saves what the user may
 * //// change, and only what changed (NeoRestau lot 1, task 3). The card's price and availability, the badges and the
 * //// spice level the card prints, are the restaurant's; the item sheet (description, image, colour) and the price
 * //// list are the ERP's, with its own rights. A restaurant manager without the ERP's item rights still saves the rest
 * //// of the panel: until then every save began with the item sheet, which the server now refuses him.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/composables/useBadges", () => ({
	useBadges: () => ({
		loadMenuBadges: vi.fn(async () => {}),
		getBadgesByType: (type) =>
			type === "Allergen" ? [{ name: "Gluten", badge_name: "Gluten", icon: "", color: "#d68a59" }] : [],
		getBadgeIconUrl: () => "",
	}),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))

const { default: ItemEditPanel } = await import("../ItemEditPanel.vue")

const ITEM_DATA = {
	item_code: "Pasta",
	description: "Fresh pasta",
	image: "",
	custom_color: "",
	price_list_rate: 10,
	standard_rate: 10,
	badges: [],
	spice_level: 0,
	linked_option_groups: [],
	all_option_groups: [{ name: "Sauces", group_name: "Sauces", required: 0 }],
	is_stock_item: 0,
	stock: [],
}

const RESTAURANT_MANAGER = {
	manage_cards: true,
	manage_options: true,
	edit_items: false,
	edit_prices: false,
}

async function panel(can) {
	Object.assign(restaurantStore, { can })
	call.mockReset()
	call.mockImplementation(async (method) =>
		method === "pos_next.api.restaurant.get_item_edit_data" ? ITEM_DATA : { status: "ok" },
	)
	const wrapper = mount(ItemEditPanel, {
		props: { itemCode: "Pasta", itemName: "Pasta", localPrice: 10, cardName: "Lunch" },
		global: { stubs: { ImageSearchDialog: true, ItemSaveConfirmDialog: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

const saved = () =>
	call.mock.calls
		.map(([method]) => method.split(".").pop())
		.filter((method) => method !== "get_item_edit_data")

async function save(wrapper) {
	await wrapper.findAll("button").find((button) => button.text() === "Save").trigger("click")
	await flushPromises()
}

describe("the item panel saves what the user may change", () => {
	beforeEach(() => {
		call.mockReset()
	})

	it("shows a restaurant manager without the ERP's item rights no item sheet and no price list", async () => {
		const wrapper = await panel(RESTAURANT_MANAGER)

		expect(wrapper.find("textarea").exists()).toBe(false)
		expect(wrapper.text()).not.toContain("Global Price")
		expect(wrapper.text()).not.toContain("Display Color")
		expect(wrapper.text()).toContain("Card Price")
		expect(wrapper.text()).toContain("Product Options")
	})

	it("saves his card price and badges without touching the item sheet", async () => {
		const wrapper = await panel(RESTAURANT_MANAGER)
		wrapper.vm.editData.cardPrice = 12
		await wrapper.findAll("button").find((button) => button.text() === "Gluten").trigger("click")

		await save(wrapper)

		expect(saved()).toEqual(["update_item_badges", "update_item_price"])
		const badges = call.mock.calls.find(([method]) => method.endsWith("update_item_badges"))[1]
		expect(badges).toEqual({ item_code: "Pasta", badges: JSON.stringify(["Gluten"]), spice_level: 0 })
		const price = call.mock.calls.find(([method]) => method.endsWith("update_item_price"))[1]
		expect(price).toMatchObject({ item_code: "Pasta", price: 12, scope: "local", card_name: "Lunch" })
	})

	it("saves his option groups alone, through the item details, without the sheet's fields", async () => {
		const wrapper = await panel(RESTAURANT_MANAGER)
		await wrapper.findAll("button").find((button) => button.text().startsWith("Sauces")).trigger("click")

		await save(wrapper)

		expect(saved()).toEqual(["update_item_details"])
		expect(call.mock.calls.find(([method]) => method.endsWith("update_item_details"))[1]).toEqual({
			item_code: "Pasta",
			option_groups: JSON.stringify(["Sauces"]),
		})
	})

	it("saves the item sheet for whoever may edit items in the ERP, and only what changed", async () => {
		const wrapper = await panel({ ...RESTAURANT_MANAGER, edit_items: true })
		await wrapper.find("textarea").setValue("Fresh pasta, basil")

		await save(wrapper)

		expect(saved()).toEqual(["update_item_details"])
		expect(call.mock.calls.find(([method]) => method.endsWith("update_item_details"))[1]).toEqual({
			item_code: "Pasta",
			description: "Fresh pasta, basil",
			image: "",
			color: "",
		})
	})
})
