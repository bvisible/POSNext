# //// Neoffice — added file (no upstream equivalent).
"""A cashier who holds the till role alone reads the sellers of her till, and nothing more (neoffice-maintenance#3165).

The till loads the sales persons of its profile at every opening. A user whose only role is `POSNext Cashier` has no right to
read the doctype Sales Person: the read was refused (403, « Not permitted for Sales Person ») every time a till that uses
several sellers was opened, and the picker of the payment window stayed empty. The suites that exist for this list hold the role
`Sales User` on the cashier, which reads Sales Person: they could not see it.

This suite plays the cashier as she is, with the role of the persona `cashier` and nothing else. It pins that she is offered the
sellers of her till's company by name, that no right was given to her role to get there (she still cannot read the doctype), that
she is not offered the people of another company, that the rates stay unread, and that an account that is not on the POS Profile
is still refused.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role, make_persona, without_right
from frappe.tests.utils import FrappeTestCase

from pos_next.api import pos_profile
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	a_sales_person,
	an_employee,
)
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

ANNA = "_Test SP Reader Anna"
BEN = "_Test SP Reader Ben"
ELSEWHERE = "_Test SP Reader Elsewhere"
ANNA_FIRST_NAME = "TestSPReaderAnna"
BEN_FIRST_NAME = "TestSPReaderBen"
ELSEWHERE_FIRST_NAME = "TestSPReaderElsewhere"
ELSEWHERE_EMPLOYEE = "_TestSPReaderElsewhereEmployee"
OTHER_COMPANY = "_Test Other Company 3165"


def _forget_the_people_of_the_suite(cashier=None):
	for doctype, filters in (
		("Sales Person", {"sales_person_name": ["in", [ANNA, BEN, ELSEWHERE]]}),
		("Employee", {"first_name": ["in", [ANNA_FIRST_NAME, BEN_FIRST_NAME, ELSEWHERE_FIRST_NAME]]}),
	):
		for name in frappe.get_all(doctype, filters=filters, pluck="name"):
			frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	if cashier:
		frappe.db.delete("User Permission", {"user": cashier})
		frappe.cache.hdel("user_permissions", cashier)


class TestACashierWithOnlyTheTillRoleReadsTheSellersOfHerTill(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE], "System User")  # the fixture names it on its profile
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		# The account the till is opened with: the persona `cashier`, the role `POSNext Cashier` and no other.
		self.cashier = make_persona("cashier")
		self.addCleanup(_forget_the_people_of_the_suite, self.cashier)
		_forget_the_people_of_the_suite(self.cashier)
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": self.cashier})
		profile.save(ignore_permissions=True)
		# The people first, the setting after: while a till asks for a sales person, saving an employee makes the sales person.
		self.anna = a_sales_person(
			ANNA, an_employee(ANNA_FIRST_NAME, self.fx.company), self.fx.company, commission_rate=10
		)
		self.ben = a_sales_person(
			BEN, an_employee(BEN_FIRST_NAME, self.fx.company), self.fx.company, commission_rate=15
		)
		# A person of another company: her employee file says so (the company need not exist, as in the suite of the list itself).
		frappe.get_doc(
			{
				"doctype": "Employee",
				"name": ELSEWHERE_EMPLOYEE,
				"first_name": ELSEWHERE_FIRST_NAME,
				"employee_name": ELSEWHERE_FIRST_NAME,
				"company": OTHER_COMPANY,
				"status": "Active",
			}
		).db_insert()
		self.elsewhere = a_sales_person(ELSEWHERE, ELSEWHERE_EMPLOYEE, OTHER_COMPANY)
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Multiple"
		)
		frappe.clear_cache(user=self.cashier)

	def offered(self):
		"""What the till loads, asked for by the cashier as she is: the role of the till and no right to read Sales Person."""
		with as_role("cashier"), without_right("Sales Person", "read"):
			return {row["name"]: row for row in pos_profile.get_sales_persons(self.fx.profile)}

	def test_the_cashier_of_the_suite_cannot_read_sales_person_herself(self):
		"""The situation the other suites hide (the role `Sales User` reads it): the fix leaves it as it is, no right is given.

		The theme's access model gives `POSNext Cashier` read on Sales Person on a site that has migrated since 09.11 (osiris has the row), so the
		suite masks that right for her instead of relying on the site: it plays on a copy of such a site, on a site that has not got the row, and in CI.
		"""
		with as_role("cashier"), without_right("Sales Person", "read"):
			self.assertFalse(frappe.has_permission("Sales Person", "read"))
			with self.assertRaises(frappe.PermissionError):
				frappe.get_list("Sales Person", limit_page_length=1)

	def test_she_is_offered_the_sellers_of_her_till_by_name(self):
		offered = self.offered()

		self.assertIn(self.anna, offered)
		self.assertIn(self.ben, offered)
		self.assertEqual(offered[self.anna]["sales_person_name"], ANNA)

	def test_she_is_not_offered_a_person_of_another_company(self):
		# Whatever she is bound to: the till of a company offers the people of that company.
		self.assertNotIn(self.elsewhere, self.offered())

		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": self.cashier,
				"allow": "Company",
				"for_value": self.fx.company,
			}
		).insert(ignore_permissions=True)
		frappe.cache.hdel("user_permissions", self.cashier)
		bound = self.offered()

		self.assertNotIn(self.elsewhere, bound)
		self.assertIn(self.anna, bound)

	def test_she_reads_the_picker_fields_and_never_the_rates(self):
		offered = self.offered()

		for row in offered.values():
			self.assertLessEqual(
				set(row), {"name", "sales_person_name", "commission_rate", "employee", "is_mine"}
			)
		self.assertEqual({row["commission_rate"] for row in offered.values()}, {None})

	def test_the_rates_are_not_even_asked_of_the_database_for_her(self):
		asked = []
		real_get_all = frappe.get_all

		def recording(doctype, *args, **kwargs):
			if doctype == "Sales Person":
				asked.append(kwargs.get("fields"))
			return real_get_all(doctype, *args, **kwargs)

		with patch.object(frappe, "get_all", side_effect=recording):
			self.offered()

		self.assertEqual(len(asked), 1)
		self.assertNotIn("commission_rate", asked[0])

	def test_an_account_that_is_not_on_the_profile_is_still_refused(self):
		"""The access to the POS Profile is the only gate of the list: an account that reads Sales Person is no exception."""
		with as_role("sales_user"):
			with self.assertRaises(frappe.ValidationError):
				pos_profile.get_sales_persons(self.fx.profile)

	def test_a_till_that_does_not_use_sellers_offers_none_to_her_either(self):
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Disabled"
		)

		self.assertEqual(self.offered(), {})
