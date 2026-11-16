# //// Neoffice — added file (no upstream equivalent). A till that never chose its kind of gift card sells them taxed, like the shop (16.11.2026).
"""A till that never chose its kind of gift card sells service vouchers, taxed when they are sold, like the shop (product owner, 16.11.2026: « il faut sortir
les cartes cadeaux comme le shop »). The value voucher stays what it was: the client's choice, made with its fiduciary.

The field of the kind had « Value voucher » as its default, and adding a column with a default stamps every row that is already there: a till that never
touched its gift cards says « Value voucher », and so does a till the first origin patch gave it as « the proposal » because nothing had ever been sold
with its card item. A till of the first kind that switched its cards on and saved its settings would have had its item switched to 0 % (the sale of a value
voucher carries no VAT) without anyone asking for it.

The word « Value voucher » is left alone wherever somebody or something decided it. A till said it by its own choice when it has a gift card account or a VAT
template of the card sale (what saving the settings of a value voucher makes); the sales said it when its card item was sold at least once (the first origin
patch measured them: a past sale taxed makes a service voucher, none taxed a value voucher). It is changed only where none of the three is there: no account, no
template, no sale of its item. Nothing else of the till moves (not even its date of modification), and no entry of the books is touched.
"""

import frappe

from pos_next.gift_card_vat import KIND_SERVICE, KIND_VALUE

KIND = "gift_card_kind"


def _the_item_was_sold(item: str | None) -> bool:
	"""Whether an invoice that is submitted sold the card item of a till (at the till or at the desk): the sales are what measured the kind of a till."""
	if not item:
		return False
	return any(
		frappe.db.exists(doctype, {"item_code": item, "docstatus": 1})
		for doctype in ("Sales Invoice Item", "POS Invoice Item")
		if frappe.db.table_exists(doctype)
	)


def execute():
	if not frappe.db.has_column("POS Settings", KIND):
		return
	fields = ["name", "gift_card_item"]
	for column in ("gift_card_account", "gift_card_tax_template"):
		if frappe.db.has_column("POS Settings", column):
			fields.append(column)
	for till in frappe.get_all("POS Settings", filters={KIND: KIND_VALUE}, fields=fields):
		if till.get("gift_card_account") or till.get("gift_card_tax_template"):
			continue
		if _the_item_was_sold(till.gift_card_item):
			continue
		frappe.db.set_value("POS Settings", till.name, KIND, KIND_SERVICE, update_modified=False)
