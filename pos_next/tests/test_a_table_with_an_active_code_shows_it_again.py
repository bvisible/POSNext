# //// Neoffice — added file (no upstream equivalent).
"""The QR button of a table shows the code the table already has (NeoRestau lot 1).

`create_table_token` used to expire every active Guest Order Token of the table and make a new one on each call: pressing
the QR button a second time, or from a second till, killed the code already placed on the table (shown on a tablet, printed,
stuck under a glass) and every phone that had scanned it was told its session was over. It now answers the table's active
token, and makes one only when the table has none that can still be used. A token that can no longer be used (its time ran
out, or the table was freed) is expired, as it always was.

The suite relies on no patch, no after_migrate and no data of the site: it makes the restaurant, the till, the room and the
tables it needs (the `Tills` fixture of the mode suite), and each test rolls back to the savepoint it started from. Nothing
is committed, and the realtime alert of a table that gets seated is replaced by a spy.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, add_to_date, now_datetime

from pos_next.api import guest_ordering
from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
from pos_next.tests.test_restaurant_mode_comes_from_the_till import Tills
from pos_next.tests.test_till_writes_need_the_till import OTHER_TILL


class TestTheQrButtonOfATable(Tills, FrappeTestCase):
	def setUp(self):
		super().setUp()
		area = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Code Room")
		self.table = self.insert("Restaurant Table", area=area, table_name="_Test Code T1")
		self.other_table = self.insert("Restaurant Table", area=area, table_name="_Test Code T2")
		realtime = patch.object(frappe, "publish_realtime")
		realtime.start()
		self.addCleanup(realtime.stop)

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

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

	def status_of(self, name):
		return frappe.db.get_value("Guest Order Token", name, "status")

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
		self.assertEqual(frappe.db.count("Guest Order Token", {"table": self.table}), 1)

	def test_the_code_placed_on_the_table_goes_on_working(self):
		first = self.press_qr()
		for _ in range(3):
			self.press_qr()

		placed = frappe.get_doc("Guest Order Token", first["name"])
		self.assertEqual(placed.status, "Active")
		self.assertTrue(placed.is_valid())

	def test_whichever_till_asks_gets_the_code_of_the_table(self):
		first = self.press_qr()
		second = self.press_qr(till=self.fx.other_profile)

		self.assertEqual(second, first)
		self.assertEqual(
			frappe.db.get_value("Guest Order Token", first["name"], "pos_profile"), self.fx.profile
		)
		self.assertEqual(frappe.db.count("Guest Order Token", {"table": self.table}), 1)

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

		self.assertEqual(frappe.db.count("Guest Order Token", {"table": self.table}), 0)
