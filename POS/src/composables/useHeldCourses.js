//// Neoffice — added file (no upstream equivalent). « Commander la suite » and « Tout commander » (NeoResto lot 1, service
//// families). A table's order holds its later courses back (`Waiting`); only the waiter's gesture releases them, and the
//// kitchen touches nothing. The server says WHICH lines are released, by the same rule that held them (the till only has its
//// copy for the boxes of the kitchen dialog); the till marks them and sends the order, which is a send of its own on the
//// kitchen's screen. If the send fails the lines are held again, so that the cart never shows as sent what the kitchen has not got.
////
//// Neoffice — where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11: « Oui, les deux modes »), the course is already at the kitchen, marked ahead: the gesture does not release it, it CALLS it. One atomic
//// call of the server stamps the time of the call on the lines of the course (`restaurant.call_next_course`), the kitchen's popup and sound go off on it, and the order is not sent a second time. The same gesture releases the
//// lines of the room's rhythm that are held by hand, in a restaurant that changed its rhythm while the table was open.

import { isUncalled } from "@/utils/courseCall"

/** What the server is told of a line: its course and its state, and, for a line sent ahead, that it was and when it was called. A line of the ordinary way is told as it always was. */
const asTheServerIsTold = (row) => ({
	service_family: row.service_family || "",
	kds_status: row.kds_status || "",
	...(row.kds_ahead ? { kds_ahead: 1, kds_called_at: row.kds_called_at || "" } : {}),
})

/**
 * Releases the next course held back, or everything held, or calls the next course sent ahead (or every course).
 *
 * @param {Object} options
 * @param {"next"|"all"} options.which - The next course (« Commander la suite ») or every line that waits (« Tout commander »)
 * @param {Object} options.cartStore - The cart store: its lines, its table, whether it is a takeaway, the name of the saved order
 * @param {(method: string, args: Object) => Promise<any>} options.call - The API call
 * @param {() => Promise<boolean>} options.send - Sends the order to the kitchen; answers whether it went
 * @param {(row: Object) => void} [options.prepare] - Gives a released line what the kitchen needs before it is sent (its station)
 * @param {() => (void|Promise<void>)} [options.finish] - What the page does once a course is called and nothing else is sent (the send ends on the floor plan; a call does not end anywhere by itself)
 * @returns {Promise<{ sent: number, called?: number, family?: string, failed?: boolean }>}
 */
export async function orderHeldLines({
	which,
	cartStore,
	call,
	send,
	prepare,
	finish,
}) {
	const rows = cartStore.invoiceItems
	const answer = await call("pos_next.api.service_families.plan_kitchen_send", {
		lines: JSON.stringify(rows.map(asTheServerIsTold)),
		restaurant_table: cartStore.restaurantTable?.name || "",
		is_takeaway: cartStore.isTakeaway ? 1 : 0,
	})
	const indexes = (which === "all" ? answer?.held : answer?.next?.indexes) || []
	const targets = indexes.map((index) => rows[index]).filter(Boolean)
	// The lines sent ahead are CALLED; the lines held back are released and sent
	const toCall = targets.filter(isUncalled)
	const released = targets.filter((row) => !isUncalled(row))
	if (!released.length && !toCall.length) return { sent: 0 }

	let called = 0
	if (toCall.length) {
		const invoice = cartStore.currentDraftId
		// A line sent ahead is a line of a saved order: no name, nothing to call
		if (!invoice) return { sent: 0, failed: true }
		const result = await call("pos_next.api.restaurant.call_next_course", {
			invoice,
			...(which === "all" ? { everything: 1 } : { family: answer?.next?.family || "" }),
		})
		called = result?.called || 0
		if (called) for (const row of toCall) row.kds_called_at = result.called_at
	}

	if (released.length) {
		for (const row of released) {
			if (prepare) prepare(row)
			row.kds_status = "Pending"
		}
		if (!(await send())) {
			for (const row of released) row.kds_status = "Waiting"
			return { sent: 0, failed: true }
		}
		return {
			sent: released.length,
			...(called ? { called } : {}),
			family: answer?.next?.family || "",
		}
	}
	if (!called) return { sent: 0 }
	// The waiter may have added lines to the table before calling its next course: they are saved and sent too, and that send ends on the floor plan as the call does. Nothing of the cart is lost.
	if (cartStore.hasUnsentChanges) {
		if (!(await send())) return { sent: 0, called, failed: true }
	} else if (finish) await finish()
	return { sent: 0, called, family: answer?.next?.family || "" }
}
