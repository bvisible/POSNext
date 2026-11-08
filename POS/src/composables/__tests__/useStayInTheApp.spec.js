/**
 * //// Neoffice — added file (no upstream equivalent). The Back of a waiter's phone does not leave the till (the product owner, 08.11.2026): while the lock is on the page holds one entry of the
 * //// browser's history above its own, and the entry is put back at once when the Back lands on the page's own. A dialog's entry above it is consumed first.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, nextTick, ref } from "vue"
import { ENTRY_KEY } from "../useBackClosesDialog"
import { STAY_KEY, useStayInTheApp } from "../useStayInTheApp"

const ROUTER_STATE = { back: null, current: "/", forward: null, position: 3 }

function popped() {
	return new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }))
}

let wrapper
let pushes
const active = ref(true)
function holdThePage() {
	wrapper = mount(
		defineComponent({
			setup() {
				useStayInTheApp(active)
				return () => h("div")
			},
		}),
	)
}
const back = async () => {
	const done = popped()
	window.history.back()
	await done
	// The entry is put back by the listener of the same event
	await nextTick()
}

// The entries are counted by the pushes made, not by the length of the history: a Back leaves entries ahead of the page, which the next push drops
beforeEach(() => {
	active.value = true
	window.history.replaceState({ ...ROUTER_STATE }, "", "/")
	pushes = vi.spyOn(window.history, "pushState")
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	pushes.mockRestore()
})

describe("the Back of a waiter's phone", () => {
	it("takes one entry of the history above the page's own, with the state of the router copied", () => {
		holdThePage()

		expect(pushes).toHaveBeenCalledTimes(1)
		expect(window.history.state).toMatchObject({ ...ROUTER_STATE, [STAY_KEY]: true })
	})

	it("stays on the page: the Back lands on the page's own entry and the entry above it is put back", async () => {
		holdThePage()

		await back()

		expect(window.history.state[STAY_KEY]).toBe(true)
		expect(pushes).toHaveBeenCalledTimes(2)
		expect(window.location.pathname).toBe("/")
	})

	it("stays however many times the Back is pressed", async () => {
		holdThePage()

		for (let press = 0; press < 4; press++) {
			await back()
			expect(window.history.state[STAY_KEY], `press ${press + 1}`).toBe(true)
		}
	})

	it("lets a dialog's Back close the dialog first, and keeps the page after it", async () => {
		holdThePage()
		// A dialog of a phone takes its own entry above ours (useBackClosesDialog)
		window.history.pushState({ ...window.history.state, [ENTRY_KEY]: "dialog-1" }, "")
		const pushed = pushes.mock.calls.length

		await back()

		// Back consumed the dialog's entry: we are on ours, nothing was pushed
		expect(window.history.state[STAY_KEY]).toBe(true)
		expect(window.history.state[ENTRY_KEY]).toBeUndefined()
		expect(pushes).toHaveBeenCalledTimes(pushed)
	})

	it("does nothing while the lock is off, and gives the Back back when it is lifted", async () => {
		active.value = false

		holdThePage()
		expect(pushes).not.toHaveBeenCalled()

		active.value = true
		await nextTick()
		expect(pushes).toHaveBeenCalledTimes(1)

		active.value = false
		await nextTick()
		await back()
		// The listener is gone: the Back lands on the page's own entry and nothing is put back
		expect(window.history.state?.[STAY_KEY]).toBeUndefined()
	})
})
