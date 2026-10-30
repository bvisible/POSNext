/**
 * //// Neoffice — added file (no upstream equivalent). Creating an item from the card editor takes the ERP's right to
 * //// create items (NeoRestau lot 1, task 3; `restaurant_can.create_items`): a card manager without it is not offered
 * //// « Create new item », whose dialog the server would refuse him.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

const restaurantStore = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace("{0}", args[0]) : s)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	// The dialogs show what they hold: the item search's body and its actions
	Dialog: { template: "<div><slot name='body-content' /><slot name='actions' /></div>" },
	Input: { template: "<input />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => []) }))
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

const offersToCreate = (wrapper) => wrapper.findAll("button").some((button) => button.text() === "Create new item")

describe("the card editor offers to create an item to whoever may create one", () => {
	it("offers it with the ERP's right to create items", async () => {
		expect(offersToCreate(await cardEditor({ manage_cards: true, create_items: true }))).toBe(true)
	})

	it("does not offer it to a card manager without that right", async () => {
		expect(offersToCreate(await cardEditor({ manage_cards: true, create_items: false }))).toBe(false)
	})

	it("does not offer it while the server has not said", async () => {
		expect(offersToCreate(await cardEditor(undefined))).toBe(false)
	})
})
