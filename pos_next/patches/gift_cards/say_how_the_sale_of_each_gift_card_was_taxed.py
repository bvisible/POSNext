# //// Neoffice — added file (no upstream equivalent). Each gift card says how its sale was taxed, and each till what kind of card it sells (13.11.2026).
"""A value voucher is spent as a payment and a service voucher as a discount (pos_next.gift_card_vat): the way a card goes depends on whether the VAT
was taken when it was sold, which only its sale can say. This patch reads it there, and guesses nothing:

- a card is marked « VAT taken at the sale » when the line of its source invoice that sold it was taxed: its item tax template names a rate other than 0, OR it
  names no rate for an account the invoice charges VAT on (a line with no template is charged at the rate of the invoice's own tax row, which is how most
  sites sell). That line is the one whose price is the value of the card, or whose item is one a till sells as a gift card today (the item of a till can have
  changed since): in the doubt, any line of the invoice. A card taxed in the doubt keeps its old way (a discount, the status quo), never the new one, which would
  take its VAT twice. A card with no source invoice (made by hand) was never sold, so its VAT was not taken;
- a till that sells gift cards is a service-voucher till when a past sale of its gift card item was taxed, else a value-voucher till (the proposal).

Nothing is made or moved in the books: the account and the mode of payment of a value card are made when the till's manager saves its settings.
It runs after the doctype sync (the columns of POS Settings), but BEFORE the fixtures are imported, which is what makes the custom field of a card: it makes that
field itself when it is not there yet (the import then finds it), or it would find no column, do nothing, and leave every card of a site as a card that was not
taxed (a card taxed at its sale would then be spent as a payment, and its VAT taken twice).
"""

import json

import frappe


def _taxed(line) -> bool:
	"""Whether the VAT was charged on a sale line: its template names a rate, or leaves an account the invoice charges VAT on to the invoice's own rate."""
	try:
		rates = json.loads(line.item_tax_rate or "{}")
	except ValueError:
		rates = {}
	if not isinstance(rates, dict):
		rates = {}
	if any(float(rate or 0) > 0 for rate in rates.values()):
		return True
	return any(account not in rates for account in line.vat_accounts)


# The sale lines with the accounts the invoice charges VAT on (a row of its tax table with a rate); one line, one entry.
LINES_OF_INVOICES = """
	SELECT sii.name AS line, sii.parent AS invoice, sii.item_code AS item, sii.rate AS rate, sii.item_tax_rate AS item_tax_rate, stc.account_head AS account
	FROM `tabSales Invoice Item` sii
	INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
	LEFT JOIN `tabSales Taxes and Charges` stc
		ON stc.parent = si.name AND stc.parenttype = 'Sales Invoice' AND IFNULL(stc.rate, 0) > 0
	WHERE si.docstatus = 1 AND sii.parent IN %(keys)s
"""
LINES_OF_ITEMS = LINES_OF_INVOICES.replace("sii.parent IN %(keys)s", "sii.item_code IN %(keys)s")


def _the_lines(query: str, keys) -> list:
	lines: dict[str, frappe._dict] = {}
	for row in frappe.db.sql(query, {"keys": tuple(keys) or ("",)}, as_dict=True):
		line = lines.setdefault(
			row.line,
			frappe._dict(
				invoice=row.invoice,
				item=row.item,
				rate=row.rate,
				item_tax_rate=row.item_tax_rate,
				vat_accounts=[],
			),
		)
		if row.account:
			line.vat_accounts.append(row.account)
	return list(lines.values())


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


COLUMN = "pos_next_vat_taken_at_sale"


def ensure_the_column() -> None:
	"""The custom field of a card says how its sale was taxed: made here when the fixtures have not made it yet."""
	if frappe.db.has_column("Coupon Code", COLUMN):
		return
	from frappe.custom.doctype.custom_field.custom_field import create_custom_field

	create_custom_field(
		"Coupon Code",
		{
			"fieldname": COLUMN,
			"fieldtype": "Check",
			"label": "VAT taken at the sale",
			"default": "0",
			"insert_after": "original_gift_card_amount",
			"read_only": 1,
		},
	)


def execute():
	ensure_the_column()
	if not frappe.db.has_column("Coupon Code", COLUMN):
		return
	items = set(_the_items_of_the_tills())
	cards = frappe.get_all(
		"Coupon Code",
		filters={"pos_next_gift_card": 1},
		fields=["name", "source_invoice", "original_gift_card_amount", "pos_next_vat_taken_at_sale"],
	)
	sales = {card.source_invoice for card in cards if card.source_invoice}
	lines: dict[str, list] = {}
	if sales:
		for row in _the_lines(LINES_OF_INVOICES, sales):
			lines.setdefault(row.invoice, []).append(row)

	def the_sale_was_taxed(card) -> bool:
		rows = lines.get(card.source_invoice) or []
		sold = [
			row
			for row in rows
			if abs(float(row.rate or 0) - float(card.original_gift_card_amount or 0)) < 0.01
			or row.item in items
		] or rows
		return any(_taxed(row) for row in sold)

	for card in cards:
		taken = 1 if card.source_invoice and the_sale_was_taxed(card) else 0
		if int(card.pos_next_vat_taken_at_sale or 0) != taken:
			frappe.db.set_value("Coupon Code", card.name, COLUMN, taken, update_modified=False)

	if frappe.db.has_column("POS Settings", "gift_card_kind"):
		taxed_items = {row.item for row in _the_lines(LINES_OF_ITEMS, items) if _taxed(row)}
		for till in frappe.get_all(
			"POS Settings",
			filters={"enable_gift_cards": 1},
			fields=["name", "gift_card_item", "gift_card_kind"],
		):
			kind = "Service voucher" if till.gift_card_item in taxed_items else "Value voucher"
			if till.gift_card_kind != kind:
				frappe.db.set_value("POS Settings", till.name, "gift_card_kind", kind, update_modified=False)
