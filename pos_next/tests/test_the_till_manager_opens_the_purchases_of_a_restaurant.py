# //// Neoffice — added file (no upstream equivalent).
"""The till manager opens the purchases of a restaurant, and they answer him (neoffice-maintenance#3283).

Whoever runs a restaurant holds `POSNext Manager` (the till's Manager level gives it). The two pages of the purchases, what
the restaurant buys and its shopping list, left that role out, when the shopping list's own rules give it everything. Both
open to him, and the calls they make answer: the catalogue reads Item, which the till's rules now give him as they give it to
the cashier (`setup/custom_docperm.json`, granted at each migrate by `install.grant_cashier_permissions`).

What he is not given: making an article or a packaging stays the buyer's (the ERP's own rights on Item, UOM and Item Price).

Each act is played by an account holding one role; Administrator only lays out the accounts. The suite rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.desk import desk_page
from frappe.tests.utils import FrappeTestCase

from pos_next.api import shopping as shopping_api
from pos_next.api import supplies as api
from pos_next.install import grant_cashier_permissions
from pos_next.restaurant import supply_catalogue
from pos_next.tests.test_till_writes_need_the_till import _company, _user

TILL_MANAGER = "purchases-till-manager@yopmail.com"
NO_ROLE = "purchases-no-role@yopmail.com"
PORTAL = "purchases-portal@yopmail.com"
PAGES = {"neoresto-purchases": "neoresto_purchases", "neoresto-shopping": "neoresto_shopping"}
LIST = "Restaurant Shopping List"


class TestTheTillManagerOpensThePurchasesOfARestaurant(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.addClassCleanup(frappe.set_user, "Administrator")
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		# What a migrate does with the files of the app: the pages, and the rules of the till's roles
		for page in PAGES.values():
			frappe.reload_doc("pos_next", "page", page, force=True)
		grant_cashier_permissions()
		cls.addClassCleanup(frappe.clear_cache, doctype="Item")
		_user(TILL_MANAGER, ["POSNext Manager"], "System User")
		_user(NO_ROLE, ["Blogger"], "System User")
		_user(PORTAL, ["Customer"], "Website User")
		cls.company = _company()

	def setUp(self):
		super().setUp()
		for context in (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 1}),
			patch("pos_next.restaurant.supply_catalogue.neoresto_active", return_value=True),
		):
			context.start()
			self.addCleanup(context.stop)
		self.addCleanup(frappe.set_user, "Administrator")

	def test_the_two_pages_open_to_the_till_manager(self):
		frappe.set_user(TILL_MANAGER)
		for page in PAGES:
			with self.subTest(page=page):
				self.assertTrue(frappe.get_doc("Page", page).is_permitted())
				self.assertTrue(desk_page.get(page))

	def test_they_stay_closed_to_a_desk_account_without_the_role_and_to_a_portal_account(self):
		for user in (NO_ROLE, PORTAL, "Guest"):
			frappe.set_user(user)
			for page in PAGES:
				with self.subTest(user=user, page=page):
					self.assertFalse(frappe.get_doc("Page", page).is_permitted())
					with self.assertRaises(frappe.PermissionError):
						desk_page.get(page)

	def test_the_page_opens_on_the_articles_the_restaurant_buys(self):
		frappe.set_user(TILL_MANAGER)

		answer = api.get_supply_catalogue()

		self.assertEqual(set(answer), {"rows", "total", "families", "suppliers"})

	def test_the_articles_are_refused_to_the_others(self):
		for user in (NO_ROLE, PORTAL, "Guest"):
			with self.subTest(user=user):
				frappe.set_user(user)
				with self.assertRaises(frappe.PermissionError):
					api.get_supply_catalogue()

	def test_the_till_manager_starts_a_shopping_list_and_reads_it(self):
		frappe.set_user(TILL_MANAGER)

		name = shopping_api.new_list(company=self.company)
		shopping_api.add_free_line(name, "Paper napkins", 2)

		self.assertTrue(shopping_api.get_list(name))
		self.assertEqual(frappe.db.get_value(LIST, name, "owner"), TILL_MANAGER)

	def test_a_shopping_list_is_refused_to_the_others(self):
		for user in (NO_ROLE, PORTAL, "Guest"):
			with self.subTest(user=user):
				frappe.set_user(user)
				with self.assertRaises(frappe.PermissionError):
					shopping_api.new_list(company=self.company)

	def test_reading_the_articles_gives_no_right_to_make_one(self):
		"""What is bought is written with the ERP's own rights (restaurant/supplies.py): the buyer's, not the till's."""
		frappe.set_user(TILL_MANAGER)

		self.assertTrue(frappe.has_permission("Item", "read"))
		for ptype in ("write", "create", "delete"):
			with self.subTest(ptype=ptype):
				self.assertFalse(frappe.has_permission("Item", ptype))
		with self.assertRaises(frappe.PermissionError):
			api.create_supply_item("_PNXT purchases article", "x", "y")
