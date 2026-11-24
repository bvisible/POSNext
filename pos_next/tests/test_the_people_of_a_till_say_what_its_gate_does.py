# //// Neoffice — added file (no upstream equivalent).
"""The people of a till, on the office's page, say what the gate of the till does (neoffice-maintenance#3283).

The page counted `Restaurant Manager` as a role of the till and said of a person holding it alone that he « can open » it.
That role runs the dining room: no rule on a sale, an item or a customer. Listed on a till, he opened a session on a till
that shows no customer and refuses the sale; not listed, the gate (`cash_entry.require_till_access`) refuses him, when it
lets in the cashier, who reads the sales, and the till managers (`TILL_MANAGER_ROLES`). The page now says so, and offers the
cashier role to him as to any person listed with no role of the till.

Each act is played by an account holding one role; Administrator only lays out the till. The suite rolls everything back.
"""

import json

import frappe

from pos_next.api import customers, invoices
from pos_next.api.cash_entry import require_till_access
from pos_next.install import grant_cashier_permissions
from pos_next.tests.test_till_settings import PORTAL, RESTAURANT_MANAGER, TILL_MANAGER, TillSettingsCase
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, TILL, _sale, _user
from pos_next.till_settings.api import get_desk_settings

ADMIN = "till-people-admin@yopmail.com"
NO_TILL_ROLE = "till-people-no-till-role@yopmail.com"


class TestThePeopleOfATillSayWhatItsGateDoes(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# The rules of the till's roles, as every migrate gives them
		grant_cashier_permissions()
		cls.addClassCleanup(frappe.clear_cache, doctype="Item")
		_user(ADMIN, ["Admin"], "System User")
		_user(NO_TILL_ROLE, ["Blogger"], "System User")

	def _list_on(self, till, *users):
		"""Write the users of a till, as the office does on its page: the scenery."""
		frappe.set_user("Administrator")
		profile = frappe.get_doc("POS Profile", till)
		profile.set("applicable_for_users", [{"user": user} for user in users])
		profile.save(ignore_permissions=True)

	def _people(self, till):
		self.as_user(TILL_MANAGER)
		return {person["user"]: person for person in get_desk_settings(till)["people"]}

	def _gate_lets_in(self, user, till):
		"""Whether the gate knows this account by its roles: it is listed on no till."""
		self.as_user(user)
		try:
			require_till_access(till)
		except frappe.PermissionError:
			return False
		return True

	def test_a_restaurant_manager_alone_holds_no_role_of_the_till_and_cannot_open_it(self):
		for till in (self.shop_till, self.restaurant_till):
			with self.subTest(till=till):
				self._list_on(till, RESTAURANT_MANAGER, TILL)

				people = self._people(till)

				self.assertEqual(people[RESTAURANT_MANAGER]["roles"], [])
				self.assertFalse(people[RESTAURANT_MANAGER]["can_open"])
				# An enabled desk account: the page offers it the cashier role
				self.assertEqual(
					(people[RESTAURANT_MANAGER]["enabled"], people[RESTAURANT_MANAGER]["desk_account"]),
					(1, True),
				)
				self.assertEqual(people[TILL]["roles"], [CASHIER_ROLE])
				self.assertTrue(people[TILL]["can_open"])

	def test_a_till_whose_only_person_is_a_restaurant_manager_is_not_ready(self):
		self._list_on(self.restaurant_till, RESTAURANT_MANAGER)
		self.as_user(TILL_MANAGER)

		ready = {check["key"]: check["ok"] for check in get_desk_settings(self.restaurant_till)["readiness"]}

		self.assertFalse(ready["users"])

	def test_the_page_says_of_each_role_what_the_gate_does_with_it(self):
		accounts = {
			TILL: True,
			TILL_MANAGER: True,
			ADMIN: True,
			RESTAURANT_MANAGER: False,
			NO_TILL_ROLE: False,
			PORTAL: False,
		}
		# Nobody of these is listed: the gate answers on the roles alone
		for user in accounts:
			self.assertFalse(frappe.db.exists("POS Profile User", {"parent": self.shop_till, "user": user}))
		gate = {user: self._gate_lets_in(user, self.shop_till) for user in accounts}
		self.assertEqual(gate, accounts)

		self._list_on(self.shop_till, *accounts)
		people = self._people(self.shop_till)

		self.assertEqual({user: people[user]["can_open"] for user in accounts}, gate)

	def test_a_restaurant_manager_alone_is_served_no_customer_and_no_sale_at_the_till_he_is_listed_on(self):
		self._list_on(self.shop_till, RESTAURANT_MANAGER, TILL)
		sale = json.dumps(dict(_sale(self.fx), pos_profile=self.shop_till))

		self.as_user(RESTAURANT_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			customers.get_customers(pos_profile=self.shop_till)
		with self.assertRaises(frappe.PermissionError):
			invoices.update_invoice(sale)

		self.as_user(TILL)
		customers.get_customers(pos_profile=self.shop_till)
		self.assertTrue(invoices.update_invoice(sale).get("name"))
