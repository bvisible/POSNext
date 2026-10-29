# //// Neoffice — added file (no upstream equivalent).
"""The Restaurant doctype: its name, and the tip provisioning of its own company."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant


class TestRestaurant(FrappeTestCase):
	def setUp(self):
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		self.company = company[0]
		self.restaurants = []
		self.accounts = []

	def tearDown(self):
		for name in self.restaurants:
			frappe.delete_doc("Restaurant", name, force=True, ignore_permissions=True)
		# The tip account hangs under the parent made first: it goes first
		for name in reversed(self.accounts):
			frappe.delete_doc("Account", name, force=True, ignore_permissions=True)

	def make(self, name, **values):
		doc = frappe.get_doc({"doctype": "Restaurant", "restaurant_name": name, "company": self.company, **values})
		doc.insert(ignore_permissions=True)
		self.restaurants.append(doc.name)
		return doc.name

	def a_parent_for_the_tip_account(self):
		"""The account the tip account hangs under (2210 or 220): the company's own, else one made for the test."""
		parent = frappe.db.get_value(
			"Account", {"account_number": ["in", ["2210", "220"]], "company": self.company}, "name"
		)
		if parent:
			return parent
		liabilities = frappe.db.get_value(
			"Account", {"company": self.company, "is_group": 1, "root_type": "Liability"}, "name"
		)
		if not liabilities:
			self.skipTest("The company has no liability group to hang a tip account under")
		account = frappe.get_doc(
			{
				"doctype": "Account",
				"account_name": "_Test Tips Parent",
				"account_number": "2210",
				"parent_account": liabilities,
				"company": self.company,
				"is_group": 1,
			}
		).insert(ignore_permissions=True)
		self.accounts.append(account.name)
		return account.name

	def test_a_restaurant_is_named_by_its_restaurant_name(self):
		self.assertEqual(self.make("_Test Restaurant Name"), "_Test Restaurant Name")

	def test_two_restaurants_cannot_share_a_name(self):
		self.make("_Test Restaurant Twin")
		with self.assertRaises(frappe.DuplicateEntryError):
			self.make("_Test Restaurant Twin")

	def test_a_restaurant_is_enabled_unless_it_says_otherwise(self):
		self.assertEqual(frappe.db.get_value("Restaurant", self.make("_Test Restaurant On"), "enabled"), 1)

	def test_tips_off_provision_nothing(self):
		with (
			patch.object(Restaurant, "_ensure_tip_account") as account,
			patch.object(Restaurant, "_ensure_tip_item") as item,
		):
			self.make("_Test Restaurant No Tips", enable_tips=0)
		account.assert_not_called()
		item.assert_not_called()

	def test_tips_on_provision_the_account_and_the_item(self):
		with (
			patch.object(Restaurant, "_ensure_tip_account") as account,
			patch.object(Restaurant, "_ensure_tip_item") as item,
		):
			self.make("_Test Restaurant Tips", enable_tips=1)
		account.assert_called_once()
		item.assert_called_once()

	def test_the_tip_account_is_the_one_of_the_restaurants_own_company(self):
		self.a_parent_for_the_tip_account()
		tip_account_before = frappe.db.get_value(
			"Account", {"account_number": "2211", "company": self.company}, "name"
		)
		original = frappe.db.get_single_value

		def get_single_value(doctype, fieldname, *args, **kwargs):
			# The site's default company is not the restaurant's: the restaurant must not look there
			if (doctype, fieldname) == ("Global Defaults", "default_company"):
				return "_Test Some Other Company"
			return original(doctype, fieldname, *args, **kwargs)

		with (
			patch.object(frappe.db, "get_single_value", side_effect=get_single_value),
			patch.object(Restaurant, "_ensure_tip_item"),
		):
			name = self.make("_Test Restaurant Tips", enable_tips=1)
		tip_account = frappe.db.get_value("Restaurant", name, "tip_account")
		if tip_account and not tip_account_before:
			self.accounts.append(tip_account)
		self.assertTrue(tip_account)
		self.assertEqual(frappe.db.get_value("Account", tip_account, "company"), self.company)
