/**
 * //// Neoffice — added file (no upstream equivalent). On the phone's card a touch is +1 and a long press opens the
 * //// options (NeoResto lot 1, task 27). A waiter scrolls the card with the same finger: a press that moves more
 * //// than a few pixels is a scroll, never a long press, and never a +1 either.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LONG_PRESS_MS, SCROLL_SLOP_PX, usePressGesture } from "../usePressGesture"

const STEAK = { key: "steak" }
const WATER = { key: "water" }

const at = (x, y, extra = {}) => ({ clientX: x, clientY: y, button: 0, pointerType: "touch", ...extra })
const click = (extra = {}) => ({ detail: 1, preventDefault: vi.fn(), ...extra })

let onTap
let onLongPress
let press

beforeEach(() => {
	vi.useFakeTimers()
	onTap = vi.fn()
	onLongPress = vi.fn()
	press = usePressGesture({ onTap, onLongPress })
})

afterEach(() => {
	press.dispose()
	vi.useRealTimers()
})

describe("a touch on a card button", () => {
	it("is a tap when it is short", () => {
		press.down(STEAK, at(10, 10))
		vi.advanceTimersByTime(120)
		press.up(at(10, 10))
		press.click(STEAK, click())

		expect(onTap).toHaveBeenCalledTimes(1)
		expect(onTap).toHaveBeenCalledWith(STEAK)
		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("is a long press when held, and the click that follows adds nothing", () => {
		press.down(STEAK, at(10, 10))
		vi.advanceTimersByTime(LONG_PRESS_MS)

		expect(onLongPress).toHaveBeenCalledTimes(1)
		expect(onLongPress).toHaveBeenCalledWith(STEAK)

		press.up(at(10, 10))
		press.click(STEAK, click())
		expect(onTap).not.toHaveBeenCalled()
	})

	it("stays a tap or a long press when the finger trembles a little", () => {
		press.down(STEAK, at(10, 10))
		press.move(at(10 + SCROLL_SLOP_PX - 2, 12))
		vi.advanceTimersByTime(LONG_PRESS_MS)

		expect(onLongPress).toHaveBeenCalledTimes(1)
	})
})

describe("a scroll that starts on a card button", () => {
	it("never opens the options, however long the finger stays", () => {
		press.down(STEAK, at(10, 100))
		press.move(at(10, 100 - SCROLL_SLOP_PX - 5))
		vi.advanceTimersByTime(LONG_PRESS_MS * 3)

		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("adds nothing when the finger lifts on the button", () => {
		press.down(STEAK, at(10, 100))
		press.move(at(10, 60))
		press.up(at(10, 60))
		press.click(STEAK, click())

		expect(onTap).not.toHaveBeenCalled()
		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("taken over by the browser (pointercancel) opens nothing", () => {
		press.down(STEAK, at(10, 100))
		press.cancel()
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)

		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("does not swallow the next real tap", () => {
		press.down(STEAK, at(10, 100))
		press.move(at(10, 40))
		press.cancel()
		vi.advanceTimersByTime(2000)

		press.down(STEAK, at(10, 10))
		press.up(at(10, 10))
		press.click(STEAK, click())
		expect(onTap).toHaveBeenCalledTimes(1)
	})

	it("leaving the button while pressed (a mouse) is no long press", () => {
		press.down(STEAK, at(10, 10, { pointerType: "mouse" }))
		press.leave()
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)

		expect(onLongPress).not.toHaveBeenCalled()
	})

	it("a leave after the finger lifted does not cancel the tap (a touch fires it before the click)", () => {
		press.down(WATER, at(10, 10))
		press.up(at(10, 10))
		press.leave()
		press.click(WATER, click())

		expect(onTap).toHaveBeenCalledWith(WATER)
	})
})

describe("without a finger", () => {
	it("a keyboard's click is a tap", () => {
		press.click(WATER, click({ detail: 0 }))

		expect(onTap).toHaveBeenCalledWith(WATER)
	})

	it("a right click or the menu key opens the options, and a secondary button starts no long press", () => {
		press.down(WATER, at(10, 10, { button: 2, pointerType: "mouse" }))
		vi.advanceTimersByTime(LONG_PRESS_MS * 2)
		expect(onLongPress).not.toHaveBeenCalled()

		const menu = { preventDefault: vi.fn() }
		press.contextmenu(WATER, menu)
		expect(menu.preventDefault).toHaveBeenCalled()
		expect(onLongPress).toHaveBeenCalledTimes(1)
	})

	it("the menu a long touch raises (Android) does not open the options twice", () => {
		press.down(STEAK, at(10, 10))
		vi.advanceTimersByTime(LONG_PRESS_MS)
		const menu = { preventDefault: vi.fn() }
		press.contextmenu(STEAK, menu)

		expect(menu.preventDefault).toHaveBeenCalled()
		expect(onLongPress).toHaveBeenCalledTimes(1)
	})
})
