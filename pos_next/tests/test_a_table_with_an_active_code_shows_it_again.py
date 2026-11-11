# //// Neoffice — added file (no upstream equivalent).
"""The QR button of a table shows the code the table already has, to whoever may press it (NeoResto lot 1).

`create_table_token` used to expire every active Guest Order Token of the table and make a new one on each call: pressing
the QR button a second time, or from a second till, killed the code already placed on the table (shown on a tablet, printed,
stuck under a glass) and every phone that had scanned it was told its session was over. It now answers the table's active
token, and makes one only when the table has none that can still be used. A token that can no longer be used (its time ran
out, or the table was freed) is expired, as it always was.

A table's code follows the table, not the till's shift (neoffice-maintenance#2484, product owner 10.11.2026): it was bound to
ERPNext's own till session (a POS Opening Entry), which this till never opens, so it was bound to nothing on a site that never
sold with ERPNext's till and to an old entry left « Open » elsewhere. A new code is bound to no till session, and closing an
entry leaves it; a code an older version bound to an entry still dies with that entry (nothing expired comes back).

Because a press now reuses the table's live code, whoever presses is checked first, and by the rule of the floor read
(`get_tables`, through `permissions.require_floor_access`): whoever the till shows the floor to may press QR for a table of
that till's restaurant, no wider and no narrower. That is a desk account that may read the restaurant of the till named
(Ruling 80): the roles that read a `Restaurant` (the cashier, the managers), and the per-restaurant User Permissions cut in,
so that a user kept to restaurant B who names a till of restaurant A reads neither A's floor nor A's live code. Nothing
more is asked: not an assignment to the till (a kitchen screen's account and a manager read the floor without being users
of the POS Profile), not a right on the table, not the right to make a token. A portal account and a visitor are refused,
a table must be on the floor of the till it names, and the site must run NeoResto.

The suite relies on no patch, no after_migrate and no data of the site: it makes the restaurants, the tills, the rooms and
the tables it needs (the `Tills` fixture of the mode suite), and each test rolls back to the savepoint it started from.
Nothing is committed, and the realtime alert of a table that gets seated is replaced by a spy.
"""

from unittest.mock import patch

import frappe
from frappe.exceptions import FrappeTypeError
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, add_to_date, now_datetime, nowdate

from pos_next.api import guest_ordering
from pos_next.api import restaurant as restaurant_api
from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
from pos_next.restaurant import permissions
from pos_next.tests.test_restaurant_mode_comes_from_the_till import (
	Tills,
	a_site_where_neoresto_is,
	the_refusal,
)
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, TILL, _user

# The accounts of the scoping suite: two cashiers (each assigned to the till of his restaurant), and a portal account that
# was given the cashier's roles and a till by mistake
CASHIER_A = "qr-scope-cashier-a@yopmail.com"
CASHIER_B = "qr-scope-cashier-b@yopmail.com"
PORTAL = "qr-scope-portal@yopmail.com"
# The role that lets a cashier make a Guest Order Token: the doctype's rule names it, the cashier role does not
CODE_ROLE = "POS User"
# The roles that read a Restaurant Table (restaurant_table.json)
TABLE_READERS = {"POSNext Cashier", "Restaurant Manager", "Admin", "POSNext Manager", "Sales Manager", "System Manager"}
# The accounts that tell the floor read's rule from the gates a press used to have. Each is a desk account, none is Administrator
POS_USER_ONLY = "qr-scope-pos-user@yopmail.com"  # POS User and no role that reads a restaurant
CASHIER_ROLE_ONLY = "qr-scope-cashier-role@yopmail.com"  # the cashier role and no POS User: the create right refused it
TILL_MANAGER = "qr-scope-till-manager@yopmail.com"  # POSNext Manager, on no POS Profile
ADMIN = "qr-scope-admin@yopmail.com"  # the customer's Admin role, on no POS Profile
SYSTEM_MANAGER = "qr-scope-system-manager@yopmail.com"  # System Manager without being Administrator
RESTAURANT_MANAGER = "qr-scope-restaurant-manager@yopmail.com"
SALES_MANAGER = "qr-scope-sales-manager@yopmail.com"
BYSTANDER = "qr-scope-bystander@yopmail.com"  # a desk account whose only role has nothing to do with a restaurant
RESTRICTED = "qr-scope-restricted@yopmail.com"  # a cashier kept to the other restaurant by a User Permission
KITCHEN_STAFF = "qr-scope-kitchen@yopmail.com"  # a kitchen screen's account: the kitchen role on a desk account with a till role
RESTRICTED_MANAGER = "qr-scope-restricted-manager@yopmail.com"  # a Restaurant Manager kept to the other restaurant
OWN_MANAGER = "qr-scope-own-manager@yopmail.com"  # a Restaurant Manager kept to THIS restaurant by a User Permission


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
	"""What both suites stand on: the realtime spy, the flag of NeoResto, and the helpers that make rows."""

	def setUp(self):
		super().setUp()
		realtime = patch.object(frappe, "publish_realtime")
		realtime.start()
		self.addCleanup(realtime.stop)
		neoresto = patch.dict(frappe.conf, {"neoresto_active": 1})
		neoresto.start()
		self.addCleanup(neoresto.stop)

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

	def test_a_code_of_a_till_that_is_no_longer_of_the_restaurant_is_brought_to_the_till_that_asks(self):
		# The shop's till that made this code before the restaurant had its own finds no restaurant: its guests read « No guest menu is configured »
		stale = self.place_a_token()
		frappe.db.set_value("Guest Order Token", stale, "pos_profile", self.fx.other_profile)
		placed = frappe.db.get_value("Guest Order Token", stale, "token")

		code = self.press_qr()

		self.assertEqual(code["token"], placed, "the code placed on the table is the one shown")
		self.assertEqual(frappe.db.get_value("Guest Order Token", stale, "pos_profile"), self.fx.profile)
		self.assertEqual(self.tokens_of(self.table), 1)
		self.assertEqual(self.active_tokens(), [placed])

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

	def press_qr_as_the_cashier(self):
		"""The QR button pressed by the till's cashier, whom the till shows the floor to."""
		frappe.set_user(TILL)
		try:
			return self.press_qr()
		finally:
			frappe.set_user("Administrator")

	def test_a_new_code_is_bound_to_no_till_session_even_where_an_erpnext_entry_is_open(self):
		# An entry of ERPNext's own till left « Open » (a site that sold with it before): the code used to be bound to it
		self.open_a_shift()

		code = self.press_qr_as_the_cashier()

		self.assertFalse(frappe.db.get_value("Guest Order Token", code["name"], "pos_opening"))

	def test_closing_an_erpnext_entry_leaves_the_code_of_the_table(self):
		opening = self.open_a_shift()
		first = self.press_qr_as_the_cashier()

		frappe.db.set_value("POS Opening Entry", opening, "status", "Closed")

		self.assertEqual(self.press_qr_as_the_cashier(), first)
		self.assertEqual(self.status_of(first["name"]), "Active")
		self.assertTrue(frappe.get_doc("Guest Order Token", first["name"]).is_valid())

	def test_a_code_an_older_version_bound_to_an_entry_still_dies_with_it(self):
		opening = self.open_a_shift()
		bound = self.place_a_token()
		frappe.db.set_value("Guest Order Token", bound, "pos_opening", opening)

		frappe.db.set_value("POS Opening Entry", opening, "status", "Closed")
		code = self.press_qr_as_the_cashier()

		self.assertNotEqual(code["name"], bound)
		self.assertEqual(self.status_of(bound), "Expired")
		self.assertEqual(self.active_tokens(), [code["token"]])

	def test_a_code_brought_to_the_till_that_asks_drops_the_entry_an_older_version_bound_it_to(self):
		opening = self.open_a_shift()
		stale = self.place_a_token()
		frappe.db.set_value("Guest Order Token", stale, {"pos_profile": self.fx.other_profile, "pos_opening": opening})

		code = self.press_qr_as_the_cashier()

		self.assertEqual(code["name"], stale)
		self.assertFalse(frappe.db.get_value("Guest Order Token", stale, "pos_opening"))

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
		# A visitor is refused before anything is looked up; a cashier of another till is a desk account, which the floor
		# read serves and so does the press (TestWhoMayPressTheQrButton)
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			self.press_qr()
		frappe.set_user("Administrator")

		self.assertEqual(self.tokens_of(self.table), 0)


class TestWhoMayPressTheQrButton(TheQrButton, Tills, FrappeTestCase):
	"""Restaurants A and B share the company; each has a till (a POS Profile), a room and a table. A press reuses the live
	code of a table: it is served to whoever the till shows the floor to, as far as the restaurant of that till (the rule of
	`get_tables`), and a table of the other restaurant is not on this till's floor."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email, roles, user_type in (
			(CASHIER_A, [CASHIER_ROLE, CODE_ROLE], "System User"),
			(CASHIER_B, [CASHIER_ROLE, CODE_ROLE], "System User"),
			(PORTAL, [CASHIER_ROLE, CODE_ROLE, *sorted(TABLE_READERS)], "Website User"),
			(POS_USER_ONLY, [CODE_ROLE], "System User"),
			(CASHIER_ROLE_ONLY, [CASHIER_ROLE], "System User"),
			(TILL_MANAGER, ["POSNext Manager"], "System User"),
			(ADMIN, ["Admin"], "System User"),
			(SYSTEM_MANAGER, ["System Manager"], "System User"),
			(RESTAURANT_MANAGER, ["Restaurant Manager"], "System User"),
			(SALES_MANAGER, ["Sales Manager"], "System User"),
			(BYSTANDER, ["Accounts User"], "System User"),
			(RESTRICTED, [CASHIER_ROLE, CODE_ROLE], "System User"),
			(KITCHEN_STAFF, [permissions.KITCHEN_ROLE, CASHIER_ROLE], "System User"),
			(RESTRICTED_MANAGER, ["Restaurant Manager"], "System User"),
			(OWN_MANAGER, ["Restaurant Manager"], "System User"),
		):
			_user(email, roles, user_type)
		# Each cashier works at the till of his restaurant; the portal account was given the first, by mistake. The two
		# cashiers a press used to refuse are users of the till as well. The managers and the others are on no till.
		for profile, users in (
			(cls.fx.profile, (CASHIER_A, PORTAL, POS_USER_ONLY, CASHIER_ROLE_ONLY, RESTRICTED)),
			(cls.fx.other_profile, (CASHIER_B,)),
		):
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

	def served(self, user, call):
		"""Whether `call` answers `user`: True when it returns, False when it is refused (a PermissionError)."""
		frappe.set_user(user)
		try:
			call()
			return True
		except frappe.PermissionError:
			return False
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

		self.assertEqual(self.tokens_of(self.table_a), 1)
		self.assertEqual(self.status_of(live["name"]), "Active")

	def test_a_cashier_may_not_press_for_a_table_that_is_not_on_the_floor_of_his_till(self):
		with self.assertRaises(frappe.PermissionError):
			self.press_as(CASHIER_A, self.table_b, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_b), 0)

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
		# Since the endpoint types its arguments as text (5e0141b1), Frappe refuses a non-string
		# before the body runs, with its own type error; a body that ran anyway would refuse with
		# PermissionError. Either way: refused, and no code made.
		for table, till in (
			({"name": self.table_a}, self.fx.profile),
			(self.table_a, {"name": self.fx.profile}),
		):
			with (
				self.subTest(table=table, till=till),
				self.assertRaises((frappe.PermissionError, FrappeTypeError)),
			):
				guest_ordering.create_table_token(table, till)

		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_where_neoresto_is_off_no_code_is_made(self):
		for value in (0, None):
			with self.subTest(neoresto=value), a_site_where_neoresto_is(value):
				with self.assertRaises(frappe.ValidationError) as refused:
					guest_ordering.create_table_token(self.table_a, self.fx.profile)
				self.assertEqual(str(refused.exception), the_refusal())

		self.assertEqual(self.tokens_of(self.table_a), 0)

	# --- the rule is the floor read's (`get_tables`): whoever the till shows the floor to may press (Ruling 80) ---

	def keep_to(self, user, restaurant):
		"""A User Permission that confines `user` to one restaurant, as a site that runs several of them sets it up."""
		self.insert("User Permission", user=user, allow="Restaurant", for_value=restaurant)
		frappe.clear_cache(user=user)
		self.addCleanup(frappe.clear_cache, user=user)

	def the_account_is_on_no_till_and_has_no_pos_user_role(self, user):
		"""The premise of the tests below: a desk account that is neither Administrator nor assigned to any till, and that
		does not hold the role the doctype's create right names."""
		self.assertNotEqual(user, "Administrator")
		self.assertFalse(frappe.db.exists("POS Profile User", {"user": user}))
		self.assertNotIn(CODE_ROLE, frappe.get_roles(user))

	def test_a_nexus_pos_manager_who_is_on_no_till_is_served(self):
		self.the_account_is_on_no_till_and_has_no_pos_user_role(TILL_MANAGER)

		code = self.press_as(TILL_MANAGER, self.table_a, self.fx.profile)

		self.assertEqual(self.status_of(code["name"]), "Active")
		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), self.table_a)
		# He is shown that code again, as any cashier is
		self.assertEqual(self.press_as(TILL_MANAGER, self.table_a, self.fx.profile), code)

	def test_an_admin_who_is_on_no_till_is_served(self):
		self.the_account_is_on_no_till_and_has_no_pos_user_role(ADMIN)

		code = self.press_as(ADMIN, self.table_a, self.fx.profile)

		self.assertEqual(self.status_of(code["name"]), "Active")
		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), self.table_a)
		self.assertEqual(self.press_as(ADMIN, self.table_a, self.fx.profile), code)

	def test_a_manager_is_served_at_a_till_of_the_restaurant_of_the_table_and_no_other(self):
		# The restaurant check is the same for him as for a cashier: a table of the other restaurant at this till is refused
		with self.assertRaises(frappe.PermissionError):
			self.press_as(TILL_MANAGER, self.table_b, self.fx.profile)
		code = self.press_as(TILL_MANAGER, self.table_b, self.fx.other_profile)

		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), self.table_b)
		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_a_user_of_the_till_who_holds_pos_user_and_no_role_that_reads_a_restaurant_gets_neither_floor_nor_code(self):
		# The doctype's rule: the restaurant is read by the cashier, the managers and the manager of the till, not by POS User.
		# The floor is not shown to him, so the QR button is not either: the two agree (the count of such users on the
		# restaurant tills of prodclone is 0 of 7)
		self.assertEqual(TABLE_READERS & set(frappe.get_roles(POS_USER_ONLY)), set())
		self.assertTrue(frappe.db.exists("POS Profile User", {"parent": self.fx.profile, "user": POS_USER_ONLY}))

		with self.assertRaises(frappe.PermissionError):
			self.served_or_raise(POS_USER_ONLY, lambda: restaurant_api.get_tables(self.restaurant))
		with self.assertRaises(frappe.PermissionError):
			self.press_as(POS_USER_ONLY, self.table_a, self.fx.profile)

		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_a_cashier_with_the_cashier_role_and_no_pos_user_is_served(self):
		# The doctype's create right names POS User, which the cashier role does not carry: the press is the gate's, and
		# the code is made with its authority, as it always was
		self.assertNotIn(CODE_ROLE, frappe.get_roles(CASHIER_ROLE_ONLY))

		code = self.press_as(CASHIER_ROLE_ONLY, self.table_a, self.fx.profile)

		self.assertEqual(self.status_of(code["name"]), "Active")
		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "created_by_user"), CASHIER_ROLE_ONLY)

	def test_a_cashier_without_the_right_to_make_a_code_still_replaces_a_stale_one(self):
		stale = self.insert("Guest Order Token", mode="restaurant", table=self.table_a, pos_profile=self.fx.profile)
		frappe.db.set_value("Guest Order Token", stale, "expires_at", add_to_date(now_datetime(), hours=-1))

		code = self.press_as(CASHIER_ROLE_ONLY, self.table_a, self.fx.profile)

		self.assertNotEqual(code["name"], stale)
		self.assertEqual((self.status_of(stale), self.status_of(code["name"])), ("Expired", "Active"))

	def served_or_raise(self, user, call):
		"""`call` as `user`, its answer returned and its refusal raised."""
		frappe.set_user(user)
		try:
			return call()
		finally:
			frappe.set_user("Administrator")

	def test_a_user_kept_to_the_other_restaurant_gets_neither_the_floor_nor_the_live_code_of_this_one(self):
		# Ruling 80: a desk user confined to restaurant B who names a till of restaurant A (here the cashier, who is not even
		# a user of A's till, and the manager) gets neither A's floor nor A's live code
		live = guest_ordering.create_table_token(self.table_a, self.fx.profile)
		self.keep_to(RESTRICTED, self.restaurant_b)
		self.keep_to(RESTRICTED_MANAGER, self.restaurant_b)

		for user in (RESTRICTED, RESTRICTED_MANAGER):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.served_or_raise(user, lambda: restaurant_api.get_tables(self.restaurant))
				with self.assertRaises(frappe.PermissionError):
					self.press_as(user, self.table_a, self.fx.profile)

		# The live code of the table was shown to nobody, and is as it was
		self.assertEqual(self.tokens_of(self.table_a), 1)
		self.assertEqual(self.status_of(live["name"]), "Active")

	def test_a_user_kept_to_a_restaurant_reads_the_floor_and_the_code_of_that_one(self):
		self.keep_to(RESTRICTED, self.restaurant_b)
		self.keep_to(OWN_MANAGER, self.restaurant)

		# The cashier kept to B, at B's till, for B's floor and B's table
		floor = self.served_or_raise(RESTRICTED, lambda: restaurant_api.get_tables(self.restaurant_b))
		code = self.press_as(RESTRICTED, self.table_b, self.fx.other_profile)
		self.assertIn(self.table_b, [table["name"] for table in floor["tables"]])
		self.assertNotIn(self.table_a, [table["name"] for table in floor["tables"]])
		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), self.table_b)
		# The manager kept to THIS restaurant, for its floor and its table: the permission cuts only the other restaurant's
		floor = self.served_or_raise(OWN_MANAGER, lambda: restaurant_api.get_tables(self.restaurant))
		code = self.press_as(OWN_MANAGER, self.table_a, self.fx.profile)
		self.assertIn(self.table_a, [table["name"] for table in floor["tables"]])
		self.assertNotIn(self.table_b, [table["name"] for table in floor["tables"]])
		self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), self.table_a)

	def test_an_unconfined_manager_reads_both_floors_and_may_press_in_both(self):
		# No User Permission, no assignment to a till: the rule is the right to read the restaurant, nothing more
		self.assertFalse(frappe.db.exists("User Permission", {"user": RESTAURANT_MANAGER}))

		for restaurant, table, till in (
			(self.restaurant, self.table_a, self.fx.profile),
			(self.restaurant_b, self.table_b, self.fx.other_profile),
		):
			with self.subTest(restaurant=restaurant):
				floor = self.served_or_raise(RESTAURANT_MANAGER, lambda: restaurant_api.get_tables(restaurant))
				code = self.press_as(RESTAURANT_MANAGER, table, till)
				self.assertIn(table, [row["name"] for row in floor["tables"]])
				self.assertEqual(frappe.db.get_value("Guest Order Token", code["name"], "table"), table)

	def test_a_kitchen_screens_account_reads_the_rooms_without_being_a_user_of_the_till(self):
		# The kitchen and the runner read their rooms from `get_tables` (NeoResto lot 1, task 9c). A kitchen tablet runs on a
		# desk account that holds a till role besides the kitchen's: it reads the restaurant, and is no user of the POS Profile
		self.assertIn(permissions.KITCHEN_ROLE, frappe.get_roles(KITCHEN_STAFF))
		self.assertFalse(frappe.db.exists("POS Profile User", {"user": KITCHEN_STAFF}))

		floor = self.served_or_raise(KITCHEN_STAFF, lambda: restaurant_api.get_tables(self.restaurant))

		self.assertIn("_Test Press Room A", [area["area_name"] for area in floor["areas"]])
		self.assertIn(self.table_a, [table["name"] for table in floor["tables"]])
		self.assertNotIn(self.table_b, [table["name"] for table in floor["tables"]])
		# And what it reads of the other restaurant is that restaurant's, as ever
		other = self.served_or_raise(KITCHEN_STAFF, lambda: restaurant_api.get_tables(self.restaurant_b))
		self.assertIn(self.table_b, [table["name"] for table in other["tables"]])
		self.assertNotIn(self.table_a, [table["name"] for table in other["tables"]])

	def test_the_press_is_served_to_exactly_the_accounts_the_floor_read_is_served_to(self):
		# The rule of the floor (`require_floor_access`) is a desk account that may read the restaurant: the roles that read a
		# `Restaurant`, and the User Permissions that keep a user to another. It asks no assignment to the till, no right on
		# the table and no right to make a token. The press asks that and then that the table is of the till's restaurant: it
		# is exactly as open as the floor read, no wider and no narrower.
		self.keep_to(RESTRICTED, self.restaurant_b)
		self.keep_to(RESTRICTED_MANAGER, self.restaurant_b)
		self.keep_to(OWN_MANAGER, self.restaurant)
		accounts = [
			("Administrator", "Administrator", True),
			("a cashier assigned to the till", CASHIER_A, True),
			("a cashier of the other restaurant, with no User Permission, naming this restaurant's till", CASHIER_B, True),
			("the cashier role and no POS User", CASHIER_ROLE_ONLY, True),
			("POSNext Manager, on no till", TILL_MANAGER, True),
			("Admin, on no till", ADMIN, True),
			("System Manager without being Administrator", SYSTEM_MANAGER, True),
			("an unconfined Restaurant Manager, on no till", RESTAURANT_MANAGER, True),
			("a Restaurant Manager kept to this restaurant by a User Permission", OWN_MANAGER, True),
			("Sales Manager", SALES_MANAGER, True),
			("a kitchen screen's account: the kitchen role and the cashier role, on no till", KITCHEN_STAFF, True),
			("POS User and no role that reads a restaurant", POS_USER_ONLY, False),
			("a desk account whose only role is not the restaurant's", BYSTANDER, False),
			("a cashier kept to the other restaurant by a User Permission", RESTRICTED, False),
			("a Restaurant Manager kept to the other restaurant by a User Permission", RESTRICTED_MANAGER, False),
			("a portal account given every role", PORTAL, False),
			("a visitor", "Guest", False),
		]
		for label, user, expected in accounts:
			with self.subTest(account=label):
				# Each account starts from the same floor: a press seats the table, the next read of the floor is not asked
				# to undo it
				frappe.db.savepoint("qr_floor_parity")
				try:
					floor = self.served(user, lambda: restaurant_api.get_tables(self.restaurant))
					press = self.served(
						user, lambda: guest_ordering.create_table_token(self.table_a, self.fx.profile)
					)
				finally:
					frappe.db.rollback(save_point="qr_floor_parity")
				self.assertEqual(floor, expected, f"the floor read, for {label}")
				self.assertEqual(press, floor, f"the press and the floor read disagree for {label}")

	def test_the_press_and_the_floor_read_ask_the_same_function(self):
		# One function says whom the floor is shown to: a change of the rule is made there, for both
		with patch.object(permissions, "require_floor_access", side_effect=frappe.PermissionError) as rule:
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.get_tables(self.restaurant)
			with self.assertRaises(frappe.PermissionError):
				guest_ordering.create_table_token(self.table_a, self.fx.profile)

		self.assertEqual(rule.call_count, 2)
		self.assertEqual(self.tokens_of(self.table_a), 0)

	def test_both_ask_it_for_the_restaurant_of_the_till_that_is_named(self):
		# The restaurant the rule is asked for: the one `get_tables` is asked about, and the one of the till the press names
		with patch.object(permissions, "require_floor_access", wraps=permissions.require_floor_access) as rule:
			restaurant_api.get_tables(self.restaurant_b)
			guest_ordering.create_table_token(self.table_b, self.fx.other_profile)

		self.assertEqual([call.args for call in rule.call_args_list], [(self.restaurant_b,), (self.restaurant_b,)])
