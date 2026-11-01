/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen alerts as a screen reads them (NeoRestau lot 1, Daniel, 01.11): the server answers `kitchen_alerts` in `get_restaurant_settings`
 * //// (pos_next.restaurant.kitchen_alerts), and a screen must never break on an answer that is missing, old or odd: whatever is not understood is the default.
 */
import { describe, expect, it } from "vitest"
import { DEFAULT_KITCHEN_ALERTS, readKitchenAlerts, secondsOf } from "../kitchenAlerts"

describe("the kitchen alerts a screen reads", () => {
	it("defaults to a popup, the bell for the next course, the beep for the runner, at medium volume", () => {
		expect(DEFAULT_KITCHEN_ALERTS).toEqual({
			popup: true,
			nextCourseSound: "bell",
			runnerSound: "beep",
			volume: "medium",
		})
		expect(readKitchenAlerts(undefined)).toEqual(DEFAULT_KITCHEN_ALERTS)
		expect(readKitchenAlerts(null)).toEqual(DEFAULT_KITCHEN_ALERTS)
		expect(readKitchenAlerts({})).toEqual(DEFAULT_KITCHEN_ALERTS)
		expect(readKitchenAlerts("junk")).toEqual(DEFAULT_KITCHEN_ALERTS)
	})

	it("reads the server's answer", () => {
		expect(
			readKitchenAlerts({ popup: false, next_course_sound: "gong", runner_sound: "none", volume: "high" }),
		).toEqual({ popup: false, nextCourseSound: "gong", runnerSound: "none", volume: "high" })
	})

	it("reads the doctype's own words as well as the server's ids", () => {
		const read = readKitchenAlerts({ next_course_sound: "Double beep", runner_sound: "Chime", volume: "Low" })

		expect([read.nextCourseSound, read.runnerSound, read.volume]).toEqual(["double_beep", "chime", "low"])
	})

	// The floor alerts of the till read their seconds the same way (the kitchen has none any more: its ticket flashes until it is started)
	it("holds the seconds of a popup to a whole number from 0 to 600", () => {
		for (const [given, expected] of [[-4, 0], [12.6, 13], [9999, 600], ["45", 45], ["junk", 30], [null, 30]]) {
			expect(secondsOf(given), String(given)).toBe(expected)
		}
	})

	it("reads a popup that is only 0 as off", () => {
		expect(readKitchenAlerts({ popup: 0 }).popup).toBe(false)
		expect(readKitchenAlerts({ popup: 1 }).popup).toBe(true)
		expect(readKitchenAlerts({ popup: null }).popup).toBe(true)
	})

	it("falls back on the default sound for one it does not know", () => {
		const read = readKitchenAlerts({ next_course_sound: "whistle", runner_sound: "", volume: "deafening" })

		expect([read.nextCourseSound, read.runnerSound, read.volume]).toEqual(["bell", "beep", "medium"])
	})
})
