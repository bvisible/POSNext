//// Neoffice — added file (no upstream equivalent). What the options of a cart line add to its price, read from the
//// options it carries (posa_item_modifiers, as the options dialog and the phone's options sheet write them). A line
//// loaded from the server comes at the price the server holds, its options included; the cart has to know how much of
//// that price its options make (the line's _modifiers_applied), or saving the options again takes them off twice
//// (NeoResto lot 1, task 27, fix round 1). One reading for every path that loads a line: a table opened on the floor
//// (FloorPlanEditor.vue), a server draft (POSSale.vue), a guest's order reloaded at the open table (useInvoice.js,
//// replaceAllItems).

/**
 * The sum of the price adjustments of the options a line carries; 0 for none, or for options that cannot be read.
 * An option written before the field was named price_adjustment carries its adjustment as price.
 *
 * @param {string|Array|null|undefined} modifiers - The line's posa_item_modifiers (JSON), or already read
 * @returns {number}
 */
export function modifiersPriceAdjustment(modifiers) {
	let groups = modifiers
	if (typeof modifiers === "string") {
		if (!modifiers.trim()) return 0
		try {
			groups = JSON.parse(modifiers)
		} catch {
			return 0
		}
	}
	if (!Array.isArray(groups)) return 0
	let total = 0
	for (const group of groups) {
		for (const option of Array.isArray(group?.options) ? group.options : []) {
			total += Number(option?.price_adjustment || option?.price || 0) || 0
		}
	}
	return Math.round(total * 1e6) / 1e6
}
