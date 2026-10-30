/**
 * //// Neoffice — added file (no upstream equivalent). The switch at the end of the kitchen screen's filter line that
 * //// chooses how the two bands are laid out, stacked or side by side (NeoRestau lot 1, task 23). It is read on a tablet,
 * //// so nothing in it waits for a mouse: the name of each layout is written on its button, and the buttons are as high as
 * //// the chips of the line.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { default: KitchenLayoutSwitch } = await import(
	"../KitchenLayoutSwitch.vue"
)

const mountSwitch = (layout = "bands") =>
	mount(KitchenLayoutSwitch, {
		props: { layout },
		global: { mocks: { __: globalThis.__ } },
	})
const buttons = (wrapper) => wrapper.findAll("button")

describe("the layout switch", () => {
	it("is a group of two buttons, the bands first and the columns second, named for whoever cannot see it", () => {
		const wrapper = mountSwitch()

		const group = wrapper.get('[data-test="layout-switch"]')
		expect(group.attributes("role")).toBe("group")
		expect(group.attributes("aria-label")).toBe("Layout")
		expect(buttons(wrapper)).toHaveLength(2)
		expect(buttons(wrapper).map((b) => b.attributes("data-layout"))).toEqual([
			"bands",
			"columns",
		])
	})

	it("writes the name of each layout on its button: a label to read on a touch screen, where there is no tooltip to hover", () => {
		const wrapper = mountSwitch()

		expect(buttons(wrapper).map((b) => b.text())).toEqual(["Bands", "Columns"])
		for (const button of buttons(wrapper)) {
			expect(button.attributes("title"), "no tooltip").toBeUndefined()
		}
	})

	it("shows its words wherever the line has the room, and its icons alone where it has not: a second row would cost a row of tickets", () => {
		// At 1024 px the two words push the switch onto a row of their own (measured: the line goes from 41 to 77 px). They
		// are shown from 1100 px, or when the tablet is held upright (the line has two rows there already), and the aria-label
		// still names each layout for whoever does not see the words.
		for (const button of buttons(mountSwitch())) {
			const label = button.get('[data-test="layout-label"]')
			expect(label.classes()).toEqual(
				expect.arrayContaining([
					"hidden",
					"min-[1100px]:inline",
					"portrait:inline",
				]),
			)
		}
	})

	it("says in its aria-label what each layout does, in words of its own", () => {
		const labels = buttons(mountSwitch()).map((b) => b.attributes("aria-label"))

		expect(labels).toEqual([
			"Waiting orders above, orders in preparation below",
			"Waiting orders on the left, orders in preparation on the right",
		])
	})

	it("draws a lucide icon on each button, rows and columns, hidden from whoever reads the labels", () => {
		const wrapper = mountSwitch()

		for (const button of buttons(wrapper)) {
			const icon = button.find("svg")
			expect(icon.exists(), button.attributes("data-layout")).toBe(true)
			expect(icon.attributes("aria-hidden")).toBe("true")
		}
	})

	it("marks the layout in use as pressed, and only that one", () => {
		const bands = mountSwitch("bands")
		expect(buttons(bands).map((b) => b.attributes("aria-pressed"))).toEqual([
			"true",
			"false",
		])

		const columns = mountSwitch("columns")
		expect(buttons(columns).map((b) => b.attributes("aria-pressed"))).toEqual([
			"false",
			"true",
		])
	})

	it("shows the layout in use the way the line's chips show the one chosen, in the same colours", () => {
		const [bands, columns] = buttons(mountSwitch("bands"))

		expect(bands.classes()).toEqual(
			expect.arrayContaining(["bg-gray-800", "text-white"]),
		)
		expect(columns.classes()).toEqual(
			expect.arrayContaining(["bg-gray-100", "text-gray-600"]),
		)
	})

	it("is as high as the chips of the line, 32 px: it adds nothing to the height of the line", () => {
		for (const button of buttons(mountSwitch())) {
			expect(button.classes()).toContain("h-8")
		}
	})

	it("says which layout was pressed, the one in use included: on a device nobody has chosen for, pressing the layout it opened on is a choice", async () => {
		// The screen decides what a press means. A tablet that opened on the columns by itself (it was held flat) and whose
		// cook presses "Columns" is telling the screen to stay on them when the tablet is turned: that has to reach it.
		const wrapper = mountSwitch("bands")

		await buttons(wrapper)[0].trigger("click")
		expect(wrapper.emitted("update:layout")).toEqual([["bands"]])

		await buttons(wrapper)[1].trigger("click")
		expect(wrapper.emitted("update:layout")).toEqual([["bands"], ["columns"]])

		await wrapper.setProps({ layout: "columns" })
		await buttons(wrapper)[0].trigger("click")
		expect(wrapper.emitted("update:layout").at(-1)).toEqual(["bands"])
	})
})
