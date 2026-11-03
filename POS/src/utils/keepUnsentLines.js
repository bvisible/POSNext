//// Neoffice — added file (no upstream equivalent). « Put the order back as it was » reads the table's order again, as the kitchen has it (NeoResto lot 1, product owner, 03.11.2026: « remettre la commande comme avant perd toujours ses lignes,
//// on vient de régler ça, non ? »). The lines the waiter added and has not sent are not on the server, so reading the table again dropped them. They are kept aside before the reading (`takeUnsentLines`) and added again on the order read back
//// (`putUnsentLinesBack`), as lines not sent, by the cart's own `addItem`: a dish added again is a line of its own, never a unit on the line the kitchen has.
import { offeredSourceFields } from "@/utils/offeredRows"
import { linesNotSentYet } from "@/utils/removedSentLines"

/**
 * The lines added and not sent yet, as what `addItem` takes: the dish, its unit, its options and remark, its station and family, and the quantity.
 *
 * @param {Array<Object>|undefined} lines - The cart's lines
 * @returns {Array<{ item: Object, quantity: number }>}
 */
export function takeUnsentLines(lines) {
	return linesNotSentYet(lines).map((line) => ({
		item: {
			item_code: line.item_code,
			item_name: line.item_name,
			rate: line.rate,
			uom: line.uom,
			stock_uom: line.stock_uom,
			conversion_factor: line.conversion_factor,
			item_uoms: line.item_uoms,
			image: line.image,
			item_group: line.item_group,
			preparation_station: line.preparation_station,
			posa_special_instructions: line.posa_special_instructions,
			posa_item_modifiers: line.posa_item_modifiers,
			service_family: line.service_family,
			_modifiers_applied: line._modifiers_applied || 0,
			...offeredSourceFields(line),
		},
		quantity: Number(line.quantity) || 1,
	}))
}

/**
 * Adds the lines kept aside back on the cart, which has just been given the table's order again.
 *
 * @param {Object} cartStore - The till's cart
 * @param {Array<{ item: Object, quantity: number }>|undefined} kept - What `takeUnsentLines` gave
 */
export function putUnsentLinesBack(cartStore, kept) {
	for (const { item, quantity } of kept || []) cartStore.addItem({ ...item }, quantity)
}
