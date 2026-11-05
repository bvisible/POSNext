/**
 * //// Neoffice — added file (no upstream equivalent). The hour a business day begins is a line of the till's settings
 * //// screen (NeoResto lot 1, Daniel, 05.11.2026): a field for a time of day, in red while it is not one, and Save waits.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ call: vi.fn() }))

const { default: TillSettingField } = await import("../TillSettingField.vue")
const { isTimeOfDay } = await import("../tillSettingsForm")

const SETTING = {
	key: "business_day_start",
	widget: "time",
	label: "Business day starts at",
	help: "",
	editable: true,
	options: [],
}

function field(props = {}) {
	return mount(TillSettingField, {
		props: { setting: SETTING, modelValue: "05:00", ...props },
		global: { mocks: { __: globalThis.__ } },
	})
}

describe("the business day start field", () => {
	it("is a time input that shows the hour the server sent", () => {
		const input = field().get("input")

		expect(input.attributes("type")).toBe("time")
		expect(input.element.value).toBe("05:00")
		expect(input.attributes("aria-invalid")).toBe("false")
	})

	it("sends the hour as it is typed, HH:MM", async () => {
		const wrapper = field()
		const input = wrapper.get("input")

		input.element.value = "03:30"
		await input.trigger("input")

		expect(wrapper.emitted("update:modelValue")).toEqual([["03:30"]])
	})

	it("says in red that an unfinished hour is not one", () => {
		const input = field({ modelValue: "" }).get("input")

		expect(input.attributes("aria-invalid")).toBe("true")
	})

	it("is closed while the setting it belongs to is off", () => {
		expect(field({ greyed: true }).get("input").attributes("disabled")).toBeDefined()
		expect(field({ locked: true }).get("input").attributes("disabled")).toBeDefined()
	})
})

describe("a time of day", () => {
	it("is two digits, a colon and two digits, 00:00 to 23:59", () => {
		for (const good of ["00:00", "05:00", "12:30", "23:59"]) expect(isTimeOfDay(good)).toBe(true)
		for (const bad of ["24:00", "5:00", "12:60", "05:00:00", "", null, undefined, "abc", 500])
			expect(isTimeOfDay(bad)).toBe(false)
	})
})
