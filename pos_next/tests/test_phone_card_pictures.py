# //// Neoffice — added file (no upstream equivalent).
"""A phone shows the restaurant card as buttons without pictures unless the till asks for them (NeoResto lot 1, task 27).

The setting is POS Settings.phone_card_pictures: off by default, set from the till's own settings screen (the Sale
screen tab of a restaurant till; a shop till has no card and is refused it), and handed to the till by its bootstrap
and by its settings read. The suite builds what it needs through the till settings' own case (two tills, a
restaurant, the users) and rolls everything back.
"""

import frappe

from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS
from pos_next.tests.test_till_settings import TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "phone_card_pictures"


class TestPicturesOnAPhone(TillSettingsCase):
	def test_the_list_offers_it_on_the_sale_screen_of_a_restaurant_till_only(self):
		setting = registry.get(KEY)

		self.assertEqual(setting.tab, "sale_screen")
		self.assertEqual(setting.widget, "check")
		self.assertEqual(setting.doctype, registry.POS_SETTINGS)
		self.assertTrue(registry.shown_on(setting, True))
		self.assertFalse(registry.shown_on(setting, False))

	def test_a_till_starts_without_pictures(self):
		self.assertEqual(self.stored_settings(self.restaurant_till, KEY)[KEY], 0)
		self.assertEqual(DEFAULT_POS_SETTINGS[KEY], 0)

		self.as_user(TILL_MANAGER)
		answer = get_till_settings(self.restaurant_till)
		self.assertIn(KEY, by_key(answer))
		self.assertEqual(answer["values"][KEY], 0)
		self.assertNotIn(KEY, by_key(get_till_settings(self.shop_till)))

	def test_a_till_manager_switches_them_on_from_the_till(self):
		self.as_user(TILL_MANAGER)
		save_till_settings(self.restaurant_till, {KEY: 1})

		frappe.set_user("Administrator")
		self.assertEqual(self.stored_settings(self.restaurant_till, KEY)[KEY], 1)

	def test_a_shop_till_is_refused_them(self):
		self.as_user(TILL_MANAGER)

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.shop_till, {KEY: 1})

	def test_the_bootstrap_hands_them_to_the_till(self):
		from pos_next.api.bootstrap import _get_pos_settings

		self.assertIn(KEY, POS_SETTINGS_FIELDS)
		profile = frappe.get_doc("POS Profile", self.restaurant_till)
		self.assertEqual(_get_pos_settings(profile)[KEY], 0)

		frappe.db.set_value("POS Settings", {"pos_profile": self.restaurant_till}, KEY, 1)
		self.assertEqual(_get_pos_settings(profile)[KEY], 1)
