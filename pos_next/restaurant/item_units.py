# //// Neoffice — added file (no upstream equivalent). The units of the items a restaurant read hands to the till
# //// (NeoRestau lot 1, task 22).
#
# A cart line made from a restaurant card, a menu course or a table's order read back has to carry what a line made
# from the grid carries (`get_items`): the stock unit of its item and the item's OTHER units with their factors. A
# dish added from a card had neither, so « Edit Item Details » opened with « Nos » in its header and an empty unit
# select. The reads answer these units with the item, in the same shape `get_items` gives them.
import frappe


def units_of(item_codes, stock_uoms=None):
	"""The units of items, read together: two queries however many items there are, never one per item.

	Answers {item_code: {"stock_uom": ..., "item_uoms": [{"uom": ..., "conversion_factor": ...}, ...]}}.
	`item_uoms` holds the item's OTHER units, each once, in the order of the item's table of units; the stock unit
	is `stock_uom` and is left out of it, as `get_items` answers it (the till adds the stock unit itself).

	An item the site no longer has is not in the answer. `stock_uoms` ({item_code: stock_uom}) saves reading the
	items when the caller has just read them.
	"""
	codes = sorted({code for code in item_codes if code})
	if not codes:
		return {}
	if stock_uoms is None:
		stock_uoms = {
			row.name: row.stock_uom
			for row in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=["name", "stock_uom"])
		}
	others = {code: [] for code in codes if code in stock_uoms}
	if others:
		conversions = frappe.get_all(
			"UOM Conversion Detail",
			filters={"parent": ["in", list(others)], "parenttype": "Item"},
			fields=["parent", "uom", "conversion_factor"],
			order_by="parent asc, idx asc",
		)
		for row in conversions:
			listed = others[row.parent]
			if (
				row.uom
				and row.uom != stock_uoms[row.parent]
				and row.uom not in [unit["uom"] for unit in listed]
			):
				listed.append({"uom": row.uom, "conversion_factor": row.conversion_factor})
	return {code: {"stock_uom": stock_uoms[code], "item_uoms": units} for code, units in others.items()}


def stamp(rows, item_key, units):
	"""Put the units of each row's item on the row (`stock_uom` and `item_uoms`); a row whose item is unknown is left as it is.

	`units` is what `units_of` answered. A row that already says its own stock unit (an invoice line) keeps it.
	"""
	for row in rows:
		known = units.get(row.get(item_key))
		if known:
			row["stock_uom"] = row.get("stock_uom") or known["stock_uom"]
			row["item_uoms"] = known["item_uoms"]
	return rows
