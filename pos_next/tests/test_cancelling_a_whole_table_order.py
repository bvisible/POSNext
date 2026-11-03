# //// Neoffice — added file (no upstream equivalent).
"""A table's order cancelled as a whole once its last dish was taken off (NeoResto lot 1, Daniel, 03.11.2026).

« Back » asks, when a dish that had left for the kitchen was taken off; « send the cancellation » saves the order without the
dish, which tells the kitchen. When the dish was the LAST one there is no order left to save (an invoice has no line
to save), so the whole order is cancelled: the draft is deleted, which tells the kitchen's printers (the void hook), and the
table is free again. The suite pins that, and what the call refuses: a sale already submitted, an order that holds money, an
order that is no restaurant order, and anybody who works at no till.
"""

from unittest.mock import patch

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import ServiceCase


class TestAWholeTableOrderCancelled(ServiceCase):
	def an_order(self, status="Pending"):
		order = self.save([self.line(self.soup, status)])
		# What the helper's payload tenders is no guest's money: the order starts with none
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 0, update_modified=False)
		return order

	def test_the_draft_goes_the_kitchen_is_told_and_the_table_is_free_again(self):
		order = self.an_order()

		with patch("pos_next.api.kitchen_events.kitchen_void") as void:
			answer = restaurant_api.cancel_table_order(order)

		self.assertEqual(answer, {"status": "success"})
		self.assertFalse(frappe.db.exists("Sales Invoice", order))
		void.assert_called_once()
		self.assertEqual(void.call_args.args[0], order)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "status"), "Empty")

	def test_an_order_that_never_went_to_the_kitchen_goes_without_a_word(self):
		order = self.an_order("Waiting")

		with patch("pos_next.api.kitchen_events.kitchen_void") as void:
			restaurant_api.cancel_table_order(order)

		self.assertFalse(void.called)
		self.assertFalse(frappe.db.exists("Sales Invoice", order))

	def test_a_name_that_is_no_order_is_reported(self):
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.cancel_table_order("NOT-AN-ORDER")

	def test_a_sale_already_submitted_is_refused_and_stays(self):
		order = self.an_order()
		frappe.db.set_value("Sales Invoice", order, "docstatus", 1)

		with self.assertRaises(frappe.ValidationError):
			restaurant_api.cancel_table_order(order)

		self.assertTrue(frappe.db.exists("Sales Invoice", order))

	def test_an_order_that_holds_a_payment_is_refused_and_stays(self):
		# A guest paid from his phone: the money is on the order, a cancellation here would lose it
		order = self.an_order()
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 25, update_modified=False)

		with self.assertRaises(frappe.ValidationError):
			restaurant_api.cancel_table_order(order)

		self.assertTrue(frappe.db.exists("Sales Invoice", order))

	def test_an_order_that_is_no_restaurant_order_is_refused_and_stays(self):
		order = self.an_order()
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", None, update_modified=False)

		with self.assertRaises(frappe.ValidationError):
			restaurant_api.cancel_table_order(order)

		self.assertTrue(frappe.db.exists("Sales Invoice", order))

	def test_the_table_stays_occupied_when_another_order_still_names_it(self):
		order = self.an_order()
		# The till keeps one order per table, so a second draft naming it is made the way a stray one would be
		other = self.save([self.line(self.salad, "Pending")], restaurant_table=self.table_b)
		frappe.db.set_value("Sales Invoice", other, "restaurant_table", self.table_a, update_modified=False)
		self.assertNotEqual(order, other)

		restaurant_api.cancel_table_order(order)

		self.assertFalse(frappe.db.exists("Sales Invoice", order))
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "status"), "Occupied")
