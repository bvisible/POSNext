/**
 * //// Neoffice — added file (no upstream equivalent). The workflows' screen (NeoResto lot 1; product owner, 05.11.2026: « les workflows peuvent
 * //// être utilisés, on ne peut pas les effacer […] les nouveaux, qui ne sont pas utilisés, on peut les effacer, les modifier »): each card says
 * //// what uses its workflow, « Delete » is offered only where nothing does, a refusal is told in the server's words, « New Workflow » is
 * //// at the top and the workflow it makes opens on its steps.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

vi.mock("frappe-ui", () => ({
	Button: {
		props: ["variant", "size", "loading", "disabled"],
		template: "<button :disabled='disabled'><slot /></button>",
	},
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))

const { call } = await import("@/utils/apiWrapper")
const { default: WorkflowEditor } = await import("../WorkflowEditor.vue")

const STEPS = [{ step_name: "Pending", color: "#EAB308" }]
const STANDARD = { name: "Standard", workflow_name: "Standard", is_default: 1, steps: STEPS, applicable_items: [], stations: [] }
const FULL = { name: "Full", workflow_name: "Full kitchen", is_default: 0, steps: STEPS, applicable_items: [], stations: ["Kitchen", "Grill"] }
const FREE = { name: "Free", workflow_name: "Free one", is_default: 0, steps: STEPS, applicable_items: [], stations: [] }

let wrapper
let workflows
const refuse = (message) => Object.assign(new Error("refused"), { messages: [message] })

async function open() {
	wrapper = mount(WorkflowEditor, { props: { modelValue: true }, global: { mocks: { __: globalThis.__ } }, attachTo: document.body })
	await flushPromises()
	return wrapper
}
const cards = () => wrapper.findAll("[data-workflow]")
// « Delete » asks to be confirmed: press it, then « Confirm »
const deleteIt = async (title) => {
	await cardOf(title).find("[data-delete-workflow]").trigger("click")
	await cardOf(title).find("[data-confirm-delete]").trigger("click")
	await flushPromises()
}
const cardOf = (title) => cards().find((card) => card.text().includes(title))

beforeEach(() => {
	toast.showSuccess = vi.fn()
	toast.showError = vi.fn()
	workflows = [STANDARD, FULL, FREE].map((workflow) => ({ ...workflow, steps: workflow.steps.map((s) => ({ ...s })) }))
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_preparation_workflows")) return workflows
		if (method.endsWith("create_preparation_workflow")) {
			const made = { name: "Made", workflow_name: "Made", is_default: 0, steps: STEPS, applicable_items: [], stations: [] }
			workflows = [...workflows, made]
			return made
		}
		return { status: "success" }
	})
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
	document.body.innerHTML = ""
})

describe("what uses a workflow", () => {
	it("is on its card, as the stations that name it", async () => {
		await open()

		expect(cardOf("Full kitchen").find("[data-used-by]").text()).toBe("Used by Kitchen, Grill")
		expect(cardOf("Free one").find("[data-used-by]").exists()).toBe(false)
	})

	it("decides who may be deleted: not the default, not one a station names, the others yes", async () => {
		await open()

		expect(cardOf("Standard").find("[data-delete-workflow]").exists()).toBe(false)
		expect(cardOf("Full kitchen").find("[data-delete-workflow]").exists()).toBe(false)
		expect(cardOf("Free one").find("[data-delete-workflow]").exists()).toBe(true)
	})

	it("asks to be confirmed: « Delete » turns into « Confirm » and « Cancel », and nothing is sent before the confirmation", async () => {
		await open()

		await cardOf("Free one").find("[data-delete-workflow]").trigger("click")

		expect(call.mock.calls.some(([method]) => method.endsWith("delete_preparation_workflow"))).toBe(false)
		expect(cardOf("Free one").find("[data-confirm-delete]").text()).toBe("Confirm")
		expect(cardOf("Free one").find("[data-cancel-delete]").text()).toBe("Cancel")
		expect(cardOf("Free one").find("[data-delete-workflow]").exists()).toBe(false)

		await cardOf("Free one").find("[data-cancel-delete]").trigger("click")
		expect(cardOf("Free one").find("[data-delete-workflow]").exists()).toBe(true)
		expect(call.mock.calls.some(([method]) => method.endsWith("delete_preparation_workflow"))).toBe(false)
	})

	it("takes its question back by itself after a few seconds", async () => {
		vi.useFakeTimers()
		try {
			await open()
			await cardOf("Free one").find("[data-delete-workflow]").trigger("click")
			expect(cardOf("Free one").find("[data-confirm-delete]").exists()).toBe(true)

			await vi.advanceTimersByTimeAsync(6100)

			expect(cardOf("Free one").find("[data-confirm-delete]").exists()).toBe(false)
			expect(cardOf("Free one").find("[data-delete-workflow]").exists()).toBe(true)
		} finally {
			vi.useRealTimers()
		}
	})

	it("is deleted without a word of the server's, and the list is read again", async () => {
		await open()

		await deleteIt("Free one")

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.delete_preparation_workflow", { name: "Free" })
		expect(toast.showSuccess).toHaveBeenCalledWith("Workflow deleted")
		expect(call.mock.calls.filter(([method]) => method.endsWith("get_preparation_workflows"))).toHaveLength(2)
	})

	it("tells why the server refused, in the server's words", async () => {
		await open()
		call.mockImplementation(async (method) => {
			if (method.endsWith("delete_preparation_workflow")) throw refuse("This workflow is used by Kitchen: give that station another workflow first.")
			return workflows
		})

		await deleteIt("Free one")

		expect(toast.showError).toHaveBeenCalledWith("This workflow is used by Kitchen: give that station another workflow first.")
	})

	it("falls back to its own words when the server said nothing", async () => {
		await open()
		call.mockImplementation(async (method) => {
			if (method.endsWith("delete_preparation_workflow")) throw new Error("network")
			return workflows
		})

		await deleteIt("Free one")

		expect(toast.showError).toHaveBeenCalledWith("Failed to delete workflow")
	})
})

describe("a new workflow", () => {
	it("is asked for by a button at the top, in the title bar, and not at the bottom of the list", async () => {
		await open()

		const button = wrapper.find("[data-new-workflow]")
		expect(button.exists()).toBe(true)
		expect(button.text()).toBe("New Workflow")
		// Before the list, not after it
		const html = wrapper.html()
		expect(html.indexOf("data-new-workflow")).toBeLessThan(html.indexOf("data-workflow"))
		expect(html).not.toContain("border-dashed border-gray-300 rounded-xl p-4 hover:border-gray-400")
	})

	it("asks for a name, above the list, and is created only with one", async () => {
		await open()

		await wrapper.find("[data-new-workflow]").trigger("click")
		expect(wrapper.find("[data-new-workflow-form]").exists()).toBe(true)
		expect(wrapper.find("[data-new-workflow]").exists()).toBe(false)
		const create = wrapper.find("[data-new-workflow-form]").findAll("button").at(-1)
		expect(create.attributes("disabled")).toBeDefined()

		await wrapper.find("[data-new-workflow-form] input").setValue("Made")
		expect(wrapper.find("[data-new-workflow-form]").findAll("button").at(-1).attributes("disabled")).toBeUndefined()
	})

	it("keeps its form, with the button busy, until the list shows the new workflow", async () => {
		await open()
		await wrapper.find("[data-new-workflow]").trigger("click")
		await wrapper.find("[data-new-workflow-form] input").setValue("Made")
		let release
		const slowList = new Promise((resolve) => (release = resolve))
		call.mockImplementation(async (method) => {
			if (method.endsWith("create_preparation_workflow")) {
				workflows = [...workflows, { name: "Made", workflow_name: "Made", is_default: 0, steps: STEPS, applicable_items: [], stations: [] }]
				return { name: "Made" }
			}
			await slowList
			return workflows
		})

		await wrapper.find("[data-new-workflow-form]").findAll("button").at(-1).trigger("click")
		await flushPromises()

		// The workflow is made, the list is not back: the form is still there, and the button cannot be pressed twice
		expect(wrapper.find("[data-new-workflow-form]").exists()).toBe(true)
		expect(wrapper.find("[data-new-workflow-form]").findAll("button").at(-1).attributes("disabled")).toBeDefined()
		release()
		await flushPromises()
		expect(wrapper.find("[data-new-workflow-form]").exists()).toBe(false)
		expect(cardOf("Made")).toBeTruthy()
	})

	it("opens on its steps once made, so that it is seen and can be set up", async () => {
		await open()
		await wrapper.find("[data-new-workflow]").trigger("click")
		await wrapper.find("[data-new-workflow-form] input").setValue("Made")

		await wrapper.find("[data-new-workflow-form]").findAll("button").at(-1).trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.create_preparation_workflow", { workflow_name: "Made" })
		const made = cardOf("Made")
		expect(made).toBeTruthy()
		expect(made.find("input[placeholder='Step name']").exists()).toBe(true)
		expect(wrapper.find("[data-new-workflow-form]").exists()).toBe(false)
	})
})
