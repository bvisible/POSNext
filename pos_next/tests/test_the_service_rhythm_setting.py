# //// Neoffice — added file (no upstream equivalent).
"""The service rhythm of a restaurant (NeoRestau lot 1, Daniel, 01.11: « Oui, les deux modes »).

A restaurant chooses, in its settings, how the courses of a meal reach the kitchen:

- `Called by the room` (the default): at « Valider » the drinks and the first food course leave, the later courses are held
  back until the waiter orders them;
- `Prepared ahead`: everything leaves at « Valider », the later courses reach the kitchen marked as ahead, and the waiter's call
  only tells the kitchen to serve them now.

The setting is a Select of the Restaurant doctype, edited in the till's settings (the Restaurant tab, the group « Service »),
read by the till through `get_restaurant_settings`, and by the kitchen's and the runner's tablets through the narrow answer
they get. The suite builds its own restaurants and rolls everything back.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant
from pos_next.restaurant import service_families
from pos_next.tests.test_restaurant_devices import KITCHEN, RUNNER, Tablets, as_user
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants
from pos_next.till_settings import registry

CALLED = "Called by the room"
AHEAD = "Prepared ahead"


class TestTheSettingOfTheRestaurant(TwoRestaurants, FrappeTestCase):
	def test_the_restaurant_has_a_select_with_the_two_rhythms_and_the_room_as_default(self):
		field = frappe.get_meta("Restaurant").get_field("service_rhythm")

		self.assertEqual(field.fieldtype, "Select")
		self.assertEqual((field.options or "").split("\n"), [CALLED, AHEAD])
		self.assertEqual(field.default, CALLED)

	def test_a_restaurant_that_never_chose_is_called_by_the_room(self):
		self.assertEqual(frappe.db.get_value("Restaurant", self.a, "service_rhythm"), CALLED)
		self.assertEqual(restaurant.get_restaurant_settings(self.a)["service_rhythm"], CALLED)

	def test_the_till_reads_the_rhythm_of_the_restaurant_it_asks_for(self):
		frappe.db.set_value("Restaurant", self.a, "service_rhythm", AHEAD)
		frappe.clear_document_cache("Restaurant", self.a)

		self.assertEqual(restaurant.get_restaurant_settings(self.a)["service_rhythm"], AHEAD)
		self.assertEqual(restaurant.get_restaurant_settings(self.b)["service_rhythm"], CALLED)

	def test_the_settings_save_takes_it_and_refuses_anything_else(self):
		restaurant.save_restaurant_settings({"service_rhythm": AHEAD}, restaurant=self.a)
		self.assertEqual(frappe.db.get_value("Restaurant", self.a, "service_rhythm"), AHEAD)

		with self.assertRaises(frappe.ValidationError):
			restaurant.save_restaurant_settings({"service_rhythm": "Whenever"}, restaurant=self.a)
		self.assertEqual(frappe.db.get_value("Restaurant", self.a, "service_rhythm"), AHEAD)


class TestTheRhythmTheServerFollows(TwoRestaurants, FrappeTestCase):
	"""`rhythm_of_table`: the rhythm of the restaurant a table belongs to, never the till's or the site's."""

	def test_a_table_follows_the_rhythm_of_its_own_restaurant(self):
		frappe.db.set_value("Restaurant", self.a, "service_rhythm", AHEAD)

		self.assertEqual(service_families.rhythm_of_table(self.table_a), AHEAD)
		self.assertEqual(service_families.rhythm_of_table(self.table_b), CALLED)

	def test_no_table_and_a_table_nobody_knows_are_called_by_the_room(self):
		frappe.db.set_value("Restaurant", self.a, "service_rhythm", AHEAD)

		self.assertEqual(service_families.rhythm_of_table(None), CALLED)
		self.assertEqual(service_families.rhythm_of_table(""), CALLED)
		self.assertEqual(service_families.rhythm_of_table("_Test no such table"), CALLED)

	def test_any_other_word_is_the_room(self):
		self.assertEqual(service_families.normalise_rhythm(AHEAD), AHEAD)
		for other in (None, "", CALLED, "prepared ahead", "Ahead", "x"):
			with self.subTest(value=other):
				self.assertEqual(service_families.normalise_rhythm(other), CALLED)


class TestTheSettingInTheTillsSettingsScreen(FrappeTestCase):
	def test_it_is_listed_in_the_restaurant_tab_group_service_for_a_restaurant_till(self):
		setting = registry.get("service_rhythm")

		self.assertEqual(setting.doctype, registry.RESTAURANT)
		self.assertEqual(setting.group, "service")
		self.assertEqual(setting.tab, "restaurant")
		self.assertEqual(setting.till, registry.RESTAURANT_TILL)
		self.assertEqual(setting.widget, "select")
		self.assertEqual(setting.applies, registry.APPLIES_RESTAURANT)
		self.assertEqual([value for value, _label in setting.options], [CALLED, AHEAD])
		self.assertTrue(str(setting.help))

	def test_the_managers_of_a_restaurant_do_not_get_it_with_the_three_of_the_till(self):
		"""Ruling 63 names three settings of the till; a setting of the Restaurant doctype is the restaurant managers' by its place."""
		self.assertFalse(registry.get("service_rhythm").restaurant_manager_may_edit)


class TestWhatTheTabletsRead(Tablets):
	"""The tablets get the rhythm in the narrow answer they already get, for their own restaurant."""

	def test_the_kitchen_and_the_runner_read_the_rhythm_of_their_restaurant(self):
		frappe.db.set_value("Restaurant", self.bistro, "service_rhythm", AHEAD)
		for screen in (KITCHEN, RUNNER):
			with self.subTest(screen=screen):
				tablet = self.tablet(self.bistro, screen)
				with as_user(tablet):
					settings = restaurant.get_restaurant_settings()
				self.assertEqual(settings["service_rhythm"], AHEAD)
				self.assertEqual(settings["restaurant"], self.bistro)
				# Nothing else of the restaurant's settings is a tablet's business
				self.assertFalse({"tip_account", "tip_item", "guest_menu", "takeaway_menu"} & set(settings))

	def test_a_restaurant_that_never_chose_reads_as_the_room_on_a_tablet(self):
		tablet = self.tablet(self.bar, KITCHEN)
		with as_user(tablet):
			settings = restaurant.get_restaurant_settings()

		self.assertEqual(settings["service_rhythm"], CALLED)
