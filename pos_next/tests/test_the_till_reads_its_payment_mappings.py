# //// Neoffice — added file (no upstream equivalent).
"""The till reads its payment mappings with the till's own rights (maintenance#2244).

The payment dialog read them with frappe.client.get_list, then the mode of their providers, which a cashier may not
read: four 403 at each opening of the till, and a provider in test mode never showed her its simulator panel. Its
cashier now reads the till's enabled mappings, each with its provider's mode, without reading Payment Provider herself.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import payments
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user


class TestTheTillReadsItsPaymentMappings(FrappeTestCase):
	def setUp(self):
		from payments.tests.test_intent_api import _ensure_mock_setup

		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		_ensure_mock_setup()
		mapping = frappe.get_doc(
			{
				"doctype": "POS Payment Driver Mapping",
				"pos_profile": self.fx.profile,
				"mode_of_payment": self.fx.mode,
				"provider": "mock",
				"channel": "terminal",
				"enabled": 1,
			}
		)
		mapping.flags.ignore_links = True
		mapping.flags.ignore_validate = True
		self.mapping = mapping.insert(ignore_permissions=True).name

	def test_a_cashier_reads_the_tills_mappings_with_the_mode_of_their_provider(self):
		frappe.set_user(TILL)

		rows = payments.pos_get_mappings(self.fx.profile)

		self.assertEqual(
			[(row["mode_of_payment"], row["provider"], row["channel"], row["provider_mode"]) for row in rows],
			[(self.fx.mode, "mock", "terminal", "test")],
		)
		# She reads no Payment Provider herself: the till's call is what answers her
		self.assertFalse(frappe.has_permission("Payment Provider", "read"))

	def test_a_disabled_mapping_is_not_read(self):
		frappe.db.set_value("POS Payment Driver Mapping", self.mapping, "enabled", 0)
		frappe.set_user(TILL)

		self.assertEqual(payments.pos_get_mappings(self.fx.profile), [])

	def test_another_tills_cashier_reads_none_of_them(self):
		frappe.set_user(TILL)

		self.assertEqual(payments.pos_get_mappings(self.fx.other_profile), [])
