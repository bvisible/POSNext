# //// Neoffice — added file (no upstream equivalent).
"""A table opened again names its customer by his name (neoffice-maintenance#2163).

The restaurant's film (02.11.2026) opened a table again and the till's header showed a customer with no name. The order of a
table now carries the customer's name beside his record's name, which is a code on a site that numbers its customers; the till
puts both in the cart as it does for a customer it picked (composables/useOpenTable). It is read by the till's cashier, on the
order of the tablets' fixture at its table.
"""

import frappe

from pos_next.api import restaurant
from pos_next.tests.test_restaurant_devices import CASHIER, Tablets, as_user


class TestAReopenedTableNamesItsCustomer(Tablets):
	def test_the_order_of_the_table_carries_the_name_of_its_customer(self):
		customer = frappe.db.get_value("Sales Invoice", self.order, "customer")
		frappe.db.set_value("Sales Invoice", self.order, "customer_name", "_Test Marie Dupont")

		with as_user(CASHIER):
			order = restaurant.get_table_order(self.table)

		self.assertEqual(order["name"], self.order)
		self.assertEqual(order["customer"], customer)
		self.assertEqual(order["customer_name"], "_Test Marie Dupont")
