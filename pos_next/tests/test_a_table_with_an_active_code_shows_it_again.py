# //// Neoffice — added file (no upstream equivalent).
"""The QR button of a table shows the code the table already has, to whoever may press it (NeoRestau lot 1).

`create_table_token` used to expire every active Guest Order Token of the table and make a new one on each call: pressing
the QR button a second time, or from a second till, killed the code already placed on the table (shown on a tablet, printed,
stuck under a glass) and every phone that had scanned it was told its session was over. It now answers the table's active
token, and makes one only when the table has none that can still be used. A token that can no longer be used (its time ran
out, its POS opening closed, or the table was freed) is expired, as it always was.

Because a press now reuses the table's live code, whoever presses is checked first: a desk account that may read the table,
assigned to the till it names (or a till manager), whose till belongs to the restaurant of the table, where the site runs
NeoRestau. A cashier of another restaurant reads no code of this one.

The suite relies on no patch, no after_migrate and no data of the site: it makes the restaurants, the tills, the rooms and
the tables it needs (the `Tills` fixture of the mode suite), and each test rolls back to the savepoint it started from.
Nothing is committed, and the realtime alert of a table that gets seated is replaced by a spy.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, add_to_date, now_datetime, nowdate

from pos_next.api import guest_ordering
from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
from pos_next.tests.test_restaurant_mode_comes_from_the_till import (
	Tills,
	a_site_where_neorestau_is,
	the_refusal,
)
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, _user

# The accounts of the scoping suite: two cashiers (each assigned to the till of his restaurant), and a portal account that
# was given the cashier's roles and a till by mistake
CASHIER_A = "qr-scope-cashier-a@yopmail.com"
CASHIER_B = "qr-scope-cashier-b@yopmail.com"
PORTAL = "qr-scope-portal@yopmail.com"
# The role that lets a cashier make a Guest Order Token: the doctype's rule names it, the cashier role does not
CODE_ROLE = "POS User"


def make_a_till_of(profile, restaurant):
	"""The POS Settings of a till in restaurant mode: the till belongs to the restaurant (the profile is the fixture's)."""
	for name in frappe.get_all("POS Settings", filters={"pos_profile": profile}, pluck="name"):
		frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
	doc = frappe.get_doc(
		{
			"doctype": "POS Settings",
			"pos_profile": profile,
			"enabled": 1,
			"enable_restaurant_mode": 1,
			"restaurant": restaurant,
		}
	)
	doc.flags.ignore_links = True
	doc.flags.ignore_mandatory = True
	return doc.insert(ignore_permissions=True).name


class TheQrButton:
	"""What both suites stand on: the realtime spy, the flag of NeoRestau, and the helpers that make rows."""

	def setUp(self):
		super().setUp()
		realtime = patch.object(frappe, "publish_realtime")
		realtime.start()
		self.addCleanup(realtime.stop)
		neorestau = patch.dict(frappe.conf, {"neorestau_active": 1})
		neorestau.start()
		self.addCleanup(neorestau.stop)

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def status_of(self, name):
		return frappe.db.get_value("Guest Order Token", name, "status")

	def tokens_of(self, table):
		return frappe.db.count("Guest Order Token", {"table": table})


class TestTheQrButtonOfATable(TheQrButton, Tills, FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant)
		area = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Code Room")
		self.table = self.insert("Restaurant Table", area=area, table_name="_Test Code T1")
		self.other_table = self.insert("Restaurant Table", area=area, table_name="_Test Code T2")

	def press_qr(self, table=None, till=None):
		"""What the QR button asks the server for: the code of a table, from a till."""
		return guest_ordering.create_table_token(table or self.table, till or self.fx.profile)

	def active_tokens(self, table=None):
		return frappe.get_all(
			"Guest Order Token",
			filters={"table": table or self.table, "status": "Active"},
			order_by="creation asc",
			pluck="token",
		)

	def place_a_token(self, minutes_ago=0):
		"""A token of the table made behind the endpoint's back, created `minutes_ago` minutes ago."""
		name = self.insert(
			"Guest Order Token", mode="restaurant", table=self.table, pos_profile=self.fx.profile
		)
		if minutes_ago:
			frappe.db.set_value(
				"Guest Order Token",
				name,
				"creation",
				add_to_date(now_datetime(), minutes=-minutes_ago),
				update_modified=False,
			)
		return name

	def open_a_shift(self):
		"""The POS Opening Entry of the till, open, as a cashier's shift leaves it (its own checks are not under test)."""
		entry = frappe.get_doc(
			{
				"doctype": "POS Opening Entry",
				"period_start_date": now_datetime(),
				"posting_date": nowdate(),
				"company": self.fx.company,
				"pos_profile": self.fx.profile,
				"user": "Administrator",
				"status": "Open",
				"balance_details": [{"mode_of_payment": self.fx.mode, "opening_amount": 0}],
			}
		)
		entry.flags.ignore_validate = True
		entry.flags.ignore_mandatory = True
		entry.flags.ignore_links = True
		entry.insert(ignore_permissions=True)
		frappe.db.set_value("POS Opening Entry", entry.name, "docstatus", 1)
		return entry.name

	def test_a_table_without_a_code_gets_one(self):
		code = self.press_qr()

		self.assertEqual(set(code), {"token", "url", "name"})
		self.assertTrue(code["url"].endswith(f"/pos/guest/{code['token']}"))
		self.assertEqual(self.active_tokens(), [code["token"]])
		self.assertEqual(
			frappe.db.get_value(
				"Guest Order Token", code["name"], ["table", "pos_profile", "mode"], as_dict=True
			),
			{"table": self.table, "pos_profile": self.fx.profile, "mode": "restaurant"},
		)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table, "status"), "Occupied")

	def test_a_table_that_has_a_code_shows_that_code_again(self):
		first = self.press_qr()
		second = self.press_qr()

		self.assertEqual(second, first)
		self.assertEqual(self.active_tokens(), [first["token"]])
		self.assertEqual(self.tokens_of(self.table), 1)

	def test_the_code_placed_on_the_table_goes_on_working(self):
		first = self.press_qr()
		for _ in range(3):
			self.press_qr()

		placed = frappe.get_doc("Guest Order Token", first["name"])
		self.assertEqual(placed.status, "Active")
		self.assertTrue(placed.is_valid())

	def test_another_till_of_the_restaurant_gets_the_code_of_the_table(self):
		make_a_till_of(self.fx.other_profile, self.restaurant)
		first = self.press_qr()
		second = self.press_qr(till=self.fx.other_profile)

		self.assertEqual(second, first)
		self.assertEqual(
			frappe.db.get_value("Guest Order Token", first["name"], "pos_profile"), self.fx.profile
		)
		self.assertEqual(self.tokens_of(self.table), 1)

	def test_each_table_has_its_own_code(self):
		first = self.press_qr()
		other = self.press_qr(self.other_table)

		self.assertNotEqual(other["token"], first["token"])
		self.assertEqual(self.active_tokens(), [first["token"]])
		self.assertEqual(self.active_tokens(self.other_table), [other["token"]])
		self.assertEqual(self.press_qr(), first)
		self.assertEqual(self.press_qr(self.other_table), other)

	def test_a_table_that_was_freed_gets_a_new_code(self):
		first = self.press_qr()
		# What freeing the table does (update_table_status to Empty, mark_table_available)
		GuestOrderToken.expire_tokens_for_table(self.table)

		second = self.press_qr()

		self.assertNotEqual(second["token"], first["token"])
		self.assertEqual(self.active_tokens(), [second["token"]])
		self.assertEqual(self.status_of(first["name"]), "Expired")

	def test_a_code_whose_time_has_run_out_is_replaced(self):
		first = self.press_qr()
		frappe.db.set_value(
			"Guest Order Token", first["name"], "expires_at", add_to_date(now_datetime(), hours=-1)
		)

		second = self.press_qr()

		self.assertNotEqual(second["token"], first["token"])
		self.assertEqual(self.active_tokens(), [second["token"]])
		self.assertEqual(self.status_of(first["name"]), "Expired")

	def test_a_code_whose_time_has_not_run_out_is_kept(self):
		first = self.press_qr()
		frappe.db.set_value("Guest Order Token", first["name"], "expires_at", add_days(now_datetime(), 7))

		self.assertEqual(self.press_qr(), first)
		self.assertEqual(self.active_tokens(), [first["token"]])

	def test_a_code_whose_pos_opening_has_closed_is_replaced(self):
		# The code is made while the till's shift is open, and bound to it
		opening = self.open_a_shift()
		first = self.press_qr()
		self.assertEqual(frappe.db.get_value("Guest Order Token", first["name"], "pos_opening"), opening)
		self.assertEqual(self.press_qr(), first)

		# The shift is closed: the code can no longer be used, whatever its time
		frappe.db.set_value("POS Opening Entry", opening, "status", "Closed")
		second = self.press_qr()

		self.assertNotEqual(second["token"], first["token"])
		self.assertEqual(self.status_of(first["name"]), "Expired")
		self.assertEqual(self.active_tokens(), [second["token"]])

	def test_the_newest_usable_code_is_the_one_shown_and_none_is_killed(self):
		older = self.place_a_token(minutes_ago=10)
		newer = self.place_a_token(minutes_ago=5)

		shown = self.press_qr()

		self.assertEqual(shown["name"], newer)
		self.assertEqual((self.status_of(older), self.status_of(newer)), ("Active", "Active"))

	def test_a_code_that_can_no_longer_be_used_is_expired_beside_the_one_shown(self):
		stale = self.place_a_token(minutes_ago=10)
		frappe.db.set_value(
			"Guest Order Token", stale, "expires_at", add_to_date(now_datetime(), hours=-1)
		)
		usable = self.place_a_token(minutes_ago=5)

		shown = self.press_qr()

		self.assertEqual(shown["name"], usable)
		self.assertEqual((self.status_of(stale), self.status_of(usable)), ("Expired", "Active"))

	def test_a_stale_code_the_orm_refuses_to_expire_is_expired_through_the_database(self):
		stale = self.place_a_token(minutes_ago=10)
		frappe.db.set_value(
			"Guest Order Token", stale, "expires_at", add_to_date(now_datetime(), hours=-1)
		)

		with (
			patch.object(GuestOrderToken, "expire", side_effect=frappe.ValidationError("an old token")),
			patch.object(frappe, "log_error") as logged,
		):
			shown = self.press_qr()

		self.assertEqual(self.status_of(stale), "Expired")
		self.assertNotEqual(shown["name"], stale)
		logged.assert_called_once()

	def test_a_database_error_while_a_stale_code_is_expired_is_not_swallowed(self):
		# InnoDB rolls the whole transaction back when it picks a request as the deadlock victim: the request must fail
		# with the error, not go on and commit what is left of it
		stale = self.place_a_token(minutes_ago=10)
		frappe.db.set_value(
			"Guest Order Token", stale, "expires_at", add_to_date(now_datetime(), hours=-1)
		)

		for error in (frappe.QueryDeadlockError, frappe.QueryTimeoutError):
			with self.subTest(error=error.__name__):
				with (
					patch.object(GuestOrderToken, "expire", side_effect=error),
					patch.object(frappe, "log_error") as logged,
					self.assertRaises(error),
				):
					self.press_qr()
				logged.assert_not_called()
				# Nothing was forced through the database behind the error
				self.assertEqual(self.status_of(stale), "Active")

	def test_a_table_shown_its_code_again_is_still_seated(self):
		first = self.press_qr()
		frappe.db.set_value("Restaurant Table", self.table, "status", "Empty")

		self.assertEqual(self.press_qr(), first)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table, "status"), "Occupied")

	def test_the_request_is_checked_before_any_code_is_given(self):
		with self.assertRaises(frappe.ValidationError):
			self.press_qr("_Test Code no such table")
		frappe.set_user(OTHER_TILL)
		with self.assertRaises(frappe.PermissionError):
			self.press_qr()
		frappe.set_user("Administrator")

		self.assertEqual(self.tokens_of(self.table), 0)


class TestWhoMayPressTheQrButton(TheQrButton, Tills, FrappeTestCase):
	"""Restaurants A and B share the company; each has a till (a POS Profile), a room and a table. A press reuses the live
	code of a table, so it must not show it to a cashier of the other restaurant."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email, user_type in (
			(CASHIER_A, "System User"),
			(CASHIER_B, "System User"),
			(PORTAL, "Website User"),
		):
			_user(email, [CASHIER_ROLE, CODE_ROLE], user_type)
		# Each cashier works at the till of his restaurant; the portal account was given the first, by mistake
		for profile, users in ((cls.fx.profile, (CASHIER_A, PORTAL)), (cls.fx.other_profile, (CASHIER_B,))):
			doc = frappe.get_doc("POS Profile", profile)
			for user in users:
				doc.append("applicable_for_users", {"user": user})
			doc.save(ignore_permissions=True)

	def setUp(self):
		super().setUp()
		self.restaurant_b = self.insert(
			"Restaurant", restaurant_name="_Test Press Other", company=self.company
		)
		make_a_till_of(self.fx.profile, self.restaurant)
		make_a_till_of(self.fx.other_profile, self.restaurant_b)
		area_a = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Press Room A")
		area_b = self.insert("Restaurant Area", restaurant=self.restaurant_b, area_name="_Test Press Room B")
		self.table_a = self.insert("Restaurant Table", area=area_a, table_name="_Test Press A1")
		self.table_b = self.insert("Restaurant Table", area=area_b, table_name="_Test Press B1")
		self.addCleanup(frappe.set_user, "Administrator")

	def press_as(self, user, table, till):
		frappe.set_user(user)
		try:
			return guest_ordering.create_table_token(table, till)
		finally:
			frappe.set_user("Administrator")

	def test_the_cashier_of_the_till_is_served(self):
		code = self.press_as(CASHIER_A, self.table_a, self.fx.profile)
		other = self.press_as(CASHIER_B, self.table_b, self.fx.other_profile)

		self.assertEqual(self.status_of(code["name"]), "Active")
		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), self.table_a)
		self.assertEqual(frappe.db.get_value("Guest Order Token", other["name"], "table"), self.table_b)
		# The second press of the same cashier shows the same code
		self.assertEqual(self.press_as(CASHIER_A, self.table_a, self.fx.profile), code)

	def test_a_till_manager_is_served_at_any_till_of_the_restaurant_of_the_table(self):
		code = guest_ordering.create_table_token(self.table_a, self.fx.profile)

		self.assertEqual(self.status_of(code["name"]), "Active")

	def test_a_cashier_of_another_restaurant_reads_no_code_of_this_one(self):
		live = guest_ordering.create_table_token(self.table_a, self.fx.profile)

		# At his own till, for a table that is not on its floor
		with self.assertRaises(frappe.PermissionError):
			self.press_as(CASHIER_B, self.table_a, self.fx.other_profile)
		# Naming the till of the other restaurant, which he is not assigned to
		with self.assertRaises(frappe.PermissionError):
			self.press_as(CASHIER_B, self.table_a, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_a), 1)
		self.assertEqual(self.status_of(live["name"]), "Active")

	def test_a_cashier_may_not_press_for_a_table_that_is_not_on_the_floor_of_his_till(self):
		with self.assertRaises(frappe.PermissionError):
			self.press_as(CASHIER_A, self.table_b, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_b), 0)

	def test_a_cashier_kept_to_another_restaurant_by_a_user_permission_is_refused(self):
		# The site restricts the cashier to restaurant B: he reads no table of A, even at the till he is assigned to
		self.addCleanup(frappe.clear_cache, user=CASHIER_A)
		self.insert("User Permission", user=CASHIER_A, allow="Restaurant", for_value=self.restaurant_b)
		frappe.clear_cache(user=CASHIER_A)

		with self.assertRaises(frappe.PermissionError):
			self.press_as(CASHIER_A, self.table_a, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_a_portal_account_is_refused_whatever_roles_and_till_it_was_given(self):
		live = guest_ordering.create_table_token(self.table_a, self.fx.profile)

		with self.assertRaises(frappe.PermissionError):
			self.press_as(PORTAL, self.table_a, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_a), 1)
		self.assertEqual(self.status_of(live["name"]), "Active")

	def test_a_visitor_is_refused(self):
		with self.assertRaises(frappe.PermissionError):
			self.press_as("Guest", self.table_a, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_a_till_that_belongs_to_no_restaurant_is_refused(self):
		for name in frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)

		with self.assertRaises(frappe.PermissionError):
			guest_ordering.create_table_token(self.table_a, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_a_name_is_not_a_till_or_a_table_unless_it_is_a_string(self):
		for table, till in (
			({"name": self.table_a}, self.fx.profile),
			(self.table_a, {"name": self.fx.profile}),
		):
			with self.subTest(table=table, till=till), self.assertRaises(frappe.PermissionError):
				guest_ordering.create_table_token(table, till)

		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_where_neorestau_is_off_no_code_is_made(self):
		for value in (0, None):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				with self.assertRaises(frappe.ValidationError) as refused:
					guest_ordering.create_table_token(self.table_a, self.fx.profile)
				self.assertEqual(str(refused.exception), the_refusal())

		self.assertEqual(self.tokens_of(self.table_a), 0)
