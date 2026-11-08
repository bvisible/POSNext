//// Neoffice — added file (no upstream equivalent). Where the kitchen stands on a line of a paid table (NeoResto lot 1, the product owner, 08.11.2026: « une table payée n'est pas une table où les gens sont
//// partis », « on doit voir la table, ce qui est en cours »). A bill paid before the plates are out leaves the table seated; the waiter opens it and reads what is still to come and what is on the table.

import { showsKitchenState } from "./lineKitchenState"

// The words are the kitchen's own, already translated (Pending, Preparing, Ready, Delivered): a line the kitchen has not received (no state) says nothing.
const STATES = {
	Pending: { key: "pending", tone: "cooking" },
	Preparing: { key: "preparing", tone: "cooking" },
	Ready: { key: "ready", tone: "pass" },
	Delivered: { key: "delivered", tone: "done" },
}

// The look of each tone (a chip beside the line)
export const KITCHEN_TONES = {
	cooking: "bg-gray-100 text-gray-700",
	pass: "bg-amber-100 text-amber-800",
	done: "text-gray-400",
}

/**
 * The state of a line for the table's dialog: `{ key, tone, label }`, or null when the kitchen has not received it.
 *
 * @param {string|null|undefined} status - The line's `kds_status`
 */
export function kitchenStateOfLine(status) {
	const state = STATES[status]
	if (!state) return null
	const labels = {
		pending: __("Pending"),
		preparing: __("Preparing"),
		ready: __("Ready"),
		delivered: __("Delivered"),
	}
	return { ...state, label: labels[state.key] }
}

/** Whether a line is still to come to the table: sent to the kitchen and not delivered. */
export const isStillToServe = (status) => status === "Pending" || status === "Preparing" || status === "Ready"

/**
 * How many lines of the table's payment summary are still to come, read from the summary the dialog has just fetched: the count the floor gave when the table was touched (`fallback`)
 * is as old as the floor's last read, and a dish delivered since would still be told as to serve. A line of a station that works on paper alone is not counted: no screen marks it
 * delivered, the server does not hold the table for it either. Without a summary the fallback stands.
 *
 * @param {Array|null|undefined} items - The `items` of get_table_payment_summary (each with `kds_status` and `preparation_station`)
 * @param {number} fallback - The count the floor gave
 * @param {(station: string) => boolean} [isPaperOnly] - Whether a preparation station works on paper alone
 */
export function stillToServeCount(items, fallback = 0, isPaperOnly) {
	if (!Array.isArray(items) || !items.length) return fallback
	return items.filter((item) => isStillToServe(item.kds_status) && showsKitchenState(item, isPaperOnly)).length
}
