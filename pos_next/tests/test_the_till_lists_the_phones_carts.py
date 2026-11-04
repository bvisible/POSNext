# //// Neoffice — added file (no upstream equivalent).
"""The till lists its phones' carts still waiting to be sold, so that a seller finds one without its code.

Each cart is listed by its code, its customer, its amount and article count, since when and where it stands: at the counter,
or the customer still scanning, and whether a seller checks an article of it. A cart of another till, a cart sold, an
emptied session and a session past its end are not listed. A portal account, a visitor and a desk account of no till are
refused, as for taking a cart over.
"""

import frappe
from frappe.utils import add_to_date, now_datetime

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_case import ShopCase
from pos_next.tests.test_till_writes_need_the_till import _user

PORTAL = "shop-scan-portal@yopmail.com"
DESK = "shop-scan-desk@yopmail.com"


class TestTheTillListsThePhonesCarts(ShopCase):
	def listed(self, pos_profile=None, **kwargs):
		return self.as_cashier(shop_scan.list_shop_carts, pos_profile or self.fx.profile, **kwargs)

	def test_a_waiting_cart_and_a_cart_still_scanning_are_listed_the_oldest_first(self):
		waiting = self.a_session()
		self.as_guest(shop_scan.scan_item, waiting, "PNXT-SHOP-A", 2)
		phone = self.as_guest(shop_scan.finish_shop_cart, waiting)
		scanning = self.a_session()
		still = self.as_guest(shop_scan.scan_item, scanning, "PNXT-SHOP-A", 1)

		carts = self.listed()

		self.assertEqual([cart["code"] for cart in carts], [phone["code"], still["code"]])
		first = carts[0]
		self.assertEqual(
			(first["status"], first["grand_total"], first["articles"], first["invoice"]),
			("At the counter", phone["grand_total"], 2, self.the_draft(waiting).name),
		)
		self.assertEqual(
			first["customer_name"], frappe.db.get_value("Customer", first["customer"], "customer_name")
		)
		self.assertTrue(first["since"])
		self.assertFalse(first["needs_validation"])
		self.assertEqual(carts[1]["status"], "Scanning")

	def test_a_cart_with_an_article_a_seller_checks_says_so(self):
		frappe.db.set_value("Item", self.fx.item, "requires_counter_validation", 1)
		token = self.a_session()
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)

		self.assertTrue(self.listed()[0]["needs_validation"])

	def test_a_cart_sold_emptied_expired_or_of_another_till_is_not_listed(self):
		sold = self.a_session()
		self.as_guest(shop_scan.scan_item, sold, "PNXT-SHOP-A", 1)
		frappe.db.set_value("Sales Invoice", self.the_draft(sold).name, "docstatus", 1)
		emptied = self.a_session()
		line = self.as_guest(shop_scan.scan_item, emptied, "PNXT-SHOP-A", 1)["lines"][0]["line"]
		self.as_guest(shop_scan.set_line_qty, emptied, line, 0)
		expired = self.a_session()
		self.as_guest(shop_scan.scan_item, expired, "PNXT-SHOP-A", 1)
		frappe.db.set_value(
			"Guest Order Token",
			{"token": expired},
			"expires_at",
			add_to_date(now_datetime(), minutes=-1),
		)

		self.assertEqual(self.listed(), [])
		self.assertEqual(self.listed(pos_profile=self.fx.other_profile), [])

	def test_a_portal_account_a_visitor_and_a_desk_account_of_no_till_are_refused(self):
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")

		for user in (PORTAL, "Guest", DESK):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.listed(user=user)
