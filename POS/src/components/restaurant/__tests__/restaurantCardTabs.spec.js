/**
 * //// Neoffice — added file (no upstream equivalent). The row of card buttons of the order screen (NeoRestau lot 1,
 * //// task 25): one button per card; one short muted line above them says that the hours are over and whose card is
 * //// still there; a card opened by hand carries a mark and a « × »; the « ⋯ » that fetches another card ends the row.
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
const line = () => wrapper.find('[data-test="after-hours-line"]')

afterEach(() => wrapper?.unmount())

describe("the line above the card buttons", () => {
	it("is not there during the hours", () => {
		theRow({ afterHours: false, serviceLabel: "Lunch" })

		expect(line().exists()).toBe(false)
	})

	it("says that the hours are over and whose card is still there, outside the hours", () => {
		theRow({ afterHours: true, serviceLabel: "Lunch" })

		expect(line().text()).toBe(
			"Outside opening hours · card of the Lunch service",
		)
	})

	it("shows the label of the slot as it was typed", () => {
		theRow({ afterHours: true, serviceLabel: "Dîner d'été  (terrasse)" })

		expect(line().text()).toContain("Dîner d'été  (terrasse)")
	})

	it("does not name a service that has no label", () => {
		theRow({ afterHours: true, serviceLabel: null })

		expect(line().text()).toBe(
			"Outside opening hours · card of the last service",
		)
	})

	it("is one short muted line, above the buttons", () => {
		theRow({ afterHours: true, serviceLabel: "Lunch" })

		const html = wrapper.html()
		expect(html.indexOf('data-test="after-hours-line"')).toBeLessThan(
			html.indexOf('data-test="card-tab"'),
		)
		expect(line().classes()).toContain("text-gray-500")
		expect(wrapper.findAll('[data-test="after-hours-line"]')).toHaveLength(1)
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
