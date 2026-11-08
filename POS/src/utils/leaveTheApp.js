//// Neoffice — added file (no upstream equivalent). The waiter's phone is not a way out of the till (the product owner, 08.11.2026: « regarder sur l'application mobile avec la webapp pour pas que
//// l'on puisse facilement sortir de l'application au niveau du serveur »). The till is installed on the phone as an app; what takes a waiter out of it is the logo that leads to the back office, the
//// links that open the desk in another window, and the Back button or swipe at the first page, which leaves the page (and the installed app with it). On the phone of a waiter none of them is there.

/**
 * Whether this is the phone of a waiter: a restaurant till, on a screen of a phone's width, used by someone who does not lay the floor out. A manager, or anyone on a tablet or a computer,
 * keeps the way to the back office.
 *
 * @param {{ restaurant?: boolean, phone?: boolean, canManageFloor?: boolean }} context
 * @returns {boolean}
 */
export function isTheWaitersPhone({ restaurant = false, phone = false, canManageFloor = false } = {}) {
	return Boolean(restaurant && phone && !canManageFloor)
}
