# //// Neoffice — added file (no upstream equivalent). What the till's payment window calls to offer « On the room » (see pos_next/room_charge.py).
"""The two questions the payment window asks about a room: is it offered, and which stay is it."""

import frappe

from pos_next import room_charge


@frappe.whitelist()
def status():
	"""``{"offered", "available", "reason"}``: the button is shown when offered, usable when available, locked with its reason otherwise."""
	# whoever may make a sale at a till may be told whether it can go on a room; a visitor and a portal customer may not
	frappe.has_permission("Sales Invoice", "create", throw=True)
	return room_charge.status()


@frappe.whitelist()
def search_stays(text: str | None = None):
	"""The stays in house that match a room number or a name. The provider decides who may ask."""
	frappe.has_permission("Sales Invoice", "create", throw=True)
	return room_charge.require_provider().search_stays(text)
