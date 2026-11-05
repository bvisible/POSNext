# //// Neoffice — added file (no upstream equivalent).
"""A phone's session opens from the shop's QR code only where the till lets customers scan, and while its shift is open.

An unknown key, a till that does not let customers scan and a restaurant till are refused alike (nothing says which). A
shop whose till has no shift open gives no session. A session is bound to the shift that was open (it dies when the till
closes) and lives the lifetime of an abandoned cart the till sets.
"""

from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, get_datetime, now_datetime

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_case import ShopCase

UNAVAILABLE = "Scanning in the shop is not available here."


class TestAShopSessionOpensOnlyWhereAndWhenTheShopSells(ShopCase):
	def refused(self, key):
		with self.assertRaises(frappe.ValidationError) as refused:
			self.as_guest(shop_scan.start_shop_session, key)
		return str(refused.exception)

	def test_a_shop_till_open_gives_a_session(self):
		answer = self.as_guest(shop_scan.start_shop_session, self.key)

		self.assertEqual(set(answer), {"token", "shop_name", "shop_logo", "expires_at"})
		self.assertTrue(answer["shop_name"])
		token = frappe.get_doc("Guest Order Token", {"token": answer["token"]})
		self.assertEqual(
			(token.mode, token.pos_profile, token.pos_opening, token.owner),
			("shop", self.fx.profile, self.opening, "Guest"),
		)

	def test_the_page_carries_the_logo_of_the_shop_as_its_company_keeps_it(self):
		# The pages a shop shows its own customers carry the shop's brand, not Neoffice's (05.11.2026)
		frappe.db.set_value("Company", self.fx.company, "company_logo", "/files/_test-shop-logo.png")

		answer = self.as_guest(shop_scan.start_shop_session, self.key)

		self.assertEqual(answer["shop_logo"], "/files/_test-shop-logo.png")

	def test_a_shop_with_no_logo_gives_its_name_alone(self):
		frappe.db.set_value("Company", self.fx.company, "company_logo", None)

		answer = self.as_guest(shop_scan.start_shop_session, self.key)

		self.assertEqual(answer["shop_logo"], "")
		self.assertTrue(answer["shop_name"])

	def test_an_unknown_key_a_shop_scan_off_and_a_restaurant_till_are_refused_alike(self):
		self.assertEqual(self.refused("not-a-key"), frappe._(UNAVAILABLE))
		self.assertEqual(self.refused(""), frappe._(UNAVAILABLE))

		frappe.db.set_value("POS Settings", self.settings, "enable_shop_scan", 0)
		self.assertEqual(self.refused(self.key), frappe._(UNAVAILABLE))

		frappe.db.set_value(
			"POS Settings",
			self.settings,
			{"enable_shop_scan": 1, "enable_restaurant_mode": 1, "restaurant": "_Test Shop Restaurant"},
		)
		with patch.dict(frappe.local.conf, {"neoresto_active": 1}):
			self.assertEqual(self.refused(self.key), frappe._(UNAVAILABLE))

	def test_a_closed_shop_gives_no_session(self):
		frappe.db.set_value("POS Opening Entry", self.opening, "status", "Closed")

		self.assertEqual(
			self.refused(self.key), frappe._("The shop is closed: scanning starts again when its till opens.")
		)

	def test_the_session_dies_with_the_tills_shift(self):
		token = self.a_session()
		frappe.db.set_value("POS Opening Entry", self.opening, "status", "Closed")

		with self.assertRaises(frappe.AuthenticationError):
			self.as_guest(shop_scan.get_shop_cart, token)

	def test_a_session_lives_the_lifetime_of_the_setting(self):
		frappe.db.set_value("POS Settings", self.settings, "shop_cart_lifetime_hours", 2)

		expires_at = get_datetime(self.as_guest(shop_scan.start_shop_session, self.key)["expires_at"])

		self.assertLess(abs((expires_at - add_to_date(now_datetime(), hours=2)).total_seconds()), 120)

	def test_the_key_of_the_qr_code_is_kept_once_set(self):
		from pos_next.shop_scan.session import shop_key

		self.assertEqual(shop_key(self.fx.profile), self.key)
		self.assertGreaterEqual(len(self.key), 20)
