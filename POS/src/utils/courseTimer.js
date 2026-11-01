//// Neoffice — added file (no upstream equivalent). The timer at the head of a kitchen ticket (NeoRestau lot 1, Daniel's test of 01.11: « au sommet, on voit que le temps est toujours le temps
//// de départ […] il faudrait afficher le temps maintenant du départ du dessert »).
////
//// A table's ticket lives for the whole meal, and its dishes leave for the kitchen in courses (a line carries the time it left, `kds_sent_at`). The timer counts from the course the kitchen is
//// working on now: the oldest send among the dishes still to cook (Pending, Preparing); when none is left to cook, from the latest send (the dishes wait at the pass since then). A dish held
//// back by the waiter (Waiting) has not left and counts for nothing; a ticket whose dishes carry no time (sent before the field existed) falls back to the order's last change, as before.

//// Neoffice — the server's datetime read by hand, as the order of the tickets reads it (a browser that refuses « 2026-11-01 14:30:12.123456 » must not make the two disagree)
import { timeOf } from "@/utils/serverDateTime"

const TO_COOK = new Set(["Pending", "Preparing"])
const HELD = new Set(["", "Waiting"])

/**
 * The moment the course the kitchen is working on left, in milliseconds, or NaN when no dish says it.
 *
 * @param {Array<Object>} lines - The dishes of the ticket (`kds_status`, `kds_sent_at`)
 * @returns {number}
 */
export function courseSentAt(lines) {
	let oldestToCook = Number.POSITIVE_INFINITY
	let latestSent = Number.NEGATIVE_INFINITY
	for (const line of lines || []) {
		const status = line?.kds_status || ""
		if (HELD.has(status)) continue
		const sent = timeOf(line?.kds_sent_at)
		if (Number.isNaN(sent)) continue
		if (TO_COOK.has(status) && sent < oldestToCook) oldestToCook = sent
		if (sent > latestSent) latestSent = sent
	}
	if (Number.isFinite(oldestToCook)) return oldestToCook
	if (Number.isFinite(latestSent)) return latestSent
	return Number.NaN
}

/**
 * Where the ticket's timer starts: the course at the kitchen, else the order's last change, else its creation.
 *
 * @param {Object} order - The ticket (`items`, `modified`, `creation`)
 * @returns {Date}
 */
export function timerStart(order) {
	const sent = courseSentAt(order?.items)
	if (Number.isFinite(sent)) return new Date(sent)
	return new Date(timeOf(order?.modified || order?.creation))
}
