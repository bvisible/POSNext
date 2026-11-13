# //// Neoffice — added file (no upstream equivalent). The gift cards the SHOP sold say where they come from too (13.11.2026, maintenance#2639).
"""A gift card sold in the web shop is spent, in the shop and at the till, the way its sale says (pos_next.gift_card_vat): as a payment when it was
sold without VAT, as a discount when it was sold with VAT or offered. A card made before the origin existed says nothing, so it was spent as a
discount, which takes the VAT of what it buys a second time and leaves the debt of its sale on the books for ever.

This patch reads the origin where the sale left it, on the line of the invoice that sold the card (the same rule as the till's patch, and nothing
is guessed):

- the line is the one whose item is one the shop sells as a gift card, else any line of the invoice;
- a line was taxed when its item tax template names a rate other than 0, or names nothing for an account the invoice charges VAT on. A card sold with
  VAT is SOLD WITH VAT: a discount, its VAT is taken already. Any other is SOLD WITHOUT VAT, and it keeps the account its sale credited (the income
  account of that line: a debt account for a card sold since the item moved to one, a revenue account for one sold before), which spending it clears;
- a card with no invoice (made by hand, or imported from another shop: no money came in on these books) or whose invoice cannot be read (cancelled,
  gone) is left as it is: a discount, as it was.

Nothing is written in the books: the entries already posted are not corrected. A card that already says it was sold is not touched.
"""

import frappe

from pos_next.patches.gift_cards.say_the_origin_of_each_gift_card import (
	FIELDS,
	LINES_OF_INVOICES,
	ORIGIN,
	SALE_ACCOUNT,
	SOLD_WITH_VAT,
	SOLD_WITHOUT_VAT,
	_taxed,
	_the_lines,
	ensure_the_columns,
)

SOLD = (SOLD_WITH_VAT, SOLD_WITHOUT_VAT)


def _the_items_of_the_shop() -> set[str]:
	"""The items the shop sells as gift cards (none on a site without the shop)."""
	if not (
		frappe.db.exists("DocType", "Website Item") and frappe.db.has_column("Website Item", "is_gift_card")
	):
		return set()
	return set(frappe.get_all("Website Item", filters={"is_gift_card": 1}, pluck="item_code"))


def _the_origin_of(invoice, lines, items):
	"""(origin, account of the sale) read on the sale line of `invoice`, None when it cannot be read."""
	rows = lines.get(invoice) or []
	if not rows:
		return None
	sold = [row for row in rows if row.item in items] or rows
	if any(_taxed(row) for row in sold):
		return SOLD_WITH_VAT, None
	return SOLD_WITHOUT_VAT, next((row.income_account for row in sold if row.income_account), None)


def execute():
	ensure_the_columns()
	if not all(frappe.db.has_column("Coupon Code", field["fieldname"]) for field in FIELDS):
		return
	if not frappe.db.has_column("Coupon Code", "sales_invoice"):
		return  # a site without the shop has no card of the shop
	cards = [
		card
		for card in frappe.get_all(
			"Coupon Code",
			filters={"coupon_type": "Gift Card", "sales_invoice": ["is", "set"]},
			fields=["name", "sales_invoice", "pos_next_gift_card", ORIGIN, SALE_ACCOUNT],
		)
		if not card.pos_next_gift_card and card.get(ORIGIN) not in SOLD
	]
	lines: dict[str, list] = {}
	for row in _the_lines(LINES_OF_INVOICES, {card.sales_invoice for card in cards}):
		lines.setdefault(row.invoice, []).append(row)
	items = _the_items_of_the_shop()

	counts = {SOLD_WITH_VAT: 0, SOLD_WITHOUT_VAT: 0, None: 0}
	for card in cards:
		origin = _the_origin_of(card.sales_invoice, lines, items)
		counts[origin[0] if origin else None] += 1
		if origin:
			frappe.db.set_value(
				"Coupon Code", card.name, {ORIGIN: origin[0], SALE_ACCOUNT: origin[1]}, update_modified=False
			)
	print(
		f"Shop gift cards: {counts[SOLD_WITH_VAT]} sold with VAT, {counts[SOLD_WITHOUT_VAT]} sold without VAT, "
		f"{counts[None]} left as they were (no readable sale)"
	)
