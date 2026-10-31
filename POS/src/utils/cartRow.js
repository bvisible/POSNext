// //// Neoffice — added file (no upstream equivalent). The cart lists COPIES of its lines (nestFreeRows,
// //// upstream 74c0aee5, merged 28.10.2026), while the remove button, the single send to the kitchen and the
// //// options dialog address a line by identity: the same dish can sit twice with different options, and a
// //// code lookup would act on the wrong one (7e1376a3). A copy is not in the cart, so the remove button did
// //// nothing (osiris, 30.10.2026). Each shown line keeps the way back to the row it was copied from.

import { toRaw } from "vue"

// A symbol, set non-enumerable: a spread, Object.keys and JSON never carry it into a payload
const CART_ROW = Symbol("cartRow")

/**
 * Mark a shown copy with the cart row it was made from.
 * @param {Object} copy - The line the cart shows
 * @param {Object} row - The cart row (or a copy of it, followed back to the row)
 * @returns {Object} The same copy
 */
export function withCartRow(copy, row) {
	Object.defineProperty(copy, CART_ROW, { value: cartRowOf(row), enumerable: false, configurable: true })
	return copy
}

/**
 * The cart row behind a shown line; a cart row (or anything else) is returned as it is.
 * @param {Object|null|undefined} line
 * @returns {Object|null|undefined}
 */
export function cartRowOf(line) {
	return (line && line[CART_ROW]) || line
}

/**
 * The cart line an item stands for: the row itself when the item is a line of the cart (or a shown copy of one), `null` when it
 * is not. The price dialog of a dish with no price hands back the item it was opened on, and a fresh item of a dish that is
 * already in the cart (a first round, maybe sent) is not the line to price: looking the line up by item code priced that line
 * and added no unit (NeoRestau lot 1, task 22, fix round 2).
 * @param {Array<Object>} cartItems - The cart's rows
 * @param {Object|null|undefined} item - A cart row, a shown copy of one, a fresh item, or nothing
 * @returns {Object|null}
 */
export function cartLineOf(cartItems, item) {
	const row = cartRowOf(item)
	const index = row ? cartItems.indexOf(row) : -1
	return index >= 0 ? cartItems[index] : null
}

// The key of a cart row, handed out the first time it is asked for and kept as long as the row is in the cart
const ROW_KEYS = new WeakMap()
let lastRowKey = 0

/**
 * A key that tells a cart row from every other, shown copy or not: the same dish and unit can sit on two lines (the one the
 * kitchen has, the one that waits), so the item and its unit do not name a row. The list of the cart keys its lines with it, so a
 * field's focus and what was typed into it stay with its own row (NeoRestau lot 1, task 22, fix round 3).
 * @param {Object|null|undefined} line - A cart row or a shown copy of one
 * @returns {string}
 */
export function rowKeyOf(line) {
	const row = toRaw(cartRowOf(line))
	if (!row || typeof row !== "object") return ""
	if (!ROW_KEYS.has(row)) ROW_KEYS.set(row, ++lastRowKey)
	return String(ROW_KEYS.get(row))
}
