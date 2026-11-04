# //// Neoffice — added file (no upstream equivalent).
"""A phone pays its cart in the shop, by the payment page the restaurant's guests pay on, and the cart waits for its check.

The payment is a Payment Intent of the `payments` app on Wallee's hosted page (`wallee_web`), for what the server says the cart
owes, never what the page sends; the page's return addresses are the server's own. The cart takes no more scan from the moment
the payment starts. The money is booked on the draft on the provider's word (`reconcile_payment_intent`, once per intent) and
the draft is NOT submitted: paid in full, the cart is `Paid` and waits for the seller's check at the counter (control.py), who
submits it. The page coming back books it (confirm); a page that never comes back is booked by the intent's own update
(book_on_payment) and by the five-minute safety net (book_paid_carts), as the web takeaway order is (#2132).
"""

import json

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_url, now_datetime

from pos_next.shop_scan.cart import (
	AT_THE_COUNTER,
	CHECKED,
	PAID,
	_cart_of,
	_locked_session,
	display_code,
	lines_of,
	view,
)
from pos_next.shop_scan.catalogue import needs_counter_validation
from pos_next.shop_scan.session import DEFAULT_LIFETIME_HOURS, require_shop_token, settings_of

# POS Settings.shop_scan_validation_on_phone: an article a seller checks closes the payment on the phone (the default)
BLOCKS = "Blocks the payment"
WEB_CHANNEL = "wallee_web"


def _provider():
	from pos_next.api.guest_ordering import _resolve_wallee_provider

	return _resolve_wallee_provider(required=False)


def payment_refusal(token_doc, cart_doc, lines=None) -> str | None:
	"""Why the phone may not pay its cart now, or None: an empty cart, a cart paid or checked, a shop that takes the payment
	at the till (its setting, or no payment page), an article a seller checks where that closes the payment on the phone."""
	if token_doc.cart_status in (PAID, CHECKED):
		return _("This cart is paid.")
	lines = lines if lines is not None else (lines_of(cart_doc) if cart_doc else [])
	if not cart_doc or not [line for line in lines if not line["is_free_item"]]:
		return _("Your cart is empty.")
	settings = settings_of(token_doc.pos_profile) or {}
	if not cint(settings.get("shop_scan_phone_payment")) or not _provider():
		return _("This shop takes the payment at the till.")
	if (settings.get("shop_scan_validation_on_phone") or BLOCKS) == BLOCKS and any(
		line["needs_validation"] for line in lines if not line["is_free_item"]
	):
		return _("An article of your cart is checked by a seller: this cart is paid at the till.")
	return None


def _shop_page(token_doc, outcome):
	"""The page the payment comes back to: the shop's own, never an address the page sent."""
	from pos_next.shop_scan.session import shop_key

	return f"{get_url()}/pos/shop/{shop_key(token_doc.pos_profile)}?payment={outcome}"


def start(token: str) -> dict:
	"""Open the payment of the phone's cart for what it owes: {"payment_url", "intent_name"}. The cart takes no more scan."""
	from payments.api import intent as intent_api

	from pos_next.api.guest_ordering import _wallee_mode_of_payment

	token_doc = _locked_session(token)
	cart_doc = _cart_of(token_doc)
	refusal = payment_refusal(token_doc, cart_doc)
	if refusal:
		frappe.throw(refusal)
	owed = flt(flt(cart_doc.grand_total) - flt(cart_doc.paid_amount), 2)
	if owed <= 0:
		frappe.throw(_("This cart is paid."))
	if token_doc.cart_status != AT_THE_COUNTER:
		frappe.db.set_value(
			"Guest Order Token", token_doc.name, "cart_status", AT_THE_COUNTER, update_modified=False
		)
	attempt = frappe.db.count("Sales Invoice Payment", {"parent": cart_doc.name}) + 1
	intent = intent_api.create_intent(
		provider=_provider(),
		channel=WEB_CHANNEL,
		amount=int(round(owed * 100)),
		currency=cart_doc.currency,
		reference_doctype="Sales Invoice",
		reference_name=cart_doc.name,
		metadata={
			"line_items": [
				{
					"name": _("Cart {0}").format(display_code(token_doc.cart_code)),
					"quantity": 1,
					"amount_including_tax": owed,
					"type": "PRODUCT",
					"unique_id": f"{cart_doc.name}-p{attempt}",
				}
			],
			"token": token,
			"shop_cart": 1,
			"mode_of_payment": _wallee_mode_of_payment(),
			"success_url": _shop_page(token_doc, "done"),
			"failed_url": _shop_page(token_doc, "failed"),
		},
	)
	payment_url = (intent.get("next_action_payload") or {}).get("url")
	if intent.get("status") in ("failed", "canceled") or not payment_url:
		frappe.log_error("Shop cart payment could not start", f"{cart_doc.name}\n{intent}")
		frappe.throw(_("The payment could not start. Please pay at the till."))
	return {"payment_url": payment_url, "intent_name": intent.get("intent_name")}


def _intents_of(invoice):
	if not frappe.db.table_exists("Payment Intent"):
		return []
	return frappe.get_all(
		"Payment Intent",
		filters={"reference_doctype": "Sales Invoice", "reference_name": invoice},
		fields=["name", "status", "amount", "provider_intent_id"],
		order_by="creation asc",
	)


def paid_lines_of(cart_doc) -> list[dict]:
	"""The lines of the cart as the customer paid them: what the check at the counter is measured against."""
	return [
		{
			"line": row.name,
			"item_code": row.item_code,
			"item_name": row.item_name,
			"qty": flt(row.qty),
			"rate": flt(row.rate),
			"amount": flt(row.amount),
		}
		for row in cart_doc.items
		if not row.is_free_item
	]


def book(invoice: str) -> bool:
	"""Book on a shop cart's draft each Payment Intent the provider settled, once; a cart paid in full becomes `Paid`, keeps
	the lines it was paid for, and outlives its session's lifetime (it waits for its check). True when the cart is paid."""
	from payments.api.reconciliation import reconcile_payment_intent

	from pos_next.api.guest_ordering import _as_the_system

	session = frappe.db.get_value(
		"Guest Order Token",
		{"invoice": invoice, "mode": "shop"},
		["name", "pos_profile", "cart_status", "expires_at"],
		as_dict=True,
	)
	if not session or session.cart_status == CHECKED:
		return bool(session)
	for intent in _intents_of(invoice):
		if intent.status == "succeeded":
			# One booking of an intent at a time: the page asking again, a second tab or the hook wait for the first to commit
			frappe.db.sql("SELECT name FROM `tabPayment Intent` WHERE name=%s FOR UPDATE", intent.name)
			with _as_the_system():
				reconcile_payment_intent(intent.name)
	cart_doc = frappe.get_doc("Sales Invoice", invoice)
	paid = cart_doc.docstatus == 0 and flt(cart_doc.paid_amount) >= flt(cart_doc.grand_total) > 0
	if paid and session.cart_status != PAID:
		hours = (
			cint(
				frappe.db.get_value(
					"POS Settings", {"pos_profile": session.pos_profile}, "shop_cart_lifetime_hours"
				)
			)
			or DEFAULT_LIFETIME_HOURS
		)
		frappe.db.set_value(
			"Guest Order Token",
			session.name,
			{
				"cart_status": PAID,
				"paid_lines": json.dumps(paid_lines_of(cart_doc)),
				"expires_at": max(session.expires_at, add_to_date(now_datetime(), hours=hours)),
			},
			update_modified=False,
		)
	return paid


def confirm(token: str) -> dict:
	"""The page is back from the payment page: {"status": "paid" | "awaiting_payment" | "failed", "cart"}, on the provider's word."""
	token_doc = require_shop_token(token)
	if token_doc.cart_status not in (PAID, CHECKED) and token_doc.invoice:
		book(token_doc.invoice)
		frappe.db.commit()
		token_doc.reload()
	if token_doc.cart_status in (PAID, CHECKED):
		status = "paid"
	else:
		intents = _intents_of(token_doc.invoice) if token_doc.invoice else []
		status = (
			"awaiting_payment"
			if not intents
			or intents[-1].status in ("requires_action", "processing", "requires_payment_method")
			else "failed"
		)
	from pos_next.shop_scan.cart import _checked_cart_of

	return {"status": status, "cart": view(token_doc, _cart_of(token_doc) or _checked_cart_of(token_doc))}


def book_on_payment(doc, method=None):
	"""`Payment Intent` on_update: the provider just settled a payment of a shop cart; it is booked after the commit, whoever
	opens the page afterwards."""
	if doc.status != "succeeded" or doc.reference_doctype != "Sales Invoice" or not doc.reference_name:
		return
	if not frappe.db.exists("Guest Order Token", {"invoice": doc.reference_name, "mode": "shop"}):
		return
	frappe.enqueue(
		"pos_next.shop_scan.payment.book_in_the_background",
		queue="short",
		enqueue_after_commit=True,
		invoice=doc.reference_name,
	)


def book_in_the_background(invoice):
	try:
		book(invoice)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error("A paid shop cart could not be booked", f"{invoice}\n{frappe.get_traceback()}")


def book_paid_carts():
	"""Every five minutes: the shop carts the provider has paid and nobody booked (a job lost to a restart, an intent settled by
	a path that fires no event). Two days back, twenty at a time."""
	if not frappe.db.table_exists("Payment Intent"):
		return
	names = frappe.db.sql_list(
		"""
		select i.name
		from `tabSales Invoice` i
		where i.docstatus = 0
			and i.creation > %s
			and exists (select 1 from `tabGuest Order Token` t where t.invoice = i.name and t.mode = 'shop'
				and ifnull(t.cart_status, '') not in ('Paid', 'Checked'))
			and exists (select 1 from `tabPayment Intent` p where p.reference_doctype = 'Sales Invoice'
				and p.reference_name = i.name and p.status = 'succeeded')
		order by i.creation
		limit 20
		""",
		(add_to_date(now_datetime(), days=-2),),
	)
	for invoice in names:
		book_in_the_background(invoice)
