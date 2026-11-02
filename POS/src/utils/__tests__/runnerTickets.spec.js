/**
 * //// Neoffice — added file (no upstream equivalent). Whether the kitchen screen keeps the tickets whose dishes are all with the runner (NeoResto lot 1, Daniel, 01.11): kept, at the end of the band in preparation,
 * by default; left off the screen when the device is set so.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_SHOWN, RUNNER_TICKETS_KEY, readRunnerTickets, saveRunnerTickets, shownFromStorage } from "../runnerTickets"

beforeEach(() => window.localStorage.clear())

describe("the tickets that are with the runner", () => {
	it("stay on the screen by default: a ticket must not disappear without being asked to", () => {
		expect(DEFAULT_SHOWN).toBe(true)
		expect(readRunnerTickets()).toBe(true)
		expect(shownFromStorage(null)).toBe(true)
		expect(shownFromStorage("maybe")).toBe(true)
	})

	it("are left off the screen when the device was set so, and come back when it is set back", () => {
		saveRunnerTickets(false)

		expect(window.localStorage.getItem(RUNNER_TICKETS_KEY)).toBe("hidden")
		expect(readRunnerTickets()).toBe(false)
		saveRunnerTickets(true)
		expect(window.localStorage.getItem(RUNNER_TICKETS_KEY)).toBe("shown")
		expect(readRunnerTickets()).toBe(true)
	})

	it("keep the default for a value nobody understands", () => {
		window.localStorage.setItem(RUNNER_TICKETS_KEY, "sideways")

		expect(readRunnerTickets()).toBe(true)
	})

	it("hold for as long as the page is open when the storage refuses", () => {
		const refusing = { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } }
		const original = Object.getOwnPropertyDescriptor(window, "localStorage")
		Object.defineProperty(window, "localStorage", { value: refusing, configurable: true })
		try {
			expect(readRunnerTickets()).toBe(true)
			expect(() => saveRunnerTickets(false)).not.toThrow()
		} finally {
			Object.defineProperty(window, "localStorage", original)
		}
	})
})
