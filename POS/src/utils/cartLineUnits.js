//// Neoffice — added file (no upstream equivalent). The units of a cart line, whatever path added the line
//// (NeoRestau lot 1, task 22). A line can be born from a grid item, a restaurant card entry, a menu course, a table's
//// order read back from the server or an offline invoice's row, and each of them knows a different part of the
//// item's units: the grid item all of them, a card entry its stock unit and the others, an order row only the unit
//// the line is in. The part a source does not know is derived from the rest or looked up, never invented: a dish
//// added from a card opened « Edit Item Details » with « Nos » in the header and an empty unit select, because the
//// card entry carried no unit and the dialog made one up.

/**
 * The unit fields of a cart line, from whatever its source knows of the item's units.
 *
 *  - `uom`: the unit the line is in (else the stock unit);
 *  - `stock_uom`: the unit the item is stocked in (else the unit of the line when it is worth one stock unit);
 *  - `conversion_factor`: stock units per unit of the line;
 *  - `item_uoms`: the item's OTHER units with their factors, as `get_items` answers them.
 *
 * Nothing is invented: a source that knows no unit at all gives a line without one, which the server fills in when it
 * writes the invoice, and which the unit select shows empty rather than as « Nos ».
 *
 * @param {Object} source - A grid item, a card entry, a menu course item, an order row, an offline invoice row...
 * @returns {{uom?: string, stock_uom?: string, conversion_factor: number, item_uoms: Array<{uom: string, conversion_factor: number}>}}
 */
export function unitsOf(source) {
	const conversionFactor = Number(source?.conversion_factor) || 1
	const uom = source?.uom || source?.stock_uom || undefined
	// A unit worth one stock unit, for an item whose stock unit nobody gave, is its stock unit
	const stockUom =
		source?.stock_uom || (conversionFactor === 1 ? uom : undefined)
	return {
		uom,
		stock_uom: stockUom,
		conversion_factor: conversionFactor,
		item_uoms: Array.isArray(source?.item_uoms) ? source.item_uoms : [],
	}
}

/**
 * The units a cart line can be changed to, each once and none empty: the stock unit first, then the item's others. The
 * unit the line is in is always one of them, even when the item's own list does not hold it.
 *
 * @param {Object} line - A cart line (or anything `unitsOf` reads)
 * @returns {string[]}
 */
export function uomChoices(line) {
	const listed = [
		line?.stock_uom,
		...(line?.item_uoms || []).map((unit) => unit?.uom),
	]
	const choices = [...new Set(listed.filter(Boolean))]
	if (line?.uom && !choices.includes(line.uom)) choices.unshift(line.uom)
	return choices
}

/**
 * The cart line a restaurant card entry becomes (the station, which needs the restaurant store, is added by the caller).
 *
 * @param {Object} cardItem - An `Item` entry of a card, as `get_active_cards` answers it
 * @returns {Object} The item handed to `cartStore.addItem`
 */
export function cardItemToCartItem(cardItem) {
	return {
		item_code: cardItem.item,
		item_name: cardItem.item_name || cardItem.label,
		item_group: cardItem.item_group || "",
		rate: cardItem.price || cardItem.default_price || 0,
		image: cardItem.image || "",
		custom_color: cardItem.custom_color || "",
		// Whether the dish is a stock item: the card read answers it, and a line that does not carry it is checked against a stock
		// quantity it never had (the + of a card line was refused as out of stock on a till that enforces stock validation)
		is_stock_item: cardItem.is_stock_item,
		...unitsOf(cardItem),
	}
}

/**
 * The cart line a course item of a chosen menu becomes. The first item carries the whole price of the menu and the others
 * go in at 0 (`price_override`), each tagged with its menu and its course so the kitchen ticket reads right.
 *
 * @param {Object} menuItem - A chosen course item, as the menu dialog confirms it
 * @returns {Object} The item handed to `cartStore.addItem`
 */
export function menuItemToCartItem(menuItem) {
	return {
		item_code: menuItem.item_code,
		item_name: menuItem.item_name,
		rate: menuItem.price_override,
		is_menu_item: true,
		menu_name: menuItem.menu_name,
		posa_special_instructions: `[${menuItem.menu_name}] ${menuItem.course_name}`,
		...unitsOf(menuItem),
	}
}

/**
 * Rows of a stored invoice (an offline invoice's items) given the units the till keeps for their items. A stored row
 * is in the invoice's format: it names the unit it is in and its factor, not the item's other units, so a line made
 * from it could not be changed to another unit.
 *
 * @param {Array<Object>} rows
 * @param {(itemCode: string) => Promise<Object|null>} findItem - The till's own copy of an item (IndexedDB), or null
 * @returns {Promise<Array<Object>>}
 */
export async function withKnownUnits(rows, findItem) {
	return Promise.all(
		rows.map(async (row) => {
			if (!row?.item_code || row.item_uoms?.length) return row
			const known = await Promise.resolve(findItem(row.item_code)).catch(
				() => null,
			)
			if (!known) return row
			return {
				...row,
				stock_uom: row.stock_uom || known.stock_uom,
				item_uoms: known.item_uoms || [],
			}
		}),
	)
}
