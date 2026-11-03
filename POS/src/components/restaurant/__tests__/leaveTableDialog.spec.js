/**
 * //// Neoffice — added file (no upstream equivalent). The question « Back » asks when a dish that had left for the kitchen was taken off the order (NeoResto lot 1, product owner, 03.11.2026).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { beforeAll, describe, expect, it } from "vitest"

let LeaveTableDialog
beforeAll(async () => {
	globalThis.__ = (text, args) => (args ? text.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : text)
	;({ default: LeaveTableDialog } = await import("../LeaveTableDialog.vue"))
})

const show = (props = {}) =>
	mount(LeaveTableDialog, {
		props: { removed: [{ item_code: "SOUP", item_name: "Soupe du jour", quantity: 1 }], canPutBack: true, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
const part = (wrapper, name) => wrapper.find(`[data-test="${name}"]`)

describe("the question asked when a sent dish was taken off", () => {
	it("names the dish taken off, with its quantity", () => {
		const wrapper = show({ removed: [{ item_code: "SOUP", item_name: "Soupe du jour", quantity: 2 }, { item_code: "TART", item_name: "Tarte", quantity: 1 }] })

		const lines = wrapper.findAll('[data-test="leave-removed-line"]').map((line) => line.text())
		expect(lines).toEqual(["2× Soupe du jour", "1× Tarte"])
	})

	it("says in the singular when one dish was taken off, and in the plural when several were", () => {
		expect(part(show(), "leave-title").text()).toBe("A dish already sent to the kitchen was removed.")
		const several = show({ removed: [{ item_code: "A", item_name: "A", quantity: 1 }, { item_code: "B", item_name: "B", quantity: 1 }] })
		expect(part(several, "leave-title").text()).toBe("2 dishes already sent to the kitchen were removed.")
	})

	it("offers three buttons that say what they do, and stays the one focused", async () => {
		const wrapper = show()
		await wrapper.vm.$nextTick()

		expect(part(wrapper, "leave-send").text()).toBe("Send the cancellation to the kitchen")
		expect(part(wrapper, "leave-put-back").text()).toBe("Put the order back as it was")
		expect(part(wrapper, "leave-stay").text()).toBe("Stay")
		expect(document.activeElement).toBe(part(wrapper, "leave-stay").element)
	})

	it("says that the whole order will be cancelled when the dish taken off was the last one", () => {
		const wrapper = show({ emptied: true })

		expect(part(wrapper, "leave-emptied-hint").text()).toBe("That was the last dish: the whole order will be cancelled.")
		expect(part(wrapper, "leave-send").text()).toBe("Cancel the order and tell the kitchen")
	})

	it("says nothing of the sort while dishes are left on the order", () => {
		const wrapper = show()

		expect(part(wrapper, "leave-emptied-hint").exists()).toBe(false)
		expect(part(wrapper, "leave-send").text()).toBe("Send the cancellation to the kitchen")
	})

	it("offers no « put back » where the order cannot be read again", () => {
		expect(part(show({ canPutBack: false }), "leave-put-back").exists()).toBe(false)
	})

	it("says which button was pressed", async () => {
		const wrapper = show()

		await part(wrapper, "leave-send").trigger("click")
		await part(wrapper, "leave-put-back").trigger("click")
		await part(wrapper, "leave-stay").trigger("click")

		expect(wrapper.emitted("send")).toHaveLength(1)
		expect(wrapper.emitted("put-back")).toHaveLength(1)
		expect(wrapper.emitted("stay")).toHaveLength(1)
	})

	it("stays when the shade around it, or the escape key, is pressed", async () => {
		const wrapper = show()

		await part(wrapper, "leave-table-dialog").trigger("click")
		await part(wrapper, "leave-table-dialog").trigger("keydown.esc")

		expect(wrapper.emitted("stay")).toHaveLength(2)
	})

	it("cannot be pressed twice while the cancellation is on its way", () => {
		const wrapper = show({ busy: true })

		expect(part(wrapper, "leave-send").attributes("disabled")).toBeDefined()
		expect(part(wrapper, "leave-put-back").attributes("disabled")).toBeDefined()
	})
})
