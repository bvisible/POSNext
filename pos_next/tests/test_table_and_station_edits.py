# //// Neoffice — added file (no upstream equivalent).
"""Editing a table edits it, and saving a station from the till keeps what the desk set (NeoRestau lot 1, task 9).

"Edit table" on the floor plan called `create_table`: renaming a table made another one beside it, and nothing could
change the label or the seats of a table that existed. `update_table` edits the record in place, for whoever may lay
out the floor, and the label stays unique within the table's restaurant.

"Edit station" saved the station's items without the workflow each item had been given in the desk (the item's own
steps, which win over the station's): the till's save wiped them. The station's details now carry each item's workflow,
and saving writes it back.

The suite relies on no patch and no after_migrate (a fresh CI site runs neither) and on no data of the site: it makes
the two roles and their rules, two restaurants that use the same labels, the stations and the users, once per class,
and each test rolls back to the savepoint it started from. Nothing is committed.
"""

import json
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as restaurant_api
from pos_next.authorization.tests.helpers import make_user
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import permissions
from pos_next.restaurant.permissions import ensure_restaurant_roles, grant_restaurant_permissions
from pos_next.tests import test_till_writes_need_the_till as till_fixtures

CASHIER = "table-edits-cashier@yopmail.com"
MANAGER = "table-edits-manager@yopmail.com"
KEPT_TO_ONE = "table-edits-kept-to-one@yopmail.com"
WEBSITE_USER = "table-edits-website@yopmail.com"
PORTAL = "table-edits-portal@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
SAVEPOINT = "table_and_station_edits"
# What the floor plan reads of a table beside the orders it adds to the row (`get_tables`)
ORDER_FIELDS = ("order_summary", "waiting_items_count")


@contextmanager
def as_user(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


class TheFloorAndItsUsers(FrappeTestCase):
	"""What both suites stand on: the roles and their rules, a company, and the users, made once for the class."""

	@classmethod
	def setUpClass(cls):
		# The rules a grant gave inside the transaction, and the users made in it, are dropped from the cache once the
		# class has rolled back: registered before FrappeTestCase's own rollback, so that it runs after it
		cls.changed_rules = []
		cls.addClassCleanup(cls.forget_what_the_class_cached)
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.addClassCleanup(frappe.set_user, "Administrator")
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			raise unittest.SkipTest("The site has no company")
		cls.company = company[0]
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			cls.addClassCleanup(patcher.stop)
		ensure_restaurant_roles()
		cls.changed_rules = grant_restaurant_permissions()
		cls.cashier = make_user(CASHIER, [CASHIER_ROLE])
		# A restaurant's manager also works at its till, as its cashiers do
		cls.manager = make_user(MANAGER, [permissions.MANAGER_ROLE, CASHIER_ROLE])
		cls.kept_to_one = make_user(KEPT_TO_ONE, [permissions.MANAGER_ROLE, CASHIER_ROLE])
		cls.website_user = make_user(WEBSITE_USER, [])
		# A portal account the till's and the restaurant's roles were given by mistake: a role does not make it a desk
		# account
		till_fixtures._user(PORTAL, [CASHIER_ROLE, permissions.MANAGER_ROLE], "Website User")
		cls.portal = PORTAL

	@classmethod
	def forget_what_the_class_cached(cls):
		for doctype in cls.changed_rules:
			frappe.clear_cache(doctype=doctype)
		for user in (CASHIER, MANAGER, KEPT_TO_ONE, WEBSITE_USER, PORTAL):
			frappe.clear_cache(user=user)

	@classmethod
	def insert(cls, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# What a test cached about a user it gave a permission is dropped once the savepoint is back: registered
		# first, run last
		self.addCleanup(frappe.clear_cache, user=KEPT_TO_ONE)
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		# A few endpoints commit: nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)


class TestEditingATable(TheFloorAndItsUsers):
	"""Restaurants A and B use the same labels: each has a room, a table T1 and one table of its own (A: T2, B: T3)."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.a = cls.insert("Restaurant", restaurant_name="_Test Table Edits A", company=cls.company)
		cls.b = cls.insert("Restaurant", restaurant_name="_Test Table Edits B", company=cls.company)
		cls.room_a = cls.insert("Restaurant Area", restaurant=cls.a, area_name="_Test Table Edits Room")
		cls.room_b = cls.insert("Restaurant Area", restaurant=cls.b, area_name="_Test Table Edits Room")
		# A status the floor plan's read leaves alone (it empties an occupied table that has no order), a place and a size
		cls.a_t1 = cls.insert(
			"Restaurant Table",
			area=cls.room_a,
			table_name="T1",
			capacity=4,
			shape="Square",
			status="Cleaning",
			pos_x=10,
			pos_y=20,
			width=110,
			height=90,
		)
		cls.a_t2 = cls.insert("Restaurant Table", area=cls.room_a, table_name="T2")
		cls.b_t1 = cls.insert("Restaurant Table", area=cls.room_b, table_name="T1")
		cls.b_t3 = cls.insert("Restaurant Table", area=cls.room_b, table_name="T3")

	def tables(self):
		"""The test's own tables, whatever else the site holds."""
		return frappe.db.count("Restaurant Table", {"restaurant": ["in", [self.a, self.b]]})

	def table(self, name, *fields):
		"""The fields asked of a table, as a tuple, however many are asked."""
		row = frappe.db.get_value("Restaurant Table", name, list(fields), as_dict=True)
		return tuple(row[field] for field in fields)

	def test_editing_a_table_changes_it_and_makes_no_other(self):
		before = self.tables()
		restaurant_api.update_table(name=self.a_t1, table_name="T1 bis", capacity=6)
		self.assertEqual(self.tables(), before)
		self.assertEqual(self.table(self.a_t1, "table_name", "capacity"), ("T1 bis", 6))
		# The same record: its name is the one the orders, the reservations and the tokens link to
		self.assertEqual(frappe.db.count("Restaurant Table", {"name": self.a_t1}), 1)

	def test_what_is_not_passed_stays_as_it_is(self):
		everything = (
			"table_name",
			"area",
			"capacity",
			"shape",
			"status",
			"pos_x",
			"pos_y",
			"width",
			"height",
		)
		untouched = self.table(self.a_t1, *everything)
		for change, field in (
			({"table_name": "T1 bis"}, "table_name"),
			({"capacity": 8}, "capacity"),
			({"shape": "Round"}, "shape"),
		):
			with self.subTest(change=change):
				frappe.db.savepoint("one_change")
				restaurant_api.update_table(name=self.a_t1, **change)
				now = dict(zip(everything, self.table(self.a_t1, *everything), strict=True))
				was = dict(zip(everything, untouched, strict=True))
				self.assertEqual(
					{k: v for k, v in now.items() if k != field}, {k: v for k, v in was.items() if k != field}
				)
				self.assertEqual(now[field], next(iter(change.values())))
				frappe.db.rollback(save_point="one_change")
		# Named alone, or with nothing to change, a table is left as it is; so is a blank number of seats (the dialog's
		# empty field)
		restaurant_api.update_table(name=self.a_t1)
		restaurant_api.update_table(name=self.a_t1, capacity="")
		self.assertEqual(self.table(self.a_t1, *everything), untouched)

	def test_the_seats_may_come_as_text(self):
		restaurant_api.update_table(name=self.a_t1, capacity="6")
		self.assertEqual(self.table(self.a_t1, "capacity"), (6,))

	def test_it_answers_the_table_as_the_floor_plan_reads_it(self):
		answer = restaurant_api.update_table(name=self.a_t1, table_name="T1 bis", capacity=6, shape="Round")
		read = next(
			table
			for table in restaurant_api.get_tables(restaurant=self.a)["tables"]
			if table.name == self.a_t1
		)
		self.assertEqual({k: v for k, v in read.items() if k not in ORDER_FIELDS}, answer)
		self.assertEqual(
			(answer["name"], answer["table_name"], answer["capacity"], answer["shape"], answer["restaurant"]),
			(self.a_t1, "T1 bis", 6, "Round", self.a),
		)
		self.assertEqual(answer["area_name"], "_Test Table Edits Room")

	def test_a_label_is_unique_within_its_restaurant(self):
		before = self.table(self.a_t2, "table_name")
		# T1 is restaurant A's other table; the comparison is the database's, so the case does not matter
		for label in ("T1", "t1"):
			with self.subTest(label=label), self.assertRaises(frappe.ValidationError):
				restaurant_api.update_table(name=self.a_t2, table_name=label)
		self.assertEqual(self.table(self.a_t2, "table_name"), before)
		# A table keeps its own label, whatever the case it is written in
		restaurant_api.update_table(name=self.a_t1, table_name="t1")
		self.assertEqual(self.table(self.a_t1, "table_name"), ("t1",))

	def test_two_restaurants_may_share_a_label(self):
		# T2 is restaurant A's: restaurant B takes it for its own T3
		restaurant_api.update_table(name=self.b_t3, table_name="T2")
		self.assertEqual(self.table(self.b_t3, "table_name"), ("T2",))
		self.assertEqual(self.table(self.a_t2, "table_name"), ("T2",))

	def test_a_table_stays_in_its_restaurant(self):
		restaurant_api.update_table(name=self.b_t3, table_name="T9")
		self.assertEqual(self.table(self.b_t3, "restaurant", "area"), (self.b, self.room_b))

	def test_a_blank_label_or_an_unknown_shape_is_refused_and_nothing_changes(self):
		before = self.table(self.a_t1, "table_name", "shape")
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.update_table(name=self.a_t1, table_name="  ")
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.update_table(name=self.a_t1, shape="Hexagon")
		self.assertEqual(self.table(self.a_t1, "table_name", "shape"), before)

	def test_a_table_that_does_not_exist_is_reported_and_none_is_made(self):
		before = self.tables()
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.update_table(name="no-such-table", table_name="Ghost")
		self.assertEqual(self.tables(), before)

	def test_a_cashier_serves_the_tables_but_does_not_lay_them_out(self):
		before = self.table(self.a_t1, "table_name", "capacity", "shape")
		with as_user(self.cashier):
			# Not even a change that is already there: the door is the right to lay out the floor
			for change in ({"table_name": "Mine"}, {"capacity": 12}, {"shape": "Round"}, {}):
				with self.subTest(change=change), self.assertRaises(frappe.PermissionError):
					restaurant_api.update_table(name=self.a_t1, **change)
			# What a cashier does write is the status
			restaurant_api.update_table_status(self.a_t1, "Empty")
		self.assertEqual(self.table(self.a_t1, "table_name", "capacity", "shape"), before)
		self.assertEqual(self.table(self.a_t1, "status"), ("Empty",))

	def test_neither_a_visitor_nor_a_website_user_nor_a_portal_account_edits_a_table(self):
		before = self.table(self.a_t1, "table_name", "capacity")
		# The website user holds no role; the portal account holds the till's and the restaurant's, given by mistake
		for user in ("Guest", self.website_user, self.portal):
			with self.subTest(user=user), as_user(user), self.assertRaises(frappe.PermissionError):
				restaurant_api.update_table(name=self.a_t1, table_name="Mine", capacity=12)
		self.assertEqual(self.table(self.a_t1, "table_name", "capacity"), before)

	def test_a_restaurant_manager_edits_a_table(self):
		with as_user(self.manager):
			answer = restaurant_api.update_table(name=self.a_t1, table_name="T1 bis", capacity=6)
		self.assertEqual((answer["table_name"], answer["capacity"]), ("T1 bis", 6))
		self.assertEqual(self.table(self.a_t1, "table_name", "capacity"), ("T1 bis", 6))

	def test_a_manager_kept_to_one_restaurant_edits_its_tables_only(self):
		self.insert("User Permission", user=self.kept_to_one, allow="Restaurant", for_value=self.a)
		frappe.clear_cache(user=self.kept_to_one)
		with as_user(self.kept_to_one):
			restaurant_api.update_table(name=self.a_t2, capacity=9)
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.update_table(name=self.b_t3, capacity=9)
		self.assertEqual(self.table(self.a_t2, "capacity"), (9,))
		self.assertEqual(self.table(self.b_t3, "capacity"), (4,))

	def test_a_record_is_named_by_its_name(self):
		# A JSON body can carry a dict where a name is expected; frappe.get_doc would read it as filters, past the record's
		# own check: refused, whoever asks
		with as_user(self.manager):
			for name in ({"name": self.a_t1}, {"table_name": "T1"}, [self.a_t1], 7):
				with self.subTest(name=name), self.assertRaises(frappe.PermissionError):
					restaurant_api.update_table(name=name, table_name="Mine")
		self.assertEqual(self.table(self.a_t1, "table_name"), ("T1",))


class TestSavingAStation(TheFloorAndItsUsers):
	"""A station of one restaurant holds three dishes: one with a workflow of its own (set in the desk), one that follows
	the station's, and a third that is not on it yet."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.restaurant = cls.insert("Restaurant", restaurant_name="_Test Station Edits", company=cls.company)
		steps = [
			{"step_name": "Pending", "color": "#EAB308", "allow_edit": 1},
			{"step_name": "Preparing", "color": "#3B82F6", "allow_edit": 0},
			{"step_name": "Ready", "color": "#22C55E", "allow_edit": 0},
		]
		cls.own_flow = cls.insert(
			"Preparation Workflow", workflow_name="_Test Station Edits Own", steps=steps
		)
		cls.other_flow = cls.insert(
			"Preparation Workflow", workflow_name="_Test Station Edits Other", steps=steps
		)
		cls.stations_flow = cls.insert(
			"Preparation Workflow", workflow_name="_Test Station Edits Its", steps=steps
		)
		cls.with_own, cls.following, cls.new_dish = (
			cls.dish(code)
			for code in (
				"_PNXT station edits own flow",
				"_PNXT station edits plain",
				"_PNXT station edits new",
			)
		)
		cls.item_group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		cls.station = cls.insert(
			"Preparation Station",
			restaurant=cls.restaurant,
			station_name="_Test Station Edits Kitchen",
			workflow=cls.stations_flow,
			items=[
				{"item": cls.with_own, "prep_time": 7, "priority": "Urgent", "workflow": cls.own_flow},
				{"item": cls.following, "prep_time": 0, "priority": "Normal"},
			],
			item_groups=[{"item_group": cls.item_group, "prep_time": 2, "priority": "Urgent"}],
		)

	@classmethod
	def dish(cls, code):
		with patch.object(till_fixtures, "ITEM", code):
			return till_fixtures._item(cls.company)

	def rows(self):
		"""The station's item rows as the desk holds them: item -> (prep time, priority, workflow)."""
		return {
			row.item: (row.prep_time, row.priority, row.workflow or None)
			for row in frappe.get_all(
				"Preparation Station Item",
				filters={"parent": self.station, "parenttype": "Preparation Station"},
				fields=["item", "prep_time", "priority", "workflow"],
			)
		}

	def kept_rows(self):
		return {
			self.with_own: (7, "Urgent", self.own_flow),
			self.following: (0, "Normal", None),
		}

	def test_the_desk_set_what_the_tests_expect(self):
		self.assertEqual(self.rows(), self.kept_rows())

	def test_the_details_name_the_workflow_of_each_item(self):
		details = restaurant_api.get_station_details(self.station)
		self.assertEqual(
			{row["item"]: row["workflow"] for row in details["items"]},
			{self.with_own: self.own_flow, self.following: ""},
		)

	def test_saving_a_station_from_the_till_keeps_each_items_workflow(self):
		details = restaurant_api.get_station_details(self.station)
		restaurant_api.update_station(name=self.station, items=details["items"])
		self.assertEqual(self.rows(), self.kept_rows())

	def test_the_till_sends_its_rows_as_text(self):
		details = restaurant_api.get_station_details(self.station)
		restaurant_api.update_station(name=self.station, items=json.dumps(details["items"]))
		self.assertEqual(self.rows(), self.kept_rows())

	def test_a_manager_saves_a_station_from_the_till(self):
		with as_user(self.manager):
			details = restaurant_api.get_station_details(self.station)
			restaurant_api.update_station(
				name=self.station, color="#123456", items=json.dumps(details["items"])
			)
		self.assertEqual(self.rows(), self.kept_rows())
		self.assertEqual(frappe.db.get_value("Preparation Station", self.station, "color"), "#123456")

	def test_a_dish_added_from_the_till_follows_the_workflow_of_its_station(self):
		rows = restaurant_api.get_station_details(self.station)["items"]
		# What the till pushes for a dish picked in its search: no workflow
		rows.append({"item": self.new_dish, "item_name": "New", "prep_time": 3, "priority": "Normal"})
		restaurant_api.update_station(name=self.station, items=json.dumps(rows))
		self.assertEqual(self.rows(), {**self.kept_rows(), self.new_dish: (3, "Normal", None)})

	def test_a_row_that_names_no_workflow_keeps_the_one_the_dish_has(self):
		# A caller that does not know the workflow (an older screen, a script) leaves it as it is
		rows = [
			{"item": self.with_own, "prep_time": 9, "priority": "Normal"},
			{"item": self.following, "prep_time": 0, "priority": "Normal"},
		]
		restaurant_api.update_station(name=self.station, items=rows)
		self.assertEqual(
			self.rows(),
			{self.with_own: (9, "Normal", self.own_flow), self.following: (0, "Normal", None)},
		)

	def test_a_row_may_change_or_clear_the_workflow_of_its_dish(self):
		rows = [
			{"item": self.with_own, "prep_time": 7, "priority": "Urgent", "workflow": ""},
			{"item": self.following, "prep_time": 0, "priority": "Normal", "workflow": self.other_flow},
		]
		restaurant_api.update_station(name=self.station, items=rows)
		self.assertEqual(
			self.rows(),
			{self.with_own: (7, "Urgent", None), self.following: (0, "Normal", self.other_flow)},
		)

	def test_a_dish_taken_off_the_station_takes_its_workflow_with_it(self):
		rows = [
			row
			for row in restaurant_api.get_station_details(self.station)["items"]
			if row["item"] != self.with_own
		]
		restaurant_api.update_station(name=self.station, items=rows)
		self.assertEqual(self.rows(), {self.following: (0, "Normal", None)})

	def test_saving_the_items_leaves_the_rest_of_the_station_as_it_is(self):
		details = restaurant_api.get_station_details(self.station)
		restaurant_api.update_station(name=self.station, items=details["items"])
		station = frappe.db.get_value(
			"Preparation Station", self.station, ["workflow", "station_name", "restaurant"], as_dict=True
		)
		self.assertEqual(
			(station.workflow, station.station_name, station.restaurant),
			(self.stations_flow, "_Test Station Edits Kitchen", self.restaurant),
		)
		self.assertEqual(
			frappe.get_all(
				"Preparation Station Item Group",
				filters={"parent": self.station},
				fields=["item_group", "prep_time", "priority"],
			),
			[{"item_group": self.item_group, "prep_time": 2, "priority": "Urgent"}],
		)
