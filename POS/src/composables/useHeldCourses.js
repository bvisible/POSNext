//// Neoffice — added file (no upstream equivalent). « Commander la suite » and « Tout commander » (NeoRestau lot 1, service
//// families). A table's order holds its later courses back (`Waiting`); only the waiter's gesture releases them, and the
//// kitchen touches nothing. The server says WHICH lines are released, by the same rule that held them (the till only has its
//// copy for the boxes of the kitchen dialog); the till marks them and sends the order, which is a send of its own on the
//// kitchen's screen. If the send fails the lines are held again, so that the cart never shows as sent what the kitchen has not got.

/**
 * Releases the next course held back, or everything held.
 *
 * @param {Object} options
 * @param {"next"|"all"} options.which - The next course (« Commander la suite ») or every held line (« Tout commander »)
 * @param {Object} options.cartStore - The cart store: its lines, its table and whether it is a takeaway
 * @param {(method: string, args: Object) => Promise<any>} options.call - The API call
 * @param {() => Promise<boolean>} options.send - Sends the order to the kitchen; answers whether it went
 * @param {(row: Object) => void} [options.prepare] - Gives a released line what the kitchen needs before it is sent (its station)
 * @returns {Promise<{ sent: number, family?: string, failed?: boolean }>}
 */
export async function orderHeldLines({
	which,
	cartStore,
	call,
	send,
	prepare,
}) {
	const rows = cartStore.invoiceItems
	const answer = await call("pos_next.api.service_families.plan_kitchen_send", {
		lines: JSON.stringify(
			rows.map((row) => ({
				service_family: row.service_family || "",
				kds_status: row.kds_status || "",
			})),
		),
		restaurant_table: cartStore.restaurantTable?.name || "",
		is_takeaway: cartStore.isTakeaway ? 1 : 0,
	})
	const indexes = (which === "all" ? answer?.held : answer?.next?.indexes) || []
	const released = indexes.map((index) => rows[index]).filter(Boolean)
	if (!released.length) return { sent: 0 }

	for (const row of released) {
		if (prepare) prepare(row)
		row.kds_status = "Pending"
	}
	if (!(await send())) {
		for (const row of released) row.kds_status = "Waiting"
		return { sent: 0, failed: true }
	}
	return { sent: released.length, family: answer?.next?.family || "" }
}
