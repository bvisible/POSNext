/**
 * //// Neoffice — added file (no upstream equivalent). A setting of the till's screen says why it is greyed when the reason is a fact of the site (the site's
 * //// booking does not answer for this till), and cites the source of the rule it turns into a choice beside it, with what kind of source it is
 * //// (product owner, 13.11.2026: « la source citée à côté », « source secondaire »).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ call: vi.fn() }))

const { default: TillSettingField } = await import("../TillSettingField.vue")

const APPOINTMENTS = {
	key: "enable_appointments",
	widget: "check",
	label: "Appointments till",
	help: "The till shows the day's agenda.",
	editable: true,
	options: [],
	sources: [],
	greyed_reason: "The site's booking does not answer for this till yet.",
}
const VAT = {
	key: "till_tip_tax_template",
	widget: "select",
	label: "VAT of the tip",
	help: "0 % is proposed.",
	editable: true,
	options: [],
	sources: [
		{ label: "The conditions of the Federal Tax Administration, as reported by the Beobachter", url: "https://www.beobachter.ch/x", note: "Secondary source" },
		{ label: "No source found for the commission", url: null, note: "No source" },
	],
}

const field = (setting, props = {}) =>
	mount(TillSettingField, { props: { setting, modelValue: 0, ...props }, global: { mocks: { __: globalThis.__ } } })

describe("a setting greyed for want of a fact of the site", () => {
	it("says why, in a line that is not dimmed with the rest", () => {
		const wrapper = field(APPOINTMENTS, { greyed: true })

		const reason = wrapper.get("[data-test='setting-greyed-reason']")

		expect(reason.text()).toBe("The site's booking does not answer for this till yet.")
		expect(wrapper.attributes("data-greyed")).toBe("true")
		// Only what is not the reason is dimmed
		expect(wrapper.classes().join(" ")).toContain("[&>*:not([data-reason])]:opacity-[0.42]")
		expect(wrapper.classes()).not.toContain("opacity-[0.42]")
		expect(reason.attributes("data-reason")).toBeDefined()
	})

	it("keeps the box closed", () => {
		expect(field(APPOINTMENTS, { greyed: true }).get("input").attributes("disabled")).toBeDefined()
	})

	it("is dimmed as every other greyed setting when it has no reason to give", () => {
		const wrapper = field({ ...APPOINTMENTS, greyed_reason: undefined }, { greyed: true })

		expect(wrapper.classes()).toContain("opacity-[0.42]")
		expect(wrapper.find("[data-test='setting-greyed-reason']").exists()).toBe(false)
	})

	it("says nothing when it is not greyed", () => {
		const wrapper = field(APPOINTMENTS)

		expect(wrapper.find("[data-test='setting-greyed-reason']").exists()).toBe(false)
		expect(wrapper.classes().join(" ")).not.toContain("opacity")
	})
})

describe("the source of the rule behind a setting", () => {
	const open = async (setting) => {
		const wrapper = field(setting)
		await wrapper.get(".help-bulb").trigger("click")
		return wrapper
	}

	it("is cited under the help, as a link that opens elsewhere, with the kind of source it is", async () => {
		const wrapper = await open(VAT)

		const sources = wrapper.get("[data-test='setting-sources']")
		const link = sources.get("a")

		expect(link.attributes("href")).toBe("https://www.beobachter.ch/x")
		expect(link.attributes("target")).toBe("_blank")
		expect(link.attributes("rel")).toContain("noopener")
		expect(sources.text()).toContain("Secondary source")
	})

	it("says that no source was found instead of linking to nothing", async () => {
		const wrapper = await open(VAT)

		const items = wrapper.findAll("[data-test='setting-sources'] li")

		expect(items).toHaveLength(2)
		expect(items[1].find("a").exists()).toBe(false)
		expect(items[1].text()).toContain("No source found for the commission")
		expect(items[1].text()).toContain("No source")
	})

	it("draws no list for a setting that has none", async () => {
		const wrapper = await open(APPOINTMENTS)

		expect(wrapper.find("[data-test='setting-sources']").exists()).toBe(false)
		expect(wrapper.get(".till-setting-help").text()).toBe("The till shows the day's agenda.")
	})

	it("stays closed until the bulb is pressed", () => {
		expect(field(VAT).find("[data-test='setting-sources']").exists()).toBe(false)
	})
})
