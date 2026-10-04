# //// Neoffice — added file (no upstream equivalent).
"""The till's settings endpoint carries the profile-derived keys the bootstrap carries.

When a shift is opened on the till's page, the till reads its settings from get_pos_settings instead
of the bootstrap; without disable_rounded_total it kept its default (rounding off) for the whole
session (neoffice-maintenance#1157).
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import cint, flt

from pos_next.pos_next.doctype.pos_settings.pos_settings import get_pos_settings


class TestPOSSettingsFromProfile(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		profiles = frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name", limit=1)
		if not profiles:
			self.skipTest("No enabled POS Profile on this site")
		self.profile = frappe.get_doc("POS Profile", profiles[0])

	def tearDown(self):
		frappe.db.rollback()

	def test_rounding_comes_from_the_profile(self):
		settings = get_pos_settings(self.profile.name)
		self.assertIn("disable_rounded_total", settings)
		self.assertEqual(settings["disable_rounded_total"], cint(self.profile.disable_rounded_total))

	def test_write_off_change_comes_from_the_profile(self):
		settings = get_pos_settings(self.profile.name)
		expected = 1 if (self.profile.write_off_account and flt(self.profile.write_off_limit) > 0) else 0
		self.assertEqual(settings.get("allow_write_off_change"), expected)
