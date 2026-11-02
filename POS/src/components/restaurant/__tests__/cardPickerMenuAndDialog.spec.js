/**
 * //// Neoffice — added file (no upstream equivalent). The « ⋯ » at the end of the order screen's card row lists the
 * //// cards the hours keep off the till, and the floor plan opens the same list in a dialog from its own « ⋯ » menu
 * //// (NeoResto lot 1, task 25). Both draw one list and pick through one composable. The menu behaves as the floor
 * //// plan's does: a tap outside only closes it.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { reactive } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requireAuthorization = vi.hoisted(() => vi.fn())
const handleError = vi.hoisted(() => vi.fn())
const store = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/composables/useAuthorization", () => ({
	useAuthorization: () => ({ requireAuthorization }),
	isAuthorizationError: () => false,
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ handleError }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => store }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till 1" }),
}))

const { useCardPicker } = await import("@/composables/useCardPicker")
const { default: CardPickerMenu } = await import("../CardPickerMenu.vue")
const { default: CardPickerDialog } = await import("../CardPickerDialog.vue")

const SATURDAY = {
	name: "Saturday",
	card_name: "Saturday service",
	description: "Brunch and more",
}
const SUNDAY = {
	name: "Sunday",
	card_name: "Sunday service",
	description: null,
}

let state
function theStore(cards = [SATURDAY, SUNDAY]) {
	state = reactive({ isEnabled: true, pickableCards: cards })
	for (const key of Object.keys(store)) delete store[key]
	Object.defineProperties(store, {
		isEnabled: {
			get: () => state.isEnabled,
			enumerable: true,
			configurable: true,
		},
		pickableCards: {
			get: () => state.pickableCards,
			enumerable: true,
			configurable: true,
		},
	})
	store.openCardByHand = vi.fn(async (card) => ({
		...card,
		opened_by_hand: true,
	}))
}

let wrapper
const options = () => wrapper.findAll('[data-test="card-option"]')
const tapOutside = () =>
	document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))

beforeEach(() => {
	requireAuthorization.mockReset()
	requireAuthorization.mockResolvedValue({ grant_token: null, required: false })
	handleError.mockReset()
	theStore()
	const { state: picker } = useCardPicker()
	picker.open = false
	picker.busy = false
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
})

describe("the « ⋯ » at the end of the card row", () => {
	function theMenu() {
		wrapper = mount(CardPickerMenu, {
			attachTo: document.body,
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}

	it("is not there while no card is outside its hours", () => {
		theStore([])

		theMenu()

		expect(wrapper.find('[data-test="card-more"]').exists()).toBe(false)
	})

	//// Neoffice — Daniel, 02.11: he could not find the « ⋯ » (small and grey, at the far end of the row). Where the row holds no card of the hours (the afternoon between two services), the row hands it a label:
	//// the button says what it opens, in words, and keeps its list.
	it("says what it opens in words when the row has no card of the hours, and is the small quiet one otherwise", () => {
		wrapper = mount(CardPickerMenu, { props: { labelled: true }, attachTo: document.body, global: { mocks: { __: globalThis.__ } } })
		const button = wrapper.find('[data-test="card-more"]')

		expect(button.text()).toBe("Open another card")
		expect(button.classes()).toContain("h-9")
		expect(button.classes()).not.toContain("w-8")
		wrapper.unmount()

		theMenu()
		expect(wrapper.find('[data-test="card-more"]').text()).toBe("")
		expect(wrapper.find('[data-test="card-more"]').classes()).toContain("w-8")
	})

	it("opens the same list when it carries the label", async () => {
		wrapper = mount(CardPickerMenu, { props: { labelled: true }, attachTo: document.body, global: { mocks: { __: globalThis.__ } } })

		await wrapper.get('[data-test="card-more"]').trigger("click")

		expect(options()).toHaveLength(2)
	})

	it("is a quiet button that says what it opens, and the list is closed", () => {
		theMenu()

		const button = wrapper.find('[data-test="card-more"]')
		expect(button.exists()).toBe(true)
		expect(button.attributes("aria-label")).toBe("Open another card")
		expect(button.attributes("aria-haspopup")).toBe("menu")
		expect(button.attributes("aria-expanded")).toBe("false")
		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
	})

	it("lists the cards the hours hide, and only those, when it is opened", async () => {
		theMenu()

		await wrapper.find('[data-test="card-more"]').trigger("click")

		expect(
			wrapper.find('[data-test="card-more"]').attributes("aria-expanded"),
		).toBe("true")
		expect(
			wrapper.find('[data-test="card-more-list"]').attributes("role"),
		).toBe("menu")
		expect(options().map((option) => option.attributes("data-card"))).toEqual([
			"Saturday",
			"Sunday",
		])
		expect(options()[0].text()).toContain("Saturday service")
		expect(options()[0].text()).toContain("Brunch and more")
		expect(options()[0].attributes("role")).toBe("menuitem")
	})

	it("follows the store: a card that was opened leaves the list", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		state.pickableCards = [SUNDAY]
		await flushPromises()

		expect(options().map((option) => option.attributes("data-card"))).toEqual([
			"Sunday",
		])
	})

	it("opens the card picked, closes, and asks the gate for it", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		await options()[1].trigger("click")
		await flushPromises()

		expect(requireAuthorization).toHaveBeenCalledTimes(1)
		expect(requireAuthorization.mock.calls[0][1].restaurant_card).toBe("Sunday")
		expect(store.openCardByHand).toHaveBeenCalledWith(SUNDAY, null)
		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
	})

	it("closes at a tap outside, and only closes: nothing is opened", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		tapOutside()
		await flushPromises()

		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
		expect(requireAuthorization).not.toHaveBeenCalled()
		expect(store.openCardByHand).not.toHaveBeenCalled()
	})

	it("closes at a tap on something that keeps its pointer from rising, as a card button of the grid may", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		const tile = document.createElement("div")
		tile.addEventListener("pointerdown", (event) => event.stopPropagation())
		document.body.appendChild(tile)
		tile.dispatchEvent(new Event("pointerdown", { bubbles: true }))
		await flushPromises()

		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
		expect(store.openCardByHand).not.toHaveBeenCalled()
		tile.remove()
	})

	it("gives the focus to its first card when it opens, for whoever has no finger to tap with", async () => {
		theMenu()

		await wrapper.find('[data-test="card-more"]').trigger("click")
		await flushPromises()

		expect(document.activeElement).toBe(options()[0].element)
	})

	it("stays open at a tap inside it, on the list but not on a card", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		wrapper
			.find('[data-test="card-more-list"]')
			.element.dispatchEvent(new Event("pointerdown", { bubbles: true }))
		await flushPromises()

		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(true)
	})

	it("closes at Escape and gives the focus back to the button", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		await flushPromises()

		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
		expect(document.activeElement).toBe(
			wrapper.find('[data-test="card-more"]').element,
		)
	})

	it("closes at a second tap on the button", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		await wrapper.find('[data-test="card-more"]').trigger("click")

		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
	})

	it("listens to the keyboard and the pointer only while it is open", async () => {
		const added = vi.spyOn(document, "addEventListener")
		const removed = vi.spyOn(document, "removeEventListener")
		theMenu()
		const heard = (spy) =>
			spy.mock.calls
				.map(([type]) => type)
				.filter((type) => type === "pointerdown" || type === "keydown")
				.sort()

		await wrapper.find('[data-test="card-more"]').trigger("click")
		const opened = heard(added)
		await wrapper.find('[data-test="card-more"]').trigger("click")
		const closed = heard(removed)

		expect(opened).toEqual(["keydown", "pointerdown"])
		expect(closed).toEqual(["keydown", "pointerdown"])
		added.mockRestore()
		removed.mockRestore()
	})

	it("goes when the last card does", async () => {
		theMenu()
		await wrapper.find('[data-test="card-more"]').trigger("click")

		state.pickableCards = []
		await flushPromises()

		expect(wrapper.find('[data-test="card-more"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="card-more-list"]').exists()).toBe(false)
	})
})

describe("the dialog the floor plan opens", () => {
	function theDialog() {
		wrapper = mount(CardPickerDialog, {
			attachTo: document.body,
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}

	it("is not there until the picker is opened", () => {
		theDialog()

		expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(
			false,
		)
	})

	it("lists the same cards, under the title of the menu entry that opened it", async () => {
		theDialog()

		useCardPicker().openDialog()
		await flushPromises()

		const dialog = wrapper.find('[data-test="card-picker-dialog"]')
		expect(dialog.exists()).toBe(true)
		expect(dialog.attributes("role")).toBe("dialog")
		expect(dialog.attributes("aria-label")).toBe("Open another card")
		expect(options().map((option) => option.attributes("data-card"))).toEqual([
			"Saturday",
			"Sunday",
		])
	})

	it("opens the card picked and closes, so that the next table shows it", async () => {
		theDialog()
		useCardPicker().openDialog()
		await flushPromises()

		await options()[0].trigger("click")
		await flushPromises()

		expect(store.openCardByHand).toHaveBeenCalledWith(SATURDAY, null)
		expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(
			false,
		)
		expect(useCardPicker().state.open).toBe(false)
	})

	it("goes through the same gate: a manager's PIN where a rule asks for it", async () => {
		requireAuthorization.mockResolvedValue({
			grant_token: "a-grant",
			authorized: true,
		})
		theDialog()
		useCardPicker().openDialog()
		await flushPromises()

		await options()[1].trigger("click")
		await flushPromises()

		expect(requireAuthorization.mock.calls[0][0]).toBe(
			"Open a card outside its hours",
		)
		expect(store.openCardByHand).toHaveBeenCalledWith(SUNDAY, "a-grant")
	})

	it("opens nothing when the approval is cancelled, and is closed all the same", async () => {
		requireAuthorization.mockResolvedValue(null)
		theDialog()
		useCardPicker().openDialog()
		await flushPromises()

		await options()[0].trigger("click")
		await flushPromises()

		expect(store.openCardByHand).not.toHaveBeenCalled()
		expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(
			false,
		)
	})

	it("closes at its close button, at a tap on the backdrop and at Escape, and opens nothing", async () => {
		theDialog()
		for (const close of [
			() => wrapper.find('[data-test="card-picker-close"]').trigger("click"),
			() => wrapper.find('[data-test="card-picker-dialog"]').trigger("click"),
			() =>
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
		]) {
			useCardPicker().openDialog()
			await flushPromises()
			expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(
				true,
			)

			await close()
			await flushPromises()

			expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(
				false,
			)
		}
		expect(store.openCardByHand).not.toHaveBeenCalled()
	})

	it("stays open at a tap inside the panel", async () => {
		theDialog()
		useCardPicker().openDialog()
		await flushPromises()

		await wrapper.find('[data-test="card-picker-panel"]').trigger("click")

		expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(true)
	})

	it("closes when the last card goes", async () => {
		theDialog()
		useCardPicker().openDialog()
		await flushPromises()

		state.pickableCards = []
		await flushPromises()

		expect(wrapper.find('[data-test="card-picker-dialog"]').exists()).toBe(
			false,
		)
	})
})
