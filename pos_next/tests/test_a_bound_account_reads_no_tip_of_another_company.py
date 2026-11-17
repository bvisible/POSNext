# //// Neoffice — added file (no upstream equivalent).
"""An account bound to some companies reads no tip and no offline sync of a till of another company (neoffice-maintenance#2838).

A Restaurant Tip and an Offline Invoice Sync name no company, only their till (and a tip its restaurant): a User Permission on
« Company » never reached them, so an account bound to one company read the tips of the other companies' staff (the list, the
form, « Tips by Server ») and their offline syncs. A tip or a sync of a till of a company outside the bound is now left out; one
with no till is everybody's, and nothing changes for an account without a bound.

The reader is bound by a User Permission row to a company that need not exist, so that the fixture's till is « of another
company » for him. The tips and the syncs are scenery, written as rows; every read is the reader's.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime, nowdate

from pos_next.pos_next.report.offline_sync_and_system_health_report import (
	offline_sync_and_system_health_report as offline_sync,
)
from pos_next.pos_next.report.tips_by_server import tips_by_server
from pos_next.tests.test_a_cashier_bound_to_a_company_keeps_to_it import OTHER_COMPANY, _bind
from pos_next.tests.test_till_writes_need_the_till import OTHER_TILL, PROFILE, TILL, _till_fixture, _user

# A till manager sees every tip of his companies; a cashier reads the offline syncs
READER_ROLES = ["POSNext Manager", "POSNext Cashier"]
OF_THE_TILL = "_PNXT2838 of the till"
OF_NO_TILL = "_PNXT2838 of no till"


class TestABoundAccountReadsNoTipOfAnotherCompany(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# The fixture commits: a no-op here keeps the test inside the transaction tearDown rolls back
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, READER_ROLES, "System User")
		# The fixture's other till is assigned to another user
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.tip_of_the_till = self.a_tip(OF_THE_TILL, pos_profile=PROFILE)
		self.tip_of_no_till = self.a_tip(OF_NO_TILL)
		self.sync_of_the_till = self.a_sync(OF_THE_TILL, pos_profile=PROFILE)
		self.sync_of_no_till = self.a_sync(OF_NO_TILL)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		frappe.cache.hdel("user_permissions", TILL)

	def a_tip(self, payment_method, **fields):
		tip = frappe.get_doc(
			{
				"doctype": "Restaurant Tip",
				"name": frappe.generate_hash(length=12),
				"tip_date": nowdate(),
				"amount": 5,
				"status": "Collected",
				"payment_method": payment_method,
				**fields,
			}
		)
		tip.db_insert()
		return tip.name

	def a_sync(self, offline_id, **fields):
		sync = frappe.get_doc(
			{
				"doctype": "Offline Invoice Sync",
				"name": frappe.generate_hash(length=12),
				"offline_id": offline_id,
				"status": "Synced",
				"synced_at": now_datetime(),
				**fields,
			}
		)
		sync.db_insert()
		return sync.name

	def read_as_the_reader(self):
		"""What the reader reads of the two tips and the two syncs: listed, opened, in « Tips by Server », in the sync report."""
		frappe.set_user(TILL)
		try:
			listed = set(frappe.get_list("Restaurant Tip", pluck="name", limit_page_length=0))
			return {
				"listed": {name for name in (self.tip_of_the_till, self.tip_of_no_till) if name in listed},
				"opened": {
					name
					for name in (self.tip_of_the_till, self.tip_of_no_till)
					if frappe.has_permission(
						"Restaurant Tip", "read", doc=frappe.get_doc("Restaurant Tip", name)
					)
				},
				"by_server": {row["payment_method"] for row in tips_by_server.execute({})[1]}
				& {OF_THE_TILL, OF_NO_TILL},
				"synced": {row.offline_id for row in offline_sync.execute(frappe._dict())[1]}
				& {OF_THE_TILL, OF_NO_TILL},
			}
		finally:
			frappe.set_user("Administrator")

	def test_a_tip_and_a_sync_of_a_till_of_another_company_are_not_read(self):
		_bind(TILL, OTHER_COMPANY)
		read = self.read_as_the_reader()
		self.assertEqual(read["listed"], {self.tip_of_no_till})
		self.assertEqual(read["opened"], {self.tip_of_no_till})
		self.assertEqual(read["by_server"], {OF_NO_TILL})
		self.assertEqual(read["synced"], {OF_NO_TILL})

	def test_the_tips_and_syncs_of_the_bound_company_are_still_read(self):
		_bind(TILL, self.fx.company)
		read = self.read_as_the_reader()
		self.assertEqual(read["listed"], {self.tip_of_the_till, self.tip_of_no_till})
		self.assertEqual(read["opened"], {self.tip_of_the_till, self.tip_of_no_till})
		self.assertEqual(read["by_server"], {OF_THE_TILL, OF_NO_TILL})
		self.assertEqual(read["synced"], {OF_THE_TILL, OF_NO_TILL})

	def test_nothing_changes_for_an_account_without_a_bound(self):
		read = self.read_as_the_reader()
		self.assertEqual(read["listed"], {self.tip_of_the_till, self.tip_of_no_till})
		self.assertEqual(read["opened"], {self.tip_of_the_till, self.tip_of_no_till})
		self.assertEqual(read["by_server"], {OF_THE_TILL, OF_NO_TILL})
		self.assertEqual(read["synced"], {OF_THE_TILL, OF_NO_TILL})
