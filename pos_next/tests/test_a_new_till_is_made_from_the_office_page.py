# //// Neoffice — added file (no upstream equivalent).
"""A new till is made from the office's page, not from ERPNext's long profile form (NeoResto lot 1, task 13b; product owner, 05.11.2026:
« tu arrives, tu es un simple utilisateur [...] ils vont jamais s'en sortir »).

`create_till` asks for a name and a company, and optionally the till whose settings the new one takes; the profile's own hook makes its
POSNext settings. Who may: a till manager who also holds the ERP's right to create a POS Profile (what a profile is: its accounts, its
payments). The new till takes no user and no payment terminal: those are its own. The suite rolls everything back.
"""

from unittest.mock import patch

import frappe

from pos_next.tests.test_till_settings import PORTAL, TILL_MANAGER, TillSettingsCase, by_key
from pos_next.tests.test_till_writes_need_the_till import TILL, _user
from pos_next.till_settings import api
from pos_next.till_settings.api import create_till, get_desk_settings

# A till manager who is also the accountant: what creating a profile asks of the ERP
CREATOR = "new-till-creator@yopmail.com"
NEW = "_Test A New Till From The Office Page"


def settings_of(profile, *fields):
	return frappe.db.get_value("POS Settings", {"pos_profile": profile}, list(fields), as_dict=True)


class TestANewTillIsMadeFromTheOfficePage(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(CREATOR, ["POSNext Manager", "Accounts Manager"], "System User")
		frappe.clear_cache(user=CREATOR)

	def test_a_till_copied_takes_its_profile_and_its_settings_but_no_user(self):
		frappe.db.set_value("POS Settings", {"pos_profile": self.restaurant_till}, "return_validity_days", 13)
		self.as_user(CREATOR)

		name = create_till(NEW, "", copy_from=self.restaurant_till)

		self.assertEqual(name, NEW)
		old, new = (frappe.get_doc("POS Profile", p) for p in (self.restaurant_till, NEW))
		for field in (
			"company",
			"warehouse",
			"selling_price_list",
			"customer",
			"currency",
			"write_off_account",
		):
			with self.subTest(field=field):
				self.assertEqual(new.get(field), old.get(field))
		self.assertEqual(
			[row.mode_of_payment for row in new.payments], [row.mode_of_payment for row in old.payments]
		)
		# The users and the payment terminals are the new till's own
		self.assertEqual(len(old.applicable_for_users), 1)
		self.assertEqual(new.applicable_for_users, [])
		self.assertEqual(new.custom_active_payment_devices, [])
		# Its POSNext settings: made with the profile, then filled from the till copied
		found = settings_of(NEW, "return_validity_days", "enable_restaurant_mode", "restaurant", "enabled")
		self.assertEqual(found.return_validity_days, 13)
		self.assertEqual(
			(found.enable_restaurant_mode, found.restaurant, found.enabled), (1, self.restaurant, 1)
		)

	def test_what_belongs_to_one_till_or_to_the_whole_site_is_not_copied(self):
		frappe.db.set_value(
			"POS Settings",
			{"pos_profile": self.restaurant_till},
			{"shop_scan_key": "a-key-of-the-first-till"},
		)
		self.as_user(CREATOR)

		create_till(NEW, "", copy_from=self.restaurant_till)

		self.assertNotEqual(settings_of(NEW, "shop_scan_key").shop_scan_key, "a-key-of-the-first-till")
		self.assertEqual(settings_of(NEW, "pos_profile").pos_profile, NEW)

	def test_a_till_made_without_a_copy_takes_what_the_company_s_first_till_has(self):
		self.as_user(CREATOR)

		name = create_till(NEW, self.fx.company)

		new = frappe.get_doc("POS Profile", name)
		self.assertEqual(new.company, self.fx.company)
		self.assertTrue(new.warehouse and new.selling_price_list and new.write_off_account)
		self.assertTrue(any(row.default for row in new.payments))
		self.assertEqual(new.applicable_for_users, [])
		# ... and its POSNext settings are the defaults of a till that is not a restaurant till
		found = settings_of(name, "enabled", "enable_restaurant_mode")
		self.assertEqual((found.enabled, found.enable_restaurant_mode), (1, 0))

	def test_the_new_till_opens_on_the_page_at_once(self):
		self.as_user(CREATOR)
		name = create_till(NEW, "", copy_from=self.shop_till)

		answer = get_desk_settings(name)

		self.assertEqual(answer["pos_profile"], name)
		self.assertIn("company", by_key(answer))

	def test_a_company_with_no_till_gives_its_own_defaults_or_says_what_it_lacks(self):
		profile = api._profile_from_the_company(self.fx.company)

		self.assertEqual(profile.company, self.fx.company)
		self.assertEqual(
			profile.currency, frappe.get_cached_value("Company", self.fx.company, "default_currency")
		)
		self.assertEqual(profile.write_off_cost_center, profile.cost_center)
		self.assertEqual(
			[(row.mode_of_payment, row.default) for row in profile.payments],
			[(profile.payments[0].mode_of_payment, 1)],
		)
		with patch.object(frappe.db, "sql", return_value=()):
			with self.assertRaises(frappe.ValidationError) as caught:
				api._profile_from_the_company(self.fx.company)
		self.assertIn("a mode of payment wired to its accounts", str(caught.exception))

	def test_a_name_is_needed_and_a_name_taken_is_refused(self):
		self.as_user(CREATOR)

		for name in ("", "   "):
			with self.subTest(name=name), self.assertRaises(frappe.ValidationError):
				create_till(name, self.fx.company)
		with self.assertRaises(frappe.ValidationError):
			create_till(self.restaurant_till, self.fx.company)

	def test_an_unknown_company_or_an_unknown_till_to_copy_is_not_found(self):
		self.as_user(CREATOR)

		with self.assertRaises(frappe.DoesNotExistError):
			create_till(NEW, "A company that is not there")
		with self.assertRaises(frappe.DoesNotExistError):
			create_till(NEW, self.fx.company, copy_from="A till that is not there")
		self.assertFalse(frappe.db.exists("POS Profile", NEW))

	def test_a_till_manager_who_may_not_create_a_profile_is_refused_and_nothing_is_made(self):
		self.as_user(TILL_MANAGER)
		self.assertFalse(frappe.has_permission("POS Profile", "create"))

		with self.assertRaises(frappe.PermissionError):
			create_till(NEW, self.fx.company, copy_from=self.shop_till)

		self.assertFalse(frappe.db.exists("POS Profile", NEW))
		self.assertFalse(frappe.db.exists("POS Settings", {"pos_profile": NEW}))

	def test_a_cashier_and_a_portal_account_are_refused(self):
		for user in (TILL, PORTAL):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					create_till(NEW, self.fx.company)
		self.assertFalse(frappe.db.exists("POS Profile", NEW))
