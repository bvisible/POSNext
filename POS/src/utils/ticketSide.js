//// Neoffice — added file (no upstream equivalent). The side of the kitchen screen where the OLDEST ticket stands (NeoResto lot 1, Daniel 01.11: he would like the oldest at the right). The tickets are in order of arrival,
//// oldest first, and have always been drawn from the left; a screen may be set to draw them from the right instead (the lane starts at the right edge, a grid fills from it). It is a choice of the DEVICE, kept like the
//// size of the text, and the default is the left, which is how a row of tickets reads and where the oldest are the first seen when there are more tickets than the screen holds.

export const SIDES = ["left", "right"]
export const DEFAULT_SIDE = "left"
export const OLDEST_SIDE_KEY = "pos_next_kitchen_oldest_side"

/** The side a device stored; anything else is the default. */
export function sideFromStorage(value) {
	return SIDES.includes(value) ? value : DEFAULT_SIDE
}

export function readOldestSide() {
	try {
		return sideFromStorage(window.localStorage?.getItem(OLDEST_SIDE_KEY))
	} catch {
		return DEFAULT_SIDE
	}
}

export function saveOldestSide(side) {
	try {
		window.localStorage?.setItem(OLDEST_SIDE_KEY, sideFromStorage(side))
	} catch {
		// the choice holds for as long as the page is open
	}
}
