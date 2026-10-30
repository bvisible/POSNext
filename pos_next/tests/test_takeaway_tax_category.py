# //// Neoffice — added file (no upstream equivalent).
"""A takeaway sale takes the restaurant's takeaway tax category (NeoRestau lot 1, task 10).

In Switzerland food to take away is taxed at 2.6 % instead of 8.1 % on site, and alcohol stays at 8.1 % even to take
away: the rate is the item's, not the sale's. ERPNext's own mechanism carries the rule and is reused as it is: a Tax
Category on the invoice and, on the item or on its item group (which its items inherit, up the tree), an Item Tax row for
that category; an item without one keeps its usual rate. A restaurant names its takeaway category, and a takeaway sale at
one of its restaurant tills takes it.

The test builds everything it needs (a fresh CI site has none of it): a tax category, two VAT accounts, the Item Tax
Templates at 8.1 % and 2.6 %, the till's Swiss tax template laid out item by item (one row per VAT account at rate 0,
the price including the tax), a dish with a takeaway row of its own, an alcohol with none, a dessert whose item group
carries the takeaway row, a restaurant naming the category and its till. Nothing here commits: the class is rolled back
as a whole, each test to its savepoint.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt
from frappe.utils.nestedset import get_root_of

from pos_next.api import invoices
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant.takeaway_tax import apply_takeaway_tax_category, takeaway_tax_category
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

CATEGORY = "_Test Takeaway VAT"
RESTAURANT = "_Test Takeaway Restaurant"
FOOD = "_Test Takeaway Pasta"
ALCOHOL = "_Test Takeaway Beer"
DESSERT = "_Test Takeaway Tiramisu"
DISHES = "_Test Takeaway Dishes"
DESSERTS = "_Test Takeaway Desserts"
SAVEPOINT = "takeaway_tax_test"
# Every item is sold at this price, the tax included: 10.00 + 8.1 % on site
PRICE = 10.81


def _fresh(doctype, name):
	"""Take away what a run cut short may have left under a name of the test."""
	if name and frappe.db.exists(doctype, name):
		frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)


def _vat_group(company):
	"""The company's « Duties and Taxes » group (ERPNext's standard chart), else a tax group, else a liability group."""
	for filters in (
		{"account_name": "Duties and Taxes"},
		{"account_type": "Tax"},
		{"root_type": "Liability"},
	):
		group = frappe.db.get_value("Account", {"company": company, "is_group": 1, **filters}, "name")
		if group:
			return group
	raise AssertionError(f"{company} has no liability group to open a VAT account under")


def _vat_account(company, group, account_name):
	abbr = frappe.get_cached_value("Company", company, "abbr")
	_fresh("Account", f"{account_name} - {abbr}")
	return (
		frappe.get_doc(
			{
				"doctype": "Account",
				"account_name": account_name,
				"parent_account": group,
				"company": company,
				"account_type": "Tax",
				"is_group": 0,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _item_tax_template(company, title, rates):
	abbr = frappe.get_cached_value("Company", company, "abbr")
	_fresh("Item Tax Template", f"{title} - {abbr}")
	return (
		frappe.get_doc(
			{
				"doctype": "Item Tax Template",
				"title": title,
				"company": company,
				"taxes": [{"tax_type": account, "tax_rate": rate} for account, rate in rates.items()],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _item_group(name, taxes=()):
	"""An item group under the root that carries exactly `taxes`. The rows are written after the insert: on a site of
	the fleet the theme gives a new item group its company's default VAT rows (`handle_item_group`), which would hide
	the row under test."""
	_fresh("Item Group", name)
	group = (
		frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": name,
				"parent_item_group": get_root_of("Item Group"),
				"is_group": 0,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)
	frappe.db.delete("Item Tax", {"parenttype": "Item Group", "parent": group})
	for idx, row in enumerate(taxes, start=1):
		frappe.get_doc(
			{
				"doctype": "Item Tax",
				"parenttype": "Item Group",
				"parentfield": "taxes",
				"parent": group,
				"idx": idx,
				**row,
			}
		).db_insert()
	frappe.clear_document_cache("Item Group", group)
	return group


def _item(code, item_group, company, taxes):
	_fresh("Item", code)
	return (
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": code,
				"item_group": item_group,
				"stock_uom": frappe.db.get_value("UOM", "Nos") or frappe.db.get_value("UOM", {}, "name"),
				"is_stock_item": 0,
				"is_sales_item": 1,
				"item_defaults": [
					{
						"company": company,
						"default_warehouse": frappe.db.get_value(
							"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
						)
						or "",
					}
				],
				"taxes": taxes,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


class TakeawayTill:
	"""The restaurant, its till, the VAT and the items, made once for the class (the users are written once: each write
	of a user waits for the clone's locks). A test works inside a savepoint and is rolled back to it."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Whatever the class built is rolled back with the class, by the base class
		cls.addClassCleanup(frappe.set_user, "Administrator")
		# update_invoice commits (the kitchen fields): nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		# The site runs NeoRestau, as the configuration reads: no site_config.json is written
		site = patch.dict(frappe.conf, {"neorestau_active": 1})
		site.start()
		cls.addClassCleanup(site.stop)
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			cls.addClassCleanup(patcher.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		cls.fx = _till_fixture()
		cls.till = cls.fx.profile
		company = cls.fx.company

		_fresh("Tax Category", CATEGORY)
		cls.category = (
			frappe.get_doc({"doctype": "Tax Category", "title": CATEGORY})
			.insert(ignore_permissions=True)
			.name
		)
		group = _vat_group(company)
		cls.vat_81 = _vat_account(company, group, "_Test VAT 8.1 on sales")
		cls.vat_26 = _vat_account(company, group, "_Test VAT 2.6 on sales")
		cls.usual_template = _item_tax_template(company, "_Test VAT 8.1", {cls.vat_81: 8.1, cls.vat_26: 0})
		cls.reduced_template = _item_tax_template(company, "_Test VAT 2.6", {cls.vat_81: 0, cls.vat_26: 2.6})

		# The Swiss layout item by item: one row per VAT account at 0, each item's own template giving the rate
		abbr = frappe.get_cached_value("Company", company, "abbr")
		_fresh("Sales Taxes and Charges Template", f"_Test VAT item by item - {abbr}")
		till_taxes = frappe.get_doc(
			{
				"doctype": "Sales Taxes and Charges Template",
				"title": "_Test VAT item by item",
				"company": company,
				"taxes": [
					{
						"charge_type": "On Net Total",
						"account_head": account,
						"description": account,
						"rate": 0,
						"included_in_print_rate": 1,
					}
					for account in (cls.vat_81, cls.vat_26)
				],
			}
		).insert(ignore_permissions=True)
		profile = frappe.get_doc("POS Profile", cls.till)
		profile.taxes_and_charges = till_taxes.name
		profile.save(ignore_permissions=True)

		takeaway_row = {"item_tax_template": cls.reduced_template, "tax_category": cls.category}
		cls.dishes = _item_group(DISHES)
		cls.desserts = _item_group(DESSERTS, taxes=[takeaway_row])
		cls.food = _item(FOOD, cls.dishes, company, [{"item_tax_template": cls.usual_template}, takeaway_row])
		cls.alcohol = _item(ALCOHOL, cls.dishes, company, [{"item_tax_template": cls.usual_template}])
		cls.dessert = _item(DESSERT, cls.desserts, company, [{"item_tax_template": cls.usual_template}])

		_fresh("Restaurant", RESTAURANT)
		cls.restaurant = (
			frappe.get_doc(
				{
					"doctype": "Restaurant",
					"restaurant_name": RESTAURANT,
					"company": company,
					"takeaway_tax_category": cls.category,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		cls.make_till(enable_restaurant_mode=1)

	@classmethod
	def make_till(cls, **values):
		"""The POS Settings row of the till (the profile's only row): the restaurant's, the prices including the tax."""
		for name in frappe.get_all("POS Settings", filters={"pos_profile": cls.till}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": cls.till,
				"enabled": 1,
				"restaurant": cls.restaurant,
				"tax_inclusive": 1,
				**values,
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True).name

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)

	def sale(self, items, **changes):
		"""A cash sale of the till, as the till sends it: each item at PRICE, the tax included, paid in full."""
		sale = {
			"doctype": "Sales Invoice",
			"is_pos": 1,
			"pos_profile": self.till,
			"company": self.fx.company,
			"currency": self.fx.currency,
			"customer": self.fx.customer,
			"selling_price_list": self.fx.price_list,
			"items": [
				{"item_code": code, "qty": 1, "rate": PRICE, "price_list_rate": PRICE} for code in items
			],
			"payments": [{"mode_of_payment": self.fx.mode, "amount": flt(PRICE * len(items), 2)}],
		}
		sale.update(changes)
		return sale

	def pos_invoice(self, is_takeaway=0, items=(), **changes):
		"""The invoice the till's server path saves (update_invoice, in the cashier's session, on the till's profile),
		read back from the database."""
		frappe.set_user(TILL)
		try:
			saved = invoices.update_invoice(json.dumps(self.sale(items, is_takeaway=is_takeaway, **changes)))
		finally:
			frappe.set_user("Administrator")
		return frappe.get_doc("Sales Invoice", saved["name"])

	def vat_rate(self, inv, item_code):
		"""The rate the invoice's tax rows charge an item: its rate on each VAT account (item_wise_tax_detail), added up."""
		rate = 0.0
		for tax in inv.taxes:
			detail = json.loads(tax.item_wise_tax_detail or "{}")
			if item_code in detail:
				rate += flt(detail[item_code][0])
		return flt(rate, 2)


class TestTakeawayTaxCategory(TakeawayTill, FrappeTestCase):
	def test_a_takeaway_sale_takes_the_takeaway_rate(self):
		inv = self.pos_invoice(is_takeaway=1, items=[self.food])
		self.assertEqual(inv.tax_category, self.category)
		self.assertEqual(inv.items[0].item_tax_template, self.reduced_template)
		self.assertEqual(self.vat_rate(inv, self.food), 2.6)

	def test_alcohol_keeps_its_usual_rate_even_to_take_away(self):
		inv = self.pos_invoice(is_takeaway=1, items=[self.food, self.alcohol])
		self.assertEqual(self.vat_rate(inv, self.alcohol), 8.1)
		self.assertEqual(inv.items[1].item_tax_template, self.usual_template)
		# The dish beside it still takes its takeaway rate
		self.assertEqual(self.vat_rate(inv, self.food), 2.6)

	def test_the_item_group_takeaway_rate_reaches_its_items(self):
		inv = self.pos_invoice(is_takeaway=1, items=[self.dessert])
		self.assertEqual(self.vat_rate(inv, self.dessert), 2.6)
		self.assertEqual(inv.items[0].item_tax_template, self.reduced_template)

	def test_a_sale_on_site_keeps_the_usual_rates(self):
		inv = self.pos_invoice(is_takeaway=0, items=[self.food, self.alcohol])
		self.assertFalse(inv.tax_category)
		self.assertEqual(self.vat_rate(inv, self.food), 8.1)
		self.assertEqual(self.vat_rate(inv, self.alcohol), 8.1)

	def test_tax_inclusive_prices_keep_the_total(self):
		on_site = self.pos_invoice(is_takeaway=0, items=[self.food])
		away = self.pos_invoice(is_takeaway=1, items=[self.food])
		self.assertEqual(on_site.grand_total, away.grand_total)
		self.assertLess(away.total_taxes_and_charges, on_site.total_taxes_and_charges)
		# 10.81 holds 0.81 of VAT at 8.1 %, and 0.27 at 2.6 %
		self.assertEqual((on_site.total_taxes_and_charges, away.total_taxes_and_charges), (0.81, 0.27))

	def test_a_restaurant_without_a_takeaway_category_changes_nothing(self):
		frappe.db.set_value("Restaurant", self.restaurant, "takeaway_tax_category", None)
		inv = self.pos_invoice(is_takeaway=1, items=[self.food])
		self.assertEqual(self.vat_rate(inv, self.food), 8.1)
		self.assertFalse(inv.tax_category)

	def test_a_counter_till_sells_at_the_usual_rates_even_to_take_away(self):
		# A till that is not a restaurant till: the takeaway rule never reaches a shop till
		self.make_till(enable_restaurant_mode=0)
		self.assertIsNone(takeaway_tax_category(self.till))
		inv = self.pos_invoice(is_takeaway=1, items=[self.food])
		self.assertEqual(self.vat_rate(inv, self.food), 8.1)
		self.assertFalse(inv.tax_category)

	def test_where_neorestau_is_off_a_takeaway_sale_keeps_the_usual_rates(self):
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			self.assertIsNone(takeaway_tax_category(self.till))
			inv = self.pos_invoice(is_takeaway=1, items=[self.food])
		self.assertEqual(self.vat_rate(inv, self.food), 8.1)

	def test_the_till_names_its_restaurants_takeaway_category(self):
		self.assertEqual(takeaway_tax_category(self.till), self.category)
		# No till at all: no restaurant to read a category from (never the default restaurant's)
		self.assertIsNone(takeaway_tax_category(None))
		self.assertIsNone(takeaway_tax_category(""))

	def test_the_paid_invoice_of_a_takeaway_order_takes_the_takeaway_rate(self):
		# The till saves the sale's draft without the takeaway flag (a takeaway draft is a kitchen ticket to the
		# kitchen screen), and pays it with the flag and the order's number: the paid invoice takes the category
		sale = self.sale([self.food, self.alcohol])
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			paid = {**sale, "name": draft["name"], "is_takeaway": 1, "takeaway_number": "T-901"}
			invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		inv = frappe.get_doc("Sales Invoice", draft["name"])
		self.assertEqual(inv.docstatus, 1)
		self.assertEqual((inv.is_takeaway, inv.takeaway_number), (1, "T-901"))
		self.assertEqual(inv.tax_category, self.category)
		self.assertEqual((self.vat_rate(inv, self.food), self.vat_rate(inv, self.alcohol)), (2.6, 8.1))
		self.assertEqual(inv.grand_total, flt(2 * PRICE, 2))

	def test_a_takeaway_sale_made_offline_syncs_with_the_takeaway_rate(self):
		# The offline queue replays the sale later, in the shape of utils/offline/sync.js. The draft the server makes for
		# it on the way never carries the takeaway flag (update_invoice commits it and tells the kitchen screen, where a
		# takeaway draft is an order to cook); the paid invoice takes the flag, and so the category, before its save.
		sale = self.sale(
			[self.food], offline_id="_Test takeaway offline sale", is_takeaway=1, takeaway_number="T-903"
		)
		frappe.set_user(TILL)
		try:
			with patch.object(invoices, "update_invoice", wraps=invoices.update_invoice) as draft:
				synced = invoices.submit_invoice(
					data=json.dumps({"invoice": sale, "data": {"sales_team": []}})
				)
		finally:
			frappe.set_user("Administrator")
		drafted = json.loads(draft.call_args.args[0])
		self.assertNotIn("is_takeaway", drafted)
		self.assertNotIn("takeaway_number", drafted)
		inv = frappe.get_doc("Sales Invoice", synced["name"])
		self.assertEqual((inv.docstatus, inv.is_takeaway, inv.takeaway_number), (1, 1, "T-903"))
		self.assertEqual(inv.tax_category, self.category)
		self.assertEqual(self.vat_rate(inv, self.food), 2.6)

	def test_the_kitchen_ticket_and_the_payment_of_an_order_take_one_number(self):
		from pos_next.api.restaurant import get_next_takeaway_number

		number = get_next_takeaway_number()
		# The order's kitchen ticket: the draft the till validates (Valider), under the order's number
		self.pos_invoice(is_takeaway=1, items=[self.food], takeaway_number=number)
		following = get_next_takeaway_number()
		self.assertEqual(int(following[2:]), int(number[2:]) + 1)
		# Its payment: the invoice the till pays with the order's flag and number is the same order
		sale = self.sale([self.food])
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			paid = {**sale, "name": draft["name"], "is_takeaway": 1, "takeaway_number": number}
			invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(get_next_takeaway_number(), following)
		# A web order has no number: it counts on its own, as before
		self.pos_invoice(is_takeaway=1, items=[self.food])
		self.assertEqual(int(get_next_takeaway_number()[2:]), int(following[2:]) + 1)

	def test_a_return_and_an_invoice_made_outside_a_till_are_left_as_they_come(self):
		def takeaway(**values):
			doc = frappe.get_doc(
				{
					"doctype": "Sales Invoice",
					"company": self.fx.company,
					"pos_profile": self.till,
					"is_takeaway": 1,
					"items": [{"item_code": self.food, "qty": 1, "item_tax_template": self.usual_template}],
					**values,
				}
			)
			apply_takeaway_tax_category(doc)
			return doc

		for label, values in (
			("an invoice made outside a till", {"is_pos": 0}),
			("a return of a takeaway sale", {"is_pos": 1, "is_return": 1}),
		):
			with self.subTest(label):
				doc = takeaway(**values)
				self.assertFalse(doc.tax_category)
				self.assertEqual(doc.items[0].item_tax_template, self.usual_template)
		# The same takeaway sale at the till does take the category
		self.assertEqual(takeaway(is_pos=1).items[0].item_tax_template, self.reduced_template)
