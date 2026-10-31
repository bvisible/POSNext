# //// Neoffice — added file (no upstream equivalent).
"""The till's invoice history says what each ticket holds (NeoRestau lot 1, task 29).

get_invoices serves the « Historique des factures » dialog: next to each invoice's number, customer, date and
amount, the row shows the first three lines of the ticket and how many lines it has, so that one sees at a glance
what a sale or a table's order was. Each row carries ``items_preview`` (up to three ``{item_name, qty, uom}``) and
``items_count``, both read in ONE query for the whole page, never one per row. ``uom`` is the line's unit only
when it is not the item's own unit (the till's cart says it the same way); a quantity stays as the invoice holds
it (a weighed 0.35 stays 0.35). A user who may not read an invoice gets no line of it, on top of the rule the
endpoint already had (the till's own users, or whoever reads sales invoices).
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

DESK = "history-desk@yopmail.com"
KITCHEN_ONLY = "history-no-invoice-right@yopmail.com"
OTHER_CUSTOMER = "_PNXT history other customer"


class TestInvoiceHistoryPreview(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		# update_invoice and submit_invoice commit: a no-op here keeps the test inside the transaction tearDown
		# rolls back. Stopped by addCleanup, which runs even when setUp fails.
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		# Neither assigned to the till nor reading sales invoices.
		_user(DESK, ["Blogger"], "System User")
		# Assigned to the till, as a cashier is, but holding no role that reads a sales invoice.
		_user(KITCHEN_ONLY, ["Blogger"], "System User")
		self.fx = _till_fixture()
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": KITCHEN_ONLY})
		profile.save(ignore_permissions=True)
		self.stock_uom = frappe.db.get_value("Item", self.fx.item, "stock_uom")
		self.other_uom = frappe.db.get_value("UOM", {"name": ["!=", self.stock_uom]}, "name")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		frappe.flags.ignore_account_permission = self.account_flag

	# ---- fixtures ----

	def _order(self, lines, pay=False, **changes):
		"""A ticket saved the way the till saves one (update_invoice, in the cashier's session), then, for a paid
		one, paid the way the till pays it (submit_invoice). ``lines`` are ``(name, qty)`` or ``(name, qty, uom)``;
		the names and units are written on the saved rows."""
		items = [
			{"item_code": self.fx.item, "qty": line[1], "rate": 10, "price_list_rate": 10} for line in lines
		]
		total = sum(10 * line[1] for line in lines)
		sale = _sale(
			self.fx, items=items, payments=[{"mode_of_payment": self.fx.mode, "amount": total}], **changes
		)
		frappe.set_user(TILL)
		try:
			name = invoices.update_invoice(json.dumps(sale))["name"]
			if pay:
				invoices.submit_invoice(invoice=json.dumps({**sale, "name": name}), data="{}")
		finally:
			frappe.set_user("Administrator")
		rows = frappe.get_all(
			"Sales Invoice Item", filters={"parent": name}, pluck="name", order_by="idx asc"
		)
		self.assertEqual(len(rows), len(lines), "the ticket must hold every line sent")
		for row, line in zip(rows, lines):
			values = {"item_name": line[0]}
			if len(line) > 2:
				values["uom"] = line[2]
			frappe.db.set_value("Sales Invoice Item", row, values)
		return name

	def _history(self, user=TILL, **kwargs):
		"""What the dialog receives, by invoice name."""
		frappe.set_user(user)
		try:
			rows = invoices.get_invoices(self.fx.profile, **kwargs)
		finally:
			frappe.set_user("Administrator")
		return {row.name: row for row in rows}

	# ---- what a row carries ----

	def test_a_table_order_shows_its_first_three_lines_and_the_number_of_lines(self):
		name = self._order(
			[("Pizza", 2), ("Cola", 1), ("Tiramisu", 1), ("Espresso", 1), ("Water", 3)]
		)
		row = self._history()[name]
		self.assertEqual(row.docstatus, 0)
		self.assertEqual(
			[(line["item_name"], line["qty"]) for line in row.items_preview],
			[("Pizza", 2), ("Cola", 1), ("Tiramisu", 1)],
		)
		self.assertEqual(row.items_count, 5)

	def test_a_paid_sale_shows_its_lines_too(self):
		name = self._order([("Burger", 2), ("Fries", 1)], pay=True)
		row = self._history()[name]
		self.assertEqual(row.docstatus, 1)
		self.assertEqual([line["item_name"] for line in row.items_preview], ["Burger", "Fries"])
		self.assertEqual(row.items_count, 2)

	def test_a_ticket_of_three_lines_has_nothing_left_over(self):
		name = self._order([("A", 1), ("B", 1), ("C", 1)])
		row = self._history()[name]
		self.assertEqual(len(row.items_preview), 3)
		self.assertEqual(row.items_count, 3)

	def test_a_weighed_quantity_stays_as_the_invoice_holds_it(self):
		name = self._order([("Salmon fillet", 0.35)])
		row = self._history()[name]
		self.assertEqual(row.items_preview[0]["qty"], 0.35)

	def test_the_unit_is_given_only_when_it_is_not_the_items_own(self):
		if not self.other_uom:
			self.skipTest("The site has a single unit of measure")
		name = self._order([("Wine", 1, self.other_uom), ("Bread", 1, self.stock_uom), ("Soup", 1)])
		row = self._history()[name]
		self.assertEqual(
			[(line["item_name"], line["uom"]) for line in row.items_preview],
			[("Wine", self.other_uom), ("Bread", None), ("Soup", None)],
		)

	def test_a_line_without_a_name_is_shown_by_its_item_code(self):
		name = self._order([("Soup", 1)])
		frappe.db.sql("update `tabSales Invoice Item` set item_name = '' where parent = %s", name)
		row = self._history()[name]
		self.assertEqual(row.items_preview[0]["item_name"], self.fx.item)

	def test_a_ticket_with_no_line_has_an_empty_preview(self):
		name = self._order([("Soup", 1)])
		frappe.db.delete("Sales Invoice Item", {"parent": name})
		row = self._history()[name]
		self.assertEqual(row.items_preview, [])
		self.assertEqual(row.items_count, 0)

	def test_each_row_carries_its_own_lines(self):
		first = self._order([("Soup", 1), ("Bread", 2)])
		second = self._order([("Steak", 1)])
		rows = self._history()
		self.assertEqual([line["item_name"] for line in rows[first].items_preview], ["Soup", "Bread"])
		self.assertEqual([line["item_name"] for line in rows[second].items_preview], ["Steak"])
		self.assertEqual((rows[first].items_count, rows[second].items_count), (2, 1))

	def test_the_full_lines_other_screens_filter_on_are_still_there(self):
		# InvoiceManagement searches the cached history by the items of each row: they stay, as they were.
		name = self._order([("Pizza", 2), ("Cola", 1), ("Tiramisu", 1), ("Espresso", 1)])
		row = self._history()[name]
		# (``row.items`` would be dict.items: a row is a _dict)
		self.assertEqual(
			[line["item_name"] for line in row["items"]], ["Pizza", "Cola", "Tiramisu", "Espresso"]
		)
		self.assertEqual(sorted(row["items"][0]), ["amount", "item_code", "item_name", "qty", "rate"])

	# ---- one batch ----

	def _queries_of(self, call):
		"""How many statements ``call`` sends to the database."""
		seen = []
		real = frappe.local.db.sql

		def counting(*args, **kwargs):
			seen.append(1)
			return real(*args, **kwargs)

		with patch.object(frappe.local.db, "sql", side_effect=counting):
			call()
		return len(seen)

	def _measured_history(self):
		"""The statements of one call, after a first one has warmed the caches (permissions, meta) that creating
		invoices may have emptied, so that only the endpoint's own reads count."""
		self._history()
		return self._queries_of(lambda: self._history())

	def test_the_preview_costs_the_same_queries_for_two_rows_and_for_ten(self):
		for number in range(2):
			self._order([(f"Dish {number}", 1), ("Side", 2), ("Drink", 1), ("Dessert", 1)])
		few = self._measured_history()
		for number in range(8):
			self._order([(f"Dish {number}", 1), ("Side", 2), ("Drink", 1), ("Dessert", 1)])
		many = self._measured_history()
		self.assertEqual(len(self._history()), 10)
		self.assertEqual(many, few, "the number of queries grew with the number of rows")

	# ---- who gets the lines ----

	def test_a_user_the_endpoint_refuses_gets_nothing(self):
		self._order([("Soup", 1)])
		frappe.set_user(DESK)
		try:
			# The endpoint's own gate, unchanged, refuses with a ValidationError
			with self.assertRaises((frappe.ValidationError, frappe.PermissionError)):
				invoices.get_invoices(self.fx.profile)
		finally:
			frappe.set_user("Administrator")

	def test_a_user_who_may_not_read_invoices_gets_the_rows_without_their_lines(self):
		name = self._order([("Soup", 1), ("Bread", 2)])
		row = self._history(user=KITCHEN_ONLY)[name]
		self.assertEqual(row.items_preview, [])
		self.assertEqual(row.items_count, 0)
		self.assertEqual(row["items"], [])

	def test_an_invoice_a_user_permission_cuts_loses_its_lines_for_that_user_only(self):
		if not frappe.db.exists("Customer", OTHER_CUSTOMER):
			frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": OTHER_CUSTOMER,
					"customer_type": "Individual",
					"customer_group": invoices._leaf_customer_group(),
					"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name")
					or "All Territories",
				}
			).insert(ignore_permissions=True)
		other_customers_sale = self._order([("Secret dish", 1)], customer=OTHER_CUSTOMER)
		usual_sale = self._order([("Soup", 1)])
		# The cashier may only work with the usual customer.
		frappe.get_doc(
			{"doctype": "User Permission", "user": TILL, "allow": "Customer", "for_value": self.fx.customer}
		).insert(ignore_permissions=True)
		frappe.clear_cache(user=TILL)
		rows = self._history(user=TILL)
		self.assertEqual([line["item_name"] for line in rows[usual_sale].items_preview], ["Soup"])
		self.assertEqual(rows[other_customers_sale].items_preview, [])
		self.assertEqual(rows[other_customers_sale].items_count, 0)
		# The administrator still reads both.
		everything = self._history(user="Administrator")
		self.assertEqual(everything[other_customers_sale].items_preview[0]["item_name"], "Secret dish")
