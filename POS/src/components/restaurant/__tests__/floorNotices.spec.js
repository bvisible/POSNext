/**
 * //// Neoffice — added file (no upstream equivalent). The stack of notices at the top of the till when a guest orders or pays from the QR code of a table (NeoResto lot 1, Daniel, 01.11: « regarde comment la
 * //// caisse sommelier reçoit l'info (popup et autre) »): one per table, « {Table} — the guest is ordering » with the lines of the order beneath (three, then « +N »), a button that opens the table, a dismiss
 * //// button of 44 px at least, an order to validate drawn stronger and kept in view, at most three on the screen so that the till keeps its room (1366 x 768).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)

const { default: FloorNotices } = await import("../FloorNotices.vue")

const WINE = { item_name: "Verre de vin", qty: 3 }
const notice = (table, over = {}) => ({ key: `${table}|1`, kind: "order", table, items: [WINE], count: 1, orders: 1, partial: false, ...over })
const labels = { "t-2": "T2", "t-3": "3", "t-4": "Terrasse 4" }
const show = (notices, props = {}) =>
	mount(FloorNotices, { props: { notices, labelOf: (table) => labels[table] || table, ...props }, global: { mocks: { __: globalThis.__ } } })
const rows = (wrapper) => wrapper.findAll("[data-test='floor-notice']")
const title = (wrapper, at = 0) => rows(wrapper)[at].get("[data-test='notice-title']").text()

describe("the notices of a guest's order", () => {
	it("draws nothing when there is none, and takes no room", () => {
		const wrapper = show([])

		expect(wrapper.find("[data-test='floor-notices']").exists()).toBe(false)
	})

	it("says the table, and that the guest is ordering", () => {
		expect(title(show([notice("t-2")]))).toBe("T2 — the guest is ordering")
	})

	it("names a table that is only a number as a table", () => {
		expect(title(show([notice("t-3")]))).toBe("Table 3 — the guest is ordering")
		expect(title(show([notice("t-4")]))).toBe("Terrasse 4 — the guest is ordering")
	})

	it("lists the quantity and the name of each line beneath", () => {
		const wrapper = show([notice("t-2", { items: [WINE, { item_name: "Soupe", qty: 1 }], count: 2 })])

		const lines = rows(wrapper)[0].findAll("[data-test='notice-lines'] li").map((li) => li.text())
		expect(lines).toEqual(["3 × Verre de vin", "1 × Soupe"])
	})

	it("names three lines and counts the others", () => {
		const items = Array.from({ length: 5 }, (_, n) => ({ item_name: `Plat ${n + 1}`, qty: 1 }))
		const wrapper = show([notice("t-2", { items, count: 7 })])

		const lines = rows(wrapper)[0].findAll("[data-test='notice-lines'] li").map((li) => li.text())
		expect(lines).toEqual(["1 × Plat 1", "1 × Plat 2", "1 × Plat 3", "+4"])
	})

	it("draws no list for an alert that names no line", () => {
		const wrapper = show([notice("t-2", { items: [], count: 0 })])

		expect(rows(wrapper)[0].find("[data-test='notice-lines']").exists()).toBe(false)
	})

	it("is one row per table, in the order it is handed, saying which table it is for", () => {
		const wrapper = show([notice("t-3"), notice("t-2")])

		expect(rows(wrapper).map((row) => row.attributes("data-notice-table"))).toEqual(["t-3", "t-2"])
	})
})

describe("an order the waiter has to validate", () => {
	const pending = (table, over = {}) => notice(table, { kind: "pending", ...over })

	it("says it must be validated", () => {
		expect(title(show([pending("t-2")]))).toBe("T2 — order to validate")
	})

	it("counts the orders in its title when the table has several waiting", () => {
		expect(title(show([pending("t-2", { orders: 3, count: 3 })]))).toBe("T2 — 3 orders to validate")
	})

	it("is drawn stronger than a plain order: an ink ring round the signal's field", () => {
		const wrapper = show([notice("t-3"), pending("t-2")])

		const [plain, strong] = [rows(wrapper).find((row) => row.attributes("data-notice-kind") === "order"), rows(wrapper).find((row) => row.attributes("data-notice-kind") === "pending")]
		expect(strong.classes().join(" ")).toContain("ring-2")
		expect(plain.classes().join(" ")).not.toContain("ring-2")
	})

	it("stays in view when the plain orders are more than three: the stack draws it first", () => {
		const wrapper = show([notice("a"), notice("b"), notice("c"), notice("d"), pending("e")])

		expect(rows(wrapper).map((row) => row.attributes("data-notice-table"))).toEqual(["e", "a", "b"])
		expect(wrapper.find("[data-test='notices-more']").text()).toBe("+2")
	})
})

describe("a guest's payment", () => {
	it("says the guest has paid", () => {
		expect(title(show([notice("t-2", { kind: "payment", items: [], count: 0 })]))).toBe("T2 — the guest has paid")
	})

	it("says only a part of the bill when that is all", () => {
		expect(title(show([notice("t-2", { kind: "payment", partial: true, items: [], count: 0 })]))).toBe("T2 — the guest has paid part of the bill")
	})
})

describe("the buttons", () => {
	it("has a dismiss button of at least 44 px on each notice, that says which one is dismissed", async () => {
		const wrapper = show([notice("t-3"), notice("t-2")])
		const button = rows(wrapper)[1].get("[data-test='notice-dismiss']")

		expect(button.attributes("type")).toBe("button")
		expect(button.classes()).toContain("h-11")
		expect(button.classes().join(" ")).toMatch(/min-w-\[?44px|min-w-11|w-11/)
		expect(button.attributes("aria-label")).toContain("T2")
		// A notice that only tells is « Seen » (Daniel, 02.11: it stays until somebody has seen it)
		expect(button.text()).toBe("Seen")

		await button.trigger("click")
		expect(wrapper.emitted("dismiss")).toEqual([["t-2|1"]])
	})

	it("says « Dismiss » on an order waiting for validation, which stays until it is handled: leaving it is not seeing it", () => {
		const wrapper = show([notice("t-2", { kind: "pending", orders: 1 }), notice("t-3", { kind: "payment", items: [], count: 0 })])

		expect(rows(wrapper)[0].get("[data-test='notice-dismiss']").text()).toBe("Dismiss")
		expect(rows(wrapper)[0].get("[data-test='notice-dismiss']").attributes("aria-label")).toBe("Dismiss: T2")
		expect(rows(wrapper)[1].get("[data-test='notice-dismiss']").text()).toBe("Seen")
		expect(rows(wrapper)[1].get("[data-test='notice-dismiss']").attributes("aria-label")).toBe("Seen: Table 3")
	})

	it("has a « View table » button of at least 44 px that says which notice to open", async () => {
		const wrapper = show([notice("t-2")])
		const button = rows(wrapper)[0].get("[data-test='notice-see']")

		expect(button.attributes("type")).toBe("button")
		expect(button.classes()).toContain("h-11")
		expect(button.text()).toBe("View table")

		await button.trigger("click")
		expect(wrapper.emitted("see")).toEqual([[notice("t-2")]])
		expect(wrapper.emitted("dismiss")).toBeUndefined()
	})

	it("has no « View table » for the table that is open: it is already in front of the waiter", () => {
		const wrapper = show([notice("t-2"), notice("t-3")], { openTable: "t-2" })

		const [open, other] = rows(wrapper)
		expect(open.find("[data-test='notice-see']").exists()).toBe(false)
		expect(open.find("[data-test='notice-dismiss']").exists()).toBe(true)
		expect(other.find("[data-test='notice-see']").exists()).toBe(true)
	})
})

describe("the stack", () => {
	//// Neoffice — the notices stay until somebody has seen them (Daniel, 02.11), one under the other in the order they came: the three that have waited longest stand in view, the others are one press away
	it("shows the three that have waited longest and counts the others, so that the till keeps its room", () => {
		const wrapper = show([notice("a"), notice("b"), notice("c"), notice("d"), notice("e")])

		expect(rows(wrapper).map((row) => row.attributes("data-notice-table"))).toEqual(["a", "b", "c"])
		expect(wrapper.find("[data-test='notices-more']").text()).toBe("+2")
	})

	it("shows all of them when the count is pressed, and the three again when it is pressed once more", async () => {
		const wrapper = show([notice("a"), notice("b"), notice("c"), notice("d"), notice("e")])

		await wrapper.get("[data-test='notices-more']").trigger("click")
		expect(rows(wrapper).map((row) => row.attributes("data-notice-table"))).toEqual(["a", "b", "c", "d", "e"])
		expect(wrapper.get("[data-test='notices-less']").text()).toBe("Show fewer")
		expect(wrapper.find("[data-test='notices-more']").exists()).toBe(false)

		await wrapper.get("[data-test='notices-less']").trigger("click")
		expect(rows(wrapper)).toHaveLength(3)
		expect(wrapper.get("[data-test='notices-more']").text()).toBe("+2")
	})

	it("has a count of at least 44 px that says what it opens", () => {
		const button = show([notice("a"), notice("b"), notice("c"), notice("d")]).get("[data-test='notices-more']")

		expect(button.element.tagName).toBe("BUTTON")
		expect(button.classes()).toContain("h-11")
		expect(button.attributes("aria-expanded")).toBe("false")
		expect(button.attributes("aria-label")).toBe("Show the 1 other notice")
	})

	it("puts a new notice at the bottom: the ones in view do not move", async () => {
		const wrapper = show([notice("a"), notice("b")])

		await wrapper.setProps({ notices: [notice("a"), notice("b"), notice("c")] })

		expect(rows(wrapper).map((row) => row.attributes("data-notice-table"))).toEqual(["a", "b", "c"])
	})

	it("shows the next one when one is seen", async () => {
		const wrapper = show([notice("a"), notice("b"), notice("c"), notice("d")])
		expect(wrapper.find("[data-test='notices-more']").text()).toBe("+1")

		await wrapper.setProps({ notices: [notice("b"), notice("c"), notice("d")] })

		expect(rows(wrapper)).toHaveLength(3)
		expect(wrapper.find("[data-test='notices-more']").exists()).toBe(false)
	})

	it("closes the list by itself when the others are seen, and the next crowd starts closed", async () => {
		const wrapper = show([notice("a"), notice("b"), notice("c"), notice("d")])
		await wrapper.get("[data-test='notices-more']").trigger("click")

		await wrapper.setProps({ notices: [notice("a"), notice("b")] })
		await wrapper.setProps({ notices: [notice("a"), notice("b"), notice("c"), notice("d"), notice("e")] })

		expect(rows(wrapper)).toHaveLength(3)
	})

	it("is announced to a screen reader without stealing the focus", () => {
		const region = show([notice("t-2")]).get("[data-test='floor-notices']")

		expect(region.attributes("role")).toBe("status")
		expect(region.attributes("aria-live")).toBe("polite")
	})

	it("is the signal's field with ink on it, and ink buttons, in light and in dark alike (the design system)", () => {
		const wrapper = show([notice("t-2")])
		const classes = rows(wrapper)[0].classes().join(" ")

		expect(classes).toContain("bg-[#F55D1A]")
		expect(classes).toContain("text-[#141414]")
		expect(classes).not.toMatch(/text-white|bg-blue|bg-green|bg-red/)
		for (const test of ["notice-dismiss", "notice-see"]) {
			const button = rows(wrapper)[0].get(`[data-test='${test}']`).classes().join(" ")
			expect(button, test).toContain("bg-[#141414]")
			expect(button, test).toContain("text-[#FFFDF8]")
		}
	})
})
