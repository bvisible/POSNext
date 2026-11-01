//// Neoffice — added file (no upstream equivalent). The kitchen screen splits its tickets into two bands, the ones WAITING
//// (nothing begun on them) and the ones IN PREPARATION (at least one dish begun), each in order of arrival (NeoRestau
//// lot 1, task 23). The split and the order are written ONCE, here, and only read by the screen, so that a rule is
//// changed in one place and tested without a screen.

//// Neoffice — the parser of the server's datetimes and the time the course at the kitchen left are shared with the ticket's timer (utils/courseTimer)
import { courseSentAt } from "@/utils/courseTimer"
import { timeOf } from "@/utils/serverDateTime"
//// Neoffice — a dish sent ahead of its course and not called yet is not what a ticket waits for (the service rhythm, NeoRestau lot 1, Daniel, 01.11)
import { isUncalled } from "@/utils/courseCall"

export const BAND_WAITING = "waiting"
export const BAND_PRODUCTION = "production"

// A dish a cook has begun on and that has not left the kitchen: it makes its ticket "in preparation".
const BEGUN = new Set(["Preparing", "Ready"])
// A dish sent to the kitchen and not yet delivered: the dishes the ticket is about
const LIVE = new Set(["Pending", "Preparing", "Ready"])

const orLast = (time) =>
	Number.isFinite(time) ? time : Number.POSITIVE_INFINITY

/**
 * The time an order reached the kitchen, as milliseconds: the time the course at the kitchen LEFT (the dishes carry it, `kds_sent_at`),
 * else the time it was LAST SENT, which is the order's `modified`.
 *
 * Why not `creation`: the Sales Invoice behind a table is the table's tab. It is created by the first "Valider" and then
 * lives for the whole meal, so a table that sends its mains an hour later carries the `creation` of its starters: sorted
 * by it, the newest dishes in the kitchen would sit at the head of the queue, ahead of tickets that have waited longer.
 * `modified` moves with every send, and it is the time the ticket's big timer counts from (KDSOrderCard), so the order of
 * the tickets and the numbers on them always agree: the biggest timer comes first. A ticket nobody has acted on since it
 * was sent (all of the waiting band) has its send time in `modified`; one that has been acted on has the time of that
 * action, and the ones started or finished sort by it, ready tickets drifting after the ones still cooking.
 *
 * `creation` stands in when there is no `modified`. A ticket whose time cannot be read sorts last: it must not pass for
 * the oldest and jump the queue.
 *
 * @param {object} order - An order of `get_kds_orders`
 * @returns {number} Milliseconds, Infinity when unreadable
 */
export function arrivalOf(order) {
	//// Neoffice — the ticket's timer counts from the course at the kitchen (utils/courseTimer), so the order of the tickets counts from it too: a change that moves the
	//// order's `modified` for another reason (a drink added to the table) must not send a ticket whose dishes have waited for half an hour to the end of the queue.
	const course = courseSentAt(order?.items)
	if (Number.isFinite(course)) return course
	const modified = timeOf(order?.modified)
	if (Number.isFinite(modified)) return modified
	return orLast(timeOf(order?.creation))
}

/**
 * The status a ticket shows: Pending, Preparing, Ready or Delivered, from the DISHES the screen shows.
 *
 * The order's own status cannot be the one on its own: with a station chosen the screen sees only that station's dishes, and the
 * order's status can lag behind what it shows (it said "Pending" while a dish was cooking until task 38b, when the server began to
 * write on the order the status ALL its dishes give it, by this very rule: `_order_status_of`, tested against the same table of
 * examples, pos_next/tests/kitchen_status_cases.json). The look of a ticket (its border,
 * its badge, its main button) and the band it is drawn in follow its dishes, and with a station chosen the dishes shown are
 * that station's own (the server sends no others). One rule, here, for both:
 *
 * - Pending: no dish is begun. Every dish sent is still Pending (a dish held back, Waiting, is not on the ticket to cook).
 * - Preparing: at least one dish is Preparing or Ready, and not all are Ready.
 * - Ready: every dish sent is Ready.
 * - Delivered: the order says so, or every dish does.
 *
 * A Delivered dish is finished business and says nothing about the dishes still to cook: a table whose starters are
 * delivered and whose mains have just been sent is Pending, not in preparation. (The tickets keep the delivered dishes,
 * struck through, for the whole meal.)
 *
 * What the server sent and says nothing about (no dish, a dish with no status) is Pending: the screen never hides a
 * ticket it was given without a reason.
 *
 * @param {object} order - An order of `get_kds_orders`
 * @returns {"Pending"|"Preparing"|"Ready"|"Delivered"}
 */
export function kitchenStatusOf(order) {
	//// Neoffice — a ticket the kitchen view keeps with no dish left to cook (utils/kitchenRunner, `view_state`; Daniel, 01.11: it stays, struck through): all its dishes are at
	//// the pass, so it is Ready and waits in the band in preparation until the runner delivers; or its starters are done and its mains held back, so it is in preparation. A view-only
	//// word: the order's own status (and the shared table of examples with the server) says Delivered for both and is left as it is.
	if (order?.view_state === "at-the-pass") return "Ready"
	if (order?.view_state === "next-course") return "Preparing"
	if (order?.kds_status === "Delivered") return "Delivered"
	const lines = order?.items || []
	const live = lines.filter((line) => LIVE.has(line?.kds_status))
	if (!live.length)
		return lines.some((line) => line?.kds_status === "Delivered")
			? "Delivered"
			: "Pending"
	//// Neoffice — where the kitchen prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11), a dish that left ahead of its course and is not called yet is at the kitchen, which may start and finish it, but it is not
	//// what the ticket waits for: while some other dish is live the ticket follows the others alone (the server's `_order_status_of`, the same table of examples, `ahead_cases`). When only such dishes are live the ticket is Pending
	//// until one is begun and Preparing after that, never Ready: nothing waits at the pass for a course nobody called.
	const called = live.filter((line) => !isUncalled(line))
	if (!called.length)
		return live.some((line) => BEGUN.has(line.kds_status)) ? "Preparing" : "Pending"
	if (!called.some((line) => BEGUN.has(line.kds_status))) return "Pending"
	return called.every((line) => line.kds_status === "Ready")
		? "Ready"
		: "Preparing"
}

/**
 * The band an order belongs to, null when it is gone from the screen (delivered): the band of the status it shows.
 *
 * - WAITING: Pending, no dish has begun.
 * - PRODUCTION: Preparing or Ready. An order whose dishes are all Ready stays here, with its ready look, until it is
 *   delivered.
 * - null: Delivered.
 *
 * @param {object} order - An order of `get_kds_orders`
 * @returns {"waiting"|"production"|null}
 */
export function bandOf(order) {
	switch (kitchenStatusOf(order)) {
		case "Pending":
			return BAND_WAITING
		case "Preparing":
		case "Ready":
			return BAND_PRODUCTION
		default:
			return null
	}
}

export function byArrival(a, b) {
	const first = arrivalOf(a)
	const second = arrivalOf(b)
	if (first !== second) return first < second ? -1 : 1
	// The same instant: the table opened first comes first, then the name, so that two screens agree and nothing flickers
	const opened = orLast(timeOf(a?.creation))
	const openedOther = orLast(timeOf(b?.creation))
	if (opened !== openedOther) return opened < openedOther ? -1 : 1
	return String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
}

/**
 * Splits orders into the two bands, each oldest first.
 *
 * The orders returned are the ones handed over, not copies: a ticket updates its own order optimistically (a dish begun,
 * a status pressed) and the screen has to see it.
 *
 * @param {object[]} orders
 * @param {{ includeDelivered?: boolean }} [options] - Bring the delivered orders back, at the end of the production band,
 *   after the ones in hand (they are not part of the work: the screen dims them and does not count them)
 * @returns {{ waiting: object[], production: object[] }}
 */
export function splitIntoBands(orders, { includeDelivered = false } = {}) {
	const waiting = []
	const production = []
	const delivered = []
	for (const order of orders || []) {
		const band = bandOf(order)
		if (band === BAND_WAITING) waiting.push(order)
		else if (band === BAND_PRODUCTION) production.push(order)
		else if (includeDelivered) delivered.push(order)
	}
	return {
		waiting: waiting.sort(byArrival),
		production: [...production.sort(byArrival), ...delivered.sort(byArrival)],
	}
}

//// Neoffice — the tickets that BLINK stand first in their band, in the order they were called (Daniel, 01.11: the second ticket that blinked was out of sight in a long column, and they are hard to find when the cook
//// walks around): the cook finds them at the head of the band and takes them one after the other. A ticket left « to do » stops blinking and goes back to its place of arrival.
/**
 * @param {object[]} list - The tickets of a band, in order of arrival
 * @param {string[]} [flashing] - The names of the tickets that blink, in the order they were called
 * @returns {object[]} The same list when nothing of it blinks, else a new one with the blinking tickets first
 */
export function pinFlashing(list, flashing) {
	if (!flashing?.length) return list
	const byName = new Map(list.map((order) => [order.name, order]))
	const pinned = flashing.map((name) => byName.get(name)).filter(Boolean)
	if (!pinned.length) return list
	const names = new Set(pinned.map((order) => order.name))
	return [...pinned, ...list.filter((order) => !names.has(order.name))]
}
