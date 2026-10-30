/**
 * //// Neoffice — added file (no upstream equivalent). The management rail of a restaurant till shows each restaurant
 * //// entry to whoever the server lets use it (NeoRestau lot 1, task 3; `restaurant_can` of the till's settings):
 * //// the cards, the option groups and the preparation workflows to the restaurant's managers, the tips to whoever
 * //// may read them, the reservations to every user of the till. The till's own settings are its managers'
 * //// (product owner, 30.10.2026): the Settings entry shows to whoever may save them.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

const restaurantStore = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ FeatherIcon: { template: "<i />" } }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))

const { default: ManagementSlider } = await import("../ManagementSlider.vue")

const RESTAURANT_ENTRIES = ["Cards", "Product Options", "Workflows", "Tips", "Reservations"]
const NO_RIGHT = {
	manage_floor: false,
	manage_cards: false,
	manage_options: false,
	manage_workflows: false,
	manage_settings: false,
	view_tips: false,
	edit_items: false,
	edit_prices: false,
	manage_till_settings: false,
}

describe("the management rail shows the till's settings to whoever may save them", () => {
	let wrapper

	function settingsEntry(can) {
		Object.assign(restaurantStore, { can, tipsEnabled: false, isEnabled: false })
		wrapper = mount(ManagementSlider, { global: { mocks: { __: globalThis.__ } } })
		return wrapper.findAll("button").some((button) => button.attributes("title") === "Settings")
	}

	afterEach(() => {
		wrapper?.unmount()
	})

	it("shows the Settings entry to a till manager", () => {
		expect(settingsEntry({ ...NO_RIGHT, manage_till_settings: true })).toBe(true)
	})

	it("hides it from a cashier, whatever the restaurant lets him manage", () => {
		expect(settingsEntry({ ...NO_RIGHT, view_tips: true, manage_settings: true })).toBe(false)
	})

	it("hides it while the server has not said what the user may do", () => {
		expect(settingsEntry(undefined)).toBe(false)
	})
})

describe("the management rail shows what the user may manage of the restaurant", () => {
	let wrapper

	function rail({ can, tipsEnabled = true, isEnabled = true }) {
		Object.assign(restaurantStore, { can, tipsEnabled, isEnabled })
		wrapper = mount(ManagementSlider, { global: { mocks: { __: globalThis.__ } } })
		const titles = wrapper.findAll("button").map((button) => button.attributes("title"))
		return RESTAURANT_ENTRIES.filter((entry) => titles.includes(entry))
	}

	afterEach(() => {
		wrapper?.unmount()
	})

	it("shows every restaurant entry to a manager", () => {
		const can = Object.fromEntries(Object.keys(NO_RIGHT).map((right) => [right, true]))

		expect(rail({ can })).toEqual(RESTAURANT_ENTRIES)
	})

	it("shows a cashier the tips and the reservations only", () => {
		expect(rail({ can: { ...NO_RIGHT, view_tips: true } })).toEqual(["Tips", "Reservations"])
	})

	it("shows each management entry by its own right", () => {
		expect(rail({ can: { ...NO_RIGHT, manage_cards: true } })).toEqual(["Cards", "Reservations"])
		wrapper.unmount()
		expect(rail({ can: { ...NO_RIGHT, manage_options: true } })).toEqual(["Product Options", "Reservations"])
		wrapper.unmount()
		expect(rail({ can: { ...NO_RIGHT, manage_workflows: true } })).toEqual(["Workflows", "Reservations"])
	})

	it("hides the tips when the restaurant takes none, whoever may read them", () => {
		expect(rail({ can: { ...NO_RIGHT, view_tips: true }, tipsEnabled: false })).toEqual(["Reservations"])
	})

	it("shows nothing it was not told the user may manage", () => {
		expect(rail({ can: undefined })).toEqual(["Reservations"])
	})

	it("shows no restaurant entry on a till that is not a restaurant till", () => {
		expect(rail({ can: { ...NO_RIGHT, manage_cards: true, view_tips: true }, isEnabled: false })).toEqual([])
	})
})
