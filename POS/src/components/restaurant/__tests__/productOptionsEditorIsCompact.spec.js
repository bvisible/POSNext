/**
 * //// Neoffice — added file (no upstream equivalent). The option groups' screen (NeoResto lot 1; product owner, 05.11.2026: « c'est des cartes
 * //// énormes, donc on peut faire plus petit, les faire un peu plus pratique »): the options of a group are chips on a few lines and not
 * //// one line each, the cards sit three or four to a row, a group being edited takes the whole row, « New Option Group » is at the top
 * //// and the group it makes opens on its options.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

vi.mock("frappe-ui", () => ({
	Button: { props: ["variant", "size", "loading", "disabled"], template: "<button :disabled='disabled'><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))

const { call } = await import("@/utils/apiWrapper")
const { default: ProductOptionsEditor } = await import("../ProductOptionsEditor.vue")

const COOKING = {
	name: "Cooking",
	group_name: "Meat cooking",
	selection_type: "Single",
	required: 1,
	options: [
		{ option_name: "Rare", price_adjustment: 0, quantity_value: 0, is_default: 0 },
		{ option_name: "Medium", price_adjustment: 0, quantity_value: 0, is_default: 1 },
		{ option_name: "Well done", price_adjustment: 2.5, quantity_value: 0, is_default: 0 },
	],
	applicable_items: [],
	applicable_item_groups: [],
}
const SAUCE = { ...COOKING, name: "Sauce", group_name: "Sauce", selection_type: "Multiple", required: 0, options: [{ option_name: "Pepper", price_adjustment: 1, quantity_value: 2, is_default: 0 }] }

let wrapper
let groups
async function open() {
	wrapper = mount(ProductOptionsEditor, { props: { modelValue: true }, global: { mocks: { __: globalThis.__ } }, attachTo: document.body })
	await flushPromises()
}
const cards = () => wrapper.findAll("[data-option-group]")
const cardOf = (title) => cards().find((card) => card.text().includes(title))

beforeEach(() => {
	toast.showSuccess = vi.fn()
	toast.showError = vi.fn()
	groups = [COOKING, SAUCE].map((group) => ({ ...group, options: group.options.map((o) => ({ ...o })) }))
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_all_product_option_groups")) return groups
		if (method.endsWith("create_product_option_group")) {
			const made = { ...COOKING, name: "Made", group_name: "Made", options: [], required: 0 }
			groups = [...groups, made]
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

describe("an option group's card", () => {
	it("tells its options as chips, one chip each, with the supplement and the quantity on it", async () => {
		await open()

		const chips = cardOf("Meat cooking").findAll("[data-option-chip]")
		// The pieces of a chip are spans that the style spaces: the text has no space between them
		expect(chips.map((chip) => chip.findAll("span").map((part) => part.text()))).toEqual([
			["Rare"],
			["Medium"],
			["Well done", "+2.50"],
		])
		const sauce = cardOf("Sauce").find("[data-option-chip]")
		expect(sauce.findAll("span").map((part) => part.text())).toEqual(["Pepper", "×2", "+1.00"])
	})

	it("marks the default option on its chip, not with a line of its own", async () => {
		await open()

		const [rare, medium] = cardOf("Meat cooking").findAll("[data-option-chip]")
		expect(medium.classes().join(" ")).toContain("teal")
		expect(rare.classes().join(" ")).not.toContain("teal")
		expect(medium.attributes("title")).toBe("default")
		expect(cardOf("Meat cooking").html()).not.toContain("w-3 h-3 rounded-full border-2")
	})

	it("sits three or four to a row", async () => {
		await open()

		const grid = cards()[0].element.parentElement
		expect(grid.className).toContain("xl:grid-cols-3")
		expect(grid.className).toContain("min-[1700px]:grid-cols-4")
	})

	it("takes the whole row when it is edited, to give its form room", async () => {
		await open()
		expect(cardOf("Meat cooking").classes()).not.toContain("col-span-full")

		await cardOf("Meat cooking").findAll("button").find((b) => b.text() === "Edit").trigger("click")

		expect(cardOf("Meat cooking").classes()).toContain("col-span-full")
		expect(cardOf("Sauce").classes()).not.toContain("col-span-full")
	})
})

describe("a new option group", () => {
	it("is asked for by a button at the top, in the title bar, and not by a tile at the end of the grid", async () => {
		await open()

		const button = wrapper.find("[data-new-group]")
		expect(button.text()).toBe("New Option Group")
		const html = wrapper.html()
		expect(html.indexOf("data-new-group")).toBeLessThan(html.indexOf("data-option-group"))
		expect(html).not.toContain("min-h-[120px]")
	})

	it("opens on its options once made", async () => {
		await open()
		await wrapper.find("[data-new-group]").trigger("click")
		expect(wrapper.find("[data-new-group-form]").exists()).toBe(true)
		await wrapper.find("[data-new-group-form] input").setValue("Made")

		await wrapper.find("[data-new-group-form]").findAll("button").at(-1).trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.create_product_option_group", { group_name: "Made" })
		expect(cardOf("Made").classes()).toContain("col-span-full")
		expect(cardOf("Made").find("input[placeholder='Option name']").exists() || cardOf("Made").text().includes("Add Option")).toBe(true)
		expect(wrapper.find("[data-new-group-form]").exists()).toBe(false)
	})

	it("tells why the server refused, in the server's words", async () => {
		await open()
		call.mockImplementation(async (method) => {
			if (method.endsWith("delete_product_option_group")) throw Object.assign(new Error("no"), { messages: ["Not allowed."] })
			return groups
		})

		await cardOf("Sauce").findAll("button").find((b) => b.text() === "Delete").trigger("click")
		await flushPromises()

		expect(toast.showError).toHaveBeenCalledWith("Not allowed.")
	})
})
