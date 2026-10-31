# //// Neoffice — added file (no upstream equivalent).
"""What the runner's list tells about an order (NeoRestau lot 1, task 38b, rulings 122, 124, 126, 130).

The runner's card has the kitchen's anatomy: the room's code, the table, the ticket's number, and « Hand over » instead
of « Deliver » for a takeaway. `get_runner_orders` told none of it: its card could only show the table, and the invoice's
own name stood where the number should. It now carries `is_takeaway`, `takeaway_number`, `ticket_no` (with `ticket_digits`)
and `area_code`, as the kitchen's list does. The runner still lists the orders of the tables (a takeaway order has its own
list), so the flag is the order's own, as the screen reads it.
"""

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_ticket_numbers import TicketCase


class TestTheRunnerIsTold(TicketCase):
	def a_ready_order(self, table, **changes):
		order = self.save(restaurant_table=table, **changes)
		for line in frappe.get_all("Sales Invoice Item", filters={"parent": order.name}, pluck="name"):
			frappe.db.set_value(
				"Sales Invoice Item", line, {"preparation_station": self.station_a, "kds_status": "Ready"}
			)
		return order

	def runner_orders(self):
		return {o["name"]: o for o in restaurant_api.get_runner_orders(restaurant=self.a)}

	def test_an_order_carries_its_ticket_number_and_digits(self):
		frappe.db.set_value("Restaurant", self.a, "ticket_number_digits", 3)
		order = self.a_ready_order(self.table_a)

		told = self.runner_orders()[order.name]

		self.assertEqual((told["ticket_no"], told["ticket_digits"]), (1, 3))
		self.assertEqual(told["name"], order.name, "the name stays for the calls the screen makes")

	def test_an_order_carries_the_code_of_its_room(self):
		garden = self.make_room(self.a, label="Garden", short_code="gar")
		in_garden = self.a_ready_order(self.make_table(self.a, garden, table_name="G1"))
		in_room = self.a_ready_order(self.table_a)

		told = self.runner_orders()

		self.assertEqual(told[in_garden.name]["area_code"], "GAR")
		self.assertEqual(told[in_room.name]["area_code"], "R01")

	def test_an_order_carries_its_takeaway_flag_and_number(self):
		plain = self.a_ready_order(self.table_a)
		flagged = self.a_ready_order(self.table_a2)
		frappe.db.set_value("Sales Invoice", flagged.name, {"is_takeaway": 1, "takeaway_number": "T-005"})

		told = self.runner_orders()

		self.assertFalse(told[plain.name]["is_takeaway"])
		self.assertTrue(told[flagged.name]["is_takeaway"])
		self.assertEqual(told[flagged.name]["takeaway_number"], "T-005")
		self.assertEqual(told[flagged.name]["area_code"], "R01", "an order at a table keeps the room of the table")

	def test_the_tickets_of_two_orders_are_their_own(self):
		first = self.a_ready_order(self.table_a)
		second = self.a_ready_order(self.table_a2)

		told = self.runner_orders()

		self.assertEqual((told[first.name]["ticket_no"], told[second.name]["ticket_no"]), (1, 2))
