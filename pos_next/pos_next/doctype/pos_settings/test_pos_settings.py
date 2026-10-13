# Copyright (c) 2025, Youssef Restom and Contributors
# See license.txt

# //// Neoffice — the tests of a till's negative stock as the site's one setting (pos_settings.
# //// _site_allows_negative_stock, 13.10.2026); upstream's class was empty.
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import cint


def site():
	return cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock"))


class TestPOSSettings(FrappeTestCase):
	def setUp(self):
		self.name = frappe.db.get_value("POS Settings", {}, "name")
		if not self.name:
			self.skipTest("no POS Settings on this site")
		# A company settings' save commits halfway (neoffice_wizard): nothing of a test may stay.
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		frappe.db.set_single_value(
			"Stock Settings", {"allow_negative_stock": 0, "enable_stock_reservation": 0}
		)

	def tearDown(self):
		frappe.db.rollback()
		frappe.clear_cache()

	def test_the_form_shows_the_sites_setting(self):
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
		frappe.db.set_value("POS Settings", self.name, "allow_negative_stock", 0)
		doc = frappe.get_doc("POS Settings", self.name)
		doc.run_method("onload")
		self.assertEqual(cint(doc.allow_negative_stock), 1)

	def test_switched_at_a_till_it_is_the_sites_setting(self):
		doc = frappe.get_doc("POS Settings", self.name)
		doc.allow_negative_stock = 1
		doc.save(ignore_permissions=True)
		self.assertEqual(site(), 1)
		# written through the Stock Settings document: ERPNext's copy follows
		self.assertEqual(cint(frappe.db.get_default("allow_negative_stock")), 1)
		doc.reload()
		doc.allow_negative_stock = 0
		doc.save(ignore_permissions=True)
		self.assertEqual(site(), 0)

	def test_a_save_for_something_else_never_puts_a_tills_copy_back(self):
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
		frappe.db.set_value("POS Settings", self.name, "allow_negative_stock", 0)
		doc = frappe.get_doc("POS Settings", self.name)
		doc.silent_print = 0 if cint(doc.silent_print) else 1
		doc.save(ignore_permissions=True)
		self.assertEqual(site(), 1)

	def test_the_till_sells_as_the_site_allows(self):
		from pos_next.api.bootstrap import _get_pos_settings

		profile = frappe.get_doc("POS Profile", frappe.db.get_value("POS Settings", self.name, "pos_profile"))
		frappe.db.set_value("POS Settings", self.name, {"allow_negative_stock": 0, "enabled": 1})
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
		self.assertEqual(_get_pos_settings(profile)["allow_negative_stock"], 1)
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 0)
		frappe.db.set_value("POS Settings", self.name, "allow_negative_stock", 1)
		self.assertEqual(_get_pos_settings(profile)["allow_negative_stock"], 0)
