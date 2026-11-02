//// Neoffice — added file (no upstream equivalent). The portions the kitchen made of a product, as the till reasons about them
//// (NeoResto lot 1, Daniel, 02.11.2026: « la cuisine dit tu peux encore en faire 2, 3, 5 »). The server counts
//// (pos_next.restaurant.portions); the till subtracts its own cart and decides what a sold-out dish does.

/** The quantities the till offers when the kitchen can make more: one tap, the exact number being the field's. */
export const ADD_CHOICES = [1, 2, 3, 5, 10]

/**
 * What the till may still sell of a counted product: what the server says is left, less what the cart holds. `null` when
 * nothing limits it: the product is not counted, or its portions were made on another day.
 */
export function leftToSell(entry, inCart = 0) {
	if (!entry || entry.left === null || entry.left === undefined) return null
	return Number(entry.left) - (Number(inCart) || 0)
}

/** A quantity of portions to add: a whole number above zero, else `null`. */
export function wholePortions(value) {
	if (value === "" || value === null || value === undefined) return null
	const number = Number(value)
	return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * What a tap on a tile does (Daniel, 02.11.2026: « c'est le patron qui décide si on grise ou pas »): a dish with portions left is ordered;
 * a sold-out one is, where the restaurant greys sold-out dishes out, refused (a counted one opens the dialog that adds portions: the kitchen
 * may be able to make more), and otherwise ordered with a warning that none is left.
 */
export function whatATapDoes({ soldOut, greyOut, counted }) {
	if (!soldOut) return "order"
	if (!greyOut) return "warn-and-order"
	return counted ? "add-portions" : "refuse"
}
