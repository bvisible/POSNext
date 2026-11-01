# //// Neoffice — added file (no upstream equivalent).
"""The status of an order follows ALL its dishes, forward and backward (NeoRestau lot 1, task 38b, rulings 79 and 78).

`update_item_kds_status` used to raise the order's own status to Ready when every dish was ready, and do nothing else. So the
order was never lowered: a kitchen without a runner delivers an order in one gesture (every dish Delivered, the order
Delivered), and the five seconds in which the cook can take that back put the DISHES back to Preparing while the order stayed
Delivered. The kitchen screen reads `kds_status == "Delivered"` first, so the ticket stayed gone. The order's status is now
worked out from all its dishes whenever one of them moves, by the rule the screen uses (`kitchenStatusOf`); both are tested
against one table of examples, `kitchen_status_cases.json`.
"""

import json
import os

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_the_list_of_tables_reads_the_floor import _dish
from pos_next.tests.test_ticket_numbers import TicketCase

CASES = os.path.join(os.path.dirname(__file__), "kitchen_status_cases.json")


def what_the_kitchen_screen_shows(order):
	"""`kitchenStatusOf` of POS/src/utils/kitchenBands.js, for an order of `get_kds_orders`."""
	if order.get("kds_status") == "Delivered":
		return "Delivered"
	lines = order.get("items") or []
	live = [line.get("kds_status") for line in lines if line.get("kds_status") in ("Pending", "Preparing", "Ready")]
	if not live:
		return "Delivered" if any(line.get("kds_status") == "Delivered" for line in lines) else "Pending"
	if not any(status in ("Preparing", "Ready") for status in live):
		return "Pending"
	return "Ready" if all(status == "Ready" for status in live) else "Preparing"


class TestTheRuleOfTheStatus(FrappeTestCase):
	def test_every_example_of_the_shared_table_gives_its_status(self):
		with open(CASES, encoding="utf-8") as table:
			cases = json.load(table)["cases"]

		self.assertGreaterEqual(len(cases), 15)
		for case in cases:
			with self.subTest(dishes=case["dishes"]):
				self.assertEqual(restaurant_api._order_status_of(case["dishes"]), case["status"])


	def test_every_example_of_the_shared_table_of_dishes_sent_ahead_gives_its_status(self):
		# //// Neoffice — the dishes that left AHEAD of their course and are not called (the service rhythm, NeoRestau lot 1)
		with open(CASES, encoding="utf-8") as table:
			cases = json.load(table)["ahead_cases"]

		self.assertGreaterEqual(len(cases), 10)
		for case in cases:
			with self.subTest(about=case["about"]):
				dishes = [dish["status"] for dish in case["dishes"]]
				uncalled = [dish["uncalled"] for dish in case["dishes"]]
				self.assertEqual(restaurant_api._order_status_of(dishes, uncalled), case["status"])

	def test_a_rule_given_no_dish_sent_ahead_is_the_rule_it_always_was(self):
		for dishes in (["Ready", "Ready"], ["Ready", "Pending"], ["Delivered", "Pending"], []):
			with self.subTest(dishes=dishes):
				self.assertEqual(
					restaurant_api._order_status_of(dishes, [False] * len(dishes)),
					restaurant_api._order_status_of(dishes),
				)
				self.assertEqual(restaurant_api._order_status_of(dishes, None), restaurant_api._order_status_of(dishes))


class TestAnOrderFollowsItsDishes(TicketCase):
	"""A table's order with two dishes (the Kitchen's and the Bar's), as the till saves it."""

	def setUp(self):
		super().setUp()
		self.bar = self.make_station(self.a, station_name="Bar")
		# Two different dishes: the kitchen moves the lines of one item together
		self.second_dish = _dish(self.fx.company)

	def an_order(self, first="Preparing", second="Preparing", order=None):
		saved = self.save(
			restaurant_table=self.table_a,
			items=[
				{"item_code": self.fx.item, "qty": 1, "rate": 10, "price_list_rate": 10},
				{"item_code": self.second_dish, "qty": 1, "rate": 10, "price_list_rate": 10},
			],
		)
		self.name = saved.name
		self.lines = frappe.get_all("Sales Invoice Item", filters={"parent": self.name}, order_by="idx", pluck="name")
		for line, station, status in zip(self.lines, (self.station_a, self.bar), (first, second), strict=True):
			frappe.db.set_value("Sales Invoice Item", line, {"preparation_station": station, "kds_status": status})
		frappe.db.set_value("Sales Invoice", self.name, "kds_status", order or restaurant_api._order_status_of([first, second]))
		return self.name

	def seen(self):
		return (
			frappe.db.get_value("Sales Invoice", self.name, "kds_status"),
			*[frappe.db.get_value("Sales Invoice Item", line, "kds_status") for line in self.lines],
		)

	def on_the_screen(self):
		"""What the kitchen screen shows of the order (None: it is not on the screen at all)."""
		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		return what_the_kitchen_screen_shows(orders[self.name]) if self.name in orders else None

	def put_back(self, status, *which):
		"""What the kitchen's undo does: one call per item, with the state the dish had before."""
		for line in which or self.lines:
			item = frappe.db.get_value("Sales Invoice Item", line, "item_code")
			restaurant_api.update_item_kds_status(self.name, item, status)

	# ------------------------------------------------------------------------------------------------ backward

	def test_taking_a_delivery_back_to_preparing_puts_the_order_back_to_preparing(self):
		# A kitchen without a runner: « Deliver » on dishes that are still Preparing delivers them in one gesture
		self.an_order("Preparing", "Preparing")
		restaurant_api.update_kds_status(self.name, "Delivered")
		self.assertEqual(self.seen(), ("Delivered", "Delivered", "Delivered"))
		self.assertIsNone(self.on_the_screen(), "a delivered order is off the kitchen screen")

		self.put_back("Preparing")

		self.assertEqual(self.seen(), ("Preparing", "Preparing", "Preparing"))
		self.assertEqual(self.on_the_screen(), "Preparing", "the ticket is back on the kitchen screen")

	def test_taking_a_delivery_back_to_ready_puts_the_order_back_to_ready(self):
		self.an_order("Ready", "Ready")
		restaurant_api.mark_items_delivered(self.name)
		self.assertEqual(self.seen()[0], "Delivered")

		self.put_back("Ready")

		self.assertEqual(self.seen(), ("Ready", "Ready", "Ready"))
		self.assertEqual(self.on_the_screen(), "Ready")

	def test_taking_back_one_dish_of_two_delivered_leaves_the_order_where_that_dish_is(self):
		self.an_order("Ready", "Ready")
		restaurant_api.mark_items_delivered(self.name)

		self.put_back("Preparing", self.lines[0])
		self.assertEqual(self.seen(), ("Preparing", "Preparing", "Delivered"))

		self.put_back("Ready", self.lines[0])
		self.assertEqual(self.seen(), ("Ready", "Ready", "Delivered"))
		self.assertEqual(self.on_the_screen(), "Ready")

	def test_a_dish_taken_back_to_pending_makes_the_order_pending_when_the_others_are_delivered(self):
		self.an_order("Delivered", "Delivered", order="Delivered")

		self.put_back("Pending", self.lines[0])

		self.assertEqual(self.seen(), ("Pending", "Pending", "Delivered"))
		self.assertEqual(self.on_the_screen(), "Pending")

	def test_a_ready_order_called_back_to_preparing_is_preparing(self):
		self.an_order("Ready", "Ready")
		self.assertEqual(self.seen()[0], "Ready")

		self.put_back("Preparing", self.lines[0])

		self.assertEqual(self.seen(), ("Preparing", "Preparing", "Ready"))

	# ------------------------------------------------------------------------------------------------ forward

	def test_a_dish_started_moves_the_order_with_it(self):
		self.an_order("Pending", "Pending")

		self.put_back("Preparing", self.lines[0])

		self.assertEqual(self.seen(), ("Preparing", "Preparing", "Pending"))

	def test_the_order_is_ready_when_the_last_dish_is(self):
		self.an_order("Ready", "Preparing")
		self.assertEqual(self.seen()[0], "Preparing")

		self.put_back("Ready", self.lines[1])

		self.assertEqual(self.seen(), ("Ready", "Ready", "Ready"))

	def test_delivering_the_ready_dishes_of_an_order_still_cooking_leaves_it_cooking(self):
		self.an_order("Ready", "Preparing")

		restaurant_api.mark_items_delivered(self.name, json.dumps([self.lines[0]]))

		self.assertEqual(self.seen(), ("Preparing", "Delivered", "Preparing"))
		self.assertEqual(self.on_the_screen(), "Preparing")

	def test_delivering_the_last_dish_delivers_the_order_and_it_leaves_the_screen(self):
		self.an_order("Ready", "Ready")

		restaurant_api.mark_items_delivered(self.name)

		self.assertEqual(self.seen(), ("Delivered", "Delivered", "Delivered"))
		self.assertIsNone(self.on_the_screen(), "an order whose dishes are all delivered is not on the kitchen screen")

	def test_a_held_back_dish_does_not_stop_the_others_from_being_ready(self):
		self.an_order("Preparing", "Waiting")

		self.put_back("Ready", self.lines[0])

		self.assertEqual(self.seen(), ("Ready", "Ready", "Waiting"))
