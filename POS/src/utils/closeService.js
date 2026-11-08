//// Neoffice — added file (no upstream equivalent). Closing the service of the restaurant (NeoResto lot 1, the product owner, 08.11.2026: « théoriquement, quand on clôture le restaurant, toutes les
//// tables sont fermées »; solution C of the study of the open tables, note 57, § 3): the one question « is the room empty? », then every order that is not an empty table is settled, and the service
//// closes. Pure helpers: the dialog asks the server (`get_service_closing`, `close_service`), these say what the answer means.

// The stages the server gives an open order (pos_next.restaurant.open_orders.stage_of)
export const EMPTY = "empty"
export const NEVER_SENT = "never_sent"
export const SENT = "sent"
export const HOLDS_MONEY = "holds_money"

// The reason written in the journal when the orders that never left for the kitchen are cancelled together: a text, so that it is read in the language of the till when asked
export const neverSentReason = () => __("Never sent to the kitchen")

/** The orders of a survey, by stage: `{ empty, neverSent, sent, holdsMoney }`. */
export function stagesOf(orders) {
	const list = Array.isArray(orders) ? orders : []
	const of = (stage) => list.filter((order) => order?.stage === stage)
	return {
		empty: of(EMPTY),
		neverSent: of(NEVER_SENT),
		sent: of(SENT),
		holdsMoney: of(HOLDS_MONEY),
	}
}

/** The orders somebody must settle before the service can close: every order but the empty tables, which go by themselves. */
export const leftToSettle = (orders) => (Array.isArray(orders) ? orders : []).filter((order) => order?.stage !== EMPTY)

/** Whether the service may close: no order is left but the empty ones. The server checks it again. */
export const canClose = (orders) => leftToSettle(orders).length === 0

/** What the closing does by itself once the orders are settled: one line per thing it will do (empty list when it has nothing to do). */
export function byItselfLines(survey) {
	const lines = []
	const empty = Number(survey?.empty_orders) || 0
	const tables = Number(survey?.tables_to_free) || 0
	const dishes = Number(survey?.dishes_to_deliver) || 0
	if (empty) lines.push(empty === 1 ? __("1 table opened and left is removed") : __("{0} tables opened and left are removed", [empty]))
	if (dishes) {
		lines.push(
			dishes === 1
				? __("1 dish of a table already paid is marked delivered")
				: __("{0} dishes of tables already paid are marked delivered", [dishes]),
		)
	}
	if (tables) lines.push(tables === 1 ? __("1 table is freed") : __("{0} tables are freed", [tables]))
	return lines
}

/** The line that says how many orders are left to settle (empty once none is). */
export function leftLine(count) {
	if (!count) return ""
	return count === 1 ? __("1 order is left to settle") : __("{0} orders are left to settle", [count])
}

/** The line that says the orders that never left for the kitchen: nothing was consumed, so they are cancelled together. */
export function neverSentLine(count) {
	if (!count) return ""
	return count === 1
		? __("1 order never left for the kitchen: nothing was consumed")
		: __("{0} orders never left for the kitchen: nothing was consumed", [count])
}

/** What the till says once the service is closed: the lines of the answer of `close_service` that did something. */
export function closedLines(answer) {
	const lines = []
	const settled = Number(answer?.orders_settled) || 0
	const removed = Number(answer?.empty_orders_removed) || 0
	const freed = Number(answer?.tables_freed) || 0
	const delivered = Number(answer?.dishes_delivered) || 0
	if (settled) lines.push(settled === 1 ? __("1 order settled") : __("{0} orders settled", [settled]))
	if (removed) lines.push(removed === 1 ? __("1 empty table removed") : __("{0} empty tables removed", [removed]))
	if (delivered) lines.push(delivered === 1 ? __("1 dish marked delivered") : __("{0} dishes marked delivered", [delivered]))
	if (freed) lines.push(freed === 1 ? __("1 table freed") : __("{0} tables freed", [freed]))
	return lines
}
