# //// Neoffice — added file (no upstream equivalent).
"""The till's customer and item searches show a cashier what a list of Frappe shows her, and no more.

Their raw SQL asked nothing of the permission engine: a cashier limited to some customers or item groups (a User Permission,
a hook of the doctype) found every customer and every item of the site by name, where the desk shows her only her share.
That is a leak for any site with several companies or several shops, and it keeps an outside expert off a demonstration
salon that shares a site with real customers.

Each rule is played by a cashier of the test's own, assigned to a till of the test's own; Administrator prepares the scenery."""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role, without_right
from frappe.tests.utils import FrappeTestCase

from pos_next.api import customers, items
from pos_next.tests.test_till_writes_need_the_till import _cash_mode, _company, _user

MARK = "ZzTillSearchPerm"
RESTRICTED = "tillsearch-restricted@yopmail.com"
FREE = "tillsearch-free@yopmail.com"
PROFILE = "_PNXT tillsearch till"
GROUP = f"{MARK} items"


def only_the_customers_of_the_house(user, doctype=None):
	"""A hook of the doctype, the way a coach's or a branch's rule is written (permission_query_conditions)."""
	return f"`tabCustomer`.`customer_name` LIKE '%%{MARK} house%%'"


def _hooks_with_the_house_rule(real_get_hooks):
	def get_hooks(hook=None, default=None, app_name=None):
		found = real_get_hooks(hook, default=default, app_name=app_name)
		if hook == "permission_query_conditions":
			found = dict(found)
			found["Customer"] = [
				*found.get("Customer", []),
				"pos_next.tests.test_the_till_search_follows_the_permissions_of_a_list.only_the_customers_of_the_house",
			]
		return found

	return get_hooks


class TestTheTillSearchFollowsThePermissionsOfAList(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		for email in (RESTRICTED, FREE):
			_user(email, ["POSNext Cashier"], "System User")

		company = _company()
		currency = frappe.get_cached_value("Company", company, "default_currency")
		cost_center = frappe.get_cached_value("Company", company, "cost_center") or frappe.db.get_value(
			"Cost Center", {"company": company, "is_group": 0}, "name"
		)
		write_off_account = frappe.get_cached_value(
			"Company", company, "write_off_account"
		) or frappe.db.get_value(
			"Account", {"company": company, "is_group": 0, "root_type": "Expense"}, "name"
		)
		warehouse = frappe.db.get_value(
			"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
		)
		if frappe.db.exists("POS Profile", PROFILE):
			frappe.delete_doc("POS Profile", PROFILE, ignore_permissions=True, force=True)
		frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": PROFILE,
				"company": company,
				"currency": currency,
				"warehouse": warehouse,
				"selling_price_list": frappe.db.get_value(
					"Price List", {"selling": 1, "enabled": 1, "currency": currency}, "name"
				),
				"cost_center": cost_center,
				"write_off_account": write_off_account,
				"write_off_cost_center": cost_center,
				"write_off_limit": 1,
				"payments": [{"mode_of_payment": _cash_mode(company), "default": 1}],
				"applicable_for_users": [{"user": RESTRICTED}, {"user": FREE}],
			}
		).insert(ignore_permissions=True)

		group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
		territory = frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories"

		def customer(name):
			return (
				frappe.get_doc(
					{
						"doctype": "Customer",
						"customer_name": name,
						"customer_type": "Individual",
						"customer_group": group,
						"territory": territory,
					}
				)
				.insert(ignore_permissions=True)
				.name
			)

		cls.mine = customer(f"Mine {MARK} house")
		cls.theirs = customer(f"Theirs {MARK} elsewhere")

		root = (
			frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ""}, "name")
			or "All Item Groups"
		)
		cls.groups = {}
		for label in ("mine", "theirs"):
			name = f"{GROUP} {label}"
			frappe.get_doc(
				{"doctype": "Item Group", "item_group_name": name, "parent_item_group": root, "is_group": 0}
			).insert(ignore_permissions=True)
			cls.groups[label] = name

		def item(label):
			return (
				frappe.get_doc(
					{
						"doctype": "Item",
						"item_code": f"{MARK} {label}",
						"item_name": f"{MARK} {label}",
						"item_group": cls.groups[label],
						"stock_uom": frappe.db.get_value("UOM", "Nos")
						or frappe.db.get_value("UOM", {}, "name"),
						"is_stock_item": 0,
						"is_sales_item": 1,
						"item_defaults": [{"company": company, "default_warehouse": warehouse or ""}],
					}
				)
				.insert(ignore_permissions=True)
				.name
			)

		cls.item_mine = item("mine")
		cls.item_theirs = item("theirs")

	def setUp(self):
		super().setUp()
		self.forget_the_limits()
		self.addCleanup(self.forget_the_limits)

	def forget_the_limits(self):
		"""FrappeTestCase rolls back the class, not each test: one test's limits must not reach the next."""
		frappe.set_user("Administrator")
		frappe.db.delete("User Permission", {"user": RESTRICTED})
		frappe.clear_cache(user=RESTRICTED)

	def limit_the_restricted_cashier(self, *rules):
		"""User Permissions of the restricted cashier: (allow, for_value) pairs, applied to every doctype that links them."""
		for allow, value in rules:
			frappe.get_doc(
				{
					"doctype": "User Permission",
					"user": RESTRICTED,
					"allow": allow,
					"for_value": value,
					"apply_to_all_doctypes": 1,
				}
			).insert(ignore_permissions=True)
		frappe.clear_cache(user=RESTRICTED)

	def customers_found(self, user, term=MARK):
		with as_role(user):
			return {
				row["name"]
				for row in customers.get_customers(search_term=term, pos_profile=PROFILE, limit=50)
			}

	def customers_listed(self, user):
		with as_role(user):
			return {row["name"] for row in customers.get_customers(pos_profile=PROFILE, limit=0)}

	def items_found(self, user):
		with as_role(user):
			return {row["item_code"] for row in items.get_items(PROFILE, search_term=MARK, limit=50)}

	# ---- customers

	def test_a_cashier_limited_to_one_customer_finds_only_that_customer_by_name(self):
		self.limit_the_restricted_cashier(("Customer", self.mine))
		found = self.customers_found(RESTRICTED)
		self.assertIn(self.mine, found)
		self.assertNotIn(self.theirs, found)

	def test_the_list_of_a_limited_cashier_holds_only_her_customers(self):
		self.limit_the_restricted_cashier(("Customer", self.mine))
		listed = self.customers_listed(RESTRICTED)
		self.assertEqual(listed, {self.mine})

	def test_a_cashier_with_no_limit_still_finds_every_customer(self):
		found = self.customers_found(FREE)
		self.assertTrue({self.mine, self.theirs} <= found)
		self.assertTrue({self.mine, self.theirs} <= self.customers_listed(FREE))

	def test_a_hook_of_the_doctype_narrows_the_search_too(self):
		with patch("frappe.get_hooks", _hooks_with_the_house_rule(frappe.get_hooks)):
			found = self.customers_found(FREE)
			listed = self.customers_listed(FREE)
		self.assertIn(self.mine, found)
		self.assertNotIn(self.theirs, found)
		self.assertNotIn(self.theirs, listed)

	def test_an_account_that_may_not_read_customers_is_refused(self):
		# The cashier's role also holds `select`, which lets a list show names only: both are taken away.
		with without_right("Customer", "read"), without_right("Customer", "select"):
			with self.assertRaises(frappe.PermissionError):
				self.customers_found(FREE)
			with self.assertRaises(frappe.PermissionError):
				self.customers_listed(FREE)

	# ---- items

	def test_a_cashier_limited_to_an_item_group_sees_only_its_items(self):
		self.limit_the_restricted_cashier(("Item Group", self.groups["mine"]))
		found = self.items_found(RESTRICTED)
		self.assertIn(self.item_mine, found)
		self.assertNotIn(self.item_theirs, found)

	def test_the_count_of_the_grid_follows_the_same_limit(self):
		self.limit_the_restricted_cashier(("Item Group", self.groups["mine"]))
		with as_role(RESTRICTED):
			hers = items.get_items_count(PROFILE, item_group=self.groups["mine"])
			not_hers = items.get_items_count(PROFILE, item_group=self.groups["theirs"])
		with as_role(FREE):
			free_on_theirs = items.get_items_count(PROFILE, item_group=self.groups["theirs"])
		self.assertEqual((hers, not_hers), (1, 0))
		self.assertEqual(free_on_theirs, 1)

	def test_a_cashier_with_no_limit_still_sees_every_item(self):
		found = self.items_found(FREE)
		self.assertTrue({self.item_mine, self.item_theirs} <= found)

	def test_a_scanned_item_outside_her_limit_is_refused(self):
		"""A guard, not a fix: the scan was already held to the limit, by ERPNext's own check of the item (get_item_details)."""
		self.limit_the_restricted_cashier(("Item Group", self.groups["mine"]))
		with as_role(RESTRICTED):
			with self.assertRaises(frappe.ValidationError):
				items.search_by_barcode(self.item_theirs, PROFILE)
