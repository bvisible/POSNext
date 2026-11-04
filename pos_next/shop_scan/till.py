# //// Neoffice — added file (no upstream equivalent).
"""The till takes a phone's cart over by the code the phone shows.

The cart is answered as it was priced (its lines, rates, discounts, free rows and header discount, as written): the till
loads it without pricing it again, so that it takes the amount the phone showed. Only a cart of the cashier's own till, still
a draft, is found.
"""

import frappe
from frappe.utils import flt

from pos_next.shop_scan.cart import AT_THE_COUNTER, display_code, lines_of, read_code


def open_cart(code: str, pos_profile: str) -> dict | None:
	session = frappe.db.get_value(
		"Guest Order Token",
		{"cart_code": read_code(code), "mode": "shop", "pos_profile": pos_profile},
		["name", "invoice", "cart_code", "cart_status"],
		as_dict=True,
	)
	if not session or not session.invoice:
		return None
	if not frappe.db.exists(
		"Sales Invoice", {"name": session.invoice, "docstatus": 0, "pos_profile": pos_profile}
	):
		return None
	if session.cart_status != AT_THE_COUNTER:
		# Taken over while the customer was still scanning: the phone's next scan is refused, the cart stays as it is
		frappe.db.set_value(
			"Guest Order Token", session.name, "cart_status", AT_THE_COUNTER, update_modified=False
		)
	cart = frappe.get_doc("Sales Invoice", session.invoice)
	lines = lines_of(cart)
	return {
		"invoice": cart.name,
		"code": display_code(session.cart_code),
		"status": AT_THE_COUNTER,
		"customer": cart.customer,
		"customer_name": cart.customer_name,
		"items": lines,
		"additional_discount_percentage": flt(cart.additional_discount_percentage),
		"discount_amount": flt(cart.discount_amount),
		"apply_discount_on": cart.apply_discount_on,
		"grand_total": flt(cart.grand_total),
		"needs_validation": any(line["needs_validation"] for line in lines),
	}
