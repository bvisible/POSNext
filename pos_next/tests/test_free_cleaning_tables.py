# //// Neoffice — added file (no upstream equivalent).
"""Freeing the tables being cleaned, a room at a time (NeoRestau lot 1, Ruling 48).

The floor plan's « ⋯ » menu holds « Free the tables being cleaned »: once the room has been cleaned, every one of its
tables that is in the Cleaning state goes back to Empty in ONE call, instead of the waiter opening each of them (the
product owner dislikes extra clicks, so there is no confirmation). Each table is put back as a single table is
(`mark_table_available`: its guest order tokens expire, the draft invoices that still name it are unlinked), the room's
other tables are left as they are, and so are the tables of the other rooms and of the other restaurants.

Who may do it is who may set the status of a table (`update_table_status`): whoever may write a table, a cashier
included, from a desk account. The till is told so (`restaurant_can.set_table_status`) and shows the item to those users
only; the server checks the same right again.

The suite relies on no patch and no after_migrate (a fresh CI site runs neither) and on no data of the site: it makes the
two roles and their rules, two restaurants, their rooms and tables, and the users, once per class, and each test rolls
back to the savepoint it started from. Nothing is committed.
"""

from unittest.mock import patch

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import permissions, scope
from pos_next.tests.test_table_and_station_edits import TheFloorAndItsUsers, as_user

CLEANING = "Cleaning"
EMPTY = "Empty"


class TestFreeingTheCleaningTables(TheFloorAndItsUsers):
	"""Restaurant A has two rooms; its first room holds a table in each state, two of them being cleaned. Restaurant B has
	a room with a table being cleaned too, and the labels the two restaurants use are the same."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.a = cls.insert("Restaurant", restaurant_name="_Test Free Tables A", company=cls.company)
		cls.b = cls.insert("Restaurant", restaurant_name="_Test Free Tables B", company=cls.company)
		cls.room = cls.insert("Restaurant Area", restaurant=cls.a, area_name="_Test Free Tables Room")
		cls.other_room = cls.insert(
			"Restaurant Area", restaurant=cls.a, area_name="_Test Free Tables Terrace"
		)
		cls.b_room = cls.insert("Restaurant Area", restaurant=cls.b, area_name="_Test Free Tables Room")

		def table(area, label, status):
			return cls.insert("Restaurant Table", area=area, table_name=label, status=status)

		cls.cleaning_1 = table(cls.room, "C1", CLEANING)
		cls.cleaning_2 = table(cls.room, "C2", CLEANING)
		cls.empty = table(cls.room, "E1", EMPTY)
		cls.occupied = table(cls.room, "O1", "Occupied")
		cls.reserved = table(cls.room, "R1", "Reserved")
		cls.paid = table(cls.room, "P1", "Paid")
		cls.terrace_cleaning = table(cls.other_room, "T1", CLEANING)
		cls.b_cleaning = table(cls.b_room, "C1", CLEANING)

	def statuses(self, *tables):
		return {name: frappe.db.get_value("Restaurant Table", name, "status") for name in tables}

	def everything(self):
		return self.statuses(
			self.cleaning_1,
			self.cleaning_2,
			self.empty,
			self.occupied,
			self.reserved,
			self.paid,
			self.terrace_cleaning,
			self.b_cleaning,
		)

	def token(self, table):
		return frappe.get_doc(
			{"doctype": "Guest Order Token", "mode": "restaurant", "table": table}
		).insert(ignore_permissions=True)

	def test_it_frees_the_cleaning_tables_of_the_room_and_no_other(self):
		before = self.everything()
		self.assertEqual(before[self.cleaning_1], CLEANING)

		restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		self.assertEqual(
			self.everything(),
			{
				self.cleaning_1: EMPTY,
				self.cleaning_2: EMPTY,
				# The others of the room are not the cleaner's to free
				self.empty: EMPTY,
				self.occupied: "Occupied",
				self.reserved: "Reserved",
				self.paid: "Paid",
				# Nor are the tables of another room, nor of another restaurant
				self.terrace_cleaning: CLEANING,
				self.b_cleaning: CLEANING,
			},
		)

	def test_it_says_how_many_and_which_it_freed(self):
		answer = restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		self.assertEqual(answer["freed"], 2)
		self.assertEqual(sorted(answer["tables"]), sorted([self.cleaning_1, self.cleaning_2]))
		self.assertEqual(answer["status"], "success")

	def test_it_frees_the_room_it_is_asked_for(self):
		answer = restaurant_api.free_cleaning_tables(area=self.other_room, restaurant=self.a)

		self.assertEqual((answer["freed"], answer["tables"]), (1, [self.terrace_cleaning]))
		self.assertEqual(
			self.statuses(self.terrace_cleaning, self.cleaning_1),
			{self.terrace_cleaning: EMPTY, self.cleaning_1: CLEANING},
		)

	def test_nothing_being_cleaned_frees_nothing_and_tells_nobody(self):
		restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		with patch.object(frappe, "publish_realtime") as published:
			answer = restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		self.assertEqual((answer["freed"], answer["tables"]), (0, []))
		published.assert_not_called()

	def test_the_other_tills_are_told_once_for_the_whole_room(self):
		with patch.object(frappe, "publish_realtime") as published:
			restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		self.assertEqual([call.args[0] for call in published.call_args_list], ["table_update"])

	def test_each_table_is_put_back_as_a_single_table_is(self):
		put_back = restaurant_api._put_table_back
		with patch.object(restaurant_api, "_put_table_back", side_effect=put_back) as put:
			restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)
		self.assertCountEqual(
			[call.args[0] for call in put.call_args_list], [self.cleaning_1, self.cleaning_2]
		)

		# The same helper does it for one table
		with patch.object(restaurant_api, "_put_table_back", side_effect=put_back) as put:
			restaurant_api.mark_table_available(self.terrace_cleaning)
		put.assert_called_once_with(self.terrace_cleaning)

	def test_the_guest_tokens_of_the_tables_it_frees_expire_and_only_those(self):
		freed = self.token(self.cleaning_1)
		other_room = self.token(self.terrace_cleaning)
		paid = self.token(self.paid)

		restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		def status(token):
			return frappe.db.get_value("Guest Order Token", token.name, "status")

		self.assertEqual(status(freed), "Expired")
		self.assertEqual(status(other_room), "Active")
		self.assertEqual(status(paid), "Active")

	def test_a_table_that_stopped_being_cleaned_meanwhile_is_left_alone(self):
		put_back = restaurant_api._put_table_back

		def another_till_seats_the_second_table(table_name):
			# While the first table is put back, another till opens the second one
			if table_name == first:
				frappe.db.set_value("Restaurant Table", second, "status", "Occupied")
			return put_back(table_name)

		# The tables are put back in the order of their labels: C1, then C2
		first, second = self.cleaning_1, self.cleaning_2
		with patch.object(restaurant_api, "_put_table_back", side_effect=another_till_seats_the_second_table):
			answer = restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		self.assertEqual(self.statuses(first, second), {first: EMPTY, second: "Occupied"})
		# What it says is what it did
		self.assertEqual((answer["freed"], answer["tables"]), (1, [first]))

	def test_the_room_is_the_restaurants_or_it_is_refused(self):
		# A room of restaurant B asked for with restaurant A: refused, whoever asks
		for user in ("Administrator", self.cashier):
			with self.subTest(user=user), as_user(user), self.assertRaises(frappe.PermissionError):
				restaurant_api.free_cleaning_tables(area=self.b_room, restaurant=self.a)
		self.assertEqual(self.statuses(self.b_cleaning), {self.b_cleaning: CLEANING})

		# And the other way round
		with self.assertRaises(frappe.PermissionError):
			restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.b)
		self.assertEqual(self.statuses(self.cleaning_1), {self.cleaning_1: CLEANING})

		# Its own restaurant's room is served
		answer = restaurant_api.free_cleaning_tables(area=self.b_room, restaurant=self.b)
		self.assertEqual(answer["tables"], [self.b_cleaning])

	def test_without_a_restaurant_named_it_is_the_tills_own(self):
		with patch.object(scope, "current_restaurant", return_value=self.a):
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.free_cleaning_tables(area=self.b_room)
			answer = restaurant_api.free_cleaning_tables(area=self.room)

		self.assertEqual(answer["freed"], 2)
		self.assertEqual(self.statuses(self.b_cleaning), {self.b_cleaning: CLEANING})

	def test_a_room_that_does_not_exist_is_reported_and_nothing_changes(self):
		before = self.everything()

		# A JSON body can carry a dict where a name is expected, which frappe.db.exists would read as filters
		for area in ("no-such-room", "", None, {"name": self.room}, [self.room], 7):
			with self.subTest(area=area), self.assertRaises(frappe.ValidationError):
				restaurant_api.free_cleaning_tables(area=area, restaurant=self.a)

		self.assertEqual(self.everything(), before)

	def test_whoever_may_set_the_status_of_a_table_may_free_the_tables(self):
		for user in (self.cashier, self.manager, "Administrator"):
			with self.subTest(user=user):
				frappe.db.savepoint("one_user")
				with as_user(user):
					answer = restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)
				self.assertEqual(answer["freed"], 2)
				frappe.db.rollback(save_point="one_user")

	def test_neither_a_visitor_nor_a_website_user_nor_a_portal_account_frees_a_table(self):
		before = self.everything()

		for user in ("Guest", self.website_user, self.portal):
			with self.subTest(user=user), as_user(user), self.assertRaises(frappe.PermissionError):
				restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)

		self.assertEqual(self.everything(), before)

	def test_a_user_kept_to_one_restaurant_frees_its_rooms_only(self):
		self.insert("User Permission", user=self.kept_to_one, allow="Restaurant", for_value=self.a)
		frappe.clear_cache(user=self.kept_to_one)

		with as_user(self.kept_to_one):
			self.assertEqual(
				restaurant_api.free_cleaning_tables(area=self.room, restaurant=self.a)["freed"], 2
			)
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.free_cleaning_tables(area=self.b_room, restaurant=self.b)

		self.assertEqual(self.statuses(self.b_cleaning), {self.b_cleaning: CLEANING})

	def test_the_till_is_told_what_the_server_checks(self):
		# The rule the item is shown by is the rule of the endpoint: a table's status, which a cashier writes
		self.assertEqual(permissions.RIGHTS["set_table_status"], ("Restaurant Table", "write"))
		# A room of restaurant A with no table being cleaned: asking for it changes nothing, whoever asks
		quiet_room = self.insert(
			"Restaurant Area", restaurant=self.a, area_name="_Test Free Tables Quiet Room"
		)
		for user in (self.cashier, self.manager, "Administrator", self.website_user, self.portal, "Guest"):
			with self.subTest(user=user), as_user(user):
				told = permissions.can("set_table_status")
				try:
					restaurant_api.free_cleaning_tables(area=quiet_room, restaurant=self.a)
					served = True
				except frappe.PermissionError:
					served = False
				self.assertEqual(told, served)
