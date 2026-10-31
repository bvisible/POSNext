/**
 * //// Neoffice — added file (no upstream equivalent). On a phone the options of a dish open in a sheet from the
 * //// bottom of the screen, as the waiter mockup draws it (NeoRestau lot 1, task 27): each option group with
 * //// « required », « choose one » or « optional », its choices as buttons, a remark for the kitchen that can be
 * //// dictated, the number of portions, and « Add » with the price, which waits for the required groups. It adds to
 * //// the order through the till's own cart (a local write: it works offline), and edits a line in place when the
 * //// till opens it on a line, as the options dialog it replaces on a phone does.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const call = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

vi.mock("frappe-ui", () => ({
	call,
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => true, getCachedItem: vi.fn() }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false, settings: {} }),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))

const COOKING = {
	group_name: "Cooking",
	required: 1,
	selection_type: "Single",
	options: [{ option_name: "Blue" }, { option_name: "Rare" }, { option_name: "Medium" }, { option_name: "Well done" }],
}
const SIDE = {
	group_name: "Side",
	required: 0,
	selection_type: "Single",
	options: [{ option_name: "Fries", is_default: 1 }, { option_name: "Rösti" }],
}
const SAUCE = {
	group_name: "Sauce",
	required: 0,
	selection_type: "Multiple",
	max_selections: 2,
	options: [
		{ option_name: "Pepper", price_adjustment: 2 },
		{ option_name: "Morels", price_adjustment: 6 },
	],
}
const DRESSING = {
	group_name: "Dressing",
	required: 0,
	selection_type: "Single",
	options: ["House dressing", "Balsamic only", "Olive oil", "Lemon", "None"].map((option_name) => ({ option_name })),
}
const BREAD = {
	group_name: "Bread",
	required: 0,
	selection_type: "Single",
	options: ["Sourdough loaf", "Rye", "Spelt", "None"].map((option_name) => ({ option_name })),
}
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		getModifiersForItem: (code) => (code === "STEAK" ? [COOKING, SIDE, SAUCE] : code === "SALAD" ? [DRESSING, BREAD] : []),
		getStationForItem: () => ({ station: "Kitchen" }),
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { default: PhoneOptionsSheet } = await import("../PhoneOptionsSheet.vue")

const STEAK = {
	item_type: "Item",
	item: "STEAK",
	item_name: "Rib steak",
	item_group: "Meat",
	price: 42,
	custom_color: "#C2723F",
}
const WATER = { item_type: "Item", item: "WATER", item_name: "Water 1 l", price: 6 }

class FakeRecognition {
	static made = []
	constructor() {
		this.start = vi.fn()
		this.stop = vi.fn()
		this.abort = vi.fn()
		FakeRecognition.made.push(this)
	}
	hear(text) {
		this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] })
		this.onend?.()
	}
}

let wrapper
let cart

async function sheet() {
	wrapper = mount(PhoneOptionsSheet, {
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	await nextTick()
	return wrapper
}

async function openFor(entry) {
	await sheet()
	wrapper.vm.openForCardItem(entry)
	await nextTick()
}

const option = (name) => wrapper.findAll("[data-option]").find((found) => found.text().startsWith(name))
const confirm = () => wrapper.find("[data-confirm]")

beforeEach(() => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	call.mockReset()
	FakeRecognition.made = []
	document.documentElement.setAttribute("lang", "fr")
})

afterEach(() => {
	wrapper?.unmount()
	delete window.SpeechRecognition
	delete window.webkitSpeechRecognition
})

describe("the options sheet of a dish", () => {
	it("shows the dish, its price, and each group with what it asks for", async () => {
		await openFor(STEAK)

		expect(wrapper.find("[role=dialog]").attributes("aria-label")).toBe("Options of Rib steak")
		expect(wrapper.find("[data-sheet-title]").text()).toBe("Rib steak")
		expect(wrapper.find("[data-sheet-price]").text()).toBe("42.00")
		expect(wrapper.findAll("[data-group-label]").map((label) => label.text())).toEqual(["Cooking", "Side", "Sauce"])
		expect(wrapper.findAll("[data-group-rule]").map((rule) => rule.text())).toEqual(["required", "· choose one", "· optional"])
		expect(option("Pepper").text()).toBe("Pepper · +2.00")
	})

	it("lays the choices four to a row, two when they carry a price, fewer when their names are long", async () => {
		const columns = () =>
			wrapper.findAll("[data-option-group] .grid").map((grid) => grid.attributes("style").match(/repeat\((\d)/)[1])

		await openFor(STEAK)
		expect(columns()).toEqual(["4", "2", "2"])

		wrapper.vm.openForCardItem({ item_type: "Item", item: "SALAD", item_name: "Salad", price: 13 })
		await nextTick()
		// Five long names three to a row; four that cannot go four to a row, two by two
		expect(columns()).toEqual(["3", "2"])
	})

	it("keeps « Add » shut until every required group is chosen", async () => {
		await openFor(STEAK)
		expect(confirm().attributes("disabled")).toBeDefined()

		await option("Rare").trigger("click")
		expect(confirm().attributes("disabled")).toBeUndefined()
	})

	it("takes one choice in a group of one, several in the others, and starts from the defaults", async () => {
		await openFor(STEAK)
		expect(option("Fries").attributes("aria-pressed")).toBe("true")

		await option("Rare").trigger("click")
		await option("Medium").trigger("click")
		expect(option("Rare").attributes("aria-pressed")).toBe("false")
		expect(option("Medium").attributes("aria-pressed")).toBe("true")

		await option("Pepper").trigger("click")
		await option("Morels").trigger("click")
		expect(option("Pepper").attributes("aria-pressed")).toBe("true")
		expect(option("Morels").attributes("aria-pressed")).toBe("true")
	})

	it("follows the choices and the portions in its total", async () => {
		await openFor(STEAK)
		await option("Rare").trigger("click")
		expect(confirm().text()).toBe("Add · 42.00")

		await option("Pepper").trigger("click")
		expect(confirm().text()).toBe("Add · 44.00")

		await wrapper.find("[data-more]").trigger("click")
		expect(wrapper.find("[data-portions]").text()).toBe("2")
		expect(confirm().text()).toBe("Add · 88.00")

		await wrapper.find("[data-less]").trigger("click")
		await wrapper.find("[data-less]").trigger("click")
		expect(wrapper.find("[data-portions]").text()).toBe("1")
		expect(confirm().text()).toBe("Add · 44.00")
	})

	it("adds one line with the choices, the remark and the portions, offline, and closes", async () => {
		await openFor(STEAK)
		await option("Rare").trigger("click")
		await option("Pepper").trigger("click")
		await wrapper.find("[data-remark]").setValue("no butter")
		await wrapper.find("[data-more]").trigger("click")

		await confirm().trigger("click")

		expect(cart.invoiceItems).toHaveLength(1)
		const [line] = cart.invoiceItems
		expect(line).toMatchObject({
			item_code: "STEAK",
			item_name: "Rib steak",
			quantity: 2,
			rate: 44,
			posa_special_instructions: "no butter",
			preparation_station: "Kitchen",
			custom_color: "#C2723F",
		})
		expect(JSON.parse(line.posa_item_modifiers)).toEqual([
			{ group: "Cooking", options: [{ name: "Rare", price_adjustment: 0 }] },
			{ group: "Side", options: [{ name: "Fries", price_adjustment: 0 }] },
			{ group: "Sauce", options: [{ name: "Pepper", price_adjustment: 2 }] },
		])
		expect(wrapper.emitted("saved")).toEqual([[line, { added: true }]])
		expect(wrapper.find("[data-options-sheet]").exists()).toBe(false)
		expect(call).not.toHaveBeenCalled()
	})

	it("adds the same dish with other choices as a line of its own", async () => {
		await openFor(STEAK)
		await option("Rare").trigger("click")
		await confirm().trigger("click")
		wrapper.vm.openForCardItem(STEAK)
		await nextTick()
		await option("Well done").trigger("click")
		await confirm().trigger("click")

		expect(cart.invoiceItems).toHaveLength(2)
		expect(cart.invoiceItems.map((line) => JSON.parse(line.posa_item_modifiers)[0].options[0].name)).toEqual([
			"Rare",
			"Well done",
		])
	})

	it("adds a dish chosen without any option nor remark to its plain line", async () => {
		cart.addItem({ item_code: "WATER", item_name: "Water 1 l", rate: 6 }, 1)
		await openFor(WATER)
		expect(wrapper.findAll("[data-option-group]")).toHaveLength(0)
		await wrapper.find("[data-more]").trigger("click")

		await confirm().trigger("click")

		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].quantity).toBe(3)
	})

	it("closes from its backdrop without adding anything", async () => {
		await openFor(STEAK)
		await option("Rare").trigger("click")

		await wrapper.find("[data-sheet-backdrop]").trigger("pointerdown")
		await wrapper.find("[data-sheet-backdrop]").trigger("click")

		expect(wrapper.find("[data-options-sheet]").exists()).toBe(false)
		expect(cart.invoiceItems).toHaveLength(0)
	})

	it("stays open when the finger of the long press lifts over its backdrop", async () => {
		await openFor(STEAK)

		// The sheet opened under the finger still on the card: the click its lift makes was never pressed on the backdrop
		await wrapper.find("[data-sheet-backdrop]").trigger("click")

		expect(wrapper.find("[data-options-sheet]").exists()).toBe(true)
	})
})

describe("the remark's microphone", () => {
	it("is not there where the browser cannot dictate", async () => {
		await openFor(STEAK)

		expect(wrapper.find("[data-remark]").exists()).toBe(true)
		expect(wrapper.find("[data-dictate]").exists()).toBe(false)
	})

	it("dictates into the remark, in Swiss French, and only once pressed", async () => {
		window.SpeechRecognition = FakeRecognition
		await openFor(STEAK)
		await wrapper.find("[data-remark]").setValue("no ice")
		expect(FakeRecognition.made).toHaveLength(0)

		await wrapper.find("[data-dictate]").trigger("click")
		const [recognition] = FakeRecognition.made
		expect(recognition.lang).toBe("fr-CH")
		expect(recognition.start).toHaveBeenCalledTimes(1)

		recognition.hear("no butter")
		await nextTick()
		expect(wrapper.find("[data-remark]").element.value).toBe("no ice no butter")
	})

	it("still open when « Add » is pressed, gives its last words before the dish is added", async () => {
		window.SpeechRecognition = FakeRecognition
		await openFor(STEAK)
		await option("Rare").trigger("click")
		await wrapper.find("[data-dictate]").trigger("click")
		const [recognition] = FakeRecognition.made

		await confirm().trigger("click")
		expect(recognition.stop).toHaveBeenCalled()
		expect(cart.invoiceItems).toHaveLength(0)
		expect(confirm().attributes("disabled")).toBeDefined()

		recognition.hear("extra lemon")
		await flushPromises()
		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].posa_special_instructions).toBe("extra lemon")
	})

	it("whose last words never come does not hold the dish back for long", async () => {
		vi.useFakeTimers()
		try {
			window.SpeechRecognition = FakeRecognition
			await openFor(STEAK)
			await option("Rare").trigger("click")
			await wrapper.find("[data-remark]").setValue("no ice")
			await wrapper.find("[data-dictate]").trigger("click")

			await confirm().trigger("click")
			vi.advanceTimersByTime(2000)
			await flushPromises()

			expect(cart.invoiceItems).toHaveLength(1)
			expect(cart.invoiceItems[0].posa_special_instructions).toBe("no ice")
			expect(FakeRecognition.made[0].abort).toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it("refused on one dish is offered again on the next one", async () => {
		window.SpeechRecognition = FakeRecognition
		await openFor(STEAK)
		await wrapper.find("[data-dictate]").trigger("click")
		FakeRecognition.made[0].onerror?.({ error: "not-allowed" })
		await nextTick()
		expect(wrapper.find("[data-dictation-denied]").exists()).toBe(true)

		await wrapper.find("[data-sheet-backdrop]").trigger("pointerdown")
		await wrapper.find("[data-sheet-backdrop]").trigger("click")
		wrapper.vm.openForCardItem(WATER)
		await nextTick()

		expect(wrapper.find("[data-dictation-denied]").exists()).toBe(false)
	})
})

describe("a dish whose price is typed at the till", () => {
	const SOUP = { item_type: "Item", item: "SOUP", item_name: "Soup of the day", item_group: "Starters", price: 0 }

	it("gets a line of its own, and says it was added by this sheet so a cancelled price takes it back", async () => {
		cart.addItem({ item_code: "SOUP", item_name: "Soup of the day", rate: 0 }, 1)
		await openFor(SOUP)
		await wrapper.find("[data-more]").trigger("click")

		await confirm().trigger("click")

		expect(cart.invoiceItems).toHaveLength(2)
		const added = cart.invoiceItems[1]
		expect(added).toMatchObject({ item_code: "SOUP", quantity: 2, rate: 0 })
		expect(wrapper.emitted("saved")).toEqual([[added, { added: true }]])
	})
})

describe("on a line reloaded from the server", () => {
	it("shows the dish's own price and saves the same choice at the same price", async () => {
		cart.replaceAllItems([
			{
				item_code: "STEAK",
				item_name: "Rib steak",
				rate: 44,
				qty: 1,
				uom: "Nos",
				kds_status: "Pending",
				posa_item_modifiers: JSON.stringify([
					{ group: "Cooking", options: [{ name: "Rare", price_adjustment: 0 }] },
					{ group: "Sauce", options: [{ name: "Pepper", price_adjustment: 2 }] },
				]),
			},
		])
		await sheet()
		wrapper.vm.open(cart.invoiceItems[0])
		await nextTick()

		expect(wrapper.find("[data-sheet-price]").text()).toBe("42.00")
		expect(confirm().text()).toBe("Save · 44.00")
		await wrapper.find("[data-remark]").setValue("no butter")
		await confirm().trigger("click")

		expect(cart.invoiceItems[0].rate).toBe(44)
	})
})

describe("on a line of the order (the dialog's contract)", () => {
	it("shows the line's choices and remark, and saves them on that same line", async () => {
		cart.addItem(
			{
				item_code: "STEAK",
				item_name: "Rib steak",
				item_group: "Meat",
				rate: 42,
				posa_item_modifiers: JSON.stringify([{ group: "Cooking", options: [{ name: "Rare", price_adjustment: 0 }] }]),
				posa_special_instructions: "no butter",
			},
			1,
		)
		const line = cart.invoiceItems[0]
		await sheet()
		wrapper.vm.open(line)
		await nextTick()

		expect(option("Rare").attributes("aria-pressed")).toBe("true")
		expect(wrapper.find("[data-remark]").element.value).toBe("no butter")
		expect(confirm().text()).toBe("Save · 42.00")

		await option("Medium").trigger("click")
		await option("Morels").trigger("click")
		await confirm().trigger("click")

		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].rate).toBe(48)
		expect(JSON.parse(cart.invoiceItems[0].posa_item_modifiers)[0].options[0].name).toBe("Medium")
		expect(wrapper.emitted("saved")).toEqual([[cart.invoiceItems[0]]])
	})

	it("reads « Add » on a line a touch just added, which has no option yet", async () => {
		cart.addItem({ item_code: "STEAK", item_name: "Rib steak", item_group: "Meat", rate: 42 }, 1)
		await sheet()
		wrapper.vm.open(cart.invoiceItems[0])
		await nextTick()
		await option("Rare").trigger("click")

		expect(confirm().text()).toBe("Add · 42.00")
		await confirm().trigger("click")
		expect(cart.invoiceItems).toHaveLength(1)
		expect(JSON.parse(cart.invoiceItems[0].posa_item_modifiers)[0].options[0].name).toBe("Rare")
	})
})
