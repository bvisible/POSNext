//// Neoffice — added file (no upstream equivalent). An item's VAT maps are the till's (NeoResto lot 1, task 11): the
//// server computes `item_tax_rate` for the till's own tax category and `takeaway_item_tax_rate` for its restaurant's
//// takeaway category (pos_next.restaurant.takeaway_tax.attach_item_tax_rates) and stamps the till they are for
//// (`vat_maps_pos_profile`). The offline item cache is keyed by item code only and shared by every till of a browser,
//// so it keeps the maps by till (`vat_maps`): a browser that switches tills never taxes a line with the other till's
//// maps, online or offline.

/**
 * The maps the server computed for a till, read off an item: kept by till in the cache, or the item's own fields when
 * they are for that till (an item straight from the server). None (null) when the item has none for it.
 * @param {Object} item - an item from the server or from the offline cache
 * @param {string|null} posProfile - the till
 * @returns {{item_tax_rate: string, takeaway_item_tax_rate: string|null}|null}
 */
export function vatMapsFor(item, posProfile) {
	if (!item) return null
	const kept = posProfile ? item.vat_maps?.[posProfile] : null
	if (kept) return kept
	if (item.item_tax_rate == null) return null
	if (
		item.vat_maps_pos_profile &&
		posProfile &&
		item.vat_maps_pos_profile !== posProfile
	)
		return null
	return {
		item_tax_rate: item.item_tax_rate,
		takeaway_item_tax_rate: item.takeaway_item_tax_rate ?? null,
	}
}

/**
 * The maps an item keeps in the cache: those of every till that loaded it, the new till's added to the cached row's.
 * Spread into the cached row by the two writers (utils/offline/items.js, workers/offline.worker.js).
 * @param {Object} item - the item from the server, stamped with its till
 * @param {Object|undefined} cached - the row the cache holds for it, if any
 * @returns {{vat_maps?: Object}}
 */
export function withVatMapsByTill(item, cached) {
	const kept = cached?.vat_maps || undefined
	const posProfile = item?.vat_maps_pos_profile
	if (!posProfile || item.item_tax_rate == null)
		return kept ? { vat_maps: kept } : {}
	return {
		vat_maps: {
			...(kept || {}),
			[posProfile]: {
				item_tax_rate: item.item_tax_rate,
				takeaway_item_tax_rate: item.takeaway_item_tax_rate ?? null,
			},
		},
	}
}
