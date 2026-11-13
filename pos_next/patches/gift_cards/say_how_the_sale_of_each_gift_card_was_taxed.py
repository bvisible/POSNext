# //// Neoffice — added file (no upstream equivalent). Each gift card says how its sale was taxed, and each till what kind of card it sells (13.11.2026).
"""A value voucher is spent as a payment and a service voucher as a discount (pos_next.gift_card_vat): the way a card goes depends on whether the VAT
was taken when it was sold, which only its sale can say. This patch reads it there, and guesses nothing:

- a card is marked « VAT taken at the sale » when a line of its source invoice that is a gift card item carried a rate other than 0; a card with no source
  invoice (made by hand) was never sold, so its VAT was not taken;
- a till that sells gift cards is a service-voucher till when a past sale of its gift card item was taxed, else a value-voucher till (the proposal).

Nothing is made or moved in the books: the account and the mode of payment of a value card are made when the till's manager saves its settings.
It runs after the doctype sync, which is what makes the columns on a site that has none yet.
"""

import json

import frappe


def _taxed(item_tax_rate) -> bool:
	try:
		rates = json.loads(item_tax_rate or "{}")
	except ValueError:
		return False
	return any(float(rate or 0) > 0 for rate in rates.values()) if isinstance(rates, dict) else False


def _the_items_of_the_tills() -> list[str]:
	if not frappe.db.has_column("POS Settings", "gift_card_item"):
		return []
	return [
		item
		for item in frappe.get_all(
			"POS Settings", filters={"gift_card_item": ["is", "set"]}, pluck="gift_card_item", distinct=True
		)
		if item
	]


def execute():
	if not frappe.db.has_column("Coupon Code", "pos_next_vat_taken_at_sale"):
		return
	items = _the_items_of_the_tills()
	rows = []
	if items:
		rows = frappe.db.sql(
			"""
			SELECT sii.parent AS invoice, sii.item_code AS item, sii.item_tax_rate AS item_tax_rate
			FROM `tabSales Invoice Item` sii
			INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
			WHERE si.docstatus = 1 AND sii.item_code IN %(items)s
			""",
			{"items": tuple(items)},
			as_dict=True,
		)
	taxed_invoices = {row.invoice for row in rows if _taxed(row.item_tax_rate)}
	taxed_items = {row.item for row in rows if _taxed(row.item_tax_rate)}

	for card in frappe.get_all(
		"Coupon Code",
		filters={"pos_next_gift_card": 1},
		fields=["name", "source_invoice", "pos_next_vat_taken_at_sale"],
	):
		taken = 1 if card.source_invoice and card.source_invoice in taxed_invoices else 0
		if int(card.pos_next_vat_taken_at_sale or 0) != taken:
			frappe.db.set_value(
				"Coupon Code", card.name, "pos_next_vat_taken_at_sale", taken, update_modified=False
			)

	if frappe.db.has_column("POS Settings", "gift_card_kind"):
		for till in frappe.get_all(
			"POS Settings",
			filters={"enable_gift_cards": 1},
			fields=["name", "gift_card_item", "gift_card_kind"],
		):
			kind = "Service voucher" if till.gift_card_item in taxed_items else "Value voucher"
			if till.gift_card_kind != kind:
				frappe.db.set_value("POS Settings", till.name, "gift_card_kind", kind, update_modified=False)
