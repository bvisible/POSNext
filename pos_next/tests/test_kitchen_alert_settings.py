# //// Neoffice — added file (no upstream equivalent).
"""The sound and the popup of the kitchen's and the runner's screens are settings of the till (NeoRestau lot 1, Daniel, 01.11).

Daniel asked that the kitchen is told with a popup and a sound when the next course is ordered, that the sound is in the
till's settings ("Réglages de la caisse") and that it can be chosen from a few. The five settings live on the till's POS
Settings (one row per POS Profile); the kitchen and the runner tablets run on device accounts with no till behind them, so
they get the values the way they already get their restaurant's settings, through `get_restaurant_settings`, resolved from
the POS Settings of the restaurant's till and falling back on the defaults when it has none.

The suite builds its own restaurants and tills and rolls everything back.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant
from pos_next.restaurant import kitchen_alerts
from pos_next.tests.test_restaurant_devices import KITCHEN, RUNNER, Tablets, as_user
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _user

FIELDS = {
	"popup": "kitchen_next_course_popup",
	"popup_seconds": "kitchen_popup_seconds",
	"next_course_sound": "kitchen_next_course_sound",
	"runner_sound": "runner_ready_sound",
	"volume": "kitchen_alert_volume",
}
DEFAULTS = {
	"popup": True,
	"popup_seconds": 30,
	"next_course_sound": "bell",
	"runner_sound": "beep",
	"volume": "medium",
}
TILL = "_PNXT alerts till"
SECOND_TILL = "_PNXT alerts second till"
OTHER_TILL = "_PNXT alerts other restaurant till"
WEBSITE_USER = "kitchen-alerts-website@yopmail.com"


def a_till(profile, restaurant_name, **values):
	"""The POS Settings row of a till of the test's own (its POS Profile is not written, so its link is not checked)."""
	for name in frappe.get_all("POS Settings", filters={"pos_profile": profile}, pluck="name"):
		frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
	doc = frappe.get_doc(
		{"doctype": "POS Settings", "pos_profile": profile, "enabled": 1, "restaurant": restaurant_name, **values}
	)
	doc.flags.ignore_links = True
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc


class TestTheResolvedSettings(FrappeTestCase):
	"""`kitchen_alerts.resolve`: what a row of POS Settings means, defaults included, with nothing to read."""

	def test_no_row_is_the_defaults(self):
		self.assertEqual(kitchen_alerts.resolve(None), DEFAULTS)
		self.assertEqual(kitchen_alerts.resolve({}), DEFAULTS)
		self.assertEqual(kitchen_alerts.resolve({field: None for field in FIELDS.values()}), DEFAULTS)

	def test_a_row_is_read_value_by_value(self):
		row = {
			"kitchen_next_course_popup": 0,
			"kitchen_popup_seconds": 0,
			"kitchen_next_course_sound": "Double beep",
			"runner_ready_sound": "None",
			"kitchen_alert_volume": "High",
		}

		self.assertEqual(
			kitchen_alerts.resolve(row),
			{
				"popup": False,
				"popup_seconds": 0,
				"next_course_sound": "double_beep",
				"runner_sound": "none",
				"volume": "high",
			},
		)

	def test_every_sound_the_doctype_offers_resolves_to_an_id_and_none_to_the_fallback(self):
		options = frappe.get_meta("POS Settings").get_field("kitchen_next_course_sound").options.split("\n")

		self.assertEqual([kitchen_alerts.sound_id(option, "?") for option in options], list(kitchen_alerts.SOUNDS))
		self.assertEqual(kitchen_alerts.sound_id("Whistle", "bell"), "bell")
		self.assertEqual(kitchen_alerts.sound_id(None, "beep"), "beep")

	def test_seconds_are_held_to_zero_to_ten_minutes(self):
		for stored, expected in ((0, 0), (5, 5), (600, 600), (601, 600), (-3, 0), ("45", 45), ("junk", 30)):
			with self.subTest(stored=stored):
				self.assertEqual(
					kitchen_alerts.resolve({"kitchen_popup_seconds": stored})["popup_seconds"], expected
				)

	def test_an_unknown_volume_is_medium(self):
		self.assertEqual(kitchen_alerts.resolve({"kitchen_alert_volume": "Deafening"})["volume"], "medium")


class TestTheFieldsOfPOSSettings(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)

	def test_the_five_settings_exist_with_a_sensible_default_each(self):
		meta = frappe.get_meta("POS Settings")
		expected = {
			"kitchen_next_course_popup": ("Check", "1"),
			"kitchen_popup_seconds": ("Int", "30"),
			"kitchen_next_course_sound": ("Select", "Bell"),
			"runner_ready_sound": ("Select", "Beep"),
			"kitchen_alert_volume": ("Select", "Medium"),
		}
		for fieldname, (fieldtype, default) in expected.items():
			with self.subTest(fieldname=fieldname):
				field = meta.get_field(fieldname)
				self.assertEqual((field.fieldtype, str(field.default)), (fieldtype, default))

	def test_the_choices_are_the_sounds_of_the_engine_and_three_volumes(self):
		meta = frappe.get_meta("POS Settings")
		for name in ("kitchen_next_course_sound", "runner_ready_sound"):
			self.assertEqual(
				meta.get_field(name).options.split("\n"), ["None", "Bell", "Double beep", "Chime", "Gong", "Beep"]
			)
		self.assertEqual(meta.get_field("kitchen_alert_volume").options.split("\n"), ["Low", "Medium", "High"])

	def test_a_new_till_gets_the_defaults(self):
		doc = a_till(TILL, None)
		row = frappe.db.get_value("POS Settings", doc.name, list(FIELDS.values()), as_dict=True)

		self.assertEqual(kitchen_alerts.resolve(row), DEFAULTS)

	def test_the_popup_seconds_are_refused_out_of_range(self):
		for seconds in (-1, 601, 9999):
			with self.subTest(seconds=seconds), self.assertRaises(frappe.ValidationError):
				a_till(TILL, None, kitchen_popup_seconds=seconds)
		for seconds in (0, 1, 30, 600):
			with self.subTest(seconds=seconds):
				a_till(TILL, None, kitchen_popup_seconds=seconds)
				self.assertEqual(
					frappe.db.get_value("POS Settings", {"pos_profile": TILL}, "kitchen_popup_seconds"), seconds
				)


class TestTheSettingsOfARestaurant(Tablets):
	"""`kitchen_alert_settings(restaurant)`: the POS Settings of the restaurant's till, the defaults without one."""

	def test_a_restaurant_with_no_till_has_the_defaults(self):
		self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bistro), DEFAULTS)
		self.assertEqual(kitchen_alerts.kitchen_alert_settings(None), DEFAULTS)
		self.assertEqual(kitchen_alerts.kitchen_alert_settings("_Test Nowhere"), DEFAULTS)

	def test_it_reads_the_till_that_names_the_restaurant(self):
		a_till(
			TILL,
			self.bistro,
			kitchen_next_course_popup=0,
			kitchen_popup_seconds=12,
			kitchen_next_course_sound="Gong",
			runner_ready_sound="Chime",
			kitchen_alert_volume="Low",
		)
		a_till(OTHER_TILL, self.bar, kitchen_next_course_sound="None")

		self.assertEqual(
			kitchen_alerts.kitchen_alert_settings(self.bistro),
			{"popup": False, "popup_seconds": 12, "next_course_sound": "gong", "runner_sound": "chime", "volume": "low"},
		)
		self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bar)["next_course_sound"], "none")

	def test_a_disabled_till_is_no_settings_at_all(self):
		a_till(TILL, self.bistro, enabled=0, kitchen_next_course_sound="Gong")

		self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bistro), DEFAULTS)

	def test_a_restaurant_with_two_tills_follows_the_oldest_unless_a_till_is_named(self):
		a_till(TILL, self.bistro, kitchen_next_course_sound="Gong")
		a_till(SECOND_TILL, self.bistro, kitchen_next_course_sound="Chime")
		frappe.db.set_value("POS Settings", {"pos_profile": TILL}, "creation", "2026-01-01 10:00:00")
		frappe.db.set_value("POS Settings", {"pos_profile": SECOND_TILL}, "creation", "2026-02-01 10:00:00")

		self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bistro)["next_course_sound"], "gong")
		self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bistro, SECOND_TILL)["next_course_sound"], "chime")
		# A till of another restaurant is never the answer for this one
		self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bistro, OTHER_TILL)["next_course_sound"], "gong")

	def test_a_site_not_migrated_yet_has_the_defaults_and_no_error(self):
		a_till(TILL, self.bistro, kitchen_next_course_sound="Gong")
		no_such_column = Exception("(1054, \"Unknown column 'kitchen_next_course_popup' in 'field list'\")")

		with (
			patch.object(frappe.db, "is_missing_column", return_value=True),
			patch.object(frappe, "get_all", side_effect=no_such_column),
			patch.object(frappe.db, "get_value", side_effect=no_such_column),
		):
			self.assertEqual(kitchen_alerts.kitchen_alert_settings(self.bistro, TILL), DEFAULTS)

	def test_any_other_database_error_is_not_swallowed(self):
		with (
			patch.object(frappe.db, "is_missing_column", return_value=False),
			patch.object(frappe.db, "is_table_missing", return_value=False),
			patch.object(frappe, "get_all", side_effect=RuntimeError("boom")),
		):
			with self.assertRaises(RuntimeError):
				kitchen_alerts.kitchen_alert_settings(self.bistro)


class TestWhoReadsTheSettings(Tablets):
	"""The values travel in the answer of `get_restaurant_settings`, the call the tablets already make: nobody reads more than before."""

	def setUp(self):
		super().setUp()
		a_till(TILL, self.bistro, kitchen_next_course_sound="Chime", kitchen_popup_seconds=0)
		a_till(OTHER_TILL, self.bar, kitchen_next_course_sound="Gong")
		_user(WEBSITE_USER, [CASHIER_ROLE], "Website User")
		self.chime = {**DEFAULTS, "next_course_sound": "chime", "popup_seconds": 0}

	def test_the_runner_tablet_reads_them_with_what_it_always_read(self):
		runner = self.tablet(self.bistro, RUNNER)
		with as_user(runner):
			settings = restaurant.get_restaurant_settings()

		self.assertEqual(settings["kitchen_alerts"], self.chime)
		self.assertEqual((settings["restaurant"], settings["enable_runner"]), (self.bistro, True))
		# Nothing else of the restaurant's settings is a tablet's business
		self.assertFalse({"tip_account", "tip_item", "guest_menu", "takeaway_menu"} & set(settings))

	def test_the_kitchen_tablet_reads_them_for_its_own_restaurant_and_nothing_else(self):
		for station in (None, self.grill):
			with self.subTest(station=station):
				kitchen = self.tablet(self.bistro, KITCHEN, station)
				with as_user(kitchen):
					settings = restaurant.get_restaurant_settings()
				self.assertEqual(settings["kitchen_alerts"], self.chime)
				self.assertEqual(settings["restaurant"], self.bistro)
				self.assertFalse({"tip_account", "tip_item", "guest_menu", "takeaway_menu"} & set(settings))

	def test_a_tablet_never_reads_another_restaurants_settings(self):
		kitchen = self.tablet(self.bistro, KITCHEN)
		runner = self.tablet(self.bistro, RUNNER)
		for user in (kitchen, runner):
			with self.subTest(user=user):
				self.assert_refused(
					user, "get_restaurant_settings", restaurant.get_restaurant_settings, restaurant=self.bar
				)

	def test_a_website_user_and_a_visitor_read_nothing(self):
		for user in (WEBSITE_USER, "Guest"):
			with self.subTest(user=user):
				self.assert_refused(user, "get_restaurant_settings", restaurant.get_restaurant_settings)
				self.assert_refused(
					user, "get_restaurant_settings", restaurant.get_restaurant_settings, restaurant=self.bistro
				)

	def test_a_desk_user_reads_them_in_the_full_answer_from_the_till_he_works_at(self):
		with as_user("Administrator"):
			settings = restaurant.get_restaurant_settings(self.bistro)

		self.assertEqual(settings["kitchen_alerts"], self.chime)
		self.assertIn("opening_hours", settings)

	def test_a_desk_user_reads_the_values_of_the_till_whose_shift_he_has_open(self):
		a_till(SECOND_TILL, self.bistro, kitchen_next_course_sound="Gong")
		frappe.db.set_value("POS Settings", {"pos_profile": TILL}, "creation", "2026-01-01 10:00:00")
		frappe.db.set_value("POS Settings", {"pos_profile": SECOND_TILL}, "creation", "2026-02-01 10:00:00")

		with (
			as_user("Administrator"),
			patch("pos_next.api.restaurant.scope.current_profile", return_value=SECOND_TILL),
		):
			settings = restaurant.get_restaurant_settings(self.bistro)

		self.assertEqual(settings["kitchen_alerts"]["next_course_sound"], "gong")
