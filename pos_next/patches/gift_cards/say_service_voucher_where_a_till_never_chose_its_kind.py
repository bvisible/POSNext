# //// Neoffice — added file (no upstream equivalent). A till that never chose its kind of gift card sells them taxed, like the shop (16.11.2026).
"""A till that never chose its kind of gift card sells service vouchers, taxed when they are sold, like the shop (product owner, 16.11.2026: « il faut sortir
les cartes cadeaux comme le shop »). The value voucher stays what it was: the client's choice, made with its fiduciary.

The field of the kind had « Value voucher » as its default, and adding a column with a default stamps every row that is already there: a till that never
touched its gift cards says « Value voucher », and so does a till the first origin patch gave it as « the proposal » because nothing had ever been sold
with its card item. A till of the first kind that switched its cards on and saved its settings would have had its item switched to 0 % (the sale of a value
voucher carries no VAT) without anyone asking for it.

The word « Value voucher » is left alone wherever somebody or something decided it. A till said it by its own choice when it has a gift card account or a VAT
template of the card sale (what saving the settings of a value voucher makes); the sales said it when its card item was sold and NONE of the sales was taxed
(what the first origin patch measured: a past sale taxed makes a service voucher). It is changed only where none of the three is there: no account, no
template, and no sale of its item that was all untaxed. Nothing else of the till moves (not even its date of modification), and no entry of the books is touched.
"""

import frappe

from pos_next.gift_card_vat import KIND_SERVICE, KIND_VALUE
from pos_next.patches.gift_cards.say_the_origin_of_each_gift_card import LINES_OF_ITEMS, _taxed, _the_lines

KIND = "gift_card_kind"


def _the_items_sold_without_tax(items) -> set[str]:
	"""Among the items, those that were sold on a submitted invoice and never taxed: the sales that measured a value voucher (the first origin patch's rule)."""
	lines = _the_lines(LINES_OF_ITEMS, items)
	return {line.item for line in lines} - {line.item for line in lines if _taxed(line)}


def execute():
	if not frappe.db.has_column("POS Settings", KIND):
		return
	fields = ["name", "gift_card_item"]
	for column in ("gift_card_account", "gift_card_tax_template"):
		if frappe.db.has_column("POS Settings", column):
			fields.append(column)
	stamped = [
		till
		for till in frappe.get_all("POS Settings", filters={KIND: KIND_VALUE}, fields=fields)
		if not (till.get("gift_card_account") or till.get("gift_card_tax_template"))
	]
	measured = _the_items_sold_without_tax({till.gift_card_item for till in stamped if till.gift_card_item})
	for till in stamped:
		if till.gift_card_item in measured:
			continue
		frappe.db.set_value("POS Settings", till.name, KIND, KIND_SERVICE, update_modified=False)
