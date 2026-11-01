/**
 * //// Neoffice — added file (no upstream equivalent). The side of the kitchen screen where the oldest ticket stands (NeoRestau lot 1, Daniel 01.11): the left by default, the right when the device is set so.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_SIDE, OLDEST_SIDE_KEY, readOldestSide, saveOldestSide, sideFromStorage } from "../ticketSide"

beforeEach(() => window.localStorage.clear())

describe("the side where the oldest ticket stands", () => {
	it("is the left by default: a row of tickets reads from the left", () => {
		expect(DEFAULT_SIDE).toBe("left")
		expect(readOldestSide()).toBe("left")
		expect(sideFromStorage(null)).toBe("left")
		expect(sideFromStorage("middle")).toBe("left")
	})

	it("is what the device stored", () => {
		saveOldestSide("right")

		expect(window.localStorage.getItem(OLDEST_SIDE_KEY)).toBe("right")
		expect(readOldestSide()).toBe("right")
		saveOldestSide("left")
		expect(readOldestSide()).toBe("left")
	})

	it("keeps the default for a value nobody understands", () => {
		saveOldestSide("sideways")

		expect(readOldestSide()).toBe("left")
	})
})
