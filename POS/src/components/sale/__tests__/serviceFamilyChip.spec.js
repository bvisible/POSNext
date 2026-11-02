/**
 * //// Neoffice — added file (no upstream equivalent). The chip on a cart line that says which course the line belongs to,
 * //// and the four choices a tap on it opens (NeoResto lot 1, service families). The same four choices are in the line's edit
 * //// dialogs. The French comes from the real catalogue (pos_next/locale/fr.po).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"

vi.mock("frappe-ui", () => ({ createResource: vi.fn() }))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))

const CATALOGUE = path.resolve(
	__dirname,
	"../../../../../pos_next/locale/fr.po",
)

/** msgid:context -> French, for the entries of one context of the catalogue. */
function readContext(file, context) {
	const out = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgctxt === context && entry.msgid && entry.msgstr)
			out[`${entry.msgid}:${context}`] = entry.msgstr
		entry = {}
		field = null
	}
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (line.startsWith("#~")) continue
		const start = line.match(/^(msgctxt|msgid|msgstr) "(.*)"$/)
		if (start) {
			const [, name, text] = start
			if (name === "msgctxt" || (name === "msgid" && "msgstr" in entry)) flush()
			entry[name] = text
			field = name
			continue
		}
		const more = line.match(/^"(.*)"$/)
		if (more && field) entry[field] += more[1]
		else if (!line.trim()) flush()
	}
	flush()
	return out
}

let Chip
let Choice
beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	Chip = (await import("../ServiceFamilyChip.vue")).default
	Choice = (await import("../ServiceFamilyChoice.vue")).default
})
beforeEach(() => {
	window.translatedMessages = readContext(CATALOGUE, "Service family")
})
afterEach(() => {
	document.body.innerHTML = ""
})

const chipOf = (wrapper) => wrapper.find("[data-service-family-chip]")
const choices = (wrapper) => wrapper.findAll("[role=radio]")

describe("the chip of a line", () => {
	it("says the course of the line in French", () => {
		const labels = ["Drink", "Starter", "Main", "Dessert"].map((family) =>
			chipOf(mount(Chip, { props: { family } })).text(),
		)

		expect(labels).toEqual(["Boisson", "Entrée", "Plat", "Dessert"])
	})

	it("is a button when the line can still change course, and only a label once the kitchen has it", () => {
		const open = mount(Chip, { props: { family: "Starter", editable: true } })
		const sent = mount(Chip, { props: { family: "Starter", editable: false } })

		expect(chipOf(open).element.tagName).toBe("BUTTON")
		expect(chipOf(sent).element.tagName).toBe("SPAN")
	})

	it("opens the four choices on a tap, the course of the line chosen", async () => {
		const wrapper = mount(Chip, {
			props: { family: "Starter" },
			attachTo: document.body,
		})

		await chipOf(wrapper).trigger("click")

		expect(choices(wrapper).map((c) => c.text())).toEqual([
			"Boisson",
			"Entrée",
			"Plat",
			"Dessert",
		])
		expect(choices(wrapper).map((c) => c.attributes("aria-checked"))).toEqual([
			"false",
			"true",
			"false",
			"false",
		])
	})

	it("gives every choice a touch target of 44 px", async () => {
		const wrapper = mount(Chip, {
			props: { family: "Starter" },
			attachTo: document.body,
		})
		await chipOf(wrapper).trigger("click")

		for (const choice of choices(wrapper))
			expect(choice.classes()).toContain("min-h-[44px]")
	})

	it("tells the line's cart which course was chosen, and closes", async () => {
		const wrapper = mount(Chip, {
			props: { family: "Starter" },
			attachTo: document.body,
		})
		await chipOf(wrapper).trigger("click")

		await choices(wrapper)[2].trigger("click")

		expect(wrapper.emitted("change")).toEqual([["Main"]])
		expect(wrapper.find("[data-service-family-menu]").exists()).toBe(false)
	})

	it("tells nothing when the course chosen is the one the line has", async () => {
		const wrapper = mount(Chip, {
			props: { family: "Starter" },
			attachTo: document.body,
		})
		await chipOf(wrapper).trigger("click")

		await choices(wrapper)[1].trigger("click")

		expect(wrapper.emitted("change")).toBeUndefined()
	})

	it("closes on a tap outside, and on Escape", async () => {
		const wrapper = mount(Chip, {
			props: { family: "Starter" },
			attachTo: document.body,
		})
		await chipOf(wrapper).trigger("click")
		expect(wrapper.find("[data-service-family-menu]").exists()).toBe(true)

		document.body.click()
		await wrapper.vm.$nextTick()
		expect(wrapper.find("[data-service-family-menu]").exists()).toBe(false)

		await chipOf(wrapper).trigger("click")
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		await wrapper.vm.$nextTick()
		expect(wrapper.find("[data-service-family-menu]").exists()).toBe(false)
	})

	it("opens nothing on a line the kitchen has", async () => {
		const wrapper = mount(Chip, {
			props: { family: "Main", editable: false },
			attachTo: document.body,
		})

		await chipOf(wrapper).trigger("click")

		expect(wrapper.find("[data-service-family-menu]").exists()).toBe(false)
	})

	it("does not let the tap reach the cart line under it, which would open its edit dialog", async () => {
		const reachedTheLine = vi.fn()
		const wrapper = mount(
			{
				components: { Chip },
				template: '<div @click="line"><Chip family="Starter" /></div>',
				methods: { line: reachedTheLine },
			},
			{ attachTo: document.body },
		)

		await wrapper.find("[data-service-family-chip]").trigger("click")
		await wrapper.findAll("[role=radio]")[2].trigger("click")

		expect(reachedTheLine).not.toHaveBeenCalled()
	})
})

describe("the four choices, where a line's course is chosen", () => {
	it("tell how to serve a starter with the mains", () => {
		const wrapper = mount(Choice, { props: { modelValue: "Starter" } })

		expect(wrapper.text()).toContain(
			"Pour servir une entrée avec les plats, choisissez Plat.",
		)
	})

	it("can leave the help out", () => {
		const wrapper = mount(Choice, {
			props: { modelValue: "Starter", hint: false },
		})

		expect(wrapper.text()).not.toContain("Pour servir")
	})

	it("choose nothing for a line that has no course", () => {
		const wrapper = mount(Choice, { props: { modelValue: "" } })

		expect(
			choices(wrapper).every((c) => c.attributes("aria-checked") === "false"),
		).toBe(true)
	})

	it("hand back the course chosen", async () => {
		const wrapper = mount(Choice, { props: { modelValue: "Starter" } })

		await choices(wrapper)[3].trigger("click")

		expect(wrapper.emitted("update:modelValue")).toEqual([["Dessert"]])
	})

	it("can be disabled for a line the kitchen has", async () => {
		const wrapper = mount(Choice, {
			props: { modelValue: "Main", disabled: true },
		})

		await choices(wrapper)[0].trigger("click")

		expect(wrapper.emitted("update:modelValue")).toBeUndefined()
	})
})
