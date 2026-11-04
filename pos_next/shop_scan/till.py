# //// Neoffice — added file (no upstream equivalent).
"""The till takes a phone's cart over by the code the phone shows.

The cart is answered as it was priced (its lines, rates, discounts, free rows and header discount, as written): the till
loads it without pricing it again, so that it takes the amount the phone showed. Only a cart of the cashier's own till, still
a draft, is found. The till also lists its phones' carts (list_carts), so that a seller finds one without its code.
"""

import frappe
from frappe.utils import flt, now_datetime

from pos_next.shop_scan.cart import AT_THE_COUNTER, display_code, lines_of, read_code
from pos_next.shop_scan.catalogue import needs_counter_validation

# The carts a till lists at most: more than a shop has customers at once
MAX_LISTED = 50


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


def list_carts(pos_profile: str) -> list[dict]:
	"""The phones' carts of the till that are still drafts, the one waiting longest first: each by its code, its customer,
	its amount and article count, since when, where it stands (at the counter, or the customer still scanning) and whether
	a seller checks an article of it. A cart sold, dropped or past its session's end is not listed."""
	sessions = frappe.get_all(
		"Guest Order Token",
		filters={
			"mode": "shop",
			"pos_profile": pos_profile,
			"status": "Active",
			"cart_code": ["is", "set"],
			"invoice": ["is", "set"],
			"expires_at": [">", now_datetime()],
		},
		fields=["invoice", "cart_code", "cart_status"],
		limit=MAX_LISTED,
	)
	if not sessions:
		return []
	drafts = {
		row.name: row
		for row in frappe.get_all(
			"Sales Invoice",
			filters={
				"name": ["in", [s.invoice for s in sessions]],
				"docstatus": 0,
				"pos_profile": pos_profile,
			},
			fields=["name", "customer", "customer_name", "grand_total", "currency", "creation"],
		)
	}
	lines = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": ["in", list(drafts)], "is_free_item": 0},
		fields=["parent", "item_code", "qty"],
	)
	validation = {code: needs_counter_validation(code) for code in {line.item_code for line in lines}}
	carts = []
	for session in sessions:
		draft = drafts.get(session.invoice)
		if not draft:
			continue
		own = [line for line in lines if line.parent == draft.name]
		carts.append(
			{
				"code": display_code(session.cart_code),
				"invoice": draft.name,
				"status": session.cart_status,
				"customer": draft.customer,
				"customer_name": draft.customer_name,
				"grand_total": flt(draft.grand_total),
				"currency": draft.currency,
				"articles": flt(sum(flt(line.qty) for line in own)),
				"since": str(draft.creation),
				"needs_validation": any(validation[line.item_code] for line in own),
			}
		)
	return sorted(carts, key=lambda cart: cart["since"])
