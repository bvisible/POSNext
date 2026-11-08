# //// Neoffice — added file (no upstream equivalent).
"""« Guests left? », the question of a table that waits to be cleaned (product owner, 08.11.2026).

« Le nettoyage arrive tout seul à la dernière livraison, que les clients soient partis ou non. Une pastille Partis ? » A table goes to Cleaning by itself, when its bill is
paid with nothing left to serve or when the last dish is delivered; the system cannot tell whether the guests are still at the digestif. Cleaning keeps its meaning (nobody
is seated there); the floor adds the question once the table has waited for the restaurant's minutes.

The suite pins:

- the rule (`pos_next.restaurant.guests_left`): marked only a table in Cleaning, after the minutes, never for a table of direct service, never when the minutes are 0;
- the floor (`get_tables`): every table carries `guests_left_ask` and `cleaning_minutes`, and the last write of a table (`modified`) is no part of the answer;
- the waiter's answer « not left yet » (`keep_table_for_guests`): the table stays in Cleaning and the wait starts again; refused for a table that is not in Cleaning
  and for whoever has no right on the floor's tables;
- the setting: a whole number of minutes from 0, 30 unless the restaurant says otherwise, and it reaches the till.

The suite builds its own restaurants, tills, menu and orders (those of the notes suite) and rolls everything back. The people it acts as are the waiter (the cashier
of the till) and a visitor with no account: never Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

import frappe
from frappe.tests.roles import as_role
from frappe.utils import add_to_date, now_datetime

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import direct_service, guests_left
from pos_next.tests.test_a_paid_table_stays_while_dishes_are_to_serve import ServedCase


class GuestsLeftCase(ServedCase):
	def waiting_for(self, minutes, table=None, status="Cleaning"):
		"""The table as if it had been in `status` since `minutes` ago (its last write)."""
		table = table or self.table_a
		frappe.db.set_value("Restaurant Table", table, "status", status, update_modified=False)
		frappe.db.set_value(
			"Restaurant Table",
			table,
			"modified",
			add_to_date(now_datetime(), minutes=-minutes),
			update_modified=False,
		)

	def question(self, minutes):
		frappe.db.set_value("Restaurant", self.a, guests_left.FIELD, minutes)
		frappe.clear_document_cache("Restaurant", self.a)

	def tile(self, table=None):
		return self.floor()[table or self.table_a]


class TestTheRule(GuestsLeftCase):
	def test_only_a_table_in_cleaning_for_the_minutes_is_marked(self):
		for minutes, status, waited, expected in (
			(30, "Cleaning", 30, True),
			(30, "Cleaning", 29, False),
			(30, "Cleaning", 600, True),
			(30, "Empty", 600, False),
			(30, "Occupied", 600, False),
			(30, "Paid", 600, False),
			(30, "Reserved", 600, False),
			(0, "Cleaning", 600, False),
			(None, "Cleaning", 600, False),
		):
			with self.subTest(minutes=minutes, status=status, waited=waited):
				self.assertIs(guests_left.ask_if_left(minutes, status, waited), expected)

	def test_a_table_of_direct_service_is_never_asked_after(self):
		self.assertFalse(guests_left.ask_if_left(30, "Cleaning", 600, direct=True))

	def test_thirty_minutes_unless_the_restaurant_says_otherwise(self):
		# The column is an Int that is never null: a restaurant that never touched the setting carries the doctype's default
		self.assertEqual(guests_left.DEFAULT_MINUTES, 30)
		self.assertEqual(guests_left.reminder_minutes(self.a), 30)
		# No restaurant at all: no question
		self.assertEqual(guests_left.reminder_minutes(None), 0)
		self.assertEqual(guests_left.reminder_minutes(""), 0)

	def test_the_setting_is_a_whole_number_of_minutes_from_zero(self):
		field = frappe.get_meta("Restaurant").get_field(guests_left.FIELD)

		self.assertEqual((field.fieldtype, int(field.default), field.non_negative), ("Int", 30, 1))

	def test_the_restaurant_sets_the_minutes(self):
		self.waiting_for(20)

		self.question(15)
		self.assertTrue(self.tile()["guests_left_ask"])
		self.question(30)
		self.assertFalse(self.tile()["guests_left_ask"])


class TestTheFloor(GuestsLeftCase):
	def test_a_table_that_waited_to_be_cleaned_is_marked_with_the_minutes_it_waited(self):
		self.question(30)
		self.waiting_for(45)

		tile = self.tile()

		self.assertTrue(tile["guests_left_ask"])
		self.assertIn(tile["cleaning_minutes"], (45, 46))

	def test_a_table_cleaned_a_moment_ago_is_not_marked(self):
		self.question(30)
		self.waiting_for(5)

		tile = self.tile()

		self.assertFalse(tile["guests_left_ask"])
		self.assertLessEqual(tile["cleaning_minutes"], 6)

	def test_every_table_carries_the_answer_and_none_the_last_write(self):
		self.question(30)
		self.waiting_for(60)
		self.waiting_for(60, table=self.table_a2, status="Empty")

		floor = self.floor()

		for name in (self.table_a, self.table_a2):
			self.assertIn("guests_left_ask", floor[name])
			self.assertNotIn("modified", floor[name])
		self.assertTrue(floor[self.table_a]["guests_left_ask"])
		self.assertFalse(floor[self.table_a2]["guests_left_ask"])
		self.assertEqual(floor[self.table_a2]["cleaning_minutes"], 0)

	def test_zero_switches_the_question_off(self):
		self.question(0)
		self.waiting_for(500)

		self.assertFalse(self.tile()["guests_left_ask"])

	def test_a_table_of_direct_service_is_not_marked(self):
		self.question(30)
		self.waiting_for(500)
		frappe.db.set_value("Restaurant Table", self.table_a, direct_service.FIELD, 1, update_modified=False)

		self.assertFalse(self.tile()["guests_left_ask"])

	def test_a_table_paid_with_nothing_to_serve_waits_by_itself_then_is_asked_after(self):
		self.question(30)
		self.a_paid_order(["Delivered"])
		self.assertEqual(self.status_of_table(), "Cleaning")
		# At once the table is only to clean: nobody asks whether the guests left a second after the bill was paid
		self.assertFalse(self.tile()["guests_left_ask"])

		self.waiting_for(31)

		self.assertTrue(self.tile()["guests_left_ask"])

	def test_the_last_delivery_starts_the_wait(self):
		self.question(30)
		order = self.a_paid_order(["Ready"])
		self.assertEqual(self.status_of_table(), "Occupied")

		self.deliver(order)

		self.assertEqual(self.status_of_table(), "Cleaning")
		self.assertFalse(self.tile()["guests_left_ask"])
		self.waiting_for(31)
		self.assertTrue(self.tile()["guests_left_ask"])

	def test_the_setting_reaches_the_till(self):
		self.question(20)

		with self.waiter():
			settings = restaurant_api.get_restaurant_settings(self.a)

		self.assertEqual(settings["ask_if_guests_left_minutes"], 20)


class TestNotLeftYet(GuestsLeftCase):
	def test_the_wait_starts_again_and_the_table_stays_to_clean(self):
		self.question(30)
		self.waiting_for(45)
		self.assertTrue(self.tile()["guests_left_ask"])

		with self.waiter():
			answer = restaurant_api.keep_table_for_guests(self.table_a)

		self.assertEqual(answer, {"status": "success"})
		self.assertEqual(self.status_of_table(), "Cleaning")
		tile = self.tile()
		self.assertFalse(tile["guests_left_ask"])
		self.assertLessEqual(tile["cleaning_minutes"], 1)

	def test_the_question_comes_back_after_the_same_minutes(self):
		self.question(30)
		self.waiting_for(45)
		with self.waiter():
			restaurant_api.keep_table_for_guests(self.table_a)

		self.waiting_for(31)

		self.assertTrue(self.tile()["guests_left_ask"])

	def test_a_table_that_is_not_waiting_to_be_cleaned_is_refused_and_left_alone(self):
		for status in ("Empty", "Occupied", "Paid", "Reserved"):
			with self.subTest(status=status):
				self.waiting_for(90, status=status)
				before = frappe.db.get_value("Restaurant Table", self.table_a, "modified")

				with self.waiter(), self.assertRaises(frappe.ValidationError):
					restaurant_api.keep_table_for_guests(self.table_a)

				self.assertEqual(self.status_of_table(), status)
				self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "modified"), before)

	def test_an_unknown_table_is_refused(self):
		with self.waiter(), self.assertRaises(frappe.ValidationError):
			restaurant_api.keep_table_for_guests("_Test no such table")

	def test_a_visitor_with_no_account_may_not_and_the_wait_is_not_touched(self):
		self.question(30)
		self.waiting_for(45)

		with as_role("Guest"), self.assertRaises(frappe.PermissionError):
			restaurant_api.keep_table_for_guests(self.table_a)

		self.assertTrue(self.tile()["guests_left_ask"])
