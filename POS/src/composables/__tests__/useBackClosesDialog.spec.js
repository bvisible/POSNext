/**
 * //// Neoffice — added file (no upstream equivalent). The Back of a phone closes the dialog it is showing instead of leaving
 * //// the till (NeoRestau lot 1). A waiter shows the table's QR code full screen on his phone; the Android Back button and the
 * //// iOS edge swipe are what a hand reaches for to get rid of it, and they leave the page. While such a dialog is on screen it
 * //// takes one entry of the browser's history (`useBackClosesDialog`): the Back that follows consumes that entry, the dialog
 * //// closes and the page stays; a dialog closed by its own button gives its entry back.
 * ////
 * //// The history is jsdom's own (pushState, back and popstate are real), and the router of the page is a real vue-router, which
 * //// listens to the same popstate and must go on working: the entry carries the state of the one it follows (the router keeps
 * //// its position and its locations in it), so that a Back onto the page's own entry is a pop onto the location already
 * //// shown, and nothing else.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h, nextTick, ref } from "vue"
import { createRouter, createWebHistory } from "vue-router"

const { useBackClosesDialog, ENTRY_KEY: KEY } = await import(
	"../useBackClosesDialog"
)

// jsdom answers history.back() on a task of its own
const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

let wrappers = []

/** A dialog that asks for the entry while `active` is true and is told when the Back consumed it. */
function dialog({ active = ref(true), onBack = vi.fn() } = {}) {
	const wrapper = mount(
		defineComponent({
			setup() {
				useBackClosesDialog(active, onBack)
				return () => h("div")
			},
		}),
	)
	wrappers.push(wrapper)
	return { wrapper, active, onBack }
}

function unmount(wrapper) {
	wrapper.unmount()
	wrappers = wrappers.filter((one) => one !== wrapper)
}

beforeEach(() => {
	// The page as the router leaves it: its own state, at its own address
	history.replaceState(
		{
			position: 3,
			current: "/",
			back: "/before",
			forward: null,
			replaced: true,
		},
		"",
		"/pos/",
	)
})
afterEach(async () => {
	for (const wrapper of wrappers) wrapper.unmount()
	wrappers = []
	await settle()
	vi.restoreAllMocks()
})

describe("the entry a dialog takes in the history", () => {
	it("is one entry, at the same address, with the state of the page it follows", () => {
		const push = vi.spyOn(history, "pushState")

		dialog()

		expect(push).toHaveBeenCalledTimes(1)
		expect(location.pathname).toBe("/pos/")
		// The router's own bookkeeping is carried over, and the entry says whose it is
		expect(history.state).toMatchObject({
			position: 3,
			current: "/",
			back: "/before",
			forward: null,
		})
		expect(history.state[KEY]).toBeTruthy()
	})

	it("is taken when the dialog becomes active, not before, and only once", async () => {
		const push = vi.spyOn(history, "pushState")
		const { active } = dialog({ active: ref(false) })
		expect(push).not.toHaveBeenCalled()
		expect(history.state[KEY]).toBeUndefined()

		active.value = true
		await nextTick()
		expect(push).toHaveBeenCalledTimes(1)
		expect(history.state[KEY]).toBeTruthy()

		// Active again, or still: nothing is pushed twice
		active.value = false
		await nextTick()
		active.value = true
		await nextTick()
		expect(push).toHaveBeenCalledTimes(1)
	})

	it("is never taken where the dialog is not asked to (a card on a tablet)", () => {
		const push = vi.spyOn(history, "pushState")

		dialog({ active: ref(false) })

		expect(push).not.toHaveBeenCalled()
		expect(history.state[KEY]).toBeUndefined()
	})
})

describe("the Back of the phone", () => {
	it("closes the dialog, once, and leaves the page where it was", async () => {
		const { onBack } = dialog()

		history.back()
		await settle()

		expect(onBack).toHaveBeenCalledTimes(1)
		expect(location.pathname).toBe("/pos/")
		expect(history.state).toMatchObject({ position: 3, current: "/" })
		expect(history.state[KEY]).toBeUndefined()
	})

	it("is not answered again when the dialog is closed after it, and gives nothing back a second time", async () => {
		const { wrapper, onBack } = dialog()
		history.back()
		await settle()
		const back = vi.spyOn(history, "back")

		// The page closes the dialog because it was told to
		unmount(wrapper)
		await settle()

		expect(onBack).toHaveBeenCalledTimes(1)
		expect(back).not.toHaveBeenCalled()
	})

	it("is answered once: a Forward onto the entry it left behind tells nobody a second time", async () => {
		const { onBack } = dialog()
		const mine = history.state[KEY]

		history.back()
		await settle()
		history.forward()
		await settle()

		// The entry is under the page again, with nothing on screen to close
		expect(history.state[KEY]).toBe(mine)
		expect(onBack).toHaveBeenCalledTimes(1)
	})
})

describe("a dialog closed by its own button", () => {
	it("gives its entry back: the history is where it was, and nobody is told", async () => {
		const { wrapper, onBack } = dialog()
		expect(history.state[KEY]).toBeTruthy()

		unmount(wrapper)
		await settle()

		expect(history.state[KEY]).toBeUndefined()
		expect(history.state).toMatchObject({ position: 3, current: "/" })
		expect(location.pathname).toBe("/pos/")
		expect(onBack).not.toHaveBeenCalled()
	})

	it("takes nothing out of the history when it never took an entry", async () => {
		const back = vi.spyOn(history, "back")
		const { wrapper } = dialog({ active: ref(false) })

		unmount(wrapper)
		await settle()

		expect(back).not.toHaveBeenCalled()
	})

	it("does not pop an entry that is not its own: the page moved on (a navigation pushed another)", async () => {
		const { wrapper, onBack } = dialog()
		history.pushState(
			{ position: 4, current: "/other", back: "/", forward: null },
			"",
			"/pos/other",
		)
		const back = vi.spyOn(history, "back")

		unmount(wrapper)
		await settle()

		expect(back).not.toHaveBeenCalled()
		expect(location.pathname).toBe("/pos/other")
		expect(onBack).not.toHaveBeenCalled()
	})

	it("stops listening to the history once it is gone", async () => {
		const remove = vi.spyOn(window, "removeEventListener")
		const { wrapper } = dialog()

		unmount(wrapper)

		expect(remove.mock.calls.map((call) => call[0])).toContain("popstate")
	})
})

describe("with a router on the page", () => {
	let router
	let after

	beforeEach(async () => {
		router = createRouter({
			history: createWebHistory("/pos"),
			routes: [
				{ path: "/", name: "Till", component: { template: "<div />" } },
				{ path: "/probe", name: "Probe", component: { template: "<div />" } },
			],
		})
		await router.push("/")
		await router.isReady()
		after = vi.fn()
		router.afterEach(after)
	})

	it("stays on its route when the Back closes the dialog, and goes on navigating", async () => {
		const { onBack } = dialog()
		expect(history.state[KEY]).toBeTruthy()

		history.back()
		await settle()

		expect(onBack).toHaveBeenCalledTimes(1)
		expect(router.currentRoute.value.fullPath).toBe("/")
		expect(location.pathname).toBe("/pos/")
		// What the router answered to that pop was a navigation onto the location it was already at, and it did not fail
		for (const call of after.mock.calls) expect(call[2]).toBeUndefined()

		await router.push("/probe")
		expect(router.currentRoute.value.fullPath).toBe("/probe")
		router.back()
		await settle()
		expect(router.currentRoute.value.fullPath).toBe("/")
	})

	it("stays on its route when the dialog is closed by its own button, and goes on navigating", async () => {
		const { wrapper, onBack } = dialog()

		unmount(wrapper)
		await settle()

		expect(onBack).not.toHaveBeenCalled()
		expect(router.currentRoute.value.fullPath).toBe("/")
		expect(history.state[KEY]).toBeUndefined()
		await router.push("/probe")
		router.back()
		await settle()
		expect(router.currentRoute.value.fullPath).toBe("/")
	})

	it("does not close the dialog for a navigation of the router itself", async () => {
		const { onBack } = dialog()

		await router.push("/probe")
		await settle()

		// The router pushed its own entry: that is no Back, and the dialog does not take it for one
		expect(onBack).not.toHaveBeenCalled()
	})
})
