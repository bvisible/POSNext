/**
 * //// Neoffice — added file (no upstream equivalent). The groups of a table, on the card of the list of tables (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): a table with several groups says « 2 groups » first on its
 * //// muted line, then its time and its total (the sum of the groups), then the names they were given; a table with one group says nothing of it. The list has a search field (a 44 px target) that tells the page what was typed,
 * //// so that « Dupont » finds « Table 5 ».
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"

globalThis.__ = (text, args = []) => (args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { default: TableCard } = await import("../TableCard.vue")
const { default: TablesList } = await import("../TablesList.vue")

const T5 = { name: "t5", table_name: "Table 5", area: "r1", status: "Occupied" }
const entry = (extra = {}) => ({
	key: "t5",
	kind: "table",
	tier: "occupied",
	table: T5,
	title: "Table 5",
	badge: { text: "Occupied", tone: "neutral" },
	minutes: 75,
	total: 120,
	waiting: 0,
	qr: false,
	notesCount: 0,
	noteNames: [],
	...extra,
})

let wrapper
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ""
})
function card(extra = {}) {
	wrapper = mount(TableCard, {
		attachTo: document.body,
		props: { entry: entry(extra), currency: "CHF" },
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const details = () => wrapper.get('[data-test="card-details"]').text().replace(/\s+/g, " ").trim()

describe("the card of a table with several groups", () => {
	it("says how many first, then the time and the total", () => {
		card({ notesCount: 2 })

		expect(details()).toMatch(/^2 groups · /)
		expect(details()).toContain("120")
	})

	it("ends with the names the groups were given", () => {
		card({ notesCount: 2, noteNames: ["Dupont", "Les Martin"] })

		expect(details().endsWith("Dupont, Les Martin")).toBe(true)
		expect(details().startsWith("2 groups")).toBe(true)
	})

	it("says nothing of groups for a table with one, or with none", () => {
		card({ notesCount: 1, noteNames: ["Dupont"] })
		expect(details()).not.toContain("group")
		expect(details()).not.toContain("Dupont")
		wrapper.unmount()

		card({ notesCount: 0 })
		expect(details()).not.toContain("group")
	})

	it("keeps the line it had for an entry that carries no groups at all", () => {
		card({ notesCount: undefined, noteNames: undefined })

		expect(details()).toContain("120")
		expect(details()).not.toContain("group")
	})
})

describe("the search of the list of tables", () => {
	function list(props = {}) {
		wrapper = mount(TablesList, {
			attachTo: document.body,
			props: {
				model: { room: "all", rooms: [], activeCount: 1, busy: [entry()], soon: [], others: [], free: [] },
				qrEnabled: false,
				currency: "CHF",
				...props,
			},
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}
	const field = () => wrapper.get('[data-test="tables-search"]')

	it("is a search field a finger can reach, above the filters", () => {
		list()

		expect(field().classes()).toContain("h-11")
		expect(field().attributes("aria-label")).toBe("Search a table or a group")
		const order = wrapper.findAll("[data-test]").map((el) => el.attributes("data-test"))
		expect(order.indexOf("tables-search")).toBeLessThan(order.indexOf("room-filter"))
	})

	it("shows what the page keeps of it", () => {
		list({ search: "dupont" })

		expect(field().element.value).toBe("dupont")
	})

	it("tells the page what is typed", async () => {
		list()

		await field().setValue("Dupont")

		expect(wrapper.emitted("update:search")).toEqual([["Dupont"]])
	})

	it("wears the dark mode of the list", () => {
		list()

		expect(field().classes()).toEqual(expect.arrayContaining(["dark:bg-transparent", "dark:text-ds-paper"]))
	})
})
