# //// Neoffice — added file (no upstream equivalent). The balance of a gift card is read from the card, never from its rule (maintenance#3239).
"""The balance field of a Coupon Code stops fetching its value from the card's Pricing Rule.

`Coupon Code-gift_card_amount` was made with `fetch_from = pricing_rule.discount_amount`: Frappe copies the rule's
amount into the balance at every save of the card. The cards the shop sells share one rule per amount, and the till
wrote each new balance into the rule it found: a card spent lowered the rule of all its sisters, and the next save of
a sister replaced her balance with the rule's (refused « no longer holds », or lowered without a word, or, the other
way round, raised above what a spent card held).

The balance is the card's. The fixture no longer asks for a fetch (it is imported at the end of a migrate); this patch
clears it at once, so that the site is right from the first request, and it can be run again.

It touches one row of Custom Field and nothing else: not a balance, not a rule, not a card.
"""

import frappe

FIELD = "Coupon Code-gift_card_amount"


def execute():
	if not frappe.db.exists("Custom Field", FIELD):
		return
	if not frappe.db.get_value("Custom Field", FIELD, "fetch_from"):
		return
	frappe.db.set_value(
		"Custom Field", FIELD, {"fetch_from": None, "fetch_if_empty": 0}, update_modified=False
	)
	frappe.clear_cache(doctype="Coupon Code")
