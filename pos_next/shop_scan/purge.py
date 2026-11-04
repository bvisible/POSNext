# //// Neoffice — added file (no upstream equivalent).
"""A phone's cart nobody paid nor took over is deleted after the lifetime its till sets (hourly).

Only the drafts of a shop session (a Guest Order Token of mode `shop` links them) are looked at, never a till's own draft nor
a table's order. A cart with any payment (paid on the phone, or a Payment Intent the provider settled) is never deleted: it
waits for its check at the counter. `frappe.delete_doc` keeps a Deleted Document of each, and the session of the cart is
expired. A till whose carts fail is logged and the others go on.
"""

import frappe
from frappe.utils import add_to_date, cint, flt, now_datetime

from pos_next.shop_scan.session import DEFAULT_LIFETIME_HOURS


def _paid(cart_name) -> bool:
	if flt(frappe.db.get_value("Sales Invoice", cart_name, "paid_amount")) > 0:
		return True
	return bool(
		frappe.db.exists("DocType", "Payment Intent")
		and frappe.db.exists(
			"Payment Intent",
			{"reference_doctype": "Sales Invoice", "reference_name": cart_name, "status": "succeeded"},
		)
	)


def purge_abandoned_carts() -> int:
	"""Delete the abandoned carts of every till; the number deleted."""
	deleted = 0
	tills = frappe.get_all(
		"Guest Order Token",
		filters={"mode": "shop", "invoice": ["is", "set"]},
		pluck="pos_profile",
		distinct=True,
	)
	for pos_profile in tills:
		try:
			deleted += _purge_the_carts_of(pos_profile)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(
				"Shop carts of a till could not be purged",
				f"POS Profile {pos_profile}\n\n{frappe.get_traceback()}",
			)
	return deleted


def _purge_the_carts_of(pos_profile) -> int:
	hours = (
		cint(frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, "shop_cart_lifetime_hours"))
		or DEFAULT_LIFETIME_HOURS
	)
	before = add_to_date(now_datetime(), hours=-hours)
	sessions = frappe.get_all(
		"Guest Order Token",
		filters={"mode": "shop", "pos_profile": pos_profile, "invoice": ["is", "set"]},
		fields=["name", "invoice"],
	)
	deleted = 0
	for session in sessions:
		cart = frappe.db.get_value("Sales Invoice", session.invoice, ["docstatus", "modified"], as_dict=True)
		if not cart or cart.docstatus != 0 or cart.modified >= before or _paid(session.invoice):
			continue
		frappe.db.set_value(
			"Guest Order Token", session.name, {"status": "Expired", "invoice": None}, update_modified=False
		)
		frappe.delete_doc("Sales Invoice", session.invoice, ignore_permissions=True, force=True)
		deleted += 1
	return deleted
