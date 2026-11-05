/**
 * //// Neoffice — added file (no upstream equivalent). The groups of the table, in the header bar of the open table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): a table with ONE note keeps its bar and gets a discreet
 * //// « ＋ Group » beside the people pastille (a dashed 44 px target, none on a takeaway or when the page does not offer it); from two notes on the page fills the `notes` slot, a thin row under the bar and above the counter
 * //// which is handed the bar's width. The title is the page's: « Table 5 » or « Table 5.2 · Dupont ».
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({
	FeatherIcon: { props: ["name"], template: '<i :data-icon="name" />' },
}))

const { default: TableHeaderBar } = await import("../TableHeaderBar.vue")

let wrapper
function bar(props = {}, slots = {}) {
	wrapper = mount(TableHeaderBar, {
		props: { title: "Table 5", itemCount: 3, kdsStatus: "Pending", kdsStatusLabel: "Pending", ...props },
		slots,
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}
const add = () => wrapper.find('[data-test="add-note"]')

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

describe("« ＋ Group » of the header bar", () => {
	it("is not there by default: a table with one note keeps its bar as it was", () => {
		bar()

		expect(add().exists()).toBe(false)
		expect(wrapper.find('[data-test="table-header-notes"]').exists()).toBe(false)
	})

	it("is drawn beside the people pastille when the page offers it, with its word and its title", () => {
		bar({ canAddNote: true })

		expect(add().exists()).toBe(true)
		expect(add().text()).toBe("Group")
		expect(add().attributes("title")).toBe("Add a group to this table")
		expect(add().attributes("aria-label")).toBe("Add a group to this table")
		const cluster = wrapper.find('[data-test="covers-chip"]').element.parentElement
		expect(cluster.contains(add().element)).toBe(true)
	})

	it("is a discreet 44 px target: a dashed outline, no fill", () => {
		bar({ canAddNote: true })

		expect(add().classes()).toEqual(expect.arrayContaining(["min-h-[44px]", "min-w-[44px]", "border-dashed", "bg-transparent"]))
	})

	it("tells the page when it is pressed", async () => {
		bar({ canAddNote: true })

		await add().trigger("click")

		expect(wrapper.emitted("add-note")).toHaveLength(1)
	})

	it("is not drawn on a takeaway ticket, which has no table", () => {
		bar({ canAddNote: true, isTakeaway: true })

		expect(add().exists()).toBe(false)
	})
})

describe("the row of the table's groups", () => {
	it("is drawn under the bar from what the page puts in the notes slot, and handed the bar's width", () => {
		bar({}, { notes: `<template #notes="{ wide }"><span data-test="in-notes">{{ wide }}</span></template>` })
		const row = wrapper.find('[data-test="table-header-notes"]')

		expect(row.exists()).toBe(true)
		expect(row.find('[data-test="in-notes"]').text()).toBe("false")
	})

	it("is above the counter of portions and below the bar", () => {
		bar({}, { notes: "<i data-test='n' />", counter: "<i data-test='c' />" })
		const order = [...document.body.querySelectorAll("[data-test]")].map((el) => el.getAttribute("data-test"))

		expect(order.indexOf("table-header-bar")).toBeLessThan(order.indexOf("table-header-notes"))
		expect(order.indexOf("table-header-notes")).toBeLessThan(order.indexOf("table-header-counter"))
	})

	it("has the dark ground of the counter's row beside it", () => {
		bar({}, { notes: "<i />", counter: "<i />" })

		for (const name of ["table-header-notes", "table-header-counter"])
			expect(wrapper.find(`[data-test="${name}"]`).classes()).toEqual(expect.arrayContaining(["dark:bg-[#1c1f26]", "bg-[#FFFDF8]"]))
	})

	it("shows the title the page gives it", () => {
		bar({ title: "Table 5.2 · Dupont" })

		expect(wrapper.find('[data-test="table-title"]').text()).toBe("Table 5.2 · Dupont")
	})
})
