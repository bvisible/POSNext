# //// Neoffice — added file (no upstream equivalent). « On the room »: a restaurant's till puts a meal on the bill of a hotel guest. The till knows
# //// nothing of hotels: an app that runs one declares a provider module in the hook `pos_next_room_charge`, and this file is the till's only door to it.
# //// With no provider, or a provider that is switched off on this site, the till shows nothing and every call here refuses.
"""The till's door to a hotel app.

A provider is a module that answers four calls:

- ``status() -> {"offered": bool, "available": bool, "reason": str | None}``: whether the till shows « On the room » at all (the hotel is
  on), and whether it can be used now (``reason`` says why not, in words for the cashier);
- ``search_stays(text) -> list[dict]``: the stays in house that match a room number or a name (``reservation``, ``room_number``,
  ``guest_name``, ``check_out_date``, ``takes_charges``);
- ``prepare(invoice, reservation) -> str``: before the sale is saved, every refusal that needs no total, and the customer of the stay set on
  the invoice;
- ``post(invoice, reservation) -> dict``: the sale put on the stay's bill, once (the invoice's name is its key).

The two last run inside the request that submits the sale: a refusal raises, and the sale is taken back with it.
"""

import frappe
from frappe import _

HOOK = "pos_next_room_charge"
NOT_OFFERED = {"offered": False, "available": False, "reason": None}


def provider():
	"""The module the hotel app declared, or None when no app did."""
	for path in frappe.get_hooks(HOOK) or []:
		return frappe.get_module(path)
	return None


def status() -> dict:
	"""What the till shows for « On the room ». Nothing when no provider is declared or the provider says the hotel is off."""
	module = provider()
	if not module:
		return dict(NOT_OFFERED)
	answer = module.status() or {}
	return {
		"offered": bool(answer.get("offered")),
		"available": bool(answer.get("available")),
		"reason": answer.get("reason"),
	}


def require_provider():
	module = provider()
	if not module or not status()["offered"]:
		frappe.throw(_("Putting a meal on a room is not available on this site."), frappe.PermissionError)
	return module


def reservation_of(room_charge) -> str | None:
	"""The stay a payload names: ``{"reservation": ...}`` or the name itself."""
	if isinstance(room_charge, dict):
		room_charge = room_charge.get("reservation")
	return room_charge if isinstance(room_charge, str) and room_charge else None
