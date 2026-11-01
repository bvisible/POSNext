/**
 * //// Neoffice — added file (no upstream equivalent). The layer a screen at rest is drawn as (NeoRestau lot 1, task 47). A web page cannot switch the physical
 * //// screen off nor dim it, so a screen nobody touched for a while is covered by a near-black layer: a small clock, how many orders are waiting, and a moon,
 * //// in a dim warm grey readable in the dark. It is the same dark whatever the colour mode, it holds nothing to press (a touch wakes the screen, the page
 * //// swallows it), and it draws nothing at all when the screen is awake.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const { default: ScreenRestLayer } = await import("../ScreenRestLayer.vue")

let opened = []
function open(props = {}) {
	const wrapper = mount(ScreenRestLayer, {
		props: { resting: true, label: "3 orders waiting", ...props },
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	return wrapper
}

beforeEach(() => {
	opened = []
	vi.useFakeTimers()
	// A date with a known hour, local time
	vi.setSystemTime(new Date(2026, 10, 1, 14, 5, 20))
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
})

describe("the layer of a screen at rest", () => {
	it("draws nothing while the screen is awake", () => {
		const wrapper = open({ resting: false })

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
	})

	it("covers the whole screen, above everything the page draws, in the design system's black", () => {
		const wrapper = open()
		const layer = wrapper.get('[data-test="screen-rest"]')

		expect(layer.classes()).toEqual(
			expect.arrayContaining(["fixed", "inset-0", "z-[9999]", "bg-black"]),
		)
	})

	it("is the same dark whatever the colour mode: no class of it depends on `dark:`", () => {
		const html = open().get('[data-test="screen-rest"]').html()

		expect(html).not.toMatch(/dark:/)
		expect(html).not.toMatch(/\b(?:bg|text)-(?:white|gray-\d+)\b/)
	})

	it("writes in the dim warm grey of the dark ramp, the clock in Forum, with a moon", () => {
		const wrapper = open()

		expect(wrapper.get('[data-test="screen-rest"]').classes()).toContain(
			"text-ds-sand-400",
		)
		expect(wrapper.get('[data-test="rest-clock"]').classes()).toContain(
			"font-display",
		)
		expect(wrapper.find('[data-test="rest-moon"]').exists()).toBe(true)
	})

	it("shows the time of day, and the minute after it when the minute turns", async () => {
		const wrapper = open()
		expect(wrapper.get('[data-test="rest-clock"]').text()).toBe("14:05")

		await vi.advanceTimersByTimeAsync(60 * 1000)

		expect(wrapper.get('[data-test="rest-clock"]').text()).toBe("14:06")
	})

	it("shows how many orders are waiting, in the words the page gives it", () => {
		const wrapper = open({ label: "1 order waiting" })

		expect(wrapper.get('[data-test="rest-count"]').text()).toBe(
			"1 order waiting",
		)
	})

	it("tells how to wake it", () => {
		expect(open().get('[data-test="rest-hint"]').text()).toBe(
			"Touch the screen to wake it",
		)
	})

	it("holds nothing to press: a button under it is the page's, and a touch only wakes the screen", () => {
		const wrapper = open()

		expect(wrapper.findAll("button, a, input, select")).toHaveLength(0)
	})

	it("is named for a screen reader", () => {
		expect(
			open().get('[data-test="screen-rest"]').attributes("aria-label"),
		).toBe("Screen at rest")
	})

	it("stops reading the clock when it is gone: no timer is left behind", async () => {
		const wrapper = open()
		wrapper.unmount()
		opened = []

		expect(vi.getTimerCount()).toBe(0)
	})

	it("reads the clock only while it is drawn", async () => {
		const wrapper = open({ resting: false })
		expect(vi.getTimerCount()).toBe(0)

		await wrapper.setProps({ resting: true })
		expect(vi.getTimerCount()).toBeGreaterThan(0)

		await wrapper.setProps({ resting: false })
		expect(vi.getTimerCount()).toBe(0)
	})
})
