/**
 * //// Neoffice — added file (no upstream equivalent). A menu course item is made into a cart line in the unit of its
 * //// item (NeoResto lot 1, task 22): the dialog hands the units that get_active_menus answered with each item to the
 * //// cart, which makes the line of them.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})
vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
}))

const { default: MenuSelectionDialog } = await import(
	"../MenuSelectionDialog.vue"
)

const click = (wrapper, text) =>
	wrapper
		.findAll("button")
		.find((button) => button.text() === text)
		.trigger("click")

describe("the menu dialog hands the units of the items to the cart", () => {
	it("the stock unit and the other units of each chosen item come with it", async () => {
		const wrapper = mount(MenuSelectionDialog, {
			global: { mocks: { __: globalThis.__ } },
		})
		wrapper.vm.open({
			menu_name: "Lunch",
			price: 25,
			courses: [
				{
					course_name: "Drink",
					items: [
						{
							item: "water",
							item_name: "Water",
							stock_uom: "Bottle",
							item_uoms: [{ uom: "Case", conversion_factor: 6 }],
						},
					],
				},
			],
		})
		await flushPromises()
		await click(wrapper, "Water")
		await click(wrapper, "Add Menu")

		const [items] = wrapper.emitted("menu-confirmed")[0]
		expect(items[0]).toMatchObject({
			item_code: "water",
			stock_uom: "Bottle",
			item_uoms: [{ uom: "Case", conversion_factor: 6 }],
		})
	})
})
