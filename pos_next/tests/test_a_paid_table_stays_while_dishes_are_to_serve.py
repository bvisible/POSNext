# //// Neoffice — added file (no upstream equivalent).
"""A table that is paid while dishes or drinks are still to serve is not emptied (product owner, 08.11.2026).

« Quand on encaisse une table qui n'est pas encore livrée, le paiement vide la table […] on doit pouvoir encaisser une partie ou la totalité d'une
table sans que ça la vide s'il y a encore des plats, des boissons à servir. » The bill of a terrace table was settled with four dishes at the
kitchen, none delivered, and the table went to « to clean » a second later, under the plates of the party.

The rule: when a note is paid the table stays Occupied while another note is open (as before) OR a line of its paid notes is still at the kitchen
(sent and not delivered: `paid_orders.AT_THE_KITCHEN`, the lines the kitchen's and the pass's screens still show); it goes to Cleaning when the last
such line is delivered. The floor plan tells the table is paid and what is left, and a waiter may free it by hand.

The suite builds its own restaurants, tills, menu and orders (those of the notes suite) and rolls everything back. The people it acts as are the
waiter (the cashier of the till): never Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

import json

import frappe
from frappe.tests.roles import as_role
from frappe.utils import add_to_date, flt, now_datetime

from pos_next.api import invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import paid_orders
from pos_next.tests.test_the_notes_of_a_table import NotesCase
from pos_next.tests.test_till_writes_need_the_till import TILL, _sale


class ServedCase(NotesCase):
	def pay_lines(self, order, statuses, note=None, table=None):
		"""The payment of the order as the till sends it, with one line per status given (the kitchen state each line carries)."""
		lines = [self.line(self.soup, status) for status in statuses]
		# What the draft totals, taxes of the site included (the clone of the shop carries its VAT, a bare CI site none): the payment is exactly that
		owed = frappe.db.get_value("Sales Invoice", order, ["rounded_total", "grand_total"], as_dict=True)
		payload = _sale(
			self.fx,
			name=order,
			restaurant_table=table or self.table_a,
			items=lines,
			payments=[{"mode_of_payment": self.fx.mode, "amount": flt(owed.rounded_total) or flt(owed.grand_total)}],
		)
		if note is not None:
			payload["restaurant_note"] = note
		with as_role("cashier", email=TILL):
			return invoices.submit_invoice(invoice=json.dumps(payload), data="{}")

	def a_paid_order(self, statuses, **more):
		"""A table's order saved, then paid with lines in the given kitchen states; its name."""
		order = self.save([self.line(self.soup) for _ in statuses])
		self.pay_lines(order, statuses, **more)
		return order

	def lines_of_the_order(self, order):
		return frappe.get_all("Sales Invoice Item", filters={"parent": order}, pluck="name", order_by="idx asc")

	def deliver(self, order, *lines):
		with self.waiter():
			return restaurant_api.mark_items_delivered(order, json.dumps(list(lines)) if lines else None)

	def aged(self, order, hours):
		"""The order as if its last write was `hours` ago."""
		frappe.db.set_value(
			"Sales Invoice", order, "modified", add_to_date(now_datetime(), hours=-hours), update_modified=False
		)


class TestAPaidTableWithDishesToServeStaysOccupied(ServedCase):
	def test_a_table_paid_with_a_dish_at_the_kitchen_stays_occupied(self):
		for status in ("Pending", "Preparing", "Ready"):
			with self.subTest(status=status):
				order = self.a_paid_order([status])

				self.assertEqual(frappe.db.get_value("Sales Invoice", order, "docstatus"), 1)
				self.assertEqual(self.status_of_table(), "Occupied", "the dish is not on the table yet")

				frappe.db.set_value("Restaurant Table", self.table_a, "status", "Empty")

	def test_a_table_paid_with_everything_delivered_is_cleaned_as_before(self):
		self.a_paid_order(["Delivered"])

		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_a_line_that_never_left_for_the_kitchen_does_not_keep_the_table(self):
		"""A drink poured at the till, a pack of gum: no kitchen status says nothing is to be carried."""
		self.a_paid_order([""])

		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_one_dish_left_among_delivered_ones_is_enough(self):
		self.a_paid_order(["Delivered", "Delivered", "Ready"])

		self.assertEqual(self.status_of_table(), "Occupied")

	def test_the_other_tables_are_not_kept(self):
		self.a_paid_order(["Ready"])
		other = self.save(restaurant_table=self.table_a2)
		self.pay_lines(other, ["Delivered"], table=self.table_a2)

		self.assertEqual(self.status_of_table(), "Occupied")
		self.assertEqual(self.status_of_table(self.table_a2), "Cleaning")

	def test_a_paid_order_older_than_a_service_keeps_nobody(self):
		"""The kitchen's screens drop it after the hours of a service (paid_orders.SERVICE_HOURS): so does the table."""
		order = self.a_paid_order(["Pending"])
		self.aged(order, paid_orders.SERVICE_HOURS + 1)

		self.assertEqual(paid_orders.dishes_left_to_serve(self.table_a), 0)
		self.assertEqual(paid_orders.status_after_payment(self.table_a), "Cleaning")

	def test_the_status_hook_agrees_with_the_payment(self):
		order = self.a_paid_order(["Ready"])
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Cleaning")

		restaurant_api.on_invoice_update(frappe._dict(name=order, restaurant_table=self.table_a, docstatus=1), "on_submit")

		self.assertEqual(self.status_of_table(), "Occupied")


class TestTheLastDeliveryCleansTheTable(ServedCase):
	def test_delivering_the_last_dish_sends_the_table_to_cleaning(self):
		order = self.a_paid_order(["Ready"])
		self.assertEqual(self.status_of_table(), "Occupied")

		self.deliver(order)

		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_a_dish_delivered_while_another_remains_leaves_the_table_occupied(self):
		order = self.a_paid_order(["Ready", "Ready"])
		first, second = self.lines_of_the_order(order)

		self.deliver(order, first)
		self.assertEqual(self.status_of_table(), "Occupied", "the second dish is still to serve")

		self.deliver(order, second)
		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_the_whole_order_delivered_from_the_pass_cleans_the_table(self):
		order = self.a_paid_order(["Ready", "Preparing"])

		with self.waiter():
			restaurant_api.update_kds_status(order, "Delivered")

		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_a_dish_delivered_for_an_open_note_does_not_clean_the_table(self):
		first, second = self.two_notes()
		self.pay_lines(first, ["Ready"], note=1)
		self.assertEqual(self.status_of_table(), "Occupied")

		self.deliver(first)

		self.assertEqual(self.status_of_table(), "Occupied", "the party of the other note is still seated")

	def test_the_last_delivery_after_the_last_note_is_paid_cleans_the_table(self):
		first, second = self.two_notes()
		self.pay_lines(first, ["Ready"], note=1)
		self.pay_lines(second, ["Delivered"], note=2)
		self.assertEqual(self.status_of_table(), "Occupied", "the dish of the first note is still to serve")

		self.deliver(first)

		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_a_table_that_is_not_occupied_is_left_as_it_is(self):
		order = self.a_paid_order(["Ready"])
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Empty")

		self.deliver(order)

		self.assertEqual(self.status_of_table(), "Empty", "somebody emptied it by hand: a delivery does not clean it")

	def test_a_table_seated_again_is_not_cleaned_by_the_delivery_of_the_party_before(self):
		order = self.a_paid_order(["Ready"])
		self.save(restaurant_note=2)

		self.deliver(order)

		self.assertEqual(self.status_of_table(), "Occupied")

	def test_a_failure_to_release_never_fails_the_delivery(self):
		order = self.a_paid_order(["Ready"])
		before = frappe.db.count("Error Log", {"method": "Releasing a served table failed"})

		from unittest.mock import patch

		with patch.object(paid_orders, "release_when_served", side_effect=RuntimeError("boom")):
			answer = self.deliver(order)

		self.assertEqual(answer["status"], "success")
		self.assertEqual(frappe.db.count("Error Log", {"method": "Releasing a served table failed"}), before + 1)


class TestTheFloorTellsAPaidTable(ServedCase):
	def test_the_floor_tells_the_table_is_paid_and_how_many_lines_are_left(self):
		self.a_paid_order(["Ready", "Pending", "Delivered"])

		tile = self.floor()[self.table_a]

		self.assertEqual(tile["status"], "Occupied", "the floor read does not free it as an orphan")
		self.assertTrue(tile["order_summary"]["paid"])
		self.assertEqual(tile["order_summary"]["item_count"], 2)
		self.assertEqual(tile["order_summary"]["notes_count"], 0)

	def test_a_table_with_an_open_note_is_not_told_paid(self):
		first, second = self.two_notes()
		self.pay_lines(first, ["Ready"], note=1)

		tile = self.floor()[self.table_a]

		self.assertEqual(tile["status"], "Occupied")
		self.assertFalse(tile["order_summary"].get("paid"), "the open note speaks for the table")

	def test_an_occupied_table_with_nothing_to_serve_is_still_an_orphan(self):
		self.a_paid_order(["Delivered"])
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Occupied")

		tile = self.floor()[self.table_a]

		self.assertEqual(tile["status"], "Empty")
		self.assertIsNone(tile["order_summary"])

	def test_the_total_is_told_to_whoever_may_read_the_sales_invoices_only(self):
		self.a_paid_order(["Ready"])

		tile = self.floor()[self.table_a]

		self.assertIn("grand_total", tile["order_summary"])


class TestAWaiterMayFreeAPaidTable(ServedCase):
	def test_a_paid_table_kept_for_dishes_is_freed_by_hand(self):
		self.a_paid_order(["Ready"])
		self.assertEqual(self.status_of_table(), "Occupied")

		with self.waiter():
			restaurant_api.mark_table_available(self.table_a)

		self.assertEqual(self.status_of_table(), "Empty")

	def test_a_table_with_a_party_seated_is_not_freed_by_hand(self):
		self.save()

		with self.waiter(), self.assertRaises(frappe.ValidationError):
			restaurant_api.mark_table_available(self.table_a)

		self.assertEqual(self.status_of_table(), "Occupied")
