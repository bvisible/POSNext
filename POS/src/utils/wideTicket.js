//// Neoffice — added file (no upstream equivalent). The WIDE card of a long ticket (NeoRestau lot 1, task 38a-3, rulings 107 and 109).
//// A ticket with many dishes first takes TWO card widths (layer 2 of the product owner's answer to « what if the text is longer than the room the cook has? »), its dishes
//// staying in ONE list: the lines are as long again, so fewer of them wrap and more of the ticket is in view before the body has to scroll (layer 3) or the cook opens it
//// full screen (layer 4). The rules are written here, once, and tested here; the kitchen's band and the runner's flow only read them.

/**
 * How many dishes a ticket may hold before it takes two card widths: MORE than this is wide. One place for the number: task 35 (the kitchen's settings card) will make it
 * a setting of the restaurant, with this value as its default (the rule of the product owner: everything is adjustable, with a sensible default).
 */
export const WIDE_TICKET_LINES = 12

/**
 * The fewest columns of a screen that let a ticket take two: a ticket twice as wide as the others in a row that holds one or two columns would leave no ticket beside it (or
 * overflow the row), so on a narrow screen a long ticket keeps one width and its body scrolls.
 */
export const WIDE_MIN_COLUMNS = 3

// The gap between two tickets (`gap-2`, utils/ticketLayout) and the width of a ticket when the page sets none (Compact, the shipped default)
const GAP_PX = 8
const FALLBACK_CARD_PX = 250

/**
 * The dishes a kitchen ticket shows: the ones sent to the stations, delivered ones included (they stay on the card, struck through). The dishes still held back
 * (« Waiting », announced under « Coming next ») are a preview, not the ticket.
 *
 * @param {{ items?: Array<{ kds_status?: string }> }} order
 * @returns {number}
 */
export function kitchenLineCount(order) {
	return (order?.items || []).filter(
		(item) => item.kds_status && item.kds_status !== "Waiting",
	).length
}

/**
 * The dishes of a kitchen ticket that still need room: the ones to cook or at the cook's hand, not the finished ones (kitchen test, 01.11). A dish that has
 * left (delivered, or at the pass) stays on the ticket struck through so that the cook sees what was sent; it takes a line to be read, not a card width to be
 * worked on, so it must not make a ticket wide. The held dishes are a preview and never count.
 *
 * @param {{ items?: Array<{ kds_status?: string }> }} order
 * @returns {number}
 */
export function kitchenLiveLineCount(order) {
	return (order?.items || []).filter(
		(item) => item.kds_status && item.kds_status !== "Waiting" && item.kds_status !== "Delivered",
	).length
}

/**
 * The dishes of a runner card, in either of its views (by table, by station): `items` holds them all.
 *
 * @param {{ items?: Array }} card
 * @returns {number}
 */
export function runnerLineCount(card) {
	return (card?.items || []).length
}

/**
 * Whether a ticket of this many dishes takes two card widths on a screen of this many columns.
 *
 * @param {number} lines - The dishes of the ticket
 * @param {number} columns - The columns of tickets that fit the area (columnsThatFit); 0 when the area has not been measured
 * @returns {boolean}
 */
export function isWideTicket(lines, columns) {
	return lines > WIDE_TICKET_LINES && columns >= WIDE_MIN_COLUMNS
}

/**
 * How many tickets of one width stand side by side in an area of this width: n cards and n - 1 gaps must fit.
 *
 * @param {number} width - The width of the area, in px
 * @param {number} [cardWidth] - The width of a ticket, in px
 * @param {number} [gap] - The gap between two, in px
 * @returns {number} 0 for an area with no width (not laid out, hidden) or a card with none
 */
export function columnsThatFit(
	width,
	cardWidth = FALLBACK_CARD_PX,
	gap = GAP_PX,
) {
	if (!(width > 0) || !(cardWidth > 0)) return 0
	return Math.max(0, Math.floor((width + gap) / (cardWidth + gap)))
}

/**
 * The width of a ticket where this element stands: the page's text size sets `--kds-card-w` on its root (utils/kitchenTextSize) and the variable is inherited.
 *
 * @param {Element|null} element
 * @returns {number} In px; Compact's width when the variable is not there (a card drawn outside the page)
 */
export function cardWidthOf(element) {
	try {
		if (!element) return FALLBACK_CARD_PX
		// The browser's own answer first (a variable is inherited, whatever sets it); an engine that does not inherit custom properties into the computed style is
		// answered by the nearest ancestor that carries the variable inline, which is how the page sets it
		let value = window
			.getComputedStyle(element)
			.getPropertyValue("--kds-card-w")
		for (let node = element; !value && node; node = node.parentElement)
			value = node.style?.getPropertyValue("--kds-card-w") || ""
		const px = Number.parseFloat(value)
		return px > 0 ? px : FALLBACK_CARD_PX
	} catch {
		return FALLBACK_CARD_PX
	}
}
