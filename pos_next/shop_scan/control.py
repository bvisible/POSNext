# //// Neoffice — added file (no upstream equivalent).
"""The seller checks a cart the customer paid on the phone, and validates it (lot 4, board 8 of the canvas).

Paid, the cart always passes the counter (« rendez-vous à la réception pour la validation de votre panier », 04.11.2026). The
seller ticks its lines; « all there » submits the sale as it was paid, nothing to take. A paid article that is missing is taken
off the sale and refunded on the payment it was paid by (`payments.api.intent.refund_intent`): the refund counts only when the
provider made it, and the sale is not submitted before. An article found in the bag is added at the till, whose payment takes
the difference and keeps the phone's money (pos_next.api.invoices.update_invoice keeps a guest's payment rows). Each difference
from what the customer paid is written on the sale as a comment, whichever path submitted it (note_the_difference).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt

from pos_next.shop_scan.cart import CHECKED, PAID, amount_due, display_code, read_code
from pos_next.shop_scan.payment import _intents_of, book


def _paid_session(code: str, pos_profile: str):
	session = frappe.db.get_value(
		"Guest Order Token",
		{"cart_code": read_code(code), "mode": "shop", "pos_profile": pos_profile},
		["name", "invoice", "cart_code", "cart_status", "paid_lines"],
		as_dict=True,
	)
	if not session or not session.invoice:
		frappe.throw(_("This till has no phone's cart of this code."))
	if session.cart_status != PAID:
		frappe.throw(_("This cart is not paid: it is sold by the till's payment."))
	return session


def _take_the_missing_off(cart_doc, missing) -> list[dict]:
	"""Take off the sale what the seller found missing ({line, qty}): the lines as they were written, at their rates."""
	rows = {row.name: row for row in cart_doc.items if not row.is_free_item}
	taken = []
	for entry in missing or []:
		row = rows.get(entry.get("line"))
		qty = flt(entry.get("qty"))
		if not row or qty <= 0:
			continue
		qty = min(qty, flt(row.qty))
		taken.append({"item_name": row.item_name, "qty": qty, "amount": flt(row.rate) * qty})
		if qty >= flt(row.qty):
			cart_doc.remove(row)
		else:
			row.qty = flt(row.qty) - qty
	if taken and not [row for row in cart_doc.items if not row.is_free_item]:
		frappe.throw(
			_("Nothing of this cart is left to sell: refund the whole payment from the payment's own record.")
		)
	return taken


def _refund(cart_doc, amount: float):
	"""Refund `amount` on the payments the cart was paid by, newest first, and take it off their rows on the sale."""
	from payments.api import intent as intent_api

	left = flt(amount, 2)
	for intent in reversed(_intents_of(cart_doc.name)):
		if left <= 0:
			break
		if intent.status != "succeeded":
			continue
		share = min(left, flt(intent.amount) / 100)
		intent_api.refund_intent(intent.name, int(round(share * 100)))
		for row in cart_doc.payments:
			if (row.reference_no or "") == (intent.provider_intent_id or intent.name):
				row.amount = flt(flt(row.amount) - share, 2)
				row.base_amount = row.amount
		left = flt(left - share, 2)
	if left > 0.005:
		frappe.throw(_("The payment of this cart cannot be refunded here."))


def validate(code: str, pos_profile: str, missing=None, pos_opening_shift=None) -> dict:
	"""The seller checked the paid cart `code` of the till: submit it as paid, the missing lines ({line, qty}) taken off and
	refunded first. {"invoice", "refunded", "grand_total"}."""
	from pos_next.api.guest_ordering import _as_the_system, _without_repricing
	from pos_next.api.invoices import _set_payment_accounts

	session = _paid_session(code, pos_profile)
	frappe.db.sql("SELECT name FROM `tabGuest Order Token` WHERE name = %s FOR UPDATE", session.name)
	missing = json.loads(missing) if isinstance(missing, str) else missing
	# Booked again first: a payment settled since the cart was opened at the till counts
	book(session.invoice)
	with _as_the_system():
		cart_doc = frappe.get_doc("Sales Invoice", session.invoice)
		if cart_doc.docstatus != 0:
			frappe.throw(_("This cart is already sold."))
		taken = _take_the_missing_off(cart_doc, missing)
		_without_repricing(cart_doc)
		cart_doc.calculate_taxes_and_totals()
		# Measured against what the till takes for what is left: its total rounded as the till rounds it
		due = amount_due(cart_doc)
		if flt(cart_doc.paid_amount) + 0.005 < due:
			frappe.throw(_("This cart is not paid in full: take the rest with the till's payment."))
		refunded = flt(flt(cart_doc.paid_amount) - due, 2) if taken else 0
		if refunded > 0.005:
			_refund(cart_doc, refunded)
			# The money is back with the customer: the sale says so before anything else can fail, and a second
			# validation finds the lines taken off and nothing more to refund
			_without_repricing(cart_doc)
			cart_doc.flags.ignore_permissions = True
			cart_doc.save()
			frappe.db.commit()
		if pos_opening_shift:
			cart_doc.posa_pos_opening_shift = pos_opening_shift
		cart_doc.payments = [row for row in cart_doc.payments if flt(row.amount) > 0]
		_set_payment_accounts(cart_doc.payments, cart_doc.company)
		_without_repricing(cart_doc)
		cart_doc.flags.ignore_permissions = True
		cart_doc.flags.ignore_version = True
		frappe.flags.ignore_account_permission = True
		cart_doc.save()
		cart_doc.submit()
	return {"invoice": cart_doc.name, "refunded": refunded, "grand_total": flt(cart_doc.grand_total)}


def _difference(paid_lines, items) -> tuple[list, list]:
	"""What the sale holds more, and less, than the customer paid: [(item_name, qty, amount)] each."""
	paid = {}
	for line in paid_lines:
		entry = paid.setdefault(
			line["item_code"], {"name": line["item_name"], "qty": 0, "rate": flt(line["rate"])}
		)
		entry["qty"] += flt(line["qty"])
	sold = {}
	for row in items:
		if row.is_free_item:
			continue
		entry = sold.setdefault(row.item_code, {"name": row.item_name, "qty": 0, "rate": flt(row.rate)})
		entry["qty"] += flt(row.qty)
	added, missing = [], []
	for item_code in set(paid) | set(sold):
		delta = flt(sold.get(item_code, {}).get("qty")) - flt(paid.get(item_code, {}).get("qty"))
		entry = sold.get(item_code) or paid.get(item_code)
		if delta > 0:
			added.append((entry["name"], delta, flt(delta * entry["rate"], 2)))
		elif delta < 0:
			missing.append((entry["name"], -delta, flt(-delta * entry["rate"], 2)))
	return sorted(added), sorted(missing)


def note_the_difference(doc, method=None):
	"""Sales Invoice on_submit: a cart paid on the phone is checked; what the sale holds more or less than the customer paid
	is written on it."""
	if doc.doctype != "Sales Invoice" or not doc.is_pos:
		return
	session = frappe.db.get_value(
		"Guest Order Token",
		{"invoice": doc.name, "mode": "shop", "cart_status": PAID},
		["name", "cart_code", "paid_lines"],
		as_dict=True,
	)
	if not session:
		return
	# The session stays open for the phone to say the cart is validated: a checked cart takes no scan
	frappe.db.set_value("Guest Order Token", session.name, "cart_status", CHECKED, update_modified=False)
	added, missing = _difference(json.loads(session.paid_lines or "[]"), doc.items)
	if not added and not missing:
		return

	def money(amount):
		# The currency written apart: fmt_money with a currency loses it where the site hides the symbol
		return f"{doc.currency} {frappe.utils.fmt_money(amount, precision=2)}"

	parts = [
		_("{0}: {1} added at the counter, {2}").format(name, qty, money(amount))
		for name, qty, amount in added
	] + [
		_("{0}: {1} missing, refunded {2}").format(name, qty, money(amount)) for name, qty, amount in missing
	]
	doc.add_comment(
		"Comment",
		_("Check of the cart {0} paid on the phone: {1}.").format(
			display_code(session.cart_code), "; ".join(parts)
		),
	)
