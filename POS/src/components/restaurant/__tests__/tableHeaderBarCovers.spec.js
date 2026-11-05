/**
 * //// Neoffice — added file (no upstream equivalent). The people seated at the table, in the header bar of the open table (NeoResto lot 1, covers): a pastille « 3 / 4 » (people / seats) with a people icon, a dash while nobody
 * //// said, whose press asks the number (the page opens the dialog). A button says the action and a badge says the state: the pastille shows the state, its title says the action. It sits on the left with the name, so that QR and
 * //// Back keep the right edge, it is a 44 px target on a phone, and a takeaway (no table) has none. The counter of portions per course goes in a thin row under the bar through the `counter` slot.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({
	FeatherIcon: { props: ["name"], template: '<i :data-icon="name" />' },
}))

const { default: TableHeaderBar } = await import("../TableHeaderBar.vue")

let wrapper
function bar(props = {}, slots = {}) {
	wrapper = mount(TableHeaderBar, {
		props: {
			title: "T1",
			itemCount: 3,
			kdsStatus: "Pending",
			kdsStatusLabel: "Pending",
			showQr: true,
			...props,
		},
		slots,
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}
const chip = () => wrapper.find('[data-test="covers-chip"]')
const theBar = () => wrapper.find('[data-test="table-header-bar"]').element

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

describe("the people pastille of the header bar", () => {
	it("shows « 3 / 4 » with a people icon when the people and the seats are known", () => {
		bar({ covers: 3, seats: 4 })

		expect(chip().exists()).toBe(true)
		expect(chip().find('[data-test="covers-chip-value"]').text()).toBe("3 / 4")
		expect(chip().find('[data-icon="users"]').exists()).toBe(true)
	})

	it("shows the people alone when the seats are unknown", () => {
		bar({ covers: 3, seats: null })
		expect(chip().find('[data-test="covers-chip-value"]').text()).toBe("3")
		wrapper.unmount()

		bar({ covers: 3, seats: 0 })
		expect(chip().find('[data-test="covers-chip-value"]').text()).toBe("3")
	})

	it("shows a dash while nobody said, with the people icon", () => {
		bar({ covers: null, seats: 4 })

		expect(chip().find('[data-test="covers-chip-empty"]').exists()).toBe(true)
		expect(chip().find('[data-test="covers-chip-value"]').exists()).toBe(false)
		expect(chip().text()).toBe("–")
		expect(chip().find('[data-icon="users"]').exists()).toBe(true)
	})

	it("shows a dash for a number that is no number of people", () => {
		for (const covers of [0, 100, -2, 2.5]) {
			bar({ covers, seats: 4 })
			expect(
				chip().find('[data-test="covers-chip-empty"]').exists(),
				String(covers),
			).toBe(true)
			wrapper.unmount()
		}
	})

	it("is there with a dash when no props about the people are given at all", () => {
		bar()

		expect(chip().exists()).toBe(true)
		expect(chip().text()).toBe("–")
	})

	it("says the action in its title, a verb, not the state it shows", () => {
		bar({ covers: null })
		expect(chip().attributes("title")).toBe("Set people")
		expect(chip().attributes("aria-label")).toBe("Set people")
		wrapper.unmount()

		bar({ covers: 3, seats: 4 })
		expect(chip().attributes("title")).toBe("Change the number of people")
		expect(chip().attributes("aria-label")).toBe("Change the number of people")
		// the badge's text and the button's title are never the same words
		expect(chip().text()).not.toBe(chip().attributes("title"))
	})

	it("asks the number when it is pressed, and does nothing else", async () => {
		bar({ covers: 3, seats: 4 })

		await chip().trigger("click")

		expect(wrapper.emitted("covers")).toHaveLength(1)
		expect(wrapper.emitted("qr")).toBeUndefined()
		expect(wrapper.emitted("back")).toBeUndefined()
	})

	it("asks the number from the dash too", async () => {
		bar({ covers: null })

		await chip().trigger("click")

		expect(wrapper.emitted("covers")).toHaveLength(1)
	})

	it("is a 44 px touch target on a phone and as high as QR and Back from a tablet up", () => {
		bar({ covers: 3, seats: 4 })

		expect(chip().element.tagName).toBe("BUTTON")
		expect(chip().attributes("type")).toBe("button")
		expect(chip().classes()).toEqual(
			expect.arrayContaining([
				"min-h-[44px]",
				"min-w-[44px]",
				"touch-manipulation",
				"sm:h-[34px]",
				"sm:min-h-[34px]",
			]),
		)
	})

	it("is white with ink like the other buttons of the bar, never a coloured one", () => {
		bar({ covers: 3, seats: 4 })

		const classes = chip().classes().join(" ")
		expect(classes).toContain("bg-white")
		expect(classes).toContain("text-[#141414]")
		expect(classes).not.toMatch(
			/\b(?:bg|text|border)-(?:blue|indigo|violet|purple|emerald|green|sky|cyan)/,
		)
	})

	it("sits on the left with the name, so that QR and Back keep the right edge", () => {
		bar({ covers: 3, seats: 4 })

		const left = theBar().firstElementChild
		expect(left.contains(chip().element)).toBe(true)
		const right = theBar().lastElementChild
		expect([...right.children].map((child) => child.dataset.test)).toEqual([
			"table-qr-button",
			"table-back-button",
		])
		expect(right.contains(chip().element)).toBe(false)
	})

	it("is not hidden at any breakpoint, so a phone keeps it in view", () => {
		bar({ covers: 3, seats: 4 })

		const hiding = /^(?:[a-z0-9-]+:)*(?:hidden|invisible|sr-only|collapse)$/
		for (
			let node = chip().element;
			node && node !== theBar();
			node = node.parentElement
		) {
			expect(
				(node.getAttribute("class") ?? "")
					.split(/\s+/)
					.filter((name) => hiding.test(name)),
			).toEqual([])
		}
	})

	it("is not on a takeaway ticket: it has no table to seat people at", () => {
		bar({ isTakeaway: true, showQr: false, covers: 3, seats: 4 })

		expect(chip().exists()).toBe(false)
	})
})

describe("the counter row under the header bar", () => {
	it("is drawn under the bar when the page fills the counter slot, and outside the bar", () => {
		bar(
			{ covers: 3 },
			{ counter: '<ul data-test="the-counter"><li>Starters 3/3</li></ul>' },
		)

		const row = wrapper.find('[data-test="table-header-counter"]')
		expect(row.exists()).toBe(true)
		expect(row.find('[data-test="the-counter"]').exists()).toBe(true)
		expect(theBar().contains(row.element)).toBe(false)
		// right after the bar: the row of the cards and the QR / Back stay where they were
		expect(theBar().nextElementSibling).toBe(row.element)
	})

	it("is not drawn at all without a counter, not even an empty strip", () => {
		bar({ covers: 3 })

		expect(wrapper.find('[data-test="table-header-counter"]').exists()).toBe(
			false,
		)
	})

	it("does not take a place in the bar itself: QR and Back are still the last group of the bar", () => {
		bar({ covers: 3 }, { counter: "<span>counter</span>" })

		const right = theBar().lastElementChild
		expect([...right.children].map((child) => child.dataset.test)).toEqual([
			"table-qr-button",
			"table-back-button",
		])
	})
})
