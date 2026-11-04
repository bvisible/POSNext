# //// Neoffice — added file (no upstream equivalent).
"""Scanning in the shop is a setting of a shop till, off until a shop switches it on (pos_next.shop_scan, lot 1).

A till's POS Settings carry the switch, the lifetime of an abandoned cart and the key of the shop's QR code; a guest session
can be a shop one, and keeps the code and the state of its cart; an article, or its group, says whether a seller checks it at
the counter. The till's settings screen shows the switch and the settings of the scan on a shop till only (lot 5: the phone's
page, the takeover and the payment work); the key of the QR code is the system's. The suite reads the site's schema and writes
nothing it keeps.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.till_settings import registry

SHOP_SCAN_SETTINGS = (
	"enable_shop_scan",
	"shop_cart_lifetime_hours",
	"shop_scan_phone_payment",
	"shop_scan_validation_on_phone",
)


class TestTheShopScanIsSetPerShopTill(FrappeTestCase):
	def test_a_shop_till_has_the_shop_scan_off_by_default(self):
		settings = frappe.new_doc("POS Settings")

		self.assertEqual(settings.enable_shop_scan, 0)
		self.assertEqual(settings.shop_cart_lifetime_hours, 4)

	def test_a_guest_session_can_be_a_shop_one(self):
		self.assertIn("shop", frappe.get_meta("Guest Order Token").get_field("mode").options.split("\n"))

	def test_an_item_and_its_group_say_whether_the_counter_validates_it(self):
		for doctype in ("Item", "Item Group"):
			with self.subTest(doctype=doctype):
				self.assertTrue(frappe.db.has_column(doctype, "requires_counter_validation"))

	def test_a_cart_keeps_its_code_and_where_it_stands_on_its_session(self):
		session = frappe.get_meta("Guest Order Token")
		self.assertEqual(session.get_field("cart_code").fieldtype, "Data")
		self.assertEqual(
			session.get_field("cart_status").options.split("\n"),
			["", "Scanning", "At the counter", "Paid", "Checked"],
		)
		# Nothing for it on the Sales Invoice, whose table is at MariaDB's row size on a fleet site
		for fieldname in ("shop_cart_code", "shop_cart_status", "cart_code", "cart_status"):
			with self.subTest(fieldname=fieldname):
				self.assertFalse(frappe.get_meta("Sales Invoice").get_field(fieldname))

	def test_the_till_shows_the_settings_of_the_scan_on_a_shop_till_only(self):
		listed = {setting.key for setting in registry.document_settings(registry.POS_SETTINGS)}
		for key in (*SHOP_SCAN_SETTINGS, "shop_scan_poster"):
			with self.subTest(key=key):
				setting = registry.get(key)
				self.assertEqual(setting.tab, "shop_scan")
				self.assertTrue(registry.shown_on(setting, False))
				self.assertFalse(registry.shown_on(setting, True))
		for key in SHOP_SCAN_SETTINGS:
			with self.subTest(key=key):
				self.assertIn(key, listed)
				self.assertNotIn(key, registry.NOT_LISTED[registry.POS_SETTINGS])
		# The key of the shop's QR code is the system's: nobody types it
		self.assertIn("shop_scan_key", registry.NOT_LISTED[registry.POS_SETTINGS])
		self.assertNotIn("shop_scan_key", listed)
