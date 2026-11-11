# //// Neoffice — added file (no upstream equivalent).
"""A line of an order moves at the kitchen by its own id, apart from the other lines of the same dish (maintenance#2075).

The kitchen's state of a table's dish (Pending, Preparing, Ready, Delivered) was written by item code: two lines of one dish
(another round, another course) shared one state, and marking the second round ready marked the first too. The kitchen's call
now takes the line's id (`row`, the Sales Invoice Item's name): only that line moves. Without it every line of the dish moves,
as it always did, so the screens that do not send it yet keep working.

The suite builds its restaurant, its stations and a draft order of two lines of one dish (Administrator lays the scenery), plays the
moves as a cashier of the till, and rolls back.
"""

import frappe

# //// Neoffice — the people a test acts as (neoffice-maintenance#2125): the moves are the kitchen's, played by a cashier of the till.
from frappe.tests.roles import as_role

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_kitchen_partial_ready import PartialCase


class TestALineMovesAlone(PartialCase):
	def setUp(self):
		super().setUp()
		# Two rounds of one dish: the first is cooking, the second has just been sent
		self.an_order(lines=((2, "Preparing", 0, 0), (3, "Pending", 0, 0)))
		self.first, self.second = self.rows

	def test_the_line_named_moves_and_the_other_round_of_the_dish_stays(self):
		with as_role("cashier"):
			restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready", row=self.first)

		self.assertEqual(self.state(self.first)[0], "Ready")
		self.assertEqual(self.state(self.second)[0], "Pending")

	def test_the_line_alone_is_enough_without_the_dish(self):
		with as_role("cashier"):
			restaurant_api.update_item_kds_status(self.name, None, "Preparing", row=self.second)

		self.assertEqual((self.state(self.first)[0], self.state(self.second)[0]), ("Preparing", "Preparing"))

	def test_units_ready_count_on_the_line_named_only(self):
		with as_role("cashier"):
			restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready", qty=2, row=self.second)

		self.assertEqual(self.state(self.second)[:2], ("Preparing", 2))
		self.assertEqual(self.state(self.first)[:2], ("Preparing", 0))

	def test_a_line_of_another_order_is_not_moved(self):
		# the order of another table of the restaurant (a save on the same table goes to the same draft)
		second_table = self.make_table(self.a, self.room_a, table_name="Second table")
		other = self.save(
			restaurant_table=second_table, items=[{"item_code": self.fx.item, "qty": 1, "rate": 10}]
		).name
		self.assertNotEqual(other, self.name)
		row = frappe.db.get_value("Sales Invoice Item", {"parent": other}, "name")
		before = frappe.db.get_value("Sales Invoice Item", row, "kds_status")

		# A line the order does not have is said, never a success that moved nothing
		with as_role("cashier"), self.assertRaises(frappe.DoesNotExistError):
			restaurant_api.update_item_kds_status(self.name, self.fx.item, "Delivered", row=row)

		self.assertEqual(frappe.db.get_value("Sales Invoice Item", row, "kds_status"), before)
		self.assertEqual((self.state(self.first)[0], self.state(self.second)[0]), ("Preparing", "Pending"))

	def test_without_a_line_every_line_of_the_dish_moves_as_before(self):
		with as_role("cashier"):
			restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready")

		self.assertEqual((self.state(self.first)[0], self.state(self.second)[0]), ("Ready", "Ready"))

	def test_a_line_the_till_has_saved_again_is_said_and_nothing_moves(self):
		# The screen read the order, then the till saved the table again: its lines are new, the id the screen holds is gone
		gone = self.second
		frappe.db.delete("Sales Invoice Item", {"name": gone})

		with as_role("cashier"), self.assertRaises(frappe.DoesNotExistError):
			restaurant_api.update_item_kds_status(self.name, self.fx.item, "Ready", row=gone)

		self.assertEqual(self.state(self.first)[0], "Preparing")

	def test_the_kitchen_reads_each_line_with_its_id(self):
		# The screen moves a line by the id it was given: the kitchen's reading carries it, one per line
		with as_role("cashier"):
			orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}

		self.assertEqual([line.get("name") for line in orders[self.name]["items"]], [self.first, self.second])
