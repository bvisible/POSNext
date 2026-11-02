/**
 * //// Neoffice — added file (no upstream equivalent). The restaurant till shows its tables as a list or as the floor
 * //// plan (NeoResto lot 1, task 26). On a phone (below 768 px) it opens on the list, on a tablet and a PC on the plan
 * //// as before; the waiter's choice is remembered on THIS device, in the browser's storage, and a storage that refuses
 * //// (a private window, a full or blocked one) never stops the till: the choice then lasts as long as the page.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, nextTick } from "vue"

const { useTablesView, TABLES_VIEW_KEY } = await import("../useTablesView.js")

function withWidth(width) {
	Object.defineProperty(window, "innerWidth", {
		value: width,
		configurable: true,
		writable: true,
	})
}

function mountView() {
	let state
	const Probe = defineComponent({
		setup() {
			state = useTablesView()
			return () => h("div")
		},
	})
	const wrapper = mount(Probe)
	return { wrapper, state }
}

describe("the tables shown as a list or as the plan", () => {
	const width = window.innerWidth

	beforeEach(() => localStorage.clear())
	afterEach(() => {
		withWidth(width)
		vi.restoreAllMocks()
	})

	it("opens on the list on a phone", () => {
		withWidth(390)
		const { state } = mountView()

		expect(state.isPhone.value).toBe(true)
		expect(state.view.value).toBe("list")
	})

	it("opens on the plan on a tablet and a PC, as before", () => {
		for (const size of [768, 1180, 1366]) {
			withWidth(size)
			const { state, wrapper } = mountView()
			expect([size, state.isPhone.value, state.view.value]).toEqual([
				size,
				false,
				"plan",
			])
			wrapper.unmount()
		}
	})

	it("remembers the waiter's choice on this device, and opens on it the next time", () => {
		withWidth(390)
		const first = mountView()
		first.state.setView("plan")
		expect(first.state.view.value).toBe("plan")
		expect(localStorage.getItem(TABLES_VIEW_KEY)).toBe("plan")
		first.wrapper.unmount()

		const next = mountView()
		expect(next.state.view.value).toBe("plan")
	})

	it("lets a tablet use the list too, and remembers it", () => {
		withWidth(1180)
		const tablet = mountView()
		tablet.state.setView("list")
		tablet.wrapper.unmount()

		expect(mountView().state.view.value).toBe("list")
	})

	it("takes nothing but the list or the plan", () => {
		withWidth(390)
		localStorage.setItem(TABLES_VIEW_KEY, "carousel")
		const { state } = mountView()
		expect(state.view.value).toBe("list")

		state.setView("carousel")
		expect(state.view.value).toBe("list")
		expect(localStorage.getItem(TABLES_VIEW_KEY)).toBe("carousel")
	})

	it("follows the width of the window: a phone turned or a window narrowed", async () => {
		withWidth(1180)
		const { state } = mountView()
		expect(state.isPhone.value).toBe(false)

		withWidth(390)
		window.dispatchEvent(new Event("resize"))
		await nextTick()

		expect(state.isPhone.value).toBe(true)
		expect(state.view.value).toBe("list")
	})

	it("stops listening to the window once gone", () => {
		const removed = vi.spyOn(window, "removeEventListener")
		const { wrapper } = mountView()

		wrapper.unmount()

		expect(removed.mock.calls.map(([type]) => type)).toContain("resize")
	})

	it("keeps working when the browser's storage refuses to be read or written", () => {
		withWidth(390)
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("SecurityError")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceededError")
		})

		const { state } = mountView()
		expect(state.view.value).toBe("list")

		expect(() => state.setView("plan")).not.toThrow()
		expect(state.view.value).toBe("plan")
	})
})
