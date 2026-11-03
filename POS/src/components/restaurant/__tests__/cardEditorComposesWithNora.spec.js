/**
 * //// Neoffice — added file (no upstream equivalent). The card editor offers « Compose with Nora » (Daniel, 03.11: the wizard of the
 * //// card starts from the card, in the till too). The server tells the till, in the rights of its user (`compose_card_with_nora`),
 * //// whether to show it; the till has no chat of Nora's, so the button opens the desk's list of the cards, where the wizard starts at
 * //// once (`#compose-with-nora`).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const rights = vi.hoisted(() => ({ value: {} }))

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
	useRestaurantStore: () => ({
		tillRestaurant: "The Bistro",
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		get can() {
			return rights.value
		},
	}),
}))

const { default: CardEditor } = await import("../CardEditor.vue")

async function editor(can) {
	rights.value = can
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method === "pos_next.api.restaurant.get_restaurant_cards") return [{ name: "Lunch", card_name: "Lunch", is_active: 1, is_permanent: 0 }]
		return null
	})
	const wrapper = mount(CardEditor, {
		props: { modelValue: true },
		global: { stubs: { CreateItemDialog: true, ItemEditPanel: true, MenuDesignerDialog: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

const compose = (wrapper) => wrapper.findAll("button").find((button) => button.text() === "Compose with Nora")

describe("the card editor's « Compose with Nora »", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it("is offered when the server told the till that its user may compose the card with Nora", async () => {
		const wrapper = await editor({ compose_card_with_nora: true })

		expect(compose(wrapper)).toBeTruthy()
	})

	it("is not offered otherwise: a right the server did not grant, or did not send", async () => {
		expect(compose(await editor({ compose_card_with_nora: false }))).toBeUndefined()
		expect(compose(await editor({}))).toBeUndefined()
	})

	it("opens the desk's list of the cards in a tab of its own, with the link that starts the wizard", async () => {
		const open = vi.spyOn(window, "open").mockImplementation(() => null)
		const wrapper = await editor({ compose_card_with_nora: true })

		await compose(wrapper).trigger("click")

		expect(open).toHaveBeenCalledWith("/app/restaurant-card#compose-with-nora", "_blank", "noopener")
	})
})
