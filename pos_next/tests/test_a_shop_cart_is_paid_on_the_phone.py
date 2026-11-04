# //// Neoffice — added file (no upstream equivalent).
"""The phone pays its cart by the restaurant's payment page, for what the server says it owes (scan in the shop, lot 4).

The cart says whether it may be paid on the phone and why not: the shop takes the payment at the till (its setting, or no
payment page), an article a seller checks closes it where the shop says so, an empty cart. The payment is opened for the
cart's amount, never one the page sends, comes back to the shop's own page, and freezes the cart: it takes no more scan.
"""

from unittest.mock import patch

import frappe

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_paid_case import PaidCase

PAGE = "https://pay.example.test/checkout/1"


def _an_intent(**kwargs):
	_an_intent.asked = kwargs
	return {"status": "requires_action", "intent_name": "PI-TEST-1", "next_action_payload": {"url": PAGE}}


class TestAShopCartIsPaidOnThePhone(PaidCase):
	def setting(self, **values):
		frappe.db.set_value("POS Settings", self.settings, values)

	def test_a_cart_may_be_paid_on_the_phone(self):
		_token, cart = self.a_cart()

		self.assertEqual((cart["can_pay"], cart["pay_refusal"], cart["paid_amount"]), (True, None, 0))

	def test_where_the_shop_takes_the_payment_at_the_till_it_may_not(self):
		self.setting(shop_scan_phone_payment=0)
		_token, cart = self.a_cart()

		self.assertFalse(cart["can_pay"])
		self.assertEqual(cart["pay_refusal"], "This shop takes the payment at the till.")

	def test_with_no_payment_page_on_the_site_it_may_not(self):
		with patch("pos_next.shop_scan.payment._provider", return_value=None):
			_token, cart = self.a_cart()

		self.assertFalse(cart["can_pay"])

	def test_an_article_a_seller_checks_closes_it_where_the_shop_says_so(self):
		frappe.db.set_value("Item", self.fx.item, "requires_counter_validation", 1)
		_token, cart = self.a_cart()
		self.assertFalse(cart["can_pay"])
		self.assertIn("paid at the till", cart["pay_refusal"])

		self.setting(shop_scan_validation_on_phone="Paid, checked at the counter")
		_token, cart = self.a_cart()
		self.assertTrue(cart["can_pay"])

	def test_the_payment_is_opened_for_the_carts_amount_and_comes_back_to_the_shop(self):
		token, cart = self.a_cart()

		with patch("payments.api.intent.create_intent", side_effect=_an_intent):
			answer = self.as_guest(shop_scan.pay_shop_cart, token)

		asked = _an_intent.asked
		self.assertEqual(answer, {"payment_url": PAGE, "intent_name": "PI-TEST-1"})
		self.assertEqual(
			(asked["channel"], asked["amount"], asked["reference_name"]),
			("wallee_web", round(cart["grand_total"] * 100), self.the_draft(token).name),
		)
		key = frappe.db.get_value("POS Settings", self.settings, "shop_scan_key")
		self.assertTrue(asked["metadata"]["success_url"].endswith(f"/pos/shop/{key}?payment=done"))
		self.assertTrue(asked["metadata"]["failed_url"].endswith(f"/pos/shop/{key}?payment=failed"))
		# Frozen: the amount paid is the cart as it stood
		with self.assertRaises(frappe.ValidationError):
			self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)

	def test_a_cart_it_may_not_pay_opens_no_payment(self):
		self.setting(shop_scan_phone_payment=0)
		token, _cart = self.a_cart()

		with patch("payments.api.intent.create_intent", side_effect=_an_intent) as create:
			with self.assertRaises(frappe.ValidationError):
				self.as_guest(shop_scan.pay_shop_cart, token)
		create.assert_not_called()

	def test_a_paid_cart_opens_no_second_payment(self):
		token, _cart = self.a_paid_cart()

		with patch("payments.api.intent.create_intent", side_effect=_an_intent) as create:
			with self.assertRaises(frappe.ValidationError):
				self.as_guest(shop_scan.pay_shop_cart, token)
		create.assert_not_called()
