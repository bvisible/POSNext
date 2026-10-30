/**
 * //// Neoffice — added file (no upstream equivalent). What is out of sight on the kitchen screen (NeoRestau lot 1,
 * //// task 23): the tickets of a lane or a column that scroll past the edge of the screen, and the dishes of a ticket that
 * //// scroll past the foot of the ticket. Both are counted from the boxes of the elements, so that a cook sees the
 * //// backlog ("+12") and a long ticket's missing dishes ("+4 lines") without scrolling to find out. jsdom has no
 * //// layout engine: the boxes are given by hand.
 */
import { describe, expect, it } from "vitest"
import { hiddenLines, offScreen } from "../ticketScrollHints"

/** An element with a box. */
function box({ left = 0, top = 0, width = 0, height = 0 }) {
	return {
		getBoundingClientRect: () => ({
			left,
			top,
			width,
			height,
			right: left + width,
			bottom: top + height,
		}),
	}
}

/** A lane of `count` tickets 300 px wide with 16 px between them, scrolled by `scrolled` px, in a window `window` px wide. */
function lane(count, { scrolled = 0, window = 1248 } = {}) {
	const scroller = box({ left: 16, top: 100, width: window, height: 300 })
	const items = Array.from({ length: count }, (_, index) =>
		box({
			left: 16 + index * 316 - scrolled,
			top: 100,
			width: 300,
			height: 300,
		}),
	)
	return { scroller, items }
}

describe("the tickets out of sight in a lane that scrolls sideways", () => {
	it("counts the tickets past the right edge: 4 fit, so 26 of 30 are off screen", () => {
		const { scroller, items } = lane(30)
		expect(offScreen(scroller, items, "x")).toEqual({ ahead: 26, behind: 0 })
	})

	it("counts nothing when everything fits, and when the lane is empty", () => {
		expect(offScreen(...Object.values(lane(4)), "x")).toEqual({
			ahead: 0,
			behind: 0,
		})
		expect(offScreen(...Object.values(lane(0)), "x")).toEqual({
			ahead: 0,
			behind: 0,
		})
	})

	it("follows the swipe: the tickets that went by on the left are counted apart from the ones to come", () => {
		// Two tickets swiped away
		const { scroller, items } = lane(30, { scrolled: 2 * 316 })
		expect(offScreen(scroller, items, "x")).toEqual({ ahead: 24, behind: 2 })
	})

	it("counts a ticket that is only partly visible as off screen: it is cut, so it is not seen", () => {
		// Half a ticket further along
		const { scroller, items } = lane(10, { scrolled: 150 })
		const result = offScreen(scroller, items, "x")
		expect(result.behind).toBe(1)
		expect(result.ahead).toBe(10 - 4)
	})

	it("forgives a pixel or two: a scroll position is rounded and must not add a ticket to the backlog", () => {
		const { scroller, items } = lane(5)
		// The 4th ticket ends 1 px past the edge, the 5th one is really off
		items[3] = box({ left: 16 + 3 * 316, top: 100, width: 301, height: 300 })
		expect(offScreen(scroller, items, "x").ahead).toBe(1)
		items[3] = box({ left: 16 + 3 * 316, top: 100, width: 304, height: 300 })
		expect(offScreen(scroller, items, "x").ahead).toBe(2)
	})

	it("does not count an element that is not laid out (no box at all)", () => {
		const { scroller, items } = lane(6)
		items.push(box({}))
		expect(offScreen(scroller, items, "x").ahead).toBe(2)
	})

	it("counts nothing for a scroller that is not there yet", () => {
		expect(offScreen(null, [], "x")).toEqual({ ahead: 0, behind: 0 })
		expect(offScreen(undefined, undefined, "y")).toEqual({
			ahead: 0,
			behind: 0,
		})
	})
})

describe("the tickets out of sight in a column that scrolls up and down", () => {
	function column(count, { scrolled = 0, height = 620 } = {}) {
		const scroller = box({ left: 16, top: 150, width: 300, height })
		const items = Array.from({ length: count }, (_, index) =>
			box({
				left: 16,
				top: 150 + index * 324 - scrolled,
				width: 300,
				height: 308,
			}),
		)
		return { scroller, items }
	}

	it("counts the tickets below the foot of the column, the one cut by it included", () => {
		// 308 + 16 + 308 = 632 > 620: the second one is already cut by a few pixels
		const { scroller, items } = column(30)
		expect(offScreen(scroller, items, "y")).toEqual({ ahead: 29, behind: 0 })
	})

	it("follows the swipe", () => {
		const { scroller, items } = column(30, { scrolled: 3 * 324 })
		expect(offScreen(scroller, items, "y")).toEqual({ ahead: 26, behind: 3 })
	})
})

describe("the dishes of a ticket out of sight below its foot", () => {
	/** A body with `count` dishes of 48 px, showing `shown` px of them. */
	function body(count, { shown = 150, scrolled = 0 } = {}) {
		const element = box({ left: 0, top: 0, width: 300, height: shown })
		const dishes = Array.from({ length: count }, (_, index) =>
			box({ left: 0, top: index * 48 - scrolled, width: 300, height: 48 }),
		)
		return {
			...element,
			querySelectorAll: (selector) => {
				expect(selector).toBe("[data-ticket-line]")
				return dishes
			},
		}
	}

	it("counts 22 dishes of a 25-dish ticket that shows 3", () => {
		expect(hiddenLines(body(25, { shown: 150 }))).toBe(22)
	})

	it("counts the dish that is cut by the foot of the ticket, not only the ones past it", () => {
		// 150 px show 3 dishes of 48 = 144, and 6 px of the fourth
		expect(hiddenLines(body(4, { shown: 150 }))).toBe(1)
	})

	it("counts nothing for a ticket whose dishes all fit", () => {
		expect(hiddenLines(body(3, { shown: 150 }))).toBe(0)
		expect(hiddenLines(body(0))).toBe(0)
	})

	it("counts fewer as the cook scrolls down, and none at the very end", () => {
		expect(hiddenLines(body(25, { shown: 150, scrolled: 48 * 10 }))).toBe(12)
		expect(hiddenLines(body(25, { shown: 150, scrolled: 48 * 25 - 150 }))).toBe(
			0,
		)
	})

	it("counts nothing for a ticket that is not there", () => {
		expect(hiddenLines(null)).toBe(0)
	})
})
