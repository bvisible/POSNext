//// Neoffice — added file (no upstream equivalent). The five seconds in which a mis-tap on « Ready » or « Deliver » can be taken back (NeoRestau lot 1, task 38a-2,
//// ruling 112). A ticket that is marked ready leaves the cook's screen and one that is delivered leaves everyone's, so a finger that slipped was a ticket gone with
//// no way back but the list of what waits at the pass. A small toast says what just happened and offers « Undo » for five seconds; undoing puts each dish back in
//// the state it was in, one call per item (the server moves the lines of one item at a time, and back as well as forward, as the call-back to preparation does).
//// The rules of WHAT to put back are here, written once for the kitchen's card and the runner's, and read without a screen.

/**
 * The dishes to put back after a move: one entry per invoice and item that changed, with the state it had before. Several lines of one item are put back
 * together (the server moves them together), to the state of the first of them.
 *
 * @param {{ invoice: string, dishes: { item_code?: string, kds_status?: string }[], before: (string|undefined)[] }[]} moves
 *   For each invoice, its dishes as they are AFTER the move and, at the same index, the state each had BEFORE it
 * @returns {{ invoice: string, item_code: string, status: string }[]} Nothing for a dish that did not change, one with no item code, or one that had no state
 */
export function dishesToPutBack(moves) {
	const entries = []
	const seen = new Set()
	for (const { invoice, dishes, before } of moves || []) {
		;(dishes || []).forEach((dish, index) => {
			const from = before?.[index]
			if (!dish?.item_code || !from || from === dish.kds_status) return
			const key = `${invoice}\u0000${dish.item_code}`
			if (seen.has(key)) return
			seen.add(key)
			entries.push({ invoice, item_code: dish.item_code, status: from })
		})
	}
	return entries
}

/**
 * The calls that put the entries back, as [method, params].
 *
 * @param {{ invoice: string, item_code: string, status: string }[]} entries
 * @returns {[string, object][]}
 */
export function putBackCalls(entries) {
	return (entries || []).map(({ invoice, item_code, status }) => [
		"pos_next.api.restaurant.update_item_kds_status",
		{ invoice_name: invoice, item_code, status },
	])
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
