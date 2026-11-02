# //// Neoffice — added file (no upstream equivalent).
"""A line of several units can be marked ready for some of them only (NeoResto lot 1, kitchen test of 01.11).

A line of six dishes was all or nothing: the cook "took everything", when four of the six were done. The kitchen now says
« ready » with a quantity: the runner sees the four to carry, and the kitchen keeps the line with the two left to cook. A line
carries two cumulative counters, `kds_ready_qty` (units cooked so far) and `kds_delivered_qty` (units delivered so far). The
units AT THE PASS of a line (what the runner carries) follow one rule, written once here (`_units_at_the_pass`) and once on the
screen (`unitsAtThePass`), both tested against one table of examples, `kitchen_pass_cases.json`.

The suite builds everything it needs (a restaurant, its stations, a draft order on a table) and rolls back.
"""

import json
import os

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import devices
from pos_next.tests import test_restaurant_devices as device_tests
from pos_next.tests.test_ticket_numbers import TicketCase

CASES = os.path.join(os.path.dirname(__file__), "kitchen_pass_cases.json")
FIELDS = ["kds_status", "kds_ready_qty", "kds_delivered_qty", "qty"]


class TestTheRuleOfTheUnitsAtThePass(FrappeTestCase):
	def test_every_example_of_the_shared_table_gives_its_units(self):
		with open(CASES, encoding="utf-8") as table:
			cases = json.load(table)["cases"]

		self.assertGreaterEqual(len(cases), 20)
		for case in cases:
			with self.subTest(case=case):
				units = restaurant_api._units_at_the_pass(
					case["status"], case["qty"], case["ready_qty"], case["delivered_qty"]
				)
				self.assertAlmostEqual(units, case["at_the_pass"], places=6)


class PartialCase(TicketCase):
	"""A table's order of one dish (or more), as the till saves it, at the kitchen."""

	def setUp(self):
		super().setUp()
		self.bar = self.make_station(self.a, station_name="Bar")

	def an_order(self, lines=((6, "Preparing", 0, 0),), table=None):
		"""A draft of one row per tuple `(qty, status, ready, delivered)`, all of the same dish, at the Kitchen station."""
		items = [
			{"item_code": self.fx.item, "qty": qty, "rate": 10, "price_list_rate": 10}
			for qty, _status, _ready, _delivered in lines
		]
		self.name = self.save(restaurant_table=table or self.table_a, items=items).name
		self.rows = frappe.get_all("Sales Invoice Item", filters={"parent": self.name}, order_by="idx", pluck="name")
		self.assertEqual(len(self.rows), len(lines))
		for row, (_qty, status, ready, delivered) in zip(self.rows, lines, strict=True):
			frappe.db.set_value(
				"Sales Invoice Item",
				row,
				{
					"preparation_station": self.station_a,
					"kds_status": status,
					"kds_ready_qty": ready,
					"kds_delivered_qty": delivered,
				},
			)
		frappe.db.set_value(
			"Sales Invoice", self.name, "kds_status", restaurant_api._order_status_of([line[1] for line in lines])
		)
		return self.name

	def state(self, row=None):
		"""`(status, ready, delivered)` of a row (the first by default)."""
		found = frappe.db.get_value("Sales Invoice Item", row or self.rows[0], FIELDS, as_dict=True)
		return found.kds_status, found.kds_ready_qty, found.kds_delivered_qty

	def order_status(self):
		return frappe.db.get_value("Sales Invoice", self.name, "kds_status")

	def ready(self, qty=None, **kwargs):
		return restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready", qty=qty, **kwargs)

	def deliver(self, *rows):
		return restaurant_api.mark_items_delivered(self.name, json.dumps(list(rows or self.rows)))

	def runner_line(self, row=None):
		"""The line of the runner's list for a row (None: the runner is told nothing of it)."""
		for order in restaurant_api.get_runner_orders(restaurant=self.a):
			if order["name"] == self.name:
				for line in order["items"]:
					if line["name"] == (row or self.rows[0]):
						return line
		return None


class TestTheKitchenMarksSomeUnitsReady(PartialCase):
	def test_four_of_six_make_the_line_preparing_with_four_cooked(self):
		self.an_order([(6, "Preparing", 0, 0)])

		self.ready(4)

		self.assertEqual(self.state(), ("Preparing", 4, 0))
		self.assertEqual(self.order_status(), "Preparing")

	def test_the_rest_makes_the_line_ready_with_every_unit_cooked(self):
		self.an_order([(6, "Preparing", 4, 0)])

		self.ready(2)

		self.assertEqual(self.state(), ("Ready", 6, 0))
		self.assertEqual(self.order_status(), "Ready")

	def test_more_than_what_is_left_to_cook_takes_the_whole_line(self):
		self.an_order([(6, "Preparing", 4, 0)])

		self.ready(5)

		self.assertEqual(self.state(), ("Ready", 6, 0))

	def test_the_whole_quantity_takes_the_whole_line(self):
		self.an_order([(6, "Preparing", 0, 0)])

		self.ready(6)

		self.assertEqual(self.state(), ("Ready", 6, 0))

	def test_no_quantity_is_the_whole_line_as_it_always_was(self):
		self.an_order([(6, "Preparing", 0, 0)])

		self.ready()

		self.assertEqual(self.state(), ("Ready", 6, 0))
		self.assertEqual(self.order_status(), "Ready")

	def test_no_quantity_on_a_line_cooked_in_part_takes_the_rest(self):
		self.an_order([(6, "Preparing", 4, 0)])

		self.ready()

		self.assertEqual(self.state(), ("Ready", 6, 0))

	def test_a_line_not_begun_becomes_preparing(self):
		self.an_order([(6, "Pending", 0, 0)])

		self.ready(4)

		self.assertEqual(self.state(), ("Preparing", 4, 0))
		self.assertEqual(self.order_status(), "Preparing")

	def test_a_quantity_of_a_unit_less_than_the_line_leaves_one_to_cook(self):
		self.an_order([(2, "Preparing", 0, 0)])

		self.ready(1)

		self.assertEqual(self.state(), ("Preparing", 1, 0))

	def test_the_units_already_delivered_stay_delivered_when_the_rest_is_ready(self):
		self.an_order([(6, "Preparing", 4, 4)])

		self.ready(2)

		self.assertEqual(self.state(), ("Ready", 6, 4))

	def test_only_a_ready_takes_a_quantity(self):
		self.an_order([(6, "Pending", 0, 0)])

		for status in ("Preparing", "Delivered", "Pending"):
			with self.subTest(status=status), self.assertRaises(frappe.ValidationError):
				restaurant_api.update_item_kds_status(self.name, self.fx.item, status, qty=2)

		self.assertEqual(self.state(), ("Pending", 0, 0))

	def test_a_quantity_is_a_positive_number(self):
		self.an_order([(6, "Preparing", 0, 0)])

		for qty in (0, -1, "two", ""):
			with self.subTest(qty=qty), self.assertRaises(frappe.ValidationError):
				self.ready(qty)

		self.assertEqual(self.state(), ("Preparing", 0, 0))

	def test_a_quantity_comes_as_text_from_the_screen_too(self):
		self.an_order([(6, "Preparing", 0, 0)])

		self.ready("4")

		self.assertEqual(self.state(), ("Preparing", 4, 0))

	def test_several_rows_of_one_dish_are_filled_in_the_order_of_their_lines(self):
		# Three plates with no onion, then two with: the lines of one dish are cooked together, the first line first
		self.an_order([(3, "Preparing", 0, 0), (2, "Preparing", 0, 0)])

		self.ready(4)

		self.assertEqual(self.state(self.rows[0]), ("Ready", 3, 0))
		self.assertEqual(self.state(self.rows[1]), ("Preparing", 1, 0))
		self.assertEqual(self.order_status(), "Preparing")

	def test_several_rows_take_the_whole_when_the_quantity_covers_what_is_left(self):
		self.an_order([(3, "Preparing", 0, 0), (2, "Preparing", 0, 0)])

		self.ready(5)

		self.assertEqual(self.state(self.rows[0]), ("Ready", 3, 0))
		self.assertEqual(self.state(self.rows[1]), ("Ready", 2, 0))

	def test_a_row_already_ready_is_not_asked_to_cook_again(self):
		self.an_order([(3, "Ready", 3, 0), (4, "Preparing", 0, 0)])

		self.ready(2)

		self.assertEqual(self.state(self.rows[0]), ("Ready", 3, 0))
		self.assertEqual(self.state(self.rows[1]), ("Preparing", 2, 0))

	def test_another_dish_of_the_order_is_left_alone(self):
		self.an_order([(6, "Preparing", 0, 0)])
		second = self.make_second_dish()

		self.ready(4)

		self.assertEqual(self.state(second), ("Preparing", 0, 0))

	def make_second_dish(self):
		"""A second dish on the same order, cooked at the Bar."""
		from pos_next.tests.test_the_list_of_tables_reads_the_floor import _dish

		other = _dish(self.fx.company)
		doc = frappe.get_doc("Sales Invoice", self.name)
		doc.append("items", {"item_code": other, "qty": 3, "rate": 10})
		doc.save(ignore_permissions=True)
		row = [line.name for line in doc.items if line.item_code == other][0]
		frappe.db.set_value(
			"Sales Invoice Item", row, {"preparation_station": self.bar, "kds_status": "Preparing"}
		)
		return row


class TestWhatTheScreensAreTold(PartialCase):
	def test_the_kitchen_is_told_both_counters_of_each_line(self):
		self.an_order([(6, "Preparing", 4, 1)])

		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		line = orders[self.name]["items"][0]

		self.assertEqual((line["kds_ready_qty"], line["kds_delivered_qty"], line["qty"]), (4, 1, 6))

	def test_the_runner_is_told_the_units_at_the_pass_of_a_line_cooked_in_part(self):
		self.an_order([(6, "Preparing", 4, 0)])

		line = self.runner_line()

		self.assertIsNotNone(line, "four units wait at the pass: the runner is told")
		self.assertEqual(line["qty"], 4, "the quantity is what the runner carries")
		self.assertEqual(line["ordered_qty"], 6, "the line's own quantity stays known")
		self.assertEqual((line["kds_ready_qty"], line["kds_delivered_qty"]), (4, 0))

	def test_the_runner_is_told_nothing_of_a_line_with_nothing_at_the_pass(self):
		self.an_order([(6, "Preparing", 0, 0)])

		self.assertIsNone(self.runner_line())

	def test_a_ready_line_waits_whole_at_the_pass(self):
		self.an_order([(6, "Ready", 6, 0)])

		line = self.runner_line()

		self.assertEqual((line["qty"], line["ordered_qty"]), (6, 6))

	def test_a_ready_line_with_some_units_delivered_waits_with_the_rest(self):
		self.an_order([(6, "Ready", 6, 4)])

		line = self.runner_line()

		self.assertEqual((line["qty"], line["ordered_qty"]), (2, 6))

	def test_a_line_saved_before_the_counters_existed_waits_whole(self):
		# Old data: the migrate gave every line already saved the counters at 0, whatever its status. A Ready line with both at 0
		# is ready in full, and the runner carries all of it
		self.an_order([(6, "Ready", 0, 0)])

		line = self.runner_line()

		self.assertEqual((line["qty"], line["ordered_qty"]), (6, 6))

	def test_a_line_delivered_in_full_is_not_the_runners_any_more(self):
		self.an_order([(6, "Delivered", 6, 6)])

		self.assertIsNone(self.runner_line())

	def test_the_order_of_a_line_cooked_in_part_stays_on_the_kitchens_list(self):
		self.an_order([(6, "Preparing", 4, 0)])

		self.assertIn(self.name, [o["name"] for o in restaurant_api.get_kds_orders(restaurant=self.a)])


class TestTheRunnerDeliversSomeUnits(PartialCase):
	def test_delivering_a_line_cooked_in_part_delivers_the_units_cooked_and_no_more(self):
		self.an_order([(6, "Preparing", 4, 0)])

		self.deliver()

		self.assertEqual(self.state(), ("Preparing", 4, 4), "the two left to cook are still the kitchen's")
		self.assertEqual(self.order_status(), "Preparing")
		self.assertIsNone(self.runner_line(), "nothing is left at the pass")

	def test_the_rest_cooked_after_a_delivery_waits_alone_at_the_pass(self):
		self.an_order([(6, "Preparing", 4, 4)])

		self.ready(2)

		line = self.runner_line()
		self.assertEqual(self.state(), ("Ready", 6, 4))
		self.assertEqual((line["qty"], line["ordered_qty"]), (2, 6))

	def test_delivering_the_rest_delivers_the_line_and_the_order(self):
		self.an_order([(6, "Ready", 6, 4)])

		self.deliver()

		self.assertEqual(self.state(), ("Delivered", 6, 6))
		self.assertEqual(self.order_status(), "Delivered")

	def test_delivering_a_ready_line_delivers_all_of_it(self):
		self.an_order([(6, "Ready", 6, 0)])

		self.deliver()

		self.assertEqual(self.state(), ("Delivered", 6, 6))

	def test_a_ready_line_of_old_data_delivers_whole(self):
		self.an_order([(6, "Ready", 0, 0)])

		self.deliver()

		self.assertEqual(self.state(), ("Delivered", 6, 6))

	def test_delivering_a_line_with_nothing_at_the_pass_changes_nothing(self):
		# The runner's screen is a few seconds old: the cook has called the units back since
		self.an_order([(6, "Preparing", 4, 4)])

		self.deliver()

		self.assertEqual(self.state(), ("Preparing", 4, 4))

	def test_delivering_every_line_with_no_names_delivers_them_all_as_it_always_did(self):
		self.an_order([(6, "Preparing", 4, 0), (2, "Ready", 2, 0)])

		restaurant_api.mark_items_delivered(self.name)

		self.assertEqual(self.state(self.rows[1]), ("Delivered", 2, 2))
		self.assertEqual(self.order_status(), "Preparing", "the two units of the first line are still to cook")

	def test_the_order_follows_a_line_cooked_in_part_while_the_others_are_delivered(self):
		self.an_order([(6, "Preparing", 4, 0), (2, "Ready", 2, 0)])

		self.deliver(*self.rows)

		self.assertEqual(self.order_status(), "Preparing")
		self.assertEqual(self.state(self.rows[0]), ("Preparing", 4, 4))
		self.assertEqual(self.state(self.rows[1]), ("Delivered", 2, 2))


class TestTheOrdersOwnMovesOnALineCookedInPart(PartialCase):
	def test_the_order_made_ready_takes_the_rest_of_the_line(self):
		self.an_order([(6, "Preparing", 4, 0)])

		restaurant_api.update_kds_status(self.name, "Ready")

		self.assertEqual(self.state(), ("Ready", 6, 0))
		self.assertEqual(self.order_status(), "Ready")

	def test_the_order_delivered_by_the_cook_delivers_every_unit(self):
		self.an_order([(6, "Preparing", 4, 0)])

		restaurant_api.update_kds_status(self.name, "Delivered")

		self.assertEqual(self.state(), ("Delivered", 6, 6))

	def test_a_line_started_is_not_touched_by_the_start_button(self):
		self.an_order([(6, "Preparing", 4, 0)])

		restaurant_api.update_kds_status(self.name, "Preparing")

		self.assertEqual(self.state(), ("Preparing", 4, 0))

	def test_a_line_not_begun_that_the_order_makes_ready_is_cooked_in_full(self):
		self.an_order([(6, "Pending", 0, 0)])

		restaurant_api.update_kds_status(self.name, "Ready")

		self.assertEqual(self.state(), ("Ready", 6, 0))

	def test_calling_a_ready_line_back_to_preparation_cooks_it_again(self):
		self.an_order([(6, "Ready", 6, 0)])

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Preparing")

		self.assertEqual(self.state(), ("Preparing", 0, 0))

	def test_calling_back_a_ready_line_keeps_the_units_already_delivered(self):
		self.an_order([(6, "Ready", 6, 4)])

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Preparing")

		self.assertEqual(self.state(), ("Preparing", 4, 4))

	def test_calling_back_the_units_at_the_pass_of_a_line_cooked_in_part(self):
		# The list of what waits at the pass shows the four: « recall to preparation » brings them back to the kitchen
		self.an_order([(6, "Preparing", 4, 0)])

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Preparing")

		self.assertEqual(self.state(), ("Preparing", 0, 0))
		self.assertIsNone(self.runner_line())

	def test_calling_back_a_line_with_nothing_at_the_pass_changes_nothing(self):
		self.an_order([(6, "Preparing", 4, 4)])

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Preparing")

		self.assertEqual(self.state(), ("Preparing", 4, 4))

	def test_a_delivered_line_taken_back_to_ready_is_at_the_pass_again(self):
		self.an_order([(6, "Delivered", 6, 6)])

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready")

		self.assertEqual(self.state(), ("Ready", 6, 0))
		self.assertEqual(self.runner_line()["qty"], 6)

	def test_a_delivered_line_taken_back_to_preparing_is_cooked_again(self):
		self.an_order([(6, "Delivered", 6, 6)])

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Preparing")

		self.assertEqual(self.state(), ("Preparing", 0, 0))


class TestTheUndoPutsALineBackExactly(PartialCase):
	"""The toast of the screens takes a move back: it names the state the line had, counters included."""

	def put_back(self, before, status_of_the_line=None):
		status, ready, delivered = before
		restaurant_api.update_item_kds_status(
			self.name,
			self.fx.item,
			status,
			restore=json.dumps({"ready_qty": ready, "delivered_qty": delivered}),
		)

	def test_a_partial_ready_is_taken_back_to_the_counters_it_had(self):
		self.an_order([(6, "Preparing", 2, 0)])
		before = self.state()
		self.ready(3)
		self.assertEqual(self.state(), ("Preparing", 5, 0))

		self.put_back(before)

		self.assertEqual(self.state(), ("Preparing", 2, 0))

	def test_a_partial_ready_from_a_line_not_begun_goes_back_to_pending(self):
		self.an_order([(6, "Pending", 0, 0)])
		before = self.state()
		self.ready(4)

		self.put_back(before)

		self.assertEqual(self.state(), ("Pending", 0, 0))
		self.assertEqual(self.order_status(), "Pending")

	def test_a_delivery_of_the_cooked_units_is_taken_back(self):
		self.an_order([(6, "Preparing", 4, 0)])
		before = self.state()
		self.deliver()
		self.assertEqual(self.state(), ("Preparing", 4, 4))

		self.put_back(before)

		self.assertEqual(self.state(), ("Preparing", 4, 0))
		self.assertEqual(self.runner_line()["qty"], 4)

	def test_a_delivery_of_a_ready_line_with_units_delivered_before_is_taken_back(self):
		self.an_order([(6, "Ready", 6, 4)])
		before = self.state()
		self.deliver()

		self.put_back(before)

		self.assertEqual(self.state(), ("Ready", 6, 4))
		self.assertEqual(self.order_status(), "Ready")

	def test_the_counters_never_pass_the_quantity_of_the_line(self):
		self.an_order([(6, "Preparing", 0, 0)])

		restaurant_api.update_item_kds_status(
			self.name, self.fx.item, "Preparing", restore=json.dumps({"ready_qty": 99, "delivered_qty": 99})
		)

		self.assertEqual(self.state(), ("Preparing", 6, 6))

	def test_a_restore_that_is_not_numbers_is_refused(self):
		self.an_order([(6, "Preparing", 2, 0)])

		with self.assertRaises(frappe.ValidationError):
			restaurant_api.update_item_kds_status(
				self.name, self.fx.item, "Preparing", restore=json.dumps({"ready_qty": "many"})
			)

		self.assertEqual(self.state(), ("Preparing", 2, 0))

	def test_a_restore_comes_as_a_dict_as_well_as_text(self):
		self.an_order([(6, "Preparing", 2, 0)])

		restaurant_api.update_item_kds_status(
			self.name, self.fx.item, "Preparing", restore={"ready_qty": 1, "delivered_qty": 0}
		)

		self.assertEqual(self.state(), ("Preparing", 1, 0))

	def test_a_move_without_restore_still_puts_the_status_back_the_old_way(self):
		self.an_order([(6, "Ready", 6, 0)])
		restaurant_api.mark_items_delivered(self.name)

		restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready")

		self.assertEqual(self.state(), ("Ready", 6, 0))


class TestTheTillSavingTheOrderKeepsTheCounters(PartialCase):
	def test_adding_a_dish_to_the_table_does_not_forget_what_was_cooked(self):
		self.an_order([(6, "Preparing", 4, 1)])
		other = self.make_other_dish()

		self.save(
			restaurant_table=self.table_a,
			name=self.name,
			items=[
				{"item_code": self.fx.item, "qty": 6, "rate": 10, "price_list_rate": 10},
				{"item_code": other, "qty": 1, "rate": 10, "price_list_rate": 10},
			],
		)

		rows = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": self.name, "item_code": self.fx.item},
			fields=FIELDS,
		)
		self.assertEqual(len(rows), 1)
		self.assertEqual((rows[0].kds_status, rows[0].kds_ready_qty, rows[0].kds_delivered_qty), ("Preparing", 4, 1))

	def test_a_line_whose_quantity_is_lowered_keeps_counters_within_it(self):
		self.an_order([(6, "Preparing", 4, 4)])

		self.save(
			restaurant_table=self.table_a,
			name=self.name,
			items=[{"item_code": self.fx.item, "qty": 3, "rate": 10, "price_list_rate": 10}],
		)

		row = frappe.get_all("Sales Invoice Item", filters={"parent": self.name}, fields=FIELDS)[0]
		self.assertEqual((row.kds_ready_qty, row.kds_delivered_qty), (3, 3))

	def test_two_rows_of_one_dish_share_what_was_cooked_in_the_order_of_their_lines(self):
		self.an_order([(3, "Ready", 3, 0), (2, "Preparing", 1, 0)])

		self.save(
			restaurant_table=self.table_a,
			name=self.name,
			items=[
				{"item_code": self.fx.item, "qty": 3, "rate": 10, "price_list_rate": 10},
				{"item_code": self.fx.item, "qty": 2, "rate": 10, "price_list_rate": 10},
			],
		)

		rows = frappe.get_all(
			"Sales Invoice Item", filters={"parent": self.name}, fields=FIELDS, order_by="idx"
		)
		self.assertEqual([(r.kds_ready_qty, r.kds_delivered_qty) for r in rows], [(3, 0), (1, 0)])

	def make_other_dish(self):
		from pos_next.tests.test_the_list_of_tables_reads_the_floor import _dish

		return _dish(self.fx.company)


class TestAKitchenTabletMarksSomeUnitsReady(device_tests.Tablets):
	"""The kitchen's tablet of one station: the same call, cut to the lines of its station."""

	def setUp(self):
		super().setUp()
		# The Bistro's order has one row per station, both of the same dish: six plates at the grill, three at the pastry
		rows = frappe.get_all(
			"Sales Invoice Item", filters={"parent": self.order}, order_by="idx", fields=["name", "preparation_station"]
		)
		self.grill_row = [r.name for r in rows if r.preparation_station == self.grill][0]
		self.pastry_row = [r.name for r in rows if r.preparation_station == self.pastry][0]
		frappe.db.set_value("Sales Invoice Item", self.grill_row, {"qty": 6, "kds_status": "Preparing"})
		frappe.db.set_value("Sales Invoice Item", self.pastry_row, {"qty": 3, "kds_status": "Preparing"})

	def states(self):
		return {
			"grill": tuple(frappe.db.get_value("Sales Invoice Item", self.grill_row, FIELDS[:3])),
			"pastry": tuple(frappe.db.get_value("Sales Invoice Item", self.pastry_row, FIELDS[:3])),
		}

	def test_a_tablet_of_one_station_marks_units_of_its_own_line_only(self):
		grill = self.tablet(self.bistro, device_tests.KITCHEN, self.grill)

		with device_tests.as_user(grill):
			restaurant_api.update_item_kds_status(self.order, self.item, "Ready", qty=4)

		self.assertEqual(self.states(), {"grill": ("Preparing", 4, 0), "pastry": ("Preparing", 0, 0)})

	def test_a_tablet_of_every_station_fills_the_lines_in_order(self):
		kitchen = self.tablet(self.bistro, device_tests.KITCHEN)

		with device_tests.as_user(kitchen):
			restaurant_api.update_item_kds_status(self.order, self.item, "Ready", qty=7)

		# The grill's row is the first of the order (idx 1): six plates, then one of the pastry's three
		self.assertEqual(self.states(), {"grill": ("Ready", 6, 0), "pastry": ("Preparing", 1, 0)})

	def test_a_tablet_cannot_take_a_quantity_of_another_restaurants_order(self):
		grill = self.tablet(self.bistro, device_tests.KITCHEN, self.grill)

		self.assert_refused(
			grill, "update_item_kds_status", restaurant_api.update_item_kds_status, self.bar_order, self.item, "Ready", qty=1
		)

	def test_a_tablet_cannot_take_a_quantity_for_a_state_the_kitchen_does_not_set(self):
		grill = self.tablet(self.bistro, device_tests.KITCHEN, self.grill)

		with device_tests.as_user(grill):
			with self.assertRaises(frappe.ValidationError):
				restaurant_api.update_item_kds_status(self.order, self.item, "Waiting", qty=2)

		self.assertEqual(self.states()["grill"], ("Preparing", 0, 0))

	def test_the_tablets_list_carries_the_counters(self):
		grill = self.tablet(self.bistro, device_tests.KITCHEN, self.grill)
		frappe.db.set_value("Sales Invoice Item", self.grill_row, {"kds_ready_qty": 4})

		with device_tests.as_user(grill):
			lines = restaurant_api.get_kds_orders()[0]["items"]

		self.assertEqual([(line["kds_ready_qty"], line["kds_delivered_qty"]) for line in lines], [(4, 0)])

	def test_a_tablet_takes_its_move_back_to_the_counters_the_line_had(self):
		grill = self.tablet(self.bistro, device_tests.KITCHEN, self.grill)

		with device_tests.as_user(grill):
			restaurant_api.update_item_kds_status(self.order, self.item, "Ready", qty=4)
			restaurant_api.update_item_kds_status(
				self.order,
				self.item,
				"Preparing",
				restore=json.dumps({"ready_qty": 0, "delivered_qty": 0}),
			)

		self.assertEqual(self.states(), {"grill": ("Preparing", 0, 0), "pastry": ("Preparing", 0, 0)})

	def test_the_runners_tablet_is_told_the_units_at_the_pass_and_delivers_them(self):
		frappe.db.set_value("Sales Invoice Item", self.grill_row, {"kds_ready_qty": 4})
		runner = self.tablet(self.bistro, device_tests.RUNNER)

		with device_tests.as_user(runner):
			lines = {
				line["name"]: line
				for order in restaurant_api.get_runner_orders()
				for line in order["items"]
				if order["name"] == self.order
			}
			self.assertEqual(set(lines), {self.grill_row}, "the pastry's plates are not cooked: nothing for the runner")
			self.assertEqual((lines[self.grill_row]["qty"], lines[self.grill_row]["ordered_qty"]), (4, 6))
			restaurant_api.mark_items_delivered(self.order, json.dumps([self.grill_row]))

		self.assertEqual(self.states(), {"grill": ("Preparing", 4, 4), "pastry": ("Preparing", 0, 0)})

	def test_the_calls_stay_the_ones_a_tablet_may_make(self):
		self.assertIn("pos_next.api.restaurant.update_item_kds_status", devices.TABLET_METHODS)
		self.assertIn("pos_next.api.restaurant.mark_items_delivered", devices.TABLET_METHODS)
