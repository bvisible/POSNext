/**
 * //// Neoffice — added file (no upstream equivalent). Creating an item from the card editor takes the ERP's right to
 * //// create items (NeoRestau lot 1, task 3; `restaurant_can.create_items`): a card manager without it is offered
 * //// neither "Create new item" nor, after a search that found nothing, "Create '<what was searched>'", whose dialog
 * //// the server would refuse him.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

const restaurantStore = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ call: null }))

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace("{0}", args[0]) : s)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	// The dialogs show what they hold: the item search's body and its actions
	Dialog: { template: "<div><slot name='body-content' /><slot name='actions' /></div>" },
	Input: { template: "<input />" },
}))
// Every search finds nothing
vi.mock("@/utils/apiWrapper", () => {
	api.call = vi.fn(async () => [])
	return { call: api.call }
})
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))

const { default: CardEditor } = await import("../CardEditor.vue")

async function cardEditor(can) {
	Object.assign(restaurantStore, {
		can,
		tillRestaurant: "The Bistro",
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
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

// The item search, typed in and left to run (it waits 300 ms after the last key), finds nothing
async function searchedInVain(can, query) {
	const wrapper = await cardEditor(can)
	await wrapper.find("input[placeholder='Search items by name...']").setValue(query)
	await new Promise((resolve) => setTimeout(resolve, 350))
	await flushPromises()
	expect(api.call).toHaveBeenCalledWith("frappe.client.get_list", expect.objectContaining({ doctype: "Item" }))
	expect(wrapper.text()).toContain(`No items found for '${query}'`)
	return wrapper
}

const offers = (wrapper, label) => wrapper.findAll("button").some((button) => button.text() === label)

describe("the card editor offers to create an item to whoever may create one", () => {
	it("offers it with the ERP's right to create items", async () => {
		expect(offers(await cardEditor({ manage_cards: true, create_items: true }), "Create new item")).toBe(true)
	})

	it("does not offer it to a card manager without that right", async () => {
		expect(offers(await cardEditor({ manage_cards: true, create_items: false }), "Create new item")).toBe(false)
	})

	it("does not offer it while the server has not said", async () => {
		expect(offers(await cardEditor(undefined), "Create new item")).toBe(false)
	})
})

describe("a search that found nothing offers to create what was searched to whoever may create items", () => {
	it("offers it with the ERP's right to create items", async () => {
		const wrapper = await searchedInVain({ manage_cards: true, create_items: true }, "Tiramisu")
		expect(offers(wrapper, "Create 'Tiramisu'")).toBe(true)
	})

	it("does not offer it to a card manager without that right", async () => {
		const wrapper = await searchedInVain({ manage_cards: true, create_items: false }, "Tiramisu")
		expect(offers(wrapper, "Create 'Tiramisu'")).toBe(false)
	})

	it("does not offer it while the server has not said", async () => {
		const wrapper = await searchedInVain(undefined, "Tiramisu")
		expect(offers(wrapper, "Create 'Tiramisu'")).toBe(false)
	})
})
