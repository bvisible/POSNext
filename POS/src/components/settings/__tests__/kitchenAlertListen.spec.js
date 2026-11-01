/**
 * //// Neoffice — added file (no upstream equivalent). The Listen buttons of the kitchen alerts in the till's settings (NeoRestau lot 1, Daniel, 01.11: « choisir le son avec des choix »).
 * //// The five settings are ordinary lines of the settings list; what the list cannot draw is the button that PLAYS the sound chosen above it, at the volume chosen above it. One button
 * //// per sound, off while the sound is « None », and the press is also the touch that unlocks the browser's audio.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const preview = vi.hoisted(() => vi.fn(async () => true))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
})

vi.mock("@/utils/alertSoundPlayer", () => ({ previewAlertSound: preview }))

const { default: KitchenAlertListen } = await import("../KitchenAlertListen.vue")

const show = (props = {}) =>
	mount(KitchenAlertListen, {
		props: { nextCourseSound: "Bell", runnerSound: "Beep", volume: "Medium", ...props },
		global: { mocks: { __: globalThis.__ } },
	})
const button = (wrapper, id) => wrapper.get(`[data-test="listen-${id}"]`)

beforeEach(() => {
	preview.mockClear()
	preview.mockImplementation(async () => true)
})

describe("the Listen buttons of the kitchen alerts", () => {
	it("has one button for the next course sound and one for the dishes ready sound, named by the setting they play", () => {
		const wrapper = show()

		expect(button(wrapper, "next-course").text()).toBe("Listen · Next course sound")
		expect(button(wrapper, "runner").text()).toBe("Listen · Dishes ready sound")
		expect(button(wrapper, "next-course").attributes("aria-label")).toBe("Listen to the sound: Next course sound")
	})

	it("plays the sound chosen for each, at the volume chosen", async () => {
		const wrapper = show({ nextCourseSound: "Gong", runnerSound: "Double beep", volume: "High" })

		await button(wrapper, "next-course").trigger("click")
		await button(wrapper, "runner").trigger("click")

		expect(preview.mock.calls).toEqual([
			["gong", "high"],
			["double_beep", "high"],
		])
	})

	it("reads the defaults when a value is missing: a bell, a beep, a medium volume", async () => {
		const wrapper = show({ nextCourseSound: undefined, runnerSound: undefined, volume: undefined })

		await button(wrapper, "next-course").trigger("click")
		await button(wrapper, "runner").trigger("click")

		expect(preview.mock.calls).toEqual([
			["bell", "medium"],
			["beep", "medium"],
		])
	})

	it("is off for a sound set to « None »: nothing to listen to", async () => {
		const wrapper = show({ nextCourseSound: "None" })

		expect(button(wrapper, "next-course").attributes("disabled")).toBeDefined()
		await button(wrapper, "next-course").trigger("click")
		expect(preview).not.toHaveBeenCalled()
		expect(button(wrapper, "runner").attributes("disabled")).toBeUndefined()
	})

	it("says so when the browser cannot play, and stops saying it once a sound has played", async () => {
		preview.mockImplementationOnce(async () => false)
		const wrapper = show()

		await button(wrapper, "next-course").trigger("click")
		expect(wrapper.find('[data-test="listen-failed"]').text()).toBe("This browser cannot play the sound.")

		await button(wrapper, "next-course").trigger("click")
		expect(wrapper.find('[data-test="listen-failed"]').exists()).toBe(false)
	})

	it("says so too when the player throws", async () => {
		preview.mockImplementationOnce(async () => {
			throw new Error("no audio")
		})
		const wrapper = show()

		await button(wrapper, "runner").trigger("click")

		expect(wrapper.find('[data-test="listen-failed"]').exists()).toBe(true)
	})
})

describe("where the buttons stand in the settings screen", () => {
	const screen = readFileSync(path.resolve(__dirname, "../TillSettingsScreen.vue"), "utf8")

	it("are drawn under the kitchen_alert_listen setting, with the values of the form", () => {
		expect(screen).toMatch(/block\.setting\.key === 'kitchen_alert_listen'/)
		expect(screen).toMatch(/:next-course-sound="draft\.kitchen_next_course_sound"/)
		expect(screen).toMatch(/:runner-sound="draft\.runner_ready_sound"/)
		expect(screen).toMatch(/:volume="draft\.kitchen_alert_volume"/)
	})
})
