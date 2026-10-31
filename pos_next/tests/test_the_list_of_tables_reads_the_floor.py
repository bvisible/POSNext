# //// Neoffice — added file (no upstream equivalent).
"""What the list of tables reads from the floor (NeoRestau lot 1, task 26).

On a phone the restaurant till opens on the list of its tables, sorted by what needs the waiter first: dishes ready at
the pass, a QR order waiting for him to accept it, then the other occupied tables, the oldest seated first, each with
the time since it was seated and the total of its order. The list reads what the floor plan reads (`get_tables`,
`get_runner_orders`), and three things it needs were not in those answers:

- the total of a table's open order (`order_summary.grand_total`, the total of the draft);
- how many lines of a QR order wait for the waiter to accept them (`qr_waiting_count`). A guest's order, when the
  restaurant has its QR orders approved, puts its lines on hold (`kds_status` Waiting) in a kitchen batch of their own.
  A line the till holds back is on hold too, but without a batch: the till numbers a batch only when it sends a line.
  And a save by the till writes the order's lines again, without their batches: from then on the guest's lines are the
  waiter's, who has opened the table, seen them and kept them on hold;
- the type of the station a ready line comes from (`station_type`): the list says « dishes ready » when a dish is (a
  line of a kitchen), and only « ready at the pass » for drinks, or when nothing says what it is.

The suite builds its own two restaurants, tills, tables and orders, relies on no patch, and rolls everything back.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from pos_next.api import guest_ordering, invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _sale, _user
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants

# The accounts of the test, each with the roles it is given (all rolled back)
MANAGER = "list-of-tables-manager@yopmail.com"
TILL_MANAGER = "list-of-tables-till-manager@yopmail.com"
CASHIER = "list-of-tables-cashier@yopmail.com"
KITCHEN = "list-of-tables-kitchen@yopmail.com"

APPROVAL = "Server Approval"
DIRECT = "Direct to Kitchen"
DISH = "_Test List Of Tables Dish"


def _dish(company):
	"""A second item to sell, as the till tests make theirs: a line of it is never taken for a line of the first."""
	return frappe.db.get_value("Item", {"item_code": DISH}) or (
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": DISH,
				"item_name": DISH,
				"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft"),
				"stock_uom": frappe.db.get_value("UOM", "Nos") or frappe.db.get_value("UOM", {}, "name"),
				"is_stock_item": 0,
				"is_sales_item": 1,
				"item_defaults": [
					{
						"company": company,
						"default_warehouse": frappe.db.get_value(
							"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
						)
						or "",
					}
				],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


class TestTheListOfTablesReadsTheFloor(TwoRestaurants, FrappeTestCase):
	"""Restaurant A's till is the test's own; its room holds T1 (the mixin's) and T2, its stations a kitchen and a bar."""

	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.dish = _dish(self.fx.company)
		self.make_till(self.fx.profile, self.a)
		self.make_till(self.fx.other_profile, self.b)
		self.table_two = self.make_table(self.a, self.room_a, table_name="T2")
		self.bar_a = self.make_station(self.a, station_name="Bar", station_type="Bar")

	# What the till and the guests do

	def till_order(self, table, lines=1, rate=10):
		"""A draft the till saves on a table, its lines sent to the kitchen (as the floor tests make them)."""
		items = [
			{"item_code": self.fx.item, "qty": 1, "rate": rate, "price_list_rate": rate} for _ in range(lines)
		]
		payload = _sale(
			self.fx,
			pos_profile=self.fx.profile,
			restaurant_table=table,
			items=items,
			payments=[{"mode_of_payment": self.fx.mode, "amount": rate * lines}],
		)
		name = invoices.update_invoice(json.dumps(payload))["name"]
		frappe.db.set_value("Sales Invoice Item", {"parent": name}, "kds_status", "Pending")
		return name

	def guest_lines(self, order, count):
		"""Lines of a guest's QR order awaiting approval, as `submit_guest_order` writes them: on hold, in the next
		kitchen batch of the order."""
		lines = self.lines_of(order)
		batch = max((int(line.kds_batch or 0) for line in lines), default=0) + 1
		for at in range(count):
			frappe.get_doc(
				{
					"doctype": "Sales Invoice Item",
					"parent": order,
					"parenttype": "Sales Invoice",
					"parentfield": "items",
					"idx": len(lines) + at + 1,
					"item_code": self.dish,
					"item_name": self.dish,
					"qty": 1,
					"rate": 5,
					"kds_status": "Waiting",
					"kds_batch": batch,
				}
			).db_insert()

	def lines_of(self, order):
		return frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order, "parenttype": "Sales Invoice"},
			fields=["name", "item_code", "kds_status", "kds_batch"],
			order_by="idx asc",
		)

	def validation(self, mode):
		frappe.db.set_value("Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": mode})
		frappe.clear_document_cache("Restaurant")

	def floor(self):
		return restaurant_api.get_tables(restaurant=self.a)

	def table_on_the_floor(self, table):
		return next(row for row in self.floor()["tables"] if row["name"] == table)

	# The total of the order

	def test_an_open_order_says_its_total(self):
		order = self.till_order(self.table_a, lines=2, rate=12.5)

		summary = self.table_on_the_floor(self.table_a)["order_summary"]

		# The order's own grand total, what the guests will pay: its two lines of 12.50 (`total`), with the tax the till's
		# template adds when its prices exclude it (the till of this fixture adds 8.1 %)
		grand_total, lines_total = frappe.db.get_value("Sales Invoice", order, ["grand_total", "total"])
		self.assertEqual(flt(summary["grand_total"]), flt(grand_total))
		self.assertEqual(flt(lines_total), 25)
		self.assertGreaterEqual(flt(summary["grand_total"]), 25)
		# What the floor plan read is still there
		self.assertEqual(summary["item_count"], 2)

	def test_a_table_without_an_order_has_no_total_to_say(self):
		self.assertIsNone(self.table_on_the_floor(self.table_two)["order_summary"])

	# Whoever is told the total: the takings of a table are the sales invoices', as the restaurant's figures are
	# (restaurant/neorestau.overview_figures: the day's takings only to whoever reads the invoices)

	def as_user(self, email, roles):
		_user(email, roles, "System User")
		self.addCleanup(frappe.set_user, "Administrator")
		frappe.set_user(email)

	def test_who_reads_the_floor_but_not_the_invoices_is_not_told_the_total(self):
		self.till_order(self.table_a, lines=2, rate=12.5)
		for email, role in ((MANAGER, "Restaurant Manager"), (TILL_MANAGER, "Nexus POS Manager")):
			if not frappe.db.exists("Role", role):
				continue
			with self.subTest(role=role):
				self.as_user(email, [role])
				self.assertFalse(frappe.has_permission("Sales Invoice", "read"))

				summary = self.table_on_the_floor(self.table_a)["order_summary"]

				self.assertNotIn("grand_total", summary)
				# The rest of what the plan reads of the order is still there
				self.assertEqual(summary["item_count"], 2)
				frappe.set_user("Administrator")

	def test_a_cashier_and_a_kitchen_tablet_are_told_the_total(self):
		order = self.till_order(self.table_a, lines=2, rate=12.5)
		total = flt(frappe.db.get_value("Sales Invoice", order, "grand_total"))
		# A kitchen tablet runs on a desk account that holds a till role too (permissions.py)
		for email, roles in ((CASHIER, [CASHIER_ROLE]), (KITCHEN, ["Restaurant Kitchen", CASHIER_ROLE])):
			with self.subTest(roles=roles):
				self.as_user(email, roles)
				self.assertTrue(frappe.has_permission("Sales Invoice", "read"))

				self.assertEqual(
					flt(self.table_on_the_floor(self.table_a)["order_summary"]["grand_total"]), total
				)
				frappe.set_user("Administrator")

	# The QR order waiting for the waiter

	def test_the_lines_of_a_qr_order_waiting_for_the_waiter_are_counted(self):
		order = self.till_order(self.table_a)

		self.guest_lines(order, 2)

		table = self.table_on_the_floor(self.table_a)
		self.assertEqual(table["qr_waiting_count"], 2)
		# The plan's own count of the lines on hold counts them too, as it always did
		self.assertEqual(table["waiting_items_count"], 2)

	def test_a_guest_order_awaiting_approval_is_written_as_the_list_counts_it(self):
		# The real way in: a guest scans the code of a free table and orders, the restaurant approves its QR orders
		self.validation(APPROVAL)
		token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_two,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)

		guest_ordering.submit_guest_order(
			token.token, json.dumps([{"item_code": self.fx.item, "qty": 1, "rate": 5}])
		)

		table = self.table_on_the_floor(self.table_two)
		self.assertEqual(table["status"], "Occupied")
		self.assertEqual((table["qr_waiting_count"], table["waiting_items_count"]), (1, 1))

	def test_a_guest_order_sent_straight_to_the_kitchen_waits_for_no_one(self):
		self.validation(DIRECT)
		token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_two,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)

		guest_ordering.submit_guest_order(
			token.token, json.dumps([{"item_code": self.fx.item, "qty": 1, "rate": 5}])
		)

		table = self.table_on_the_floor(self.table_two)
		self.assertEqual((table["qr_waiting_count"], table["waiting_items_count"]), (0, 0))

	def test_a_line_the_till_held_back_is_not_a_qr_order(self):
		order = self.till_order(self.table_a, lines=2)
		held = self.lines_of(order)[0].name
		frappe.db.set_value("Sales Invoice Item", held, "kds_status", "Waiting")

		table = self.table_on_the_floor(self.table_a)

		self.assertEqual(table["qr_waiting_count"], 0)
		self.assertEqual(table["waiting_items_count"], 1)

	def test_a_qr_line_the_waiter_sent_is_no_longer_waiting(self):
		order = self.till_order(self.table_a)
		self.guest_lines(order, 2)
		sent = next(line.name for line in self.lines_of(order) if line.kds_status == "Waiting")

		frappe.db.set_value("Sales Invoice Item", sent, "kds_status", "Pending")

		self.assertEqual(self.table_on_the_floor(self.table_a)["qr_waiting_count"], 1)

	def test_once_the_till_saved_the_table_the_lines_on_hold_are_the_waiters(self):
		order = self.till_order(self.table_a)
		self.guest_lines(order, 1)
		self.assertEqual(self.table_on_the_floor(self.table_a)["qr_waiting_count"], 1)

		# The waiter opened the table and saved it, the guest's line still on hold, as the till's cart sends it
		items = [
			{"item_code": self.fx.item, "qty": 1, "rate": 10, "price_list_rate": 10, "kds_status": "Pending"},
			{"item_code": self.dish, "qty": 1, "rate": 5, "price_list_rate": 5, "kds_status": "Waiting"},
		]
		invoices.update_invoice(
			json.dumps(
				_sale(
					self.fx,
					name=order,
					pos_profile=self.fx.profile,
					restaurant_table=self.table_a,
					items=items,
					payments=[{"mode_of_payment": self.fx.mode, "amount": 15}],
				)
			)
		)

		table = self.table_on_the_floor(self.table_a)
		self.assertEqual(table["qr_waiting_count"], 0)
		# It is still on hold: the plan's count of the lines on hold says so
		self.assertEqual(table["waiting_items_count"], 1)

	def test_the_qr_count_is_given_for_the_restaurants_own_tables(self):
		self.guest_lines(self.till_order(self.table_a), 1)

		floor = self.floor()

		self.assertEqual(
			{row["name"]: row["qr_waiting_count"] for row in floor["tables"]},
			{self.table_a: 1, self.table_two: 0},
		)

	# The station of a ready line

	def test_a_ready_line_says_the_type_of_its_station(self):
		order = self.till_order(self.table_a, lines=2)
		dish, drink = self.lines_of(order)
		frappe.db.set_value(
			"Sales Invoice Item", dish.name, {"kds_status": "Ready", "preparation_station": self.station_a}
		)
		frappe.db.set_value(
			"Sales Invoice Item", drink.name, {"kds_status": "Ready", "preparation_station": self.bar_a}
		)

		orders = restaurant_api.get_runner_orders(restaurant=self.a)

		ready = next(row for row in orders if row["name"] == order)
		self.assertEqual(
			{line["name"]: line["station_type"] for line in ready["items"]},
			{dish.name: "Kitchen", drink.name: "Bar"},
		)
		# Its station's label is still there, as the pass reads it
		self.assertEqual({line["station_name"] for line in ready["items"]}, {"Kitchen", "Bar"})

	def test_a_ready_line_of_no_station_says_no_type(self):
		order = self.till_order(self.table_a)
		line = self.lines_of(order)[0]
		frappe.db.set_value(
			"Sales Invoice Item", line.name, {"kds_status": "Ready", "preparation_station": None}
		)

		orders = restaurant_api.get_runner_orders(restaurant=self.a)

		ready = next(row for row in orders if row["name"] == order)
		self.assertIsNone(ready["items"][0].get("station_type"))
