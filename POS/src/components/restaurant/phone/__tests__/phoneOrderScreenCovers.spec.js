/**
 * //// Neoffice — added file (no upstream equivalent). The people seated at the table, on the waiter's phone (NeoResto lot 1, covers): the ink header carries the pastille « 3 / 4 » (people / seats), or a dash while nobody
 * //// said, whose press asks the number (the page opens the dialog); under the header a counter says the portions per course against the people seated (« Starters 3/3 ✓ · Mains 2/3 »). The existing buttons of the header
 * //// (back to the tables, the QR code) stay, a takeaway has no table to seat people at, and nothing is drawn of the counter while the number is unset.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

const state = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) =>
		args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text
})

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => state.cart }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => state.restaurant,
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileCurrency: "CHF" }),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => state.settings,
}))

const { default: PhoneOrderScreen } = await import("../PhoneOrderScreen.vue")

const STEAK = {
	item_type: "Item",
	item: "STEAK",
	item_name: "Rib steak",
	price: 42,
}
const LUNCH = { name: "CARD-LUNCH", card_name: "Lunch", items: [STEAK] }
const line = (family, quantity) => ({
	item_code: `${family}-${quantity}`,
	item_name: family,
	service_family: family,
	quantity,
	rate: 10,
	amount: 10 * quantity,
})

let wrapper
function screen() {
	wrapper = mount(PhoneOrderScreen, {
		props: { cards: [LUNCH], selectedCard: "CARD-LUNCH" },
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const pastille = () => wrapper.find("[data-covers]")
const counter = () => wrapper.find("[data-covers-counter]")

beforeEach(() => {
	state.cart = reactive({
		invoiceItems: [],
		roundedGrandTotal: 0,
		restaurantTable: { name: "TABLE-5", table_name: "Table 5", capacity: 4 },
		restaurantCovers: null,
		isTakeaway: false,
		takeawayNumber: null,
	})
	state.restaurant = reactive({
		restaurantSettings: { enable_qr_ordering: 1 },
		activeMenus: [],
		getModifiersForItem: () => [],
	})
	state.settings = reactive({ settings: { phone_card_pictures: 0 } })
})
afterEach(() => {
	wrapper?.unmount()
})

describe("the people pastille of the phone's header", () => {
	it("shows « 3 / 4 » (people / seats) when the people are counted", () => {
		state.cart.restaurantCovers = 3
		screen()

		expect(pastille().exists()).toBe(true)
		expect(wrapper.find("[data-covers-value]").text()).toBe("3 / 4")
		expect(pastille().find("svg").exists()).toBe(true)
	})

	it("shows the people alone when the table's seats are unknown", () => {
		state.cart.restaurantCovers = 3
		state.cart.restaurantTable = { name: "TABLE-5", table_name: "Table 5" }
		screen()

		expect(wrapper.find("[data-covers-value]").text()).toBe("3")
	})

	it("shows a dash while nobody said, and its title is the verb", () => {
		screen()

		expect(wrapper.find("[data-covers-empty]").exists()).toBe(true)
		expect(wrapper.find("[data-covers-value]").exists()).toBe(false)
		expect(pastille().attributes("title")).toBe("Set people")
		expect(pastille().attributes("aria-label")).toBe("Set people")
	})

	it("says « Change the number of people » once they are counted", () => {
		state.cart.restaurantCovers = 2
		screen()

		expect(pastille().attributes("title")).toBe("Change the number of people")
	})

	it("asks the number when it is pressed", async () => {
		screen()

		await pastille().trigger("click")

		expect(wrapper.emitted("covers")).toHaveLength(1)
		expect(wrapper.emitted("back")).toBeUndefined()
		expect(wrapper.emitted("qr")).toBeUndefined()
	})

	it("is a 44 px touch target that never shrinks away", () => {
		screen()

		expect(pastille().classes()).toEqual(
			expect.arrayContaining(["min-h-[44px]", "min-w-[44px]", "shrink-0"]),
		)
	})

	it("leaves the back button and the QR button in the header, with the table's name", () => {
		screen()

		expect(wrapper.find("[data-back]").exists()).toBe(true)
		expect(wrapper.find("[data-qr]").exists()).toBe(true)
		expect(wrapper.find("[data-table-name]").text()).toBe("Table 5")
	})

	it("is not there on a takeaway: it has no table to seat people at", () => {
		state.cart.isTakeaway = true
		state.cart.takeawayNumber = "A-12"
		screen()

		expect(pastille().exists()).toBe(false)
	})

	it("takes a number that is no number of people as none", () => {
		state.cart.restaurantCovers = 0
		screen()

		expect(wrapper.find("[data-covers-empty]").exists()).toBe(true)
	})
})

describe("the counter under the phone's header", () => {
	it("says the portions per course against the people seated", () => {
		state.cart.restaurantCovers = 3
		state.cart.invoiceItems = [
			line("Starter", 3),
			line("Main", 2),
			line("Drink", 4),
		]
		screen()

		const chips = counter().findAll('[data-test="cover-chip"]')
		expect(chips.map((chip) => chip.text().replace(/\s+/g, " "))).toEqual([
			"Starters 3/3",
			"Mains 2/3",
		])
		expect(chips[0].attributes("data-state")).toBe("done")
		expect(chips[1].attributes("data-state")).toBe("short")
	})

	it("follows the cart as lines are added", async () => {
		state.cart.restaurantCovers = 3
		state.cart.invoiceItems = [line("Main", 2)]
		screen()

		state.cart.invoiceItems = [line("Main", 3)]
		await wrapper.vm.$nextTick()

		const chip = counter().get('[data-test="cover-chip"]')
		expect(chip.attributes("data-state")).toBe("done")
	})

	it("is not drawn while the number is unset", () => {
		state.cart.invoiceItems = [line("Main", 2)]
		screen()

		expect(counter().exists()).toBe(false)
	})

	it("is not drawn while no course has a line", () => {
		state.cart.restaurantCovers = 3
		state.cart.invoiceItems = [line("Drink", 3)]
		screen()

		expect(counter().exists()).toBe(false)
	})

	it("is drawn under the header, before the card's buttons", () => {
		state.cart.restaurantCovers = 3
		state.cart.invoiceItems = [line("Main", 1)]
		screen()

		const header = wrapper.get("header").element
		expect(header.contains(counter().element)).toBe(false)
		expect(header.nextElementSibling).toBe(counter().element)
	})
})
