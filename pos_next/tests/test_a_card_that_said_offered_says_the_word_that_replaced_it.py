# //// Neoffice — added file (no upstream equivalent).
"""A card that says « Offered » says the word that replaced it (16.11.2026, maintenance#2720).

For 13 minutes on 13.11.2026 the origin of a card was stored as « Offered », and the column was made with that word as
its default, which stamped every coupon a site had: shop cards, and promotion codes that are no card. The word became
« Given for free » but the rows kept the old one. The patch says the new word on them, and on nothing else.
"""

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.patches.gift_cards import say_given_for_free_where_a_card_said_offered as the_patch
from pos_next.patches.gift_cards.say_the_origin_of_each_gift_card import (
	ORIGIN,
	SOLD_WITH_VAT,
	SOLD_WITHOUT_VAT,
	ensure_the_columns,
)

OFFERED = the_patch.OFFERED
RETIRED = "Offered"


@unittest.skipUnless(frappe.db.exists("DocType", "Coupon Code"), "the coupons are not on this site")
class TestARetiredOfferedWordIsSaidInTheWordThatReplacedIt(FrappeTestCase):
	def setUp(self):
		ensure_the_columns()
		self.created = []
		self.customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": f"_Test Offered Word {frappe.generate_hash(length=6)}",
				"customer_type": "Individual",
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
				"email_id": f"offered-word-{frappe.generate_hash(length=6)}@yopmail.com",
			}
		).insert(ignore_permissions=True)
		self.rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": f"Test offered word {frappe.generate_hash(length=6)}",
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"selling": 1,
				"coupon_code_based": 1,
				"rate_or_discount": "Discount Amount",
				"discount_amount": 10,
				"valid_upto": "2999-12-31",
			}
		).insert(ignore_permissions=True)
		self.addCleanup(self._clean_up)

	def _clean_up(self):
		for name in self.created:
			frappe.delete_doc("Coupon Code", name, force=1, ignore_permissions=True)
		frappe.delete_doc("Pricing Rule", self.rule.name, force=1, ignore_permissions=True)
		frappe.delete_doc("Customer", self.customer.name, force=1, ignore_permissions=True)

	def _coupon(self, kind, origin):
		"""A coupon of `kind` (Gift Card or Promotional) saying `origin`, written straight: the field refuses the retired word."""
		fields = {
			"doctype": "Coupon Code",
			"coupon_name": f"Test offered word {frappe.generate_hash(length=6)}",
			"coupon_type": kind,
			"pricing_rule": self.rule.name,
			"coupon_code": frappe.generate_hash(length=10).upper(),
			"valid_from": nowdate(),
			"valid_upto": add_days(nowdate(), 30),
			"maximum_use": 1,
		}
		if kind == "Gift Card":
			fields.update({"customer": self.customer.name, "gift_card_amount": 50})
		coupon = frappe.get_doc(fields).insert(ignore_permissions=True)
		self.created.append(coupon.name)
		frappe.db.set_value("Coupon Code", coupon.name, ORIGIN, origin)
		return coupon.name

	def _origin(self, coupon):
		return frappe.db.get_value("Coupon Code", coupon, ORIGIN)

	def test_a_gift_card_and_a_promotion_code_that_said_offered_say_given_for_free(self):
		card = self._coupon("Gift Card", RETIRED)
		code = self._coupon("Promotional", RETIRED)

		the_patch.execute()

		self.assertEqual(self._origin(card), OFFERED)
		self.assertEqual(self._origin(code), OFFERED)

	def test_the_other_origins_are_left_as_they_are(self):
		with_vat = self._coupon("Gift Card", SOLD_WITH_VAT)
		without_vat = self._coupon("Gift Card", SOLD_WITHOUT_VAT)
		given = self._coupon("Promotional", OFFERED)
		says_nothing = self._coupon("Promotional", None)

		the_patch.execute()

		self.assertEqual(self._origin(with_vat), SOLD_WITH_VAT)
		self.assertEqual(self._origin(without_vat), SOLD_WITHOUT_VAT)
		self.assertEqual(self._origin(given), OFFERED)
		self.assertIsNone(
			self._origin(says_nothing), "a coupon that says nothing is not made to say something"
		)

	def test_nothing_else_of_the_card_moves(self):
		card = self._coupon("Gift Card", RETIRED)
		before = frappe.db.get_value(
			"Coupon Code", card, ["modified", "gift_card_amount", "used", "customer"]
		)

		the_patch.execute()

		after = frappe.db.get_value("Coupon Code", card, ["modified", "gift_card_amount", "used", "customer"])
		self.assertEqual(
			after, before, "the balance, the use and the date of modification are the card's own"
		)

	def test_it_can_be_run_again(self):
		card = self._coupon("Gift Card", RETIRED)
		the_patch.execute()

		the_patch.execute()

		self.assertEqual(self._origin(card), OFFERED)

	def test_a_card_that_says_the_retired_word_is_refused_when_saved_and_accepted_once_the_patch_ran(self):
		card = self._coupon("Gift Card", RETIRED)
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc("Coupon Code", card).save(ignore_permissions=True)

		the_patch.execute()

		frappe.get_doc("Coupon Code", card).save(ignore_permissions=True)
		self.assertEqual(self._origin(card), OFFERED)

	def test_a_site_without_the_origin_column_has_nothing_to_do(self):
		real = frappe.db.has_column

		def has_column(doctype, column):
			return False if column == ORIGIN else real(doctype, column)

		with (
			patch.object(frappe.db, "has_column", side_effect=has_column),
			patch.object(frappe.db, "sql") as write,
		):
			the_patch.execute()

		write.assert_not_called()
