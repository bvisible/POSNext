//// Neoffice — added file (no upstream equivalent). The call of a course, where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11: « Oui, les deux modes »).
////
//// In a restaurant that prepares ahead, the later courses of a meal LEAVE at « Valider » marked `kds_ahead`, so that the kitchen may start and finish them; the waiter's « Commander la suite »
//// then only SIGNALS that the room wants the course now: the server stamps `kds_called_at` on its lines (restaurant.call_next_course). A line sent ahead and not called yet is UNCALLED: it is
//// at the kitchen, it counts for nothing (no running timer, no late colour, not offered to the runner), and it is the next course to call.
////
//// The time a line counts from is therefore `kds_called_at` for a line sent ahead (nothing until it is called) and `kds_sent_at` for any other. The rule is written ONCE here, for the timer,
//// the order of the tickets, the popup of the next course, the runner and the kitchen's card, and once more on the server (pos_next/restaurant/service_families.py: is_uncalled, go_time),
//// both tested against the same examples (pos_next/tests/service_family_cases.json for the plan, the specs of each reader for the time).

import { hasLeftForTheKitchen } from "./lineKitchenState"

/** Whether a line left for the kitchen before its course was called (`kds_ahead`, a Check: 1, true or "1"). */
export function isAhead(line) {
	return Boolean(Number(line?.kds_ahead))
}

/** Whether a line left ahead and the room has not called its course yet: the next course to call. A line held back (Waiting) has not left, so it is not. */
export function isUncalled(line) {
	return isAhead(line) && hasLeftForTheKitchen(line) && !line?.kds_called_at
}

/**
 * The time a line counts from: the room's call for a line sent ahead (nothing while it is not called), the time it left for any other.
 *
 * @param {Object|null|undefined} line - `kds_ahead`, `kds_called_at`, `kds_sent_at`
 * @returns {string|Date|number|null|undefined} The server's datetime, empty when the line counts from nothing
 */
export function goAt(line) {
	if (!line) return null
	return isAhead(line) ? line.kds_called_at : line.kds_sent_at
}
