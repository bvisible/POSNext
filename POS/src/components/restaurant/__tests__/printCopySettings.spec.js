/**
 * //// Neoffice — added file (no upstream equivalent). The control of the print button's settings, in the top bar of the kitchen and runner screens beside the
 * //// awake settings (NeoResto lot 1, task 44): the button of THIS screen, what prints (this station's lines or the whole order) and the COPY mark, each with a
 * //// one-line help. One icon button of 44 px that opens a small panel; the panel holds nothing the page keeps: it shows the settings it is given and says what the
 * //// person changed.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveCopySettings } from "@/utils/printCopy"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const { default: PrintCopySettings } = await import("../PrintCopySettings.vue")

let opened = []
function open(props = {}) {
	const wrapper = mount(PrintCopySettings, {
		props: { settings: resolveCopySettings(), screen: "Kitchen", ...props },
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	return wrapper
}
const button = (wrapper) => wrapper.get('[data-test="print-copy-settings"]')
async function openMenu(props) {
	const wrapper = open(props)
	await button(wrapper).trigger("click")
	return wrapper
}

beforeEach(() => {
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

describe("the button of the print settings", () => {
	it("is a button of 44 px that names itself and opens a panel, closed to begin with", () => {
		const wrapper = open()

		expect(button(wrapper).classes()).toEqual(expect.arrayContaining(["h-11", "w-11"]))
		expect(button(wrapper).attributes("aria-label")).toBe("Printing a copy of a ticket")
		expect(button(wrapper).attributes("aria-expanded")).toBe("false")
		expect(wrapper.find('[data-test="print-copy-menu"]').exists()).toBe(false)
	})

	it("opens a panel with the three choices, each with a line of help, and closes on Escape or a tap outside", async () => {
		const wrapper = await openMenu()

		expect(button(wrapper).attributes("aria-expanded")).toBe("true")
		const menu = wrapper.get('[data-test="print-copy-menu"]')
		expect(menu.attributes("role")).toBe("dialog")
		for (const test of ["print-copy-button", "print-copy-scope", "print-copy-mark"])
			expect(menu.find(`[data-test="${test}"]`).exists(), test).toBe(true)
		expect(menu.findAll('[data-test="print-copy-help"]')).toHaveLength(3)

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('[data-test="print-copy-menu"]').exists()).toBe(false)

		await button(wrapper).trigger("click")
		document.body.click()
		await wrapper.vm.$nextTick()
		expect(wrapper.find('[data-test="print-copy-menu"]').exists()).toBe(false)
	})
})

describe("the choices", () => {
	it("offer the kitchen's button on the kitchen screen, on by default, and say what they change", async () => {
		const wrapper = await openMenu({ screen: "Kitchen" })

		const toggle = wrapper.get('[data-test="print-copy-button"]')
		expect(toggle.attributes("aria-label")).toBe("Print button on the kitchen screen")
		expect(toggle.attributes("aria-checked")).toBe("true")

		await toggle.trigger("click")
		expect(wrapper.emitted("change")).toEqual([["kitchen_print_button", false]])
	})

	it("offer the runner's button on the runner screen, off by default", async () => {
		const wrapper = await openMenu({ screen: "Runner" })

		const toggle = wrapper.get('[data-test="print-copy-button"]')
		expect(toggle.attributes("aria-label")).toBe("Print button on the runner screen")
		expect(toggle.attributes("aria-checked")).toBe("false")

		await toggle.trigger("click")
		expect(wrapper.emitted("change")).toEqual([["runner_print_button", true]])
	})

	it("offer what prints: this station's lines (the default) or the whole order", async () => {
		const wrapper = await openMenu()

		const select = wrapper.get('[data-test="print-copy-scope"]')
		expect(select.element.value).toBe("station")
		expect(select.findAll("option").map((option) => option.text())).toEqual(["This station's lines", "The whole order"])

		await select.setValue("order")
		expect(wrapper.emitted("change")).toEqual([["print_scope", "order"]])
	})

	it("show the whole order when the device chose it", async () => {
		const wrapper = await openMenu({ settings: resolveCopySettings({ device: { print_scope: "order" } }) })

		expect(wrapper.get('[data-test="print-copy-scope"]').element.value).toBe("order")
	})

	it("offer the COPY mark, on by default", async () => {
		const wrapper = await openMenu()

		const toggle = wrapper.get('[data-test="print-copy-mark"]')
		expect(toggle.attributes("aria-checked")).toBe("true")

		await toggle.trigger("click")
		expect(wrapper.emitted("change")).toEqual([["mark_copy", false]])
	})

	it("show a switch that is off as off", async () => {
		const wrapper = await openMenu({ settings: resolveCopySettings({ device: { mark_copy: false, kitchen_print_button: false } }) })

		expect(wrapper.get('[data-test="print-copy-mark"]').attributes("aria-checked")).toBe("false")
		expect(wrapper.get('[data-test="print-copy-button"]').attributes("aria-checked")).toBe("false")
	})
})
