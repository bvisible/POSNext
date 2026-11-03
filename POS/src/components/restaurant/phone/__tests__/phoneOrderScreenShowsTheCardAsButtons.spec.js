/**
 * //// Neoffice — added file (no upstream equivalent). On a phone, an open table's order is taken on the screen the
 * //// waiter mockup draws (NeoResto lot 1, task 27; product owner, 31.10.2026: « look at your mockup, it is well
 * //// done… the same for the card as buttons »): the card's types as coloured chips, the card as three buttons per row
 * //// in the items' colours, the count already ordered on each button, a touch for +1 and a long press for the
 * //// options, « Sold out » when the dish cannot be sold, and the order one tap away.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, reactive } from "vue"

const state = vi.hoisted(() => ({}))
const call = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => state.cart }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => state.restaurant }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))
vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => state.settings }))

const { default: PhoneOrderScreen } = await import("../PhoneOrderScreen.vue")
const { NEUTRAL_EDGE, softTint } = await import("@/utils/phoneCard")
const { LONG_PRESS_MS } = await import("@/composables/usePressGesture")

const WATER = { item_type: "Item", item: "WATER", item_name: "Water 1 l", price: 6, custom_color: "#4A6B8F" }
const ICED_TEA = { item_type: "Item", item: "ICED-TEA", item_name: "Iced tea", price: 4.8 }
const STEAK = {
	item_type: "Item",
	item: "STEAK",
	item_name: "Rib steak",
	item_group: "Meat",
	price: 42,
	custom_color: "#C2723F",
	image: "/files/steak.jpg",
}
const PERCH = { item_type: "Item", item: "PERCH", item_name: "Perch fillets", price: 38, custom_color: "#C2723F", is_stock_item: 1 }
const MENU = { item_type: "Menu", menu: "MENU-DAY", menu_name: "Menu of the day", price: 29 }
const LUNCH = {
	name: "CARD-LUNCH",
	card_name: "Lunch",
	items: [
		{ item_type: "Category", label: "Cold" },
		WATER,
		ICED_TEA,
		{ item_type: "Category", label: "Mains" },
		STEAK,
		PERCH,
		MENU,
	],
}
const BREAD = { item_type: "Item", item: "BREAD", item_name: "Bread", price: 3 }
const PERMANENT = { name: "CARD-PERMANENT", card_name: "Permanent items", is_permanent: 1, items: [BREAD] }
const COOKING = { group_name: "Cooking", required: 1, selection_type: "Single", options: [{ option_name: "Rare" }] }

let wrapper

function rgb(hex) {
	const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
	return `rgb(${r}, ${g}, ${b})`
}

function screen(props = {}) {
	wrapper = mount(PhoneOrderScreen, {
		props: {
			cards: [LUNCH],
			selectedCard: "CARD-LUNCH",
			stockOf: (entry) => (entry.item === "PERCH" ? 0 : null),
			...props,
		},
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	return wrapper
}

// The click a finger makes counts one (detail 1); a keyboard's counts none (test-utils' trigger cannot set it)
async function fingerClick(found) {
	found.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }))
	await nextTick()
}

const buttons = () => wrapper.findAll("[data-card-button]")
const button = (name) => buttons().find((found) => found.find("[data-button-name]").text() === name)
const chips = () => wrapper.findAll("[data-type-chip]")

beforeEach(() => {
	state.cart = reactive({
		invoiceItems: [],
		roundedGrandTotal: 0,
		restaurantTable: { name: "TABLE-5", table_name: "Table 5" },
		isTakeaway: false,
		takeawayNumber: null,
	})
	state.restaurant = reactive({
		restaurantSettings: { enable_qr_ordering: 1 },
		activeMenus: [{ name: "MENU-DAY", menu_name: "Menu of the day", courses: [{}, {}, {}] }],
		getModifiersForItem: (code) => (code === "STEAK" ? [COOKING] : []),
	})
	state.settings = reactive({ settings: { phone_card_pictures: 0 } })
	call.mockReset()
})

afterEach(() => {
	wrapper?.unmount()
	vi.useRealTimers()
})

describe("the types of the card", () => {
	it("are chips: « All » first, then the card's categories in their order", () => {
		screen()

		expect(chips().map((chip) => chip.text())).toEqual(["All", "Cold", "Mains"])
		expect(chips()[0].attributes("aria-pressed")).toBe("true")
	})

	it("each filter the buttons, « All » shows them all again", async () => {
		screen()

		await chips()[2].trigger("click")
		expect(buttons().map((found) => found.find("[data-button-name]").text())).toEqual([
			"Rib steak",
			"Perch fillets",
			"Menu of the day",
		])
		expect(chips()[2].attributes("aria-pressed")).toBe("true")

		await chips()[0].trigger("click")
		expect(buttons()).toHaveLength(5)
	})

	it("each carry their colour: a soft background and a bottom border", () => {
		screen()
		const cold = chips()[1].element.style

		expect(cold.borderBottomColor).toBe(rgb("#4A6B8F"))
		expect(cold.backgroundColor).toBe(rgb(softTint("#4A6B8F")))
	})

	it("are the items' item groups on a card without categories", () => {
		screen({
			cards: [{ name: "C", card_name: "C", items: [{ ...WATER, item_group: "Drinks" }, { ...STEAK, item_group: "Meat" }] }],
			selectedCard: "C",
		})

		expect(chips().map((chip) => chip.text())).toEqual(["All", "Drinks", "Meat"])
	})
})

describe("the buttons of the card", () => {
	it("are three per row", () => {
		screen()

		expect(wrapper.find("[data-card-grid]").attributes("style")).toContain("repeat(3, minmax(0, 1fr))")
	})

	it("take the item's colour, else its type's, else a neutral one", () => {
		screen({ cards: [LUNCH, PERMANENT] })
		const edge = (name) => button(name).element.style.borderTopColor

		expect(edge("Water 1 l")).toBe(rgb("#4A6B8F"))
		expect(button("Water 1 l").element.style.backgroundColor).toBe(rgb(softTint("#4A6B8F")))
		// No colour of its own: the colour of its type (Cold)
		expect(edge("Iced tea")).toBe(rgb("#4A6B8F"))
		expect(edge("Rib steak")).toBe(rgb("#C2723F"))
	})

	it("of a dish of no type and no colour are neutral", async () => {
		screen({ cards: [LUNCH, PERMANENT], selectedCard: "CARD-PERMANENT" })

		expect(button("Bread").element.style.borderTopColor).toBe(rgb(NEUTRAL_EDGE))
	})

	it("show the price, « options » when the dish has some, the courses of a menu", () => {
		screen()
		const price = (name) => button(name).find("[data-button-price]").text()

		expect(price("Water 1 l")).toBe("6.00")
		expect(price("Rib steak")).toBe("42.00 · options")
		expect(price("Menu of the day")).toBe("29.00 · 3 courses")
	})

	it("show how many of each the order holds, and follow it", async () => {
		screen()
		expect(wrapper.findAll("[data-button-count]")).toHaveLength(0)

		state.cart.invoiceItems.push({ item_code: "WATER", quantity: 2 }, { item_code: "STEAK", quantity: 1, posa_item_modifiers: "[]" })
		await nextTick()
		expect(button("Water 1 l").find("[data-button-count]").text()).toBe("2")
		expect(button("Rib steak").find("[data-button-count]").text()).toBe("1")
		// Read out as a count, not as a bare number next to the price
		expect(button("Water 1 l").find("[data-button-count]").attributes()).toMatchObject({
			role: "img",
			"aria-label": "2 in this order",
		})

		state.cart.invoiceItems[0].quantity = 3
		state.cart.invoiceItems.push({ item_code: "STEAK", quantity: 1 })
		await nextTick()
		expect(button("Water 1 l").find("[data-button-count]").text()).toBe("3")
		expect(button("Rib steak").find("[data-button-count]").text()).toBe("2")
	})

	it("of a dish that cannot be sold is struck, says « Sold out » and adds nothing", async () => {
		screen()
		const perch = button("Perch fillets")

		expect(perch.attributes("disabled")).toBeDefined()
		expect(perch.find("s").text()).toBe("Perch fillets")
		expect(perch.find("[data-sold-out]").text()).toBe("Sold out")
		await perch.trigger("click")
		expect(wrapper.emitted("pick")).toBeUndefined()
	})

	it("show no picture unless the till asks for pictures", async () => {
		screen()
		expect(wrapper.find("img[data-button-image]").exists()).toBe(false)

		state.settings.settings.phone_card_pictures = 1
		await nextTick()
		expect(button("Rib steak").find("img[data-button-image]").attributes("src")).toBe("/files/steak.jpg")
		// A dish without a picture keeps its name and price only
		expect(button("Water 1 l").find("img").exists()).toBe(false)
	})
})

describe("a touch on a button", () => {
	it("adds one through the till's own path, and asks nothing of the server (offline too)", async () => {
		screen()

		await button("Water 1 l").trigger("click")

		expect(wrapper.emitted("pick")).toEqual([[WATER]])
		expect(wrapper.emitted("options")).toBeUndefined()
		expect(call).not.toHaveBeenCalled()
	})

	it("held, opens the options of the dish and adds nothing", async () => {
		vi.useFakeTimers()
		screen()
		const steak = button("Rib steak")

		await steak.trigger("pointerdown", { clientX: 20, clientY: 300, button: 0, pointerType: "touch" })
		vi.advanceTimersByTime(LONG_PRESS_MS)
		await steak.trigger("pointerup", { clientX: 20, clientY: 300, button: 0 })
		await fingerClick(steak)

		expect(wrapper.emitted("options")).toEqual([[STEAK]])
		expect(wrapper.emitted("pick")).toBeUndefined()
	})

	it("that scrolls the card opens nothing and adds nothing", async () => {
		vi.useFakeTimers()
		screen()
		const steak = button("Rib steak")

		await steak.trigger("pointerdown", { clientX: 20, clientY: 300, button: 0, pointerType: "touch" })
		await steak.trigger("pointermove", { clientX: 20, clientY: 240, button: 0 })
		vi.advanceTimersByTime(LONG_PRESS_MS * 3)
		await steak.trigger("pointerup", { clientX: 20, clientY: 240, button: 0 })
		await fingerClick(steak)

		expect(wrapper.emitted("options")).toBeUndefined()
		expect(wrapper.emitted("pick")).toBeUndefined()
	})
})

describe("the bottom bar", () => {
	it("counts the articles of the order and its total, and opens the order", async () => {
		state.cart.invoiceItems.push({ item_code: "WATER", quantity: 2 }, { item_code: "STEAK", quantity: 1 })
		state.cart.roundedGrandTotal = 54
		screen()
		const bar = wrapper.find("[data-open-order]")

		expect(bar.find("[data-order-count]").text()).toBe("Order · 3 items")
		expect(bar.find("[data-order-total]").text()).toBe("CHF 54.00 ›")
		await bar.trigger("click")
		expect(wrapper.emitted("open-order")).toHaveLength(1)
	})

	it("says one article, or none", async () => {
		screen()
		expect(wrapper.find("[data-order-count]").text()).toBe("Order · no items")

		state.cart.invoiceItems.push({ item_code: "WATER", quantity: 1 })
		await nextTick()
		expect(wrapper.find("[data-order-count]").text()).toBe("Order · 1 item")
	})
})

describe("the header", () => {
	it("goes back to the tables and names the table", async () => {
		screen()

		expect(wrapper.find("[data-back]").text()).toBe("‹ Tables")
		expect(wrapper.find("[data-table-name]").text()).toBe("Table 5")
		await wrapper.find("[data-back]").trigger("click")
		expect(wrapper.emitted("back")).toHaveLength(1)
	})

	it("opens the table's QR code where the restaurant takes orders by QR", async () => {
		screen()
		await wrapper.find("[data-qr]").trigger("click")
		expect(wrapper.emitted("qr")).toHaveLength(1)
		wrapper.unmount()

		state.restaurant.restaurantSettings.enable_qr_ordering = 0
		screen()
		expect(wrapper.find("[data-qr]").exists()).toBe(false)
	})

	it("of a takeaway order names it and has no QR code", () => {
		Object.assign(state.cart, { restaurantTable: null, isTakeaway: true, takeawayNumber: "T-007" })
		screen()

		expect(wrapper.find("[data-table-name]").text()).toBe("T-007")
		expect(wrapper.find("[data-qr]").exists()).toBe(false)
	})

	it("carries the card row when the restaurant serves several cards, and a pick selects the card", async () => {
		screen({ cards: [LUNCH, PERMANENT] })
		const pills = wrapper.findAll("[data-card-pill]")

		expect(pills.map((pill) => pill.text())).toEqual(["Lunch", "Permanent items"])
		// A finger's target: 44 px high, the pill drawn inside it
		for (const pill of pills) expect(pill.classes()).toContain("min-h-[44px]")
		expect(pills[0].attributes("aria-pressed")).toBe("true")
		await pills[1].trigger("click")
		expect(wrapper.emitted("update:selectedCard")).toEqual([["CARD-PERMANENT"]])
	})

	it("has no card row for a single card", () => {
		screen()

		expect(wrapper.find("[data-card-pill]").exists()).toBe(false)
	})

	it("goes back to « All » when another card is chosen", async () => {
		screen({ cards: [LUNCH, PERMANENT] })
		await chips()[2].trigger("click")

		await wrapper.setProps({ selectedCard: "CARD-PERMANENT" })
		expect(buttons().map((found) => found.find("[data-button-name]").text())).toEqual(["Bread"])
		await wrapper.setProps({ selectedCard: "CARD-LUNCH" })
		expect(chips()[0].attributes("aria-pressed")).toBe("true")
		expect(buttons()).toHaveLength(5)
	})
})

describe("leaving the table with « ‹ Tables »", () => {
	const ask = () => wrapper.find("[data-leave-ask]")

	it("asks first when lines were not sent to the kitchen, and stays unless told to leave", async () => {
		state.cart.invoiceItems.push(
			{ item_code: "WATER", quantity: 2 },
			{ item_code: "STEAK", quantity: 1, kds_status: "Waiting" },
			{ item_code: "BREAD", quantity: 1, kds_status: "Pending" },
		)
		screen()

		await wrapper.find("[data-back]").trigger("click")
		expect(wrapper.emitted("back")).toBeUndefined()
		expect(ask().attributes("role")).toBe("alertdialog")
		expect(ask().find("[data-leave-question]").text()).toBe("Leave this table? 2 lines not sent will be lost.")
		const stay = ask().find("[data-leave-stay]")
		const leave = ask().find("[data-leave-go]")
		expect(stay.text()).toBe("Stay")
		expect(leave.text()).toBe("Leave")
		// Staying is the ink button; both are a finger's target
		expect(stay.classes()).toContain("bg-[#141414]")
		for (const target of [stay, leave]) expect(target.classes()).toContain("min-h-[44px]")

		await stay.trigger("click")
		expect(ask().exists()).toBe(false)
		expect(wrapper.emitted("back")).toBeUndefined()

		await wrapper.find("[data-back]").trigger("click")
		await ask().find("[data-leave-go]").trigger("click")
		expect(wrapper.emitted("back")).toHaveLength(1)
		// The page must not ask the same question again: the answer says it was asked (Daniel, 03.11, the tablet's question)
		expect(wrapper.emitted("back")[0]).toEqual([{ unsentAsked: true }])
		expect(ask().exists()).toBe(false)
	})

	it("stays on Escape", async () => {
		state.cart.invoiceItems.push({ item_code: "WATER", quantity: 1 })
		screen()
		await wrapper.find("[data-back]").trigger("click")

		await ask().trigger("keydown", { key: "Escape" })

		expect(ask().exists()).toBe(false)
		expect(wrapper.emitted("back")).toBeUndefined()
	})

	it("says one line in the singular, and « order » for a takeaway", async () => {
		Object.assign(state.cart, { restaurantTable: null, isTakeaway: true, takeawayNumber: "T-007" })
		state.cart.invoiceItems.push({ item_code: "WATER", quantity: 3 }, { item_code: "GIFT", quantity: 1, is_free_item: 1 })
		screen()

		await wrapper.find("[data-back]").trigger("click")

		expect(ask().find("[data-leave-question]").text()).toBe("Leave this order? 1 line not sent will be lost.")
	})

	it("leaves at once when every line was sent", async () => {
		state.cart.invoiceItems.push({ item_code: "WATER", quantity: 2, kds_status: "Pending" }, { item_code: "STEAK", quantity: 1, kds_status: "Ready" })
		screen()

		await wrapper.find("[data-back]").trigger("click")

		expect(ask().exists()).toBe(false)
		expect(wrapper.emitted("back")).toHaveLength(1)
	})
})

it("says so when the card has nothing to sell", () => {
	screen({ cards: [{ name: "EMPTY", card_name: "Empty", items: [] }], selectedCard: "EMPTY" })

	expect(wrapper.find("[data-card-empty]").text()).toBe("No items")
})
