/**
 * //// Neoffice — added file (no upstream equivalent). The top of the till's tables on a phone, as the waiter mockup
 * //// draws it (NeoRestau lot 1, task 26): « Tables » in Forum on the ink bar, the till user's first name and the time
 * //// on the right; under it « List | Floor plan », two halves of 44 px, ink for the one shown. On a tablet and a PC the
 * //// floor plan keeps its line, where a small « Plan | List » switch of 32 px (the line's chips, Ruling 44) does the same.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"

globalThis.__ = (text, args = []) =>
	(args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { default: TablesPhoneTop } = await import("../TablesPhoneTop.vue")
const { default: TablesViewSwitch } = await import("../TablesViewSwitch.vue")

let wrapper
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
})

const global = { mocks: { __: globalThis.__ } }
const texts = (els) => els.map((el) => el.text().replace(/\s+/g, " ").trim())

describe("the top of the tables on a phone", () => {
	function top(props = {}) {
		wrapper = mount(TablesPhoneTop, {
			props: { view: "list", userName: "Lea Martin", time: "19:58", ...props },
			global,
		})
		return wrapper
	}

	it("says « Tables » in Forum on the ink bar", () => {
		top()

		const bar = wrapper.find('[data-test="phone-top-bar"]')
		expect(bar.classes()).toEqual(
			expect.arrayContaining(["bg-[#141414]", "text-[#FFFDF8]"]),
		)
		const title = wrapper.find('[data-test="phone-top-title"]')
		expect(title.text()).toBe("Tables")
		expect(title.classes()).toEqual(
			expect.arrayContaining(["font-display", "text-[24px]"]),
		)
	})

	it("says the till user's first name and the time on the right", () => {
		top()

		expect(wrapper.find('[data-test="phone-top-user"]').text()).toBe(
			"Lea · 19:58",
		)
	})

	it("says the time alone when the user has no name to show", () => {
		top({ userName: "" })

		expect(wrapper.find('[data-test="phone-top-user"]').text()).toBe("19:58")
	})

	it("holds the switch of the list and the plan, the list first, 44 px halves, the one shown in ink", async () => {
		top({ view: "list" })

		const halves = wrapper.findAll('[data-test="view-switch"] button')
		expect(texts(halves)).toEqual(["List", "Floor Plan"])
		for (const half of halves)
			expect(half.classes()).toEqual(
				expect.arrayContaining(["flex-1", "min-h-[44px]"]),
			)
		expect(halves[0].classes()).toEqual(
			expect.arrayContaining(["bg-[#141414]", "text-[#FFFDF8]"]),
		)
		expect(halves[0].attributes("aria-pressed")).toBe("true")
		expect(halves[1].attributes("aria-pressed")).toBe("false")

		await halves[1].trigger("click")
		expect(wrapper.emitted("update:view")).toEqual([["plan"]])
	})
})

describe("the switch of the list and the plan", () => {
	function aSwitch(props = {}) {
		wrapper = mount(TablesViewSwitch, {
			props: { view: "plan", ...props },
			global,
		})
		return wrapper
	}
	const halves = () => wrapper.findAll("button")

	it("is, on the floor plan's line, a small « Plan | List » of 32 px", () => {
		aSwitch({ size: "line" })

		expect(texts(halves())).toEqual(["Plan", "List"])
		for (const half of halves())
			expect(half.classes()).toEqual(expect.arrayContaining(["h-8", "text-sm"]))
		expect(wrapper.attributes("aria-label")).toBe("Show the tables as")
	})

	it("asks for the word « Plan » under a context of its own, never bare (another app translates the bare word)", () => {
		const asked = []
		const real = globalThis.__
		// The labels are asked for in the component's script, through the page's global translate
		globalThis.__ = (text, args, context) => {
			asked.push([text, context])
			return real(text, args)
		}
		try {
			wrapper = mount(TablesViewSwitch, {
				props: { view: "plan", size: "line" },
				global,
			})
		} finally {
			globalThis.__ = real
		}

		expect(asked).toContainEqual(["Plan", "Floor plan view, short"])
		expect(
			asked.filter(([text, context]) => text === "Plan" && !context),
		).toEqual([])
	})

	it("says which is shown, and asks for the other", async () => {
		aSwitch({ size: "line", view: "plan" })
		expect(halves().map((half) => half.attributes("aria-pressed"))).toEqual([
			"true",
			"false",
		])

		await halves()[1].trigger("click")
		expect(wrapper.emitted("update:view")).toEqual([["list"]])
	})

	it("asks nothing when the one shown is tapped again", async () => {
		aSwitch({ size: "line", view: "plan" })

		await halves()[0].trigger("click")

		expect(wrapper.emitted("update:view")).toBeUndefined()
	})
})
