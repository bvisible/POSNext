/**
 * //// Neoffice — added file (no upstream equivalent). The till's header has a full-screen switch (NeoResto lot 1; product owner, 05.11.2026), drawn only where the browser can do it, that asks for the
 * //// whole page and follows the browser's own state.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s)
})

vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ currentShift: null }) }))
vi.mock("@/components/common/ActionButton.vue", () => ({ default: { template: "<button><slot /></button>" } }))
vi.mock("@/components/common/StatusBadge.vue", () => ({ default: { template: "<span />" } }))
vi.mock("@/components/common/UserMenu.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/components/common/LanguageSwitcher.vue", () => ({ default: { template: "<div />" } }))

const { default: POSHeader } = await import("../POSHeader.vue")

describe("the full-screen switch of the till's header", () => {
	let wrapper
	let element

	function header() {
		wrapper = mount(POSHeader, {
			props: { currentTime: "10:00", userName: "Cashier", isRestaurantMode: true },
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper.find('[data-test="fullscreen-toggle"]')
	}

	beforeEach(() => {
		element = null
		Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element })
		document.documentElement.requestFullscreen = vi.fn(async () => {
			element = document.documentElement
			document.dispatchEvent(new Event("fullscreenchange"))
		})
		document.exitFullscreen = vi.fn(async () => {
			element = null
			document.dispatchEvent(new Event("fullscreenchange"))
		})
	})
	afterEach(() => {
		wrapper?.unmount()
		delete document.documentElement.requestFullscreen
		delete document.exitFullscreen
	})

	it("is drawn where the browser can go full screen", () => {
		const button = header()

		expect(button.exists()).toBe(true)
		expect(button.attributes("aria-label")).toBe("Full screen")
		expect(button.attributes("aria-pressed")).toBe("false")
	})

	it("is not drawn where the browser has no such API (an iPhone's)", () => {
		delete document.documentElement.requestFullscreen

		expect(header().exists()).toBe(false)
	})

	it("asks for the whole page, then leaves it, and says which it is", async () => {
		const button = header()

		await button.trigger("click")
		await wrapper.vm.$nextTick()
		expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
		expect(button.attributes("aria-label")).toBe("Exit full screen")
		expect(button.attributes("aria-pressed")).toBe("true")

		await button.trigger("click")
		await wrapper.vm.$nextTick()
		expect(document.exitFullscreen).toHaveBeenCalledTimes(1)
		expect(button.attributes("aria-label")).toBe("Full screen")
	})

	it("follows the browser when full screen is left another way (Escape)", async () => {
		const button = header()
		await button.trigger("click")
		await wrapper.vm.$nextTick()

		element = null
		document.dispatchEvent(new Event("fullscreenchange"))
		await wrapper.vm.$nextTick()

		expect(button.attributes("aria-pressed")).toBe("false")
	})

	it("stays as it is when the browser refuses", async () => {
		document.documentElement.requestFullscreen = vi.fn(async () => {
			throw new Error("denied")
		})
		const button = header()

		await button.trigger("click")
		await wrapper.vm.$nextTick()

		expect(button.attributes("aria-pressed")).toBe("false")
	})
})
