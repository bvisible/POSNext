/**
 * //// Neoffice — added file (no upstream equivalent). The QR button of a table sits in the header bar of the open table,
 * //// beside "Back" (NeoRestau lot 1). The product owner: a waiter shows the table's code on his PHONE to the guests,
 * //// who scan it, so the QR of the table must be easy to reach on a smartphone. The button used to be the last one of the
 * //// row of the restaurant's cards, where a few cards (or a longer label) pushed it off a phone's screen; in the header
 * //// bar it is always in view, whatever the width, and it is a 44 px touch target with the QR icon and the word.
 * ////
 * //// jsdom does not lay a page out, so "at every width" is asserted for what decides it in the source: the width of the
 * //// window is set to each size and the bar is mounted there, and neither the button nor any of its parents carries a
 * //// class that hides it at any breakpoint (`hidden`, `sm:hidden`, `max-sm:invisible`...), while the group it sits in
 * //// never shrinks and never wraps away from "Back". The look of the bar at 390 px is checked in a real browser.
 * ////
 * //// POSSale.vue is too large to mount here, so the part of this that belongs to the page (the button is out of the row of
 * //// the cards, the bar is bound to the click path of the QR button) is read from its source in
 * //// pages/__tests__/tableQRShowsTheCodeAtOnce.spec.js.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

// The frappe-ui widgets are not under test: a button and an icon that say what they were given
vi.mock("frappe-ui", () => ({
	Button: {
		props: ["variant", "size"],
		template:
			'<button type="button" data-test="table-back-button"><slot /></button>',
	},
	FeatherIcon: {
		props: ["name"],
		template: '<i :data-icon="name" />',
	},
}))

const { default: TableHeaderBar } = await import("../TableHeaderBar.vue")

const LABEL = "Generate QR code for guest ordering"
// A phone upright, a phone narrow, a large phone, a small tablet, a tablet, a laptop, a desktop
const WIDTHS = [320, 360, 390, 430, 640, 768, 1024, 1366, 1920]

let wrapper

function bar(props = {}) {
	wrapper = mount(TableHeaderBar, {
		props: {
			title: "T1",
			itemCount: 3,
			kdsStatus: "Pending",
			kdsStatusLabel: "Pending",
			showQr: true,
			...props,
		},
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}

function atWidth(width) {
	window.innerWidth = width
	window.dispatchEvent(new Event("resize"))
}

/** Every class that hides an element at some breakpoint: `hidden`, `sm:hidden`, `max-sm:invisible`... (not `overflow-hidden`). */
const HIDING = /^(?:[a-z0-9-]+:)*(?:hidden|invisible|sr-only|collapse)$/

/** The classes of an element and of every parent up to the root of the bar. */
function classesUpTo(element, root) {
	const classes = []
	for (let node = element; node; node = node.parentElement) {
		classes.push(
			...(node.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
		)
		if (node === root) break
	}
	return classes
}

/** The bar itself: the component opens with comments, so its root is a fragment and the wrapper's element is the page around it. */
const theBar = () => wrapper.find('[data-test="table-header-bar"]').element
const qrButton = () => wrapper.find('[data-test="table-qr-button"]')
const backButton = () => wrapper.find('[data-test="table-back-button"]')

beforeEach(() => {
	window.innerWidth = 1024
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

describe("the header bar of an open table", () => {
	it.each(WIDTHS)(
		"carries the QR button at %i px: nothing hides it at any breakpoint",
		(width) => {
			atWidth(width)
			bar()

			expect(qrButton().exists()).toBe(true)
			const classes = classesUpTo(qrButton().element, theBar())
			expect(classes.filter((name) => HIDING.test(name))).toEqual([])
			// Nor is it pushed off the bar: its group keeps its size and the bar is one row
			expect(classes).toContain("flex-shrink-0")
			expect(theBar().className).not.toMatch(/\boverflow-(x-)?(auto|scroll)\b/)
		},
	)

	it("is the first thing of the right-hand group, beside Back, which keeps the right edge", () => {
		bar()

		const group = qrButton().element.parentElement
		expect([...group.children].map((child) => child.dataset.test)).toEqual([
			"table-qr-button",
			"table-back-button",
		])
		// The group is the last one of the bar, and never wraps: a long table name wraps on the left, not this
		expect(group).toBe(theBar().lastElementChild)
		expect(group.className).toContain("flex-shrink-0")
		expect(group.className).not.toContain("flex-wrap")
	})

	it("lets the name and the kitchen status wrap on the left, so that a narrow phone keeps both buttons in view", () => {
		bar({
			title: "Terrace table number twelve",
			kdsStatusLabel: "Preparing",
			kdsStatus: "Preparing",
		})

		const left = theBar().firstElementChild
		expect(left.className).toContain("min-w-0")
		expect(left.className).toContain("flex-wrap")
		expect(left.textContent).toContain("Terrace table number twelve")
		expect(left.textContent).toContain("Preparing")
		expect(left.contains(qrButton().element)).toBe(false)
	})

	it("is a 44 px touch target with the QR icon and the word", () => {
		bar()

		const button = qrButton()
		expect(button.element.tagName).toBe("BUTTON")
		expect(button.attributes("type")).toBe("button")
		expect(button.classes()).toEqual(
			expect.arrayContaining([
				"min-h-[44px]",
				"min-w-[44px]",
				"touch-manipulation",
			]),
		)
		expect(button.find("svg").exists()).toBe(true)
		expect(button.text()).toBe("QR")
		// A screen reader and a long press say what it does, as the old button did
		expect(button.attributes("title")).toBe(LABEL)
		expect(button.attributes("aria-label")).toBe(LABEL)
	})

	it("is white with ink, like the other buttons of the till, never a coloured one", () => {
		bar()

		const classes = qrButton().classes().join(" ")
		expect(classes).toContain("bg-white")
		expect(classes).toContain("text-[#141414]")
		expect(classes).not.toMatch(
			/\b(?:bg|text|border)-(?:blue|indigo|violet|purple|emerald|green|sky|cyan)/,
		)
	})

	it("asks for the code of the table when the button is pressed", async () => {
		bar()

		await qrButton().trigger("click")

		expect(wrapper.emitted("qr")).toHaveLength(1)
		expect(wrapper.emitted("back")).toBeUndefined()
	})

	it("closes the table when Back is pressed, and Back asks for no code", async () => {
		bar()

		await backButton().trigger("click")

		expect(wrapper.emitted("back")).toHaveLength(1)
		expect(wrapper.emitted("qr")).toBeUndefined()
		expect(backButton().text()).toBe("Back")
	})

	it("makes Back a button that is seen at a glance: solid ink with white words, an arrow, and a 44 px touch target (Daniel, 01.11)", () => {
		bar()

		const back = backButton()
		const classes = back.classes()
		// the ink of the design system, filled: it must not melt into the bar the way the grey "subtle" button did
		expect(classes).toEqual(expect.arrayContaining(["bg-[#141414]", "text-white"]))
		// a finger's size, never smaller than the QR button beside it
		expect(classes).toEqual(expect.arrayContaining(["min-h-[44px]", "min-w-[44px]", "touch-manipulation"]))
		expect(classes).toContain("font-semibold")
		// an arrow says it goes back
		expect(back.find("svg").exists()).toBe(true)
		expect(back.attributes("aria-label")).toBe("Back")
		expect(back.attributes("type")).toBe("button")
	})

	it("gives QR and Back the height of the « Permanent items » card button from a tablet up, and keeps the 44 px finger on a phone (Daniel, 01.11: « aligne la hauteur du bouton sur le bouton articles permanents »)", () => {
		bar()

		for (const button of [backButton(), qrButton()]) {
			const classes = button.classes()
			// the phone keeps the touch target; from the `sm` breakpoint the two buttons are as high as the card button below the bar
			expect(classes).toContain("min-h-[44px]")
			expect(classes).toEqual(expect.arrayContaining(["sm:h-[34px]", "sm:min-h-[34px]"]))
		}
		// the card button is `py-2` around a 12 px line with a 2 px border from `sm` up: 33.8 px, which 34 px stands for
		const sale = readFileSync(
			path.resolve(__dirname, "../../../pages/POSSale.vue"),
			"utf8",
		)
		expect(sale).toMatch(/py-1\.5 sm:py-2 rounded-neo-sm text-\[10px\] sm:text-xs/)
	})

	it("has no QR button when the table cannot show one, and keeps Back", () => {
		// QR ordering off for the restaurant, or a takeaway ticket (it has no table to scan)
		bar({ showQr: false })

		expect(qrButton().exists()).toBe(false)
		expect(wrapper.text()).not.toContain("QR")
		expect(backButton().exists()).toBe(true)
	})

	it("names the table, how many lines it holds and the kitchen's status, as the banner always did", () => {
		bar({
			title: "T7",
			itemCount: 12,
			kdsStatus: "Ready",
			kdsStatusLabel: "Ready",
		})

		expect(wrapper.find('[data-test="table-title"]').text()).toBe("T7")
		expect(wrapper.text()).toContain("12 items")
		expect(wrapper.text()).toContain("Ready")
		expect(wrapper.find('[data-icon="coffee"]').exists()).toBe(true)
	})

	it("names a takeaway ticket with the bag, not the table's cup", () => {
		bar({ title: "A-12", isTakeaway: true, showQr: false })

		expect(wrapper.find('[data-icon="shopping-bag"]').exists()).toBe(true)
		expect(wrapper.find('[data-icon="coffee"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="table-title"]').text()).toBe("A-12")
	})

	it("colours the kitchen status as the banner did: yellow pending, blue preparing, green otherwise", () => {
		const badge = () => wrapper.find(".rounded-full")
		bar({ kdsStatus: "Pending", kdsStatusLabel: "Pending" })
		expect(badge().classes()).toContain("bg-yellow-500")
		wrapper.unmount()

		bar({ kdsStatus: "Preparing", kdsStatusLabel: "Preparing" })
		expect(badge().classes()).toContain("bg-blue-500")
		wrapper.unmount()

		bar({ kdsStatus: "Ready", kdsStatusLabel: "Ready" })
		expect(badge().classes()).toContain("bg-green-500")
	})
})
