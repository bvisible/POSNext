# //// Neoffice — added file (no upstream equivalent).
"""A guest session names its restaurant from its first call (NeoResto lot 1, Ruling 52).

The tab of a guest page carries the name of the restaurant: "The Bistro · Neopos" instead of "Order · Neopos". The only name
a page had was the company of the order, which `get_order_status` answers once an invoice exists, so a page had no name
before the first order and, on a site that runs several restaurants under one company, no page could tell them apart.

`validate_token`, the call every guest session starts with, and `create_takeaway_token`, the takeaway session's first call,
now answer `restaurant_name`: the display name of the restaurant of the session. That is the restaurant of the till that
made the table's code, the default restaurant for a takeaway session (it has no till), and none for a till that is no
restaurant till.

The suite relies on no patch, no after_migrate and no data of the site: it makes the restaurants, the tills and the tables it
needs (the `Tills` fixture of the mode suite), and each test rolls back to the savepoint it started from. Nothing is
committed.
"""

from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import guest_ordering
from pos_next.restaurant import scope
from pos_next.restaurant import settings as restaurant_config
from pos_next.tests.test_a_table_with_an_active_code_shows_it_again import make_a_till_of
from pos_next.tests.test_restaurant_mode_comes_from_the_till import RESTAURANT, Tills, a_request_from

SECOND_RESTAURANT = "_Test Guest Names Second"


@contextmanager
def the_default_restaurant_is(restaurant):
	"""The default restaurant as every module that names it reads it."""
	with (
		patch.object(restaurant_config, "default_restaurant", return_value=restaurant),
		patch.object(scope, "default_restaurant", return_value=restaurant),
	):
		yield


class TestTheGuestSessionNamesItsRestaurant(Tills, FrappeTestCase):
	"""Two restaurants of one company, each with a till and a table."""

	def setUp(self):
		super().setUp()
		for patcher in (
			patch.object(frappe, "publish_realtime"),
			patch.dict(frappe.conf, {"neoresto_active": 1}),
		):
			patcher.start()
			self.addCleanup(patcher.stop)
		self.second = self.insert("Restaurant", restaurant_name=SECOND_RESTAURANT, company=self.company)
		make_a_till_of(self.fx.profile, self.restaurant)
		make_a_till_of(self.fx.other_profile, self.second)
		room = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Guest Names Room")
		other_room = self.insert(
			"Restaurant Area", restaurant=self.second, area_name="_Test Guest Names Second Room"
		)
		self.table = self.insert("Restaurant Table", area=room, table_name="_Test Guest Names T1")
		self.second_table = self.insert("Restaurant Table", area=other_room, table_name="_Test Guest Names T2")

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def session_of(self, table, till):
		"""A diner's first call on the table's code: what the guest page asks, as a visitor."""
		token = guest_ordering.create_table_token(table, till)["token"]
		frappe.set_user("Guest")
		try:
			return guest_ordering.validate_token(token)
		finally:
			frappe.set_user("Administrator")

	def test_a_table_session_names_the_restaurant_of_its_till(self):
		first = self.session_of(self.table, self.fx.profile)
		second = self.session_of(self.second_table, self.fx.other_profile)

		self.assertEqual(first["restaurant_name"], RESTAURANT)
		self.assertEqual(second["restaurant_name"], SECOND_RESTAURANT)

	def test_two_restaurants_of_one_company_are_told_apart_by_the_restaurant_not_the_company(self):
		first = self.session_of(self.table, self.fx.profile)
		second = self.session_of(self.second_table, self.fx.other_profile)

		self.assertNotEqual(first["restaurant_name"], second["restaurant_name"])
		self.assertNotIn(self.company, (first["restaurant_name"], second["restaurant_name"]))

	def test_the_name_comes_with_the_session_before_any_order(self):
		session = self.session_of(self.table, self.fx.profile)

		# No invoice exists yet, and the session already has the restaurant
		self.assertFalse(frappe.db.exists("Sales Invoice", {"restaurant_table": self.table}))
		self.assertEqual(session["restaurant_name"], RESTAURANT)
		self.assertTrue(session["valid"])

	def test_a_session_of_a_till_that_belongs_to_no_restaurant_names_none(self):
		for name in frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)
		frappe.set_user("Guest")
		try:
			session = guest_ordering.validate_token(token.token)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(session["restaurant_name"], "")

	def test_the_takeaway_session_names_the_default_restaurant_from_its_first_call(self):
		frappe.db.set_value("Restaurant", self.second, "enable_web_takeaway", 1)
		frappe.clear_document_cache("Restaurant", self.second)

		with the_default_restaurant_is(self.second), a_request_from("10.0.0.7"):
			first_call = guest_ordering.create_takeaway_token()
			frappe.set_user("Guest")
			try:
				session = guest_ordering.validate_token(first_call["token"])
			finally:
				frappe.set_user("Administrator")

		self.assertEqual(first_call["restaurant_name"], SECOND_RESTAURANT)
		self.assertEqual(session["restaurant_name"], SECOND_RESTAURANT)
