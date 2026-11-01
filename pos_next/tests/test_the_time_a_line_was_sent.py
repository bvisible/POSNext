# //// Neoffice — added file (no upstream equivalent).
"""The time each line of a table's order left for the kitchen (NeoRestau lot 1, Daniel's test of 01.11: « au sommet, on voit que le temps
est toujours le temps de départ […] il faudrait afficher le temps maintenant du départ du dessert »).

The timer at the head of a kitchen ticket counted from the order's last change, so a table that had eaten for three hours still read
« 3 h 03 » when its desserts were sent. A line carries now the time it LEFT (`kds_sent_at`), so that the ticket counts from the course
that is at the kitchen:

- a line that leaves in a save takes the time of that save; a line held back (Waiting) has none, until the save that releases it;
- a line that already left keeps its time when the till saves the order again (the document is rebuilt from the payload, which carries
  no time), and a save that sends nothing changes no time;
- the kitchen's and the runner's lists hand it back on every line.

The suite builds everything it needs (the menu of `test_service_families`, a restaurant, a table, a till) and rolls back.
"""

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import ServiceCase


class TheTimeALineWasSent(ServiceCase):
	def first_round(self):
		"""A drink, a starter, a main and a dessert ordered at once: the drink and the starter leave, the two courses after them wait."""
		return self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)]
		)

	def the_cart(self, mains, desserts):
		return [
			self.line(self.cola, "Pending", service_family="Drink"),
			self.line(self.soup, "Pending", service_family="Starter"),
			self.line(self.penne, mains, service_family="Main"),
			self.line(self.tart, desserts, service_family="Dessert"),
		]

	def sent_times(self, order):
		"""The time each line left, in the order of the lines (None for a line that has not left)."""
		return [
			row.kds_sent_at
			for row in frappe.get_all(
				"Sales Invoice Item", filters={"parent": order}, fields=["kds_sent_at"], order_by="idx asc"
			)
		]

	def test_the_lines_that_leave_in_the_first_save_take_its_time_and_the_held_ones_have_none(self):
		order = self.first_round()

		drink, starter, main, dessert = self.sent_times(order)

		self.assertTrue(drink)
		self.assertEqual(drink, starter, "one save, one time")
		self.assertIsNone(main)
		self.assertIsNone(dessert)

	def test_the_course_that_is_released_takes_the_time_of_its_own_save_and_the_others_keep_theirs(self):
		order = self.first_round()
		first = self.sent_times(order)[0]

		self.save(self.the_cart("Pending", "Waiting"), name=order)
		drink, starter, main, dessert = self.sent_times(order)

		self.assertEqual(drink, first, "a line that already left keeps its time")
		self.assertEqual(starter, first)
		self.assertGreater(main, first, "the mains left with the second send")
		self.assertIsNone(dessert)

		self.save(self.the_cart("Pending", "Pending"), name=order)
		drink, starter, main_again, dessert = self.sent_times(order)

		self.assertEqual(main_again, main, "the mains keep the time they left")
		self.assertGreater(dessert, main, "the desserts left with the third send")

	def test_a_save_that_sends_nothing_changes_no_time(self):
		order = self.first_round()
		self.save(self.the_cart("Pending", "Pending"), name=order)
		before = self.sent_times(order)

		self.save(self.the_cart("Pending", "Pending"), name=order)

		self.assertEqual(self.sent_times(order), before)

	def test_a_line_the_kitchen_moved_on_keeps_the_time_it_left(self):
		order = self.first_round()
		before = self.sent_times(order)

		for row in frappe.get_all("Sales Invoice Item", filters={"parent": order}, pluck="name"):
			frappe.db.set_value("Sales Invoice Item", row, "kds_status", "Preparing", update_modified=False)
		self.save(self.the_cart("Waiting", "Waiting"), name=order)

		self.assertEqual(self.sent_times(order)[:2], before[:2])

	def test_the_kitchens_list_hands_the_time_back_on_every_line(self):
		order = self.first_round()
		self.save(self.the_cart("Pending", "Waiting"), name=order)
		stored = dict(zip(["Cola", "Soup", "Penne", "Tart"], self.sent_times(order), strict=True))

		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		lines = {line["item_code"].replace("_Test SF ", ""): line for line in orders[order]["items"]}

		self.assertEqual(str(lines["Cola"]["kds_sent_at"]), str(stored["Cola"]))
		self.assertEqual(str(lines["Penne"]["kds_sent_at"]), str(stored["Penne"]))
		self.assertFalse(lines["Tart"]["kds_sent_at"], "a held line has not left")
