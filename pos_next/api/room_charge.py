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


@frappe.whitelist()
def rooms_of(invoices=None):
	"""Where each sale of a list is, for the history of invoices: `{sale: {room_number, guest_name, released, owed, pin_required, ...}}`
	for the sales that were put on a room. Nothing where no hotel is on."""
	frappe.has_permission("Sales Invoice", "read", throw=True)
	if not room_charge.status()["offered"]:
		return {}
	names = frappe.parse_json(invoices) if isinstance(invoices, str) else (invoices or [])
	provider = room_charge.require_provider()
	found = {}
	for name in names[:50]:
		row = provider.room_of(name) if isinstance(name, str) else None
		if row:
			found[name] = row
	return found


@frappe.whitelist(methods=["POST"])
def move_to_room(invoice: str, reservation: str, reason: str, pin: str | None = None):
	"""Take a meal put on the wrong room to the right one (the hotel app decides what may move, and says why not)."""
	frappe.has_permission("Sales Invoice", "read", doc=invoice, throw=True)
	return room_charge.require_provider().move(invoice, reservation, reason, pin)


@frappe.whitelist(methods=["POST"])
def take_off_the_room(invoice: str, reason: str, pin: str | None = None):
	"""Take a meal off the room: the sale stays owed by the guest, to be cashed at the till."""
	frappe.has_permission("Sales Invoice", "read", doc=invoice, throw=True)
	return room_charge.require_provider().release(invoice, reason, pin)
