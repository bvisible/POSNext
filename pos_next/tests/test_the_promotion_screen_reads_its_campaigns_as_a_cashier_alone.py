# //// Neoffice — added file (no upstream equivalent).
"""The coupon form of the till lists its campaigns through the till's own call (neoffice-maintenance#3186).

The screen used to read the doctype Campaign itself (`frappe.client.get_list`, filtered on a field `disabled` that Campaign does not have): 417 for every
account, and for a cashier who holds no right on Campaign a refusal at best. The campaigns are a catalogue of the promotion screen, like the item groups
and the brands beside them: read by the till after the module's own rule, by name, and no right is given to the role. This suite plays the cashier as she
is, with the role of the persona `cashier` and nothing else.
"""

import frappe
from frappe.tests.roles import as_role, without_right
from frappe.tests.utils import FrappeTestCase

from pos_next.api import promotions

CAMPAIGN = "_Test Campaign 3186"


class TestThePromotionScreenReadsItsCampaignsAsACashierAlone(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(self._forget_the_campaign)
		self._forget_the_campaign()
		frappe.get_doc({"doctype": "Campaign", "campaign_name": CAMPAIGN}).insert(ignore_permissions=True)

	def _forget_the_campaign(self):
		if frappe.db.exists("Campaign", CAMPAIGN):
			frappe.delete_doc("Campaign", CAMPAIGN, ignore_permissions=True, force=True)

	def test_campaign_has_no_disabled_field_which_is_what_the_old_call_asked_for(self):
		"""The cause of the 417: a filter on a field the doctype does not have (the call failed for the administrator as well)."""
		self.assertFalse(frappe.get_meta("Campaign").has_field("disabled"))

	def test_a_cashier_alone_is_given_the_names_of_the_campaigns(self):
		with as_role("cashier"), without_right("Campaign", "read"):
			names = [row["name"] for row in promotions.get_campaigns()]

		self.assertIn(CAMPAIGN, names)

	def test_she_is_given_names_and_nothing_else(self):
		with as_role("cashier"), without_right("Campaign", "read"):
			rows = promotions.get_campaigns()

		self.assertTrue(rows)
		for row in rows:
			self.assertEqual(set(row), {"name"})

	def test_no_right_was_given_to_get_there(self):
		"""The situation the screen was in: the role cannot read the doctype, and still cannot after the fix."""
		with as_role("cashier"), without_right("Campaign", "read"):
			self.assertFalse(frappe.has_permission("Campaign", "read"))
			with self.assertRaises(frappe.PermissionError):
				frappe.get_list("Campaign", limit_page_length=1)

	def test_the_administrator_is_served_too(self):
		self.assertIn(CAMPAIGN, [row["name"] for row in promotions.get_campaigns()])

	def test_a_visitor_reads_no_campaign(self):
		with as_role("Guest"):
			with self.assertRaises(frappe.PermissionError):
				promotions.get_campaigns()

	def test_the_call_is_whitelisted_and_takes_no_name_to_filter_on(self):
		self.assertIn(promotions.get_campaigns, frappe.whitelisted)
		with self.assertRaises(TypeError):
			promotions.get_campaigns(filters={"name": ["like", "%"]})
