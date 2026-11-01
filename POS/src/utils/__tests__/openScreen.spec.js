/**
 * //// Neoffice — added file (no upstream equivalent). A screen of the restaurant opened from the till: a new tab on a desktop or a tablet,
 * //// this tab on a phone (kitchen test, 01.11).
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { openScreen } from "../openScreen"

afterEach(() => vi.restoreAllMocks())

describe("opening a screen of the restaurant", () => {
	it("opens a tab of its own by default", () => {
		const open = vi.spyOn(window, "open").mockImplementation(() => null)

		openScreen("/pos/runner?restaurant=Bistro")

		expect(open).toHaveBeenCalledWith("/pos/runner?restaurant=Bistro", "_blank")
	})

	it("opens it in this tab on a phone: no second tab to be lost in", () => {
		const open = vi.spyOn(window, "open").mockImplementation(() => null)
		const assign = vi.fn()
		const original = window.location
		Object.defineProperty(window, "location", { value: { ...original, assign }, configurable: true })

		openScreen("/pos/runner?restaurant=Bistro", { samePage: true })

		expect(assign).toHaveBeenCalledWith("/pos/runner?restaurant=Bistro")
		expect(open).not.toHaveBeenCalled()
		Object.defineProperty(window, "location", { value: original, configurable: true })
	})
})
