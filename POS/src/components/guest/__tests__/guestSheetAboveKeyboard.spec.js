/**
 * //// Neoffice — added file (no upstream equivalent). The sign-in sheet of the QR page stops above the phone's keyboard (NeoResto lot 1, product owner, 03.11.2026: on his phone the
 * //// keyboard covered the « Send me a code » button). The browser draws the keyboard over the page without shrinking it, so the page that is left to see is the visual viewport:
 * //// the sheet is lifted by what the keyboard takes from it, and by nothing else (not the address bar, not a page the person has zoomed into).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

const { default: GuestAccountSheet } = await import("../GuestAccountSheet.vue")
const { keyboardInsetOf } = await import("@/composables/useKeyboardInset")

describe("what the keyboard covers of the page", () => {
	it("is nothing when the browser gives no visual viewport", () => {
		expect(keyboardInsetOf(undefined, 800)).toBe(0)
		expect(keyboardInsetOf(null, 800)).toBe(0)
	})

	it("is nothing while the whole page is visible", () => {
		expect(keyboardInsetOf({ height: 800, offsetTop: 0, scale: 1 }, 800)).toBe(0)
	})

	it("is what the keyboard takes from the bottom (Android: the page keeps its height, the visual viewport shrinks)", () => {
		expect(keyboardInsetOf({ height: 1050, offsetTop: 0, scale: 1 }, 2000)).toBe(950)
	})

	it("counts the scroll of the visual viewport (iOS shows the focused field by scrolling the visual viewport)", () => {
		expect(keyboardInsetOf({ height: 400, offsetTop: 100, scale: 1 }, 800)).toBe(300)
	})

	it("is nothing for the address bar showing or hiding, which is not a keyboard", () => {
		expect(keyboardInsetOf({ height: 744, offsetTop: 0, scale: 1 }, 800)).toBe(0)
	})

	it("is nothing for a page the person has zoomed into", () => {
		expect(keyboardInsetOf({ height: 400, offsetTop: 0, scale: 2 }, 800)).toBe(0)
	})
})

describe("the sign-in sheet above the keyboard", () => {
	let viewport
	let wrapper

	const mountSheet = (props = {}) => {
		wrapper = mount(GuestAccountSheet, { props, global: { plugins: [createPinia()], mocks: { __: globalThis.__ } } })
		return wrapper
	}
	const style = () => wrapper.get('[data-test="account-sheet"]').attributes("style") || ""
	const moveViewport = async (changes) => {
		Object.assign(viewport, changes)
		viewport.dispatchEvent(new Event("resize"))
		await nextTick()
	}

	beforeEach(() => {
		setActivePinia(createPinia())
		Object.defineProperty(window, "innerHeight", { value: 2000, configurable: true })
		viewport = Object.assign(new EventTarget(), { height: 2000, offsetTop: 0, scale: 1 })
		Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true })
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		delete window.visualViewport
	})

	it("is drawn to the bottom of the page while there is no keyboard", () => {
		mountSheet()

		expect(style()).not.toContain("bottom")
	})

	it("is lifted by what the keyboard covers, so its button stays in sight", async () => {
		mountSheet()

		await moveViewport({ height: 1050 })

		expect(style()).toContain("bottom: 950px")
	})

	it("comes back down when the keyboard closes", async () => {
		mountSheet()
		await moveViewport({ height: 1050 })

		await moveViewport({ height: 2000 })

		expect(style()).not.toContain("bottom")
	})

	it("is lifted at once when it opens with the keyboard already there", async () => {
		viewport.height = 1050

		mountSheet()
		await nextTick()

		expect(style()).toContain("bottom: 950px")
	})

	it("scrolls inside itself when the room left above the keyboard is short", () => {
		mountSheet()

		const panel = wrapper.get('[data-test="account-sheet"] > div')
		expect(panel.classes()).toEqual(expect.arrayContaining(["max-h-full", "overflow-y-auto"]))
	})

	it("is not lifted when it is a card of the page (the takeaway page)", async () => {
		mountSheet({ embedded: true })

		await moveViewport({ height: 1050 })

		expect(style()).not.toContain("bottom")
	})

	it("stops listening to the viewport once it is gone", async () => {
		const removed = vi.spyOn(viewport, "removeEventListener")
		mountSheet()

		wrapper.unmount()
		wrapper = null

		expect(removed).toHaveBeenCalledWith("resize", expect.any(Function))
		expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function))
	})
})
