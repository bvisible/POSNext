# //// Neoffice — added file (no upstream equivalent).
"""A company's default wallet account is read from the POS Settings of its tills."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.pos_next.doctype.wallet.wallet import get_default_wallet_account
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user


class TestWalletAccountLookup(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()

	def tearDown(self):
		frappe.db.rollback()

	def test_the_wallet_account_comes_from_the_settings_of_the_company_s_till(self):
		account = frappe.db.get_value(
			"Account", {"company": self.fx.company, "account_type": "Receivable", "is_group": 0}, "name"
		)
		settings = frappe.db.get_value("POS Settings", {"pos_profile": self.fx.profile}) or (
			frappe.get_doc({"doctype": "POS Settings", "pos_profile": self.fx.profile})
			.insert(ignore_permissions=True)
			.name
		)
		frappe.db.set_value("POS Settings", settings, "wallet_account", account)

		self.assertEqual(get_default_wallet_account(self.fx.company), account)

	def test_a_company_without_a_till_gets_no_account_and_no_error(self):
		# Upstream read POS Settings by a company column it does not have: every call raised.
		self.assertIsNone(get_default_wallet_account("_PNXT company without a till"))
