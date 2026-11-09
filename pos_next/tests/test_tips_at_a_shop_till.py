# //// Neoffice — added file (no upstream equivalent).
"""Tips at a shop till (NeoCoiffeur study, product owner, 09.11.2026).

Product owner: « les pourboires, comme dans le restaurant […] attribués à la personne qui a servi » and « attention, on en a pour le
resto donc pars de là ». The restaurant's mechanism is the base and stays as it was: the overpayment becomes a line of the TIP item,
booked on the transit account 2211 (a tip is a pass-through for the staff, not turnover), and a `Restaurant Tip` record says whose
it is. A shop till is the same, with three differences the suite pins:

- its settings are its own POS Settings' (a restaurant till keeps its restaurant's), and switching them on makes the account and
  the item of the till's company, the way a restaurant does;
- the tip is the PEOPLE'S of the sale (its sales team, each for their part, to the cent), or a common pot, and goes to the user who
  rang it up when no one is named; a restaurant's stays the user who rang it up;
- the tip earns no commission and belongs to no restaurant, whatever restaurants the site has.
"""

from unittest.mock import patch

import frappe
from frappe.utils import flt, nowdate

from pos_next import till_tips
from pos_next.api import invoices
from pos_next.pos_next.report.tips_by_server import tips_by_server
from pos_next.pos_next.utils import sales_person_commission
from pos_next.tests.test_till_settings import TILL, TILL_MANAGER, TillSettingsCase, by_key
from pos_next.tests.test_till_writes_need_the_till import _sale
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "enable_till_tips"
LUC = "_Test Tip Luc"
SONIA = "_Test Tip Sonia"
MARIE = "_Test Tip Marie"
PEOPLE = {LUC: "TestTipLuc", SONIA: "TestTipSonia", MARIE: "TestTipMarie"}


def an_employee(first_name, company, user_id=None):
	return (
		frappe.get_doc(
			{
				"doctype": "Employee",
				"first_name": first_name,
				"gender": frappe.get_all("Gender", pluck="name", limit=1)[0],
				"date_of_birth": "1990-01-01",
				"date_of_joining": "2024-01-01",
				"company": company,
				"status": "Active",
				"user_id": user_id,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def a_sales_person(person_name, employee):
	root = frappe.get_all(
		"Sales Person", filters={"is_group": 1, "parent_sales_person": ["is", "not set"]}, pluck="name"
	)[0]
	return (
		frappe.get_doc(
			{
				"doctype": "Sales Person",
				"sales_person_name": person_name,
				"parent_sales_person": root,
				"is_group": 0,
				"enabled": 1,
				"employee": employee,
				"commission_rate": 10,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def a_parent_for_the_tip_account(company):
	"""The books of a test company may hold no account to hang the transit account under: a group is made, in the test's transaction."""
	if frappe.db.exists("Account", {"account_number": "2211", "company": company}):
		return
	for number in ("2210", "220"):
		if frappe.db.exists("Account", {"account_number": number, "company": company}):
			return
	root = frappe.db.get_value(
		"Account", {"company": company, "root_type": "Liability", "is_group": 1}, "name"
	)
	frappe.get_doc(
		{
			"doctype": "Account",
			"account_name": "_Test Tip Parent",
			"account_number": "2210",
			"parent_account": root,
			"company": company,
			"is_group": 1,
		}
	).insert(ignore_permissions=True)


class TestTipsAtAShopTill(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		a_parent_for_the_tip_account(cls.fx.company)

	def setUp(self):
		super().setUp()
		self.company = self.fx.company
		for person, first_name in PEOPLE.items():
			for doctype, filters in (
				("Sales Person", {"sales_person_name": person}),
				("Employee", {"first_name": first_name}),
			):
				for name in frappe.get_all(doctype, filters=filters, pluck="name"):
					frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
		self.luc_employee = an_employee(PEOPLE[LUC], self.company, user_id=TILL)
		self.sonia_employee = an_employee(PEOPLE[SONIA], self.company)
		self.marie_employee = an_employee(PEOPLE[MARIE], self.company)
		self.luc = a_sales_person(LUC, self.luc_employee)
		self.sonia = a_sales_person(SONIA, self.sonia_employee)
		self.marie = a_sales_person(MARIE, self.marie_employee)

	# ------------------------------------------------------------------------------------------------ helpers
	def tips_on(self, goes_to="Person who served", auto_detect=0):
		"""The shop till takes tips, saved the way a till manager saves them."""
		self.as_user(TILL_MANAGER)
		save_till_settings(
			self.shop_till, {KEY: 1, "till_tips_auto_detect": auto_detect, "till_tip_goes_to": goes_to}
		)
		frappe.set_user("Administrator")

	def a_sale(self, team=None, pos_profile=None):
		"""A draft sale of the shop till, with the sales team the till would have built for it."""
		sale = _sale(self.fx, pos_profile=pos_profile or self.shop_till)
		invoice = frappe.get_doc(sale).insert(ignore_permissions=True)
		for sales_person, percentage in team or ():
			invoice.append("sales_team", {"sales_person": sales_person, "allocated_percentage": percentage})
		return invoice

	def tips_of(self, invoice):
		return frappe.get_all(
			"Restaurant Tip",
			filters={"sales_invoice": invoice.name},
			fields=[
				"amount",
				"server",
				"sales_person",
				"employee",
				"common_pot",
				"pos_profile",
				"restaurant",
				"status",
				"payment_method",
			],
			order_by="creation asc, name asc",
		)

	# ------------------------------------------------------------------------------------------------ settings
	def test_switching_tips_on_makes_the_tip_account_and_the_tip_item_of_the_tills_company(self):
		self.tips_on()

		row = self.stored_settings(self.shop_till, "till_tip_item", "till_tip_account", KEY)

		self.assertEqual(row[KEY], 1)
		self.assertEqual(row.till_tip_item, "TIP")
		self.assertEqual(
			frappe.db.get_value("Account", row.till_tip_account, ["account_number", "company"], as_dict=True),
			{"account_number": "2211", "company": self.company},
		)

	def test_the_tip_item_grants_no_commission_and_stays_off_the_lists(self):
		self.tips_on()

		item = frappe.db.get_value(
			"Item", "TIP", ["grant_commission", "is_internal_item", "is_stock_item"], as_dict=True
		)

		self.assertEqual((item.grant_commission, item.is_internal_item, item.is_stock_item), (0, 1, 0))

	def test_a_tip_item_a_restaurant_made_before_is_set_right(self):
		till_tips.ensure_tip_item(self.company, None)
		frappe.db.set_value("Item", "TIP", "grant_commission", 1)

		till_tips.ensure_tip_item(self.company, None)

		self.assertEqual(frappe.db.get_value("Item", "TIP", "grant_commission"), 0)

	def test_the_patch_sets_the_tip_item_of_a_restaurant_right(self):
		from pos_next.patches.tips import keep_the_tip_item_out_of_commissions

		till_tips.ensure_tip_item(self.company, None)
		frappe.db.set_value("Item", "TIP", "grant_commission", 1)

		keep_the_tip_item_out_of_commissions.execute()

		self.assertEqual(frappe.db.get_value("Item", "TIP", "grant_commission"), 0)

	def test_the_tip_settings_of_a_shop_till_come_in_the_shape_of_a_restaurants(self):
		self.tips_on(goes_to="Common pot", auto_detect=1)

		settings = till_tips.tip_settings_of_till(self.shop_till)

		stored = self.stored_settings(self.shop_till, "till_tip_item", "till_tip_account")
		self.assertEqual(settings.kind, till_tips.KIND_TILL)
		self.assertEqual(
			(
				settings.enable_tips,
				settings.tip_item,
				settings.tip_account,
				settings.auto_detect_tip,
				settings.goes_to,
			),
			(1, stored.till_tip_item, stored.till_tip_account, 1, "Common pot"),
		)
		self.assertIsNone(settings.name)

	def test_a_till_that_takes_no_tips_has_no_tip_settings(self):
		self.assertFalse(till_tips.tip_settings_of_till(self.shop_till))
		self.assertFalse(till_tips.tip_settings_of_till(None))

		self.tips_on()
		self.as_user(TILL_MANAGER)
		save_till_settings(self.shop_till, {KEY: 0})
		frappe.set_user("Administrator")

		self.assertFalse(till_tips.tip_settings_of_till(self.shop_till))

	def test_the_tip_settings_are_listed_for_a_shop_till_and_not_for_a_restaurant_till(self):
		self.as_user(TILL_MANAGER)

		shop = by_key(get_till_settings(self.shop_till))
		restaurant = by_key(get_till_settings(self.restaurant_till))

		for key in (KEY, "till_tips_auto_detect", "till_tip_goes_to"):
			with self.subTest(key=key):
				self.assertEqual((shop[key]["tab"], shop[key]["group"]), ("sales", "till_tips"))
				self.assertTrue(shop[key]["label"].strip() and shop[key]["help"].strip())
				self.assertNotIn(key, restaurant)
		self.assertNotIn("till_tip_item", shop)
		self.assertNotIn("till_tip_account", shop)

	def test_a_value_the_tip_goes_to_does_not_offer_is_refused(self):
		self.as_user(TILL_MANAGER)

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.shop_till, {KEY: 1, "till_tip_goes_to": "The boss"})

		self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], 0)

	def test_the_till_reads_the_two_settings_with_the_rest_of_its_settings(self):
		from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS

		for key in (KEY, "till_tips_auto_detect"):
			with self.subTest(key=key):
				self.assertIn(key, POS_SETTINGS_FIELDS)
				self.assertEqual(DEFAULT_POS_SETTINGS[key], 0)

	# ------------------------------------------------------------------------------------------------ whose settings
	def test_an_invoice_reads_the_tip_settings_of_its_till(self):
		self.tips_on()
		frappe.db.set_value("Restaurant", self.restaurant, {"enable_tips": 1, "tip_item": "TIP"})
		frappe.clear_document_cache("Restaurant", self.restaurant)

		shop = invoices._tip_settings_of(frappe._dict(pos_profile=self.shop_till))
		restaurant = invoices._tip_settings_of(frappe._dict(pos_profile=self.restaurant_till))

		self.assertEqual(shop.kind, till_tips.KIND_TILL)
		self.assertEqual(restaurant.name, self.restaurant)
		self.assertFalse(restaurant.get("kind"))

	def test_a_restaurant_till_does_not_take_the_tips_of_its_own_pos_settings(self):
		"""The restaurant's switch is the one that counts for a restaurant till: a tick on the till's row changes nothing."""
		frappe.db.set_value("POS Settings", {"pos_profile": self.restaurant_till}, KEY, 1)
		frappe.db.set_value("Restaurant", self.restaurant, "enable_tips", 0)
		frappe.clear_document_cache("Restaurant", self.restaurant)

		settings = invoices._tip_settings_of(frappe._dict(pos_profile=self.restaurant_till))

		self.assertFalse(settings.get("enable_tips"))
		self.assertFalse(settings.get("kind"))

	# ------------------------------------------------------------------------------------------------ the tip line
	def test_the_overpayment_becomes_a_tip_line_booked_on_the_transit_account(self):
		self.tips_on()
		invoice = self.a_sale([(self.luc, 100)])
		before = flt(invoice.grand_total)

		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		stored = self.stored_settings(self.shop_till, "till_tip_item", "till_tip_account")
		line = [row for row in invoice.items if row.item_code == stored.till_tip_item]
		self.assertEqual(len(line), 1)
		self.assertEqual((line[0].rate, line[0].income_account), (5, stored.till_tip_account))
		self.assertEqual(flt(invoice.grand_total), before + 5)

	def test_a_tip_the_till_does_not_take_is_dropped(self):
		"""The screen offers a tip only where the till takes them; a payload that carries one anyway changes nothing."""
		invoice = self.a_sale([(self.luc, 100)])
		before = flt(invoice.grand_total)

		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		self.assertEqual(flt(invoice.grand_total), before)
		self.assertEqual(len(invoice.items), 1)
		self.assertEqual(self.tips_of(invoice), [])

	# ------------------------------------------------------------------------------------------------ whose tip
	def test_the_tip_is_shared_between_the_people_of_the_sale_each_for_their_part(self):
		self.tips_on()
		invoice = self.a_sale([(self.luc, 60), (self.sonia, 40)])

		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		tips = self.tips_of(invoice)
		self.assertEqual(
			[(t.sales_person, t.employee, t.server, t.amount) for t in tips],
			[(self.luc, self.luc_employee, TILL, 3), (self.sonia, self.sonia_employee, None, 2)],
		)
		for tip in tips:
			self.assertEqual(
				(tip.pos_profile, tip.restaurant, tip.status, tip.common_pot),
				(self.shop_till, None, "Collected", 0),
			)

	def test_the_shares_add_up_to_the_cent(self):
		self.tips_on()
		invoice = self.a_sale([(self.luc, 33.33), (self.sonia, 33.33), (self.marie, 33.34)])

		invoices._add_tip_to_invoice(invoice, 10, {}, record_amount=10)

		amounts = [t.amount for t in self.tips_of(invoice)]
		self.assertEqual(len(amounts), 3)
		self.assertEqual(round(sum(amounts), 2), 10)
		self.assertEqual(amounts, [3.33, 3.33, 3.34])

	def test_percentages_that_do_not_make_a_hundred_still_share_the_whole_tip(self):
		"""ERPNext refuses such a sales team on a document, so it never comes from a sale: the split holds all the same."""
		self.tips_on()
		team = [
			frappe._dict(sales_person=self.luc, allocated_percentage=50),
			frappe._dict(sales_person=self.sonia, allocated_percentage=25),
		]
		invoice = frappe._dict(pos_profile=self.shop_till, sales_team=team)

		shares = till_tips.shares_of(invoice, 6, till_tips.tip_settings_of_till(self.shop_till))

		self.assertEqual([share["amount"] for share in shares], [4, 2])

	def test_only_the_tip_of_the_till_is_shared_not_a_guests_tip_already_on_the_invoice(self):
		self.tips_on()
		invoice = self.a_sale([(self.luc, 100)])

		# 7 on the line (2 of them already there), 5 taken now: the record is for the 5
		invoices._add_tip_to_invoice(invoice, 7, {}, record_amount=5)

		self.assertEqual([t.amount for t in self.tips_of(invoice)], [5])

	def test_a_common_pot_is_one_tip_that_is_nobodys(self):
		self.tips_on(goes_to="Common pot")
		invoice = self.a_sale([(self.luc, 60), (self.sonia, 40)])

		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		tips = self.tips_of(invoice)
		self.assertEqual(len(tips), 1)
		self.assertEqual(
			(tips[0].amount, tips[0].common_pot, tips[0].sales_person, tips[0].server, tips[0].pos_profile),
			(5, 1, None, None, self.shop_till),
		)

	def test_a_sale_with_no_one_named_goes_to_the_user_who_rang_it_up(self):
		self.tips_on()
		invoice = self.a_sale()
		frappe.set_user(TILL)

		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		tips = self.tips_of(invoice)
		self.assertEqual([(t.server, t.sales_person, t.amount) for t in tips], [(TILL, None, 5)])

	def test_a_restaurants_tip_is_still_the_users_who_rang_it_up_and_names_no_till(self):
		settings = frappe._dict(name=self.restaurant, enable_tips=1)
		invoice = self.a_sale([(self.luc, 60), (self.sonia, 40)], pos_profile=self.restaurant_till)

		shares = till_tips.shares_of(invoice, 5, settings)

		self.assertEqual(shares, [{"server": frappe.session.user, "amount": 5}])

	def test_the_tip_of_a_shop_till_belongs_to_no_restaurant_whatever_restaurants_the_site_has(self):
		self.tips_on()
		invoice = self.a_sale([(self.luc, 100)])
		with (
			patch("pos_next.restaurant.settings.default_restaurant", return_value=self.restaurant),
			patch("pos_next.restaurant.scope.default_restaurant", return_value=self.restaurant),
		):
			invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		self.assertEqual([t.restaurant for t in self.tips_of(invoice)], [None])

	# ------------------------------------------------------------------------------------------------ commission
	def test_the_tip_earns_no_commission(self):
		"""Luc sold 10.00 at 10 %: his commission is 1.00 whether or not the customer left him 5.00."""
		self.tips_on()
		invoice = self.a_sale()
		for row in invoice.items:
			row.sales_person = self.luc

		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)
		team = sales_person_commission.build_sales_team_from_items(
			invoice, invoice_level_team=[{"sales_person": self.luc, "allocated_percentage": 100}]
		)

		self.assertEqual(len(invoice.items), 2)
		self.assertEqual(
			[(row["sales_person"], flt(row["incentives"], 2)) for row in team], [(self.luc, 1.0)]
		)
		self.assertEqual(invoice.flags.pos_commission_breakdown["allocated_by_sp"], {self.luc: 10.0})

	# ------------------------------------------------------------------------------------------------ the report
	def test_the_report_counts_the_tips_of_a_shop_till_by_person_and_the_common_pot(self):
		self.tips_on()
		shared = self.a_sale([(self.luc, 60), (self.sonia, 40)])
		invoices._add_tip_to_invoice(shared, 5, {}, record_amount=5)
		self.tips_on(goes_to="Common pot")
		pot = self.a_sale([(self.luc, 100)])
		invoices._add_tip_to_invoice(pot, 2, {}, record_amount=2)

		self.as_user(TILL_MANAGER)
		columns, data = tips_by_server.execute(
			{"from_date": nowdate(), "to_date": nowdate(), "pos_profile": self.shop_till}
		)

		self.assertIn("sales_person", [column["fieldname"] for column in columns])
		by_name = {row["server_name"]: row for row in data}
		self.assertEqual(set(by_name), {LUC, SONIA, "Common pot"})
		self.assertEqual(
			(by_name[LUC]["total"], by_name[SONIA]["total"], by_name["Common pot"]["total"]), (3, 2, 2)
		)

	def test_the_report_of_a_restaurant_does_not_count_a_shop_tills_tips(self):
		self.tips_on()
		invoice = self.a_sale([(self.luc, 100)])
		invoices._add_tip_to_invoice(invoice, 5, {}, record_amount=5)

		self.as_user(TILL_MANAGER)
		_columns, data = tips_by_server.execute(
			{"from_date": nowdate(), "to_date": nowdate(), "restaurant": self.restaurant}
		)

		self.assertEqual([row for row in data if row["sales_person"]], [])
