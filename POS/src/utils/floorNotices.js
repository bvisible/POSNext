//// Neoffice — added file (no upstream equivalent). What a guest's order or payment makes of a notice on the till (NeoResto lot 1, Daniel, 01.11, after ordering a drink from the QR code of a table as a guest:
//// « regarde comment la caisse sommelier reçoit l'info (popup et autre) »). The rules are written ONCE here and tested without a screen or a socket; stores/floorNotices applies them, the notices are drawn by
//// components/restaurant/FloorNotices.
////
//// - The server tells the till of a guest event in realtime (pos_next.api.guest_ordering): `guest_order_submitted` (both modes of the restaurant; it names the lines of THIS order and says the mode) and
////   `guest_payment_received`. `guest_order_pending` says nothing more than the first in the mode that holds the lines for the waiter, so the till does not act on it: it would be told twice.
//// - There is ONE notice per table, newest on top: a newer one replaces the older. Orders waiting for the waiter's validation are the exception: they are still waiting, so a second order of the table joins the
////   notice and the notice counts them. Such a notice stays until it is handled (the table has no line to validate any more) or dismissed.

export const KIND_ORDER = "order"
export const KIND_PENDING = "pending"
export const KIND_PAYMENT = "payment"

// The restaurant's mode in which the lines of a guest's order are held for the waiter (pos_next.api.guest_ordering)
const MODE_APPROVAL = "Server Approval"

/** How many lines a notice names; the others are counted (« +2 »). */
export const LINES_SHOWN = 3
// How many lines a notice keeps to name: what the server sends at most, so that the count and the names are never out of step
const LINES_KEPT = 5

function linesOfAlert(items) {
	if (!Array.isArray(items)) return []
	const lines = []
	for (const line of items) {
		const name = String(line?.item_name ?? "").trim()
		if (!name) continue
		const qty = Number(line.qty)
		lines.push({ item_name: name, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 })
	}
	return lines.slice(0, LINES_KEPT)
}

/**
 * The notice a realtime event of a guest makes.
 *
 * @param {"order"|"payment"} event - `order`: `guest_order_submitted`; `payment`: `guest_payment_received`
 * @param {Object} data - The event's payload (`table`, and for an order `items`, `count`, `validation_mode`; for a payment `submitted`)
 * @param {number} seq - A number that is new for each notice, so that every notice has a key of its own
 * @returns {{ key: string, kind: string, table: string, items: Array<{ item_name: string, qty: number }>, count: number, orders: number, partial: boolean }|null}
 *   `table` is the table's name (the screen shows its label); `orders` how many orders the notice counts; `partial` whether a payment leaves the bill open.
 *   Null for an event that is no news: no table, or an order that added no line.
 */
export function noticeOf(event, data, seq) {
	const table = String(data?.table ?? "")
	if (!table) return null
	const base = { key: `${table}|${seq}`, table, orders: 1, partial: false }
	if (event === "payment") return { ...base, kind: KIND_PAYMENT, items: [], count: 0, partial: data.submitted === false }

	const items = linesOfAlert(data.items)
	const told = data.count == null || data.count === "" ? Number.NaN : Number(data.count)
	// An order that added no line (the same dish sent again) is no news; an alert that does not say how many lines (an older server) still says that a guest orders
	if (told === 0) return null
	return {
		...base,
		kind: data.validation_mode === MODE_APPROVAL ? KIND_PENDING : KIND_ORDER,
		items,
		count: Number.isFinite(told) ? Math.floor(told) : items.length,
	}
}

/**
 * Puts a notice in the list: ONE per table, newest on top. A notice replaces the one its table has, except orders waiting for validation, which add up.
 *
 * @returns {Array<Object>} A new list; the one handed in is not changed
 */
export function putNotice(notices, notice) {
	const same = notices.find((other) => other.table === notice.table)
	const rest = notices.filter((other) => other.table !== notice.table)
	if (same?.kind === KIND_PENDING && notice.kind === KIND_PENDING) {
		const joined = {
			...notice,
			orders: same.orders + notice.orders,
			count: same.count + notice.count,
			items: [...same.items, ...notice.items].slice(0, LINES_KEPT),
		}
		if (same.seenWaiting) joined.seenWaiting = true
		return [joined, ...rest]
	}
	return [notice, ...rest]
}

/** The lines a notice names, and how many it leaves out (« +2 »): three at most, never fewer than it hides. */
export function linesOf(notice) {
	const items = notice?.items || []
	const shown = items.slice(0, LINES_SHOWN)
	return { shown, more: Math.max(0, Math.max(Number(notice?.count) || 0, items.length) - shown.length) }
}

/**
 * Which notices waiting for validation are handled, from a reading of the floor's tables (`qr_waiting_count`: the lines of a guest's order the table has to accept).
 *
 * A notice goes when its table has been SEEN with lines to accept and has none any more. A reading made before the order reached the server also says none, which proves nothing: the notice then stays until
 * it is dismissed, which is the safe way to be wrong. Other notices are not touched.
 *
 * @param {Array<Object>} notices
 * @param {Array<{ name: string, qr_waiting_count?: number }>} tables - The tables of the floor, as `get_tables` answers
 * @returns {{ notices: Array<Object>, gone: string[] }} The notices that stay (a notice that has been seen waiting is marked so), and the keys of the ones that go
 */
export function settleNotices(notices, tables) {
	const byName = new Map((tables || []).map((table) => [table?.name, table]))
	const gone = []
	const kept = []
	for (const notice of notices) {
		const table = notice.kind === KIND_PENDING ? byName.get(notice.table) : null
		if (!table) {
			kept.push(notice)
			continue
		}
		if (Number(table.qr_waiting_count) > 0) kept.push(notice.seenWaiting ? notice : { ...notice, seenWaiting: true })
		else if (notice.seenWaiting) gone.push(notice.key)
		else kept.push(notice)
	}
	return { notices: kept, gone }
}
