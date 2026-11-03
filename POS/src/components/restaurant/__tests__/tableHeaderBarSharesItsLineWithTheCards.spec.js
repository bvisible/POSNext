/**
 * //// Neoffice — added file (no upstream equivalent). The header bar of the open table carries the buttons of the cards (NeoResto lot 1, product owner, 03.11.2026: « fusionner le bandeau et
 * //// la ligne des cartes »): they stand in its `middle` slot, between the name and QR / Back on a wide pane, under them on a narrow one. The bar measures itself (jsdom lays nothing out, so the
 * //// width it reads is set by hand). Nothing is drawn for the slot where the page puts nothing in it, and the page puts the cards in the bar and the search at the end of the families.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({ FeatherIcon: { props: ["name"], template: "<i />" } }))

const { default: TableHeaderBar } = await import("../TableHeaderBar.vue")

let wrapper
let width = 1200
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")

function bar(slots = { middle: '<div data-test="the-cards" />' }, props = {}) {
	Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width })
	wrapper = mount(TableHeaderBar, {
		props: { title: "T1", itemCount: 0, kdsStatus: "Pending", kdsStatusLabel: "Pending", showQr: true, ...props },
		slots,
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}
const theBar = () => wrapper.get('[data-test="table-header-bar"]')
const middle = () => wrapper.find('[data-test="table-header-middle"]')

afterEach(() => {
	wrapper?.unmount()
	if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original)
})

describe("the header bar with the buttons of the cards", () => {
	it("puts them between the name and QR / Back", () => {
		bar()

		const children = [...theBar().element.children]
		expect(children[0].textContent).toContain("T1")
		expect(children[1]).toBe(middle().element)
		expect(children[1].querySelector('[data-test="the-cards"]')).not.toBeNull()
		expect(children[2].querySelector('[data-test="table-qr-button"]')).not.toBeNull()
	})

	it("shares one line with the name and the buttons on a wide pane, the cards taking what is left", async () => {
		width = 1155
		bar()
		await nextTick()

		expect(theBar().classes()).toContain("flex-nowrap")
		expect(middle().classes()).toContain("flex-1")
		expect(middle().classes()).not.toContain("basis-full")
	})

	it("goes under them on a narrow pane, as a line of its own", async () => {
		width = 420
		bar()
		await nextTick()

		expect(theBar().classes()).toContain("flex-wrap")
		expect(middle().classes()).toEqual(expect.arrayContaining(["order-last", "basis-full"]))
	})

	it("draws no group for the cards where the page has none to show", () => {
		bar({})

		expect(middle().exists()).toBe(false)
	})
})

describe("the till's page", () => {
	const page = readFileSync(path.resolve(__dirname, "../../../pages/POSSale.vue"), "utf8")

	it("puts the buttons of the cards in the bar, only when the restaurant has a card to show", () => {
		const slot = page.match(/<template v-if="restaurantStore\.shownCards\.length > 0" #middle>[\s\S]*?<\/template>/)[0]

		expect(slot).toContain("<RestaurantCardTabs")
		expect(page.match(/<RestaurantCardTabs\b/g)).toHaveLength(1)
	})

	it("puts the search and the grid / list switch at the end of the families", () => {
		const chips = page.match(/<CardFamilyChips\s+:families="cardCategories"[\s\S]*?<\/CardFamilyChips>/)[0]

		expect(chips).toContain("<template #aside>")
		expect(chips).toContain("<CardSearchBar")
		expect(page.match(/<CardSearchBar\b/g)).toHaveLength(1)
	})
})
