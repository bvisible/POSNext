/**
 * //// Neoffice — added file (no upstream equivalent). The row of card buttons of the order screen (NeoResto lot 1,
 * //// task 25): one button per card; a card opened by hand carries a mark and a « × »; the « ⋯ » that fetches a card the
 * //// opening hours keep off the till ends the row. Nothing above the buttons says anything about the hours: between
 * //// two services the afternoon has no card of its own, and the « ⋯ » is the way back.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s
})

// The « ⋯ » is another component's business (cardPickerMenuAndDialog.spec.js): here it only has to be at the end of the row
vi.mock("../CardPickerMenu.vue", () => ({
	default: {
		name: "CardPickerMenu",
		template: '<div data-test="card-more-menu-stub" />',
	},
}))

const { default: RestaurantCardTabs } = await import(
	"../RestaurantCardTabs.vue"
)

const LUNCH = { name: "Lunch", card_name: "Lunch" }
const SATURDAY = {
	name: "Saturday",
	card_name: "Saturday service",
	opened_by_hand: true,
}
const PERMANENT = {
	name: "Permanent items",
	card_name: "Permanent items",
	is_permanent: 1,
}

let wrapper
function theRow(props = {}, slots = {}) {
	wrapper = mount(RestaurantCardTabs, {
		props: { cards: [LUNCH, SATURDAY, PERMANENT], selected: "Lunch", ...props },
		slots,
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const tabs = () => wrapper.findAll('[data-test="card-tab"]')

afterEach(() => wrapper?.unmount())

describe("the row has no line about the opening hours", () => {
	it("carries nothing but the buttons and the « ⋯ », whatever the props it is given", () => {
		// What the first version of the task passed (the hours' last service): no longer a thing the row knows
		theRow({ afterHours: true, serviceLabel: "Lunch" })

		expect(wrapper.find('[data-test="after-hours-line"]').exists()).toBe(false)
		expect(wrapper.text()).not.toContain("Outside opening hours")
		expect(wrapper.find("p").exists()).toBe(false)
	})
})

describe("the card buttons", () => {
	it("are one per card, in the order given, the permanent card last", () => {
		theRow()

		expect(tabs().map((tab) => tab.attributes("data-card"))).toEqual([
			"Lunch",
			"Saturday",
			"Permanent items",
		])
		expect(tabs()[0].text()).toContain("Lunch")
		expect(tabs()[1].text()).toContain("Saturday service")
	})

	it("tell the one that is selected", () => {
		theRow({ selected: "Saturday" })

		const selected = wrapper
			.findAll('[data-test="card-button"]')
			.map((button) => button.attributes("aria-pressed"))
		expect(selected).toEqual(["false", "true", "false"])
	})

	it("say which card was picked", async () => {
		theRow()

		await wrapper.findAll('[data-test="card-button"]')[2].trigger("click")

		expect(wrapper.emitted("select")).toEqual([["Permanent items"]])
	})

	it("show the permanent card under the label of the system, not its stored English name", () => {
		theRow({
			cards: [{ ...PERMANENT, card_name: "Permanent items - The Bistro" }],
		})

		expect(tabs()[0].text()).toContain("Permanent items")
		expect(tabs()[0].text()).not.toContain("The Bistro")
	})
})

describe("a card opened by hand", () => {
	it("carries a mark on its button, and the cards of the hours do not", () => {
		theRow()

		const marks = tabs().map((tab) =>
			tab.find('[data-test="by-hand-mark"]').exists(),
		)
		expect(marks).toEqual([false, true, false])
		expect(
			tabs()[1].find('[data-test="by-hand-mark"]').attributes("title"),
		).toBe("Opened by hand")
	})

	it("has a « × » beside its button, and the cards of the hours have none", () => {
		theRow()

		const closers = tabs().map((tab) =>
			tab.find('[data-test="close-card"]').exists(),
		)
		expect(closers).toEqual([false, true, false])
		const close = tabs()[1].find('[data-test="close-card"]')
		expect(close.attributes("aria-label")).toBe("Close this card")
		expect(close.element.tagName).toBe("BUTTON")
	})

	it("is closed by its « × », which does not select it", async () => {
		theRow()

		await tabs()[1].find('[data-test="close-card"]').trigger("click")

		expect(wrapper.emitted("close-card")).toEqual([["Saturday"]])
		expect(wrapper.emitted("select")).toBeUndefined()
	})

	it("is selected by its button, which does not close it", async () => {
		theRow()

		await tabs()[1].find('[data-test="card-button"]').trigger("click")

		expect(wrapper.emitted("select")).toEqual([["Saturday"]])
		expect(wrapper.emitted("close-card")).toBeUndefined()
	})
})

describe("the end of the row", () => {
	it("carries the « ⋯ » that fetches another card, after the buttons", () => {
		theRow()

		const html = wrapper.html()
		expect(wrapper.find('[data-test="card-more-menu-stub"]').exists()).toBe(
			true,
		)
		expect(html.lastIndexOf('data-test="card-tab"')).toBeLessThan(
			html.indexOf("card-more-menu-stub"),
		)
	})

	it("keeps the « ⋯ » outside the scrolling buttons, so that its list is not cut off", () => {
		theRow()

		const scroller = wrapper.find('[data-test="card-tabs-scroller"]')
		expect(scroller.classes()).toContain("overflow-x-auto")
		expect(scroller.find('[data-test="card-more-menu-stub"]').exists()).toBe(
			false,
		)
	})

	it("lets the screen add its own button at the end of the buttons", () => {
		theRow({}, { trailing: '<button data-test="qr">QR</button>' })

		expect(
			wrapper
				.find('[data-test="card-tabs-scroller"] [data-test="qr"]')
				.exists(),
		).toBe(true)
	})
})
