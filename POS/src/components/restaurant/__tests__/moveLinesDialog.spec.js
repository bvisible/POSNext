/**
 * //// Neoffice — added file (no upstream equivalent). The question asked when the waiter taps another group of the table while the cart holds lines not sent to the kitchen yet (NeoResto lot 1, notes): « Move the 3 new lines to
 * //// .2? » with « Move them » (the ink button, focused) and « Keep them on .1 »; in the singular for one line. Escape and a tap beside the dialog are the other answer: nothing changes. Two buttons of 48 px.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

const { default: MoveLinesDialog } = await import("../MoveLinesDialog.vue")

let wrapper
function show(props = {}) {
	wrapper = mount(MoveLinesDialog, {
		props: { count: 3, from: ".1", to: ".2", ...props },
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}
const part = (name) => wrapper.find(`[data-test="${name}"]`)

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
	document.body.innerHTML = ""
})

describe("the question about the lines not sent", () => {
	it("asks « Move the 3 new lines to .2? » with the two answers", () => {
		show()

		expect(part("move-lines-question").text()).toBe("Move the 3 new lines to .2?")
		expect(part("move-lines-move").text()).toBe("Move them")
		expect(part("move-lines-keep").text()).toBe("Keep them on .1")
	})

	it("says it in the singular for one line", () => {
		show({ count: 1 })

		expect(part("move-lines-question").text()).toBe("Move the new line to .2?")
		expect(part("move-lines-move").text()).toBe("Move it")
		expect(part("move-lines-keep").text()).toBe("Keep it on .1")
	})

	it("moves the lines on « Move them »", async () => {
		show()

		await part("move-lines-move").trigger("click")

		expect(wrapper.emitted("move")).toHaveLength(1)
		expect(wrapper.emitted("keep")).toBeUndefined()
	})

	it("keeps the lines on « Keep them », on Escape and on a tap beside the dialog", async () => {
		show()

		await part("move-lines-keep").trigger("click")
		await wrapper.get('[data-test="move-lines-dialog"]').trigger("keydown.esc")
		await wrapper.get('[data-test="move-lines-dialog"]').trigger("click")

		expect(wrapper.emitted("keep")).toHaveLength(3)
		expect(wrapper.emitted("move")).toBeUndefined()
	})

	it("is a dialog for a screen reader, named by its question", () => {
		show()

		expect(part("move-lines-dialog").attributes("role")).toBe("alertdialog")
		expect(part("move-lines-dialog").attributes("aria-label")).toBe("Move the 3 new lines to .2?")
	})

	it("focuses the ink button, so that Enter moves the lines", async () => {
		show()
		await wrapper.vm.$nextTick()

		expect(document.activeElement).toBe(part("move-lines-move").element)
	})

	it("has buttons of 48 px, the ink one for the main action, and waits while the other group opens", () => {
		show({ busy: true })

		for (const name of ["move-lines-move", "move-lines-keep"]) {
			expect(part(name).classes()).toContain("min-h-[48px]")
			expect(part(name).attributes("disabled")).toBeDefined()
		}
		expect(part("move-lines-move").classes()).toContain("bg-[#141414]")
		expect(part("move-lines-keep").classes()).not.toContain("bg-[#141414]")
	})

	it("is above the phone's screen", () => {
		show()

		expect(part("move-lines-dialog").classes()).toContain("z-[300]")
	})
})
