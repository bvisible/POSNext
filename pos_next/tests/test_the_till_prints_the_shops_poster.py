# //// Neoffice — added file (no upstream equivalent).
"""The till prints the poster of the shop's QR code (scanning in the shop, lot 5).

Its user is given the address the code opens (the shop's page with the key of the till, set the first time it is asked
for and the same every time after) and the shop's name. A portal account, a visitor and a desk account of no till are
refused, as for the till's other calls of the scan.
"""

import frappe

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_case import ShopCase
from pos_next.tests.test_till_writes_need_the_till import _user

PORTAL = "shop-poster-portal@yopmail.com"
DESK = "shop-poster-desk@yopmail.com"


class TestTheTillPrintsTheShopsPoster(ShopCase):
	def test_the_poster_carries_the_shops_page_and_its_name(self):
		poster = self.as_cashier(shop_scan.get_shop_poster, self.fx.profile)

		key = frappe.db.get_value("POS Settings", self.settings, "shop_scan_key")
		self.assertTrue(key)
		self.assertTrue(poster["url"].endswith(f"/pos/shop/{key}"))
		company_name = frappe.db.get_value("Company", self.fx.company, "company_name")
		self.assertEqual(poster["shop_name"], company_name or self.fx.company)
		# The shop's own logo, a full address: the poster is printed from a page of its own
		frappe.db.set_value("Company", self.fx.company, "company_logo", "/files/_test-shop-logo.png")
		logo = self.as_cashier(shop_scan.get_shop_poster, self.fx.profile)["shop_logo"]
		self.assertTrue(logo.startswith("http") and logo.endswith("/files/_test-shop-logo.png"), logo)
		# The same code every time: a poster printed again still opens the shop
		self.assertEqual(self.as_cashier(shop_scan.get_shop_poster, self.fx.profile)["url"], poster["url"])

	def test_a_portal_account_a_visitor_and_a_desk_account_of_no_till_are_refused(self):
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")

		for user in (PORTAL, "Guest", DESK):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.as_cashier(shop_scan.get_shop_poster, self.fx.profile, user=user)
