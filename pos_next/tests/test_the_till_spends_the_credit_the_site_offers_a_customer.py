# //// Neoffice — added file (no upstream equivalent).
"""The credit the site offers a customer at the till (NeoSalon, voie 4, 19.11.2026): what she asked to keep, as a credit, of a down payment paid online beyond her sale.

The site names the Payment Entries it offers (`pos_next_customer_credit_offered`); the till reads what is left of each. Played with stand-ins of the site's hook and of the database
reads (the contract with the site and with the ledger is what is proved here):

- that the till asks the ledger only for the advances the site names, of THIS customer, in THIS company, submitted, received and still unallocated;
- that a site with no hook, a hook that breaks, or one that answers anything but a list offers nothing, and the till never fails for it;
- that the balance counts what is offered as her credit and says how much (`offered_credit`), and that without an offer nothing changes: the balance is exactly the invoices' one;
- that a till that takes no customer credit lists only what is offered (never her other advances or the credit of her returns), and that a till that does is as before.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import credit_sales
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_customer,
	_till_fixture,
	_user,
)

ME = "pos_next.tests.test_the_till_spends_the_credit_the_site_offers_a_customer"
SITE = {}


def offers_ten(customer, company, pos_profile):
	SITE.setdefault("asked", []).append((customer, company, pos_profile))
	return ["PAY-OFFERED"]


def offers_nothing(*args):
	return []


def breaks(*args):
	raise RuntimeError("the lane is broken")


def says_nonsense(*args):
	return "PAY-OFFERED"


def an_advance(name, amount):
	return frappe._dict(
		name=name,
		unallocated_amount=amount,
		posting_date="2026-11-19",
		paid_amount=amount,
		mode_of_payment="Wallee",
		modified="2026-11-19 12:00:00",
	)


class TestTheTillSpendsTheCreditTheSiteOffersACustomer(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.customer = _customer()

	def site_has(self, *paths):
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			if hook == credit_sales.CREDIT_OFFERED_HOOK:
				return [f"{ME}.{path}" for path in paths]
			return real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def ledger(self, rows):
		"""The advances the ledger gives for the names asked; what the till asked of it is kept in `asked_of_the_ledger`."""
		self.asked_of_the_ledger = []

		def answer(names, customer, company):
			self.asked_of_the_ledger.append((names, customer, company))
			return rows

		patcher = patch.object(credit_sales, "_advances_named", side_effect=answer)
		patcher.start()
		self.addCleanup(patcher.stop)

	def as_the_cashier(self, method, *args, **kwargs):
		frappe.set_user(TILL)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	# What the site names and what the till asks the ledger

	def test_the_till_asks_the_ledger_only_for_the_advances_the_site_names_of_this_customer_in_this_company(
		self,
	):
		self.site_has("offers_ten")
		self.ledger([an_advance("PAY-OFFERED", 10)])

		rows = credit_sales._credit_offered(self.customer, self.fx.company, self.fx.profile)

		self.assertEqual([row.name for row in rows], ["PAY-OFFERED"])
		self.assertEqual(self.asked_of_the_ledger, [(["PAY-OFFERED"], self.customer, self.fx.company)])
		self.assertEqual(SITE["asked"], [(self.customer, self.fx.company, self.fx.profile)])

	def test_the_ledger_is_asked_for_a_received_submitted_unallocated_payment_of_her_in_the_company(self):
		with patch("frappe.get_all", return_value=[]) as read:
			credit_sales._advances_named(["PAY-1"], "CUST-1", "A Company")

		(call,) = read.call_args_list
		self.assertEqual(call.args[0], "Payment Entry")
		self.assertEqual(
			call.kwargs["filters"],
			{
				"name": ["in", ["PAY-1"]],
				"party": "CUST-1",
				"company": "A Company",
				"docstatus": 1,
				"payment_type": "Receive",
				"unallocated_amount": [">", 0],
			},
		)

	def test_a_site_with_no_hook_a_hook_that_breaks_or_one_that_answers_a_text_offers_nothing_and_never_fails(
		self,
	):
		self.ledger([an_advance("PAY-OFFERED", 10)])
		self.site_has()
		self.assertEqual(credit_sales._credit_offered(self.customer, self.fx.company), [])

		for lane in ("breaks", "says_nonsense", "offers_nothing"):
			with self.subTest(lane=lane):
				self.site_has(lane)
				with patch("frappe.log_error"):
					self.assertEqual(credit_sales._credit_offered(self.customer, self.fx.company), [])

		self.assertEqual(self.asked_of_the_ledger, [], "the ledger is not asked when nothing is named")

	def test_nothing_is_offered_without_a_customer_or_a_company(self):
		self.site_has("offers_ten")
		self.ledger([an_advance("PAY-OFFERED", 10)])

		self.assertEqual(credit_sales._credit_offered(None, self.fx.company), [])
		self.assertEqual(credit_sales._credit_offered(self.customer, None), [])

	# The balance

	def test_what_is_offered_counts_as_her_credit_in_the_balance_and_is_said(self):
		self.site_has("offers_ten")
		self.ledger([an_advance("PAY-OFFERED", 10)])

		balance = self.as_the_cashier(credit_sales.get_customer_balance, self.customer, self.fx.company)

		self.assertEqual(balance["offered_credit"], 10)
		self.assertEqual(balance["total_credit"], 10)
		self.assertEqual(balance["net_balance"], -10)

	def test_a_customer_the_site_offers_nothing_has_the_balance_of_her_invoices_alone(self):
		self.site_has("offers_nothing")
		self.ledger([an_advance("PAY-NOT-ASKED", 99)])

		balance = self.as_the_cashier(credit_sales.get_customer_balance, self.customer, self.fx.company)

		self.assertEqual(balance["offered_credit"], 0)
		self.assertEqual((balance["total_credit"], balance["total_outstanding"]), (0, 0))
		self.assertEqual(balance["net_balance"], 0)

	# The credit sources

	def settings(self, **values):
		frappe.db.set_value(
			"POS Settings",
			{"pos_profile": self.fx.profile},
			{"allow_credit_sale": 0, "allow_customer_credit_payment": 0, **values},
		)

	def test_a_till_that_takes_no_customer_credit_lists_only_what_is_offered(self):
		self.settings()
		self.site_has("offers_ten")
		self.ledger([an_advance("PAY-OFFERED", 10)])

		real = frappe.get_all

		def guard(doctype, *args, **kwargs):
			assert doctype not in ("Sales Invoice", "Payment Entry"), "her other credit is not read"
			return real(doctype, *args, **kwargs)

		with patch("frappe.get_all", side_effect=guard):
			sources = self.as_the_cashier(
				credit_sales.get_available_credit, self.customer, self.fx.company, self.fx.profile
			)

		self.assertEqual(
			[(s["type"], s["credit_origin"], s["available_credit"]) for s in sources],
			[("Advance", "PAY-OFFERED", 10)],
		)

	def test_a_till_that_takes_customer_credit_lists_what_it_listed_before_and_nothing_is_asked_of_the_site(
		self,
	):
		self.settings(allow_customer_credit_payment=1)
		self.site_has("offers_ten")
		self.ledger([an_advance("PAY-OFFERED", 10)])

		sources = self.as_the_cashier(
			credit_sales.get_available_credit, self.customer, self.fx.company, self.fx.profile
		)

		self.assertNotIn("PAY-OFFERED", [s["credit_origin"] for s in sources])
		self.assertNotIn("asked", SITE)

	def test_a_till_the_caller_does_not_name_is_as_before(self):
		self.site_has("offers_ten")
		self.ledger([an_advance("PAY-OFFERED", 10)])

		sources = self.as_the_cashier(credit_sales.get_available_credit, self.customer, self.fx.company, None)

		self.assertNotIn("PAY-OFFERED", [s["credit_origin"] for s in sources])
		self.assertNotIn("asked", SITE)
