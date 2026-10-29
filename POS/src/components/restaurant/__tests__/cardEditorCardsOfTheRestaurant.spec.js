/**
 * //// Neoffice — added file (no upstream equivalent). The card editor lists the cards of the till's restaurant, by
 * //// the server's rule, and makes the card of the permanent items through the server (NeoRestau lot 1, task 2): a
 * //// card is named by its card name, unique on the whole site, so a second restaurant cannot take the name the
 * //// first one has, and the server picks a free one.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
	Input: { template: "<input />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		tillRestaurant: "The Bistro",
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
	}),
}))

const { default: CardEditor } = await import("../CardEditor.vue")

const CARDS = "pos_next.api.restaurant.get_restaurant_cards"
const PERMANENT = "pos_next.api.restaurant.get_or_create_permanent_card"
const LUNCH = { name: "Lunch", card_name: "Lunch", is_active: 1, is_permanent: 0 }

async function cardEditor(cards, permanentAnswer) {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method === CARDS) return cards
		if (method === PERMANENT) return permanentAnswer
		return null
	})
	const wrapper = mount(CardEditor, {
		props: { modelValue: true },
		global: {
			stubs: { CreateItemDialog: true, ItemEditPanel: true, MenuDesignerDialog: true },
			mocks: { __: globalThis.__ },
		},
	})
	await flushPromises()
	return wrapper
}

const asked = (method) => call.mock.calls.filter(([name]) => name === method).map(([, params]) => params)

describe("the card editor works for one restaurant", () => {
	beforeEach(() => {
		toast.showSuccess.mockReset()
		toast.showError.mockReset()
	})

	it("lists the cards the server answers for the till's restaurant", async () => {
		const wrapper = await cardEditor([LUNCH])

		expect(asked(CARDS)[0]).toEqual({ restaurant: "The Bistro" })
		expect(call.mock.calls.some(([name]) => name === "frappe.client.get_list")).toBe(false)
		expect(wrapper.text()).toContain("Lunch")
	})

	it("makes the permanent card through the server, which picks a free name, and opens it", async () => {
		const wrapper = await cardEditor([LUNCH], { name: "Permanent items - The Bistro", created: true })

		const entry = wrapper.findAll("div").find((el) => el.text() === "Permanent items")
		await entry.trigger("click")
		await flushPromises()

		expect(asked(PERMANENT)).toEqual([{ restaurant: "The Bistro" }])
		expect(call.mock.calls.some(([name]) => name === "frappe.client.insert")).toBe(false)
		expect(toast.showSuccess).toHaveBeenCalledWith("Permanent card created")
		expect(toast.showError).not.toHaveBeenCalled()
		// The list is read again, to hold the card that was just made
		expect(asked(CARDS)).toHaveLength(2)
	})

	it("opens the permanent card it already has without asking the server for one", async () => {
		const permanent = { name: "Permanent items - The Bistro", card_name: "Permanent items - The Bistro", is_active: 1, is_permanent: 1 }
		const wrapper = await cardEditor([LUNCH, permanent])

		const entry = wrapper.findAll("div").find((el) => el.text() === "Permanent items")
		await entry.trigger("click")
		await flushPromises()

		expect(asked(PERMANENT)).toEqual([])
	})

	it("says so when the permanent card could not be made", async () => {
		call.mockReset()
		call.mockImplementation(async (method) => {
			if (method === CARDS) return [LUNCH]
			throw new Error("not permitted")
		})
		const wrapper = mount(CardEditor, {
			props: { modelValue: true },
			global: {
				stubs: { CreateItemDialog: true, ItemEditPanel: true, MenuDesignerDialog: true },
				mocks: { __: globalThis.__ },
			},
		})
		await flushPromises()

		await wrapper.findAll("div").find((el) => el.text() === "Permanent items").trigger("click")
		await flushPromises()

		expect(toast.showError).toHaveBeenCalledWith("Failed to create permanent card")
	})
})
