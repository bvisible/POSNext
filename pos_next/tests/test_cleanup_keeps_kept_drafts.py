# //// Neoffice — added file (no upstream equivalent).
"""The till's draft cleanup takes what the till made and left, never a draft kept on purpose.

After every sale the till calls cleanup_old_drafts(pos_profile, max_age_hours=1). It removes the caller's
own drafts, saved at their till shift and left for that long; a restaurant table's order, a takeaway
order, a printed draft the shift's closing submits, a colleague's draft and a draft made outside a till
shift all stay.
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

COLLEAGUE = "cleanup-colleague@yopmail.com"
AREA = "_PNXT cleanup area"
TABLE = "_PNXT cleanup table"


class TestCleanupKeepsKeptDrafts(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		# update_invoice commits (restaurant fields): a no-op here keeps the test inside the
		# transaction tearDown rolls back. Stopped by addCleanup, which runs even when setUp fails.
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		_user(COLLEAGUE, [CASHIER_ROLE], "System User")
		self.fx = _till_fixture()
		# A second cashier works at the same till.
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": COLLEAGUE})
		profile.save(ignore_permissions=True)
		self.shifts = {user: self._open_shift(user) for user in (TILL, COLLEAGUE)}
		if not frappe.db.exists("Restaurant Area", AREA):
			frappe.get_doc({"doctype": "Restaurant Area", "area_name": AREA}).insert(ignore_permissions=True)
		if not frappe.db.exists("Restaurant Table", TABLE):
			frappe.get_doc({"doctype": "Restaurant Table", "table_name": TABLE, "area": AREA}).insert(
				ignore_permissions=True
			)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		# update_invoice sets it for the rest of the request and never resets it.
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

	def _draft(self, user=TILL, hours_old=3, at_shift=True, **changes):
		"""A draft saved the way the till saves one (update_invoice, in the cashier's session, at the
		cashier's open shift), last modified ``hours_old`` hours ago on the site's clock."""
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

	def _sale_ends(self):
		"""What the till sends once a sale is done and its cart cleared."""
		frappe.set_user(TILL)
		invoices.cleanup_old_drafts(self.fx.profile, max_age_hours=1)
		frappe.set_user("Administrator")

	def _assert_kept(self, name):
		self.assertTrue(frappe.db.exists("Sales Invoice", name), f"{name} was deleted")

	def test_an_old_abandoned_draft_goes(self):
		draft = self._draft()
		self._sale_ends()
		self.assertFalse(frappe.db.exists("Sales Invoice", draft))

	def test_a_recent_abandoned_draft_stays(self):
		draft = self._draft(hours_old=0)
		self._sale_ends()
		self._assert_kept(draft)

	def test_an_old_table_order_stays(self):
		# Between the main course and dessert nobody touches the table's order for an hour.
		draft = self._draft(restaurant_table=TABLE)
		self.assertEqual(frappe.db.get_value("Sales Invoice", draft, "restaurant_table"), TABLE)
		self._sale_ends()
		self._assert_kept(draft)

	def test_an_old_takeaway_order_stays(self):
		draft = self._draft(is_takeaway=1, takeaway_number="T-901")
		self._sale_ends()
		self._assert_kept(draft)

	def test_an_old_printed_draft_stays(self):
		# The shift's closing submits it (pos_closing_shift.submit_printed_invoices).
		draft = self._draft()
		frappe.db.set_value("Sales Invoice", draft, "posa_is_printed", 1, update_modified=False)
		self._sale_ends()
		self._assert_kept(draft)

	def test_a_colleagues_old_draft_stays(self):
		draft = self._draft(user=COLLEAGUE)
		self._sale_ends()
		self._assert_kept(draft)

	def test_an_old_draft_made_outside_a_till_shift_stays(self):
		# The till always saves at its open shift; a POS draft without one was made elsewhere (the desk).
		draft = self._draft(at_shift=False)
		self._sale_ends()
		self._assert_kept(draft)
