# //// Neoffice — added file (no upstream equivalent).
"""A phone's cart takes only what the till sells, at a price it has, in a quantity that makes sense.

The phone sends a barcode and a quantity, never a price. An unknown code, or an article the till does not sell (internal,
outside its groups), is not sold here; an article whose code carries its own weight or price is scanned at the counter; an
article with no price on the till's price list is not sold for nothing; a quantity is a whole number from 1 to 999. One
line per article. A phone touches its own cart only, and a cart that waits for the till takes no more scan.
"""

from unittest.mock import patch

import frappe

from pos_next.api import items, shop_scan
from pos_next.tests.shop_scan_case import PRICE, ShopCase


class TestAShopCartTakesOnlyWhatTheTillSells(ShopCase):
	def scan(self, token, barcode="PNXT-SHOP-A", qty=1):
		return self.as_guest(shop_scan.scan_item, token, barcode, qty)

	def refused(self, method, *args):
		with self.assertRaises(frappe.ValidationError) as refused:
			self.as_guest(method, *args)
		return str(refused.exception)

	def test_an_unknown_or_internal_code_is_not_sold_here(self):
		token = self.a_session()
		not_sold = frappe._("This article is not sold here.")

		self.assertEqual(self.refused(shop_scan.scan_item, token, "PNXT-SHOP-NOTHING", 1), not_sold)
		if frappe.db.has_column("Item", "is_internal_item"):
			self.an_item("_PNXT shop internal", "PNXT-SHOP-INTERNAL", is_internal_item=1)
			self.assertEqual(self.refused(shop_scan.scan_item, token, "PNXT-SHOP-INTERNAL", 1), not_sold)
		self.assertIsNone(self.the_draft(token))

	def test_a_barcode_that_carries_its_price_goes_to_the_counter(self):
		token = self.a_session()
		weighed = dict(items.find_item_by_barcode("PNXT-SHOP-A", self.fx.profile), resolved_qty=0.42)

		with patch("pos_next.api.items.find_item_by_barcode", return_value=weighed):
			message = self.refused(shop_scan.scan_item, token, "2112345004200", 1)

		self.assertEqual(message, frappe._("This article is scanned at the counter."))

	def test_an_item_with_no_price_is_refused(self):
		self.an_item("_PNXT shop no price", "PNXT-SHOP-NOPRICE", price=None)
		token = self.a_session()

		self.assertEqual(
			self.refused(shop_scan.scan_item, token, "PNXT-SHOP-NOPRICE", 1),
			frappe._("This article has no price here. Please go to the counter."),
		)

	def test_a_quantity_out_of_one_to_999_is_refused(self):
		token = self.a_session()
		for qty in (0, -1, 1.5, 1000):
			with self.subTest(qty=qty):
				self.assertEqual(
					self.refused(shop_scan.scan_item, token, "PNXT-SHOP-A", qty),
					frappe._("Invalid quantity."),
				)

	def test_the_same_item_twice_is_one_line_of_two(self):
		token = self.a_session()
		self.scan(token)

		cart = self.scan(token)

		self.assertEqual([(line["item_code"], line["qty"]) for line in cart["lines"]], [(self.fx.item, 2)])
		self.assertEqual(len(self.the_draft(token).items), 1)

	def test_a_line_set_to_zero_leaves_the_cart(self):
		token = self.a_session()
		line = self.scan(token)["lines"][0]["line"]

		cart = self.as_guest(shop_scan.set_line_qty, token, line, 0)

		self.assertEqual(cart["lines"], [])

	def test_a_phone_cannot_touch_another_sessions_line(self):
		mine = self.a_session()
		line = self.scan(mine)["lines"][0]["line"]
		theirs = self.a_session()

		self.assertEqual(
			self.refused(shop_scan.set_line_qty, theirs, line, 5), frappe._("This line is not in your cart.")
		)
		self.assertEqual(self.the_draft(mine).items[0].qty, 1)

	def test_a_finished_cart_takes_no_more_scan(self):
		token = self.a_session()
		self.scan(token)
		self.as_guest(shop_scan.finish_shop_cart, token)

		self.assertEqual(
			self.refused(shop_scan.scan_item, token, "PNXT-SHOP-A", 1),
			frappe._("This cart is waiting for the till."),
		)
		self.assertEqual(self.the_draft(token).items[0].qty, 1)

	def test_an_empty_cart_cannot_be_finished(self):
		token = self.a_session()

		self.assertEqual(self.refused(shop_scan.finish_shop_cart, token), frappe._("Your cart is empty."))

	def test_the_cart_shows_its_code_and_its_amount(self):
		token = self.a_session()

		cart = self.scan(token, qty=3)

		self.assertRegex(cart["code"], r"^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$")
		self.assertEqual(cart["total"], 3 * PRICE)
		self.assertEqual(cart["grand_total"], self.the_draft(token).grand_total)
		self.assertEqual(cart["status"], "Scanning")
		self.assertEqual(cart["currency"], self.fx.currency)

	def test_an_empty_cart_says_its_currency_too(self):
		cart = self.as_guest(shop_scan.get_shop_cart, self.a_session())

		self.assertEqual((cart["lines"], cart["currency"]), ([], self.fx.currency))
