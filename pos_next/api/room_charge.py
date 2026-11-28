# //// Neoffice — added file (no upstream equivalent). What the till's payment window calls to offer « On the room » (see pos_next/room_charge.py).
"""The two questions the payment window asks about a room: is it offered, and which stay is it."""

import frappe
from frappe import _

from pos_next import room_charge


def _require_signed_in():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to use the till."), frappe.PermissionError)


@frappe.whitelist()
def status():
	"""``{"offered", "available", "reason"}``: the button is shown when offered, usable when available, locked with its reason otherwise."""
	_require_signed_in()
	return room_charge.status()


@frappe.whitelist()
def search_stays(text: str | None = None):
	"""The stays in house that match a room number or a name. The provider decides who may ask."""
	_require_signed_in()
	return room_charge.require_provider().search_stays(text)
