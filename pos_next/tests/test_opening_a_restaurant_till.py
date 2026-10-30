# //// Neoffice — added file (no upstream equivalent).
"""Opening a restaurant till from NeoRestau (NeoRestau lot 1, task 5).

A shift is opened through one of two doors. NeoRestau's button opens the restaurant door (`/pos?mode=restaurant`), which
offers the user's restaurant tills; the usual entry offers the others. The door only decides which tills are OFFERED:
whichever door a user came through, the till they choose is a restaurant till or not by its own setting. A user who has
tills never sees an empty list at either door: where the door has none for them they get their whole list, and where the
site does not run NeoRestau no till is a restaurant till, so the restaurant door is the usual one.

Every test builds what it needs (the users, a restaurant, the tills and their POS Settings rows) and commits nothing: the
clone of a working site holds real tills, a fresh CI site holds none. The users are written once for the class, a test
works inside a savepoint. The site's flag is set by patching the configuration the code reads.
"""

import unittest
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from pymysql.err import OperationalError

from pos_next.api.pos_profile import get_pos_profiles
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.tests.test_restaurant_mode_comes_from_the_till import ABSENT, a_site_where_neorestau_is
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

RESTAURANT = "_Test Door Restaurant"
SECOND_RESTAURANT_TILL = "_Test Door second restaurant till"
SAVEPOINT = "neorestau_door_test"
# Two users: one holds the counter till and both restaurant tills, the other (a waiter) both restaurant tills only
MIXED = TILL
WAITER = OTHER_TILL
BAD_FIELD_ERROR = 1054


@contextmanager
def the_statements_run():
	"""The SQL statements run inside the block, as text (whichever way the code asks for them)."""
	statements = []
	real = frappe.db.sql

	def sql(query, *args, **kwargs):
		statements.append(str(query))
		return real(query, *args, **kwargs)

	with patch.object(frappe.db, "sql", side_effect=sql):
		yield statements


@contextmanager
def a_read_of_the_settings_that_fails(error):
	"""Every statement that reads POS Settings raises `error`; the others run as they do."""
	real = frappe.db.sql

	def sql(query, *args, **kwargs):
		if "tabPOS Settings" in str(query):
			raise error
		return real(query, *args, **kwargs)

	with patch.object(frappe.db, "sql", side_effect=sql):
		yield


def the_reads_of_the_settings(statements):
	return [statement for statement in statements if "tabPOS Settings" in statement]


def a_till_like(fx, name, users):
	"""A copy of the fixture's first till under another name, assigned to `users`."""
	source = frappe.get_doc("POS Profile", fx.profile)
	fields = (
		"company",
		"currency",
		"warehouse",
		"selling_price_list",
		"customer",
		"cost_center",
		"write_off_account",
		"write_off_cost_center",
		"write_off_limit",
		"disable_rounded_total",
	)
	return (
		frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": name,
				**{field: source.get(field) for field in fields},
				"payments": [{"mode_of_payment": fx.mode, "default": 1}],
				"applicable_for_users": [{"user": user} for user in users],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


class Tills:
	"""A restaurant and three tills of the test's own (a counter till and two restaurant tills), with the users that hold
	them, made once for the class: the users are written once, not for every test (each write of a user waits for the
	clone's locks). A test works inside a savepoint and is rolled back to it."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Whatever the class built is rolled back with the class, by the base class
		cls.addClassCleanup(frappe.set_user, "Administrator")
		# Nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		if not frappe.get_all("Company", limit=1, pluck="name"):
			raise unittest.SkipTest("The site has no company")
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			cls.addClassCleanup(patcher.stop)
		_user(MIXED, [CASHIER_ROLE], "System User")
		_user(WAITER, [CASHIER_ROLE], "System User")
		fx = _till_fixture()
		cls.restaurant = (
			frappe.get_doc({"doctype": "Restaurant", "restaurant_name": RESTAURANT, "company": fx.company})
			.insert(ignore_permissions=True)
			.name
		)
		# The fixture's first till is MIXED's, its second is WAITER's: MIXED holds the second one too, and both hold a
		# third, made here
		cls.grocery_till = fx.profile
		cls.restaurant_till = fx.other_profile
		till = frappe.get_doc("POS Profile", cls.restaurant_till)
		till.append("applicable_for_users", {"user": MIXED})
		till.save(ignore_permissions=True)
		cls.second_restaurant_till = a_till_like(fx, SECOND_RESTAURANT_TILL, [WAITER, MIXED])
		cls.tills = (cls.grocery_till, cls.restaurant_till, cls.second_restaurant_till)
		cls.restaurant_tills = (cls.restaurant_till, cls.second_restaurant_till)
		# What the clone holds for these names (a real row is put back by the rollback) cannot make a counter till one
		for name in frappe.get_all(
			"POS Settings", filters={"pos_profile": ["in", list(cls.tills)]}, pluck="name"
		):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		for profile in cls.restaurant_tills:
			frappe.get_doc(
				{
					"doctype": "POS Settings",
					"pos_profile": profile,
					"enabled": 1,
					"enable_restaurant_mode": 1,
					"restaurant": cls.restaurant,
				}
			).insert(ignore_permissions=True, ignore_mandatory=True)
		# The order the endpoint lists them in (by name, as the database sorts it)
		cls.order = frappe.db.sql_list(
			"select name from `tabPOS Profile` where name in %s order by name", [cls.tills]
		)

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		# The site runs NeoRestau unless a test says otherwise
		flag = a_site_where_neorestau_is(1)
		flag.__enter__()
		self.addCleanup(flag.__exit__, None, None, None)

	def in_order(self, *profiles):
		"""The given tills in the order the endpoint lists them in."""
		return [name for name in self.order if name in profiles]

	def offered(self, user, **door):
		"""The tills `get_pos_profiles` offers `user` through a door: no argument is the usual entry."""
		frappe.set_user(user)
		try:
			return get_pos_profiles(**door)
		finally:
			frappe.set_user("Administrator")

	def names(self, user, **door):
		return [till["name"] for till in self.offered(user, **door)]

	def settings_of(self, profile):
		return frappe.db.get_value("POS Settings", {"pos_profile": profile}, "name")

	def change_settings(self, profile, **values):
		frappe.db.set_value("POS Settings", self.settings_of(profile), values)


class TestOpeningARestaurantTill(Tills, FrappeTestCase):
	def test_the_restaurant_door_lists_only_restaurant_tills(self):
		self.assertEqual(
			self.names(MIXED, mode="restaurant"),
			self.in_order(self.restaurant_till, self.second_restaurant_till),
		)

	def test_the_usual_door_lists_the_other_tills(self):
		self.assertEqual(self.names(MIXED), [self.grocery_till])

	def test_a_user_with_only_restaurant_tills_still_sees_them_at_the_usual_door(self):
		self.assertEqual(self.names(WAITER), self.in_order(self.restaurant_till, self.second_restaurant_till))

	def test_a_user_with_no_restaurant_till_still_sees_their_tills_at_the_restaurant_door(self):
		# The waiter's tills are counter tills: nothing for the restaurant door to pick from, and the list is not empty
		for profile in self.restaurant_tills:
			self.change_settings(profile, enable_restaurant_mode=0)
		both = self.in_order(*self.restaurant_tills)
		self.assertEqual(self.names(WAITER, mode="restaurant"), both)
		self.assertEqual(self.names(WAITER), both)

	def test_a_user_who_has_tills_never_sees_an_empty_list_at_either_door(self):
		for user in (MIXED, WAITER):
			for door in ({}, {"mode": "restaurant"}):
				with self.subTest(user=user, door=door):
					self.assertTrue(self.names(user, **door))

	def test_where_neorestau_is_off_the_restaurant_door_is_the_usual_door(self):
		# No till is a restaurant till there: every user gets all their tills at either door, none of them a restaurant
		held = {MIXED: self.in_order(*self.tills), WAITER: self.in_order(*self.restaurant_tills)}
		for value in (0, ABSENT):
			with a_site_where_neorestau_is(value):
				for user, tills in held.items():
					for door in ({}, {"mode": "restaurant"}):
						with self.subTest(neorestau=value, user=user, door=door):
							answer = self.offered(user, **door)
							self.assertEqual([till["name"] for till in answer], tills)
							for till in answer:
								self.assertIs(till["restaurant_mode"], False)
								self.assertIsNone(till["restaurant"])

	def test_any_other_mode_is_the_usual_door(self):
		for mode in (None, "", "unknown", "Restaurant", " restaurant", "restaurant "):
			with self.subTest(mode=mode):
				self.assertEqual(self.names(MIXED, mode=mode), [self.grocery_till])

	def test_each_till_says_whether_it_is_a_restaurant_till_and_which_restaurant(self):
		for till in self.offered(MIXED, mode="restaurant"):
			with self.subTest(till=till["name"]):
				self.assertIs(till["restaurant_mode"], True)
				self.assertEqual(till["restaurant"], self.restaurant)
		for till in self.offered(MIXED):
			with self.subTest(till=till["name"]):
				self.assertIs(till["restaurant_mode"], False)
				self.assertIsNone(till["restaurant"])

	def test_the_door_does_not_change_what_a_till_is(self):
		# A restaurant till stays one when it is offered through the usual door (the waiter has no other), and a counter
		# till stays a counter till through the restaurant door (a user who has no restaurant till)
		for till in self.offered(WAITER):
			self.assertIs(till["restaurant_mode"], True)
			self.assertEqual(till["restaurant"], self.restaurant)
		for profile in self.restaurant_tills:
			self.change_settings(profile, enable_restaurant_mode=0)
		for till in self.offered(WAITER, mode="restaurant"):
			self.assertIs(till["restaurant_mode"], False)
			self.assertIsNone(till["restaurant"])

	def assert_the_restaurant_till_is_a_counter_till(self, **values):
		"""With its POS Settings changed by `values`, the first restaurant till is offered with the counter till, says it is
		no restaurant till and tells no restaurant, and the restaurant door offers the other one only."""
		self.change_settings(self.restaurant_till, **values)
		usual = self.offered(MIXED)
		self.assertEqual(
			[till["name"] for till in usual], self.in_order(self.grocery_till, self.restaurant_till)
		)
		for till in usual:
			self.assertIs(till["restaurant_mode"], False)
			self.assertIsNone(till["restaurant"])
		self.assertEqual(self.names(MIXED, mode="restaurant"), [self.second_restaurant_till])

	def test_a_till_whose_tick_is_off_is_a_counter_till_even_if_it_names_a_restaurant(self):
		self.assert_the_restaurant_till_is_a_counter_till(enable_restaurant_mode=0)

	def test_a_till_in_restaurant_mode_that_names_no_restaurant_is_a_counter_till(self):
		self.assert_the_restaurant_till_is_a_counter_till(restaurant=None)

	def test_a_till_whose_settings_are_disabled_is_a_counter_till(self):
		# The till itself reads enabled settings only
		self.assert_the_restaurant_till_is_a_counter_till(enabled=0)

	def test_a_till_with_no_settings_row_is_a_counter_till(self):
		frappe.delete_doc(
			"POS Settings", self.settings_of(self.restaurant_till), force=True, ignore_permissions=True
		)
		self.assert_the_restaurant_till_is_a_counter_till()

	def test_a_disabled_till_is_never_offered(self):
		for profile in self.restaurant_tills:
			frappe.db.set_value("POS Profile", profile, "disabled", 1)
		# The disabled restaurant tills are not tills the user has: the restaurant door falls back on the others
		self.assertEqual(self.names(MIXED, mode="restaurant"), [self.grocery_till])
		self.assertEqual(self.names(WAITER, mode="restaurant"), [])
		self.assertEqual(self.names(WAITER), [])

	def test_the_settings_of_all_the_tills_are_read_in_one_query(self):
		with the_statements_run() as statements:
			self.offered(MIXED, mode="restaurant")
		self.assertEqual(len(the_reads_of_the_settings(statements)), 1, statements)

	def test_the_settings_are_not_read_where_neorestau_is_off(self):
		# Off, no till is a restaurant till: there is nothing to look up
		with a_site_where_neorestau_is(0), the_statements_run() as statements:
			self.offered(MIXED, mode="restaurant")
		self.assertEqual(the_reads_of_the_settings(statements), [])

	def test_a_site_not_migrated_yet_still_lists_its_tills(self):
		# The code is updated and the site is not migrated yet: the column of the restaurant is not there. No till can name
		# a restaurant, and the user is not left at a dead end
		missing = OperationalError(BAD_FIELD_ERROR, "Unknown column 'restaurant' in 'field list'")
		with a_read_of_the_settings_that_fails(missing):
			answer = self.offered(MIXED, mode="restaurant")
		self.assertEqual([till["name"] for till in answer], self.in_order(*self.tills))
		for till in answer:
			self.assertIs(till["restaurant_mode"], False)
			self.assertIsNone(till["restaurant"])

	def test_any_other_failure_of_the_read_is_not_hidden(self):
		with a_read_of_the_settings_that_fails(RuntimeError("the database is down")):
			with self.assertRaises(RuntimeError):
				self.offered(MIXED, mode="restaurant")

	def test_a_till_still_comes_with_what_the_dialog_reads(self):
		answer = self.offered(MIXED)
		self.assertEqual(len(answer), 1)
		for field in (
			"name",
			"company",
			"currency",
			"warehouse",
			"selling_price_list",
			"write_off_account",
			"write_off_cost_center",
		):
			self.assertIn(field, answer[0])
		# The rows stay dicts that can be read by attribute, as the callers of the endpoint read them
		self.assertEqual(answer[0].name, self.grocery_till)

	def test_a_visitor_is_refused_at_the_restaurant_door_too(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			get_pos_profiles(mode="restaurant")
