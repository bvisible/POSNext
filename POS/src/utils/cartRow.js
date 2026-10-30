// //// Neoffice — added file (no upstream equivalent). The cart lists COPIES of its lines (nestFreeRows,
// //// upstream 74c0aee5, merged 28.10.2026), while the remove button, the single send to the kitchen and the
// //// options dialog address a line by identity: the same dish can sit twice with different options, and a
// //// code lookup would act on the wrong one (7e1376a3). A copy is not in the cart, so the remove button did
// //// nothing (osiris, 30.10.2026). Each shown line keeps the way back to the row it was copied from.

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
