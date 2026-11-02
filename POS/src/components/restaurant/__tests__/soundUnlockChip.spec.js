/**
 * //// Neoffice — added file (no upstream equivalent). The discreet chip of the kitchen and runner screens that says a sound is enabled but the browser has not been touched yet (NeoResto lot 1, Daniel, 01.11):
 * //// a page may not make a sound before somebody touches it, and a tablet in a kitchen is left alone for hours, so the screen says « Touch the screen to enable the sound » until it is touched.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const player = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return { locked: null, supported: true, listen: null, unlock: null }
})
vi.mock("@/utils/alertSoundPlayer", async () => {
	const { ref } = await import("vue")
	player.locked = ref(true)
	player.listen = vi.fn()
	player.unlock = vi.fn(async () => true)
	return {
		alertSoundsLocked: player.locked,
		alertSoundsSupported: () => player.supported,
		listenForFirstTouch: player.listen,
		unlockAlertSounds: player.unlock,
	}
})

const { default: SoundUnlockChip } = await import("../SoundUnlockChip.vue")
const show = (props = { enabled: true }) => mount(SoundUnlockChip, { props, global: { mocks: { __: globalThis.__ } } })

beforeEach(() => {
	player.locked.value = true
	player.supported = true
	player.listen.mockClear()
	player.unlock.mockClear()
})

describe("the chip « touch the screen to enable the sound »", () => {
	it("shows while a sound is enabled and the page has not been touched", () => {
		const wrapper = show()

		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(true)
		expect(wrapper.text()).toContain("Touch the screen to enable the sound")
	})

	it("waits for the first touch of the page, to unlock the audio with it", () => {
		show()

		expect(player.listen).toHaveBeenCalled()
	})

	it("goes as soon as the audio is unlocked", async () => {
		const wrapper = show()
		player.locked.value = false
		await nextTick()

		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(false)
	})

	it("comes back when the system takes the audio again (a tablet that slept)", async () => {
		player.locked.value = false
		const wrapper = show()
		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(false)

		player.locked.value = true
		await nextTick()

		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(true)
	})

	it("is not there when no sound is enabled: nothing needs the audio", () => {
		const wrapper = show({ enabled: false })

		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(false)
	})

	it("starts listening when a sound gets enabled after the screen opened", async () => {
		const wrapper = show({ enabled: false })
		player.listen.mockClear()

		await wrapper.setProps({ enabled: true })

		expect(player.listen).toHaveBeenCalled()
		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(true)
	})

	it("is not there on a browser that cannot make a sound at all", () => {
		player.supported = false
		const wrapper = show()

		expect(wrapper.find("[data-test='sound-unlock']").exists()).toBe(false)
	})

	it("unlocks the audio when it is pressed itself", async () => {
		const wrapper = show()

		await wrapper.find("[data-test='sound-unlock']").trigger("click")

		expect(player.unlock).toHaveBeenCalled()
	})

	it("is a touch target of 44 px, and keeps its words for a screen reader where only its icon is drawn", () => {
		const button = show().find("[data-test='sound-unlock']")

		expect(button.classes()).toContain("h-11")
		expect(button.attributes("type")).toBe("button")
		expect(button.attributes("aria-label")).toBe("Touch the screen to enable the sound")
	})
})
