/**
 * //// Neoffice — added file (no upstream equivalent). The options dialog of a dish showed « Confirm » in clay (NeoRestau
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

// The frappe-ui Button, as far as its colour goes: `theme` defaults to "gray", which is ink when it is solid. The
// dialog shows its colour by the theme it asks for, so the stub puts the theme and the variant where a test can read them
vi.mock("frappe-ui", () => ({
	Button: {
		props: {
			variant: { type: String, default: "subtle" },
			theme: { type: String, default: "gray" },
			disabled: Boolean,
		},
		template:
			'<button :data-variant="variant" :data-theme="theme" :disabled="disabled"><slot /></button>',
	},
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
}))

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

const buttonNamed = (wrapper, text) =>
	wrapper.findAll("button").find((button) => button.text() === text)

beforeEach(() => {
	store.invoiceItems = []
	store.updateItemModifiers.mockReset()
})

describe("the options dialog of a dish", () => {
	const glass = {
		item_code: "verre-de-vin",
		item_name: "Verre de vin",
		item_group: "Drinks",
		uom: "Décilitre",
		quantity: 1,
	}
	const mountOpen = async () => {
		store.groups = [
			{
				name: "g1",
				group_name: "Verre",
				required: 1,
				selection_type: "Single",
				options: [
					{ option_name: "1 dl", quantity_value: 1 },
					{ option_name: "3 dl", quantity_value: 3 },
					{ option_name: "5 dl", quantity_value: 5 },
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
		const confirm = buttonNamed(await mountOpen(), "Confirm")

		expect(confirm.attributes("data-variant")).toBe("solid")
		expect(confirm.attributes("data-theme")).toBe("gray")
	})

	it("cancels with the quiet button", async () => {
		const cancel = buttonNamed(await mountOpen(), "Cancel")

		expect(cancel.attributes("data-variant")).toBe("subtle")
		expect(cancel.attributes("data-theme")).toBe("gray")
	})

	it("still waits for the required choice before it confirms", async () => {
		const wrapper = await mountOpen()
		const confirm = buttonNamed(wrapper, "Confirm")
		expect(confirm.attributes("disabled")).toBeDefined()

		await wrapper
			.findAll("button")
			.find((button) => button.text().startsWith("3 dl"))
			.trigger("click")
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

		const add = buttonNamed(wrapper, "Add Menu")
		expect(add.attributes("data-variant")).toBe("solid")
		expect(add.attributes("data-theme")).toBe("gray")
	})
})
