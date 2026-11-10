# //// Neoffice — added file (no upstream equivalent).
"""The online takeaway takes a new order in the hours its restaurant says (neoffice-maintenance#2484, product owner 10.11.2026).

Nothing closed the /pos/order page: with a takeaway card, or the guest card as a fallback, it took orders day and night, the
opening hours only choosing which card it showed. A restaurant now chooses when the page takes a new order (`takeaway_hours`):

- « Always », the default: as before;
- « By the opening hours »: the rows of its opening hours, those of its takeaway card when the card has some, else all;
- « Fixed hours »: from `takeaway_open_from` to `takeaway_open_to`, on the days of `takeaway_days` (none: every day);

with `takeaway_first_order_after` minutes after each opening and `takeaway_last_order_before` minutes before each closing
in which no new order is taken. A period that ends before it starts runs past midnight and is read on its own weekday, as
the opening hours always are. Outside the hours no new session is started, a session kept by the page with no order yet is
refused (the page then asks for a new one and says when orders open again), and no new order is taken. An order already
sent is still read and paid, whatever the time.

The rule is read on a clock the test sets (`takeaway_hours.now_datetime`). The endpoints are called as the guest page calls
them, as `Guest`; the settings are saved at the till by its manager. Nothing is committed.
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import frappe

from pos_next.api import guest_ordering
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import takeaway_hours
from pos_next.tests.test_a_takeaway_order_goes_to_the_end import TakeawayCase
from pos_next.tests.test_guest_account import an_address
from pos_next.tests.test_till_settings import TILL_MANAGER, TillSettingsCase
from pos_next.till_settings.api import get_till_settings, save_till_settings

# A Tuesday, a Friday and a Monday of November 2026
TUESDAY = datetime(2026, 11, 10)
FRIDAY = datetime(2026, 11, 13)


def at(day, hour, minute=0):
	return day.replace(hour=hour, minute=minute)


def fixed(start, end, *days, first=0, last=0):
	return frappe._dict(
		takeaway_hours="Fixed Hours",
		takeaway_open_from=start,
		takeaway_open_to=end,
		takeaway_days=[{"day_of_week": day} for day in days],
		takeaway_first_order_after=first,
		takeaway_last_order_before=last,
	)


def by_the_hours(rows, card=None, first=0, last=0):
	return frappe._dict(
		takeaway_hours="Opening Hours",
		takeaway_menu=card,
		opening_hours=[
			{"day_of_week": day, "from_time": start, "to_time": end, "restaurant_card": row_card}
			for day, start, end, row_card in rows
		],
		takeaway_first_order_after=first,
		takeaway_last_order_before=last,
	)


class TestTheRule(unittest.TestCase):
	def takes(self, settings, moment):
		return takeaway_hours.takes_orders(settings, moment)

	def test_always_is_the_default_and_takes_orders_day_and_night(self):
		for settings in (
			frappe._dict(),
			frappe._dict(takeaway_hours="Always"),
			frappe._dict(takeaway_hours="Nonsense"),
		):
			for hour in (0, 3, 12, 23):
				self.assertTrue(self.takes(settings, at(TUESDAY, hour)))
			self.assertIsNone(takeaway_hours.next_opening(settings, at(TUESDAY, 3)))

	def test_fixed_hours_take_orders_from_their_start_to_their_end(self):
		settings = fixed("11:00:00", "14:00:00")

		self.assertFalse(self.takes(settings, at(TUESDAY, 10, 59)))
		self.assertTrue(self.takes(settings, at(TUESDAY, 11)))
		self.assertTrue(self.takes(settings, at(TUESDAY, 14)))
		self.assertFalse(self.takes(settings, at(TUESDAY, 14, 1)))

	def test_fixed_hours_take_orders_on_their_days_only(self):
		settings = fixed("11:00:00", "14:00:00", "Monday", "Friday")

		self.assertFalse(self.takes(settings, at(TUESDAY, 12)))
		self.assertTrue(self.takes(settings, at(FRIDAY, 12)))

	def test_fixed_hours_without_a_start_or_an_end_take_no_order(self):
		self.assertFalse(self.takes(fixed(None, "14:00:00"), at(TUESDAY, 12)))
		self.assertFalse(self.takes(fixed("11:00:00", ""), at(TUESDAY, 12)))

	def test_a_period_past_midnight_is_read_on_its_own_weekday(self):
		settings = fixed("18:00:00", "02:00:00", "Friday")

		self.assertTrue(self.takes(settings, at(FRIDAY, 23)))
		self.assertTrue(self.takes(settings, at(FRIDAY, 1, 30)))
		self.assertFalse(self.takes(settings, at(FRIDAY, 3)))
		self.assertFalse(self.takes(settings, at(TUESDAY, 23)))

	def test_the_margins_keep_the_first_and_the_last_minutes_free_of_orders(self):
		settings = fixed("11:00:00", "14:00:00", first=15, last=30)

		self.assertFalse(self.takes(settings, at(TUESDAY, 11, 14)))
		self.assertTrue(self.takes(settings, at(TUESDAY, 11, 15)))
		self.assertTrue(self.takes(settings, at(TUESDAY, 13, 30)))
		self.assertFalse(self.takes(settings, at(TUESDAY, 13, 31)))

	def test_margins_wider_than_the_period_leave_it_closed(self):
		self.assertFalse(self.takes(fixed("11:00:00", "12:00:00", first=40, last=30), at(TUESDAY, 11, 45)))

	def test_by_the_opening_hours_the_takeaway_cards_own_rows_count_when_it_has_some(self):
		rows = [("Tuesday", "11:30:00", "14:00:00", "Lunch"), ("Tuesday", "18:00:00", "22:00:00", "Dinner")]

		with_its_rows = by_the_hours(rows, card="Dinner")
		self.assertFalse(self.takes(with_its_rows, at(TUESDAY, 12)))
		self.assertTrue(self.takes(with_its_rows, at(TUESDAY, 19)))

		without_rows = by_the_hours(rows, card="Takeaway only")
		self.assertTrue(self.takes(without_rows, at(TUESDAY, 12)))
		self.assertTrue(self.takes(without_rows, at(TUESDAY, 19)))
		self.assertFalse(self.takes(without_rows, at(TUESDAY, 16)))

	def test_by_the_opening_hours_a_restaurant_without_hours_takes_no_order(self):
		settings = by_the_hours([])

		self.assertFalse(self.takes(settings, at(TUESDAY, 12)))
		self.assertIsNone(takeaway_hours.next_opening(settings, at(TUESDAY, 12)))
		self.assertEqual(
			takeaway_hours.closed_message(settings, at(TUESDAY, 12)),
			"Online takeaway orders are closed right now.",
		)

	def test_a_row_from_midnight_counts(self):
		# A Time of 00:00 comes back from the database as a zero timedelta, which reads as false
		settings = by_the_hours([("Tuesday", timedelta(0), timedelta(hours=2), None)])

		self.assertTrue(self.takes(settings, at(TUESDAY, 1)))
		self.assertFalse(self.takes(settings, at(TUESDAY, 12)))

	def test_a_row_without_an_end_is_left_out(self):
		self.assertFalse(self.takes(by_the_hours([("Tuesday", "11:00:00", None, None)]), at(TUESDAY, 12)))

	def test_the_page_is_told_when_orders_open_again(self):
		settings = fixed("11:00:00", "14:00:00", "Tuesday", "Friday", first=15)

		self.assertEqual(
			takeaway_hours.closed_message(settings, at(TUESDAY, 9)),
			"Online takeaway orders are closed right now. They open again today at 11:15.",
		)
		self.assertEqual(
			takeaway_hours.closed_message(settings, at(TUESDAY, 15)),
			"Online takeaway orders are closed right now. They open again on Friday at 11:15.",
		)
		every_day = fixed("11:00:00", "14:00:00")
		self.assertEqual(
			takeaway_hours.closed_message(every_day, at(TUESDAY, 15)),
			"Online takeaway orders are closed right now. They open again tomorrow at 11:00.",
		)


class TakeawayHoursCase(TakeawayCase):
	"""The restaurant of the takeaway page, on a clock the test sets."""

	def setUp(self):
		super().setUp()
		self.clock = at(TUESDAY, 12)
		clock = patch.object(takeaway_hours, "now_datetime", side_effect=lambda: self.clock)
		clock.start()
		self.addCleanup(clock.stop)

	def keep_hours(self, start, end, **values):
		frappe.db.set_value(
			"Restaurant",
			self.a,
			{"takeaway_hours": "Fixed Hours", "takeaway_open_from": start, "takeaway_open_to": end, **values},
		)
		frappe.clear_document_cache("Restaurant")

	def refusal(self, method, *args):
		with self.assertRaises(frappe.ValidationError) as refused:
			self.as_guest(method, *args)
		return str(refused.exception)


class TestThePageOutsideTheHours(TakeawayHoursCase):
	def test_in_the_hours_a_session_is_started(self):
		self.keep_hours("11:00:00", "14:00:00")

		self.assertTrue(self.as_guest(guest_ordering.create_takeaway_token)["token"])

	def test_outside_the_hours_no_session_is_started_and_the_page_is_told_when_orders_open_again(self):
		self.keep_hours("11:00:00", "14:00:00")
		self.clock = at(TUESDAY, 16)
		before = frappe.db.count("Guest Order Token", {"mode": "takeaway"})

		message = self.refusal(guest_ordering.create_takeaway_token)

		self.assertEqual(
			message, "Online takeaway orders are closed right now. They open again tomorrow at 11:00."
		)
		self.assertEqual(frappe.db.count("Guest Order Token", {"mode": "takeaway"}), before)

	def test_in_the_last_minutes_before_the_closing_no_session_is_started(self):
		self.keep_hours("11:00:00", "14:00:00", takeaway_last_order_before=30)
		self.clock = at(TUESDAY, 13, 45)

		self.refusal(guest_ordering.create_takeaway_token)

	def test_a_session_kept_by_the_page_with_no_order_yet_is_refused_outside_the_hours(self):
		self.keep_hours("11:00:00", "14:00:00")
		self.clock = at(TUESDAY, 16)

		self.refusal(guest_ordering.validate_token, self.token.token)

	def test_no_new_order_is_taken_outside_the_hours(self):
		self.keep_hours("11:00:00", "14:00:00")
		self.register(an_address())
		self.clock = at(TUESDAY, 16)

		with self.assertRaises(frappe.ValidationError):
			self.order((self.cola, 1))

		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "invoice"))

	def test_an_order_sent_before_the_closing_is_still_read_and_paid_after_it(self):
		self.keep_hours("11:00:00", "14:00:00")
		invoice = self.an_order()
		self.clock = at(TUESDAY, 16)

		self.assertTrue(self.as_guest(guest_ordering.validate_token, self.token.token)["valid"])
		self.the_provider_confirms(invoice)
		answer = self.confirm(frappe.db.get_value("Sales Invoice", invoice, "grand_total"))

		self.assertEqual(answer["status"], "success")
		self.assertTrue(answer["submitted"])
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)

	def test_always_takes_orders_at_any_hour(self):
		frappe.db.set_value("Restaurant", self.a, "takeaway_hours", "Always")
		frappe.clear_document_cache("Restaurant")
		self.clock = at(TUESDAY, 3)

		self.assertTrue(self.as_guest(guest_ordering.create_takeaway_token)["token"])


class TestTheRestaurantKeepsItsHours(TillSettingsCase):
	"""What the restaurant's manager sets at the till: the rule, the hours, the days, the margins."""

	def save(self, values):
		self.as_user(TILL_MANAGER)
		try:
			return save_till_settings(self.restaurant_till, values)
		finally:
			frappe.set_user("Administrator")

	def test_a_new_restaurant_names_no_fixed_hours(self):
		# Frappe gives a new document the current time in every Time field it was not given
		with patch.object(Restaurant, "_ensure_tip_account"), patch.object(Restaurant, "_ensure_tip_item"):
			made = frappe.get_doc(
				{
					"doctype": "Restaurant",
					"restaurant_name": "_Test Takeaway Hours New",
					"company": self.fx.company,
				}
			).insert(ignore_permissions=True)

		self.assertIsNone(made.takeaway_open_from)
		self.assertIsNone(made.takeaway_open_to)
		self.assertEqual(made.takeaway_hours, "Always")

	def test_the_manager_sets_fixed_hours_and_the_days_are_kept_in_the_order_of_the_week(self):
		self.save(
			{
				"enable_web_takeaway": 1,
				"takeaway_hours": "Fixed Hours",
				"takeaway_open_from": "11:00",
				"takeaway_open_to": "21:30",
				"takeaway_days": ["Saturday", "Tuesday", "Friday"],
				"takeaway_last_order_before": 20,
			}
		)

		restaurant = frappe.get_doc("Restaurant", self.restaurant)
		self.assertEqual(restaurant.takeaway_hours, "Fixed Hours")
		self.assertEqual(
			[row.day_of_week for row in restaurant.takeaway_days], ["Tuesday", "Friday", "Saturday"]
		)
		self.assertEqual(restaurant.takeaway_last_order_before, 20)
		self.as_user(TILL_MANAGER)
		read = get_till_settings(self.restaurant_till)["values"]
		self.assertEqual(read["takeaway_days"], ["Tuesday", "Friday", "Saturday"])
		self.assertEqual(read["takeaway_open_to"], "21:30")

	def test_fixed_hours_without_an_end_are_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.save(
				{"enable_web_takeaway": 1, "takeaway_hours": "Fixed Hours", "takeaway_open_from": "11:00"}
			)

		self.assertNotEqual(
			frappe.db.get_value("Restaurant", self.restaurant, "takeaway_hours"), "Fixed Hours"
		)

	def test_a_day_that_is_not_one_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.save({"takeaway_days": ["Someday"]})
