# //// Neoffice — added file (no upstream equivalent).
"""The popup and the sound of the till itself when a guest orders or pays from the QR code of a table are settings of the till (NeoResto lot 1, Daniel, 01.11).

Daniel asked how the sommelier's till is told that a guest ordered a drink from the QR code of a table: a notice at the top of the till and a sound, set in the till's
own settings beside the kitchen's alerts. The three settings live on the till's POS Settings (one row per POS Profile) and the till reads them with the rest of its
settings (`get_pos_settings`, the bootstrap); the volume is the one the kitchen alerts already have (`kitchen_alert_volume`). They are settings of the TILL: a
restaurant manager, who sets three till settings only (ruling 63), does not see them. The suite builds its two tills through the till settings' own case and rolls back.
"""

import frappe

from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS
from pos_next.tests.test_till_settings import (
	RESTAURANT_MANAGER,
	TILL_MANAGER,
	TillSettingsCase,
	by_key,
)
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEYS = ("floor_guest_popup", "floor_popup_seconds", "floor_guest_sound")


class TestTheFieldsOfPOSSettings(TillSettingsCase):
	def test_the_three_settings_exist_with_a_sensible_default_each(self):
		meta = frappe.get_meta("POS Settings")
		expected = {
			"floor_guest_popup": ("Check", "1"),
			"floor_popup_seconds": ("Int", "30"),
			"floor_guest_sound": ("Select", "Chime"),
		}
		for fieldname, (fieldtype, default) in expected.items():
			with self.subTest(fieldname=fieldname):
				field = meta.get_field(fieldname)
				self.assertEqual((field.fieldtype, str(field.default)), (fieldtype, default))

	def test_the_sound_is_one_of_the_six_of_the_engine(self):
		meta = frappe.get_meta("POS Settings")
		self.assertEqual(
			meta.get_field("floor_guest_sound").options.split("\n"),
			["None", "Bell", "Double beep", "Chime", "Gong", "Beep"],
		)
		self.assertEqual(
			meta.get_field("floor_guest_sound").options, meta.get_field("kitchen_next_course_sound").options
		)

	def test_a_new_till_gets_the_defaults(self):
		stored = frappe.db.get_value(
			"POS Settings", {"pos_profile": self.restaurant_till}, list(KEYS), as_dict=True
		)

		self.assertEqual(
			(stored.floor_guest_popup, stored.floor_popup_seconds, stored.floor_guest_sound), (1, 30, "Chime")
		)

	def test_the_seconds_are_refused_out_of_range(self):
		for seconds in (-1, 601, 9999):
			with self.subTest(seconds=seconds), self.assertRaises(frappe.ValidationError):
				self.restaurant_settings_doc(floor_popup_seconds=seconds).save()
		for seconds in (0, 1, 30, 600):
			with self.subTest(seconds=seconds):
				self.restaurant_settings_doc(floor_popup_seconds=seconds).save()
				self.assertEqual(
					self.stored_settings(self.restaurant_till, "floor_popup_seconds")["floor_popup_seconds"],
					seconds,
				)

	def restaurant_settings_doc(self, **values):
		doc = frappe.get_doc("POS Settings", {"pos_profile": self.restaurant_till})
		doc.update(values)
		doc.flags.ignore_permissions = True
		return doc


class TestTheTillReadsThem(TillSettingsCase):
	def test_the_bootstrap_whitelist_carries_them_and_the_volume_they_ring_at(self):
		for key in (*KEYS, "kitchen_alert_volume"):
			with self.subTest(key=key):
				self.assertIn(key, POS_SETTINGS_FIELDS)
				self.assertIn(key, DEFAULT_POS_SETTINGS)

	def test_the_defaults_a_till_falls_back_on_are_the_doctypes(self):
		self.assertEqual(
			(
				DEFAULT_POS_SETTINGS["floor_guest_popup"],
				DEFAULT_POS_SETTINGS["floor_popup_seconds"],
				DEFAULT_POS_SETTINGS["floor_guest_sound"],
				DEFAULT_POS_SETTINGS["kitchen_alert_volume"],
			),
			(1, 30, "Chime", "Medium"),
		)

	def test_the_bootstrap_hands_them_to_the_till(self):
		from pos_next.api.bootstrap import _get_pos_settings

		profile = frappe.get_doc("POS Profile", self.restaurant_till)
		frappe.db.set_value(
			"POS Settings",
			{"pos_profile": self.restaurant_till},
			{
				"floor_guest_popup": 0,
				"floor_popup_seconds": 0,
				"floor_guest_sound": "Gong",
				"kitchen_alert_volume": "High",
			},
		)

		settings = _get_pos_settings(profile)

		self.assertEqual(
			(
				settings["floor_guest_popup"],
				settings["floor_popup_seconds"],
				settings["floor_guest_sound"],
				settings["kitchen_alert_volume"],
			),
			(0, 0, "Gong", "High"),
		)

	def test_the_settings_read_of_the_till_hands_them_too(self):
		from pos_next.api.pos_profile import get_pos_settings

		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.restaurant_till}, "floor_guest_sound", "Bell"
		)
		self.as_user(TILL_MANAGER)

		self.assertEqual(get_pos_settings(self.restaurant_till)["floor_guest_sound"], "Bell")


class TestTheSettingsScreen(TillSettingsCase):
	def test_they_are_a_group_of_the_general_tab_beside_the_kitchen_alerts(self):
		group = registry.GROUPS["floor_alerts"]
		self.assertEqual((group.tab, group.column), ("general", registry.GROUPS["kitchen_alerts"].column))
		for key in (*KEYS, "floor_alert_listen"):
			with self.subTest(key=key):
				setting = registry.get(key)
				self.assertEqual(setting.group, "floor_alerts")
				self.assertTrue(registry.shown_on(setting, True))
				self.assertFalse(registry.shown_on(setting, False))

	def test_the_range_and_the_choices_are_the_kitchens(self):
		seconds = registry.get("floor_popup_seconds")
		self.assertEqual((seconds.widget, seconds.min, seconds.max), ("int", 0, 600))
		self.assertEqual(
			[value for value, _label in registry.get("floor_guest_sound").options][:2], ["None", "Bell"]
		)
		self.assertEqual(
			registry.get("floor_guest_sound").options, registry.get("kitchen_next_course_sound").options
		)
		self.assertEqual(
			[s.key for s in registry.SETTINGS if s.depends_on and s.group == "floor_alerts"],
			["floor_popup_seconds"],
		)

	def test_they_are_settings_of_the_till_that_no_restaurant_manager_sets(self):
		for key in KEYS:
			with self.subTest(key=key):
				self.assertFalse(registry.get(key).restaurant_manager_may_edit)

		self.as_user(RESTAURANT_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			save_till_settings(self.restaurant_till, {"floor_guest_sound": "Gong"})

	def test_a_restaurant_till_is_served_them_with_their_values(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.restaurant_till)

		self.assertTrue(set(KEYS) <= set(by_key(answer)))
		self.assertEqual(
			(
				answer["values"]["floor_guest_popup"],
				answer["values"]["floor_popup_seconds"],
				answer["values"]["floor_guest_sound"],
			),
			(1, 30, "Chime"),
		)

	def test_a_shop_till_is_not_served_them_and_is_refused_them(self):
		self.as_user(TILL_MANAGER)

		self.assertFalse(set(KEYS) & set(by_key(get_till_settings(self.shop_till))))
		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.shop_till, {"floor_guest_sound": "Gong"})

	def test_a_till_manager_changes_them_from_the_till(self):
		self.as_user(TILL_MANAGER)

		save_till_settings(
			self.restaurant_till,
			{"floor_guest_popup": 0, "floor_popup_seconds": 12, "floor_guest_sound": "Double beep"},
		)

		frappe.set_user("Administrator")
		stored = self.stored_settings(self.restaurant_till, *KEYS)
		self.assertEqual(
			(stored.floor_guest_popup, stored.floor_popup_seconds, stored.floor_guest_sound),
			(0, 12, "Double beep"),
		)

	def test_a_sound_that_is_not_offered_is_refused(self):
		self.as_user(TILL_MANAGER)

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.restaurant_till, {"floor_guest_sound": "Whistle"})

	def test_the_seconds_are_held_to_the_range_by_the_screens_save_too(self):
		self.as_user(TILL_MANAGER)

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.restaurant_till, {"floor_popup_seconds": 601})
