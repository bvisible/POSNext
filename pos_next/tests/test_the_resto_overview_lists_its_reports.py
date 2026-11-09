# //// Neoffice — added file (no upstream equivalent).
"""The overview of NeoResto lists its reports, as the point of sale's overview does (product owner, 09.11.2026).

The space had a Reports tab, the last of its tab bar, and an overview whose « whole module » held the settings only: « toute cette
partie rapport, il n'y a pas du tout dans le menu NeoResto ». A space declares the side cards of its overview to the theme; an
application declares its space's through the `neoffice_workspace_more` hook. NeoResto's card holds the reports of its own tab, in
the tab's order, so a report added to the tab reaches the card without a second list to keep.

The theme is not a dependency of this app: where it is not installed the tests skip, as those of the tabs do.
"""

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import neoresto
from pos_next.tests.test_neoresto import theme_or_skip


class TestTheRestoOverviewListsItsReports(FrappeTestCase):
	def setUp(self):
		super().setUp()
		patcher = patch.dict(frappe.conf, {"neoresto_active": 1})
		patcher.start()
		self.addCleanup(patcher.stop)

	def declared(self):
		return neoresto.workspace_more()

	def test_the_hook_is_declared(self):
		# Other applications declare their own spaces through the same hook
		self.assertIn(
			"pos_next.restaurant.neoresto.workspace_more", frappe.get_hooks("neoffice_workspace_more")
		)
		self.assertIs(frappe.get_attr("pos_next.restaurant.neoresto.workspace_more"), neoresto.workspace_more)

	def test_the_card_holds_the_reports_of_the_reports_tab_in_its_order(self):
		retail = theme_or_skip("neoffice_theme.workspace_spaces.retail", "tabs")
		tab = next(t for t in retail.tabs() if t["key"] == "reports")
		expected = []
		for group in [*tab["groups"], neoresto.restaurant_reports()]:
			expected += [name for name in group.get("reports", []) if name not in expected]

		reports = self.declared()[neoresto.SPACE]["side"]["reports"]

		# The legacy till's register is not the restaurant's: the tab leaves it out and so does the card
		for legacy in getattr(retail, "LEGACY_REPORTS", ()):
			expected = [name for name in expected if name != legacy]
		self.assertEqual(reports, expected)
		for name in ("Neopos Register", "Payments and Cash Control Report", neoresto.TIPS_REPORT):
			self.assertIn(name, reports)
		self.assertEqual(len(reports), len(set(reports)))

	def test_it_declares_the_reports_card_only_and_leaves_the_settings_to_the_page(self):
		theme_or_skip("neoffice_theme.workspace_spaces.retail", "tabs")

		side = self.declared()[neoresto.SPACE]["side"]

		self.assertEqual(list(side), ["reports"])

	def test_a_site_that_does_not_run_neoresto_declares_nothing(self):
		with patch.object(neoresto, "active", return_value=False):
			self.assertEqual(neoresto.workspace_more(), {})

	def test_where_the_theme_has_no_reports_tab_nothing_is_declared(self):
		theme_or_skip("neoffice_theme.workspace_spaces.retail", "tabs")

		with patch.object(neoresto, "_borrowed", return_value=None):
			self.assertEqual(neoresto.workspace_more(), {})


if __name__ == "__main__":
	unittest.main()
