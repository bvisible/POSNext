# //// Neoffice — added file (no upstream equivalent).
"""A phone's cart is priced as the till prices it, and the amount it shows is the draft's to the centime.

The till's offers (its own engine, `apply_offers`) are written on the draft: a discount on a line, a free item, a discount
on the whole cart, the rules of the customer the session signed in as. A finished cart is priced no more: an offer that
ends while it waits for the till does not change it (« not a centime more, not a centime less », 04.11.2026).
"""

import frappe
from frappe.utils import flt, nowdate

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_case import PRICE, ShopCase


class TestAShopCartIsPricedAsTheTillPricesIt(ShopCase):
	def a_rule(self, title, **values):
		company = self.fx.company
		rule = {
			"doctype": "Pricing Rule",
			"title": title,
			"selling": 1,
			"company": company,
			"currency": frappe.get_cached_value("Company", company, "default_currency"),
			"valid_from": nowdate(),
			"apply_on": "Item Code",
			"items": [{"item_code": self.fx.item}],
			"price_or_product_discount": "Price",
			"rate_or_discount": "Discount Percentage",
		}
		rule.update(values)
		return frappe.get_doc(rule).insert(ignore_permissions=True).name

	def scan(self, token, barcode="PNXT-SHOP-A", qty=1):
		return self.as_guest(shop_scan.scan_item, token, barcode, qty)

	def test_a_line_offer_is_on_the_phone_and_on_the_draft(self):
		self.a_rule("_Test Shop Line Offer", discount_percentage=10)
		token = self.a_session()

		line = self.scan(token)["lines"][0]

		self.assertEqual(
			(line["price_list_rate"], line["rate"], flt(line["discount_percentage"], 2)), (PRICE, 9, 10)
		)
		row = self.the_draft(token).items[0]
		self.assertEqual((row.price_list_rate, row.rate), (PRICE, 9))

	def test_a_free_item_offer_adds_its_free_line(self):
		gift = self.an_item("_PNXT shop gift", "PNXT-SHOP-GIFT", price=3)
		self.a_rule(
			"_Test Shop Gift",
			price_or_product_discount="Product",
			rate_or_discount=None,
			same_item=0,
			free_item=gift,
			free_qty=1,
			free_item_rate=0,
			min_qty=1,
		)
		token = self.a_session()

		cart = self.scan(token)

		free = [line for line in cart["lines"] if line["is_free_item"]]
		self.assertEqual([(line["item_code"], line["qty"], line["rate"]) for line in free], [(gift, 1, 0)])
		self.assertEqual(cart["grand_total"], self.the_draft(token).grand_total)

	def test_a_discount_on_the_whole_cart_is_in_the_total(self):
		self.a_rule(
			"_Test Shop Cart Discount", apply_on="Transaction", items=[], discount_percentage=5, min_amt=0
		)
		token = self.a_session()

		cart = self.scan(token, qty=2)

		draft = self.the_draft(token)
		self.assertTrue(flt(draft.additional_discount_percentage) == 5 or flt(draft.discount_amount) > 0)
		self.assertGreater(cart["discount"], 0)
		self.assertEqual(cart["grand_total"], draft.grand_total)

	def test_the_phones_total_is_the_drafts_to_the_cent(self):
		self.a_rule("_Test Shop Line Offer", discount_percentage=12.5)
		other = self.an_item("_PNXT shop other", "PNXT-SHOP-B", price=7.35)
		token = self.a_session()
		self.scan(token, qty=3)
		cart = self.scan(token, "PNXT-SHOP-B", qty=2)

		draft = self.the_draft(token)
		self.assertEqual(cart["grand_total"], draft.grand_total)
		# A new invoice of the same lines and discounts, worked out by ERPNext, comes to the same amount
		again = frappe.copy_doc(draft)
		again.ignore_pricing_rule = 1
		again.run_method("calculate_taxes_and_totals")
		self.assertEqual(flt(again.grand_total, 2), flt(cart["grand_total"], 2))
		self.assertIn(other, [line["item_code"] for line in cart["lines"]])

	def test_a_signed_in_customers_rule_applies_to_him(self):
		self.a_rule(
			"_Test Shop Customer Offer",
			discount_percentage=20,
			applicable_for="Customer",
			customer=self.fx.customer,
		)
		signed_in = self.a_session()
		frappe.db.set_value("Guest Order Token", {"token": signed_in}, "customer", self.fx.customer)
		# Another customer: the till's default customer is the rule's one in this decor
		someone_else = (
			frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": "_PNXT shop someone else",
					"customer_group": frappe.db.get_value("Customer", self.fx.customer, "customer_group"),
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		passer_by = self.a_session()
		frappe.db.set_value("Guest Order Token", {"token": passer_by}, "customer", someone_else)

		self.assertEqual(self.scan(signed_in)["lines"][0]["rate"], 8)
		self.assertEqual(self.scan(passer_by)["lines"][0]["rate"], PRICE)

	def test_a_finished_cart_keeps_its_price_when_the_offer_ends(self):
		rule = self.a_rule("_Test Shop Line Offer", discount_percentage=10)
		token = self.a_session()
		self.scan(token, qty=2)
		finished = self.as_guest(shop_scan.finish_shop_cart, token)
		frappe.db.set_value("Pricing Rule", rule, "disable", 1)

		later = self.as_guest(shop_scan.get_shop_cart, token)

		self.assertEqual(finished["status"], "At the counter")
		self.assertEqual((later["grand_total"], later["lines"][0]["rate"]), (finished["grand_total"], 9))
