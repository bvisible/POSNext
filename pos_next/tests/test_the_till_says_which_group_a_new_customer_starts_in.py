# //// Neoffice — added file (no upstream equivalent).
"""The group a new customer of the till starts in is the site's, read by the till (neoffice-maintenance#3108).

The new customer form fell back on the first group of the list (alphabetical) when none of the names it guessed existed: a customer was filed among the resellers
and paid another price. The form now asks the till which group the site says: the one of the POS Profile when the site's version has such a field, else the one of
the selling settings, and only a group customers can be filed in (not a node of the tree), else NONE. The suite asks as the cashier is, the role of the persona
`cashier` and nothing else (she holds no right on the selling settings), and pins who is refused.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.roles import as_role, make_persona, without_right
from frappe.tests.utils import FrappeTestCase

from pos_next.api import customers
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

LEAF = "_Test Customer Group Leaf 3108"
PROFILE_LEAF = "_Test Customer Group Profile 3108"
NODE = "_Test Customer Group Node 3108"
GONE = "_Test Customer Group Gone 3108"


class TestTheTillSaysWhichGroupANewCustomerStartsIn(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(self._forget_the_groups)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.cashier = make_persona("cashier")
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": self.cashier})
		profile.save(ignore_permissions=True)
		root = frappe.db.get_value(
			"Customer Group", {"is_group": 1, "parent_customer_group": ["is", "not set"]}, "name"
		)
		self._forget_the_groups()
		for name, is_group in ((LEAF, 0), (PROFILE_LEAF, 0), (NODE, 1)):
			frappe.get_doc(
				{
					"doctype": "Customer Group",
					"customer_group_name": name,
					"parent_customer_group": root,
					"is_group": is_group,
				}
			).insert(ignore_permissions=True)

	def _forget_the_groups(self):
		for name in (LEAF, PROFILE_LEAF, NODE):
			if frappe.db.exists("Customer Group", name):
				frappe.delete_doc("Customer Group", name, ignore_permissions=True, force=True)

	def asked(self, setting, profile=None):
		"""What the till is told, with the selling settings saying `setting`, asked by the cashier as she is: no right on the selling settings."""
		real = frappe.db.get_single_value

		def single(doctype, field=None, *args, **kwargs):
			if (doctype, field) == ("Selling Settings", "customer_group"):
				return setting
			return real(doctype, field, *args, **kwargs)

		with patch.object(frappe.db, "get_single_value", side_effect=single):
			with as_role("cashier"), without_right("Selling Settings", "read"):
				return customers.get_default_customer_group(profile or self.fx.profile)

	def test_the_group_of_the_selling_settings_is_the_default(self):
		self.assertEqual(self.asked(LEAF), LEAF)

	def test_a_node_of_the_tree_is_no_group_a_customer_can_be_filed_in(self):
		self.assertIsNone(self.asked(NODE))

	def test_a_group_that_no_longer_exists_is_no_default(self):
		self.assertIsNone(self.asked(GONE))

	def test_no_setting_is_no_default_and_never_the_first_group_of_the_list(self):
		self.assertIsNone(self.asked(None))
		self.assertIsNone(self.asked(""))

	def test_the_group_of_the_profile_wins_where_the_site_has_such_a_field(self):
		with patch.object(customers, "_the_customer_group_of_the_profile", return_value=PROFILE_LEAF):
			self.assertEqual(self.asked(LEAF), PROFILE_LEAF)

	def test_a_group_of_the_profile_that_is_a_node_gives_way_to_the_sites(self):
		with patch.object(customers, "_the_customer_group_of_the_profile", return_value=NODE):
			self.assertEqual(self.asked(LEAF), LEAF)

	def test_the_profile_that_has_no_such_field_is_not_asked_for_it(self):
		has_it = MagicMock()
		has_it.has_field.return_value = False
		with (
			patch.object(frappe, "get_meta", return_value=has_it),
			patch.object(frappe.db, "get_value") as read,
		):
			self.assertIsNone(customers._the_customer_group_of_the_profile(self.fx.profile))
		read.assert_not_called()

	def test_the_profile_that_has_the_field_is_read_for_it(self):
		has_it = MagicMock()
		has_it.has_field.return_value = True
		with (
			patch.object(frappe, "get_meta", return_value=has_it),
			patch.object(frappe.db, "get_value", return_value=PROFILE_LEAF) as read,
		):
			self.assertEqual(customers._the_customer_group_of_the_profile(self.fx.profile), PROFILE_LEAF)
		read.assert_called_once_with("POS Profile", self.fx.profile, "customer_group")

	def test_a_text_is_the_only_till_the_profile_is_read_for(self):
		self.assertIsNone(customers._the_customer_group_of_the_profile(None))
		self.assertIsNone(customers._the_customer_group_of_the_profile(["a", "list"]))

	def test_she_holds_no_right_on_the_selling_settings_and_is_still_told(self):
		with as_role("cashier"), without_right("Selling Settings", "read"):
			self.assertFalse(frappe.has_permission("Selling Settings", "read"))

	def test_a_desk_account_that_is_not_on_the_profile_is_refused(self):
		"""A desk account that reads no POS Profile and is not on this one (a role that reads the profile is a till user by the rule of the module)."""
		frappe.set_user(OTHER_TILL)
		with self.assertRaises(frappe.PermissionError):
			customers.get_default_customer_group(self.fx.profile)

	def test_a_visitor_is_refused(self):
		with as_role("Guest"):
			with self.assertRaises(frappe.PermissionError):
				customers.get_default_customer_group(self.fx.profile)
