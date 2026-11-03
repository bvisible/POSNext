# //// Neoffice — added file (no upstream equivalent).
"""A bill settled while a dish is still at the kitchen leaves its ticket on the screens until the dish is delivered.

The restaurant's film (02.11.2026, neoffice-maintenance#2163) paid a table whose main course was cooking: the kitchen's and the
runner's screens read the drafts only, so the ticket vanished from the kitchen with the plate on the stove, and the runner
never saw it come up. The suite pays the Bistro's order of the tablets' fixture (a dish at the grill and one at the pastry,
both sent) and reads both screens, then moves its dishes from the tablets as a draft's are moved. An order paid before the
hours of a service, and an order whose dishes are all delivered, stay off the screens.
"""

import frappe
from frappe.utils import add_to_date, now_datetime

from pos_next.api import restaurant
from pos_next.restaurant import paid_orders
from pos_next.tests.test_restaurant_devices import KITCHEN, RUNNER, Tablets, as_user


class TestAPaidOrderStaysAtTheKitchen(Tablets):
	def setUp(self):
		super().setUp()
		self.kitchen_tablet = self.tablet(self.bistro, KITCHEN)
		self.runner_tablet = self.tablet(self.bistro, RUNNER)

	def pay(self, hours_ago=0):
		"""The order is paid: submitted, now or `hours_ago` hours ago."""
		if hours_ago:
			frappe.db.set_value(
				"Sales Invoice",
				self.order,
				{"docstatus": 1, "modified": add_to_date(now_datetime(), hours=-hours_ago)},
				update_modified=False,
			)
		else:
			frappe.db.set_value("Sales Invoice", self.order, "docstatus", 1)

	def dishes(self, status):
		for row in frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, pluck="name"):
			frappe.db.set_value("Sales Invoice Item", row, "kds_status", status)

	def on_the_kitchen_screen(self, user="Administrator"):
		with as_user(user):
			return self.order in {
				order["name"] for order in restaurant.get_kds_orders(restaurant=self.bistro)
			}

	def on_the_runner_screen(self, user="Administrator"):
		with as_user(user):
			return self.order in {
				order["name"] for order in restaurant.get_runner_orders(restaurant=self.bistro)
			}

	def test_a_paid_order_whose_dishes_cook_stays_on_the_kitchen_screen(self):
		self.assertTrue(self.on_the_kitchen_screen(), "the draft is on the kitchen's screen")

		self.pay()

		self.assertTrue(
			self.on_the_kitchen_screen(), "paid, its dishes still cooking: still on the kitchen's screen"
		)
		self.assertTrue(self.on_the_kitchen_screen(self.kitchen_tablet), "and on the kitchen's tablet")

	def test_its_dishes_ready_come_up_on_the_runners_screen(self):
		self.pay()
		self.dishes("Ready")

		self.assertTrue(self.on_the_runner_screen(), "a dish of a paid table is still to carry")
		self.assertTrue(self.on_the_runner_screen(self.runner_tablet))

	def test_the_tablets_move_its_dishes_until_they_are_delivered(self):
		self.pay()

		with as_user(self.kitchen_tablet):
			restaurant.update_kds_status(self.order, "Ready")
		self.assertTrue(self.on_the_runner_screen(self.runner_tablet))
		with as_user(self.runner_tablet):
			restaurant.mark_items_delivered(self.order)

		statuses = set(
			frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, pluck="kds_status")
		)
		self.assertEqual(statuses, {"Delivered"})
		self.assertEqual(frappe.db.get_value("Sales Invoice", self.order, "kds_status"), "Delivered")
		self.assertFalse(self.on_the_kitchen_screen(), "delivered: the ticket leaves the kitchen")
		self.assertFalse(self.on_the_runner_screen(), "and the runner")

	def test_a_paid_order_whose_dishes_are_delivered_is_on_no_screen(self):
		self.dishes("Delivered")
		self.pay()

		self.assertFalse(self.on_the_kitchen_screen())
		self.assertFalse(self.on_the_runner_screen())

	def test_an_order_paid_before_the_hours_of_a_service_stays_off_the_screens_and_refused(self):
		self.pay(hours_ago=paid_orders.SERVICE_HOURS + 1)
		self.dishes("Ready")

		self.assertFalse(self.on_the_kitchen_screen())
		self.assertFalse(self.on_the_runner_screen())
		with as_user(self.kitchen_tablet), self.assertRaises(frappe.PermissionError):
			restaurant.update_kds_status(self.order, "Delivered")
		with as_user(self.runner_tablet), self.assertRaises(frappe.PermissionError):
			restaurant.mark_items_delivered(self.order)
