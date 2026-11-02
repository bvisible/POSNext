/**
 * //// Neoffice — added file (no upstream equivalent). The call of a course where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11):
 * //// which lines are sent ahead and not called yet, and the time a line counts from. Read without a screen.
 */
import { describe, expect, it } from "vitest"
import { goAt, isAhead, isUncalled } from "../courseCall"

const SENT = "2026-11-01 18:00:00.000000"
const CALLED = "2026-11-01 19:10:00.000000"
const ahead = { kds_status: "Pending", kds_ahead: 1, kds_sent_at: SENT }

describe("a line sent ahead", () => {
	it("is a line with kds_ahead, in any spelling of a Check", () => {
		for (const mark of [1, true, "1"]) expect(isAhead({ kds_ahead: mark }), String(mark)).toBe(true)
		for (const mark of [0, false, "0", "", null, undefined]) expect(isAhead({ kds_ahead: mark }), String(mark)).toBe(false)
		expect(isAhead(null)).toBe(false)
		expect(isAhead(undefined)).toBe(false)
	})

	it("is uncalled until the room calls its course", () => {
		expect(isUncalled(ahead)).toBe(true)
		expect(isUncalled({ ...ahead, kds_status: "Preparing" })).toBe(true)
		expect(isUncalled({ ...ahead, kds_status: "Ready" })).toBe(true)
		expect(isUncalled({ ...ahead, kds_called_at: CALLED })).toBe(false)
		expect(isUncalled({ ...ahead, kds_called_at: null })).toBe(true)
		expect(isUncalled({ ...ahead, kds_called_at: "" })).toBe(true)
	})

	it("is no uncalled line when it was not sent ahead, or has not left", () => {
		expect(isUncalled({ kds_status: "Pending", kds_sent_at: SENT })).toBe(false)
		expect(isUncalled({ kds_status: "Waiting", kds_ahead: 1 })).toBe(false)
		expect(isUncalled({ kds_status: "", kds_ahead: 1 })).toBe(false)
		expect(isUncalled(null)).toBe(false)
	})
})

describe("the time a line counts from", () => {
	it("is its departure for a line sent in the ordinary way", () => {
		expect(goAt({ kds_status: "Pending", kds_sent_at: SENT })).toBe(SENT)
		expect(goAt({ kds_status: "Pending", kds_sent_at: SENT, kds_called_at: CALLED })).toBe(SENT)
	})

	it("is the call for a line sent ahead, nothing while it is not called", () => {
		expect(goAt({ ...ahead, kds_called_at: CALLED })).toBe(CALLED)
		expect(goAt(ahead)).toBeFalsy()
		expect(goAt({ ...ahead, kds_called_at: "" })).toBeFalsy()
	})

	it("is nothing for no line", () => {
		expect(goAt(null)).toBeNull()
		expect(goAt(undefined)).toBeNull()
	})
})
