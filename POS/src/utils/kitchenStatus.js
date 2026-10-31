//// Neoffice — added file (no upstream equivalent). The label of a kitchen status (NeoRestau lot 1, task 9).
//// An order and each dish on it go Pending, Preparing, Ready, Delivered (`kds_status` of the Sales Invoice and of its
//// items). The values are stored in English and never translated: the server, the kitchen display and the runner
//// compare them. Only what is DISPLAYED is translated, here, under a context of its own. "Pending", "Ready" and
//// "Delivered" are common words that every other app of the site translates for its own sense (an expense waiting to
//// sync, a printer that is ready), and the app loaded last wins Frappe's merged dictionary: the context keeps the
//// kitchen's sense apart without touching anyone else's word.
////
//// Neoffice — a BADGE says the state, a BUTTON says the action (task 38a-1, ruling 113). The two shared their words
//// ("Start" on the button, "Ready" on both) and « En attente » was the French of two different states, so a cook read
//// « Prêt » on a dish that was still to be carried to the table. The states keep the context « Kitchen order status » and
//// say what the dish IS: Retenu (held back by the waiter), En attente (to start), En préparation, À livrer (ready at
//// the pass), Livré. The actions have their own words under « Kitchen action » and say what the cook DOES: Commencer,
//// C'est prêt, Livrer (Remettre for a takeaway). A word is never used for both, in any context.

/**
 * The label of a kitchen STATE, in the user's language: what a badge or a filter says.
 *
 * One literal `__()` per word: the catalogue extraction reads the msgid and its context from the source, it cannot
 * follow a variable. Another status (Cleaning, say) keeps the plain word the till already translates.
 *
 * @param {string} status - A `kds_status` value
 * @param {{ takeaway?: boolean }} [options] - A takeaway order that is ready is « to hand over », not « to deliver »
 * @returns {string} The label to show ("" for no status)
 */
export function kitchenStatusLabel(status, { takeaway = false } = {}) {
	// A takeaway is handed over across a counter, it is not carried to a table
	if (takeaway && status === "Ready")
		return __("To hand over", null, "Kitchen order status")
	switch (status) {
		case "Waiting":
			return __("Waiting", null, "Kitchen order status")
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

/**
 * The label of a kitchen ACTION, in the user's language: what a button says.
 *
 * - `start`: begin cooking (a ticket whose dishes are all Pending)
 * - `ready`: the dish is done and goes to the pass (the last action of a kitchen with a runner)
 * - `deliver`: the plate leaves for the table (the last action of a kitchen with no runner; « Remettre » for a takeaway)
 *
 * @param {"start"|"ready"|"deliver"} action
 * @param {{ takeaway?: boolean }} [options]
 * @returns {string} The label to show ("" for an action this file does not know)
 */
export function kitchenActionLabel(action, { takeaway = false } = {}) {
	switch (action) {
		case "start":
			return __("Start cooking", null, "Kitchen action")
		case "ready":
			return __("Mark ready", null, "Kitchen action")
		case "deliver":
			return takeaway
				? __("Hand over", null, "Kitchen action")
				: __("Deliver", null, "Kitchen action")
		default:
			return ""
	}
}
