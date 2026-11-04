# //// Neoffice — added file (no upstream equivalent).
"""A phone's cart nobody paid nor took over is deleted after the lifetime its till sets (purge.purge_abandoned_carts, hourly).

A recent cart is kept, a paid one is never deleted (it waits for its check), a draft the shop scan did not make is never
touched; a deleted cart leaves its Deleted Document and its session expired. The purge commits per till: the suite makes
its commits no-ops, and rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, now_datetime

from pos_next.api import shop_scan
from pos_next.shop_scan import purge
from pos_next.tests.shop_scan_case import ShopCase


class TestAnAbandonedShopCartIsPurged(ShopCase):
	def setUp(self):
		super().setUp()
		no_commit = patch.object(frappe.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)

	def a_cart(self, hours_ago):
		token = self.a_session()
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)
		name = self.the_draft(token).name
		frappe.db.sql(
			"UPDATE `tabSales Invoice` SET modified = %s WHERE name = %s",
			(add_to_date(now_datetime(), hours=-hours_ago), name),
		)
		return token, name

	def test_a_cart_older_than_its_lifetime_is_purged(self):
		token, name = self.a_cart(hours_ago=5)

		purge.purge_abandoned_carts()

		self.assertFalse(frappe.db.exists("Sales Invoice", name))
		self.assertTrue(
			frappe.db.exists("Deleted Document", {"deleted_doctype": "Sales Invoice", "deleted_name": name})
		)
		self.assertEqual(frappe.db.get_value("Guest Order Token", {"token": token}, "status"), "Expired")

	def test_a_recent_cart_is_kept(self):
		_token, name = self.a_cart(hours_ago=1)

		purge.purge_abandoned_carts()

		self.assertTrue(frappe.db.exists("Sales Invoice", name))

	def test_the_lifetime_is_the_tills(self):
		frappe.db.set_value("POS Settings", self.settings, "shop_cart_lifetime_hours", 8)
		_token, name = self.a_cart(hours_ago=5)

		purge.purge_abandoned_carts()

		self.assertTrue(frappe.db.exists("Sales Invoice", name))

	def test_a_paid_cart_is_never_purged(self):
		_token, name = self.a_cart(hours_ago=5)
		frappe.db.sql("UPDATE `tabSales Invoice` SET paid_amount = 10 WHERE name = %s", name)

		purge.purge_abandoned_carts()

		self.assertTrue(frappe.db.exists("Sales Invoice", name))

	def test_a_draft_the_shop_scan_did_not_make_is_never_touched(self):
		token, name = self.a_cart(hours_ago=5)
		# The same draft, linked from no shop session: a till's own draft, or a table's order
		frappe.db.set_value("Guest Order Token", {"token": token}, "invoice", None)

		purge.purge_abandoned_carts()

		self.assertTrue(frappe.db.exists("Sales Invoice", name))
