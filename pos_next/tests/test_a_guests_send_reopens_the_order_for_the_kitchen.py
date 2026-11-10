# //// Neoffice — added file (no upstream equivalent).
"""Drinks ordered from the QR of a table whose starter is delivered reach the bar's screen (Daniel's test of 10.11.2026).

On osiris the order of a table had its starter delivered (so the order's own `kds_status` was Delivered, which `_follow_the_dishes` writes when
nothing is left to cook) and a guest then sent three drinks from the table's QR and paid. The three lines were stored Pending, the bar's chip
counted them and its screen said « Aucune commande »: the kitchen's screen reads the order's status FIRST (`kitchenStatusOf`), the guest's send
never wrote it, and nobody made the drinks while the paid table stayed Occupied for them. A send from the guest page now does what the till's save
does when lines leave for the kitchen: the lines take the time they left, and the order takes the status its dishes give it.

The suite builds the Direct to Kitchen restaurant of `test_a_guest_can_order_from_the_qr`, delivers the starter of an order, then orders as the Guest user.
"""

import json

import frappe

from pos_next.api import guest_ordering, restaurant
from pos_next.tests.test_service_families import ServiceCase


class TestAGuestSendReopensTheOrder(ServiceCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value(
			"Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": "Direct to Kitchen"}
		)
		self.on_the_guest_menu(self.a, self.cola, self.soup)
		self.token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_a,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)
		self.addCleanup(frappe.set_user, frappe.session.user)

	def order(self, *codes):
		items = [{"item_code": code, "qty": 1, "rate": 5} for code in codes]
		frappe.set_user("Guest")
		try:
			return guest_ordering.submit_guest_order(self.token.token, json.dumps(items))
		finally:
			frappe.set_user("Administrator")

	def a_table_whose_first_round_is_delivered(self):
		"""The order of the table, its first round sent (by a guest) and delivered: the order says Delivered, as the kitchen's moves write it.

		Made by a guest's send, not by the till's save: the dish it stands for is of no matter, the order is Delivered with nothing left to cook."""
		order = self.order(self.soup)["invoice"]
		for dish in frappe.get_all(
			"Sales Invoice Item", filters={"parent": order}, fields=restaurant._dish_fields()
		):
			restaurant._write_dish(dish, "Delivered")
		restaurant._follow_the_dishes(order)
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "kds_status"), "Delivered")
		return order

	def header(self, order):
		return frappe.db.get_value("Sales Invoice", order, "kds_status")

	def lines(self, order):
		return {
			row.item_code: row
			for row in frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": order},
				fields=["item_code", "kds_status", "kds_sent_at", "kds_batch"],
			)
		}

	def test_the_order_takes_the_status_its_new_drinks_give_it(self):
		order = self.a_table_whose_first_round_is_delivered()

		self.order(self.cola)

		self.assertEqual(self.header(order), "Pending")
		self.assertEqual(self.lines(order)[self.cola].kds_status, "Pending")

	def test_the_kitchens_screen_is_handed_the_order_with_its_drinks_to_make(self):
		order = self.a_table_whose_first_round_is_delivered()

		self.order(self.cola)

		handed = {o["name"]: o for o in restaurant.get_kds_orders(restaurant=self.a)}
		self.assertIn(order, handed)
		# What `kitchenStatusOf` reads first: the order must not say Delivered while a dish is still to make
		self.assertNotEqual(handed[order]["kds_status"], "Delivered")
		self.assertIn(self.cola, [line["item_code"] for line in handed[order]["items"]])

	def test_the_lines_of_the_send_take_the_time_they_left_and_the_delivered_one_keeps_its_own(self):
		order = self.a_table_whose_first_round_is_delivered()
		before = self.lines(order)[self.soup].kds_sent_at
		self.assertIsNotNone(before, "the first send was recorded as sent")

		self.order(self.cola)

		lines = self.lines(order)
		self.assertIsNotNone(lines[self.cola].kds_sent_at)
		self.assertEqual(lines[self.soup].kds_sent_at, before)

	def test_a_second_send_after_the_first_was_delivered_reopens_the_order_again(self):
		first = self.order(self.cola)["invoice"]
		for dish in frappe.get_all(
			"Sales Invoice Item", filters={"parent": first}, fields=restaurant._dish_fields()
		):
			restaurant._write_dish(dish, "Delivered")
		restaurant._follow_the_dishes(first)
		self.assertEqual(self.header(first), "Delivered")

		second = self.order(self.cola)["invoice"]

		self.assertEqual(first, second)
		self.assertEqual(self.header(first), "Pending")
		self.assertEqual(sorted(int(row.kds_batch or 0) for row in self.lines_of(first)), [1, 2])

	def test_a_first_send_gives_its_order_a_status_and_a_time(self):
		invoice = self.order(self.cola)["invoice"]

		self.assertEqual(self.header(invoice), "Pending")
		self.assertIsNotNone(self.lines(invoice)[self.cola].kds_sent_at)

	def test_lines_held_for_the_waiter_are_not_recorded_as_sent(self):
		frappe.db.set_value("Restaurant", self.a, "qr_order_validation", "Server Approval")
		order = self.a_table_whose_first_round_is_delivered()

		self.order(self.cola)

		line = self.lines(order)[self.cola]
		self.assertEqual(line.kds_status, "Waiting")
		self.assertIsNone(line.kds_sent_at)
		# Nothing was sent: the order is as the kitchen left it
		self.assertEqual(self.header(order), "Delivered")
