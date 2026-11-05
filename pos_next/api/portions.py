# //// Neoffice — added file (no upstream equivalent). The portions the kitchen made of a product, as the till calls them (NeoResto
# //// lot 1, Daniel, 02.11.2026). The rules are pos_next.restaurant.portions.
import json

import frappe
from frappe import _

from pos_next.api.cash_entry import require_till_user
from pos_next.restaurant import permissions, portions

# What one call may ask: a card is a few dozen products
MOST_ITEMS = 500


def _codes(item_codes):
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes or "[]")
	if not isinstance(item_codes, list) or not all(isinstance(code, str) for code in item_codes):
		frappe.throw(_("The products must be a list of item codes"))
	return item_codes[:MOST_ITEMS]


@frappe.whitelist()
def get_portions(item_codes, exclude_invoice=None):
	"""The portions of the counted products among `item_codes`: {item: {counted, made, sold, left}}.

	`exclude_invoice` is the order on the till's screen, left out of what is sold: the till subtracts its own cart.
	"""
	require_till_user()
	return portions.state(_codes(item_codes), exclude_invoice)


@frappe.whitelist()
def add_portions(item, quantity):
	"""The kitchen can make more: add portions to a counted product. Whoever works at a till may, the kitchen tells the room."""
	require_till_user()
	portions.add(item, quantity)
	return portions.state([item]).get(item)


@frappe.whitelist()
# //// Neoffice — a name is a text: a list from a JSON body would be read as a filter (maintenance#2296).
def get_portion_setting(item: str | None):
	"""What the card editor shows of a product: is it counted, how many were made today, how many are left, and whether its stock counts it."""
	permissions.require_right("manage_cards")
	permissions.require("Item", "read", item)
	answer = portions.state([item]).get(item)
	managed = bool(frappe.db.get_value("Item", item, "is_stock_item"))
	if answer:
		return {"counted": True, "made": answer["made"], "left": answer["left"], "managed_by_stock": managed}
	counted = bool(frappe.db.get_value(portions.DOCTYPE, item, "counted"))
	return {"counted": counted, "made": None, "left": None, "managed_by_stock": managed}


@frappe.whitelist()
# //// Neoffice — a name is a text: a list from a JSON body would be read as a filter (maintenance#2296).
def set_portions(item: str | None, counted, made=None):
	"""Count a product (or stop counting it) and say how many portions the kitchen made today: the card managers'."""
	permissions.require_right("manage_cards")
	permissions.require("Item", "read", item)
	if frappe.db.get_value("Item", item, "is_stock_item"):
		frappe.throw(_("The stock of this product is managed: its stock counts it, not its portions"))
	portions.set_made(item, frappe.parse_json(counted) in (1, True, "1"), None if made in (None, "") else made)
	return get_portion_setting(item)
