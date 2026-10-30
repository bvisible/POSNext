//// Neoffice — added file (no upstream equivalent). What is out of sight on the kitchen screen (NeoRestau lot 1, task 23).
//// A lane (or a column) of tickets that holds more than the screen shows, and a ticket that holds more dishes than its
//// body shows, must SAY how much is out of sight: a cook who has to scroll to find out that thirty tickets are waiting
//// has already lost the time the screen was there to save. The counts are read from the boxes of the elements on the
//// screen, so they follow the swipe, the size of the tablet and the turn of the tablet without a figure of ours.

// A scroll position is rounded by the browser: an element that ends a pixel or two past the edge is seen in full
const TOLERANCE = 2

const SIDES = { x: ["left", "right"], y: ["top", "bottom"] }

/**
 * How many items are not fully in the visible part of a scroller.
 *
 * - `ahead`: the ones that end past the far edge (right for a lane, bottom for a column or a ticket). An item that is
 *   only partly visible counts: it is cut, so it is not seen.
 * - `behind`: the ones that start before the near edge, scrolled by.
 *
 * An item with no box at all (not laid out, hidden) is not counted.
 *
 * @param {Element|null} scroller - The element that scrolls
 * @param {Iterable<Element>} items - What it holds, in any order
 * @param {"x"|"y"} [axis] - "x": a lane that scrolls sideways; "y": a column or a ticket that scrolls up and down
 * @returns {{ ahead: number, behind: number }}
 */
export function offScreen(scroller, items, axis = "x") {
	if (!scroller || !items) return { ahead: 0, behind: 0 }
	const [near, far] = SIDES[axis] || SIDES.x
	const area = scroller.getBoundingClientRect()
	let ahead = 0
	let behind = 0
	for (const item of items) {
		const box = item.getBoundingClientRect()
		if (!box.width && !box.height) continue
		if (box[far] > area[far] + TOLERANCE) ahead += 1
		if (box[near] < area[near] - TOLERANCE) behind += 1
	}
	return { ahead, behind }
}

/**
 * How many dishes of a ticket are cut by the foot of its body, or past it.
 *
 * A dish is any element of the body that carries `data-ticket-line`: the dishes sent, and the ones announced under
 * "Coming Next".
 *
 * @param {Element|null} body - The scrolling body of a ticket
 * @returns {number}
 */
export function hiddenLines(body) {
	if (!body) return 0
	return offScreen(body, body.querySelectorAll("[data-ticket-line]"), "y").ahead
}
