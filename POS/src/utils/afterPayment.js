//// Neoffice — added file (no upstream equivalent). What a restaurant's phone does once a sale is paid (NeoResto lot 1, kitchen test of 01.11): it went on
//// showing the empty cart tab, and the receipt window stayed open after Print with a close cross too small for a finger. The rules are written here, once.

/** How long the receipt window stays open after Print in a restaurant, in milliseconds: long enough to see the receipt was sent. */
export const SUCCESS_CLOSE_AFTER_PRINT_MS = 3000

/**
 * The tab of a phone to go back to once a sale is paid. A restaurant's items tab shows the floor plan while no table is open, so that is
 * the way back to the tables; a desktop shows both panes all the time and a till that is no restaurant's has nothing to go back to.
 *
 * @param {{ restaurant?: boolean, desktop?: boolean }} context
 * @returns {"items"|null}
 */
export function tabAfterPayment({ restaurant = false, desktop = false } = {}) {
	return restaurant && !desktop ? "items" : null
}

/**
 * How long the receipt window stays open after Print, 0 for « until it is closed »: a restaurant's closes by itself, a retail cashier's stays so
 * that the same receipt can be printed and then e-mailed (the choice of the fork since the success dialog's rework).
 *
 * @param {{ restaurant?: boolean }} context
 * @returns {number}
 */
export function closeAfterPrintMs({ restaurant = false } = {}) {
	return restaurant ? SUCCESS_CLOSE_AFTER_PRINT_MS : 0
}
