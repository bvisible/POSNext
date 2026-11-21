# //// Neoffice — added file (no upstream equivalent). The balance of a gift card is the card's own (maintenance#3239).
"""A gift card says what it holds on its own row, and a Pricing Rule it names says nothing about it.

The balance field of a Coupon Code used to be fetched from the card's Pricing Rule at every save of the card
(`fetch_from = pricing_rule.discount_amount`), and the till wrote each new balance back into that rule. The cards the
shop sells share one rule per amount, so one card spent rewrote the balance of all its sisters at their next save:
refused with « This gift card no longer holds … » (rule at or under the balance), or silently lowered (rule above
what the sale asks), or raised (a spent card whose rule never went down).

These tests play the hooks of a till sale in the order hooks.py runs them (the coupon counter, which saves the card,
then the spend of the balance) and read the rows back.
"""

import unittest

import frappe
from frappe.tests.roles import as_role
from frappe.utils import flt, nowdate

from pos_next.api import gift_cards
from pos_next.api.sales_invoice_hooks import update_coupon_usage_on_submit

FIELD = "Coupon Code-gift_card_amount"


def _a_sale_naming(card_name, used):
	"""The shape the two hooks read off a submitted sale that spends `used` of the card."""
	return frappe._dict(
		{
			"doctype": "Sales Invoice",
			"name": "ZZ-TEST-BALANCE-INV",
			"is_return": 0,
			"return_against": None,
			"coupon_code": card_name,
			"posa_coupon_code": None,
			"posa_gift_card_amount_used": used,
			"discount_amount": used,
			"pos_profile": None,
			"posa_pos_opening_shift": None,
		}
	)


class TestTheBalanceOfAGiftCardIsItsOwn(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.company = frappe.get_all("Company", limit=1)[0].name
		customers = frappe.get_all("Customer", limit=1)
		cls.customer = customers[0].name if customers else None
		cls.created = []

	@classmethod
	def tearDownClass(cls):
		for doctype, name in reversed(cls.created):
			try:
				frappe.delete_doc(doctype, name, force=True)
			except Exception:
				pass
		frappe.db.commit()

	# -- the scenery, built as the shop builds it ---------------------------------------------------------------

	def _rule(self, amount, title="ZZ Balance Rule"):
		"""One Pricing Rule, the way the shop makes the rule of an amount: the cards of that amount share it."""
		rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": title,
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Amount",
				"discount_amount": amount,
				"selling": 1,
				"company": self.company,
				"currency": frappe.get_cached_value("Company", self.company, "default_currency"),
				"valid_from": nowdate(),
				"coupon_code_based": 1,
				"priority": "1",
			}
		)
		rule.insert(ignore_permissions=True)
		self.created.append(("Pricing Rule", rule.name))
		return rule.name

	def _card(self, code, rule, balance, **more):
		"""A card of the shop's family: the ERPNext type, no till flag, a balance of its own."""
		card = frappe.get_doc(
			{
				"doctype": "Coupon Code",
				"coupon_name": f"ZZ Balance Card {code}",
				"coupon_type": "Gift Card",
				"coupon_code": f"ZZ-BAL-{code}",
				"pricing_rule": rule,
				"valid_from": nowdate(),
				"maximum_use": 9999,
				"used": 0,
				"gift_card_amount": balance,
				"original_gift_card_amount": balance,
				"customer": self.customer,
				**more,
			}
		)
		card.insert(ignore_permissions=True)
		self.created.append(("Coupon Code", card.name))
		frappe.db.commit()
		return card.name

	def _spend(self, card_name, used):
		"""A till sale that spends `used` of the card: the hooks of hooks.py, in their order."""
		sale = _a_sale_naming(card_name, used)
		with as_role("cashier"):
			update_coupon_usage_on_submit(sale)
			gift_cards.process_gift_card_on_submit(sale)
		frappe.db.commit()

	def _balance(self, card_name):
		return flt(frappe.db.get_value("Coupon Code", card_name, "gift_card_amount"))

	def _rule_holds(self, rule):
		return flt(frappe.db.get_value("Pricing Rule", rule, "discount_amount"))

	def _lower_the_rule(self, rule, amount):
		"""What the till used to do to the rule a card names."""
		frappe.db.set_value("Pricing Rule", rule, "discount_amount", amount)
		frappe.db.commit()

	# -- the case of the customer: sisters on one rule -----------------------------------------------------------

	def test_a_sister_of_a_card_spent_in_full_is_spent_in_part(self):
		rule = self._rule(150)
		first = self._card("A1", rule, 150)
		second = self._card("A2", rule, 150)

		self._spend(first, 150)
		self._spend(second, 76.6)  # refused « no longer holds » while the rule followed the first card

		self.assertEqual(self._balance(first), 0)
		self.assertEqual(self._balance(second), 73.4)
		self.assertEqual(self._rule_holds(rule), 150, "the rule of two cards is the balance of neither")

	def test_a_sister_of_a_card_spent_in_part_keeps_all_it_holds(self):
		rule = self._rule(150)
		first = self._card("B1", rule, 150)
		second = self._card("B2", rule, 150)

		self._spend(first, 76.6)
		self._spend(second, 30)  # went through, and left 43.40 instead of 120.00 (the rule said 73.40)

		self.assertEqual(self._balance(first), 73.4)
		self.assertEqual(self._balance(second), 120)

	# -- saving a card never reads its balance from its rule ------------------------------------------------------

	def test_saving_a_card_leaves_its_balance_whatever_its_rule_holds(self):
		for position, held in enumerate((0, 40, 500)):
			rule = self._rule(150)
			card = self._card(f"C{position}", rule, 150)
			self._lower_the_rule(rule, held)

			frappe.get_doc("Coupon Code", card).save(ignore_permissions=True)

			self.assertEqual(self._balance(card), 150, f"a rule at {held} must not move the balance")

	def test_a_card_spent_to_nothing_is_not_raised_by_a_rule_that_never_went_down(self):
		# What the shop does to a card it spends to 0: the balance, never the shared rule
		rule = self._rule(150)
		card = self._card("D1", rule, 150)
		frappe.db.set_value("Coupon Code", card, "gift_card_amount", 0)
		frappe.db.commit()

		frappe.get_doc("Coupon Code", card).save(ignore_permissions=True)

		self.assertEqual(self._balance(card), 0)

	def test_the_balance_field_asks_for_nothing_from_a_rule(self):
		frappe.clear_cache(doctype="Coupon Code")
		field = frappe.get_meta("Coupon Code").get_field("gift_card_amount")
		self.assertTrue(field, "the balance field of a card must exist")
		self.assertFalse(field.fetch_from)

	def test_the_patch_that_clears_the_fetch_can_run_again(self):
		from pos_next.patches.gift_cards import the_balance_of_a_gift_card_is_its_own as patch

		if not frappe.db.exists("Custom Field", FIELD):
			self.skipTest("this site has no balance field")
		try:
			frappe.db.set_value("Custom Field", FIELD, "fetch_from", "pricing_rule.discount_amount")
			frappe.clear_cache(doctype="Coupon Code")

			patch.execute()
			patch.execute()

			self.assertFalse(frappe.db.get_value("Custom Field", FIELD, "fetch_from"))
			self.assertFalse(frappe.get_meta("Coupon Code").get_field("gift_card_amount").fetch_from)
		finally:
			patch.execute()
			frappe.db.commit()

	# -- a new card ----------------------------------------------------------------------------------------------

	def test_a_new_card_is_born_at_its_amount_whatever_its_rule_holds(self):
		for position, held in enumerate((0, 500)):
			rule = self._rule(150)
			self._lower_the_rule(rule, held)

			card = self._card(f"E{position}", rule, 150)

			self.assertEqual(
				self._balance(card), 150, f"a rule at {held} must not decide how much a new card holds"
			)

	def test_a_card_made_without_a_balance_takes_the_one_of_its_rule_once(self):
		rule = self._rule(80)
		coupon = frappe.get_doc(
			{
				"doctype": "Coupon Code",
				"coupon_name": "ZZ Balance Card F1",
				"coupon_type": "Gift Card",
				"coupon_code": "ZZ-BAL-F1",
				"pricing_rule": rule,
				"valid_from": nowdate(),
				"maximum_use": 9999,
				"customer": self.customer,
			}
		)
		coupon.insert(ignore_permissions=True)
		self.created.append(("Coupon Code", coupon.name))
		self.assertEqual(self._balance(coupon.name), 80)

		self._lower_the_rule(rule, 10)
		frappe.get_doc("Coupon Code", coupon.name).save(ignore_permissions=True)

		self.assertEqual(self._balance(coupon.name), 80, "only its birth reads the rule")

	def test_a_promotional_code_is_left_alone(self):
		rule = self._rule(80)
		promo = frappe.get_doc(
			{
				"doctype": "Coupon Code",
				"coupon_name": "ZZ Balance Promo",
				"coupon_type": "Promotional",
				"coupon_code": "ZZ-BAL-PROMO",
				"pricing_rule": rule,
				"valid_from": nowdate(),
				"maximum_use": 5,
			}
		)
		promo.insert(ignore_permissions=True)
		self.created.append(("Coupon Code", promo.name))

		self.assertEqual(self._balance(promo.name), 0, "a promotion code is no card: it holds no balance")

	# -- the rule follows a balance only when the card is the one that names it ----------------------------------

	def test_the_rule_follows_the_balance_of_a_card_that_owns_it(self):
		rule = self._rule(150)
		card = self._card("G1", rule, 150)

		gift_cards._update_gift_card_balance(card, 73.4, rule)

		self.assertEqual(self._balance(card), 73.4)
		self.assertEqual(self._rule_holds(rule), 73.4)

	def test_the_rule_two_cards_share_is_left_as_it_is(self):
		rule = self._rule(150)
		first = self._card("H1", rule, 150)
		second = self._card("H2", rule, 150)

		gift_cards._update_gift_card_balance(first, 73.4, rule)

		self.assertEqual(self._balance(first), 73.4)
		self.assertEqual(self._balance(second), 150)
		self.assertEqual(self._rule_holds(rule), 150)

	def test_taking_a_card_back_with_its_sale_neither_zeroes_nor_disables_a_rule_it_shares(self):
		rule = self._rule(150)
		first = self._card("J1", rule, 150)
		self._card("J2", rule, 150)

		gift_cards._void(frappe._dict(name=first, pricing_rule=rule), "ZZ test: voided")
		frappe.db.commit()

		self.assertEqual(self._balance(first), 0)
		self.assertEqual(self._rule_holds(rule), 150)
		self.assertEqual(frappe.db.get_value("Pricing Rule", rule, "disable"), 0)

	def test_a_cancelled_sale_gives_back_a_card_without_touching_the_rule_it_shares(self):
		rule = self._rule(150)
		first = self._card("I1", rule, 150)
		second = self._card("I2", rule, 150)
		self._spend(first, 30)
		self.assertEqual(self._balance(first), 120)
		self.assertEqual(self._rule_holds(rule), 150, "the spend must not have written the shared rule")

		gift_cards.process_gift_card_on_cancel(_a_sale_naming(first, 30))
		frappe.db.commit()

		self.assertEqual(self._balance(first), 150)
		self.assertEqual(self._balance(second), 150)
		self.assertEqual(self._rule_holds(rule), 150)
