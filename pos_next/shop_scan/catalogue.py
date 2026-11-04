# //// Neoffice — added file (no upstream equivalent).
"""What a customer's phone may know of an item of the shop's till."""

import frappe
from frappe.utils import cint, flt

# The keys of the till's item details a phone is given: never its stock, batches, serial numbers, accounts or taxes
PUBLIC_KEYS = ("item_code", "item_name", "image", "uom", "price_list_rate")


def needs_counter_validation(item_code: str) -> bool:
	"""Whether a seller checks the item before it is sold: its own tick, else the tick of its group or of a parent group."""
	item = frappe.db.get_value("Item", item_code, ["requires_counter_validation", "item_group"], as_dict=True)
	if not item:
		return False
	if cint(item.requires_counter_validation):
		return True
	group = frappe.db.get_value("Item Group", item.item_group, ["lft", "rgt"], as_dict=True)
	if not group:
		return False
	return bool(
		frappe.db.exists(
			"Item Group",
			{"lft": ["<=", group.lft], "rgt": [">=", group.rgt], "requires_counter_validation": 1},
		)
	)


def public_item(details: dict) -> dict:
	"""The item as a phone sees it, from the details the till's barcode lookup gives (items.find_item_by_barcode).

	`priced_by_barcode`: the code carries a weight or a price of its own (a scale's label), which the till reads and the
	phone does not."""
	item = {key: details.get(key) for key in PUBLIC_KEYS}
	item["price_list_rate"] = flt(details.get("price_list_rate"))
	item["needs_validation"] = needs_counter_validation(details["item_code"])
	item["priced_by_barcode"] = bool(details.get("resolved_price") or details.get("resolved_qty"))
	return item
