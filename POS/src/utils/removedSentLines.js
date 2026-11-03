//// Neoffice — added file (no upstream equivalent). The dishes a waiter took off an order after they had left for the kitchen (NeoResto lot 1, product owner, 03.11.2026: a dish removed, then « Back » without
//// « Send », was lost without a word and the kitchen cooked it). The cart remembers what had left when the table was opened (`sentLinesOf`), and this compares it with what the order holds now.
//// A dish is counted by its code and its unit, its lines added up, so that a line lowered, a line gone and a dish put back are all read the same way.
import { hasLeftForTheKitchen } from "@/utils/lineKitchenState"

const keyOf = (line) => `${line.item_code}\u0000${line.uom || ""}`

/**
 * The lines the kitchen has, one entry for each dish and unit with its quantities added up. A gift row of an offer is no dish that was ordered, and a line the waiter holds back or has not sent is not at the kitchen.
 *
 * @param {Array<Object>|undefined} lines - The cart's lines
 * @returns {Array<{ item_code: string, item_name: string, uom: string, quantity: number }>}
 */
export function sentLinesOf(lines) {
	const dishes = new Map()
	for (const line of lines || []) {
		if (!line || line.is_free_item || !hasLeftForTheKitchen(line)) continue
		const key = keyOf(line)
		const known = dishes.get(key)
		const quantity = Number(line.quantity) || 0
		if (known) known.quantity += quantity
		else dishes.set(key, { item_code: line.item_code, item_name: line.item_name || line.item_code, uom: line.uom || "", quantity })
	}
	return [...dishes.values()]
}

/**
 * The dishes that had left for the kitchen and that the order no longer holds, with what is missing of each.
 *
 * @param {Array<Object>|undefined} before - What had left, as `sentLinesOf` gave it when the table was opened
 * @param {Array<Object>|undefined} lines - The cart's lines now
 * @returns {Array<{ item_code: string, item_name: string, uom: string, quantity: number }>}
 */
export function removedSentLines(before, lines) {
	if (!before?.length) return []
	const now = new Map(sentLinesOf(lines).map((dish) => [keyOf(dish), dish.quantity]))
	const removed = []
	for (const dish of before) {
		const missing = Math.round((dish.quantity - (now.get(keyOf(dish)) || 0)) * 10000) / 10000
		if (missing > 0) removed.push({ ...dish, quantity: missing })
	}
	return removed
}

/**
 * The lines added to an order and not sent yet: no kitchen status at all, so the saved order does not have them and a way back from the table would lose them. A line the waiter holds back (« Waiting ») is
 * not one: it has been through a send, so it is saved with the order. A gift row of an offer follows its dish and is no line the waiter ordered.
 *
 * @param {Array<Object>|undefined} lines - The cart's lines
 * @returns {Array<Object>}
 */
export function linesNotSentYet(lines) {
	return (lines || []).filter((line) => line && !line.is_free_item && !line.kds_status)
}

/**
 * The lines of an order that the saved order already has: whatever carries a kitchen status, a course held back by the waiter (« Waiting ») included, because the order is rebuilt from the lines it is handed and a held
 * course left out would be deleted by it. A line with no status was added since the table was opened and never sent: it is not saved, which is what a cancellation must not do to it.
 *
 * @param {Array<Object>|undefined} lines - The payload's lines (or the cart's)
 * @returns {Array<Object>}
 */
export function linesOfTheSavedOrder(lines) {
	return (lines || []).filter((line) => Boolean(line?.kds_status))
}
