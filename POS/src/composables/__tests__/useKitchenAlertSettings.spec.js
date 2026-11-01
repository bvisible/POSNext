/**
 * //// Neoffice — added file (no upstream equivalent). How a kitchen or runner screen gets the alerts of its till (NeoRestau lot 1, Daniel, 01.11): it asks `get_restaurant_settings` for its restaurant (the call
 * //// a tablet already makes, answered for a device account in the shape its screen reads), keeps what the last good answer said when a later one fails, and asks again every few minutes.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h } from "vue"

const server = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return { calls: [], answer: {}, fail: false }
})
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		server.calls.push({ method, args })
		if (server.fail) throw new Error("offline")
		return server.answer
	}),
}))

const { REFRESH_MS, useKitchenAlertSettings } = await import("../useKitchenAlertSettings")

let wrapper
function mountWith(options) {
	let exposed
	wrapper = mount(
		defineComponent({
			setup() {
				exposed = useKitchenAlertSettings(options)
				return () => h("div")
			},
		}),
	)
	return exposed
}

beforeEach(() => {
	vi.useFakeTimers()
	server.calls = []
	server.fail = false
	server.answer = { kitchen_alerts: { popup: true, popup_seconds: 12, next_course_sound: "chime", runner_sound: "beep", volume: "low" } }
})
afterEach(() => {
	wrapper?.unmount()
	vi.useRealTimers()
})

describe("the alerts of a screen", () => {
	it("are the defaults until the server has answered", () => {
		const { settings } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })

		expect(settings.value).toEqual({ popup: true, popupSeconds: 30, nextCourseSound: "bell", runnerSound: "beep", volume: "medium" })
	})

	it("are read on mount from get_restaurant_settings, for the restaurant the screen is opened on", async () => {
		const { settings } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })
		await flushPromises()

		expect(server.calls).toHaveLength(1)
		expect(server.calls[0].method).toBe("pos_next.api.restaurant.get_restaurant_settings")
		expect(server.calls[0].args.restaurant).toBe("Bistro")
		expect(settings.value).toEqual({ popup: true, popupSeconds: 12, nextCourseSound: "chime", runnerSound: "beep", volume: "low" })
	})

	it("ask for no restaurant of their own when the screen names none: the server picks the tablet's or the till's", async () => {
		mountWith({})
		await flushPromises()

		expect(server.calls[0].args.restaurant).toBeUndefined()
	})

	it("keep the last good answer when a later one fails, and use the defaults when none ever came", async () => {
		server.fail = true
		const { settings } = mountWith({})
		await flushPromises()
		expect(settings.value.nextCourseSound).toBe("bell")

		server.fail = false
		await vi.advanceTimersByTimeAsync(REFRESH_MS)
		expect(settings.value.nextCourseSound).toBe("chime")

		server.fail = true
		server.answer = { kitchen_alerts: { next_course_sound: "gong" } }
		await vi.advanceTimersByTimeAsync(REFRESH_MS)
		expect(settings.value.nextCourseSound).toBe("chime")
	})

	it("follow a change made at the till, at the next reading", async () => {
		const { settings } = mountWith({})
		await flushPromises()

		server.answer = { kitchen_alerts: { next_course_sound: "gong", volume: "high" } }
		await vi.advanceTimersByTimeAsync(REFRESH_MS)

		expect([settings.value.nextCourseSound, settings.value.volume]).toEqual(["gong", "high"])
	})

	it("read an answer without alerts (a server not updated yet) as the defaults", async () => {
		server.answer = { restaurant: "Bistro", enable_runner: true }
		const { settings } = mountWith({})
		await flushPromises()

		expect(settings.value.nextCourseSound).toBe("bell")
	})

	it("stop asking when the screen is closed", async () => {
		mountWith({})
		await flushPromises()
		wrapper.unmount()
		wrapper = null

		await vi.advanceTimersByTimeAsync(REFRESH_MS * 3)

		expect(server.calls).toHaveLength(1)
	})
})

//// Neoffice — the service rhythm of the restaurant rides in the same answer (NeoRestau lot 1, Daniel, 01.11): the kitchen greys the later courses only where the room calls them
describe("the service rhythm of a screen's restaurant", () => {
	it("is the room's call until the server has answered", () => {
		const { rhythm } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })

		expect(rhythm.value).toBe("Called by the room")
	})

	it("is read in the same call as the alerts", async () => {
		server.answer = { ...server.answer, service_rhythm: "Prepared ahead" }
		const { rhythm, settings } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })
		await flushPromises()

		expect(server.calls).toHaveLength(1)
		expect(rhythm.value).toBe("Prepared ahead")
		expect(settings.value.volume).toBe("low")
	})

	it("follows a change made at the till, at the next reading", async () => {
		server.answer = { ...server.answer, service_rhythm: "Prepared ahead" }
		const { rhythm } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })
		await flushPromises()
		server.answer = { ...server.answer, service_rhythm: "Called by the room" }

		vi.advanceTimersByTime(REFRESH_MS)
		await flushPromises()

		expect(rhythm.value).toBe("Called by the room")
	})

	it("reads an answer that says nothing, or something odd, as the room's call", async () => {
		server.answer = { kitchen_alerts: server.answer.kitchen_alerts, service_rhythm: "whenever" }
		const { rhythm } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })
		await flushPromises()

		expect(rhythm.value).toBe("Called by the room")
	})

	it("keeps what the last good reading said when a later one fails", async () => {
		server.answer = { ...server.answer, service_rhythm: "Prepared ahead" }
		const { rhythm } = mountWith({ restaurant: () => ({ restaurant: "Bistro" }) })
		await flushPromises()
		server.fail = true

		vi.advanceTimersByTime(REFRESH_MS)
		await flushPromises()

		expect(rhythm.value).toBe("Prepared ahead")
	})
})
