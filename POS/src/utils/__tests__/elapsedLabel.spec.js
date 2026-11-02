/**
 * //// Neoffice — added file (no upstream equivalent). The time a ticket has waited, as the kitchen's and the pass's tickets write it
 * //// (NeoResto lot 1): minutes and seconds up to the hour, then hours and minutes. A ticket that has stood eighteen hours read
 * //// « 1107:52 », which nobody reads.
 */
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)

const { elapsedLabel } = await import("../elapsedLabel")

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe("the time a ticket has waited", () => {
	it("is minutes and seconds under the hour, as it always was", () => {
		expect(elapsedLabel(0)).toBe("00:00")
		expect(elapsedLabel(6 * MINUTE + 38_000)).toBe("06:38")
		expect(elapsedLabel(59 * MINUTE + 59_999)).toBe("59:59")
	})

	it("is hours and minutes from the hour on, with no seconds", () => {
		expect(elapsedLabel(HOUR)).toBe("1 h 00")
		expect(elapsedLabel(HOUR + 7 * MINUTE + 52_000)).toBe("1 h 07")
		expect(elapsedLabel(18 * HOUR + 27 * MINUTE)).toBe("18 h 27")
		expect(elapsedLabel(30 * HOUR + 5 * MINUTE)).toBe("30 h 05")
	})

	it("never reads below zero when the clocks disagree", () => {
		expect(elapsedLabel(-5_000)).toBe("00:00")
		expect(elapsedLabel(undefined)).toBe("00:00")
		expect(elapsedLabel(Number.NaN)).toBe("00:00")
	})
})
