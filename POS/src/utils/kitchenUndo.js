//// Neoffice — added file (no upstream equivalent). The five seconds in which a mis-tap on « Ready » or « Deliver » can be taken back (NeoResto lot 1, task 38a-2,
//// ruling 112). A ticket that is marked ready leaves the cook's screen and one that is delivered leaves everyone's, so a finger that slipped was a ticket gone with
//// no way back but the list of what waits at the pass. A small toast says what just happened and offers « Undo » for five seconds; undoing puts each dish back in
//// the state it was in, one call per line (the server moves one line by its id, and back as well as forward, as the call-back to preparation does).
//// The rules of WHAT to put back are here, written once for the kitchen's card and the runner's, and read without a screen.

//// Neoffice — a line cooked in part is put back EXACTLY (kitchen test of 01.11, a line of six marked ready for four): its state is its status AND its two counters
//// (`kds_ready_qty`, units cooked; `kds_delivered_qty`, units delivered). The state before a move can be given whole (`dishState`), and the call that puts it back
//// carries the counters (`restore`), so that « four of six ready » comes back to what was cooked before, and a delivery of the cooked units to what was delivered before.

//// Neoffice — a line is named by its own id (`name`, the Sales Invoice Item's; maintenance#2075): two lines of one dish (another round, another course) have a
//// state each, so a move and its undo name the LINE (`row`), and the server moves that line only. A line the server sent without its id (an older server) is
//// still moved with every line of its dish, by its item code, as it always was.

const COUNTERS = ["kds_ready_qty", "kds_delivered_qty"]

/**
 * The state of a line, to keep before a move: its status and, when the server tells them, its two counters.
 *
 * @param {{ kds_status?: string, kds_ready_qty?: number, kds_delivered_qty?: number }|null|undefined} line
 * @returns {{ kds_status?: string, kds_ready_qty?: number, kds_delivered_qty?: number }}
 */
export function dishState(line) {
	const state = {}
	if (!line) return state
	if (line.kds_status !== undefined) state.kds_status = line.kds_status
	for (const key of COUNTERS) if (line[key] !== undefined && line[key] !== null) state[key] = line[key]
	return state
}

const sameCounters = (before, after) =>
	COUNTERS.every(
		(key) => before[key] === undefined || after?.[key] === undefined || Number(before[key]) === Number(after[key]),
	)

/**
 * The lines of the screen to move, one call each: a line that has its id is moved alone, by its id (`row`); the lines that have none are moved together with
 * every line of their dish, one call per item code, as the server always did for them.
 *
 * @param {{ name?: string, item_code?: string }[]} dishes
 * @returns {{ item_code: string, row?: string }[]}
 */
export function linesToMove(dishes) {
	const targets = []
	const codes = new Set()
	for (const dish of dishes || []) {
		if (!dish?.item_code && !dish?.name) continue
		if (dish.name) {
			targets.push({ item_code: dish.item_code, row: dish.name })
			continue
		}
		if (codes.has(dish.item_code)) continue
		codes.add(dish.item_code)
		targets.push({ item_code: dish.item_code })
	}
	return targets
}

/**
 * The params of one call that moves a line (by its id) or the lines of a dish (by its item code) of an order.
 *
 * @param {string} invoice
 * @param {{ item_code?: string, row?: string }} target
 * @param {string} status
 * @returns {object}
 */
export function moveParams(invoice, target, status) {
	const params = { invoice_name: invoice, item_code: target.item_code, status }
	if (target.row) params.row = target.row
	return params
}

/**
 * The dishes to put back after a move: one entry per line that changed (by its id), with the state it had before. The lines of an item that have no id are put
 * back together (the server moves them together), to the state of the first of them.
 *
 * @param {{ invoice: string, dishes: { name?: string, item_code?: string, kds_status?: string, kds_ready_qty?: number, kds_delivered_qty?: number }[], before: (string|object|undefined)[] }[]} moves
 *   For each invoice, its dishes as they are AFTER the move and, at the same index, the state each had BEFORE it: its status, or its whole state (`dishState`)
 * @returns {{ invoice: string, item_code: string, row?: string, status: string, ready_qty?: number, delivered_qty?: number }[]} Nothing for a dish that did not change, one with no item code nor id, or one that had no state
 */
export function dishesToPutBack(moves) {
	const entries = []
	const seen = new Set()
	for (const { invoice, dishes, before } of moves || []) {
		;(dishes || []).forEach((dish, index) => {
			const state = typeof before?.[index] === "string" ? { kds_status: before[index] } : before?.[index]
			const from = state?.kds_status
			if ((!dish?.item_code && !dish?.name) || !from) return
			// A line cooked in part keeps its status when the kitchen or the runner moves units: it changed when its counters did
			if (from === dish.kds_status && sameCounters(state, dish)) return
			const key = dish.name ? `${invoice}\u0000row\u0000${dish.name}` : `${invoice}\u0000${dish.item_code}`
			if (seen.has(key)) return
			seen.add(key)
			const entry = { invoice, item_code: dish.item_code, status: from }
			if (dish.name) entry.row = dish.name
			if (state.kds_ready_qty !== undefined) entry.ready_qty = state.kds_ready_qty
			if (state.kds_delivered_qty !== undefined) entry.delivered_qty = state.kds_delivered_qty
			entries.push(entry)
		})
	}
	return entries
}

/**
 * The calls that put the entries back, as [method, params]. An entry that names counters restores them with the status; one that names its line puts that line back alone.
 *
 * @param {{ invoice: string, item_code: string, row?: string, status: string, ready_qty?: number, delivered_qty?: number }[]} entries
 * @returns {[string, object][]}
 */
export function putBackCalls(entries) {
	return (entries || []).map(({ invoice, item_code, row, status, ready_qty, delivered_qty }) => {
		const params = moveParams(invoice, { item_code, row }, status)
		if (ready_qty !== undefined || delivered_qty !== undefined)
			params.restore = JSON.stringify({ ready_qty, delivered_qty })
		return ["pos_next.api.restaurant.update_item_kds_status", params]
	})
}

/** The moves worth offering to undo: a dish that has become ready, or delivered. Starting a dish is no mis-tap that costs a ticket. */
export const UNDOABLE_STATUSES = ["Ready", "Delivered"]

/**
 * Put the entries back, one call each, in order. Stops at the first refusal and says so by throwing: the caller tells the user.
 *
 * @param {(method: string, params: object) => Promise<unknown>} call - The app's call
 * @param {{ invoice: string, item_code: string, status: string }[]} entries
 */
export async function putBack(call, entries) {
	for (const [method, params] of putBackCalls(entries))
		await call(method, params)
}
