//// Neoffice — added file (no upstream equivalent). The groups of a restaurant card as the till lays them out, with a second level (NeoResto lot 1, product owner, 03.11.2026:
//// « des sous-familles : vin blanc, vin rouge, bière… dans les boissons »). A card is a list of rows: categories and the dishes under them. A category row may be a SUB-CATEGORY
//// (`is_subcategory`), one level under the last category that is not one. The grid draws a group per category and per sub-category; the chips choose a category, then one of
//// its sub-categories. Pure functions: the till's page and the specs read the card through here.

import { cardColor } from "@/utils/phoneCard"

/**
 * The groups of a card, in order: [{ category, subcategory?, items }]. A sub-category's group carries the category it stands under, so that choosing the category
 * keeps it; a sub-category with no category above it is a category of its own.
 * @param {Array<Object>} rows - The rows of a card as the server lists them (Category, Item, Menu)
 */
export function groupsOfCard(rows) {
	const groups = []
	let current = { category: null, items: [] }
	// The category a sub-category stands under: the last one that is not a sub-category
	let top = null
	for (const row of rows || []) {
		if (row.item_type === "Category") {
			if (current.items.length > 0 || current.category) groups.push(current)
			if (Number(row.is_subcategory) && top !== null) {
				current = { category: top, subcategory: row.label, items: [] }
			} else {
				top = row.label
				current = { category: row.label, items: [] }
			}
		} else {
			current.items.push(row)
		}
	}
	if (current.items.length > 0 || current.category) groups.push(current)
	return groups
}

/** The labels of the categories that are not sub-categories: the first row of chips. */
export function categoriesOfCard(rows) {
	return (rows || []).filter((row) => row.item_type === "Category" && !Number(row.is_subcategory)).map((row) => row.label)
}

/**
 * The sub-categories of a category, with the colour most of their dishes carry (the first met wins a tie): the second row of chips.
 * @returns {Array<{ label: string, color: string|null }>}
 */
export function subcategoriesOf(groups, category) {
	if (!category) return []
	return groups.filter((group) => group.category === category && group.subcategory).map((group) => ({ label: group.subcategory, color: colorOfGroup(group) }))
}

/** The colour most of the dishes of a group carry: their own, else their item group's. */
export function colorOfGroup(group) {
	const counts = new Map()
	for (const item of group.items) {
		const color = item.item_type === "Menu" ? null : cardColor(item.custom_color) || cardColor(item.service_color)
		if (color) counts.set(color, (counts.get(color) || 0) + 1)
	}
	let best = null
	for (const [color, count] of counts) if (best === null || count > counts.get(best)) best = color
	return best
}

/**
 * The groups to draw: all of them, or those of the category chosen (its own dishes and its sub-categories', or only the sub-category chosen), then the dishes that
 * match the search. The group of a category chosen no longer carries its name (the chip says it).
 */
export function visibleGroups(groups, { category = null, subcategory = null, query = "" } = {}) {
	let shown = groups
	if (category) {
		shown = groups
			.filter((group) => group.category === category)
			.filter((group) => !subcategory || group.subcategory === subcategory)
			.map((group) => ({ category: null, subcategory: group.subcategory, items: group.items }))
	}
	const q = (query || "").toLowerCase().trim()
	if (!q) return shown
	return shown
		.map((group) => ({
			category: group.category,
			subcategory: group.subcategory,
			items: group.items.filter((item) => (item.item_name || item.menu_name || item.label || "").toLowerCase().includes(q)),
		}))
		.filter((group) => group.items.length > 0)
}
