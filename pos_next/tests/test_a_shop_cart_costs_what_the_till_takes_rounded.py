# //// Neoffice — added file (no upstream equivalent).
"""A shop cart costs on the phone what the till takes for it: its total rounded as the till rounds it (scan in the shop).

The till rounds a sale to the currency's smallest coin (CHF 0.05) unless its profile disables the rounding. The phone says
that amount, the phone's payment charges it, a cart paid so is paid in full and sold with nothing left owed, the till's list
says it, and a missing article is refunded down to the rounded amount of what is left: « not a centime more, not a centime
less » (04.11.2026). A cart of 18.98 was 18.98 on the phone and 19.00 at the till.
"""

import json
from unittest.mock import patch

import frappe
from frappe.utils import flt

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_paid_case import PaidCase
from pos_next.tests.test_a_shop_cart_is_paid_on_the_phone import _an_intent

ODD = 18.98  # 19.00 at the till


class TestAShopCartCostsWhatTheTillTakesRounded(PaidCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("Currency", self.fx.currency, "smallest_currency_fraction_value", 0.05)
		frappe.clear_document_cache("Currency", self.fx.currency)
		self.rounding(on=True)
		self.give_a_price(self.fx.item, ODD)

	def rounding(self, on):
		frappe.db.set_value("POS Profile", self.fx.profile, "disable_rounded_total", 0 if on else 1)
		frappe.clear_document_cache("POS Profile", self.fx.profile)

	def test_the_phone_says_the_amount_the_till_takes(self):
		_token, cart = self.a_cart(1)

		self.assertEqual((cart["grand_total"], cart["amount_due"], cart["rounding"]), (ODD, 19.0, 0.02))

	def test_a_till_that_does_not_round_takes_the_exact_amount(self):
		self.rounding(on=False)

		_token, cart = self.a_cart(1)

		self.assertEqual((cart["amount_due"], cart["rounding"]), (ODD, 0))

	def test_the_phone_pays_the_rounded_amount(self):
		token, _cart = self.a_cart(1)

		with patch("payments.api.intent.create_intent", side_effect=_an_intent):
			self.as_guest(shop_scan.pay_shop_cart, token)

		self.assertEqual(_an_intent.asked["amount"], 1900)

	def test_a_cart_paid_its_rounded_amount_is_sold_with_nothing_left_owed(self):
		token, cart = self.a_cart(1)
		self.the_provider(token, amount=19.0)
		self.assertEqual(self.as_guest(shop_scan.confirm_shop_payment, token)["status"], "paid")
		listed = self.as_cashier(shop_scan.list_shop_carts, self.fx.profile)
		self.assertEqual([listed_cart["amount_due"] for listed_cart in listed], [19.0])

		answer = self.as_cashier(shop_scan.validate_shop_cart, cart["code"], self.fx.profile, None)

		sale = frappe.get_doc("Sales Invoice", answer["invoice"])
		self.assertEqual(
			(sale.docstatus, flt(sale.rounded_total), flt(sale.outstanding_amount)), (1, 19.0, 0)
		)

	def test_a_missing_article_is_refunded_down_to_the_rounded_amount_of_what_is_left(self):
		self.an_item("_PNXT shop round other", "PNXT-SHOP-R", price=10)
		token = self.a_session()
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-R", 1)
		self.the_provider(token, amount=29.0)
		cart = self.as_guest(shop_scan.confirm_shop_payment, token)["cart"]
		other = next(line for line in cart["lines"] if line["item_code"] == "_PNXT shop round other")

		with patch("payments.api.intent.refund_intent") as refund:
			answer = self.as_cashier(
				shop_scan.validate_shop_cart,
				cart["code"],
				self.fx.profile,
				json.dumps([{"line": other["line"], "qty": 1}]),
			)

		# 29.00 paid, 18.98 left: 19.00 at the till, 10.00 back to the customer (not 10.02)
		self.assertEqual((answer["refunded"], refund.call_args.args[1]), (10.0, 1000))
		sale = frappe.get_doc("Sales Invoice", answer["invoice"])
		self.assertEqual((sale.docstatus, flt(sale.outstanding_amount)), (1, 0))
