# //// Neoffice — added file (no upstream equivalent). What a gift card is for VAT (product owner, 16.11.2026).
# ////
# //// A gift card the till sells is taxed when it is SOLD, as its item says (the way the shop sells its cards), and SPENT as a discount of the invoice: its VAT is
# //// taken already, a payment would take it twice. The item of the card is a taxed item: that is all a till is asked for.
# ////
# //// There was a second kind of card here, a « value voucher » (sold at no VAT, booked as a debt to the holder, spent as a payment). It is removed, with its
# //// setting, its account, its VAT template, its mode of payment and the hooks that spent it as a payment (product owner, 16.11.2026: it cannot be handled
# //// afterwards in the books, and the choice between the two was not understood). The cards that were sold without VAT keep saying so.
# ////
# //// A card says where it comes from (`Coupon Code.pos_next_origin`, which the business can correct): SOLD WITH VAT, SOLD WITHOUT VAT (its item carried no VAT:
# //// an item set at 0 %), or GIVEN FOR FREE (made by hand, a promotion, no money came in). Every origin is spent as a discount at the till. The shop reads the same
# //// field and the account the sale credited (`Coupon Code.pos_next_sale_account`) for the cards sold without VAT it still holds.
import json

import frappe
from frappe.utils import flt

# Where a card comes from (`Coupon Code.pos_next_origin`)
ORIGIN_SOLD_WITH_VAT = "Sold with VAT"
ORIGIN_SOLD_WITHOUT_VAT = "Sold without VAT"
ORIGIN_OFFERED = "Given for free"


def _was_taxed(line, vat_accounts) -> bool:
	"""Whether the VAT was charged on a sale line: its item tax template names a rate other than 0, or names nothing for an account the invoice charges VAT on
	(a line with no template is charged at the rate of the invoice's own tax row, which is how most sites sell). The same rule as the patch that said it for the
	cards already sold (patches/gift_cards/say_the_origin_of_each_gift_card.py)."""
	try:
		rates = json.loads(line.get("item_tax_rate") or "{}")
	except ValueError:
		rates = {}
	if not isinstance(rates, dict):
		rates = {}
	if any(flt(rate) > 0 for rate in rates.values()):
		return True
	return any(account not in rates for account in vat_accounts)


def the_sale_of_a_card(source_invoice: str | None, item_code: str | None, amount) -> tuple[str, str | None]:
	"""(origin, account the sale credited) of a card the till has just sold, read on the line of its invoice that sold it.

	The line is the one of the gift card item whose price is the value of the card, else the one whose price is, else the one of the item, else any: a basket can
	hold a taxed product beside an untaxed card, and it is the card's line that says. A card sold with VAT says so and keeps no account (its VAT is taken at its
	sale). A card whose item carries no VAT says so and keeps the account its sale credited. A sale that cannot be read is a sale with VAT: the discount, which
	never takes a VAT twice."""
	if not source_invoice:
		return ORIGIN_SOLD_WITH_VAT, None
	rows = []
	for doctype in ("Sales Invoice Item", "POS Invoice Item"):
		rows = frappe.get_all(
			doctype,
			filters={"parent": source_invoice},
			fields=["item_code", "rate", "income_account", "item_tax_rate"],
			order_by="idx",
		)
		if rows:
			break
	if not rows:
		return ORIGIN_SOLD_WITH_VAT, None
	by_price = [row for row in rows if abs(flt(row.rate) - flt(amount)) < 0.01]
	ours = (
		[row for row in by_price if row.item_code == item_code]
		or by_price
		or [row for row in rows if row.item_code == item_code]
		or rows
	)
	vat_accounts = frappe.get_all(
		"Sales Taxes and Charges",
		filters={"parent": source_invoice, "rate": [">", 0]},
		pluck="account_head",
	)
	if any(_was_taxed(row, vat_accounts) for row in ours):
		return ORIGIN_SOLD_WITH_VAT, None
	return ORIGIN_SOLD_WITHOUT_VAT, next((row.income_account for row in ours if row.income_account), None)
