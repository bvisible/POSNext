# //// Neoffice — added file (no upstream equivalent).
"""The drafts a till leaves on the server are listed to the cashier, never purged in silence (product owner, 08.11.2026).

« Actuellement on a une suppression de tickets brouillon de manière discrète […] on devrait afficher toujours les brouillons ouverts […] s'il y a un brouillon, il faut en faire
quelque chose. » The till used to call `cleanup_old_drafts` after every sale, which deleted the caller's drafts an hour old with no word to anyone. It does not any more: the closing of
a shift lists them (`get_loose_drafts`) and the cashier deletes the ones he does not want (`delete_loose_draft`), by his own hand.

The suite pins what they are: the caller's own POS drafts saved at a till shift, of any age, and none that was kept on purpose (a restaurant table's order, a takeaway order, a printed
draft the closing submits), nor a colleague's, nor one made outside a till shift; that only one of them can be deleted, and by its owner; and that a stranger without a till is refused.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from pos_next.api import invoices, shifts
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

COLLEAGUE = "loose-colleague@yopmail.com"
AREA = "_PNXT loose area"
TABLE = "_PNXT loose table"


class TestTheDraftsATillLeaves(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		# update_invoice commits (restaurant fields): a no-op here keeps the test inside the transaction tearDown rolls back
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		_user(COLLEAGUE, [CASHIER_ROLE], "System User")
		self.fx = _till_fixture()
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": COLLEAGUE})
		profile.save(ignore_permissions=True)
		self.shifts = {user: self._open_shift(user) for user in (TILL, COLLEAGUE)}
		area = frappe.get_doc({"doctype": "Restaurant Area", "area_name": AREA}).insert(
			ignore_permissions=True
		)
		self.table = (
			frappe.get_doc({"doctype": "Restaurant Table", "table_name": TABLE, "area": area.name})
			.insert(ignore_permissions=True)
			.name
		)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		frappe.flags.ignore_account_permission = self.account_flag

	def _open_shift(self, user):
		frappe.set_user(user)
		opened = shifts.create_opening_shift(
			self.fx.profile,
			self.fx.company,
			json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
		)
		frappe.set_user("Administrator")
		return opened["pos_opening_shift"]["name"]

	def _draft(self, user=TILL, hours_old=0, at_shift=True, **changes):
		"""A draft saved the way the till saves one (update_invoice, in the cashier's session, at his open shift), last saved `hours_old` hours ago."""
		if at_shift:
			changes["posa_pos_opening_shift"] = self.shifts[user]
		frappe.set_user(user)
		name = invoices.update_invoice(json.dumps(_sale(self.fx, **changes)))["name"]
		frappe.set_user("Administrator")
		if hours_old:
			frappe.db.set_value(
				"Sales Invoice",
				name,
				"modified",
				add_to_date(now_datetime(), hours=-hours_old),
				update_modified=False,
			)
		return name

	def _listed(self, user=TILL, profile=None):
		frappe.set_user(user)
		try:
			return [row.name for row in invoices.get_loose_drafts(profile)["drafts"]]
		finally:
			frappe.set_user("Administrator")

	def _delete(self, invoice, user=TILL, profile=None):
		frappe.set_user(user)
		try:
			return invoices.delete_loose_draft(invoice, profile)
		finally:
			frappe.set_user("Administrator")


class TestWhatIsListed(TestTheDraftsATillLeaves):
	def test_the_callers_own_drafts_are_listed_whatever_their_age(self):
		old = self._draft(hours_old=5)
		recent = self._draft()

		listed = self._listed()

		self.assertEqual(set(listed), {old, recent})
		self.assertEqual(listed, [recent, old], "the newest first")

	def test_a_draft_says_what_the_cashier_needs_to_decide(self):
		draft = self._draft()

		frappe.set_user(TILL)
		row = next(r for r in invoices.get_loose_drafts()["drafts"] if r.name == draft)
		frappe.set_user("Administrator")

		self.assertEqual(row.lines, 1)
		self.assertGreater(row.grand_total, 0)
		self.assertTrue(row.modified)
		self.assertEqual(row.pos_profile, self.fx.profile)

	def test_what_was_kept_on_purpose_is_not_a_loose_draft(self):
		table_order = self._draft(restaurant_table=self.table)
		takeaway = self._draft(is_takeaway=1, takeaway_number="T-902")
		printed = self._draft()
		frappe.db.set_value("Sales Invoice", printed, "posa_is_printed", 1, update_modified=False)

		listed = self._listed()

		for kept in (table_order, takeaway, printed):
			self.assertNotIn(kept, listed)

	def test_a_colleagues_draft_and_one_made_outside_a_shift_are_not_listed(self):
		colleague = self._draft(user=COLLEAGUE)
		outside = self._draft(at_shift=False)

		listed = self._listed()

		self.assertNotIn(colleague, listed)
		self.assertNotIn(outside, listed)
		self.assertIn(colleague, self._listed(user=COLLEAGUE))

	def test_a_submitted_invoice_is_not_a_draft(self):
		draft = self._draft()
		frappe.db.set_value("Sales Invoice", draft, "docstatus", 1, update_modified=False)

		self.assertNotIn(draft, self._listed())

	def test_the_drafts_of_another_till_are_not_the_ones_named(self):
		draft = self._draft()

		self.assertIn(draft, self._listed(profile=self.fx.profile))
		self.assertNotIn(draft, self._listed(profile=self.fx.other_profile))


class TestDeletingByHand(TestTheDraftsATillLeaves):
	def test_the_owner_deletes_one_of_his_loose_drafts_and_the_others_stay(self):
		unwanted = self._draft()
		kept = self._draft()

		answer = self._delete(unwanted)

		self.assertEqual(answer, {"deleted": unwanted})
		self.assertFalse(frappe.db.exists("Sales Invoice", unwanted))
		self.assertTrue(frappe.db.exists("Sales Invoice", kept))

	def test_a_draft_that_was_kept_on_purpose_is_refused(self):
		table_order = self._draft(restaurant_table=self.table)

		with self.assertRaises(frappe.ValidationError):
			self._delete(table_order)

		self.assertTrue(frappe.db.exists("Sales Invoice", table_order))

	def test_a_colleagues_draft_is_refused(self):
		colleague = self._draft(user=COLLEAGUE)

		with self.assertRaises(frappe.ValidationError):
			self._delete(colleague)

		self.assertTrue(frappe.db.exists("Sales Invoice", colleague))

	def test_a_submitted_invoice_is_refused(self):
		draft = self._draft()
		frappe.db.set_value("Sales Invoice", draft, "docstatus", 1, update_modified=False)

		with self.assertRaises(frappe.ValidationError):
			self._delete(draft)

		self.assertTrue(frappe.db.exists("Sales Invoice", draft))

	def test_what_is_not_a_name_is_refused(self):
		for invoice in (None, "", "no such invoice", ["x"], {"docstatus": 0}):
			with self.subTest(invoice=invoice), self.assertRaises((frappe.ValidationError, TypeError)):
				self._delete(invoice)


class TestAStranger(TestTheDraftsATillLeaves):
	def test_a_user_without_a_till_may_neither_list_nor_delete(self):
		draft = self._draft()

		frappe.set_user(OTHER_TILL)
		try:
			with self.assertRaises(frappe.PermissionError):
				invoices.get_loose_drafts(self.fx.profile)
			with self.assertRaises(frappe.PermissionError):
				invoices.delete_loose_draft(draft, self.fx.profile)
		finally:
			frappe.set_user("Administrator")

		self.assertTrue(frappe.db.exists("Sales Invoice", draft))
