# //// Neoffice — added file (no upstream equivalent).
"""Which sales persons a till offers, and which one is the cashier (NeoCoiffeur study, 09.11.2026).

Product owner: « if I open the till with an employee account, the person is already chosen: Luc is Luc, but I can put Sonia ».
The till's list of sales persons was wrong for exactly that case:

- Frappe puts a User Permission on the Employee of every user it creates one for, and a Sales Person is linked to an
  Employee: the list the cashier got held his own card alone, so he could never name the colleague who did the work;
- nothing told the till which of the persons is the cashier, so the field stayed empty and he had to find himself.

The suite pins that the list holds every sales person of the till's company whatever the user permissions of the
cashier, that each row says whether it is the cashier's (`is_mine`), that a user with no employee has none, and that the
flag which lifts the user-permission filter is put back after the call.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices, pos_profile
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

LUC = "_Test SP Luc"
SONIA = "_Test SP Sonia"
LUC_FIRST_NAME = "TestSPLuc"
SONIA_FIRST_NAME = "TestSPSonia"


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


def a_sales_person(person_name, employee, company, commission_rate=0):
	root = frappe.get_all(
		"Sales Person", filters={"is_group": 1, "parent_sales_person": ["is", "not set"]}, pluck="name"
	)[0]
	person = frappe.get_doc(
		{
			"doctype": "Sales Person",
			"sales_person_name": person_name,
			"parent_sales_person": root,
			"is_group": 0,
			"enabled": 1,
			"employee": employee,
			"commission_rate": commission_rate,
		}
	).insert(ignore_permissions=True)
	if frappe.db.has_column("Sales Person", "company"):
		frappe.db.set_value("Sales Person", person.name, "company", company)
	return person.name


def _forget_the_people_of_the_suite():
	"""The suite's own sales persons, employees and the user permission Frappe made for the cashier: gone before and after each test."""
	for doctype, filters in (
		("Sales Person", {"sales_person_name": ["in", [LUC, SONIA]]}),
		("Employee", {"first_name": ["in", [LUC_FIRST_NAME, SONIA_FIRST_NAME]]}),
	):
		for name in frappe.get_all(doctype, filters=filters, pluck="name"):
			frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	frappe.db.delete("User Permission", {"user": TILL, "allow": "Employee"})


class TestTheTillOffersEverySalesPersonAndMarksTheCashiersOwn(FrappeTestCase):
	def setUp(self):
		super().setUp()
		_forget_the_people_of_the_suite()
		self.addCleanup(_forget_the_people_of_the_suite)
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")  # the fixture's second till names it
		self.fx = _till_fixture()
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Single"
		)
		self.luc_employee = an_employee(LUC_FIRST_NAME, self.fx.company, user_id=TILL)
		self.sonia_employee = an_employee(SONIA_FIRST_NAME, self.fx.company)
		self.luc = a_sales_person(LUC, self.luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, self.sonia_employee, self.fx.company, commission_rate=15)
		frappe.clear_cache(user=TILL)
		self.addCleanup(frappe.set_user, "Administrator")

	def offered(self):
		"""What the till loads, as the cashier asks for it."""
		frappe.set_user(TILL)
		return {row["name"]: row for row in pos_profile.get_sales_persons(self.fx.profile)}

	def test_the_cashier_has_the_user_permission_that_used_to_hide_his_colleagues(self):
		# The situation of every employee account: without it the tests below could not fail on the old list.
		self.assertTrue(
			frappe.db.exists(
				"User Permission", {"user": TILL, "allow": "Employee", "for_value": self.luc_employee}
			)
		)

	def test_the_list_holds_every_sales_person_of_the_company_not_only_the_cashiers_own(self):
		offered = self.offered()

		self.assertIn(self.luc, offered)
		self.assertIn(self.sonia, offered)

	def test_each_row_says_whether_it_is_the_cashiers_own(self):
		offered = self.offered()

		self.assertEqual(offered[self.luc]["is_mine"], 1)
		self.assertEqual(offered[self.sonia]["is_mine"], 0)

	def test_a_user_with_no_employee_has_none_of_his_own(self):
		frappe.db.set_value("Employee", self.luc_employee, "user_id", None)

		offered = self.offered()

		self.assertEqual([row["is_mine"] for row in offered.values()], [0] * len(offered))
		self.assertIn(self.sonia, offered)

	def test_an_employee_who_has_left_is_not_the_cashiers_own(self):
		frappe.db.set_value("Employee", self.luc_employee, "status", "Left")

		self.assertEqual(self.offered()[self.luc]["is_mine"], 0)

	def test_the_flag_that_lifts_the_user_permission_filter_is_put_back(self):
		frappe.flags.ignore_user_permissions_for_doctype = "Something Else"
		self.addCleanup(setattr, frappe.flags, "ignore_user_permissions_for_doctype", None)

		self.offered()

		self.assertEqual(frappe.flags.ignore_user_permissions_for_doctype, "Something Else")
		frappe.flags.ignore_user_permissions_for_doctype = None
		self.offered()
		self.assertIsNone(frappe.flags.get("ignore_user_permissions_for_doctype"))

	def test_a_till_that_does_not_use_sales_persons_offers_none(self):
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Disabled"
		)

		self.assertEqual(self.offered(), {})

	def test_a_cashier_does_not_read_what_the_others_earn(self):
		offered = self.offered()

		self.assertEqual({row["commission_rate"] for row in offered.values()}, {None})

	def test_a_till_manager_reads_the_rates(self):
		with patch("pos_next.api.cash_entry.is_till_manager", return_value=True):
			offered = self.offered()

		self.assertEqual(float(offered[self.luc]["commission_rate"]), 10)
		self.assertEqual(float(offered[self.sonia]["commission_rate"]), 15)

	def test_the_commission_of_a_sale_does_not_depend_on_the_rate_the_till_sends(self):
		"""The picker no longer carries the rate: the invoice must be priced from the master, whatever the till sends."""
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Single"
		)
		frappe.set_user(TILL)
		sale = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": self.fx.company,
				"customer": self.fx.customer,
				"currency": self.fx.currency,
				"selling_price_list": self.fx.price_list,
				"posting_date": frappe.utils.nowdate(),
				"pos_profile": self.fx.profile,
				"items": [{"item_code": self.fx.item, "qty": 1, "rate": 100}],
			}
		)

		for sent in (None, 99):
			with self.subTest(sent=sent):
				invoices._apply_pos_sales_team(
					sale,
					[{"sales_person": self.luc, "allocated_percentage": 100, "commission_rate": sent}],
					self.fx.profile,
				)
				row = sale.sales_team[0]
				self.assertEqual(row.sales_person, self.luc)
				self.assertEqual(float(row.commission_rate), 10)
