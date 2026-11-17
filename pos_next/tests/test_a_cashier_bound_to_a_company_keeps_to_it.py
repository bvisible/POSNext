# //// Neoffice — added file (no upstream equivalent).
"""A cashier bound to some companies keeps to them at the till (neoffice-maintenance#2838).

A business of several companies binds an account of one of them with a User Permission on « Company », the desk's own bound.
The till opened a shift at a till of another company for a cashier assigned to it, and its single-document and company-named
reads (a return, the e-mail of an invoice, a customer's credit, wallet and loyalty, the stock of a warehouse) asked for a till
user, not for the company. They now refuse what is of a company the cashier is not bound to; what has no company stays
everybody's, and nothing changes for an account without a bound.

The cashier is bound by a User Permission row to a company that need not exist: the till, its invoice and its warehouse are of
the fixture's company, so that they are « of another company » for him. Every act is played by the cashier.
"""

import contextlib
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from pos_next.api import credit_sales, email, invoices, items, pos_profile, shifts, wallet
from pos_next.tests.test_audit_guards_n1 import a_web_request
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	PROFILE,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

OTHER_COMPANY = "_Test Other Company 2838"


def _bind(user, company):
	"""The User Permission on Company that binds `user`, applying to every doctype as ERPNext gives it with an employee file.
	Written as a row: the company need not exist."""
	frappe.get_doc(
		{
			"doctype": "User Permission",
			"name": frappe.generate_hash(length=10),
			"user": user,
			"allow": "Company",
			"for_value": company,
			"apply_to_all_doctypes": 1,
		}
	).db_insert()
	frappe.cache.hdel("user_permissions", user)


class TestACashierBoundToACompanyKeepsToIt(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# create_opening_shift and the invoice's submit commit: a no-op here keeps the test inside the transaction tearDown
		# rolls back. Stopped by addCleanup, which runs even when setUp fails.
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		# The fixture's other till is assigned to him
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.warehouse = frappe.db.get_value("POS Profile", PROFILE, "warehouse")

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		frappe.cache.hdel("user_permissions", TILL)

	@contextlib.contextmanager
	def as_cashier(self):
		frappe.set_user(TILL)
		try:
			yield
		finally:
			frappe.set_user("Administrator")

	def a_sale(self, **changes):
		"""A submitted sale of the till's company: the scenery the cashier then reaches for."""
		sale = frappe.get_doc(_sale(self.fx, **changes)).insert(ignore_permissions=True)
		sale.submit()
		return sale.name

	def cash_float(self):
		return [{"mode_of_payment": self.fx.mode, "opening_amount": 0}]

	def tills_offered(self):
		return {row.name for row in pos_profile.get_pos_profiles()} | {
			row.name for row in shifts.get_opening_dialog_data()["pos_profiles_data"]
		}

	def test_a_cashier_bound_to_another_company_is_not_offered_its_till(self):
		_bind(TILL, OTHER_COMPANY)

		with self.as_cashier():
			self.assertNotIn(PROFILE, self.tills_offered())

	def test_a_cashier_bound_to_another_company_cannot_open_its_till(self):
		_bind(TILL, OTHER_COMPANY)

		with self.as_cashier():
			self.assertRaises(
				frappe.PermissionError,
				shifts.create_opening_shift,
				PROFILE,
				self.fx.company,
				self.cash_float(),
			)
		self.assertFalse(frappe.db.exists("POS Opening Shift", {"user": TILL}))

	def test_a_cashier_bound_to_the_company_of_his_till_still_opens_it(self):
		_bind(TILL, self.fx.company)

		with self.as_cashier():
			self.assertIn(PROFILE, self.tills_offered())
			opened = shifts.create_opening_shift(PROFILE, self.fx.company, self.cash_float())
		self.assertEqual(opened["pos_opening_shift"]["pos_profile"], PROFILE)

	def test_nothing_changes_for_a_cashier_without_a_bound(self):
		with self.as_cashier(), a_web_request():
			self.assertIn(PROFILE, self.tills_offered())
			self.assertEqual(items.get_item_stock(self.fx.item, self.warehouse)["warehouse"], self.warehouse)

	def test_an_invoice_of_another_company_is_neither_returned_nor_mailed(self):
		with_till = self.a_sale()
		without_till = self.a_sale()
		frappe.db.set_value("Sales Invoice", without_till, "pos_profile", None)
		_bind(TILL, OTHER_COMPANY)

		with self.as_cashier():
			for invoice in (with_till, without_till):
				for gesture in (
					invoices.check_invoice_return_validity,
					invoices.get_invoice_for_return,
					invoices.prepare_return_invoice,
					email.get_invoice_email_context,
				):
					with self.subTest(till=invoice == with_till, gesture=gesture.__name__):
						self.assertRaises(frappe.PermissionError, gesture, invoice)
			self.assertRaises(frappe.PermissionError, invoices.validate_return_items, with_till, [])

	def test_an_invoice_of_the_cashiers_company_is_still_returned(self):
		sale = self.a_sale()
		_bind(TILL, self.fx.company)

		with self.as_cashier():
			self.assertEqual(invoices.get_invoice_for_return(sale)["name"], sale)

	def test_credit_wallet_and_loyalty_of_another_company_are_refused(self):
		_bind(TILL, OTHER_COMPANY)
		customer, company = self.fx.customer, self.fx.company

		with self.as_cashier():
			for name, gesture in (
				("balance", lambda: credit_sales.get_customer_balance(customer, company)),
				("credit", lambda: credit_sales.get_available_credit(customer, company)),
				("credit invoices of the till", lambda: credit_sales.get_credit_invoices(PROFILE)),
				("wallet", lambda: wallet.get_wallet_info(customer, company)),
				("loyalty", lambda: wallet.get_loyalty_details(customer, company)),
			):
				with self.subTest(gesture=name):
					self.assertRaises(frappe.PermissionError, gesture)

	def test_the_balance_without_a_company_leaves_the_other_companies_out(self):
		self.a_sale(is_pos=0, pos_profile=None, payments=[], due_date=nowdate())

		with self.as_cashier():
			self.assertGreater(credit_sales.get_customer_balance(self.fx.customer)["total_outstanding"], 0)
		_bind(TILL, OTHER_COMPANY)
		with self.as_cashier():
			self.assertEqual(credit_sales.get_customer_balance(self.fx.customer)["total_outstanding"], 0)

	def test_the_stock_of_a_warehouse_of_another_company_is_not_read(self):
		_bind(TILL, OTHER_COMPANY)

		with self.as_cashier(), a_web_request():
			self.assertRaises(frappe.PermissionError, items.get_item_stock, self.fx.item, self.warehouse)
