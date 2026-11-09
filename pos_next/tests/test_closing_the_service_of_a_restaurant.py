# //// Neoffice — added file (no upstream equivalent).
"""Closing the service of a restaurant (product owner, 08.11.2026).

« Théoriquement, quand on clôture le restaurant, toutes les tables sont fermées. » « Si des gens traînent encore au bistrot, le restaurant n'est pas fermé. » A shift is one
person's till; the service is the restaurant's. The suite pins what `get_service_closing` and `close_service` do:

- the stage of an open order (study of the open tables, note 57, § 3): money already posted on it, empty (a table opened and left), never sent to the kitchen, sent;
- who may close: a user of the till who manages the floor, never a waiter; the question « is the room empty? » must be answered yes;
- the service does not close while an order is left open, whatever it is, except the empty ones; a refusal changes nothing;
- once the orders are settled it closes: the empty tables are removed without a question, the dishes of the tables already paid that are still at the kitchen are marked
  delivered, every table is freed, and the closing is written down with what it did.

The suite builds its own restaurants, tills, menu and orders (those of the settlement suite) and rolls everything back. The people it acts as are the waiter (the cashier
of the till), the manager of the floor and an account with no till: never Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

import json

import frappe
from frappe.tests.roles import as_role
from frappe.utils import flt

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import open_orders, service_closing, tickets
from pos_next.tests.test_settling_the_open_orders_of_a_closing_service import SettleCase
from pos_next.tests.test_till_writes_need_the_till import TILL

OUTSIDER = "service-outsider@yopmail.com"


class ClosingCase(SettleCase):
	def manager(self):
		"""The manager of the floor, at the till of the restaurant."""
		return as_role("till_manager", email=TILL)

	def survey(self):
		with self.manager():
			return restaurant_api.get_service_closing(self.fx.profile, self.a)

	def close(self, room_empty=1):
		with self.manager():
			return restaurant_api.close_service(self.fx.profile, self.a, room_empty)

	def empty_order(self):
		"""A table opened and left: an open order with no line and nothing to pay."""
		order = self.clean_order()
		frappe.db.delete("Sales Invoice Item", {"parent": order})
		frappe.db.set_value(
			"Sales Invoice",
			order,
			{
				"grand_total": 0,
				"rounded_total": 0,
				"net_total": 0,
				"base_grand_total": 0,
				"base_net_total": 0,
			},
			update_modified=False,
		)
		return order

	def paid_order_at_the_kitchen(self, table=None):
		"""A table whose bill was settled while a dish was still at the kitchen: a submitted order, its dish Pending, its table kept Occupied."""
		order = self.clean_order(restaurant_table=table) if table else self.clean_order()
		self.set_status(order, "Pending")
		frappe.db.set_value("Sales Invoice", order, "docstatus", 1)
		frappe.db.set_value("Restaurant Table", table or self.table_a, "status", "Occupied")
		return order

	def closings(self):
		return frappe.get_all(service_closing.JOURNAL, filters={"restaurant": self.a}, fields=["*"])

	def stage_of(self, order):
		return next(row for row in self.survey()["orders"] if row["name"] == order)["stage"]


class TestTheStageOfAnOrder(ClosingCase):
	def test_the_rules_of_the_stages(self):
		self.assertEqual(open_orders.stage_of(True, 3, 3, 40), open_orders.HOLDS_MONEY)
		self.assertEqual(open_orders.stage_of(True, 0, 0, 0), open_orders.HOLDS_MONEY)
		self.assertEqual(open_orders.stage_of(False, 0, 0, 0), open_orders.EMPTY)
		self.assertEqual(open_orders.stage_of(False, 2, 0, 18), open_orders.NEVER_SENT)
		self.assertEqual(open_orders.stage_of(False, 2, 1, 18), open_orders.SENT_STAGE)
		# a tip line alone is no dish, but it is something to pay: not an empty table
		self.assertEqual(open_orders.stage_of(False, 0, 0, 5), open_orders.NEVER_SENT)

	def test_the_list_of_the_closing_tells_each_orders_stage(self):
		never_sent = self.clean_order()
		self.set_status(never_sent, "")
		self.assertEqual(self.stage_of(never_sent), "never_sent")

		sent = self.save([self.line(self.soup)], restaurant_note=2)
		frappe.db.delete("Sales Invoice Payment", {"parent": sent})
		frappe.db.set_value("Sales Invoice", sent, {"paid_amount": 0}, update_modified=False)
		self.set_status(sent, "Pending")
		self.assertEqual(self.stage_of(sent), "sent")

		holds = self.save([self.line(self.soup)], restaurant_note=3)
		frappe.db.set_value("Sales Invoice", holds, "paid_amount", 12, update_modified=False)
		self.assertEqual(self.stage_of(holds), "holds_money")

	def test_a_table_opened_and_left_is_empty(self):
		order = self.empty_order()

		self.assertEqual(self.stage_of(order), "empty")


class TestWhoMayCloseTheService(ClosingCase):
	def test_a_waiter_may_not(self):
		with self.waiter():
			for call in (
				lambda: restaurant_api.get_service_closing(self.fx.profile, self.a),
				lambda: restaurant_api.close_service(self.fx.profile, self.a, 1),
			):
				with self.assertRaises(frappe.PermissionError):
					call()

		self.assertEqual(self.closings(), [])

	def test_an_account_with_no_till_may_not(self):
		with as_role("accountant", email=OUTSIDER):
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.get_service_closing(self.fx.profile, self.a)
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.close_service(self.fx.profile, self.a, 1)

		self.assertEqual(self.closings(), [])

	def test_a_portal_customer_and_a_visitor_may_not(self):
		# The three identities: a customer of the portal (a Website User) and a visitor reach nothing of the restaurant's closing
		for persona in ("portal_customer", "Guest"):
			with self.subTest(persona=persona), as_role(persona):
				with self.assertRaises(frappe.PermissionError):
					restaurant_api.get_service_closing(self.fx.profile, self.a)
				with self.assertRaises(frappe.PermissionError):
					restaurant_api.close_service(self.fx.profile, self.a, 1)

		self.assertEqual(self.closings(), [])

	def test_the_manager_of_the_floor_may(self):
		answer = self.close()

		self.assertTrue(answer["closing"])
		self.assertEqual(len(self.closings()), 1)

	def test_a_name_is_a_text_not_a_filter(self):
		# Frappe's own check of the annotation (`str | None`) turns a list away before the endpoint reads it
		with self.manager(), self.assertRaises((TypeError, frappe.ValidationError)):
			restaurant_api.close_service(self.fx.profile, ["!=", "x"], 1)
		with self.manager(), self.assertRaises((TypeError, frappe.ValidationError)):
			restaurant_api.get_service_closing(self.fx.profile, {"restaurant": ["!=", "x"]})

		self.assertEqual(self.closings(), [])

	def test_the_room_must_be_said_empty(self):
		for answer in (0, "0", "", None):
			with self.subTest(answer=answer), self.assertRaises(frappe.ValidationError):
				self.close(room_empty=answer)

		self.assertEqual(self.closings(), [])


class TestTheServiceDoesNotCloseOverAnOpenOrder(ClosingCase):
	def refused(self):
		with self.manager(), self.assertRaises(frappe.ValidationError):
			restaurant_api.close_service(self.fx.profile, self.a, 1)

	def test_an_order_sent_to_the_kitchen_keeps_the_service_open(self):
		order = self.clean_order()
		self.set_status(order, "Pending")

		self.refused()

		self.assertTrue(self.exists(order))
		self.assertEqual(self.status_of_table(), "Occupied")
		self.assertEqual(self.closings(), [])

	def test_a_dish_served_and_not_paid_keeps_it_open_too(self):
		order = self.clean_order(served=True)

		self.refused()

		self.assertTrue(self.exists(order))

	def test_an_order_never_sent_keeps_it_open_until_it_is_cancelled(self):
		order = self.clean_order()
		self.set_status(order, "")

		self.refused()
		self.assertTrue(self.exists(order))

		self.settle(order, "cancelled", reason="Never sent to the kitchen")
		self.close()

		self.assertEqual(len(self.closings()), 1)

	def test_an_order_that_holds_money_keeps_it_open(self):
		order = self.clean_order()
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 12, update_modified=False)

		self.refused()

		self.assertTrue(self.exists(order))

	def test_the_refusal_names_the_tables_still_open(self):
		self.clean_order(served=True)

		with self.manager(), self.assertRaises(frappe.ValidationError) as caught:
			restaurant_api.close_service(self.fx.profile, self.a, 1)

		self.assertIn("T1", str(caught.exception))

	def test_a_refusal_changes_nothing_not_even_the_empty_tables(self):
		kept = self.clean_order(served=True)
		empty = self.empty_order_on_another_table()

		self.refused()

		self.assertTrue(self.exists(kept))
		self.assertTrue(self.exists(empty), "the empty table stays until the service really closes")

	def empty_order_on_another_table(self):
		order = self.save([self.line(self.soup)], restaurant_table=self.table_a2)
		frappe.db.delete("Sales Invoice Item", {"parent": order})
		frappe.db.delete("Sales Invoice Payment", {"parent": order})
		frappe.db.set_value(
			"Sales Invoice",
			order,
			{"grand_total": 0, "rounded_total": 0, "net_total": 0, "paid_amount": 0},
			update_modified=False,
		)
		return order


class TestWhatTheClosingDoes(ClosingCase):
	def test_the_survey_reads_and_changes_nothing(self):
		empty = self.empty_order()
		frappe.db.set_value("Restaurant Table", self.table_a2, "status", "Cleaning")

		first = self.survey()
		second = self.survey()

		self.assertEqual(first["empty_orders"], 1)
		self.assertGreaterEqual(first["tables_to_free"], 2)
		self.assertIsNone(first["last_closing"])
		self.assertEqual([row["name"] for row in first["orders"]], [empty])
		self.assertEqual(first["orders"], second["orders"])
		self.assertTrue(self.exists(empty))
		self.assertEqual(self.closings(), [])

	def test_an_empty_table_is_removed_without_a_question_and_its_table_freed(self):
		empty = self.empty_order()

		answer = self.close()

		self.assertFalse(self.exists(empty))
		self.assertEqual(answer["empty_orders_removed"], 1)
		self.assertEqual(self.status_of_table(), "Empty")

	def test_every_table_being_cleaned_or_seated_goes_back_to_empty(self):
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Cleaning")
		frappe.db.set_value("Restaurant Table", self.table_a2, "status", "Occupied")

		answer = self.close()

		self.assertEqual(self.status_of_table(self.table_a), "Empty")
		self.assertEqual(self.status_of_table(self.table_a2), "Empty")
		self.assertEqual(answer["tables_freed"], 2)

	def test_a_table_kept_for_a_booking_is_not_freed(self):
		frappe.db.set_value("Restaurant Table", self.table_a2, "status", "Reserved")

		self.close()

		self.assertEqual(self.status_of_table(self.table_a2), "Reserved")

	def test_the_dishes_of_a_table_already_paid_are_marked_delivered_and_its_table_freed(self):
		order = self.paid_order_at_the_kitchen()

		answer = self.close()

		statuses = set(frappe.get_all("Sales Invoice Item", filters={"parent": order}, pluck="kds_status"))
		self.assertEqual(statuses, {"Delivered"})
		self.assertGreaterEqual(answer["dishes_delivered"], 1)
		self.assertEqual(self.status_of_table(), "Empty")
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", order, "docstatus"), 1, "a paid order stays paid"
		)

	def test_the_dishes_of_the_orders_of_another_restaurant_are_not_touched(self):
		mine = self.paid_order_at_the_kitchen()
		# A paid order of a table of the other restaurant, with its dish still at the kitchen
		elsewhere = self.save([self.line(self.penne)], restaurant_note=2)
		frappe.db.set_value("Sales Invoice", elsewhere, "restaurant_table", self.table_b)
		self.set_status(elsewhere, "Pending")
		frappe.db.set_value("Sales Invoice", elsewhere, "docstatus", 1)

		self.close()

		self.assertEqual(
			set(frappe.get_all("Sales Invoice Item", filters={"parent": mine}, pluck="kds_status")),
			{"Delivered"},
		)
		self.assertEqual(
			set(frappe.get_all("Sales Invoice Item", filters={"parent": elsewhere}, pluck="kds_status")),
			{"Pending"},
		)

	def test_the_closing_is_written_down(self):
		self.empty_order()

		answer = self.close()

		entry = frappe.get_doc(service_closing.JOURNAL, answer["closing"])
		self.assertEqual(entry.restaurant, self.a)
		self.assertEqual(entry.closed_by, TILL)
		self.assertEqual(entry.pos_profile, self.fx.profile)
		self.assertEqual(entry.empty_orders_removed, 1)
		# The business day of the closing, which starts at the restaurant's hour: before it, the closing belongs to the day before
		# (the CI's site keeps New York's time, where 08:20 UTC is 03:20: nightly Tests of 09.11.2026)
		day_start = tickets.ticket_settings(self.a).day_start
		self.assertEqual(entry.service_day, tickets.business_day_of(entry.closed_at, day_start))
		details = json.loads(entry.details)
		self.assertEqual(len(details["empty_orders_removed"]), 1)
		self.assertEqual(details["empty_orders_removed"][0]["table"], "T1")

	def test_it_counts_what_was_settled_one_by_one_since_the_previous_closing(self):
		first = self.clean_order(served=True)
		second_table = self.save([self.line(self.soup)], restaurant_table=self.table_a2)
		frappe.db.delete("Sales Invoice Payment", {"parent": second_table})
		frappe.db.set_value("Sales Invoice", second_table, "paid_amount", 0, update_modified=False)
		self.deliver_every_line(second_table)

		self.settle(first, "cashed")
		self.settle(second_table, "cashed")
		answer = self.close()

		self.assertEqual(answer["orders_settled"], 2)
		self.assertGreater(flt(answer["settled_total"]), 0)

		# a later service counts its own settlements only
		third = self.clean_order(served=True)
		self.settle(third, "cashed")
		later = self.close()

		self.assertEqual(later["orders_settled"], 1)
		self.assertEqual(len(self.closings()), 2)

	def test_it_tells_the_other_tills(self):
		self.empty_order()

		with self.manager(), self.patched_realtime() as published:
			restaurant_api.close_service(self.fx.profile, self.a, 1)

		self.assertIn("table_update", published)
		self.assertIn("kds_update", published)

	def patched_realtime(self):
		from contextlib import contextmanager
		from unittest.mock import patch

		@contextmanager
		def spy():
			events = []
			with patch.object(
				frappe, "publish_realtime", side_effect=lambda event, *a, **k: events.append(event)
			):
				yield events

		return spy()

	def test_the_last_closing_is_told_to_the_next_survey(self):
		answer = self.close()

		last = self.survey()["last_closing"]

		self.assertEqual(last["name"], answer["closing"])
		self.assertEqual(last["closed_by"], TILL)
