/**
 * //// Neoffice — added file (no upstream equivalent). The counter of portions per course against the people seated (NeoResto lot 1, covers), under the header of an open table: « Starters 3/3 ✓ · Mains 2/3 ». One compact chip per
 * //// course that has a line, in the order of the meal; grey while it is only a count, amber while short of the people, green with a check when every guest has a portion, a « +N » when there are more than guests: no state
 * //// relies on colour alone. The chips come from utils/coverCounts (`courseChips`), the page hands over none while the covers are not set.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const { default: CoverCounter } = await import("../CoverCounter.vue")
const { courseChips } = await import("@/utils/coverCounts")

const line = (family, quantity) => ({
	item_code: `${family}-${quantity}`,
	service_family: family,
	quantity,
})

let wrapper
function counter(lines, covers) {
	wrapper = mount(CoverCounter, {
		props: { chips: courseChips(lines, covers) },
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const chips = () => wrapper.findAll('[data-test="cover-chip"]')
const textOf = (item) => item.text().replace(/\s+/g, " ")

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

describe("the counter of portions per course", () => {
	const meal = [line("Starter", 3), line("Main", 2), line("Drink", 6)]

	it("writes each course with its portions against the people: « Starters 3/3 », « Mains 2/3 »", () => {
		counter(meal, 3)

		expect(chips().map(textOf)).toEqual(["Starters 3/3", "Mains 2/3"])
	})

	it("draws the courses in the order of the meal, only the ones that have a line, and never the drinks", () => {
		counter([line("Dessert", 3), line("Starter", 3), line("Drink", 4)], 3)

		expect(chips().map((item) => item.attributes("data-family"))).toEqual([
			"Starter",
			"Dessert",
		])
	})

	it("is not drawn without chips", () => {
		counter([line("Drink", 2)], 3)
		expect(wrapper.find('[data-test="cover-counter"]').exists()).toBe(false)
		wrapper.unmount()

		counter([], 3)
		expect(wrapper.find('[data-test="cover-counter"]').exists()).toBe(false)
	})

	it("is not drawn when the page hands it nothing", () => {
		wrapper = mount(CoverCounter, { global: { mocks: { __: globalThis.__ } } })

		expect(wrapper.find('[data-test="cover-counter"]').exists()).toBe(false)
	})
})

describe("the state of each chip", () => {
	it("is amber while the course is short of the people, and says so with the numbers", () => {
		counter([line("Main", 2)], 3)

		const item = chips()[0]
		expect(item.attributes("data-state")).toBe("short")
		expect(item.classes().join(" ")).toContain("#92610C")
		expect(item.find('[data-test="cover-chip-check"]').exists()).toBe(false)
		expect(item.find('[data-test="cover-chip-over"]').exists()).toBe(false)
	})

	it("is green with a check when every guest has a portion", () => {
		counter([line("Starter", 3)], 3)

		const item = chips()[0]
		expect(item.attributes("data-state")).toBe("done")
		expect(item.classes().join(" ")).toContain("#11663A")
		expect(item.find('[data-test="cover-chip-check"]').exists()).toBe(true)
	})

	it("shows a discreet « +N » past the people, with the count", () => {
		counter([line("Dessert", 5)], 3)

		const item = chips()[0]
		expect(item.attributes("data-state")).toBe("over")
		expect(textOf(item)).toBe("Desserts 5/3 +2")
		expect(item.find('[data-test="cover-chip-check"]').exists()).toBe(false)
	})

	it("is grey, with the count alone, while the covers are unset", () => {
		counter([line("Main", 2)], null)
		// the page draws no counter without covers; handed the chips anyway the count alone is shown
		wrapper.unmount()
		wrapper = mount(CoverCounter, {
			props: {
				chips: [
					{
						family: "Main",
						label: "Mains",
						count: 2,
						covers: null,
						state: "none",
					},
				],
			},
			global: { mocks: { __: globalThis.__ } },
		})

		expect(textOf(chips()[0])).toBe("Mains 2")
		expect(chips()[0].classes().join(" ")).toContain("#524B41")
	})

	it("never relies on colour alone: each state differs by its text or its mark", () => {
		counter([line("Starter", 2), line("Main", 3), line("Dessert", 4)], 3)

		const [short, done, over] = chips()
		expect(textOf(short)).toBe("Starters 2/3")
		expect(done.find("svg").exists()).toBe(true)
		expect(textOf(over)).toContain("+1")
	})

	it("is drawn in the design system's tones, never the brand blue", () => {
		counter([line("Starter", 2), line("Main", 3), line("Dessert", 4)], 3)

		expect(wrapper.html()).not.toMatch(
			/\b(?:bg|text|border)-(?:blue|indigo|violet|purple|sky|cyan)/,
		)
	})
})
