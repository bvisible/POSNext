/**
 * //// Neoffice — added file (no upstream equivalent). On a phone, a sold-out dish the kitchen counts by portions stays touchable where the
 * //// restaurant greys sold-out dishes out: the touch asks for more portions, as the card grid's « + » does on a tablet (NeoResto lot 1,
 * //// Daniel, 02.11.2026: « la cuisine dit tu peux encore en faire 2, 3, 5 »). A dish counted by its stock stays disabled, and where the
 * //// restaurant does not grey out, nothing changes.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, reactive } from "vue"

const state = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => state.cart }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => state.restaurant }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))
vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => state.settings }))

const { default: PhoneOrderScreen } = await import("../PhoneOrderScreen.vue")

const SOUP = { item_type: "Item", item: "SOUP", item_name: "Soup of the day", price: 9.5 }
const PERCH = { item_type: "Item", item: "PERCH", item_name: "Perch fillets", price: 38, is_stock_item: 1 }
const CARD = { name: "CARD-LUNCH", card_name: "Lunch", items: [SOUP, PERCH] }

let wrapper

function screen(props = {}) {
	wrapper = mount(PhoneOrderScreen, {
		props: {
			cards: [CARD],
			selectedCard: "CARD-LUNCH",
			// Both are sold out; the soup is counted by portions, the perch by its stock
			stockOf: () => 0,
			countedBy: (entry) => entry.item === "SOUP",
			...props,
		},
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	return wrapper
}

async function fingerClick(found) {
	found.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
	await nextTick()
}

const button = (name) =>
	wrapper.findAll("[data-card-button]").find((found) => found.find("[data-button-name]").text() === name)

beforeEach(() => {
	state.cart = reactive({
		invoiceItems: [],
		roundedGrandTotal: 0,
		restaurantTable: { name: "TABLE-5", table_name: "Table 5" },
		isTakeaway: false,
	})
	state.restaurant = reactive({
		activeMenus: [],
		restaurantSettings: {},
		getModifiersForItem: () => [],
		shownCards: [CARD],
	})
	state.settings = reactive({ settings: {} })
})

afterEach(() => {
	wrapper?.unmount()
})

describe("a sold-out dish on the phone", () => {
	it("counted by portions can be touched, and the touch asks for more portions", async () => {
		screen()
		const soup = button("Soup of the day")

		expect(soup.attributes("disabled")).toBeUndefined()
		expect(soup.find("[data-sold-out]").text()).toBe("Add portions")

		await fingerClick(soup)

		expect(wrapper.emitted("pick")).toHaveLength(1)
		expect(wrapper.emitted("pick")[0][0].item).toBe("SOUP")
	})

	it("counted by its stock stays disabled and says « Sold out »", async () => {
		screen()
		const perch = button("Perch fillets")

		expect(perch.attributes("disabled")).toBeDefined()
		expect(perch.find("[data-sold-out]").text()).toBe("Sold out")

		await fingerClick(perch)

		expect(wrapper.emitted("pick")).toBeUndefined()
	})

	it("is not marked sold out where the restaurant does not grey out", async () => {
		screen({ greyOut: false })
		const soup = button("Soup of the day")

		expect(soup.find("[data-sold-out]").exists()).toBe(false)

		await fingerClick(soup)

		expect(wrapper.emitted("pick")).toHaveLength(1)
	})

	it("with portions left is an ordinary button", async () => {
		screen({ stockOf: () => 3 })

		expect(button("Soup of the day").find("[data-sold-out]").exists()).toBe(false)
	})
})
