//// Neoffice — added file (no upstream equivalent). The label of a kitchen status (NeoRestau lot 1, task 9).
//// An order and each dish on it go Pending, Preparing, Ready, Delivered (`kds_status` of the Sales Invoice and of its
//// items). The values are stored in English and never translated: the server, the kitchen display and the runner
//// compare them. Only what is DISPLAYED is translated, here, under a context of its own. "Pending", "Ready" and
//// "Delivered" are common words that every other app of the site translates for its own sense (an expense waiting to
//// sync, a printer that is ready), and the app loaded last wins Frappe's merged dictionary: the context keeps the
//// kitchen's sense apart without touching anyone else's word.

/**
 * The label of a kitchen status, in the user's language.
 *
 * One literal `__()` per word: the catalogue extraction reads the msgid and its context from the source, it cannot
 * follow a variable. Another status (Waiting, a dish held back and not sent yet) keeps the plain word the till
 * already translates.
 *
 * @param {string} status - A `kds_status` value
 * @returns {string} The label to show ("" for no status)
 */
export function kitchenStatusLabel(status) {
	switch (status) {
		case "Pending":
			return __("Pending", null, "Kitchen order status")
		case "Preparing":
			return __("Preparing", null, "Kitchen order status")
		case "Ready":
			return __("Ready", null, "Kitchen order status")
		case "Delivered":
			return __("Delivered", null, "Kitchen order status")
		default:
			return status ? __(status) : ""
	}
}
