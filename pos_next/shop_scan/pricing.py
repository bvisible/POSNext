# //// Neoffice — added file (no upstream equivalent).
"""A phone's cart priced as the till prices it: the price list of the till, then every offer of the till.

The till's offers come from its own engine (pos_next.api.invoices.apply_offers): a discount on a line, a free item, a
discount on the whole cart, for the cart's customer. They are written on the draft itself (rates, discounts, free rows,
the header discount) and the draft is saved with ignore_pricing_rule: its total is the amount the phone shows, the amount
the till takes (« not a centime more, not a centime less », 04.11.2026).
"""

import frappe
from frappe.utils import flt


def _offers_of_the_till(invoice_doc, rows):
	"""apply_offers on the cart's priced rows, as the system; no offer (and the failure logged) when it fails."""
	from pos_next.api.guest_ordering import _as_the_system, _forget_messages_after, _messages_queued
	from pos_next.api.invoices import apply_offers

	invoice_data = {
		"doctype": "Sales Invoice",
		"pos_profile": invoice_doc.pos_profile,
		"customer": invoice_doc.customer,
		"currency": invoice_doc.currency,
		"is_pos": 1,
		"posting_date": str(invoice_doc.posting_date) if invoice_doc.posting_date else None,
		"items": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"qty": flt(row.qty),
				"uom": row.uom,
				"price_list_rate": flt(row.price_list_rate),
				"rate": flt(row.price_list_rate),
				"discount_percentage": 0,
				"discount_amount": 0,
			}
			for row in rows
		],
	}
	queued = _messages_queued()
	try:
		with _as_the_system():
			return apply_offers(invoice_data) or {}
	except Exception:
		_forget_messages_after(queued)
		frappe.log_error("Shop cart offers failed", frappe.get_traceback())
		return {}


def price_the_cart(invoice_doc):
	"""Write the till's prices and offers on the draft `invoice_doc` and work its totals out (in memory: the caller saves)."""
	from pos_next.api.guest_ordering import _as_the_system, _without_repricing

	# The free rows and the discounts of the last pricing are worked out again from the paid rows
	rows = [row for row in invoice_doc.items if not row.is_free_item]
	invoice_doc.set("items", rows)
	for row in rows:
		row.rate = flt(row.price_list_rate)
		row.discount_percentage = 0
		row.discount_amount = 0
		row.pricing_rules = ""
	invoice_doc.additional_discount_percentage = 0
	invoice_doc.discount_amount = 0

	result = _offers_of_the_till(invoice_doc, rows) if rows else {}
	precision = invoice_doc.precision("rate", "items") if rows else 2
	for row, priced in zip(rows, result.get("items") or [], strict=False):
		percentage = flt(priced.get("discount_percentage"))
		if percentage > 0:
			row.discount_percentage = percentage
			row.rate = flt(flt(row.price_list_rate) * (1 - percentage / 100), precision)
			row.discount_amount = flt(row.price_list_rate) - row.rate
			row.pricing_rules = priced.get("pricing_rules") or ""
	for free in result.get("free_items") or []:
		invoice_doc.append(
			"items",
			{
				"item_code": free.get("item_code"),
				"item_name": free.get("item_name"),
				"qty": flt(free.get("qty")) or 1,
				"uom": free.get("uom"),
				"is_free_item": 1,
				"price_list_rate": flt(free.get("price_list_rate")),
				"rate": flt(free.get("rate")),
				"discount_percentage": 100 if not flt(free.get("rate")) else 0,
				"pricing_rules": free.get("pricing_rules") or "",
				"warehouse": rows[0].warehouse if rows else None,
			},
		)
	header_percentage = flt(result.get("additional_discount_percentage") or result.get("discount_percentage"))
	if header_percentage > 0:
		invoice_doc.additional_discount_percentage = header_percentage
	elif flt(result.get("discount_amount")) > 0:
		invoice_doc.discount_amount = flt(result.get("discount_amount"))
	if header_percentage > 0 or flt(result.get("discount_amount")) > 0:
		invoice_doc.apply_discount_on = result.get("apply_discount_on") or "Grand Total"

	_without_repricing(invoice_doc)
	with _as_the_system():
		invoice_doc.run_method("calculate_taxes_and_totals")
	return invoice_doc


def keep_the_phones_prices(doc, method=None):
	"""Sales Invoice before_validate: the draft of a phone's cart keeps the prices it was written with, whoever saves it.

	The `payments` app books a settled payment on the draft with a plain save (reconcile_payment_intent), and ERPNext then set
	the price list rate back on a line under an offer (the trap of #2228): the amount paid no longer met the draft's total, and
	the cart was never said paid. A shop cart is priced here only (price_the_cart), and saved with its prices kept."""
	if doc.docstatus != 0 or not doc.get("is_pos") or not doc.name or doc.flags.get("shop_prices_kept"):
		return
	if not frappe.db.exists("Guest Order Token", {"invoice": doc.name, "mode": "shop"}):
		return
	from pos_next.api.guest_ordering import _without_repricing

	doc.flags.shop_prices_kept = True
	_without_repricing(doc)
