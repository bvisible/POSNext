/**
 * //// Neoffice — added file (no upstream equivalent). The stack of notices at the top of the kitchen screen (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine »): one per table,
 * //// « {Table} — the next course is ordered: {Desserts} », a dismiss button of 44 px at least, a press on the notice to find the ticket again, at most three on the screen so that the tickets keep their room (1366 x 768).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)

const { default: NextCourseNotices } = await import("../NextCourseNotices.vue")

const notice = (order, families = ["Dessert"], extra = {}) => ({ key: `${order}|1`, order, table: `Table ${order}`, families, count: 1, ...extra })
const show = (notices, props = {}) => mount(NextCourseNotices, { props: { notices, ...props }, global: { mocks: { __: globalThis.__ } } })
const rows = (wrapper) => wrapper.findAll("[data-test='next-course-notice']")

describe("the notices of the next course", () => {
	it("draws nothing when there is none, and takes no room", () => {
		const wrapper = show([])

		expect(wrapper.find("[data-test='next-course-notices']").exists()).toBe(false)
		expect(wrapper.html()).not.toContain("section")
	})

	it("says the table and the course ordered", () => {
		const wrapper = show([notice("A", ["Dessert"])])

		expect(rows(wrapper)[0].text()).toContain("Table A — the next course is ordered: Desserts")
	})

	it("lists several courses, in the order the notice gives them", () => {
		const wrapper = show([notice("A", ["Main", "Dessert"])])

		expect(rows(wrapper)[0].text()).toContain("Table A — the next course is ordered: Mains, Desserts")
	})

	it("says only the table and the news when the dishes name no course", () => {
		const wrapper = show([notice("A", [])])

		expect(rows(wrapper)[0].text()).toContain("Table A — the next course is ordered")
		expect(rows(wrapper)[0].text()).not.toContain(":")
	})

	it("is one row per table, in the order it is handed, with the order it is for", () => {
		const wrapper = show([notice("B"), notice("A")])

		expect(rows(wrapper).map((row) => row.attributes("data-notice-order"))).toEqual(["B", "A"])
	})

	it("has a dismiss button of at least 44 px on each notice, that says which one is dismissed", async () => {
		const wrapper = show([notice("A"), notice("B")])
		const button = rows(wrapper)[1].find("[data-test='notice-dismiss']")

		expect(button.attributes("type")).toBe("button")
		expect(button.classes()).toContain("h-11")
		expect(button.classes().join(" ")).toMatch(/min-w-\[?44px|min-w-11|w-11/)
		expect(button.attributes("aria-label")).toContain("Table B")

		await button.trigger("click")
		expect(wrapper.emitted("dismiss")).toEqual([["B|1"]])
	})

	it("finds the ticket again when the notice is pressed", async () => {
		const wrapper = show([notice("A")])

		await rows(wrapper)[0].find("[data-test='notice-show']").trigger("click")

		expect(wrapper.emitted("show")).toEqual([["A"]])
		expect(wrapper.emitted("dismiss")).toBeUndefined()
	})

	it("shows the newest three and counts the others, so that the tickets keep their room", () => {
		const wrapper = show([notice("A"), notice("B"), notice("C"), notice("D"), notice("E")])

		expect(rows(wrapper)).toHaveLength(3)
		expect(wrapper.find("[data-test='notices-more']").text()).toBe("+2")
	})

	it("shows the next one when one is dismissed", async () => {
		const wrapper = show([notice("A"), notice("B"), notice("C"), notice("D")])
		expect(wrapper.find("[data-test='notices-more']").text()).toBe("+1")

		await wrapper.setProps({ notices: [notice("B"), notice("C"), notice("D")] })

		expect(rows(wrapper)).toHaveLength(3)
		expect(wrapper.find("[data-test='notices-more']").exists()).toBe(false)
	})

	it("is announced to a screen reader without stealing the focus", () => {
		const wrapper = show([notice("A")])
		const region = wrapper.find("[data-test='next-course-notices']")

		expect(region.attributes("role")).toBe("status")
		expect(region.attributes("aria-live")).toBe("polite")
	})

	it("is the signal's field with ink on it, and an ink button, in light and in dark alike (the design system)", () => {
		const wrapper = show([notice("A")])
		const classes = rows(wrapper)[0].classes().join(" ")
		const button = rows(wrapper)[0].find("[data-test='notice-dismiss']").classes().join(" ")

		expect(classes).toContain("bg-[#F55D1A]")
		expect(classes).toContain("text-[#141414]")
		expect(classes).not.toMatch(/text-white|bg-blue|bg-green|bg-red/)
		expect(button).toContain("bg-[#141414]")
		expect(button).toContain("text-[#FFFDF8]")
	})
})
