# //// Neoffice — added file (no upstream equivalent).
"""The till's invoice history says what each ticket holds (NeoRestau lot 1, task 29).

get_invoices serves the « Historique des factures » dialog: next to each invoice's number, customer, date and
amount, the row shows the first three dishes of the ticket and how many dishes it has, so that one sees at a glance
what a sale or a table's order was. Each row carries ``items_preview`` (up to three ``{item_name, qty, uom}``) and
``items_count``, both read in ONE query for the whole page, never one per row. ``uom`` is the line's unit only
when it is not the item's own unit (the till's cart says it the same way); a quantity stays as the invoice holds
it (a weighed 0.35 stays 0.35). The restaurant's tip line, which goes after the dishes, and the internal items are
no dish: neither shown nor counted (``items`` keeps every line). A user who may not read an invoice gets no line of
it, on top of the rule the endpoint already had (the till's own users, or whoever reads sales invoices).
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

# A Website User assigned to the till, a Website User who is not, and a desk user assigned to it who reads no invoice
PORTAL_ASSIGNED = "history-portal-assigned@yopmail.com"
PORTAL_STRANGER = "history-portal-stranger@yopmail.com"
KITCHEN_ONLY = "history-no-invoice-right@yopmail.com"
OTHER_CUSTOMER = "_PNXT history other customer"
TIP_ITEM = "_PNXT history tip item"
INTERNAL_ITEM = "_PNXT history internal item"


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
		# Website Users, the portal's customers: one is assigned to the till (a row of its user table), one is not.
		_user(PORTAL_ASSIGNED, ["Customer"], "Website User")
		_user(PORTAL_STRANGER, ["Customer"], "Website User")
		# Assigned to the till, as a cashier is, but holding no role that reads a sales invoice.
		_user(KITCHEN_ONLY, ["Blogger"], "System User")
		self.fx = _till_fixture()
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": KITCHEN_ONLY})
		profile.append("applicable_for_users", {"user": PORTAL_ASSIGNED})
		profile.save(ignore_permissions=True)
		self.stock_uom = frappe.db.get_value("Item", self.fx.item, "stock_uom")
		self.other_uom = frappe.db.get_value("UOM", {"name": ["!=", self.stock_uom]}, "name")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		frappe.flags.ignore_account_permission = self.account_flag

	# ---- fixtures ----

	def _order(self, lines, pay=False, at=None, **changes):
		"""A ticket saved the way the till saves one (update_invoice, in the cashier's session), then, for a paid
		one, paid the way the till pays it (submit_invoice). ``lines`` are ``(name, qty)`` or ``(name, qty, uom)``;
		the names and units are written on the saved rows. ``at`` is a ``(posting_date, posting_time)`` written on
		the invoice, to fix the order of a list (newest first)."""
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
		if at:
			frappe.db.set_value("Sales Invoice", name, {"posting_date": at[0], "posting_time": at[1]})
		return name

	def _the_last_line_is(self, name, item_code):
		"""Make the last line of a ticket another item: a tip is added after the dishes."""
		rows = frappe.get_all("Sales Invoice Item", filters={"parent": name}, pluck="name", order_by="idx asc")
		frappe.db.set_value("Sales Invoice Item", rows[-1], "item_code", item_code)

	def _other_customer(self):
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
		return OTHER_CUSTOMER

	def _rows(self, user=TILL, **kwargs):
		"""What the dialog receives, in the order of the list."""
		frappe.set_user(user)
		try:
			return invoices.get_invoices(self.fx.profile, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def _history(self, user=TILL, **kwargs):
		"""What the dialog receives, by invoice name."""
		return {row.name: row for row in self._rows(user, **kwargs)}

	# ---- what a row carries ----

	def test_a_table_order_shows_its_first_three_dishes_and_the_number_of_dishes(self):
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

	def test_a_ticket_of_three_dishes_has_nothing_left_over(self):
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

	# ---- the tip line and the internal items are no dish ----

	def test_the_tip_line_is_not_a_dish_of_the_preview_nor_of_the_count(self):
		# update_invoice appends the tip after the dishes: three dishes and a tip must not read « +1 article »
		three_dishes = self._order([("Pizza", 1), ("Cola", 1), ("Tiramisu", 1), ("Tip", 1)])
		two_dishes = self._order([("Pizza", 1), ("Cola", 1), ("Tip", 1)])
		for name in (three_dishes, two_dishes):
			self._the_last_line_is(name, TIP_ITEM)
		with patch.object(invoices, "_tip_item_of", return_value=TIP_ITEM):
			rows = self._history()
		self.assertEqual(
			[line["item_name"] for line in rows[three_dishes].items_preview], ["Pizza", "Cola", "Tiramisu"]
		)
		self.assertEqual(rows[three_dishes].items_count, 3)
		self.assertEqual([line["item_name"] for line in rows[two_dishes].items_preview], ["Pizza", "Cola"])
		self.assertEqual(rows[two_dishes].items_count, 2)
		# The full lines keep the tip: the eye icon and the screens that filter on `items` still see it
		self.assertEqual(len(rows[three_dishes]["items"]), 4)
		self.assertEqual(rows[three_dishes]["items"][-1]["item_code"], TIP_ITEM)

	def test_a_ticket_with_only_a_tip_shows_nothing(self):
		name = self._order([("Tip", 1)])
		self._the_last_line_is(name, TIP_ITEM)
		with patch.object(invoices, "_tip_item_of", return_value=TIP_ITEM):
			row = self._history()[name]
		self.assertEqual((row.items_preview, row.items_count), ([], 0))

	def test_a_till_with_no_tip_item_counts_every_line(self):
		name = self._order([("Pizza", 1), ("Cola", 1), ("Tip", 1)])
		self._the_last_line_is(name, TIP_ITEM)
		with patch.object(invoices, "_tip_item_of", return_value=None):
			row = self._history()[name]
		self.assertEqual(row.items_count, 3)
		self.assertEqual(len(row.items_preview), 3)

	def test_the_till_of_the_fixture_belongs_to_no_restaurant_so_it_has_no_tip_item(self):
		self.assertFalse(invoices._tip_item_of(self.fx.profile))

	def test_an_internal_item_is_not_a_dish_of_the_preview(self):
		if not frappe.db.has_column("Item", "is_internal_item"):
			self.skipTest("The site has no Item.is_internal_item (a Custom Field of neoffice_theme)")
		# Not a copy of the fixture's item: a Neoffice field of Item (neo_item_uid) is unique, a copy repeats it
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": INTERNAL_ITEM,
				"item_name": INTERNAL_ITEM,
				"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft"),
				"stock_uom": self.stock_uom,
				"is_stock_item": 0,
				"is_sales_item": 1,
				"is_internal_item": 1,
			}
		).insert(ignore_permissions=True)
		name = self._order([("Pizza", 1), ("Deposit", 1)])
		self._the_last_line_is(name, INTERNAL_ITEM)
		row = self._history()[name]
		self.assertEqual([line["item_name"] for line in row.items_preview], ["Pizza"])
		self.assertEqual(row.items_count, 1)
		self.assertEqual(len(row["items"]), 2)

	# ---- pages and filters ----

	def test_each_page_carries_the_lines_of_its_own_invoices(self):
		names = [
			self._order(
				[(f"Dish {number}", 1), (f"Side {number}", 2)], at=("2026-10-20", f"10:0{number}:00")
			)
			for number in range(5)
		]
		newest_first = list(reversed(names))
		pages = [self._rows(limit=2, offset=offset) for offset in (0, 2, 4)]
		self.assertEqual(
			[[row.name for row in page] for page in pages],
			[newest_first[0:2], newest_first[2:4], newest_first[4:]],
		)
		for row in (row for page in pages for row in page):
			number = names.index(row.name)
			self.assertEqual(
				[line["item_name"] for line in row.items_preview], [f"Dish {number}", f"Side {number}"]
			)
			self.assertEqual(row.items_count, 2)

	def test_a_search_a_date_and_a_status_filter_keep_each_rows_own_lines(self):
		customer = self._other_customer()
		soup = self._order([("Soup", 1)], at=("2026-09-01", "12:00:00"))
		steak = self._order(
			[("Steak", 1), ("Wine", 2)], pay=True, customer=customer, at=("2026-10-20", "12:00:00")
		)

		def dishes(rows):
			return {row.name: [line["item_name"] for line in row.items_preview] for row in rows}

		both = {soup: ["Soup"], steak: ["Steak", "Wine"]}
		self.assertEqual(dishes(self._rows()), both)
		# by the customer's name, by the number of an invoice
		self.assertEqual(dishes(self._rows(search="history other customer")), {steak: ["Steak", "Wine"]})
		self.assertEqual(dishes(self._rows(search=soup)), {soup: ["Soup"]})
		# by date
		self.assertEqual(dishes(self._rows(from_date="2026-10-01")), {steak: ["Steak", "Wine"]})
		self.assertEqual(dishes(self._rows(to_date="2026-09-30")), {soup: ["Soup"]})
		# by status: the drafts, the submitted invoices
		self.assertEqual(dishes(self._rows(docstatus=0)), {soup: ["Soup"]})
		self.assertEqual(dishes(self._rows(docstatus=1)), {steak: ["Steak", "Wine"]})
		self.assertEqual(self._history(docstatus=1)[steak].items_count, 2)

	# ---- who gets the lines ----

	def _assert_refused(self, user):
		frappe.set_user(user)
		try:
			# The endpoint's own gate, unchanged, refuses with a ValidationError
			with self.assertRaises((frappe.ValidationError, frappe.PermissionError)):
				invoices.get_invoices(self.fx.profile)
		finally:
			frappe.set_user("Administrator")

	def test_a_website_user_the_till_does_not_know_is_refused(self):
		self._order([("Soup", 1)])
		self._assert_refused(PORTAL_STRANGER)

	def test_a_visitor_is_refused(self):
		self._order([("Soup", 1)])
		self._assert_refused("Guest")

	def test_a_website_user_assigned_to_the_till_gets_the_rows_without_their_lines(self):
		# The row's header (customer, total, payments) goes out as upstream sends it to whoever the till lists;
		# the lines go only to who may read the invoice, which a portal account may not.
		name = self._order([("Soup", 1), ("Bread", 2)])
		row = self._history(user=PORTAL_ASSIGNED)[name]
		self.assertTrue(row.grand_total)
		self.assertEqual((row.items_preview, row.items_count, row["items"]), ([], 0, []))

	def test_a_user_who_may_not_read_invoices_gets_the_rows_without_their_lines(self):
		name = self._order([("Soup", 1), ("Bread", 2)])
		row = self._history(user=KITCHEN_ONLY)[name]
		self.assertEqual(row.items_preview, [])
		self.assertEqual(row.items_count, 0)
		self.assertEqual(row["items"], [])

	def test_an_invoice_a_user_permission_cuts_loses_its_lines_for_that_user_only(self):
		other_customers_sale = self._order([("Secret dish", 1)], customer=self._other_customer())
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
