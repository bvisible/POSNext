# //// Neoffice — added file (no upstream equivalent).
"""A person who rents her chair is never offered as the seller of a line (NeoSalon, lot G13; product owner, 10.11.2026).

What an independent does is hers, not the salon's: the sales persons the till offers for a line are those of the company less the people the site declares
independent. POS Next never names the planning app: the site declares them through the extension point `pos_next_independent_users` (a list of accounts),
and the till drops the sales persons whose employee is one of those accounts. The suite plays it as the real cashier of the till, with a stand-in for the hook:

- a declared independent is not offered, nor chosen first as « the cashier » when she is the one who opens the till; the others stay;
- a site that declares none, a hook that answers nothing, a hook that breaks, or one that answers anything but a list changes nothing;
- the sales persons of a company that has no employee behind them stay (nobody to match).
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments, pos_profile
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	LUC,
	LUC_FIRST_NAME,
	SONIA,
	SONIA_FIRST_NAME,
	_forget_the_people_of_the_suite,
	a_sales_person,
	an_employee,
)
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

ME = "pos_next.tests.test_a_person_who_rents_her_chair_is_never_offered_as_the_seller_of_a_line"
SITE = {}


def the_independents():
	SITE.setdefault("calls", []).append("independents")
	return SITE.get("users")


def independents_that_break():
	raise RuntimeError("the planning app is broken")


def independents_that_refuse():
	frappe.throw("Nobody may ask this.")


class TestAPersonWhoRentsHerChairIsNeverOfferedAsTheSellerOfALine(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")  # the fixture's second till names it
		self.fx = _till_fixture()
		_forget_the_people_of_the_suite()
		self.addCleanup(_forget_the_people_of_the_suite)
		# Luc is the signed-in cashier, Sonia a colleague
		self.luc_user = TILL
		self.sonia_user = "sonia-rents-her-chair@example.com"
		_user(self.sonia_user, ["Sales User"], "System User")
		self.luc_employee = an_employee(LUC_FIRST_NAME, self.fx.company, user_id=self.luc_user)
		self.sonia_employee = an_employee(SONIA_FIRST_NAME, self.fx.company, user_id=self.sonia_user)
		a_sales_person(LUC, self.luc_employee, self.fx.company, commission_rate=10)
		a_sales_person(SONIA, self.sonia_employee, self.fx.company, commission_rate=15)
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Single"
		)
		frappe.clear_cache(user=TILL)

	def declare(self, handler=None):
		"""The hook the site declares: `the_independents` unless another handler is given."""
		table = {appointments.INDEPENDENTS_HOOK: [f"{ME}.{handler or 'the_independents'}"]}
		real = frappe.get_hooks
		patcher = patch(
			"frappe.get_hooks",
			side_effect=lambda hook=None, *a, **k: table[hook] if hook in table else real(hook, *a, **k),
		)
		patcher.start()
		self.addCleanup(patcher.stop)

	def offered(self, user=TILL):
		frappe.set_user(user)
		try:
			return pos_profile.get_sales_persons(self.fx.profile)
		finally:
			frappe.set_user("Administrator")

	def names(self, rows):
		return sorted(row["name"] for row in rows if row["name"] in (LUC, SONIA))

	def test_a_declared_independent_is_not_offered_and_the_others_are(self):
		self.declare()
		SITE["users"] = [self.sonia_user]

		rows = self.offered()

		self.assertEqual(self.names(rows), [LUC])
		self.assertEqual(SITE["calls"], ["independents"])

	def test_the_cashier_who_is_independent_is_not_chosen_first_either(self):
		self.declare()
		SITE["users"] = [self.luc_user]

		rows = self.offered()

		self.assertEqual(self.names(rows), [SONIA])
		self.assertFalse(any(row.get("is_mine") for row in rows if row["name"] in (LUC, SONIA)))

	def test_a_site_that_declares_none_changes_nothing(self):
		self.assertEqual(self.names(self.offered()), sorted([LUC, SONIA]))

	def test_a_hook_that_says_nobody_or_something_else_than_a_list_changes_nothing(self):
		self.declare()
		for answer in ([], (), None, "sonia", {"user": self.sonia_user}, 5):
			with self.subTest(answer=str(answer)):
				SITE["users"] = answer
				self.assertEqual(self.names(self.offered()), sorted([LUC, SONIA]))

	def test_a_hook_that_breaks_or_refuses_leaves_the_picker_as_it_was(self):
		for handler in ("independents_that_break", "independents_that_refuse"):
			with self.subTest(handler=handler):
				self.declare(handler)
				self.assertEqual(self.names(self.offered()), sorted([LUC, SONIA]))

	def test_an_account_that_is_nobodys_employee_hides_nobody(self):
		self.declare()
		SITE["users"] = ["nobody@example.com", "", None]

		self.assertEqual(self.names(self.offered()), sorted([LUC, SONIA]))

	def test_a_sales_person_with_no_employee_stays_whoever_is_declared(self):
		rows = [{"name": "Chair", "employee": None}, {"name": LUC, "employee": self.luc_employee}]
		self.declare()
		SITE["users"] = [self.luc_user]

		self.assertEqual([row["name"] for row in appointments.without_independents(rows)], ["Chair"])
