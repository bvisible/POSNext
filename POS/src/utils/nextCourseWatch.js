//// Neoffice — added file (no upstream equivalent). The kitchen's notice that the next course is ordered (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine, et
//// aussi un son pour aviser »). The waiter's gesture releases the dishes held back at a table, and they reach the kitchen as a new send on a ticket that is already on the screen; nothing told the cooks.
////
//// There is NO new realtime event: the screen already reads its orders (every 15 seconds and on each `kds_update`), and each dish carries the time it left for the kitchen (`kds_sent_at`, utils/courseTimer).
//// The notice is a comparison between two readings of the same orders, written ONCE here and tested without a screen:
////
//// - an order that was ALREADY on the screen at the last reading, with dishes sent before it, and whose latest send is newer: the next course is ordered. The first reading of a screen is only what the next
////   ones are compared with, and a ticket the last reading did not hold is a new ticket, not a next course. A takeaway has no next course.
//// - the dishes counted are those of the stations the screen shows (the station chip, or all of them), and the courses named are their families (Starter, Main, Dessert).
//// - a send of drinks alone is no next course (a beer ordered late), nor is a dish of no family where the restaurant has families; a restaurant that has none at all is told of every later send, without a course.
//// - never twice for the same send (the key is the order and the time of the send), and a stale answer that arrives after a newer one changes nothing: what was seen of an order never goes back.

import { latestSendAt, linesOfLatestSend } from "@/utils/courseTimer"
import { hasLeftForTheKitchen } from "@/utils/lineKitchenState"
import { COURSES, familyOf } from "@/utils/serviceFamilies"

/** The later of two times, either of which may be NaN (no time known). */
function later(first, second) {
	if (Number.isNaN(first)) return second
	if (Number.isNaN(second)) return first
	return Math.max(first, second)
}

/** The table a notice names: what the ticket shows, else the table's code. */
const tableOf = (order) => order.table_display_name || order.restaurant_table || ""

/** The courses of the dishes of a send, in the order of the meal, once each. */
function coursesOf(lines) {
	const families = new Set(lines.map(familyOf))
	return COURSES.filter((course) => families.has(course))
}

/**
 * Whether a send is a next course. Where the restaurant has courses (some dish of the order carries a family), the send must hold one of them: a drink ordered late is
 * not the next course, and neither is a dish with no family. Where it has none, every later send counts.
 */
function isNextCourse(send, lines) {
	if (coursesOf(send).length) return true
	return !lines.some((line) => familyOf(line))
}

/**
 * Compares a reading of the screen's orders with the last one.
 *
 * @param {Array<Object>} orders - The orders of `get_kds_orders`, as the screen reads them
 * @param {{ orders: Map<string, { left: boolean, sentAt: number }>, alerted: Set<string> }|null} memory - What the last call gave back; `null` for the first reading of a screen
 * @param {{ station?: string }} [scope] - The station the screen shows, none for all of them
 * @returns {{ alerts: Array<{ key: string, order: string, table: string, families: string[], sentAt: number, count: number }>, memory: Object }}
 *   The notices to give (none on the first reading) and the memory to hand to the next call. The memory handed in is not changed.
 */
export function readNextCourses(orders, memory, { station = "" } = {}) {
	const known = new Map()
	const alerted = new Set()
	const alerts = []

	for (const order of orders || []) {
		if (!order?.name) continue
		const lines = (order.items || []).filter((line) => !station || line?.preparation_station === station)
		const left = lines.some(hasLeftForTheKitchen)
		const sentAt = latestSendAt(lines)
		const before = memory?.orders.get(order.name)

		known.set(order.name, {
			left: left || Boolean(before?.left),
			sentAt: before ? later(before.sentAt, sentAt) : sentAt,
		})
		for (const key of memory?.alerted || []) if (key.startsWith(`${order.name}|`)) alerted.add(key)

		const newer = before && left && !Number.isNaN(sentAt) && (Number.isNaN(before.sentAt) || sentAt > before.sentAt)
		if (!newer || !before.left || order.is_takeaway) continue
		const table = tableOf(order)
		const key = `${order.name}|${sentAt}`
		const send = linesOfLatestSend(lines)
		if (!table || alerted.has(key) || !isNextCourse(send, lines)) continue
		alerted.add(key)
		alerts.push({ key, order: order.name, table, families: coursesOf(send), sentAt, count: send.length })
	}

	return { alerts, memory: { orders: known, alerted } }
}
