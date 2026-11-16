# //// Neoffice — added file (no upstream equivalent). A card that says « Offered » says the word that replaced it (16.11.2026, maintenance#2720).
"""The origin of a gift card was stored as « Offered » for 13 minutes on 13.11.2026 (b0b11c32, then aecf9363: the
catalogue of the site translates « Offered » as « Proposée », and a Select field shows the translation of its stored
word). The column was made with that word as its default, which stamped every coupon the site already had: the cards of
the shop, and promotion codes that are no card at all. The default of the field changed with the word; the rows did not,
and « Offered » is no longer one of the field's options.

A card that says nothing is spent as a discount (pos_next.gift_card_vat.the_origin_of reads any word it does not know as
« offered »), so no money is concerned. This patch says the word the field has now, on the rows that still have the old
one, and touches nothing else: not the balance, not the modification date, not the books. It can be run again.
"""

import frappe

from pos_next.patches.gift_cards.say_the_origin_of_each_gift_card import OFFERED, ORIGIN

RETIRED = "Offered"


def execute():
	if not frappe.db.has_column("Coupon Code", ORIGIN):
		return
	frappe.db.sql(f"UPDATE `tabCoupon Code` SET `{ORIGIN}` = %s WHERE `{ORIGIN}` = %s", (OFFERED, RETIRED))
