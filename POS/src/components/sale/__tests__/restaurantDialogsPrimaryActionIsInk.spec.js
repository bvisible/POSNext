/**
 * //// Neoffice — added file (no upstream equivalent). The options dialog of a dish showed « Confirm » in clay (NeoResto
 * //// lot 1, task 22). The design system wants the primary action of a surface in ink, never in the accent: this till
 * //// maps every blue-N utility onto the clay ramp (tailwind.config.js), so `theme="blue"` on a frappe-ui Button is a
 * //// clay button, while the Button's default theme is the ink one « Update Item » already has.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})

// The Button the till really renders, from the installed frappe-ui (its package exports do not name the file, so it is
// loaded by path), and a Dialog that only lays its slots out: the colour of a button is what its classes say
vi.mock("frappe-ui", async () => {
	const { default: Button } = await import(
		"../../../../node_modules/frappe-ui/src/components/Button/Button.vue"
	)
	return {
		Button,
		Dialog: {
			template:
				"<div><slot name='body-content' /><slot name='actions' /></div>",
		},
	}
})

const store = reactive({
	groups: [],
	invoiceItems: [],
	profileCurrency: "CHF",
	updateItemModifiers: vi.fn(),
})
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => store }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ getModifiersForItem: () => store.groups }),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => store }))

const { default: ItemModifiersDialog } = await import(
	"../ItemModifiersDialog.vue"
)
const { default: MenuSelectionDialog } = await import(
	"../MenuSelectionDialog.vue"
)

// What the solid button of the default theme renders: the ink of « Update Item » (text-ink-white on the surface-gray-7 of
// frappe-ui, near-black in the light mode). It is asked for by exactly these classes
const INK = expect.arrayContaining(["bg-surface-gray-7", "text-ink-white"])

const buttonNamed = (wrapper, text) =>
	wrapper.findAll("button").find((button) => button.text() === text)
const choose = (wrapper, option) =>
	wrapper
		.findAll("button")
		.find((button) => button.text().startsWith(option))
		.trigger("click")

beforeEach(() => {
	store.invoiceItems = []
	store.updateItemModifiers.mockReset()
})

describe("the options dialog of a dish", () => {
	const glass = {
		item_code: "glass-of-wine",
		item_name: "Glass of wine",
		item_group: "Drinks",
		uom: "Deciliter",
		quantity: 1,
	}
	const mountOpen = async () => {
		store.groups = [
			{
				name: "g1",
				group_name: "Size",
				required: 1,
				selection_type: "Single",
				options: [
					{ option_name: "Small", quantity_value: 1 },
					{ option_name: "Medium", quantity_value: 3 },
					{ option_name: "Large", quantity_value: 5 },
				],
			},
		]
		store.invoiceItems = [glass]
		const wrapper = mount(ItemModifiersDialog, {
			global: { mocks: { __: globalThis.__ } },
		})
		wrapper.vm.open(glass)
		await flushPromises()
		return wrapper
	}

	it("confirms in ink: a solid button of the default theme, not the blue one this till paints in clay", async () => {
		const wrapper = await mountOpen()
		await choose(wrapper, "Medium")

		const confirm = buttonNamed(wrapper, "Confirm")
		expect(confirm.attributes("disabled")).toBeUndefined()
		expect(confirm.classes()).toEqual(INK)
		expect(confirm.classes()).not.toContain("bg-blue-500")
	})

	it("is flat grey, not the pale clay of a disabled blue button, while the required choice is missing", async () => {
		const confirm = buttonNamed(await mountOpen(), "Confirm")

		expect(confirm.attributes("disabled")).toBeDefined()
		expect(confirm.classes()).toContain("bg-surface-gray-2")
		expect(confirm.classes()).not.toContain("bg-blue-300")
	})

	it("cancels with the quiet button", async () => {
		const cancel = buttonNamed(await mountOpen(), "Cancel")

		expect(cancel.classes()).toContain("bg-surface-gray-2")
		expect(cancel.classes()).not.toContain("bg-surface-gray-7")
	})

	it("still waits for the required choice before it confirms", async () => {
		const wrapper = await mountOpen()
		const confirm = buttonNamed(wrapper, "Confirm")
		expect(confirm.attributes("disabled")).toBeDefined()

		await choose(wrapper, "Medium")
		expect(
			buttonNamed(wrapper, "Confirm").attributes("disabled"),
		).toBeUndefined()
	})
})

describe("the menu dialog", () => {
	it("adds the menu in ink too", async () => {
		const wrapper = mount(MenuSelectionDialog, {
			global: { mocks: { __: globalThis.__ } },
		})
		wrapper.vm.open({
			menu_name: "Lunch",
			price: 25,
			courses: [
				{
					course_name: "Starter",
					items: [{ item: "soup", item_name: "Soup" }],
				},
			],
		})
		await flushPromises()
		await choose(wrapper, "Soup")

		const add = buttonNamed(wrapper, "Add Menu")
		expect(add.attributes("disabled")).toBeUndefined()
		expect(add.classes()).toEqual(INK)
		expect(add.classes()).not.toContain("bg-blue-500")
	})
})
