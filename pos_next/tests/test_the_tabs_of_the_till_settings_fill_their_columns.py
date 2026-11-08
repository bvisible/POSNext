# //// Neoffice — added file (no upstream equivalent).
"""The tabs of the till's settings fill their columns (product owner, 08.11.2026: « tout est dans la même colonne […] regarde aussi les autres »).

The restaurant tab held nine settings in ONE group, « Service »: the first column was thirteen rows tall against three and four in the others, and on a window that fits
two columns the third wrapped under the first. The nine are three groups of their own (the service, the tables, the ticket numbers); the sale screen's ten settings of
« Items » were split the same way, and the floor alerts moved to the third column of the general tab. The suite pins the result on the registry, which both screens (the till's
and the office's page) are drawn from: no tab has a column more than twice as tall as its shortest plus two rows, the restaurant tab's three columns are within two rows of
each other, and the settings stand in the groups the screens name them by.
"""

from collections import defaultdict

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.till_settings import registry


def heights_by_tab():
	"""`{tab: {column: rows}}` as the screens draw them: a group is one row for its title and one per setting."""
	rows = defaultdict(int)
	for setting in registry.SETTINGS:
		rows[setting.group] += 1
	heights = defaultdict(lambda: defaultdict(int))
	for group in registry.GROUPS.values():
		if rows[group.key]:
			heights[group.tab][group.column] += 1 + rows[group.key]
	return heights


class TestTheTabsFillTheirColumns(FrappeTestCase):
	def test_no_column_of_a_tab_is_more_than_twice_the_shortest_plus_two_rows(self):
		for tab, columns in heights_by_tab().items():
			if len(columns) < 2:
				continue
			with self.subTest(tab=tab, heights=dict(columns)):
				self.assertLessEqual(max(columns.values()), 2 * min(columns.values()) + 2)

	def test_the_restaurant_tab_has_three_columns_within_two_rows_of_each_other(self):
		columns = heights_by_tab()["restaurant"]

		self.assertEqual(sorted(columns), [1, 2, 3])
		self.assertLessEqual(max(columns.values()) - min(columns.values()), 2, dict(columns))

	def test_the_restaurant_settings_stand_in_the_group_that_names_them(self):
		for key, group in (
			("enable_runner", "service"),
			("service_rhythm", "service"),
			("grey_out_sold_out", "service"),
			("ask_covers_on_open", "tables"),
			("remind_to_cash_in_minutes", "tables"),
			("ask_if_guests_left_minutes", "tables"),
			("ticket_number_digits", "tickets"),
			("ticket_number_reset", "tickets"),
			("business_day_start", "tickets"),
		):
			with self.subTest(key=key):
				setting = registry.get(key)
				self.assertEqual((setting.group, setting.tab), (group, "restaurant"))

	def test_the_new_groups_of_the_restaurant_tab_speak_for_the_whole_restaurant(self):
		# Their settings are the restaurant's own (the badge « whole restaurant » of the service group), whichever till opens the page
		for key in ("tables", "tickets"):
			with self.subTest(group=key):
				self.assertEqual(registry.GROUPS[key].scope, "restaurant")
				self.assertEqual(registry.GROUPS[key].tab, "restaurant")

	def test_the_sale_screen_splits_its_ten_item_settings_in_three_groups(self):
		for key, group in (
			("tiles_per_row", "tiles"),
			("tile_height", "tiles"),
			("tile_colors", "tiles"),
			("cart_pictures", "pictures"),
			("phone_card_pictures", "pictures"),
			("till_card_pictures", "pictures"),
			("display_item_code", "items"),
			("hide_unavailable_items", "items"),
		):
			with self.subTest(key=key):
				self.assertEqual(registry.get(key).group, group)

	def test_every_group_of_the_registry_holds_a_setting_and_every_setting_has_a_group(self):
		with_settings = {setting.group for setting in registry.SETTINGS}

		self.assertEqual(
			with_settings - set(registry.GROUPS), set(), "a setting names a group that does not exist"
		)
		self.assertEqual({key for key in registry.GROUPS} - with_settings, set(), "a group holds no setting")
