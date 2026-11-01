/**
 * //// Neoffice — added file (no upstream equivalent). The « Install the app » entry of the user's menu (NeoRestau lot 1, kitchen test of 01.11): the browser
 * //// sends its install invitation (`beforeinstallprompt`) ONCE, when the page loads, and the install badge is only drawn in the items view, so a waiter who
 * //// looks at the tables never saw the offer. The invitation is now kept at module level for whoever asks later, and a browser that offers none gets the way
 * //// to do it by hand.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h } from "vue"

function setStandalone(on) {
	window.matchMedia = vi.fn().mockImplementation((query) => ({
		matches: on && query.includes("standalone"),
		media: query,
		addEventListener() {},
		removeEventListener() {},
	}))
}

function setUserAgent(value) {
	Object.defineProperty(window.navigator, "userAgent", { value, configurable: true })
}

async function entry() {
	const { useInstallEntry } = await import("../usePWAInstall")
	let api
	const wrapper = mount(
		defineComponent({
			setup() {
				api = useInstallEntry()
				return () => h("div")
			},
		}),
	)
	return { api, wrapper }
}

function invitation(outcome = "accepted") {
	const event = new Event("beforeinstallprompt", { cancelable: true })
	event.prompt = vi.fn(async () => {})
	event.userChoice = Promise.resolve({ outcome })
	return event
}

let wrapper
beforeEach(() => {
	vi.resetModules()
	setStandalone(false)
	setUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/120")
})
afterEach(() => wrapper?.unmount())

describe("the install entry of the user's menu", () => {
	it("keeps the browser's invitation for a menu drawn after it arrived", async () => {
		await import("../usePWAInstall")
		const event = invitation()
		window.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)

		const made = await entry()
		wrapper = made.wrapper
		expect(made.api.canInstall.value).toBe(true)

		const result = await made.api.install()

		expect(event.prompt).toHaveBeenCalledTimes(1)
		expect(result).toEqual({ done: true })
	})

	it("is offered on a phone whose browser sent no invitation, and then says how to install by hand", async () => {
		setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile")
		const made = await entry()
		wrapper = made.wrapper
		expect(made.api.canInstall.value).toBe(true)

		expect(await made.api.install()).toEqual({ manual: true })
	})

	it("is not offered on a desktop browser that sent no invitation", async () => {
		const made = await entry()
		wrapper = made.wrapper

		expect(made.api.canInstall.value).toBe(false)
	})

	it("is not offered once the app is installed and running as an app", async () => {
		setStandalone(true)
		await import("../usePWAInstall")
		window.dispatchEvent(invitation())
		const made = await entry()
		wrapper = made.wrapper

		expect(made.api.canInstall.value).toBe(false)
	})

	it("says nothing was done when the visitor turns the invitation down", async () => {
		await import("../usePWAInstall")
		window.dispatchEvent(invitation("dismissed"))
		const made = await entry()
		wrapper = made.wrapper

		expect(await made.api.install()).toEqual({ done: false })
	})
})
