/**
 * //// Neoffice — added file (no upstream equivalent). The floor alerts as the till reads them (NeoRestau lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info (popup et autre) »):
 * //// a popup when a guest orders or pays from the QR code of a table, how long it stays, the sound that goes with it, and the volume the kitchen alerts already set. They are settings of the TILL
 * //// (POS Settings), read with the rest of its settings; a till whose settings do not carry them yet (a site not migrated, a copy kept before the update) reads the defaults.
 */
import { describe, expect, it } from "vitest"
import { DEFAULT_FLOOR_ALERTS, readFloorAlerts } from "../floorAlerts"

describe("the floor alerts a till reads", () => {
	it("defaults to a popup of 30 seconds, the chime, at medium volume", () => {
		expect(DEFAULT_FLOOR_ALERTS).toEqual({ popup: true, popupSeconds: 30, guestSound: "chime", volume: "medium" })
		expect(readFloorAlerts(undefined)).toEqual(DEFAULT_FLOOR_ALERTS)
		expect(readFloorAlerts(null)).toEqual(DEFAULT_FLOOR_ALERTS)
		expect(readFloorAlerts({})).toEqual(DEFAULT_FLOOR_ALERTS)
		expect(readFloorAlerts("junk")).toEqual(DEFAULT_FLOOR_ALERTS)
	})

	it("reads the till's settings, the doctype's words as they are stored", () => {
		expect(
			readFloorAlerts({ floor_guest_popup: 0, floor_popup_seconds: 0, floor_guest_sound: "Double beep", kitchen_alert_volume: "High" }),
		).toEqual({ popup: false, popupSeconds: 0, guestSound: "double_beep", volume: "high" })
	})

	it("reads every sound the doctype offers", () => {
		const read = ["None", "Bell", "Double beep", "Chime", "Gong", "Beep"].map((word) => readFloorAlerts({ floor_guest_sound: word }).guestSound)

		expect(read).toEqual(["none", "bell", "double_beep", "chime", "gong", "beep"])
	})

	it("holds the seconds to a whole number from 0 to 600", () => {
		for (const [given, expected] of [[-4, 0], [12.6, 13], [9999, 600], ["45", 45], ["junk", 30], [null, 30], ["", 30]]) {
			expect(readFloorAlerts({ floor_popup_seconds: given }).popupSeconds, String(given)).toBe(expected)
		}
	})

	it("reads a popup that is 0 as off, a missing one as on", () => {
		expect(readFloorAlerts({ floor_guest_popup: 0 }).popup).toBe(false)
		expect(readFloorAlerts({ floor_guest_popup: "0" }).popup).toBe(false)
		expect(readFloorAlerts({ floor_guest_popup: 1 }).popup).toBe(true)
		expect(readFloorAlerts({ floor_guest_popup: null }).popup).toBe(true)
		expect(readFloorAlerts({ floor_guest_popup: "" }).popup).toBe(true)
	})

	it("falls back on the chime for a sound it does not know, on medium for a volume it does not know", () => {
		const read = readFloorAlerts({ floor_guest_sound: "whistle", kitchen_alert_volume: "deafening" })

		expect([read.guestSound, read.volume]).toEqual(["chime", "medium"])
	})

	it("keeps a sound of none: the popup without a sound is a choice", () => {
		expect(readFloorAlerts({ floor_guest_sound: "None" }).guestSound).toBe("none")
	})
})
