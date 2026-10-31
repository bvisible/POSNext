# //// Neoffice — added file (no upstream equivalent).
"""The main button of a kitchen ticket acts on the station chosen (NeoRestau lot 1, task 23, fix round 1, ruling 79).

An order is one invoice, and its dishes are cooked at several stations (the Bar's drinks, the Kitchen's plates). The
kitchen screen is opened on one station (a tablet at the bar, or the station chosen on the screen) or on all of them.
`update_kds_status` used to push the status it was given into EVERY dish of the invoice, so the Bar's "Prêt" marked the
Kitchen's plates ready and told the runner they could be collected. Given a station, it now advances the dishes of that
station only, and the order's own status follows its dishes. Given none ("Tout"), it does what it always did.

The suite builds everything it needs (a restaurant, its two stations, a draft order on a table) and rolls back: nothing
of it stays on the site.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_till_writes_need_the_till import _sale
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants


class TestTheMainButtonActsOnTheStationChosen(TwoRestaurants, FrappeTestCase):
	"""A table's order with one dish for the Kitchen and one for the Bar, as the till saves it."""

	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.make_till(self.fx.profile, self.a)
		self.kitchen = self.station_a
		self.bar = self.make_station(self.a, station_name="Bar")

	def an_order(self, kitchen="Pending", bar="Pending", order="Pending"):
		"""A draft of one Kitchen dish and one Bar dish, each at the status given, the order at its own."""
		dish = {"item_code": self.fx.item, "qty": 1, "rate": 10, "price_list_rate": 10}
		payload = _sale(
			self.fx,
			pos_profile=self.fx.profile,
			restaurant_table=self.table_a,
			items=[dict(dish), dict(dish)],
			payments=[{"mode_of_payment": self.fx.mode, "amount": 20}],
		)
		name = invoices.update_invoice(json.dumps(payload))["name"]
		rows = frappe.get_all("Sales Invoice Item", filters={"parent": name}, order_by="idx", pluck="name")
		self.assertEqual(len(rows), 2)
		self.kitchen_line, self.bar_line = rows
		for row, station, status in (
			(self.kitchen_line, self.kitchen, kitchen),
			(self.bar_line, self.bar, bar),
		):
			frappe.db.set_value(
				"Sales Invoice Item", row, {"preparation_station": station, "kds_status": status}
			)
		frappe.db.set_value("Sales Invoice", name, "kds_status", order)
		return name

	def seen(self, order):
		"""The statuses of the order, of its Kitchen dish and of its Bar dish."""
		return (
			frappe.db.get_value("Sales Invoice", order, "kds_status"),
			frappe.db.get_value("Sales Invoice Item", self.kitchen_line, "kds_status"),
			frappe.db.get_value("Sales Invoice Item", self.bar_line, "kds_status"),
		)

	def press(self, order, status, **kwargs):
		return restaurant_api.update_kds_status(order, status, **kwargs)

	# ------------------------------------------------------------------------------------------------ a station chosen

	def test_the_bars_ready_leaves_the_kitchens_dish_alone(self):
		order = self.an_order()

		self.press(order, "Ready", station=self.bar)

		# The Bar's drink is ready. The Kitchen's plate has not been started: it must not be told to the runner
		self.assertEqual(self.seen(order), ("Preparing", "Pending", "Ready"))

	def test_the_kitchens_start_leaves_the_bars_dish_alone(self):
		order = self.an_order()

		self.press(order, "Preparing", station=self.kitchen)

		self.assertEqual(self.seen(order), ("Preparing", "Preparing", "Pending"))

	def test_the_order_is_ready_only_when_every_dish_of_it_is_ready(self):
		order = self.an_order(kitchen="Preparing", bar="Preparing", order="Preparing")

		self.press(order, "Ready", station=self.bar)
		self.assertEqual(self.seen(order), ("Preparing", "Preparing", "Ready"))

		self.press(order, "Ready", station=self.kitchen)
		self.assertEqual(self.seen(order), ("Ready", "Ready", "Ready"))

	def test_the_order_is_delivered_once_every_dish_of_it_is_delivered(self):
		order = self.an_order(kitchen="Ready", bar="Ready", order="Ready")

		self.press(order, "Delivered", station=self.bar)
		# The Bar's drink is on the table, the plate is still at the pass: the order is not delivered
		self.assertEqual(self.seen(order), ("Ready", "Ready", "Delivered"))

		self.press(order, "Delivered", station=self.kitchen)
		self.assertEqual(self.seen(order), ("Delivered", "Delivered", "Delivered"))

	def test_a_station_never_moves_a_dish_backward(self):
		order = self.an_order(bar="Ready", order="Preparing")

		self.press(order, "Preparing", station=self.bar)

		self.assertEqual(self.seen(order), ("Preparing", "Pending", "Ready"))

	def test_a_dish_held_back_stays_held_back_whatever_the_button(self):
		order = self.an_order(bar="Waiting")

		self.press(order, "Ready", station=self.bar)

		# Nothing was started, and a Waiting dish is not the cook's to advance: the order is back to where it was
		self.assertEqual(self.seen(order), ("Pending", "Pending", "Waiting"))

	def test_a_second_round_at_a_station_does_not_reopen_the_delivered_one(self):
		# The starters (the Bar's drinks) were delivered, the mains of the Kitchen have just been sent
		order = self.an_order(kitchen="Pending", bar="Delivered", order="Pending")

		self.press(order, "Preparing", station=self.kitchen)

		self.assertEqual(self.seen(order), ("Preparing", "Preparing", "Delivered"))

	def test_a_station_that_is_not_one_is_refused_and_nothing_moves(self):
		order = self.an_order()

		with self.assertRaises(frappe.ValidationError):
			self.press(order, "Ready", station="_Test nowhere")

		self.assertEqual(self.seen(order), ("Pending", "Pending", "Pending"))

	def test_a_user_who_may_not_write_invoices_is_refused_with_a_station_too(self):
		order = self.an_order()

		with patch.object(frappe, "has_permission", return_value=False):
			with self.assertRaises(frappe.PermissionError):
				self.press(order, "Ready", station=self.bar)

		self.assertEqual(self.seen(order), ("Pending", "Pending", "Pending"))

	def test_the_screens_are_told_to_read_again(self):
		order = self.an_order()

		with patch.object(frappe, "publish_realtime") as publish:
			self.press(order, "Ready", station=self.bar)

		self.assertEqual({call.args[0] for call in publish.call_args_list}, {"kds_update", "table_update"})

	def test_the_kitchen_screen_of_each_station_reads_its_own_dishes_after_the_press(self):
		order = self.an_order()
		self.press(order, "Ready", station=self.bar)

		def lines_of(station):
			orders = {o["name"]: o for o in restaurant_api.get_kds_orders(station=station)}
			return {line["kds_status"] for line in orders[order]["items"]}

		self.assertEqual(lines_of(self.bar), {"Ready"})
		self.assertEqual(lines_of(self.kitchen), {"Pending"})

	# ------------------------------------------------------------------------------------------------ every station

	def test_with_every_station_the_cascade_is_the_one_it_always_was(self):
		order = self.an_order()

		self.press(order, "Preparing")
		self.assertEqual(self.seen(order), ("Preparing", "Preparing", "Preparing"))

		self.press(order, "Ready")
		self.assertEqual(self.seen(order), ("Ready", "Ready", "Ready"))

	def test_with_every_station_a_dish_further_along_stays_where_it_is_and_one_held_back_too(self):
		order = self.an_order(kitchen="Waiting", bar="Delivered", order="Pending")

		self.press(order, "Preparing")

		# The order takes the status asked, as ever; the Delivered dish is not moved back, the held back one is skipped
		self.assertEqual(self.seen(order), ("Preparing", "Waiting", "Delivered"))

	def test_with_no_station_named_the_old_two_argument_call_still_works(self):
		order = self.an_order()

		result = restaurant_api.update_kds_status(order, "Ready")

		self.assertEqual(result, {"status": "success"})
		self.assertEqual(self.seen(order), ("Ready", "Ready", "Ready"))

	def test_a_dish_started_on_its_own_leaves_the_status_of_the_order_alone(self):
		# The state the kitchen screen reads every day: the order still says Pending while a dish is Preparing. The screen
		# therefore reads the dishes it shows, not the order's status (task 23, ruling 78)
		order = self.an_order()

		restaurant_api.update_item_kds_status(order, self.fx.item, "Preparing")

		order_status, kitchen, bar = self.seen(order)
		self.assertEqual(order_status, "Pending")
		self.assertEqual({kitchen, bar}, {"Preparing"})
