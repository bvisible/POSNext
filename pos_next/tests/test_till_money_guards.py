# //// Neoffice — added file (no upstream equivalent).
"""The till's money endpoints answer only whoever may work at the till."""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import cash_entry, credit_sales, gift_cards

PORTAL = "tillguard-portal@yopmail.com"
DESK = "tillguard-desk@yopmail.com"


def _user(email, roles, user_type):
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, ignore_permissions=True, force=True)
	doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"roles": [{"role": r} for r in roles if frappe.db.exists("Role", r)],
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "user_type", user_type)
	return email


class TestTillMoneyGuards(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def test_a_portal_account_never_reaches_the_till(self):
		frappe.set_user(PORTAL)
		with self.assertRaises(frappe.PermissionError):
			cash_entry.require_till_access("Any POS Profile")

	def test_a_desk_account_with_no_till_right_is_refused(self):
		# Neither assigned to the profile nor reading sales invoices.
		frappe.set_user(DESK)
		with self.assertRaises(frappe.PermissionError):
			cash_entry.require_till_access("Any POS Profile")

	def test_a_missing_profile_is_refused(self):
		with self.assertRaises(frappe.PermissionError):
			cash_entry.require_till_access(None)

	def test_the_administrator_passes(self):
		cash_entry.require_till_access("Any POS Profile")

	def test_a_manual_gift_card_needs_the_right_to_create_a_coupon(self):
		frappe.set_user(PORTAL)
		with self.assertRaises(frappe.PermissionError):
			gift_cards.create_gift_card_manual(100000, "Any Company")
		frappe.set_user(DESK)
		with self.assertRaises(frappe.PermissionError):
			gift_cards.create_gift_card_manual(100000, "Any Company")

	def test_cancelling_credit_entries_needs_the_right_to_cancel_the_invoice(self):
		frappe.set_user(PORTAL)
		with self.assertRaises((frappe.PermissionError, frappe.DoesNotExistError)):
			credit_sales.cancel_credit_journal_entries("ACC-SINV-DOES-NOT-EXIST")
