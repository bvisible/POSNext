/**
 * //// Neoffice — added file (no upstream equivalent). The Listen button of the floor alerts in the till's settings (NeoResto lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info »): the same
 * //// component as the kitchen's buttons, asked for the till's own sound. It plays the sound chosen above it, at the volume of the kitchen alerts, and the press is also the touch that unlocks the browser's audio.
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
		props: { which: "floor", guestSound: "Chime", volume: "Medium", ...props },
		global: { mocks: { __: globalThis.__ } },
	})
const guest = (wrapper) => wrapper.get('[data-test="listen-guest"]')

beforeEach(() => {
	preview.mockClear()
	preview.mockImplementation(async () => true)
})

describe("the Listen button of the floor alerts", () => {
	it("is one button for the guest order sound, named by the setting it plays, and none of the kitchen's", () => {
		const wrapper = show()

		expect(guest(wrapper).text()).toBe("Listen · Guest order sound")
		expect(guest(wrapper).attributes("aria-label")).toBe("Listen to the sound: Guest order sound")
		expect(wrapper.find('[data-test="listen-next-course"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="listen-runner"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="floor-alert-listen"]').exists()).toBe(true)
	})

	it("plays the sound chosen, at the volume chosen", async () => {
		const wrapper = show({ guestSound: "Double beep", volume: "High" })

		await guest(wrapper).trigger("click")

		expect(preview.mock.calls).toEqual([["double_beep", "high"]])
	})

	it("reads the defaults when a value is missing: a chime, a medium volume", async () => {
		const wrapper = show({ guestSound: undefined, volume: undefined })

		await guest(wrapper).trigger("click")

		expect(preview.mock.calls).toEqual([["chime", "medium"]])
	})

	it("is off for a sound set to « None »: nothing to listen to", async () => {
		const wrapper = show({ guestSound: "None" })

		expect(guest(wrapper).attributes("disabled")).toBeDefined()
		await guest(wrapper).trigger("click")
		expect(preview).not.toHaveBeenCalled()
	})

	it("says so when the browser cannot play", async () => {
		preview.mockImplementationOnce(async () => false)
		const wrapper = show()

		await guest(wrapper).trigger("click")

		expect(wrapper.find('[data-test="listen-failed"]').text()).toBe("This browser cannot play the sound.")
	})

	it("leaves the kitchen's buttons as they were: two buttons, for the kitchen's two sounds", () => {
		const wrapper = mount(KitchenAlertListen, {
			props: { nextCourseSound: "Bell", runnerSound: "Beep", volume: "Medium" },
			global: { mocks: { __: globalThis.__ } },
		})

		expect(wrapper.findAll("button").map((button) => button.attributes("data-test"))).toEqual(["listen-next-course", "listen-runner"])
		expect(wrapper.find('[data-test="kitchen-alert-listen"]').exists()).toBe(true)
	})
})

describe("where the button stands in the settings screen", () => {
	const screen = readFileSync(path.resolve(__dirname, "../TillSettingsScreen.vue"), "utf8")

	it("is drawn under the floor_alert_listen setting, with the sound and the volume of the form", () => {
		expect(screen).toMatch(/block\.setting\.key === 'floor_alert_listen'/)
		expect(screen).toMatch(/:guest-sound="draft\.floor_guest_sound"/)
		expect(screen).toMatch(/which="floor"/)
		// The volume is the kitchen alerts': one volume for the sounds of the till and of its tablets
		const block = screen.slice(screen.indexOf("floor_alert_listen"))
		expect(block).toMatch(/:volume="draft\.kitchen_alert_volume"/)
	})
})
