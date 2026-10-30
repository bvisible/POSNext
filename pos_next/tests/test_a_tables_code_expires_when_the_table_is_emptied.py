# //// Neoffice — added file (no upstream equivalent).
"""A table's QR code expires whenever the table is emptied (NeoRestau lot 1, Ruling 52).

Freeing a table by hand (`update_table_status` to Empty, `mark_table_available`) expired its guest codes; three other
paths emptied a table and left them active, so that the next QR press showed the previous party's code again, and the
previous party (or anyone who kept a photo of it) could still order onto the table:

- `reset_all_tables`, the reset of the floor;
- the cancel of an invoice (`on_invoice_update`), which releases the invoice's table;
- the floor read (`get_tables`) that empties a table that is Occupied but holds no open order.

One helper, `expire_codes_of_emptied_tables`, is used by the three. A table that still holds an open order (a draft
invoice linked to it) is not empty, and keeps its codes. The floor read and the cancel have one more rule: a QR press seats
a table without any order, so the floor read empties it at once, and the code the press has just placed is waiting for its
first order; expiring it there would kill it before the first guest could use it, and so would the cancel of an old invoice
of the table, when the party now seated has no draft yet. That code stays, as does a code whose order is a draft that is
still open; a code whose order is gone expires with the table. The reset wipes the floor and spares nothing.

A database error (a deadlock, a timeout) is never swallowed on the way: the database has rolled the request back, and it
must fail with the error rather than commit what is left of a cancel. What the ORM refuses (a validation error) is
expired through the database all the same.

The suite relies on no patch, no after_migrate and no data of the site: it makes the restaurants, the tables and the
orders it needs (the `Tills` fixture of the mode suite), and each test rolls back to the savepoint it started from.
Nothing is committed, and the realtime alerts are replaced by a spy.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import guest_ordering, invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
from pos_next.tests.test_a_table_with_an_active_code_shows_it_again import make_a_till_of
from pos_next.tests.test_restaurant_mode_comes_from_the_till import Tills
from pos_next.tests.test_till_writes_need_the_till import _sale


class TestTheCodeOfAnEmptiedTable(Tills, FrappeTestCase):
	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		realtime = patch.object(frappe, "publish_realtime")
		realtime.start()
		self.addCleanup(realtime.stop)
		neorestau = patch.dict(frappe.conf, {"neorestau_active": 1})
		neorestau.start()
		self.addCleanup(neorestau.stop)
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant)
		area = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Emptied Room")
		self.table = self.insert("Restaurant Table", area=area, table_name="_Test Emptied T1")
		self.second_table = self.insert("Restaurant Table", area=area, table_name="_Test Emptied T2")
		# Another restaurant on the same site: what one floor does to its codes, it does not do to the other's
		other = self.insert("Restaurant", restaurant_name="_Test Emptied Other", company=self.company)
		make_a_till_of(self.fx.other_profile, other)
		other_area = self.insert("Restaurant Area", restaurant=other, area_name="_Test Emptied Other Room")
		self.other_table = self.insert("Restaurant Table", area=other_area, table_name="_Test Emptied T9")

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def place_a_code(self, table, till=None):
		"""What the QR button does: the table gets a code and is seated (Occupied), with no order yet."""
		return guest_ordering.create_table_token(table, till or self.fx.profile)["name"]

	def draft(self, table, **changes):
		"""An order on the table, saved the way the till saves one (the table goes Occupied)."""
		payload = _sale(self.fx, restaurant_table=table, **changes)
		return invoices.update_invoice(json.dumps(payload))["name"]

	def serve(self, code, invoice):
		"""The code has served this invoice (the link a guest's first order leaves on it)."""
		frappe.db.set_value("Guest Order Token", code, "invoice", invoice)

	def cancelled(self, table, name="_Test cancelled invoice"):
		"""The invoice the cancel hook is given: it names its table and is cancelled (docstatus 2)."""
		return frappe._dict(name=name, restaurant_table=table, docstatus=2)

	def status_of(self, code):
		return frappe.db.get_value("Guest Order Token", code, "status")

	def table_status(self, table=None):
		return frappe.db.get_value("Restaurant Table", table or self.table, "status")

	def read_the_floor(self):
		return restaurant_api.get_tables(restaurant=self.restaurant)

	# --- reset_all_tables ---

	def test_resetting_the_floor_expires_the_codes_of_the_tables_it_empties(self):
		code = self.place_a_code(self.table)
		self.assertEqual(self.table_status(), "Occupied")

		restaurant_api.reset_all_tables(restaurant=self.restaurant)

		self.assertEqual(self.table_status(), "Empty")
		self.assertEqual(self.status_of(code), "Expired")

	def test_resetting_the_floor_expires_the_codes_of_an_empty_table_as_well(self):
		# A QR press seated the table, the floor read emptied it and spared the code that waits for its first
		# order: the reset wipes the floor, that code included
		code = self.place_a_code(self.table)
		frappe.db.set_value("Restaurant Table", self.table, "status", "Empty")

		restaurant_api.reset_all_tables(restaurant=self.restaurant)

		self.assertEqual(self.status_of(code), "Expired")

	def test_resetting_the_floor_expires_the_code_of_a_draft_it_clears(self):
		order = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, order)

		restaurant_api.reset_all_tables(restaurant=self.restaurant)

		self.assertEqual(self.status_of(code), "Expired")
		self.assertIsNone(frappe.db.get_value("Sales Invoice", order, "restaurant_table"))

	def test_resetting_the_floor_leaves_the_codes_of_the_tables_it_does_not_empty(self):
		paid = self.place_a_code(self.second_table)
		frappe.db.set_value("Restaurant Table", self.second_table, "status", "Paid")
		elsewhere = self.place_a_code(self.other_table, self.fx.other_profile)

		restaurant_api.reset_all_tables(restaurant=self.restaurant)

		self.assertEqual((self.table_status(self.second_table), self.status_of(paid)), ("Paid", "Active"))
		# The other restaurant's floor is not this one's
		self.assertEqual(
			(self.table_status(self.other_table), self.status_of(elsewhere)), ("Occupied", "Active")
		)

	# --- the cancel of an invoice (on_invoice_update) ---

	def test_the_hook_that_releases_a_table_runs_on_the_cancel_of_an_invoice(self):
		hooks = frappe.get_hooks("doc_events")["Sales Invoice"]["on_cancel"]
		self.assertIn("pos_next.api.restaurant.on_invoice_update", hooks)

	def test_cancelling_an_invoice_expires_the_code_that_served_it(self):
		order = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, order)
		frappe.db.set_value("Sales Invoice", order, "docstatus", 2)

		with patch.object(frappe, "log_error") as logged:
			restaurant_api.on_invoice_update(self.cancelled(self.table, order), "on_cancel")

		# Through the ordinary expiry of a code: the fallback that forces it, and logs, was not needed
		self.assertEqual(self.table_status(), "Empty")
		self.assertEqual(self.status_of(code), "Expired")
		logged.assert_not_called()

	def test_cancelling_an_old_invoice_spares_the_code_of_a_party_seated_with_no_draft_yet(self):
		# A QR press seated the table: its code waits for the first order. The cancel of an old invoice of the table is
		# not that party's: it must not kill the code they are about to scan
		code = self.place_a_code(self.table)

		restaurant_api.on_invoice_update(self.cancelled(self.table), "on_cancel")

		self.assertEqual(self.status_of(code), "Active")

	def test_cancelling_an_old_invoice_spares_a_code_whose_order_is_an_open_draft(self):
		# The party now at the table has an order open that the table does not hold any more (the draft lost its link)
		current = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, current)
		frappe.db.set_value("Sales Invoice", current, "restaurant_table", None)

		restaurant_api.on_invoice_update(self.cancelled(self.table), "on_cancel")

		self.assertEqual(self.status_of(code), "Active")

	def test_cancelling_an_old_invoice_leaves_the_code_of_a_table_with_another_open_order(self):
		# The party now at the table has an order open: the previous party's cancelled invoice is not theirs
		self.draft(self.table)
		code = self.place_a_code(self.table)

		restaurant_api.on_invoice_update(self.cancelled(self.table), "on_cancel")

		self.assertEqual(self.status_of(code), "Active")

	def test_cancelling_an_invoice_leaves_the_codes_of_the_other_tables(self):
		order = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, order)
		frappe.db.set_value("Sales Invoice", order, "docstatus", 2)
		other = self.place_a_code(self.second_table)

		restaurant_api.on_invoice_update(self.cancelled(self.table, order), "on_cancel")

		self.assertEqual((self.status_of(code), self.status_of(other)), ("Expired", "Active"))

	def test_a_deadlock_or_a_timeout_in_the_database_does_not_stop_at_the_cancel_hook(self):
		# InnoDB rolls the whole transaction back when it picks a request as the deadlock victim: the cancel must fail with
		# the error, not go on and commit what is left of it
		order = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, order)
		frappe.db.set_value("Sales Invoice", order, "docstatus", 2)

		for error in (frappe.QueryDeadlockError, frappe.QueryTimeoutError):
			with self.subTest(error=error.__name__):
				with (
					patch.object(GuestOrderToken, "expire", side_effect=error),
					patch.object(frappe, "log_error") as logged,
					self.assertRaises(error),
				):
					restaurant_api.on_invoice_update(self.cancelled(self.table, order), "on_cancel")
				logged.assert_not_called()
				# Nothing was forced through the database behind the error
				self.assertEqual(self.status_of(code), "Active")

	def test_cancelling_an_invoice_of_no_table_touches_no_code(self):
		code = self.place_a_code(self.table)

		restaurant_api.on_invoice_update(self.cancelled(None), "on_cancel")

		self.assertEqual(self.status_of(code), "Active")

	def test_saving_and_submitting_an_invoice_expire_no_code(self):
		code = self.place_a_code(self.table)

		draft = frappe._dict(restaurant_table=self.table, docstatus=0)
		restaurant_api.on_invoice_update(draft, "on_update")
		self.assertEqual((self.table_status(), self.status_of(code)), ("Occupied", "Active"))

		# The party has paid and the table is to be cleaned: its guests may still be on the receipt page
		submitted = frappe._dict(restaurant_table=self.table, docstatus=1)
		restaurant_api.on_invoice_update(submitted, "on_submit")
		self.assertEqual((self.table_status(), self.status_of(code)), ("Cleaning", "Active"))

	# --- the floor read that empties a table (get_tables) ---

	def test_the_floor_read_expires_the_code_of_a_table_whose_order_is_gone(self):
		order = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, order)
		# The order is cancelled: the table is Occupied and holds no open order
		frappe.db.set_value("Sales Invoice", order, "docstatus", 2)

		with patch.object(frappe, "log_error") as logged:
			floor = self.read_the_floor()

		self.assertEqual(next(t for t in floor["tables"] if t["name"] == self.table)["status"], "Empty")
		self.assertEqual(self.table_status(), "Empty")
		self.assertEqual(self.status_of(code), "Expired")
		logged.assert_not_called()

	def test_the_floor_read_spares_the_code_a_press_has_just_placed_and_the_next_press_shows_it(self):
		# The press seats the table with no order; the floor read, when the waiter goes back to the floor,
		# empties it
		code = self.place_a_code(self.table)
		self.assertEqual(self.table_status(), "Occupied")

		self.read_the_floor()

		self.assertEqual(self.table_status(), "Empty")
		self.assertEqual(self.status_of(code), "Active")
		again = guest_ordering.create_table_token(self.table, self.fx.profile)
		self.assertEqual(again["name"], code)
		self.assertEqual(self.table_status(), "Occupied")

	def test_the_floor_read_leaves_a_table_that_holds_an_open_order_and_its_code(self):
		self.draft(self.table)
		code = self.place_a_code(self.table)
		self.assertEqual(self.table_status(), "Occupied")

		self.read_the_floor()

		self.assertEqual((self.table_status(), self.status_of(code)), ("Occupied", "Active"))

	def test_the_floor_read_spares_a_code_that_serves_a_draft_the_table_lost(self):
		order = self.draft(self.table)
		code = self.place_a_code(self.table)
		self.serve(code, order)
		# The draft is open, but no longer linked to the table: the floor read empties the table all the same
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", None)

		self.read_the_floor()

		self.assertEqual((self.table_status(), self.status_of(code)), ("Empty", "Active"))

	def test_the_floor_read_expires_only_the_codes_of_the_tables_it_empties(self):
		gone = self.draft(self.table)
		emptied = self.place_a_code(self.table)
		self.serve(emptied, gone)
		frappe.db.set_value("Sales Invoice", gone, "docstatus", 2)
		busy = self.place_a_code(self.second_table)
		self.draft(self.second_table)

		self.read_the_floor()

		self.assertEqual((self.status_of(emptied), self.status_of(busy)), ("Expired", "Active"))

	# --- the helper ---

	def test_the_helper_takes_no_table_for_no_table(self):
		code = self.place_a_code(self.table)

		for tables in ([], [None], None):
			with self.subTest(tables=tables):
				restaurant_api.expire_codes_of_emptied_tables(tables)

		self.assertEqual(self.status_of(code), "Active")

	def test_the_helper_expires_every_active_code_of_a_table_and_only_the_active_ones(self):
		first = self.place_a_code(self.table)
		frappe.db.set_value("Guest Order Token", first, "status", "Closed")
		values = {"mode": "restaurant", "table": self.table, "pos_profile": self.fx.profile}
		second = self.insert("Guest Order Token", **values)
		third = self.insert("Guest Order Token", **values)

		restaurant_api.expire_codes_of_emptied_tables([self.table, self.table])

		self.assertEqual(
			(self.status_of(first), self.status_of(second), self.status_of(third)),
			("Closed", "Expired", "Expired"),
		)

	def test_the_helper_expires_through_the_database_a_code_the_orm_refuses_to_expire(self):
		# The cancel of an invoice must not fail because the ORM would not save an old code
		code = self.place_a_code(self.table)

		for error in (frappe.ValidationError("no way"), frappe.DoesNotExistError("gone")):
			with self.subTest(error=type(error).__name__):
				frappe.db.set_value("Guest Order Token", code, "status", "Active")
				with (
					patch.object(GuestOrderToken, "expire", side_effect=error),
					patch.object(frappe, "log_error") as logged,
				):
					restaurant_api.expire_codes_of_emptied_tables([self.table])

				self.assertEqual(self.status_of(code), "Expired")
				logged.assert_called_once()
				title, message = logged.call_args.args
				self.assertLessEqual(len(title), 140)
				self.assertIn(str(error), message)

	def test_the_helper_does_not_swallow_a_database_error(self):
		code = self.place_a_code(self.table)

		for error in (frappe.QueryDeadlockError, frappe.QueryTimeoutError):
			with self.subTest(error=error.__name__):
				with (
					patch.object(GuestOrderToken, "expire", side_effect=error),
					patch.object(frappe, "log_error") as logged,
					self.assertRaises(error),
				):
					restaurant_api.expire_codes_of_emptied_tables([self.table])
				logged.assert_not_called()
				self.assertEqual(self.status_of(code), "Active")
