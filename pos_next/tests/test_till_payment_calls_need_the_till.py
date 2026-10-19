# //// Neoffice — added file (no upstream equivalent).
"""The till's payment calls answer only whoever may work at the till (maintenance#1732).

They reach payments.api.intent in Python, where no permission is asked: before this, any signed-in account, a shop
customer included, could refund a settled intent by naming it to pos_refund_payment.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import payments

PORTAL = "tillpay-portal@yopmail.com"
DESK = "tillpay-desk@yopmail.com"
PROFILE = "Any POS Profile"
MISSING = "PI-DOES-NOT-EXIST-1732"


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


def _intent(metadata=None):
	from payments.tests.test_intent_api import _ensure_mock_setup

	_ensure_mock_setup()
	return (
		frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"provider": "mock",
				"channel": "terminal",
				"amount": 500,
				"currency": "CHF",
				"status": "requires_action",
				"metadata_json": json.dumps(metadata) if metadata else None,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _calls(name):
	return [
		("pos_get_mapping", lambda: payments.pos_get_mapping(PROFILE, "Cash")),
		(
			"pos_start_payment",
			lambda: payments.pos_start_payment(None, None, PROFILE, "Cash", 100, "CHF"),
		),
		("pos_get_active_devices", lambda: payments.pos_get_active_devices(PROFILE)),
		("pos_attach_device", lambda: payments.pos_attach_device(name, "any-reader")),
		("pos_get_intent_status", lambda: payments.pos_get_intent_status(name)),
		("pos_cancel_payment", lambda: payments.pos_cancel_payment(name)),
		("pos_refund_payment", lambda: payments.pos_refund_payment(name)),
		("pos_simulate_terminal_outcome", lambda: payments.pos_simulate_terminal_outcome(name)),
	]


class TestTillPaymentCallsNeedTheTill(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")
		self.till_intent = _intent({"pos_profile": PROFILE})
		self.shop_intent = _intent()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def test_a_portal_account_is_refused_everywhere(self):
		frappe.set_user(PORTAL)
		for name in (self.till_intent, MISSING):
			for label, call in _calls(name):
				with self.subTest(call=label, name=name):
					with self.assertRaises(frappe.PermissionError):
						call()

	def test_a_desk_account_with_no_till_right_is_refused(self):
		# Neither assigned to the profile nor reading sales invoices, nor reading Payment Intents.
		frappe.set_user(DESK)
		for name in (self.till_intent, self.shop_intent):
			for label, call in _calls(name):
				with self.subTest(call=label, name=name):
					with self.assertRaises(frappe.PermissionError):
						call()

	def test_the_administrator_passes_the_guards(self):
		payments._require_till_intent(self.till_intent, "write")
		payments._require_till_intent(self.shop_intent, "write")
		payments._require_till(PROFILE)
