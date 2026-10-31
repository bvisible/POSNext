/**
 * //// Neoffice — added file (no upstream equivalent). The shell of a ticket opened full screen (NeoRestau lot 1, task 38a-3, ruling 107 layer 3): a scrim and a dialog teleported to the body, a
 * //// tap on the scrim and Escape ask to close, a tap inside does not, the focus goes in and stays in, and goes back where it was when the shell goes. What is inside is the card's own business
 * //// (kdsTicketFullScreen.spec.js, runnerTicketFullScreen.spec.js); here it is a pair of buttons.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"
import TicketFullScreen from "../TicketFullScreen.vue"

let opened = []
function show(props = {}) {
	const wrapper = mount(TicketFullScreen, {
		props: { label: "Table 12", ...props },
		slots: {
			default:
				'<button data-test="first">First</button><button data-test="second">Second</button>',
		},
		attachTo: document.body,
	})
	opened.push(wrapper)
	return wrapper
}
const scrim = () =>
	document.body.querySelector('[data-test="fullscreen-scrim"]')
const dialog = () =>
	document.body.querySelector('[data-test="ticket-fullscreen"]')
const inside = (name) => document.body.querySelector(`[data-test="${name}"]`)
const key = (name, extra = {}) =>
	new KeyboardEvent("keydown", {
		key: name,
		bubbles: true,
		cancelable: true,
		...extra,
	})

afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
	document.body.innerHTML = ""
	vi.restoreAllMocks()
})

describe("the shell of the full-screen ticket", () => {
	it("is a modal dialog in a scrim over the whole screen, in the page's body, holding what it is given", async () => {
		const wrapper = show()
		await nextTick()

		expect(wrapper.element.contains?.(dialog())).toBeFalsy()
		expect(scrim().parentElement).toBe(document.body)
		expect(dialog().parentElement).toBe(scrim())
		expect(dialog().getAttribute("role")).toBe("dialog")
		expect(dialog().getAttribute("aria-modal")).toBe("true")
		expect(dialog().getAttribute("aria-label")).toBe("Table 12")
		expect(dialog().contains(inside("first"))).toBe(true)
		expect(inside("second")).not.toBeNull()
	})

	it("covers the screen's dynamic height, as the pages do, so that a tablet browser's toolbar never cuts it", async () => {
		show()
		await nextTick()

		const classes = scrim().className
		expect(classes).toContain("fixed")
		expect(classes).toContain("inset-x-0")
		expect(classes).toContain("top-0")
		expect(classes).toContain("h-screen")
		expect(classes).toContain("supports-[height:100dvh]:h-dvh")
	})

	it("has no label when none is given, rather than an empty one", async () => {
		show({ label: "" })
		await nextTick()

		expect(dialog().hasAttribute("aria-label")).toBe(false)
	})

	it("asks to close on a tap on the scrim, and only there", async () => {
		const wrapper = show()
		await nextTick()

		inside("first").click()
		dialog().click()
		expect(wrapper.emitted("close")).toBeUndefined()

		scrim().click()
		expect(wrapper.emitted("close")).toHaveLength(1)
	})

	it("asks to close on Escape, once, wherever the focus is", async () => {
		const wrapper = show()
		await nextTick()

		document.dispatchEvent(key("Escape"))

		expect(wrapper.emitted("close")).toHaveLength(1)
	})

	it("does not close on another key", async () => {
		const wrapper = show()
		await nextTick()

		document.dispatchEvent(key("Enter"))
		document.dispatchEvent(key("a"))

		expect(wrapper.emitted("close")).toBeUndefined()
	})

	it("takes the focus when it opens, on the dialog itself", async () => {
		show()
		await nextTick()
		await nextTick()

		expect(document.activeElement).toBe(dialog())
		expect(dialog().getAttribute("tabindex")).toBe("-1")
	})

	it("keeps the focus in: Tab from the last control goes to the first, Shift+Tab from the first or from the dialog to the last", async () => {
		show()
		await nextTick()
		const first = inside("first")
		const second = inside("second")

		second.focus()
		const forward = key("Tab")
		second.dispatchEvent(forward)
		expect(forward.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(first)

		const backward = key("Tab", { shiftKey: true })
		first.dispatchEvent(backward)
		expect(backward.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(second)

		dialog().focus()
		const fromTheDialog = key("Tab", { shiftKey: true })
		dialog().dispatchEvent(fromTheDialog)
		expect(document.activeElement).toBe(second)
	})

	it("leaves Tab alone in the middle of the controls", async () => {
		show()
		await nextTick()
		inside("first").focus()

		const tab = key("Tab")
		inside("first").dispatchEvent(tab)

		expect(tab.defaultPrevented).toBe(false)
	})

	it("pulls the focus back when it goes to something behind the dialog", async () => {
		const outside = document.createElement("button")
		document.body.appendChild(outside)
		show()
		await nextTick()

		outside.focus()
		await nextTick()

		expect(
			dialog().contains(document.activeElement) ||
				document.activeElement === dialog(),
		).toBe(true)
	})

	it("gives the focus back to where it was when it opened, and stops listening to the keyboard", async () => {
		const opener = document.createElement("button")
		document.body.appendChild(opener)
		opener.focus()
		const wrapper = show()
		await nextTick()
		await nextTick()
		expect(document.activeElement).toBe(dialog())

		wrapper.unmount()
		opened = []

		expect(document.activeElement).toBe(opener)
		expect(scrim()).toBeNull()
		// Escape no longer reaches anything
		const closed = vi.fn()
		document.addEventListener("keydown", closed)
		document.dispatchEvent(key("Escape"))
		expect(closed).toHaveBeenCalledTimes(1)
	})

	it("does not try to give the focus back to something that has left the page (the strip of a ticket that was delivered meanwhile)", async () => {
		const opener = document.createElement("button")
		document.body.appendChild(opener)
		opener.focus()
		const wrapper = show()
		await nextTick()
		const focus = vi.spyOn(opener, "focus")
		opener.remove()

		wrapper.unmount()
		opened = []

		expect(focus).not.toHaveBeenCalled()
	})
})
