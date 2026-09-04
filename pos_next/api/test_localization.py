# -*- coding: utf-8 -*-
# Copyright (c) 2026, Neoffice and contributors
# For license information, please see license.txt

#//// Neoffice — added file (no upstream equivalent). Covers the language whitelist of POS
#//// Settings, which this fork added (c081f418) and which was dead code until 2026-09-04:
#//// get_allowed_locales_from_settings() read `row.locale` on a child doctype whose only field
#//// is `language`, and the AttributeError was swallowed by a bare `except` that returned an
#//// empty set — the value this fork reads as "no restriction". A configured whitelist was
#//// therefore ignored on every instance, silently. These tests pin the field name and the
#//// two meanings of the table (populated = restriction, empty = all languages).
"""
Test Suite for the POS localization API

Run with:
	bench --site [site] run-tests --app pos_next --module pos_next.api.test_localization
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api.localization import (
	get_allowed_locales,
	get_allowed_locales_from_settings,
)

TEST_PROFILE = "_Test Locale Whitelist Profile"


class TestAllowedLocales(FrappeTestCase):
	"""The allowed-locale whitelist of POS Settings must actually be honoured."""

	def setUp(self):
		# Only the first ENABLED POS Settings is read, so silence any other one the site
		# already carries. FrappeTestCase rolls the transaction back once the class is done.
		frappe.db.set_value("POS Settings", {"enabled": 1}, "enabled", 0, update_modified=False)
		self._delete_test_settings()

	def tearDown(self):
		# POS Settings.pos_profile is unique and the doctype is named by hash, so the row has
		# to go by filter between tests: the class-wide rollback comes too late for that.
		self._delete_test_settings()

	def _delete_test_settings(self):
		for name in frappe.get_all(
			"POS Settings", filters={"pos_profile": TEST_PROFILE}, pluck="name"
		):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)

	def _make_settings(self, languages):
		"""Insert an enabled POS Settings whose allowed_locales holds `languages`."""
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": TEST_PROFILE,
				"enabled": 1,
				"allowed_locales": [{"language": code} for code in languages],
			}
		)
		# Neither the POS Profile nor the Languages need to exist for this test: what is
		# under test is how the child rows are read, not what they point at.
		doc.insert(ignore_permissions=True, ignore_links=True)
		return doc

	def test_child_doctype_stores_the_code_in_language(self):
		"""The field the lookup depends on. `locale` never existed on POS Allowed Locale."""
		meta = frappe.get_meta("POS Allowed Locale")
		self.assertTrue(meta.has_field("language"))
		self.assertFalse(meta.has_field("locale"))

	def test_configured_whitelist_is_returned(self):
		self._make_settings(["fr", "en"])
		self.assertEqual(get_allowed_locales_from_settings(), {"fr", "en"})

	def test_whitelist_excludes_the_languages_it_does_not_list(self):
		"""The regression: this used to come back empty, i.e. "every language allowed"."""
		self._make_settings(["fr"])
		allowed = get_allowed_locales_from_settings()
		self.assertEqual(allowed, {"fr"})
		self.assertNotIn("ar", allowed)
		self.assertNotIn("en", allowed)

	def test_codes_are_lowercased_for_the_frontend(self):
		"""useLocale.js keys its SUPPORTED_LOCALES map in lowercase (pt-br, not pt-BR)."""
		self._make_settings(["pt-BR"])
		self.assertEqual(get_allowed_locales_from_settings(), {"pt-br"})

	def test_empty_table_means_no_restriction(self):
		self._make_settings([])
		self.assertEqual(get_allowed_locales_from_settings(), set())

	def test_api_wrapper_exposes_the_whitelist(self):
		self._make_settings(["fr", "en"])
		response = get_allowed_locales()
		self.assertTrue(response["success"])
		self.assertEqual(set(response["locales"]), {"fr", "en"})
