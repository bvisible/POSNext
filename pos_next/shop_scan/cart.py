# //// Neoffice — added file (no upstream equivalent).
"""A phone's cart in the shop: a draft Sales Invoice of the shop's till, written by the system.

The phone sends a barcode and a quantity, never a price: the server finds the item in the till (items.find_item_by_barcode,
the till's own rules), prices the cart as the till prices it (pricing.price_the_cart) and answers the cart as the phone
shows it. A finished cart waits for the till: it takes no more scan and is priced no more, so the amount the phone said is
the amount the till takes. The session is read FOR UPDATE before every write: two scans of one phone queue, they never make
two drafts or lose a quantity. The cart's code and where it stands are the session's (Guest Order Token.cart_code,
cart_status): the Sales Invoice table of a fleet site is at MariaDB's row size, and takes no column for it.
"""

import secrets

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

from pos_next.shop_scan.catalogue import needs_counter_validation, public_item
from pos_next.shop_scan.pricing import price_the_cart
from pos_next.shop_scan.session import require_shop_token

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
MAX_QTY = 999
SCANNING = "Scanning"
AT_THE_COUNTER = "At the counter"
# Paid on the phone, the cart waits for the seller's check; then the seller checked it and the sale is submitted (lot 4)
PAID = "Paid"
CHECKED = "Checked"


def display_code(code: str | None) -> str | None:
	"""A cart's code as the phone shows it: « K7Q-24M »."""
	return f"{code[:3]}-{code[3:]}" if code else None


def read_code(text: str) -> str:
	"""A cart's code as typed or scanned: dashes, spaces and case left out."""
	return "".join(ch for ch in cstr(text).upper() if ch.isalnum())


def _new_code() -> str:
	"""A code no cart has ever had (32^6 of them: a code is never given twice)."""
	while True:
		code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
		if not frappe.db.exists("Guest Order Token", {"cart_code": code}):
			return code


def _quantity(qty, allow_zero=False) -> int:
	value = flt(qty)
	if value != int(value) or not ((0 if allow_zero else 1) <= value <= MAX_QTY):
		frappe.throw(_("Invalid quantity."))
	return int(value)


def _locked_session(token: str):
	"""The phone's session, read again FOR UPDATE: its writes queue behind one another."""
	token_doc = require_shop_token(token)
	frappe.db.sql("SELECT name FROM `tabGuest Order Token` WHERE name = %s FOR UPDATE", token_doc.name)
	token_doc.reload()
	return token_doc


def _cart_of(token_doc):
	"""The session's draft, or None (none yet, or no longer a draft)."""
	if token_doc.invoice and frappe.db.exists("Sales Invoice", {"name": token_doc.invoice, "docstatus": 0}):
		return frappe.get_doc("Sales Invoice", token_doc.invoice)
	return None


def _new_cart(token_doc):
	profile = frappe.get_cached_doc("POS Profile", token_doc.pos_profile)
	customer = (
		token_doc.customer or profile.customer or frappe.db.get_single_value("Selling Settings", "customer")
	)
	if not customer:
		frappe.throw(_("This till has no default customer."))
	return frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"is_pos": 1,
			"pos_profile": token_doc.pos_profile,
			"company": profile.company,
			"currency": profile.currency or frappe.defaults.get_global_default("currency"),
			"selling_price_list": profile.selling_price_list,
			"customer": customer,
			"items": [],
		}
	)


def _refuse_a_waiting_cart(token_doc):
	if token_doc.cart_status in (AT_THE_COUNTER, PAID, CHECKED):
		frappe.throw(_("This cart is waiting for the till."))


def _save(token_doc, cart):
	"""Price the cart as the till does and save it as the system; a new one is linked to the session."""
	from pos_next.api.guest_ordering import _as_the_system

	# A draft made by frappe.get_doc({...}) has no name until it is inserted (is_new() reads __islocal, which only new_doc sets)
	is_new = not cart.name
	price_the_cart(cart)
	cart.flags.ignore_permissions = True
	cart.flags.ignore_version = True
	with _as_the_system():
		if is_new:
			cart.insert()
			code = _new_code()
			frappe.db.set_value(
				"Guest Order Token",
				token_doc.name,
				{"invoice": cart.name, "cart_code": code, "cart_status": SCANNING},
				update_modified=False,
			)
			token_doc.update({"invoice": cart.name, "cart_code": code, "cart_status": SCANNING})
		else:
			cart.save()


def scan(token: str, barcode: str, qty=1) -> dict:
	"""Add `qty` of the item `barcode` names to the phone's cart (one line per item, quantities added), and answer the cart."""
	from pos_next.api.guest_ordering import _as_the_system
	from pos_next.api.items import find_item_by_barcode

	token_doc = _locked_session(token)
	qty = _quantity(qty)
	cart = _cart_of(token_doc)
	_refuse_a_waiting_cart(token_doc)

	barcode = cstr(barcode).strip()
	with _as_the_system():
		details = find_item_by_barcode(barcode, token_doc.pos_profile) if barcode else None
	if not details:
		frappe.throw(_("This article is not sold here."))
	item = public_item(details)
	if item["priced_by_barcode"]:
		frappe.throw(_("This article is scanned at the counter."))
	if item["price_list_rate"] <= 0:
		frappe.throw(_("This article has no price here. Please go to the counter."))

	cart = cart or _new_cart(token_doc)
	row = next(
		(
			r
			for r in cart.items
			if not r.is_free_item and r.item_code == item["item_code"] and r.uom == item["uom"]
		),
		None,
	)
	if row:
		row.qty = _quantity(flt(row.qty) + qty)
	else:
		cart.append(
			"items",
			{
				"item_code": item["item_code"],
				"item_name": item["item_name"],
				"qty": qty,
				"uom": item["uom"],
				"conversion_factor": flt(details.get("conversion_factor")) or 1,
				"price_list_rate": item["price_list_rate"],
				"rate": item["price_list_rate"],
				"warehouse": details.get("warehouse"),
			},
		)
	_save(token_doc, cart)
	return view(token_doc, cart)


def set_line_qty(token: str, line: str, qty) -> dict:
	"""Set the quantity of one line of the phone's cart; 0 takes the line out."""
	token_doc = _locked_session(token)
	qty = _quantity(qty, allow_zero=True)
	cart = _cart_of(token_doc)
	_refuse_a_waiting_cart(token_doc)
	row = next((r for r in (cart.items if cart else []) if r.name == line and not r.is_free_item), None)
	if not row:
		frappe.throw(_("This line is not in your cart."))
	if qty:
		row.qty = qty
	else:
		cart.remove(row)
	if not [r for r in cart.items if not r.is_free_item]:
		# An invoice with no line is refused: the emptied cart is dropped, the next scan starts a new one
		_drop(token_doc, cart)
		return view(token_doc, None)
	_save(token_doc, cart)
	return view(token_doc, cart)


def _drop(token_doc, cart):
	from pos_next.api.guest_ordering import _as_the_system

	frappe.db.set_value(
		"Guest Order Token",
		token_doc.name,
		{"invoice": None, "cart_code": None, "cart_status": None},
		update_modified=False,
	)
	token_doc.update({"invoice": None, "cart_code": None, "cart_status": None})
	with _as_the_system():
		frappe.delete_doc("Sales Invoice", cart.name, ignore_permissions=True, force=True)


def get(token: str) -> dict:
	token_doc = require_shop_token(token)
	return view(token_doc, _cart_of(token_doc) or _checked_cart_of(token_doc))


def _checked_cart_of(token_doc):
	"""The sale a cart became once the seller checked it, for the phone to say so; None before."""
	if token_doc.cart_status == CHECKED and token_doc.invoice:
		return frappe.get_doc("Sales Invoice", token_doc.invoice)
	return None


def finish(token: str) -> dict:
	"""The customer is done: the cart waits for the till, as it is priced now."""
	token_doc = _locked_session(token)
	cart = _cart_of(token_doc)
	_refuse_a_waiting_cart(token_doc)
	if not cart or not [row for row in cart.items if not row.is_free_item]:
		frappe.throw(_("Your cart is empty."))
	frappe.db.set_value(
		"Guest Order Token", token_doc.name, "cart_status", AT_THE_COUNTER, update_modified=False
	)
	token_doc.cart_status = AT_THE_COUNTER
	return view(token_doc, cart)


def lines_of(cart) -> list[dict]:
	return [
		{
			"line": row.name,
			"item_code": row.item_code,
			"item_name": row.item_name,
			"image": row.image or frappe.db.get_value("Item", row.item_code, "image"),
			"qty": flt(row.qty),
			"uom": row.uom,
			"stock_uom": row.stock_uom,
			"conversion_factor": flt(row.conversion_factor) or 1,
			"price_list_rate": flt(row.price_list_rate),
			"rate": flt(row.rate),
			"amount": flt(row.amount),
			"discount_percentage": flt(row.discount_percentage),
			"is_free_item": cint(row.is_free_item),
			"needs_validation": needs_counter_validation(row.item_code),
		}
		for row in cart.items
	]


def amount_due(cart) -> float:
	"""What the customer pays for the cart: the amount the till takes, its total rounded as the till rounds it (to the
	currency's smallest coin, CHF 0.05), or the exact total where the till's profile disables the rounding. A cart of 18.98
	is 19.00 at the till, and so on the phone."""
	if not cart:
		return 0
	if cint(cart.disable_rounded_total) or not flt(cart.rounded_total):
		return flt(cart.grand_total)
	return flt(cart.rounded_total)


def view(token_doc, cart) -> dict:
	"""The cart as the phone shows it: its lines, the total before the offers, what the offers take off, the VAT, the total,
	the rounding of the till and the amount the customer pays (`amount_due`)."""
	lines = lines_of(cart) if cart else []
	total = sum(line["price_list_rate"] * line["qty"] for line in lines if not line["is_free_item"])
	amount = flt(cart.grand_total) if cart else 0
	due = amount_due(cart)
	return {
		"code": display_code(token_doc.cart_code) if cart else None,
		"status": token_doc.cart_status or SCANNING,
		"expires_at": str(token_doc.expires_at) if token_doc.expires_at else None,
		"lines": lines,
		"total": flt(total, 2),
		"discount": flt(
			total - sum(line["amount"] for line in lines) + (flt(cart.discount_amount) if cart else 0), 2
		),
		"tax": flt(cart.total_taxes_and_charges) if cart else 0,
		"grand_total": amount,
		"rounding": flt(due - amount, 2),
		"amount_due": due,
		# The phone writes the amounts in it (an empty cart has no invoice yet: the till's currency)
		"currency": (cart.currency if cart else None)
		or frappe.get_cached_value("POS Profile", token_doc.pos_profile, "currency"),
		"needs_validation": any(line["needs_validation"] for line in lines),
		# What the phone paid of it, and whether it may pay it now (lot 4): the reason when it may not
		"paid_amount": flt(cart.paid_amount) if cart else 0,
		**_payment_of(token_doc, cart, lines),
	}


def _payment_of(token_doc, cart, lines) -> dict:
	from pos_next.shop_scan.payment import payment_refusal

	refusal = payment_refusal(token_doc, cart, lines) if cart else None
	return {"can_pay": bool(cart) and not refusal, "pay_refusal": refusal}
