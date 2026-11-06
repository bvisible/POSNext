# //// Neoffice — added file (no upstream equivalent).
"""Whoever lands on ERPNext's own lists and forms of a till is told where a till is made and set up, and nothing is redirected (NeoResto
lot 1, task 13b; product owner, 06.11.2026: « comment on fait pour arriver dans les réglages de base [...] que les gens se retrouvent au
bon endroit en fonction d'où ils viennent »).

The scripts of the desk are not run here (the browser does that, and it was looked at on osiris); this holds the pieces together: each
original surface has its script registered, each script points at the page and makes nothing of its own, and the page understands what the
lists send it.
"""

import re
from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

APP = Path(frappe.get_app_path("pos_next"))
PAGE = (APP / "pos_next/page/till_settings/till_settings.js").read_text()


def script(*parts):
	return (APP.joinpath(*parts)).read_text()


class TestTheOriginalListsAndFormsGuideToTheTillSettingsPage(FrappeTestCase):
	def test_the_two_lists_are_registered_and_each_script_exists(self):
		lists = frappe.get_hooks("doctype_list_js", app_name="pos_next")

		for doctype, path in (
			("POS Profile", "public/js/pos_profile_list.js"),
			("POS Settings", "public/js/pos_settings_list.js"),
		):
			with self.subTest(doctype=doctype):
				# A hook that is a dict comes back merged: {doctype: [paths]}
				self.assertIn(path, lists.get(doctype) or [], f"no list script is registered for {doctype}")
				self.assertTrue((APP / path).exists())

	def test_the_list_of_tills_sends_a_new_till_to_the_page_and_keeps_erpnexts_own_form_in_the_menu(self):
		text = script("public", "js", "pos_profile_list.js")

		self.assertIn("new_till: 1", text)
		self.assertIn('frappe.set_route("till-settings")', text)
		self.assertIn('frappe.new_doc("POS Profile")', text)
		# Nothing is made by the list itself
		self.assertNotIn("frappe.call", text)

	def test_the_list_of_settings_points_at_the_page_and_keeps_the_manual_record_in_the_menu(self):
		text = script("public", "js", "pos_settings_list.js")

		self.assertIn('frappe.set_route("till-settings")', text)
		self.assertIn('frappe.new_doc("POS Settings")', text)

	def test_the_page_opens_its_new_till_dialog_when_a_list_asks_for_it(self):
		self.assertIn("frappe.route_options.new_till", PAGE)
		self.assertRegex(
			PAGE, r"prototype\.show = function[\s\S]*?route_options\.new_till[\s\S]*?self\.new_till\(\)"
		)

	def test_the_forms_say_what_to_do_whether_the_record_is_new_or_not(self):
		for path in (
			("public", "js", "pos_profile.js"),
			("pos_next", "doctype", "pos_settings", "pos_settings.js"),
		):
			text = script(*path)
			with self.subTest(form=path[-1]):
				# A new record and an existing one each get their sentence, and a way to the page
				self.assertGreaterEqual(len(re.findall(r"set_intro\(", text)), 2)
				self.assertIn("till-settings", text)

	def test_the_page_can_delete_a_till_and_offers_the_first_one_when_there_is_none(self):
		self.assertIn("delete_till", PAGE)
		self.assertIn("render_empty", PAGE)
		self.assertIn("data-new-till", PAGE)
