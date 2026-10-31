/**
 * //// Neoffice — added file (no upstream equivalent). The theme button of the kitchen and runner screens (NeoRestau lot 1, task 38a-2, ruling 131). A
 * //// tablet in dark because its system is dark gave the cook no way to change it: the screens have no user menu. One tap goes Auto, Light, Dark; a held
 * //// press names the three; the choice is the till's own (same key, same function).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const { default: ThemeButton } = await import("../ThemeButton.vue")

const KEY = "neocockpit-colormode"
let opened = []
function open(props = {}) {
	const wrapper = mount(ThemeButton, {
		props,
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	return wrapper
}
const button = (wrapper) => wrapper.get('[data-test="theme-button"]')
const html = () => document.documentElement

beforeEach(() => {
	opened = []
	localStorage.clear()
	html().removeAttribute("data-theme")
	html().classList.remove("dark")
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches: false,
			addEventListener() {},
			removeEventListener() {},
		})),
	)
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("the theme button", () => {
	it("is a button of 44 px that says the mode in use, Auto when nothing was ever chosen", () => {
		const wrapper = open()

		expect(button(wrapper).classes()).toEqual(
			expect.arrayContaining(["h-11", "w-11"]),
		)
		expect(button(wrapper).attributes("data-mode")).toBe("system")
		expect(button(wrapper).attributes("aria-label")).toBe("Theme: Auto")
	})

	it("opens on the mode kept on the device", () => {
		localStorage.setItem(KEY, "dark")

		expect(button(open()).attributes("aria-label")).toBe("Theme: Dark")
	})

	it("goes on to the next mode at each tap: Auto, Light, Dark, Auto, and paints the page each time", async () => {
		const wrapper = open()

		const seen = []
		for (let tap = 0; tap < 3; tap += 1) {
			await button(wrapper).trigger("click")
			seen.push([
				button(wrapper).attributes("data-mode"),
				localStorage.getItem(KEY),
				html().getAttribute("data-theme"),
				html().classList.contains("dark"),
			])
		}

		expect(seen).toEqual([
			["light", "light", "light", false],
			["dark", "dark", "dark", true],
			["system", "system", "light", false],
		])
	})

	it("draws a different icon for each mode", async () => {
		const wrapper = open()
		const icon = () => button(wrapper).get("svg").html()

		const system = icon()
		await button(wrapper).trigger("click")
		const light = icon()
		await button(wrapper).trigger("click")
		const dark = icon()

		expect(new Set([system, light, dark]).size).toBe(3)
	})

	it("keeps a tablet's choice on the device: it never touches a desk's theme", async () => {
		const fetched = vi.fn(async () => ({
			json: async () => ({ message: "cook@example.com" }),
		}))
		vi.stubGlobal("fetch", fetched)

		await button(open()).trigger("click")

		expect(fetched).not.toHaveBeenCalled()
	})

	it("keeps a desk user's choice on the account too, as the till's menu does", async () => {
		const fetched = vi.fn(async () => ({
			json: async () => ({ message: "cook@example.com" }),
		}))
		vi.stubGlobal("fetch", fetched)

		await button(open({ persistDeskTheme: true })).trigger("click")

		await vi.waitFor(() =>
			expect(fetched.mock.calls.map(([url]) => url)).toContain(
				"/api/method/frappe.client.set_value",
			),
		)
	})

	it("follows a change made elsewhere: the till's menu in another tab", async () => {
		const wrapper = open()
		localStorage.setItem(KEY, "dark")
		window.dispatchEvent(new StorageEvent("storage", { key: KEY }))
		await wrapper.vm.$nextTick()

		expect(button(wrapper).attributes("data-mode")).toBe("dark")
	})
})

describe("a held press", () => {
	it("opens the three modes with their names after half a second, the one in use marked, and the tap that ends the press does not change the mode", async () => {
		vi.useFakeTimers()
		const wrapper = open()

		await button(wrapper).trigger("pointerdown")
		expect(wrapper.find('[data-test="theme-menu"]').exists()).toBe(false)
		await vi.advanceTimersByTimeAsync(500)
		await button(wrapper).trigger("pointerup")
		await button(wrapper).trigger("click")

		const menu = wrapper.get('[data-test="theme-menu"]')
		expect(menu.findAll("button").map((choice) => choice.text())).toEqual([
			"Auto",
			"Light",
			"Dark",
		])
		expect(
			menu.get('[data-test="theme-system"]').attributes("aria-checked"),
		).toBe("true")
		expect(button(wrapper).attributes("data-mode")).toBe("system")
	})

	it("opens nothing for a press that is let go before", async () => {
		vi.useFakeTimers()
		const wrapper = open()

		await button(wrapper).trigger("pointerdown")
		await vi.advanceTimersByTimeAsync(200)
		await button(wrapper).trigger("pointerup")
		await button(wrapper).trigger("click")
		await vi.advanceTimersByTimeAsync(600)

		expect(wrapper.find('[data-test="theme-menu"]').exists()).toBe(false)
		expect(button(wrapper).attributes("data-mode")).toBe("light")
	})

	it("applies the one chosen in the menu, and closes it", async () => {
		vi.useFakeTimers()
		const wrapper = open()
		await button(wrapper).trigger("pointerdown")
		await vi.advanceTimersByTimeAsync(500)
		await button(wrapper).trigger("pointerup")
		await button(wrapper).trigger("click")

		await wrapper.get('[data-test="theme-dark"]').trigger("click")

		expect(localStorage.getItem(KEY)).toBe("dark")
		expect(html().classList.contains("dark")).toBe(true)
		expect(wrapper.find('[data-test="theme-menu"]').exists()).toBe(false)
	})

	it("closes on Escape and on a tap elsewhere", async () => {
		vi.useFakeTimers()
		const wrapper = open()
		await button(wrapper).trigger("pointerdown")
		await vi.advanceTimersByTimeAsync(500)
		await button(wrapper).trigger("pointerup")
		await button(wrapper).trigger("click")
		expect(wrapper.find('[data-test="theme-menu"]').exists()).toBe(true)

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('[data-test="theme-menu"]').exists()).toBe(false)
	})
})
