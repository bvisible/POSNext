/**
 * //// Neoffice — added file (no upstream equivalent). The « Kitchen alerts » section of the till's settings (NeoRestau lot 1, Daniel, 01.11: « le son doit être dans les réglages de la caisse, et peut-être même choisir
 * //// le son avec des choix »). A component of its own: it is handed the five values of the till's POS Settings as props, says every change with a v-model event per field, and plays the sound chosen from its
 * //// « Listen » buttons. The settings screen mounts it and saves what it says with the other settings (update_pos_settings).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const preview = vi.hoisted(() => vi.fn(async () => true))

vi.hoisted(() => {
	// Frappe's `__`: the text, its {0} {1} filled from the array
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
})

vi.mock("@/utils/alertSoundPlayer", () => ({ previewAlertSound: preview }))

const { default: KitchenAlertsSettings } = await import("../KitchenAlertsSettings.vue")

const TILL = {
	kitchenNextCoursePopup: 1,
	kitchenPopupSeconds: 30,
	kitchenNextCourseSound: "Bell",
	runnerReadySound: "Beep",
	kitchenAlertVolume: "Medium",
}

const show = (props = TILL) => mount(KitchenAlertsSettings, { props, global: { mocks: { __: globalThis.__ } } })
const field = (wrapper, label) => {
	const node = wrapper.findAll("label").find((candidate) => candidate.text() === label)
	return node ? wrapper.find(`#${node.attributes("for")}`) : null
}
const NEXT = "Next course sound"
const RUNNER = "Dishes ready sound"
const VOLUME = "Alert volume"
const POPUP = "Popup when the next course is ordered"
const SECONDS = "Popup stays (seconds)"

beforeEach(() => {
	preview.mockClear()
	preview.mockImplementation(async () => true)
})

describe("the Kitchen alerts section", () => {
	it("is one section with the five settings of the till, as the till stores them", () => {
		const wrapper = show()

		expect(wrapper.find("[data-test='kitchen-alerts-settings']").exists()).toBe(true)
		expect(wrapper.find("h4").text()).toBe("Kitchen alerts")
		expect(field(wrapper, POPUP).element.checked).toBe(true)
		expect(field(wrapper, SECONDS).element.value).toBe("30")
		expect(field(wrapper, NEXT).element.value).toBe("Bell")
		expect(field(wrapper, RUNNER).element.value).toBe("Beep")
		expect(field(wrapper, VOLUME).element.value).toBe("Medium")
	})

	it("offers the sounds of the doctype, none included, for both sounds, and three volumes", () => {
		const wrapper = show()

		for (const label of [NEXT, RUNNER]) {
			expect(field(wrapper, label).findAll("option").map((option) => option.element.value)).toEqual([
				"None",
				"Bell",
				"Double beep",
				"Chime",
				"Gong",
				"Beep",
			])
		}
		expect(field(wrapper, VOLUME).findAll("option").map((option) => option.element.value)).toEqual(["Low", "Medium", "High"])
	})

	it("shows the defaults when the till has none yet (a site not migrated): popup on, 30 s, bell, beep, medium", () => {
		const wrapper = show({})

		expect(field(wrapper, POPUP).element.checked).toBe(true)
		expect(field(wrapper, SECONDS).element.value).toBe("30")
		expect(field(wrapper, NEXT).element.value).toBe("Bell")
		expect(field(wrapper, RUNNER).element.value).toBe("Beep")
		expect(field(wrapper, VOLUME).element.value).toBe("Medium")
	})

	it("shows a till that chose otherwise, zero seconds included", () => {
		const wrapper = show({
			kitchenNextCoursePopup: 1,
			kitchenPopupSeconds: 0,
			kitchenNextCourseSound: "Gong",
			runnerReadySound: "None",
			kitchenAlertVolume: "High",
		})

		expect(field(wrapper, SECONDS).element.value).toBe("0")
		expect(field(wrapper, NEXT).element.value).toBe("Gong")
		expect(field(wrapper, RUNNER).element.value).toBe("None")
		expect(field(wrapper, VOLUME).element.value).toBe("High")
	})

	it("reads a value it does not know as the default rather than showing a blank", () => {
		const wrapper = show({ ...TILL, kitchenNextCourseSound: "Whistle", kitchenAlertVolume: "" })

		expect(field(wrapper, NEXT).element.value).toBe("Bell")
		expect(field(wrapper, VOLUME).element.value).toBe("Medium")
	})

	it("hides the seconds of the popup when the popup is off", async () => {
		const wrapper = show({ ...TILL, kitchenNextCoursePopup: 0 })

		expect(field(wrapper, POPUP).element.checked).toBe(false)
		expect(field(wrapper, SECONDS)).toBeNull()

		await wrapper.setProps({ kitchenNextCoursePopup: 1 })
		expect(field(wrapper, SECONDS)).not.toBeNull()
	})
})

describe("what the section says when a setting changes", () => {
	it("says the popup on or off as the doctype's Check, 1 or 0", async () => {
		const wrapper = show()

		await field(wrapper, POPUP).setValue(false)

		expect(wrapper.emitted("update:kitchenNextCoursePopup")).toEqual([[0]])
	})

	it("says the seconds as a whole number from 0 to 600, whatever was typed", async () => {
		const wrapper = show()
		const typed = []
		for (const value of ["45", "0", "999", "-5", "12.7"]) {
			await field(wrapper, SECONDS).setValue(value)
			typed.push(wrapper.emitted("update:kitchenPopupSeconds").at(-1)[0])
		}

		expect(typed).toEqual([45, 0, 600, 0, 13])
	})

	it("says a sound as the word the doctype stores", async () => {
		const wrapper = show()

		await field(wrapper, NEXT).setValue("Double beep")
		await field(wrapper, RUNNER).setValue("Gong")

		expect(wrapper.emitted("update:kitchenNextCourseSound")).toEqual([["Double beep"]])
		expect(wrapper.emitted("update:runnerReadySound")).toEqual([["Gong"]])
	})

	it("says a volume as the word the doctype stores", async () => {
		const wrapper = show()

		await field(wrapper, VOLUME).setValue("High")

		expect(wrapper.emitted("update:kitchenAlertVolume")).toEqual([["High"]])
	})

	it("says nothing it was not asked: showing the settings changes none of them", () => {
		const wrapper = show()

		expect(Object.keys(wrapper.emitted()).filter((name) => name.startsWith("update:"))).toEqual([])
	})
})

describe("the Listen buttons", () => {
	const listen = (wrapper, which) => wrapper.find(`[data-test='listen-${which}']`)

	it("play the sound chosen at the volume chosen, each its own", async () => {
		const wrapper = show({ ...TILL, kitchenNextCourseSound: "Chime", runnerReadySound: "Double beep", kitchenAlertVolume: "Low" })

		await listen(wrapper, "next-course").trigger("click")
		await listen(wrapper, "runner").trigger("click")

		expect(preview.mock.calls).toEqual([
			["chime", "low"],
			["double_beep", "low"],
		])
	})

	it("follow the settings as they change, with no save in between", async () => {
		const wrapper = show()
		await wrapper.setProps({ kitchenNextCourseSound: "Gong", kitchenAlertVolume: "High" })

		await listen(wrapper, "next-course").trigger("click")

		expect(preview).toHaveBeenCalledWith("gong", "high")
	})

	it("are a touch target of 44 px, labelled for a screen reader with the sound they play", () => {
		const wrapper = show()
		const button = listen(wrapper, "next-course")

		expect(button.attributes("type")).toBe("button")
		expect(button.classes()).toContain("h-11")
		expect(button.text()).toBe("Listen")
		expect(button.attributes("aria-label")).toContain("Next course sound")
	})

	it("are off for the sound none: there is nothing to listen to", async () => {
		const wrapper = show({ ...TILL, runnerReadySound: "None" })

		expect(listen(wrapper, "runner").attributes("disabled")).toBeDefined()
		await listen(wrapper, "runner").trigger("click")
		expect(preview).not.toHaveBeenCalled()
		expect(listen(wrapper, "next-course").attributes("disabled")).toBeUndefined()
	})

	it("say so when the browser cannot play, and stop saying it once it can", async () => {
		const wrapper = show()
		preview.mockImplementationOnce(async () => false)

		await listen(wrapper, "next-course").trigger("click")
		await nextTick()
		expect(wrapper.find("[data-test='listen-failed']").exists()).toBe(true)

		await listen(wrapper, "next-course").trigger("click")
		await nextTick()
		expect(wrapper.find("[data-test='listen-failed']").exists()).toBe(false)
	})

	it("do not break the section when the player throws", async () => {
		const wrapper = show()
		preview.mockImplementationOnce(async () => {
			throw new Error("no audio")
		})

		await listen(wrapper, "next-course").trigger("click")
		await nextTick()

		expect(wrapper.find("[data-test='listen-failed']").exists()).toBe(true)
	})
})
