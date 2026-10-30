# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

"""/pos page exposes optional-app flags (window.posnext_app_flags) for the Vue app."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.optional_apps import get_pos_ui_app_flags, update_pos_page_context

# //// Neoffice — a configuration without the NeoRestau flag (see test_exposes_whether_neorestau_runs).
ABSENT = object()


class TestPosPageContext(FrappeTestCase):
	def test_flags_follow_installed_apps(self):
		with patch("frappe.get_installed_apps", return_value=["frappe", "erpnext", "posnext_promotions"]):
			self.assertEqual(get_pos_ui_app_flags(), {"posnext_promotions": 1})
		with patch("frappe.get_installed_apps", return_value=["frappe", "erpnext"]):
			self.assertEqual(get_pos_ui_app_flags(), {})

	def test_extends_existing_boot_on_pos_page(self):
		context = frappe._dict(path="pos", boot={"csrf_token": "x", "site_name": "s"})
		with patch("frappe.get_installed_apps", return_value=["posnext_promotions"]):
			update_pos_page_context(context)
		self.assertEqual(context.boot["csrf_token"], "x")
		self.assertEqual(context.boot["posnext_app_flags"], {"posnext_promotions": 1})

	def test_creates_boot_when_page_has_none(self):
		context = frappe._dict(path="pos")
		# //// Neoffice — the developer mode is set here: a clone of a working site runs in developer mode, which the test
		# //// took for granted to be off.
		with (
			patch("frappe.get_installed_apps", return_value=["posnext_promotions"]),
			patch.dict(frappe.conf, {"developer_mode": 0}),
		):
			update_pos_page_context(context)
		# //// Neoffice — the page also says whether the site runs NeoRestau (test_exposes_whether_neorestau_runs); its
		# //// value is the site's, so this test names the keys it is about instead of comparing the whole boot.
		self.assertEqual(
			{key: context.boot[key] for key in ("posnext_app_flags", "posnext_developer_mode")},
			{"posnext_app_flags": {"posnext_promotions": 1}, "posnext_developer_mode": 0},
		)
		# //// Neoffice — and nothing else is added to the boot.
		self.assertEqual(
			set(context.boot), {"posnext_app_flags", "posnext_developer_mode", "posnext_neorestau_active"}
		)

	def test_exposes_backend_developer_mode(self):
		for flag in (0, 1):
			context = frappe._dict(path="pos")
			with patch.dict(frappe.conf, {"developer_mode": flag}):
				update_pos_page_context(context)
			self.assertEqual(context.boot["posnext_developer_mode"], flag)

	# //// Neoffice — NeoRestau lot 1, task 4, fix round 1: the till's own screens of the restaurant (/kds, /runner,
	# //// /takeaway) open only where the site runs NeoRestau, and they may load with no till profile and no session, so
	# //// the page itself says it, as window.posnext_neorestau_active, like the flags above.
	def test_exposes_whether_neorestau_runs(self):
		for value, told in ((1, True), ("1", True), (0, False), (None, False), (ABSENT, False)):
			with self.subTest(value=value), patch.dict(frappe.conf):
				if value is ABSENT:
					frappe.conf.pop("neorestau_active", None)
				else:
					frappe.conf["neorestau_active"] = value
				context = frappe._dict(path="pos")
				update_pos_page_context(context)
				self.assertIs(context.boot["posnext_neorestau_active"], told)

	def test_other_pages_untouched(self):
		context = frappe._dict(path="login")
		update_pos_page_context(context)
		self.assertNotIn("boot", context)

	def test_hook_registered(self):
		self.assertIn(
			"pos_next.optional_apps.update_pos_page_context",
			frappe.get_hooks("update_website_context"),
		)
