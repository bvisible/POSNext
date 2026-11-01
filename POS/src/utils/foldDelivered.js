//// Neoffice — added file (no upstream equivalent). « Replier les services livrés » (NeoRestau lot 1, Daniel, 01.11): the cart of a table's order draws its lines by course and folds
//// the courses that are all delivered (utils/cartCourses). Whether it does is a choice of the DEVICE, like the size of the kitchen's text: a waiter who wants the flat list, every
//// delivered line greyed in its place, turns it off. ON unless the device says otherwise. Storage that is missing or refuses leaves the choice to the page for as long as it is open.

/** The courses fold unless a device says otherwise. */
export const DEFAULT_FOLD_DELIVERED = true

export const FOLD_DELIVERED_KEY = "pos_next_cart_fold_delivered"

/** The choice a device stored ("1" / "0"); anything else is the default. */
export function foldDeliveredFromStorage(value) {
	if (value === "1") return true
	if (value === "0") return false
	return DEFAULT_FOLD_DELIVERED
}

/** Reads the device's choice; storage that is missing or refuses is the default. */
export function readFoldDelivered() {
	try {
		return foldDeliveredFromStorage(window.localStorage?.getItem(FOLD_DELIVERED_KEY))
	} catch {
		return DEFAULT_FOLD_DELIVERED
	}
}

/** Keeps the device's choice; a device that cannot store keeps it for the page only. */
export function saveFoldDelivered(value) {
	try {
		window.localStorage?.setItem(FOLD_DELIVERED_KEY, value ? "1" : "0")
	} catch {
		// the choice holds for as long as the page is open
	}
}
