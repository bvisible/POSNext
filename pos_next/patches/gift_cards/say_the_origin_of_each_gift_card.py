# //// Neoffice — added file (no upstream equivalent). Each gift card says where it comes from, and each till what kind of card it sells (13.11.2026).
"""A gift card is spent as a discount or as a payment according to where it comes from (pos_next.gift_card_vat), which only its sale can say. This patch
reads it there, and guesses nothing:

- a card with no source invoice (made by hand) was never sold: it is OFFERED (a promotion, no money came in), so a discount. The business changes it to a sold
  origin if it knows that money was received;
- a card whose source invoice has no readable line (cancelled, gone) keeps the old way, a discount: it is OFFERED too;
- otherwise the line of the source invoice that sold the card says it. That line is the one whose price is the value of the card, or whose item is one a till sells
  as a gift card today (the item of a till can have changed since): in the doubt, any line of the invoice. A line was taxed when its item tax template names a
  rate other than 0, or names nothing for an account the invoice charges VAT on (a line with no template is charged at the rate of the invoice's own tax row,
  which is how most sites sell). A card sold with VAT is SOLD WITH VAT: a discount, its VAT is taken already. Any other is SOLD WITHOUT VAT, and it keeps the
  account its sale credited (the income account of that line: a liability for a card sold since the change, a revenue account for one sold before), which spending
  it must clear. A card taxed in the doubt keeps its old way (a discount), never the new one, which would take its VAT twice;
- a till that sells gift cards is a service-voucher till when a past sale of its gift card item was taxed, else a value-voucher till (the proposal).

Nothing is made or moved in the books: the account and the mode of payment of a value card are made when the till's manager saves its settings.
It runs after the doctype sync (the columns of POS Settings), but BEFORE the fixtures are imported, which is what makes the custom fields of a card: it makes
those fields itself when they are not there yet (the import then finds them), or it would find no column, do nothing, and leave every card of a site as it
was made (a card taxed at its sale would then be spent as a payment, and its VAT taken twice). It also removes the field a first version of this change made
(a yes/no « VAT taken at the sale »), which the origin replaces.
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
	SELECT sii.name AS line, sii.parent AS invoice, sii.item_code AS item, sii.rate AS rate, sii.item_tax_rate AS item_tax_rate, sii.income_account AS income_account, stc.account_head AS account
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
				income_account=row.income_account,
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


ORIGIN = "pos_next_origin"
SALE_ACCOUNT = "pos_next_sale_account"
OLD_FLAG = "Coupon Code-pos_next_vat_taken_at_sale"

SOLD_WITH_VAT = "Sold with VAT"
SOLD_WITHOUT_VAT = "Sold without VAT"
OFFERED = "Given for free"

# The same definitions as the fixtures' (the import finds them made and leaves them be)
FIELDS = (
	{
		"fieldname": ORIGIN,
		"fieldtype": "Select",
		"label": "Origin",
		"options": f"{SOLD_WITH_VAT}\n{SOLD_WITHOUT_VAT}\n{OFFERED}",
		"default": OFFERED,
		"depends_on": "eval:doc.pos_next_gift_card || doc.coupon_type == 'Gift Card'",
		"insert_after": "original_gift_card_amount",
	},
	{
		"fieldname": SALE_ACCOUNT,
		"fieldtype": "Link",
		"label": "Account of the sale",
		"options": "Account",
		"depends_on": f"eval:doc.{ORIGIN} == '{SOLD_WITHOUT_VAT}'",
		"insert_after": ORIGIN,
	},
)


def ensure_the_columns() -> None:
	"""The custom fields of a card say where it comes from and what its sale credited: made here when the fixtures have not made them yet."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_field

	for field in FIELDS:
		if not frappe.db.has_column("Coupon Code", field["fieldname"]):
			create_custom_field("Coupon Code", dict(field))


def _the_origin_of(card, lines, items) -> tuple[str, str | None]:
	"""(origin, account of the sale) of a card, read on the line of its sale invoice that sold it."""
	rows = lines.get(card.source_invoice) or [] if card.source_invoice else []
	if not rows:
		return OFFERED, None
	by_price = [
		row for row in rows if abs(float(row.rate or 0) - float(card.original_gift_card_amount or 0)) < 0.01
	]
	sold = [row for row in rows if row in by_price or row.item in items] or rows
	if any(_taxed(row) for row in sold):
		return SOLD_WITH_VAT, None
	account = next((row.income_account for row in by_price + sold if row.income_account), None)
	return SOLD_WITHOUT_VAT, account


def execute():
	ensure_the_columns()
	if not all(frappe.db.has_column("Coupon Code", field["fieldname"]) for field in FIELDS):
		return
	items = set(_the_items_of_the_tills())
	cards = frappe.get_all(
		"Coupon Code",
		filters={"pos_next_gift_card": 1},
		fields=["name", "source_invoice", "original_gift_card_amount", ORIGIN, SALE_ACCOUNT],
	)
	sales = {card.source_invoice for card in cards if card.source_invoice}
	lines: dict[str, list] = {}
	if sales:
		for row in _the_lines(LINES_OF_INVOICES, sales):
			lines.setdefault(row.invoice, []).append(row)

	for card in cards:
		origin, account = _the_origin_of(card, lines, items)
		values = {}
		if card.get(ORIGIN) != origin:
			values[ORIGIN] = origin
		if (card.get(SALE_ACCOUNT) or None) != account:
			values[SALE_ACCOUNT] = account
		if values:
			frappe.db.set_value("Coupon Code", card.name, values, update_modified=False)

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

	if frappe.db.exists("Custom Field", OLD_FLAG):
		frappe.delete_doc("Custom Field", OLD_FLAG, force=True, ignore_permissions=True)
