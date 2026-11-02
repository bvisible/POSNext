# //// Neoffice — added file (no upstream equivalent).
"""A dish taken back after it went to the kitchen is told to the kitchen's printers (NeoResto lot 1, Daniel, 02.11.2026: a kitchen with no
screen at all, only tickets).

POS Next names the moments, the printing app prints: the listeners of `pos_next_kitchen_send` are called at every save of an order that
has been at the kitchen, whatever is left on it (a dish or a quantity taken off, or nothing at all but lines held back), and the
listeners of `pos_next_kitchen_void` when a table's draft order is deleted. The suite pins that those moments are named, and only those.
"""

from unittest.mock import Mock, patch

import frappe

from pos_next.tests.test_service_families import ServiceCase


class TestTheKitchenIsToldWhatWasTakenBack(ServiceCase):
	def sent(self):
		return self.line(self.soup, "Pending")

	def test_an_order_saved_after_a_send_tells_the_kitchen_even_when_nothing_is_left_at_it(self):
		order = self.save([self.sent(), self.line(self.penne, "Waiting")])

		with patch("pos_next.api.kitchen_events.kitchen_send") as kitchen:
			self.save([self.line(self.penne, "Waiting")], name=order)

		self.assertTrue(kitchen.called, "the soup was taken off: a printer that printed it has to cancel it")

	def test_an_order_saved_after_a_send_with_the_dish_still_on_it_tells_the_kitchen_as_it_always_did(self):
		order = self.save([self.sent()])

		with patch("pos_next.api.kitchen_events.kitchen_send") as kitchen:
			self.save([self.sent(), self.line(self.salad, "Pending")], name=order)

		self.assertTrue(kitchen.called)

	def test_an_order_that_never_went_to_the_kitchen_tells_it_nothing(self):
		order = self.save([self.line(self.soup, "Waiting")])

		with patch("pos_next.api.kitchen_events.kitchen_send") as kitchen:
			self.save([self.line(self.penne, "Waiting")], name=order)

		self.assertFalse(kitchen.called)


class TestTheKitchenIsToldAnOrderIsGone(ServiceCase):
	def test_a_draft_order_that_went_to_the_kitchen_and_is_deleted_tells_the_kitchen(self):
		order = self.save([self.line(self.soup, "Pending")])

		with patch("pos_next.api.kitchen_events.kitchen_void") as void:
			frappe.delete_doc("Sales Invoice", order, force=1, ignore_permissions=True)

		void.assert_called_once()
		self.assertEqual(void.call_args.args[0], order)

	def test_a_draft_order_that_never_went_to_the_kitchen_is_deleted_without_a_word(self):
		order = self.save([self.line(self.soup, "Waiting")])

		with patch("pos_next.api.kitchen_events.kitchen_void") as void:
			frappe.delete_doc("Sales Invoice", order, force=1, ignore_permissions=True)

		self.assertFalse(void.called)

	def test_a_sale_cancelled_later_tells_the_kitchen_nothing(self):
		# The kitchen has long done with a paid order: a cancellation of the sale is the accountant's, not a ticket to cook
		order = self.save([self.line(self.soup, "Delivered")])
		frappe.db.set_value("Sales Invoice", order, "docstatus", 1)

		with patch("pos_next.api.kitchen_events.kitchen_void") as void:
			frappe.get_doc("Sales Invoice", order).run_method("on_trash")

		self.assertFalse(void.called)

	def test_a_listener_that_fails_never_stops_the_order(self):
		order = self.save([self.line(self.soup, "Pending")])
		broken = Mock(side_effect=RuntimeError("printer gone"))

		with patch("pos_next.api.kitchen_events._listeners", return_value=[broken]):
			frappe.delete_doc("Sales Invoice", order, force=1, ignore_permissions=True)

		broken.assert_called_once_with(order)
		self.assertFalse(frappe.db.exists("Sales Invoice", order))
