/**
 * //// Neoffice — added file (no upstream equivalent). The item panel of the card editor shows the colour the dish takes from its family and lets one change it for this item only
 * //// (NeoResto lot 1, product owner, 03.11.2026: « reprendre celle de la catégorie quand on en a mis une, mais qu'on puisse la modifier par article »): the family's colour is the first
 * //// swatch, chosen while the item has none of its own; a swatch of the palette is the item's own colour; the family's swatch gives the family's colour back.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ can: { edit_items: true, manage_cards: true, manage_options: true, edit_prices: true } }))

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		Array.isArray(args) ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/composables/useBadges", () => ({
	useBadges: () => ({ loadMenuBadges: vi.fn(async () => {}), getBadgesByType: () => [], getBadgeIconUrl: () => "" }),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))

const { default: ItemEditPanel } = await import("../ItemEditPanel.vue")

const BASE = {
	item_code: "Soup",
	description: "",
	image: "",
	custom_color: "",
	item_group: "Starters",
	service_color: "#6BAF6B",
	price_list_rate: 10,
	standard_rate: 10,
	badges: [],
	spice_level: 0,
	linked_option_groups: [],
	all_option_groups: [],
	is_stock_item: 0,
	stock: [],
}

async function panel(data = {}) {
	call.mockReset()
	call.mockImplementation(async (method) =>
		method === "pos_next.api.restaurant.get_item_edit_data" ? { ...BASE, ...data } : { status: "ok" },
	)
	const wrapper = mount(ItemEditPanel, {
		props: { itemCode: "Soup", itemName: "Soup", localPrice: 10, cardName: "Lunch" },
		global: { stubs: { ImageSearchDialog: true, ItemSaveConfirmDialog: true, ItemPortionsSection: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

const familySwatch = (wrapper) => wrapper.find("[data-family-color]")
const chosen = (swatch) => swatch.classes().includes("ring-2")

describe("the colour of a dish in the item panel", () => {
	it("starts with the colour of its family, chosen, while the dish has none of its own", async () => {
		const wrapper = await panel()

		expect(familySwatch(wrapper).exists()).toBe(true)
		expect(familySwatch(wrapper).attributes("style")).toContain("background-color: rgb(107, 175, 107)")
		expect(chosen(familySwatch(wrapper))).toBe(true)
		expect(familySwatch(wrapper).attributes("title")).toBe("Colour of the family Starters")
	})

	it("says where the colour comes from", async () => {
		const wrapper = await panel()

		expect(wrapper.get("[data-family-color-hint]").text()).toBe(
			"By default, the colour of the family Starters. Choose another one for this item only.",
		)
	})

	it("takes a colour of its own when one of the palette is touched", async () => {
		const wrapper = await panel()
		const palette = wrapper.findAll("button[type='button']").filter((b) => b.attributes("title") === "Red")

		await palette[0].trigger("click")

		expect(chosen(familySwatch(wrapper))).toBe(false)
		expect(wrapper.get("[data-family-color-hint]").text()).toBe("This item has its own colour. The family Starters has another.")
	})

	it("gives the family's colour back when its swatch is touched", async () => {
		const wrapper = await panel({ custom_color: "#EF4444" })

		expect(chosen(familySwatch(wrapper))).toBe(false)
		await familySwatch(wrapper).trigger("click")

		expect(chosen(familySwatch(wrapper))).toBe(true)
	})

	it("gives it back with the cross too, which then says so", async () => {
		const wrapper = await panel({ custom_color: "#EF4444" })
		const cross = wrapper.findAll("button").find((b) => b.attributes("title") === "Back to the colour of the family Starters")

		await cross.trigger("click")

		expect(chosen(familySwatch(wrapper))).toBe(true)
	})

	it("offers no family swatch to a dish whose family has no colour", async () => {
		const wrapper = await panel({ service_color: "" })

		expect(familySwatch(wrapper).exists()).toBe(false)
		expect(wrapper.find("[data-family-color-hint]").exists()).toBe(false)
	})
})
