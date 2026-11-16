# //// Neoffice — added file (no upstream equivalent).
"""A till's draft that nobody will finish is deleted after the days its till sets (maintenance#1980).

The daily job (pos_next.tasks.purge_abandoned_drafts) deletes a POS draft once it has been left `abandoned_draft_days`
days (30 by default) after the shift it was saved at was closed, or by a cashier whose account is disabled. A younger
draft stays, a draft of a shift still open stays, and a draft kept on purpose stays whatever its age: a table's order, a
takeaway order, a printed draft, a draft a payment provider took money for. The drafts are saved by the cashier at the
till (update_invoice) and the shift is closed by the cashier's own closing; the job runs as the scheduler runs it. The
suite makes the commits no-ops and rolls back.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from pos_next.api import invoices, shifts
from pos_next.tasks import purge_abandoned_drafts as purge
from pos_next.tests.test_till_closing_needs_the_till import _closing
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

AREA = "_PNXT purge area"
TABLE = "_PNXT purge table"


class TestAnAbandonedTillDraftGoesAfterItsDays(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		# update_invoice and the job commit: no-ops here, so that the test stays in the transaction rolled back
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.shift = self._open_shift()
		area = frappe.get_doc({"doctype": "Restaurant Area", "area_name": AREA}).insert(
			ignore_permissions=True
		)
		self.table = (
			frappe.get_doc({"doctype": "Restaurant Table", "table_name": TABLE, "area": area.name})
			.insert(ignore_permissions=True)
			.name
		)

	def _open_shift(self):
		frappe.set_user(TILL)
		opened = shifts.create_opening_shift(
			self.fx.profile,
			self.fx.company,
			json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
		)
		frappe.set_user("Administrator")
		return opened["pos_opening_shift"]["name"]

	def _draft(self, **changes):
		"""A draft the cashier saves at the till, at the open shift."""
		changes["posa_pos_opening_shift"] = self.shift
		frappe.set_user(TILL)
		name = invoices.update_invoice(json.dumps(_sale(self.fx, **changes)))["name"]
		frappe.set_user("Administrator")
		return name

	def _left_for(self, name, days):
		"""Nobody touched the draft for `days` days, on the site's clock."""
		frappe.db.set_value(
			"Sales Invoice", name, "modified", add_to_date(now_datetime(), days=-days), update_modified=False
		)

	def _close_the_shift(self):
		"""The cashier closes the shift, the drafts of the shift left as they are (the profile deletes none)."""
		closing = _closing(TILL, self.shift, self.fx)
		frappe.set_user(TILL)
		shifts.submit_closing_shift(json.dumps(closing))
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("POS Opening Shift", self.shift, "status"), "Closed")

	def _the_day_passes(self):
		purge.purge_abandoned_drafts()

	def _assert_kept(self, name):
		self.assertTrue(frappe.db.exists("Sales Invoice", name), f"{name} was deleted")

	def _assert_gone(self, name):
		self.assertFalse(frappe.db.exists("Sales Invoice", name), f"{name} was kept")
		self.assertTrue(
			frappe.db.exists("Deleted Document", {"deleted_doctype": "Sales Invoice", "deleted_name": name})
		)

	def test_a_draft_left_31_days_after_its_shift_was_closed_goes(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		draft = self._draft()
		self._close_the_shift()
		self._left_for(draft, 31)

		self._the_day_passes()

		self._assert_gone(draft)

	def test_a_draft_left_29_days_stays(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		draft = self._draft()
		self._close_the_shift()
		self._left_for(draft, 29)

		self._the_day_passes()

		self._assert_kept(draft)

	def test_a_draft_of_a_shift_still_open_stays_whatever_its_age(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		draft = self._draft()
		self._left_for(draft, 90)

		self._the_day_passes()

		self._assert_kept(draft)

	def test_a_draft_of_a_cashier_whose_account_is_disabled_goes(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		draft = self._draft()
		self._left_for(draft, 31)
		frappe.db.set_value("User", TILL, "enabled", 0)

		self._the_day_passes()

		self._assert_gone(draft)

	def test_the_days_are_the_tills_setting(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		if not frappe.db.has_column("POS Settings", purge.FIELD):
			self.skipTest("The site is not migrated: POS Settings has no abandoned_draft_days")
		for name in frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		settings = frappe.get_doc(
			{"doctype": "POS Settings", "pos_profile": self.fx.profile, "enabled": 1, purge.FIELD: 10}
		)
		settings.flags.ignore_links = True
		settings.insert(ignore_permissions=True)
		older, younger = self._draft(), self._draft()
		self._close_the_shift()
		self._left_for(older, 11)
		self._left_for(younger, 9)

		self._the_day_passes()

		self._assert_gone(older)
		self._assert_kept(younger)

	def test_a_till_that_sets_no_days_keeps_its_drafts_30_days(self):
		frappe.db.delete("POS Settings", {"pos_profile": self.fx.profile})

		self.assertEqual(purge.lifetime_days(self.fx.profile), 30)

	def test_a_table_order_a_takeaway_order_and_a_printed_draft_stay_whatever_their_age(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		table_order = self._draft(restaurant_table=self.table)
		takeaway_order = self._draft(is_takeaway=1, takeaway_number="T-981")
		printed = self._draft()
		frappe.db.set_value("Sales Invoice", printed, "posa_is_printed", 1, update_modified=False)
		self._close_the_shift()
		for name in (table_order, takeaway_order, printed):
			self._left_for(name, 90)

		self._the_day_passes()

		for name in (table_order, takeaway_order, printed):
			self._assert_kept(name)

	def test_a_draft_a_payment_provider_took_money_for_stays(
		self,
	):  # role-check: ok a daily job of the scheduler, which runs as Administrator
		if not frappe.db.table_exists("Payment Intent"):
			self.skipTest("The payments app is not installed")
		draft = self._draft()
		frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": "succeeded",
				"amount": 1000,
				"currency": self.fx.currency,
				"reference_doctype": "Sales Invoice",
				"reference_name": draft,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
		self._close_the_shift()
		self._left_for(draft, 90)

		self._the_day_passes()

		self._assert_kept(draft)
