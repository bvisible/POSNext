# //// Neoffice — added file (no upstream equivalent).
"""The open orders at the closing, and the floor's « cash in? » reminder (product owner, 08.11.2026).

« À la clôture, toutes les tables doivent être fermées. […] S'il n'y a plus personne à table, le serveur a oublié de fermer la table. » The suite pins:

- the rules (`pos_next.restaurant.open_orders`): a line is SERVED when it is delivered or sent to a station that works on paper alone, a line that has not left (no
  status, or held back) is not, and the tip line is no dish; an order that is served and has not moved for the restaurant's minutes is « to cash in »; 0 minutes
  never marks one; a table with several notes is served when all of them are;
- the floor (`get_tables`): the summary of an occupied table carries `served`, `idle_minutes` and `to_cash_in`;
- the closing's list (`get_open_orders`): the restaurant's open orders, oldest first, with their total, the money already posted on them, whether a dish was delivered
  (a consumed order is a debt, never one to delete), whether everything is served, the label of the note, and who may ask.

The suite builds its own restaurants, tills, menu and orders (those of the notes suite) and rolls everything back. The people it acts as are the waiter (the cashier of
the till) and an account with no till: never Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.utils import add_to_date, now_datetime

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import open_orders
from pos_next.tests.test_the_notes_of_a_table import NotesCase

STATION = "_Test Paper Station"


class OpenOrdersCase(NotesCase):
	def deliver_every_line(self, order):
		for row in frappe.get_all("Sales Invoice Item", filters={"parent": order}, pluck="name"):
			frappe.db.set_value("Sales Invoice Item", row, "kds_status", "Delivered", update_modified=False)

	def set_status(self, order, status, station=None):
		for row in frappe.get_all("Sales Invoice Item", filters={"parent": order}, pluck="name"):
			frappe.db.set_value("Sales Invoice Item", row, "kds_status", status, update_modified=False)
			if station:
				frappe.db.set_value(
					"Sales Invoice Item", row, "preparation_station", station, update_modified=False
				)

	def quiet_for(self, order, minutes):
		"""The order and its lines as if nothing had moved for `minutes`."""
		moment = add_to_date(now_datetime(), minutes=-minutes)
		frappe.db.set_value("Sales Invoice", order, "modified", moment, update_modified=False)
		frappe.db.sql("update `tabSales Invoice Item` set modified = %s where parent = %s", (moment, order))

	def reminder(self, minutes):
		frappe.db.set_value("Restaurant", self.a, open_orders.FIELD, minutes)
		frappe.clear_document_cache("Restaurant", self.a)

	def summary(self, table=None):
		return self.floor()[table or self.table_a]["order_summary"]

	def open_list(self):
		with self.waiter():
			return restaurant_api.get_open_orders(restaurant=self.a)["orders"]

	def row_of(self, order):
		return next((row for row in self.open_list() if row["name"] == order), None)


class TestTheRulesOfServed(OpenOrdersCase):
	def test_a_line_is_served_when_it_is_delivered(self):
		order = self.save()
		self.deliver_every_line(order)

		state = open_orders.line_states([order])[order]

		self.assertTrue(state["served"])
		self.assertTrue(state["consumed"])
		self.assertEqual((state["lines"], state["delivered"]), (1, 1))

	def test_a_line_still_at_the_kitchen_is_not_served(self):
		for status in ("Pending", "Preparing", "Ready"):
			with self.subTest(status=status):
				# The same order is saved again each time: a table keeps one draft per note
				order = self.save()
				self.set_status(order, status)

				state = open_orders.line_states([order])[order]

				self.assertFalse(state["served"])
				self.assertFalse(state["consumed"])

	def test_a_line_that_has_not_left_is_not_served(self):
		for status in ("", "Waiting"):
			with self.subTest(status=status):
				order = self.save()
				self.set_status(order, status)

				self.assertFalse(open_orders.line_states([order])[order]["served"])

	def test_a_line_sent_to_a_station_that_works_on_paper_alone_is_served_once_sent(self):
		order = self.save()
		self.set_status(order, "Pending", station=STATION)

		with patch.object(open_orders, "paper_only_stations", return_value={STATION}):
			state = open_orders.line_states([order])[order]

		self.assertTrue(state["served"], "no screen will ever mark it delivered")
		self.assertTrue(state["consumed"])
		self.assertEqual(state["delivered"], 0)

	def test_the_same_line_at_a_station_with_a_screen_is_not_served_until_delivered(self):
		order = self.save()
		self.set_status(order, "Pending", station=STATION)

		with patch.object(open_orders, "paper_only_stations", return_value=set()):
			self.assertFalse(open_orders.line_states([order])[order]["served"])

	def test_the_tip_line_is_no_dish(self):
		order = self.save([self.line(self.soup), self.line(self.penne)])
		rows = frappe.get_all("Sales Invoice Item", filters={"parent": order}, fields=["name", "item_code"])
		for row in rows:
			if row.item_code == self.soup:
				frappe.db.set_value(
					"Sales Invoice Item", row.name, "kds_status", "Delivered", update_modified=False
				)

		# the penne still waits: not served; counted out as the tip item, the table is served
		self.assertFalse(open_orders.line_states([order])[order]["served"])
		self.assertTrue(open_orders.line_states([order], tip_item=self.penne)[order]["served"])

	def test_an_order_with_no_line_is_served_by_nobody(self):
		order = self.save()
		frappe.db.delete("Sales Invoice Item", {"parent": order})

		state = open_orders.line_states([order])[order]

		self.assertEqual(state["lines"], 0)
		self.assertFalse(state["served"])


class TestTheCashInReminderOnTheFloor(OpenOrdersCase):
	def test_a_served_table_that_has_been_quiet_long_enough_is_marked_to_cash_in(self):
		order = self.save()
		self.deliver_every_line(order)
		self.quiet_for(order, 50)
		self.reminder(45)

		summary = self.summary()

		self.assertTrue(summary["served"])
		self.assertTrue(summary["to_cash_in"])
		self.assertGreaterEqual(summary["idle_minutes"], 50)

	def test_a_table_that_moved_a_moment_ago_is_not(self):
		order = self.save()
		self.deliver_every_line(order)
		self.quiet_for(order, 10)
		self.reminder(45)

		summary = self.summary()

		self.assertTrue(summary["served"])
		self.assertFalse(summary["to_cash_in"])

	def test_a_table_with_a_dish_still_to_serve_is_not_however_quiet(self):
		order = self.save()
		self.set_status(order, "Ready")
		self.quiet_for(order, 120)
		self.reminder(45)

		summary = self.summary()

		self.assertFalse(summary["served"])
		self.assertFalse(summary["to_cash_in"])

	def test_zero_minutes_switches_the_reminder_off(self):
		order = self.save()
		self.deliver_every_line(order)
		self.quiet_for(order, 500)
		self.reminder(0)

		self.assertFalse(self.summary()["to_cash_in"])

	def test_the_restaurant_sets_the_minutes(self):
		order = self.save()
		self.deliver_every_line(order)
		self.quiet_for(order, 20)

		self.reminder(15)
		self.assertTrue(self.summary()["to_cash_in"])
		self.reminder(30)
		self.assertFalse(self.summary()["to_cash_in"])

	def test_forty_five_minutes_unless_the_restaurant_says_otherwise(self):
		# The column is an Int that is never null: a restaurant that never touched the setting carries the doctype's default
		self.assertEqual(open_orders.DEFAULT_REMINDER_MINUTES, 45)
		self.assertEqual(open_orders.reminder_minutes(self.a), 45)
		# No restaurant at all: no reminder
		self.assertEqual(open_orders.reminder_minutes(None), 0)
		self.assertEqual(open_orders.reminder_minutes(""), 0)

	def test_a_table_with_two_notes_is_to_cash_in_only_when_both_are_served_and_quiet(self):
		first, second = self.two_notes()
		self.deliver_every_line(first)
		self.quiet_for(first, 60)
		self.quiet_for(second, 60)
		self.reminder(45)

		self.assertFalse(self.summary()["to_cash_in"], "the second note still waits for its dish")

		self.deliver_every_line(second)
		self.assertTrue(self.summary()["to_cash_in"])

	def test_the_setting_reaches_the_till(self):
		self.reminder(20)

		with self.waiter():
			settings = restaurant_api.get_restaurant_settings(self.a)

		self.assertEqual(settings["remind_to_cash_in_minutes"], 20)

	def test_the_setting_is_a_whole_number_of_minutes_from_zero(self):
		field = frappe.get_meta("Restaurant").get_field(open_orders.FIELD)

		self.assertEqual((field.fieldtype, int(field.default), field.non_negative), ("Int", 45, 1))


class TestTheClosingListsTheOpenOrders(OpenOrdersCase):
	def test_an_open_table_order_is_listed_with_what_it_holds(self):
		order = self.save()
		# The notes suite saves its drafts with a 10 payment row; the till leaves a table's draft with no money on it
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 0, update_modified=False)

		row = self.row_of(order)

		self.assertIsNotNone(row)
		self.assertEqual((row["kind"], row["table"]), ("table", self.table_a))
		self.assertEqual(row["label"], "T1")
		self.assertGreater(row["grand_total"], 0)
		self.assertFalse(row["holds_money"])
		self.assertFalse(row["consumed"])
		self.assertFalse(row["served"])
		self.assertEqual(row["lines"], 1)

	def test_an_order_with_a_delivered_dish_is_consumed_and_one_that_waits_is_not(self):
		first, second = self.two_notes()
		self.deliver_every_line(first)

		self.assertTrue(self.row_of(first)["consumed"])
		self.assertTrue(self.row_of(first)["served"])
		self.assertFalse(self.row_of(second)["consumed"])

	def test_money_posted_on_a_draft_is_told(self):
		order = self.save()
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 12, update_modified=False)

		row = self.row_of(order)

		self.assertTrue(row["holds_money"])
		self.assertEqual(row["paid_amount"], 12)

	def test_the_oldest_comes_first_and_a_note_is_named_by_its_number(self):
		first, second = self.two_notes()
		frappe.db.set_value(
			"Sales Invoice", second, "creation", add_to_date(now_datetime(), hours=-2), update_modified=False
		)

		rows = self.open_list()
		mine = [row["name"] for row in rows if row["name"] in (first, second)]

		self.assertEqual(mine, [second, first])
		self.assertEqual({row["name"]: row["label"] for row in rows}[second], "T1.1")
		self.assertEqual({row["name"]: row["label"] for row in rows}[first], "T1.0")

	def test_the_minutes_since_it_moved_are_told(self):
		order = self.save()
		self.quiet_for(order, 75)

		self.assertGreaterEqual(self.row_of(order)["idle_minutes"], 75)

	def test_a_paid_order_is_no_longer_listed(self):
		order = self.save()
		frappe.db.set_value("Sales Invoice", order, "docstatus", 1, update_modified=False)

		self.assertIsNone(self.row_of(order))

	def test_a_stranger_without_a_till_is_refused_and_a_waiter_is_not(self):
		self.save()

		with as_role("portal_customer"), self.assertRaises(frappe.PermissionError):
			restaurant_api.get_open_orders(restaurant=self.a)

		self.assertTrue(self.open_list())

	def test_a_restaurant_that_is_no_text_is_refused(self):
		# The type check of the web methods or the method's own refusal: either way nothing is read
		with self.waiter(), self.assertRaises((frappe.ValidationError, TypeError)):
			restaurant_api.get_open_orders(restaurant=["a"])
