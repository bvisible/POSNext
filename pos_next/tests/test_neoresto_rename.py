# //// Neoffice — added file (no upstream equivalent).
"""NeoRestau became NeoResto (NeoResto lot 1, Daniel and Jérémy, 02.11.2026): what a site made under the old name is renamed once.

The product's page (a public workspace) and its menu entry (a virtual App Customization) are made ONCE by `neoresto.setup`, so a site
that has them under the old name must not get a second pair under the new one at its next migrate: the patch renames them (with the
roles the page holds and the entry's link to it), and leaves an entry whose title an administrator changed with that title. The site's
flag, `neorestau_active` before, is read under both names until the sites have been migrated, and the patch carries it to the new one.

Every test builds the old page and entry under names of its own (`_Test`) and deletes them: a real NeoResto of the site is never touched.
"""

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.patches.neoresto import rename_what_neorestau_made
from pos_next.restaurant import mode, neoresto
from pos_next.tests.test_restaurant_mode_comes_from_the_till import ABSENT, a_site_where_neoresto_is

OLD_PAGE = "_Test NeoRestau"
OLD_APP = "_test_neorestau"
OLD_TITLE = "_Test NeoRestau title"
NEW_PAGE = "_Test NeoResto"
NEW_APP = "_test_neoresto"
NEW_TITLE = "_Test NeoResto title"
ROLE = "System Manager"


class TestTheNamesTheSiteHolds(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		if not frappe.db.exists("DocType", "App Customization"):
			raise unittest.SkipTest("the site has no App Customization")
		super().setUpClass()

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		names = patch.multiple(neoresto, APP=NEW_APP, WORKSPACE=NEW_PAGE, TITLE=NEW_TITLE)
		names.start()
		self.addCleanup(names.stop)
		self.addCleanup(self.forget)
		self.forget()

	@staticmethod
	def forget():
		for name in (OLD_APP, NEW_APP):
			if frappe.db.exists("App Customization", name):
				frappe.delete_doc("App Customization", name, force=True, ignore_permissions=True)
		for name in (OLD_PAGE, NEW_PAGE):
			if frappe.db.exists("Workspace", name):
				frappe.delete_doc("Workspace", name, force=True, ignore_permissions=True)

	@staticmethod
	def made_under_the_old_name(title=OLD_TITLE):
		page = frappe.get_doc(
			{
				"doctype": "Workspace",
				"label": OLD_PAGE,
				"title": OLD_PAGE,
				"public": 1,
				"content": "[]",
				"roles": [{"role": ROLE}],
			}
		)
		# A page made by the system is never written into an app's files (see neoresto._never_exported)
		with neoresto._never_exported():
			page.insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "App Customization",
				"app_name": OLD_APP,
				"app_title": title,
				"is_virtual": 1,
				"enabled": 1,
				"workspaces": [{"workspace_name": OLD_PAGE, "sort_order": 0, "hidden": 0}],
			}
		).insert(ignore_permissions=True)

	def run_patch(self):
		# The site's own configuration is never written by a test
		with neoresto._never_exported(), patch("frappe.installer.update_site_config"):
			rename_what_neorestau_made.execute(old_page=OLD_PAGE, old_app=OLD_APP, old_title=OLD_TITLE)

	def test_the_page_and_the_menu_entry_take_the_new_name(self):
		self.made_under_the_old_name()

		self.run_patch()

		self.assertFalse(frappe.db.exists("Workspace", OLD_PAGE))
		self.assertFalse(frappe.db.exists("App Customization", OLD_APP))
		page = frappe.get_doc("Workspace", NEW_PAGE)
		self.assertEqual((page.label, page.title), (NEW_PAGE, NEW_PAGE))
		self.assertEqual([row.role for row in page.roles], [ROLE])
		entry = frappe.get_doc("App Customization", NEW_APP)
		self.assertEqual((entry.app_name, entry.app_title), (NEW_APP, NEW_TITLE))
		self.assertEqual([row.workspace_name for row in entry.workspaces], [NEW_PAGE])

	def test_the_next_setup_makes_nothing_more(self):
		self.made_under_the_old_name()
		self.run_patch()

		with patch.dict(frappe.conf, {"neoresto_active": 1}):
			neoresto.setup()

		self.assertEqual(frappe.db.count("App Customization", {"name": ["in", [OLD_APP, NEW_APP]]}), 1)
		self.assertEqual(frappe.db.count("Workspace", {"name": ["in", [OLD_PAGE, NEW_PAGE]]}), 1)

	def test_a_title_an_administrator_changed_stays(self):
		self.made_under_the_old_name(title="Notre restaurant")

		self.run_patch()

		self.assertEqual(frappe.db.get_value("App Customization", NEW_APP, "app_title"), "Notre restaurant")

	def test_it_does_nothing_where_the_site_holds_nothing_under_the_old_name(self):
		self.run_patch()

		self.assertFalse(frappe.db.exists("Workspace", NEW_PAGE))
		self.assertFalse(frappe.db.exists("App Customization", NEW_APP))

	def test_it_can_run_twice(self):
		self.made_under_the_old_name()
		self.run_patch()
		self.run_patch()

		self.assertTrue(frappe.db.exists("Workspace", NEW_PAGE))
		self.assertTrue(frappe.db.exists("App Customization", NEW_APP))

	def test_a_site_that_already_holds_the_new_names_keeps_both_untouched(self):
		self.made_under_the_old_name()
		frappe.get_doc(
			{"doctype": "Workspace", "label": NEW_PAGE, "title": NEW_PAGE, "public": 1, "content": "[]"}
		).insert(ignore_permissions=True)

		self.run_patch()

		# Nothing is merged or overwritten: a person decides what to do with two pages
		self.assertTrue(frappe.db.exists("Workspace", OLD_PAGE))
		self.assertTrue(frappe.db.exists("Workspace", NEW_PAGE))


class TestTheSiteFlagUnderItsTwoNames(FrappeTestCase):
	def test_a_site_that_still_says_the_old_name_runs_neoresto(self):
		with a_site_where_neoresto_is(ABSENT), patch.dict(frappe.conf, {mode.LEGACY_SITE_FLAG: 1}):
			self.assertTrue(mode.neoresto_active())
			self.assertTrue(neoresto.active())

	def test_the_new_name_wins_over_the_old_one(self):
		with patch.dict(frappe.conf, {mode.SITE_FLAG: 0, mode.LEGACY_SITE_FLAG: 1}):
			self.assertFalse(mode.neoresto_active())
		with patch.dict(frappe.conf, {mode.SITE_FLAG: 1, mode.LEGACY_SITE_FLAG: 0}):
			self.assertTrue(mode.neoresto_active())

	def test_a_site_that_says_neither_does_not_run_it(self):
		with a_site_where_neoresto_is(ABSENT):
			self.assertFalse(mode.neoresto_active())

	def test_the_patch_carries_the_old_name_to_the_new_one(self):
		with a_site_where_neoresto_is(ABSENT), patch.dict(frappe.conf, {mode.LEGACY_SITE_FLAG: 1}):
			with patch("frappe.installer.update_site_config") as written:
				rename_what_neorestau_made.execute(old_page=OLD_PAGE, old_app=OLD_APP, old_title=OLD_TITLE)

		self.assertEqual(
			[call.args for call in written.call_args_list],
			[(mode.SITE_FLAG, 1), (mode.LEGACY_SITE_FLAG, "None")],
		)

	def test_the_patch_leaves_a_site_that_says_nothing_alone(self):
		with a_site_where_neoresto_is(ABSENT), patch("frappe.installer.update_site_config") as written:
			rename_what_neorestau_made.execute(old_page=OLD_PAGE, old_app=OLD_APP, old_title=OLD_TITLE)

		written.assert_not_called()

	def test_the_patch_does_not_write_over_a_site_that_already_has_the_new_name(self):
		with patch.dict(frappe.conf, {mode.SITE_FLAG: 0, mode.LEGACY_SITE_FLAG: 1}):
			with patch("frappe.installer.update_site_config") as written:
				rename_what_neorestau_made.execute(old_page=OLD_PAGE, old_app=OLD_APP, old_title=OLD_TITLE)

		# The new name stays as it says; only the old one is dropped
		self.assertEqual([call.args for call in written.call_args_list], [(mode.LEGACY_SITE_FLAG, "None")])
