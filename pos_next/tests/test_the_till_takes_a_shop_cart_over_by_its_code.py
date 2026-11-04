# //// Neoffice — added file (no upstream equivalent).
"""The till takes a phone's cart over by the code the phone shows, as the cart was priced.

The cashier types or scans the code (with or without its dash, in any case) at her till: she is given the cart's lines as
they were written, with their rates and discounts, and its amount, so that the till takes what the phone showed. A cart of
another till is not found at that till; a portal account, a visitor and a desk account of no till are refused. A cart taken
over while the customer was still scanning takes no more scan.
"""

import json
from unittest.mock import patch

import frappe

from pos_next.api import invoices, shop_scan
from pos_next.tests.shop_scan_case import ShopCase
from pos_next.tests.test_till_writes_need_the_till import OTHER_TILL, _sale, _user

PORTAL = "shop-scan-portal@yopmail.com"
DESK = "shop-scan-desk@yopmail.com"


class TestTheTillTakesAShopCartOverByItsCode(ShopCase):
	def a_finished_cart(self, qty=2):
		token = self.a_session()
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", qty)
		return token, self.as_guest(shop_scan.finish_shop_cart, token)

	def open_at_the_till(self, code, pos_profile=None, user=None):
		return self.as_cashier(
			shop_scan.open_shop_cart, code, pos_profile or self.fx.profile, **({"user": user} if user else {})
		)

	def test_the_cashier_gets_the_cart_as_it_was_priced(self):
		frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": "_Test Shop Till Offer",
				"selling": 1,
				"company": self.fx.company,
				"currency": frappe.get_cached_value("Company", self.fx.company, "default_currency"),
				"valid_from": frappe.utils.nowdate(),
				"apply_on": "Item Code",
				"items": [{"item_code": self.fx.item}],
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Percentage",
				"discount_percentage": 10,
			}
		).insert(ignore_permissions=True)
		token, phone = self.a_finished_cart()

		cart = self.open_at_the_till(phone["code"])

		self.assertEqual(cart["invoice"], self.the_draft(token).name)
		self.assertEqual(cart["grand_total"], phone["grand_total"])
		self.assertEqual(
			[(line["item_code"], line["qty"], line["rate"]) for line in cart["items"]], [(self.fx.item, 2, 9)]
		)
		self.assertEqual(cart["status"], "At the counter")
		# What the till needs to put the cart in its own: the customer by name, each line's units
		self.assertEqual(
			cart["customer_name"], frappe.db.get_value("Customer", cart["customer"], "customer_name")
		)
		self.assertEqual(
			(cart["items"][0]["stock_uom"], cart["items"][0]["conversion_factor"]),
			(cart["items"][0]["uom"], 1),
		)

	def test_the_till_is_told_whether_it_takes_phones_carts(self):
		# The till looks a code up as a phone's cart only where it takes them: the bootstrap hands it the setting
		from pos_next.api.bootstrap import _get_pos_settings
		from pos_next.api.constants import DEFAULT_POS_SETTINGS

		profile = frappe.get_doc("POS Profile", self.fx.profile)
		self.assertEqual(DEFAULT_POS_SETTINGS["enable_shop_scan"], 0)
		self.assertEqual(_get_pos_settings(profile)["enable_shop_scan"], 1)

		frappe.db.set_value("POS Settings", self.settings, "enable_shop_scan", 0)
		self.assertEqual(_get_pos_settings(profile)["enable_shop_scan"], 0)

	def test_the_tills_sale_is_the_phones_draft(self):
		# The till sells the cart under the draft's name (useInvoice.shopCartInvoice): the phone's draft, written by the
		# system, is what its cashier saves and submits, and no second invoice is booked
		_token, phone = self.a_finished_cart()
		cart = self.open_at_the_till(phone["code"])
		lines = [
			{key: line[key] for key in ("item_code", "qty", "rate", "price_list_rate", "uom")}
			for line in cart["items"]
		]
		sale = _sale(
			self.fx,
			name=cart["invoice"],
			items=lines,
			payments=[{"mode_of_payment": self.fx.mode, "amount": cart["grand_total"]}],
		)
		invoices_before = frappe.db.count("Sales Invoice", {"pos_profile": self.fx.profile})
		# update_invoice sets it for the rest of the request; its commit would end the test's transaction
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		with patch.object(frappe.local.db, "commit"):
			draft = self.as_cashier(invoices.update_invoice, json.dumps(sale))
			done = self.as_cashier(
				invoices.submit_invoice, invoice=json.dumps({**sale, "name": draft["name"]}), data="{}"
			)

		self.assertEqual((draft["name"], done["name"]), (cart["invoice"], cart["invoice"]))
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", cart["invoice"], ["docstatus", "grand_total"]),
			(1, phone["grand_total"]),
		)
		self.assertEqual(frappe.db.count("Sales Invoice", {"pos_profile": self.fx.profile}), invoices_before)

	def test_a_code_is_read_with_or_without_its_dash(self):
		_token, phone = self.a_finished_cart()

		for typed in (phone["code"], phone["code"].replace("-", "").lower(), f" {phone['code'].lower()} "):
			with self.subTest(typed=typed):
				self.assertEqual(self.open_at_the_till(typed)["code"], phone["code"])

	def test_another_tills_cart_is_not_found(self):
		_token, phone = self.a_finished_cart()

		self.assertIsNone(
			self.open_at_the_till(phone["code"], pos_profile=self.fx.other_profile, user=OTHER_TILL)
		)
		self.assertIsNone(self.open_at_the_till("ZZZ-ZZZ"))

	def test_a_portal_account_a_visitor_and_a_desk_account_of_no_till_are_refused(self):
		_token, phone = self.a_finished_cart()
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")

		# The till's own rule (require_till_user): a desk account with no till nor right on the invoices; a cashier reads
		# the invoices of every till, as she does at hers
		for user in (PORTAL, "Guest", DESK):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.as_cashier(shop_scan.open_shop_cart, phone["code"], self.fx.profile, user=user)

	def test_a_cart_taken_over_while_scanning_takes_no_more_scan(self):
		token = self.a_session()
		code = self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)["code"]

		self.open_at_the_till(code)

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)
