# //// Neoffice — added file (no upstream equivalent).
"""The dialog of a paid table says what the restaurant collected, the change handed back taken off (neoffice-maintenance#2163).

The restaurant's film (02.11.2026) paid 100 for a bill of 88: the dialog of the table read « Total collected CHF 100.00 » with
12 handed back. An invoice's `paid_amount` is what was tendered; the summary the dialog reads now carries the change and what
was collected (`collected_amount`), the tip included once (the till and the guest's payment both charge it). It is read by the
till's cashier, on the order of the tablets' fixture at its table.
"""

import frappe
from frappe.utils import nowdate

from pos_next.api import restaurant
from pos_next.tests.test_restaurant_devices import CASHIER, Tablets, as_user


class TestAPaidTableSaysWhatWasCollected(Tablets):
	def paid(self, grand_total, tendered, change):
		frappe.db.set_value(
			"Sales Invoice",
			self.order,
			{"grand_total": grand_total, "paid_amount": tendered, "change_amount": change},
		)

	def summary(self):
		with as_user(CASHIER):
			return restaurant.get_table_payment_summary(self.table)

	def test_a_note_of_100_for_a_bill_of_88_says_88_collected_and_12_handed_back(self):
		self.paid(88, 100, 12)

		summary = self.summary()

		self.assertEqual(summary["invoice"], self.order)
		self.assertEqual(summary["grand_total"], 88)
		self.assertEqual(summary["change_amount"], 12)
		self.assertEqual(summary["collected_amount"], 88)

	def test_the_exact_amount_says_the_bill(self):
		self.paid(56.5, 56.5, 0)

		self.assertEqual(self.summary()["collected_amount"], 56.5)

	def test_a_tip_is_in_what_was_paid_and_counted_once(self):
		# 100 handed over for 88, 5 left as a tip: 7 handed back, 93 collected (the tip's record says 5)
		self.paid(88, 100, 7)
		frappe.get_doc(
			{
				"doctype": "Restaurant Tip",
				"restaurant": self.bistro,
				"restaurant_table": self.table,
				"sales_invoice": self.order,
				"tip_date": nowdate(),
				"amount": 5,
				"status": "Collected",
			}
		).insert(ignore_permissions=True)

		summary = self.summary()

		self.assertEqual(summary["tip_total"], 5)
		self.assertEqual(summary["collected_amount"], 93)

	def test_each_line_says_where_the_kitchen_stands_on_it(self):
		"""The table of a bill paid before the plates are out shows what is still to come and what is on the table (08.11.2026)."""
		rows = frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, pluck="name")
		states = ["Ready", "Delivered", "Pending", "Preparing"][: len(rows)]
		for row, state in zip(rows, states, strict=False):
			frappe.db.set_value("Sales Invoice Item", row, "kds_status", state)

		items = self.summary()["items"]

		self.assertTrue(items)
		self.assertCountEqual([item["kds_status"] for item in items], states)

	def test_each_line_names_its_station_so_that_a_station_on_paper_alone_shows_no_state(self):
		items = self.summary()["items"]

		self.assertTrue(items)
		self.assertTrue(all("preparation_station" in item for item in items))
