# //// Neoffice — added file (no upstream equivalent).
"""A till is deleted from the office's page, or from ERPNext's own profile form, and its POSNext settings go with it (NeoResto lot 1, task 13b;
product owner, 06.11.2026: « création d'une caisse, suppression, modification, enfin tout, que ce soit très fluide »).

A till nobody used is deleted whole. A till that sales, sessions or other records mention is never deleted behind their back: the page says so and
points at the switch that closes a till without losing anything. Who may: a till manager who also holds the ERP's right to delete a profile.
The suite rolls everything back.
"""

import frappe

from pos_next.tests.test_till_settings import PORTAL, RESTAURANT_MANAGER, TILL_MANAGER, TillSettingsCase
from pos_next.tests.test_till_writes_need_the_till import TILL, _user
from pos_next.till_settings.api import create_till, delete_till, get_desk_settings

# A till manager who is also the accountant: what creating and deleting a profile asks of the ERP
CREATOR = "delete-till-creator@yopmail.com"
NEW = "_Test A Till To Delete From The Office Page"


class TestATillIsDeletedFromTheOfficePage(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(CREATOR, ["Nexus POS Manager", "Accounts Manager"], "System User")
		frappe.clear_cache(user=CREATOR)

	def a_new_till(self):
		self.as_user(CREATOR)
		return create_till(NEW, "", copy_from=self.shop_till)

	@staticmethod
	def its_settings():
		return frappe.db.exists("POS Settings", {"pos_profile": NEW})

	def test_a_till_nobody_used_is_deleted_with_its_settings_and_the_page_is_told_which_till_comes_next(self):
		self.a_new_till()
		self.assertTrue(self.its_settings())

		answer = delete_till(NEW)

		self.assertFalse(frappe.db.exists("POS Profile", NEW))
		self.assertFalse(self.its_settings())
		self.assertEqual(answer["deleted"], NEW)
		# The page goes on to a till that is still there
		self.assertIn(answer["next"], (self.restaurant_till, self.shop_till))

	def test_a_profile_deleted_from_its_own_form_takes_its_settings_with_it(self):
		self.a_new_till()
		frappe.set_user("Administrator")

		frappe.delete_doc("POS Profile", NEW)

		self.assertFalse(frappe.db.exists("POS Profile", NEW))
		self.assertFalse(self.its_settings())

	def test_a_till_that_other_records_mention_is_kept_whole_and_the_page_says_to_switch_it_off(self):
		self.a_new_till()
		frappe.get_doc(
			{"doctype": "Guest Order Token", "token": "till-delete-token", "pos_profile": NEW}
		).insert(ignore_permissions=True)

		with self.assertRaises(frappe.ValidationError) as caught:
			delete_till(NEW)

		self.assertIn("Switch it off", str(caught.exception))
		self.assertTrue(frappe.db.exists("POS Profile", NEW))
		self.assertTrue(self.its_settings())

	def test_a_till_manager_who_may_not_delete_a_profile_is_refused_and_nothing_goes(self):
		self.a_new_till()
		self.as_user(TILL_MANAGER)

		with self.assertRaises(frappe.PermissionError):
			delete_till(NEW)

		self.assertTrue(frappe.db.exists("POS Profile", NEW))
		self.assertTrue(self.its_settings())

	def test_a_cashier_a_restaurant_manager_a_portal_account_and_a_visitor_are_refused(self):
		self.a_new_till()
		for user in (TILL, RESTAURANT_MANAGER, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					delete_till(NEW)
		self.assertTrue(frappe.db.exists("POS Profile", NEW))

	def test_a_till_that_does_not_exist_is_not_found(self):
		self.as_user(CREATOR)

		with self.assertRaises(frappe.DoesNotExistError):
			delete_till("A till that is not there")

	def test_the_page_offers_the_deletion_only_to_whoever_may_do_it(self):
		self.as_user(CREATOR)
		self.assertTrue(get_desk_settings(self.shop_till)["can"]["delete"])
		self.as_user(TILL_MANAGER)
		self.assertFalse(get_desk_settings(self.shop_till)["can"]["delete"])
