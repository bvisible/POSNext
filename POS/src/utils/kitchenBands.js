//// Neoffice — added file (no upstream equivalent). The kitchen screen splits its tickets into two bands, the ones WAITING
//// (nothing begun on them) and the ones IN PREPARATION (at least one dish begun), each in order of arrival (NeoRestau
//// lot 1, task 23). The split and the order are written ONCE, here, and only read by the screen, so that a rule is
//// changed in one place and tested without a screen.

export const BAND_WAITING = "waiting"
export const BAND_PRODUCTION = "production"

// A dish a cook has begun on and that has not left the kitchen: it makes its ticket "in preparation".
const BEGUN = new Set(["Preparing", "Ready"])

const DATETIME =
	/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

/**
 * A datetime as a number of milliseconds, NaN when it cannot be read.
 *
 * Frappe writes "2026-10-30 12:00:01.123456" (a space, up to six digits of fraction). Not every browser reads that with
 * `new Date(string)` (Safari has refused the space), and a tablet in a kitchen is as likely to be one as any other, so
 * the parts are read by hand and the date is built from them, in the local time zone like the ticket's own timer.
 */
function timeOf(value) {
	if (value == null || value === "") return Number.NaN
	if (value instanceof Date) return value.getTime()
	if (typeof value === "number") return value
	const text = String(value).trim()
	const match = DATETIME.exec(text)
	if (match) {
		const [, year, month, day, hour, minute, second, fraction = ""] = match
		const milliseconds = Number(fraction.slice(0, 3).padEnd(3, "0"))
		return new Date(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second),
			milliseconds,
		).getTime()
	}
	return Date.parse(text)
}

const orLast = (time) =>
	Number.isFinite(time) ? time : Number.POSITIVE_INFINITY

/**
 * The time an order reached the kitchen, as milliseconds: the time it was LAST SENT, which is the order's `modified`.
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
	const modified = timeOf(order?.modified)
	if (Number.isFinite(modified)) return modified
	return orLast(timeOf(order?.creation))
}

/**
 * The band an order belongs to, null when it is gone from the screen (delivered).
 *
 * - WAITING: no dish has begun. Every dish sent is still Pending (or held back, Waiting).
 * - PRODUCTION: at least one dish is Preparing or Ready and the order is not delivered yet. An order whose dishes are all
 *   Ready stays here, with its ready look, until it is delivered.
 * - null: delivered, the order says so or all of its dishes do.
 *
 * A Delivered dish is finished business and says nothing about the dishes still to cook: a table whose starters are
 * delivered and whose mains have just been sent is WAITING, not in preparation. (The tickets keep the delivered dishes,
 * struck through, for the whole meal.)
 *
 * What the server sent and says nothing about (no dish, a dish with no status) stays WAITING: the screen never hides a
 * ticket it was given without a reason.
 *
 * @param {object} order - An order of `get_kds_orders`
 * @returns {"waiting"|"production"|null}
 */
export function bandOf(order) {
	if (order?.kds_status === "Delivered") return null
	const lines = order?.items || []
	if (lines.some((line) => BEGUN.has(line?.kds_status))) return BAND_PRODUCTION
	const delivered = lines.some((line) => line?.kds_status === "Delivered")
	const sent = lines.some((line) => line?.kds_status === "Pending")
	if (delivered && !sent) return null
	return BAND_WAITING
}

function byArrival(a, b) {
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
 * @param {{ includeDelivered?: boolean }} [options] - Bring the delivered orders back, in the band of what was started
 * @returns {{ waiting: object[], production: object[] }}
 */
export function splitIntoBands(orders, { includeDelivered = false } = {}) {
	const waiting = []
	const production = []
	for (const order of orders || []) {
		const band = bandOf(order) ?? (includeDelivered ? BAND_PRODUCTION : null)
		if (band === BAND_WAITING) waiting.push(order)
		else if (band === BAND_PRODUCTION) production.push(order)
	}
	return {
		waiting: waiting.sort(byArrival),
		production: production.sort(byArrival),
	}
}
