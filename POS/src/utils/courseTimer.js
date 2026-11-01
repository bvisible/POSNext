//// Neoffice — added file (no upstream equivalent). The timer at the head of a kitchen ticket (NeoRestau lot 1, Daniel's test of 01.11: « au sommet, on voit que le temps est toujours le temps
//// de départ […] il faudrait afficher le temps maintenant du départ du dessert »).
////
//// A table's ticket lives for the whole meal, and its dishes leave for the kitchen in courses (a line carries the time it left, `kds_sent_at`). The timer counts from the course the kitchen is
//// working on now: the oldest send among the dishes still to cook (Pending, Preparing); when none is left to cook, from the latest send (the dishes wait at the pass since then). A dish held
//// back by the waiter (Waiting) has not left and counts for nothing; a ticket whose dishes carry no time (sent before the field existed) falls back to the order's last change, as before.
////
//// Where the kitchen prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11), a dish sent ahead of its course counts from the room's CALL (`kds_called_at`) and from nothing until it comes (utils/courseCall.goAt):
//// no timer starts from it, and it makes no ticket late.

//// Neoffice — the server's datetime read by hand, as the order of the tickets reads it (a browser that refuses « 2026-11-01 14:30:12.123456 » must not make the two disagree)
import { timeOf } from "@/utils/serverDateTime"
//// Neoffice — the time a dish counts from is its departure, or, for a dish sent ahead of its course (the kitchen prepares ahead), the room's call: nothing until it comes (utils/courseCall)
import { goAt } from "@/utils/courseCall"

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
		const sent = timeOf(goAt(line))
		if (Number.isNaN(sent)) continue
		if (TO_COOK.has(status) && sent < oldestToCook) oldestToCook = sent
		if (sent > latestSent) latestSent = sent
	}
	if (Number.isFinite(oldestToCook)) return oldestToCook
	if (Number.isFinite(latestSent)) return latestSent
	return Number.NaN
}

/**
 * The moment the most recent send left, in milliseconds, or NaN when no dish that left says it: the latest `kds_sent_at` among the dishes sent, whatever their state now. The kitchen's notice that the next
 * course is ordered compares it from one reading to the next (utils/nextCourseWatch).
 *
 * @param {Array<Object>} lines - The dishes of the ticket (`kds_status`, `kds_sent_at`)
 * @returns {number}
 */
export function latestSendAt(lines) {
	let latest = Number.NEGATIVE_INFINITY
	for (const line of lines || []) {
		if (HELD.has(line?.kds_status || "")) continue
		const sent = timeOf(goAt(line))
		if (!Number.isNaN(sent) && sent > latest) latest = sent
	}
	return Number.isFinite(latest) ? latest : Number.NaN
}

/**
 * The moment the first of the dishes that left for the kitchen was sent, in milliseconds, or NaN when no dish says it: a ticket with an earlier send than its latest one has had a course
 * before (utils/nextCourseWatch).
 *
 * @param {Array<Object>} lines - The dishes of the ticket (`kds_status`, `kds_sent_at`)
 * @returns {number}
 */
export function earliestSendAt(lines) {
	let earliest = Number.POSITIVE_INFINITY
	for (const line of lines || []) {
		if (HELD.has(line?.kds_status || "")) continue
		const sent = timeOf(goAt(line))
		if (!Number.isNaN(sent) && sent < earliest) earliest = sent
	}
	return Number.isFinite(earliest) ? earliest : Number.NaN
}

/**
 * The dishes that left in the most recent send: the ones stamped with that very instant (every dish that leaves in one save takes the time of the save).
 *
 * @param {Array<Object>} lines - The dishes of the ticket (`kds_status`, `kds_sent_at`)
 * @returns {Array<Object>}
 */
export function linesOfLatestSend(lines) {
	const latest = latestSendAt(lines)
	if (Number.isNaN(latest)) return []
	return (lines || []).filter(
		(line) => !HELD.has(line?.kds_status || "") && timeOf(goAt(line)) === latest,
	)
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
