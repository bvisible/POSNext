# //// Neoffice — added file (no upstream equivalent).
"""The hour a restaurant's business day begins (NeoResto lot 1, Daniel, 05.11.2026).

It is a Time field of the Restaurant that only decides when the ticket numbers start again at 1 (`restaurant.tickets`): the
end-of-day report follows each shift, from its opening to its closing. It had no place in the till's settings screen (no
widget for a time of day); it is now a line of the Restaurant tab, group « Service », beside the choice it belongs to.
The suite rolls everything back.
"""

from datetime import date, datetime, time

import frappe
from frappe.utils import get_time

from pos_next.restaurant import tickets
from pos_next.tests.test_till_settings import TILL_MANAGER, TillSettingsCase
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings


class TestTheBusinessDayStartSetting(TillSettingsCase):
	def stored(self):
		frappe.clear_document_cache("Restaurant", self.restaurant)
		return get_time(frappe.db.get_value("Restaurant", self.restaurant, "business_day_start"))

	def test_it_is_a_time_of_the_restaurant_beside_the_numbering_it_belongs_to(self):
		setting = registry.get("business_day_start")

		self.assertEqual(frappe.get_meta("Restaurant").get_field("business_day_start").fieldtype, "Time")
		self.assertEqual(setting.widget, "time")
		self.assertEqual(setting.doctype, registry.RESTAURANT)
		# The group of the ticket numbers (the restaurant tab's third column), beside the reset it belongs to
		self.assertEqual(setting.group, "tickets")
		self.assertEqual(setting.tab, "restaurant")
		self.assertEqual(setting.till, registry.RESTAURANT_TILL)
		self.assertEqual(setting.applies, registry.APPLIES_RESTAURANT)
		self.assertEqual(setting.depends_on, (registry.equals("ticket_number_reset", "Business day"),))
		self.assertTrue(str(setting.label) and str(setting.help))

	def test_it_is_no_longer_set_aside_from_the_screen(self):
		self.assertNotIn("business_day_start", registry.NOT_LISTED[registry.RESTAURANT])

	def test_the_screen_reads_it_as_hours_and_minutes(self):
		frappe.db.set_value("Restaurant", self.restaurant, "business_day_start", "05:00:00")
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.restaurant_till)

		self.assertEqual(answer["values"]["business_day_start"], "05:00")
		self.assertIn("business_day_start", {setting["key"] for setting in answer["settings"]})

	def test_a_saved_hour_is_the_one_the_ticket_counter_follows(self):
		self.as_user(TILL_MANAGER)

		save_till_settings(self.restaurant_till, {"business_day_start": "03:30"})

		self.assertEqual(self.stored(), time(3, 30))
		self.assertEqual(tickets.ticket_settings(self.restaurant).day_start, time(3, 30))
		self.assertEqual(
			get_till_settings(self.restaurant_till)["values"]["business_day_start"], "03:30"
		)
		day_start = tickets.ticket_settings(self.restaurant).day_start
		self.assertEqual(tickets.business_day_of(datetime(2026, 11, 5, 3, 29), day_start), date(2026, 11, 4))
		self.assertEqual(tickets.business_day_of(datetime(2026, 11, 5, 3, 30), day_start), date(2026, 11, 5))

	def test_midnight_is_an_hour_like_any_other(self):
		self.as_user(TILL_MANAGER)

		save_till_settings(self.restaurant_till, {"business_day_start": "00:00"})

		self.assertEqual(self.stored(), time(0, 0))
		self.assertEqual(get_till_settings(self.restaurant_till)["values"]["business_day_start"], "00:00")

	def test_anything_that_is_not_a_time_of_day_is_refused_and_nothing_is_stored(self):
		frappe.db.set_value("Restaurant", self.restaurant, "business_day_start", "05:00:00")
		self.as_user(TILL_MANAGER)

		for bad in ("24:00", "25:00", "7:00", "12:60", "abc", "", "05:00:00", 5, ["05:00"]):
			with self.subTest(value=bad), self.assertRaises(frappe.ValidationError):
				save_till_settings(self.restaurant_till, {"business_day_start": bad})

		self.assertEqual(self.stored(), time(5, 0))
