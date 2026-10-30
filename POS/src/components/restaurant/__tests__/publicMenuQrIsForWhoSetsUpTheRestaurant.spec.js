/**
 * //// Neoffice — added file (no upstream equivalent). « Print the menu QR » (NeoRestau lot 1, task 17) is an entry of the
 * //// floor plan's « ⋯ » menu: it is there only where the restaurant switched its public menu on, and only for whoever the
 * //// server lets set the restaurant up (`restaurantStore.can.manage_settings`). Pressed, it prints the sheet with the QR
 * //// code of the address of the menu: https://<site>/pos/menu/<restaurant>.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const printMenuQr = vi.hoisted(() => vi.fn(async () => {}))
const showError = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

// The store of the till, reactive as it is, so that a setting that changes shows
vi.mock("@/stores/restaurant", async () => {
	const { reactive } = await import("vue")
	const restaurantStore = reactive({})
	return { restaurantStore, useRestaurantStore: () => restaurantStore }
})
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showError }) }))
vi.mock("@/utils/menuQrSheet", () => ({ printMenuQr }))

const { restaurantStore } = await import("@/stores/restaurant")
const { default: PublicMenuQr } = await import("../PublicMenuQr.vue")

// The store as the till has it once the server has told what the user may manage and what the restaurant set
function theStore({ can, enabled, restaurant = "The Bistro", label = "The Bistro" } = {}) {
	for (const key of Object.keys(restaurantStore)) delete restaurantStore[key]
	Object.assign(restaurantStore, {
		can,
		restaurantSettings: { restaurant, enable_public_menu: enabled },
		tillRestaurant: restaurant || undefined,
		restaurantName: label,
	})
}

describe("« Print the menu QR »", () => {
	let wrapper

	function entry(store) {
		theStore(store)
		wrapper = mount(PublicMenuQr, { global: { mocks: { __: globalThis.__ } } })
		return wrapper
	}

	beforeEach(() => {
		printMenuQr.mockClear()
		showError.mockClear()
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	describe("who sees it", () => {
		it("is shown to whoever may set the restaurant up, where the public menu is on", () => {
			entry({ can: { manage_settings: true }, enabled: true })

			const button = wrapper.find("button")
			expect(button.exists()).toBe(true)
			expect(button.text()).toBe("Print the menu QR")
		})

		it("is not shown where the restaurant did not switch its public menu on", () => {
			entry({ can: { manage_settings: true }, enabled: false })

			expect(wrapper.find("button").exists()).toBe(false)
		})

		it("is not shown to a user who may not set the restaurant up, whatever else he may do", () => {
			entry({ can: { manage_settings: false, manage_floor: true, manage_cards: true, view_tips: true }, enabled: true })

			expect(wrapper.find("button").exists()).toBe(false)
		})

		it("is not shown until the server has said what the user may do", () => {
			entry({ can: undefined, enabled: true })

			expect(wrapper.find("button").exists()).toBe(false)
		})

		it("is not shown for a right that is granted in other words than true", () => {
			for (const granted of [1, "true", {}, null]) {
				wrapper?.unmount()
				entry({ can: { manage_settings: granted }, enabled: true })

				expect(wrapper.find("button").exists()).toBe(false)
			}
		})

		it("is not shown until the settings say the public menu is on, in so many words", () => {
			for (const enabled of [undefined, 1, "1", null]) {
				wrapper?.unmount()
				entry({ can: { manage_settings: true }, enabled })

				expect(wrapper.find("button").exists()).toBe(false)
			}
		})

		it("is not shown when there is no restaurant to name", () => {
			entry({ can: { manage_settings: true }, enabled: true, restaurant: "" })

			expect(wrapper.find("button").exists()).toBe(false)
		})

		it("follows the settings: it appears when the option is switched on, and goes when it is switched off", async () => {
			entry({ can: { manage_settings: true }, enabled: false })
			expect(wrapper.find("button").exists()).toBe(false)

			restaurantStore.restaurantSettings.enable_public_menu = true
			await nextTick()
			expect(wrapper.find("button").exists()).toBe(true)

			restaurantStore.restaurantSettings.enable_public_menu = false
			await nextTick()
			expect(wrapper.find("button").exists()).toBe(false)
		})

		it("follows the rights: it goes when the user's rights are loaded again without the right", async () => {
			entry({ can: { manage_settings: true }, enabled: true })
			expect(wrapper.find("button").exists()).toBe(true)

			restaurantStore.can = { manage_settings: false }
			await nextTick()
			expect(wrapper.find("button").exists()).toBe(false)
		})
	})

	describe("what it prints", () => {
		it("prints the sheet of the address of the restaurant's public menu, under the restaurant's name", async () => {
			entry({ can: { manage_settings: true }, enabled: true, label: "The Bistro" })

			await wrapper.find("button").trigger("click")
			await flushPromises()

			expect(printMenuQr).toHaveBeenCalledTimes(1)
			expect(printMenuQr).toHaveBeenCalledWith({
				restaurantName: "The Bistro",
				url: `${window.location.origin}/pos/menu/The%20Bistro`,
			})
		})

		it("writes the address of a restaurant with spaces, accents and signs as a visitor's browser will read it", async () => {
			entry({ can: { manage_settings: true }, enabled: true, restaurant: "Café & Bar / Grill", label: "Café & Bar" })

			await wrapper.find("button").trigger("click")
			await flushPromises()

			const { url, restaurantName } = printMenuQr.mock.calls[0][0]
			expect(url).toBe(`${window.location.origin}/pos/menu/Caf%C3%A9%20%26%20Bar%20%2F%20Grill`)
			expect(decodeURIComponent(new URL(url).pathname.replace("/pos/menu/", ""))).toBe("Café & Bar / Grill")
			expect(restaurantName).toBe("Café & Bar")
		})

		it("falls back on the restaurant's name when the till has no label for it", async () => {
			entry({ can: { manage_settings: true }, enabled: true, label: "" })

			await wrapper.find("button").trigger("click")
			await flushPromises()

			expect(printMenuQr.mock.calls[0][0].restaurantName).toBe("The Bistro")
		})

		it("says so when the sheet cannot be printed, and can be pressed again", async () => {
			printMenuQr.mockRejectedValueOnce(new Error("blocked"))
			entry({ can: { manage_settings: true }, enabled: true })

			await wrapper.find("button").trigger("click")
			await flushPromises()

			expect(showError).toHaveBeenCalledWith("The menu QR could not be printed.")
			expect(wrapper.find("button").attributes("disabled")).toBeUndefined()
		})

		it("cannot be pressed twice while the sheet is being made", async () => {
			let done
			printMenuQr.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						done = resolve
					}),
			)
			entry({ can: { manage_settings: true }, enabled: true })

			await wrapper.find("button").trigger("click")
			expect(wrapper.find("button").attributes("disabled")).toBeDefined()

			done()
			await flushPromises()
			expect(wrapper.find("button").attributes("disabled")).toBeUndefined()
		})
	})
})
