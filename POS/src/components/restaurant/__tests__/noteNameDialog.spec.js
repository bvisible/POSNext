/**
 * //// Neoffice — added file (no upstream equivalent). The name of a group of the table (NeoResto lot 1, notes): optional, at most 60 characters, starting at the name the group has; « Save » is the ink button and sends what was
 * //// typed (an empty field takes the name off); « Cancel », Escape and a tap beside the dialog change nothing.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

const { default: NoteNameDialog } = await import("../NoteNameDialog.vue")

let wrapper
function show(props = {}) {
	wrapper = mount(NoteNameDialog, {
		props: { label: ".2", current: "", ...props },
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

describe("the name of a group", () => {
	it("says which table it is about when it is told, and writes nothing when it is not", () => {
		show({ table: "Table 11.1" })
		expect(part("note-name-table").text()).toBe("Table 11.1")
		wrapper.unmount()

		show()
		expect(part("note-name-table").exists()).toBe(false)
	})

	it("is asked for the group it names", () => {
		show()

		expect(part("note-name-title").text()).toBe("Name of the group .2")
		expect(part("note-name-input").attributes("placeholder")).toBe("Leave empty for no name")
	})

	it("starts at the name the group has, and focuses the field", async () => {
		show({ current: "Dupont" })
		await wrapper.vm.$nextTick()

		expect(part("note-name-input").element.value).toBe("Dupont")
		expect(document.activeElement).toBe(part("note-name-input").element)
	})

	it("is cut to 60 characters by the field itself", () => {
		show()

		expect(part("note-name-input").attributes("maxlength")).toBe("60")
	})

	it("sends what was typed on « Save », and on Enter", async () => {
		show()
		await part("note-name-input").setValue("Les Martin")

		await part("note-name-save").trigger("click")
		await part("note-name-input").trigger("keydown.enter")

		expect(wrapper.emitted("save")).toEqual([["Les Martin"], ["Les Martin"]])
	})

	it("sends an empty name, which takes the name off", async () => {
		show({ current: "Dupont" })
		await part("note-name-input").setValue("")

		await part("note-name-save").trigger("click")

		expect(wrapper.emitted("save")).toEqual([[""]])
	})

	it("changes nothing on « Cancel », on Escape and on a tap beside the dialog", async () => {
		show()

		await part("note-name-cancel").trigger("click")
		await part("note-name-dialog").trigger("keydown.esc")
		await part("note-name-dialog").trigger("click")

		expect(wrapper.emitted("cancel")).toHaveLength(3)
		expect(wrapper.emitted("save")).toBeUndefined()
	})

	it("waits while the name is being saved", async () => {
		show({ busy: true })

		expect(part("note-name-save").attributes("disabled")).toBeDefined()
		expect(part("note-name-input").attributes("disabled")).toBeDefined()
		await part("note-name-input").trigger("keydown.enter")
		expect(wrapper.emitted("save")).toBeUndefined()
	})

	it("has 48 px targets, the ink button for the main action, above the phone's screen", () => {
		show()

		expect(part("note-name-save").classes()).toEqual(expect.arrayContaining(["min-h-[48px]", "bg-[#141414]"]))
		expect(part("note-name-cancel").classes()).toContain("min-h-[48px]")
		expect(part("note-name-input").classes()).toContain("h-[48px]")
		expect(part("note-name-dialog").classes()).toContain("z-[300]")
	})
})
