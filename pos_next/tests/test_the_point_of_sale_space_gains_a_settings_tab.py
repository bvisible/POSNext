# //// Neoffice — added file (no upstream equivalent).
"""The point of sale's space has a Settings tab, and the till settings page is its first door (NeoResto lot 1, task 13b; product owner,
06.11.2026: « que ta page de réglage soit dans point de vente et dans resto »).

The theme's retail space listed the tills and nothing said where their settings are. The tab is added through the theme's
`neoffice_workspace_tabs` hook, before the space's reports, and shows the page, then the two original lists kept for support.

The tab is built of the theme's own pieces and read by the theme: a site without neoffice_theme (the fleet's CI site installs frappe,
erpnext, payments and pos_next only) never calls the provider, and these tests skip there, as the other tests of the theme's hooks do.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.tests.test_neoresto import theme_or_skip
from pos_next.till_settings import workspace


class TestThePointOfSaleSpaceGainsASettingsTab(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")

	def test_the_provider_gives_one_settings_tab_to_the_retail_space_with_the_page_first(self):
		theme_or_skip("neoffice_theme.workspace_spaces.common", "settings")

		given = workspace.tabs()

		self.assertEqual(list(given), ["Retail"])
		(tab,) = given["Retail"]
		self.assertEqual((tab["key"], tab["archetype"]), ("settings", "settings"))
		self.assertEqual(tab["bundle"], ["Retail"])
		(group,) = tab["groups"]
		self.assertEqual(group["items"][0]["page"], "till-settings")
		self.assertEqual(group["items"][1:], ["POS Settings", "POS Profile"])

	def test_the_space_of_the_theme_carries_it_before_its_reports(self):
		workspace_tabs = theme_or_skip("neoffice_theme.workspace_tabs", "_code_catalogue")

		tabs = workspace_tabs._code_catalogue()["Retail"]

		keys = [tab["key"] for tab in tabs]
		self.assertIn("settings", keys)
		self.assertLess(keys.index("settings"), keys.index("reports"))
		self.assertLess(keys.index("promotions"), keys.index("settings"))

	def test_the_reader_who_may_read_the_tills_opens_the_page_from_it(self):
		workspace_tabs = theme_or_skip("neoffice_theme.workspace_tabs", "_settings_panel")

		(tab,) = [t for t in workspace_tabs._code_catalogue()["Retail"] if t["key"] == "settings"]

		panel = workspace_tabs._settings_panel(tab)

		(group,) = panel["groups"]
		self.assertEqual(group["items"][0]["route"], "/app/till-settings")
		self.assertEqual(group["items"][0]["label"], "Till settings")
		self.assertEqual(len(group["items"]), 3)

	def test_the_tills_tab_opens_with_a_new_till_gesture_that_leads_to_the_page(self):
		"""06.11: the tab of the tills is where a shop owner lands from the point of sale; making a till is one gesture away."""
		workspace_tabs = theme_or_skip("neoffice_theme.workspace_tabs", "_call")
		(tab,) = [t for t in workspace_tabs._code_catalogue()["Retail"] if t["key"] == "tills"]

		call = workspace_tabs._call(tab)

		self.assertEqual(call["label"], "New till")
		self.assertEqual(call["page"], "till-settings")
		self.assertTrue(call["route"].startswith("/app/till-settings"))
		self.assertIn("new_till=1", call["route"])
