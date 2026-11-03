# //// Neoffice — added file (no upstream equivalent).
"""How the restaurant card's tiles look at the till: its pictures and its colours (NeoResto lot 1, product owner, 03.11.2026).

« Il faudrait voir comment ça donne sans images »: `till_card_pictures` (POS Settings, on by default: the till always showed the pictures) switches them off, and
`tile_colors` (on by default) lets a tile take the colour of its item or of its item group. Both are set from the Sale screen tab of a restaurant till and
handed to the till by its bootstrap, as the phone's pictures are.
"""

import frappe

from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS
from pos_next.tests.test_till_settings import TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEYS = ("till_card_pictures", "tile_colors")


class TestTheLookOfTheTiles(TillSettingsCase):
	def test_the_list_offers_them_on_the_sale_screen_of_a_restaurant_till_only(self):
		for key in KEYS:
			setting = registry.get(key)

			self.assertEqual(setting.tab, "sale_screen")
			self.assertEqual(setting.widget, "check")
			self.assertEqual(setting.doctype, registry.POS_SETTINGS)
			self.assertTrue(registry.shown_on(setting, True))
			self.assertFalse(registry.shown_on(setting, False))

	def test_a_till_starts_with_pictures_and_colours_on(self):
		self.as_user(TILL_MANAGER)
		answer = get_till_settings(self.restaurant_till)

		for key in KEYS:
			self.assertEqual(DEFAULT_POS_SETTINGS[key], 1)
			self.assertEqual(self.stored_settings(self.restaurant_till, key)[key], 1)
			self.assertIn(key, by_key(answer))
			self.assertEqual(answer["values"][key], 1)
			self.assertNotIn(key, by_key(get_till_settings(self.shop_till)))

	def test_a_till_manager_switches_each_off_from_the_till(self):
		for key in KEYS:
			self.as_user(TILL_MANAGER)
			save_till_settings(self.restaurant_till, {key: 0})

			frappe.set_user("Administrator")
			self.assertEqual(self.stored_settings(self.restaurant_till, key)[key], 0)

	def test_a_shop_till_is_refused_them(self):
		for key in KEYS:
			self.as_user(TILL_MANAGER)

			with self.assertRaises(frappe.ValidationError):
				save_till_settings(self.shop_till, {key: 0})

	def test_the_bootstrap_hands_them_to_the_till(self):
		from pos_next.api.bootstrap import _get_pos_settings

		profile = frappe.get_doc("POS Profile", self.restaurant_till)
		for key in KEYS:
			self.assertIn(key, POS_SETTINGS_FIELDS)
			self.assertEqual(_get_pos_settings(profile)[key], 1)

			frappe.db.set_value("POS Settings", {"pos_profile": self.restaurant_till}, key, 0)
			self.assertEqual(_get_pos_settings(profile)[key], 0)
