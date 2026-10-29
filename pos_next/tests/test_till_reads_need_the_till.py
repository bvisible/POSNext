# //// Neoffice — added file (no upstream equivalent).
"""The till's read endpoints answer only whoever may work at the till.

The POS Profile reads (settings, payment methods, taxes, default customer, warehouses, the caller's
tills), the authorization gate's reads (policy, approvers, PIN status) and the offline expense check are
the till's: its users are served, a portal account is refused.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import authorization, expenses, pos_profile
from pos_next.authorization import pin as pin_store
from pos_next.authorization.tests.helpers import (
	DUMMY_ACTION,
	GOOD_PIN,
	MANAGER,
	ROLE,
	make_role,
	make_rule,
	make_user,
)

PORTAL = "tillread-portal@yopmail.com"
DESK = "tillread-desk@yopmail.com"
TILL = "tillread-till@yopmail.com"
ANY_PROFILE = "Any POS Profile"
OFFLINE_ID = "tillread-offline-id-never-synced"


def _user(email, roles, user_type):
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, ignore_permissions=True, force=True)
	frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"roles": [{"role": r} for r in roles if frappe.db.exists("Role", r)],
		}
	).insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "user_type", user_type)
	frappe.clear_cache(user=email)


def _calls_at(profile):
	"""Every gated read, naming ``profile``."""
	return [
		("get_pos_settings", lambda: pos_profile.get_pos_settings(profile)),
		("get_payment_methods", lambda: pos_profile.get_payment_methods(profile)),
		("get_taxes", lambda: pos_profile.get_taxes(profile)),
		("get_default_customer", lambda: pos_profile.get_default_customer(profile)),
		("get_warehouses", lambda: pos_profile.get_warehouses(profile)),
		("get_authorization_policy", lambda: authorization.get_authorization_policy(profile)),
		("get_authorizers", lambda: authorization.get_authorizers(DUMMY_ACTION, profile)),
		(
			"get_authorizers, profile in the context",
			lambda: authorization.get_authorizers(
				DUMMY_ACTION, context=frappe.as_json({"pos_profile": profile})
			),
		),
	]


def _calls_naming_no_till():
	"""Every gated read that names no POS Profile, or is given a blank one."""
	return [
		("get_pos_profiles", pos_profile.get_pos_profiles),
		("get_pos_settings, blank", lambda: pos_profile.get_pos_settings(None)),
		("get_payment_methods, blank", lambda: pos_profile.get_payment_methods(None)),
		("get_taxes, blank", lambda: pos_profile.get_taxes(None)),
		("get_default_customer, blank", lambda: pos_profile.get_default_customer(None)),
		("get_warehouses, blank", lambda: pos_profile.get_warehouses(None)),
		("get_authorization_policy, no profile", authorization.get_authorization_policy),
		("get_authorizers, no profile", lambda: authorization.get_authorizers(DUMMY_ACTION)),
		("has_authorization_pin", authorization.has_authorization_pin),
		("check_offline_expense_synced", lambda: expenses.check_offline_expense_synced(OFFLINE_ID)),
	]


class TestTillReadsNeedTheTill(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")
		_user(TILL, ["Blogger"], "System User")
		# A rule with an approver who has a PIN: get_authorizers then has names to give away.
		make_role(ROLE)
		make_user(MANAGER, [ROLE])
		pin_store.set_pin(MANAGER, GOOD_PIN)
		make_rule(DUMMY_ACTION, [{"approver_type": "Role", "role": ROLE}])
		self.profile = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")
		if self.profile:
			# Assigned to the till the way a cashier is: a row of the POS Profile's user table.
			frappe.get_doc(
				{
					"doctype": "POS Profile User",
					"parent": self.profile,
					"parenttype": "POS Profile",
					"parentfield": "applicable_for_users",
					"user": TILL,
				}
			).db_insert()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def _assert_refused(self, calls):
		for label, call in calls:
			with self.subTest(call=label):
				with self.assertRaises(frappe.PermissionError):
					call()

	def test_a_portal_account_is_refused_everywhere(self):
		frappe.set_user(PORTAL)
		self._assert_refused(_calls_at(ANY_PROFILE) + _calls_naming_no_till())

	def test_a_visitor_is_refused_everywhere(self):
		frappe.set_user("Guest")
		self._assert_refused(_calls_at(ANY_PROFILE) + _calls_naming_no_till())

	def test_a_desk_account_with_no_till_right_is_refused_at_a_named_till(self):
		# Neither assigned to the profile nor reading sales invoices.
		frappe.set_user(DESK)
		self._assert_refused(_calls_at(ANY_PROFILE))

	def test_the_desk_user_form_still_reads_the_pin_status(self):
		# public/js/user.js asks it from the desk's User form, opened by accounts that need not
		# work at a till.
		frappe.set_user(DESK)
		self.assertIn("has_pin", authorization.has_authorization_pin())

	def test_the_till_reads_its_own_till(self):
		if not self.profile:
			self.skipTest("No enabled POS Profile on this site")
		expected = {
			"settings": pos_profile.get_pos_settings(self.profile),
			"payment_methods": pos_profile.get_payment_methods(self.profile),
			"taxes": pos_profile.get_taxes(self.profile),
			"default_customer": pos_profile.get_default_customer(self.profile),
		}

		frappe.set_user(TILL)
		self.assertEqual(pos_profile.get_pos_settings(self.profile), expected["settings"])
		self.assertEqual(pos_profile.get_payment_methods(self.profile), expected["payment_methods"])
		self.assertEqual(pos_profile.get_taxes(self.profile), expected["taxes"])
		self.assertEqual(pos_profile.get_default_customer(self.profile), expected["default_customer"])
		# Upstream reads warehouses with the account's own Warehouse permission: not compared.
		self.assertIsInstance(pos_profile.get_warehouses(self.profile), list)
		self.assertIn(self.profile, [row.name for row in pos_profile.get_pos_profiles()])
		self.assertTrue(authorization.get_authorization_policy(self.profile).get(DUMMY_ACTION))
		approvers = authorization.get_authorizers(DUMMY_ACTION, self.profile)
		self.assertIn(MANAGER, [row.user for row in approvers])
		self.assertIn("has_pin", authorization.has_authorization_pin())
		self.assertFalse(expenses.check_offline_expense_synced(OFFLINE_ID)["synced"])
