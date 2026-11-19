# //// Neoffice — added file (no upstream equivalent).
"""An advance spent as customer credit at the till is set against the invoice in the ledger (NeoSalon, voie 4, 19.11.2026, neoffice-maintenance#3138).

Upstream added a reference row to the submitted Payment Entry and saved it: the advance was consumed on the payment while the invoice still owed the money. With the real
ledger, a submitted invoice and an advance of 25 of the same customer, 10 of it spent:

- the invoice owes 10 less than before, and the ledger carries an entry that links the payment to the invoice;
- the payment has 15 left unallocated (the part not spent stays her credit) and a reference to the invoice for 10;
- an advance bigger than what is left on it is refused, and nothing is written.
"""

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from pos_next.api import credit_sales
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_cash_mode,
	_customer,
	_item,
	_till_fixture,
	_user,
)


class TestAnAdvanceSpentAtTheTillIsSetAgainstTheInvoiceInTheLedger(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.company = self.fx.company
		self.customer = _customer()
		self.invoice = self.a_submitted_invoice(70)
		self.before = flt(self.invoice.outstanding_amount)
		self.advance = self.an_advance(25)

	def a_submitted_invoice(self, amount):
		"""A submitted invoice of the customer; what it owes is read as ERPNext priced it (the item's price list may not be the amount asked)."""
		invoice = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": self.company,
				"customer": self.customer,
				"posting_date": nowdate(),
				"due_date": nowdate(),
				"items": [{"item_code": _item(self.company), "qty": 1, "rate": amount}],
			}
		)
		with as_role("accountant"):
			invoice.insert()
			invoice.submit()
		invoice.reload()
		self.assertGreater(
			flt(invoice.outstanding_amount), 25, "the decor: the invoice owes more than the advance"
		)
		return invoice

	def an_advance(self, amount):
		from erpnext.accounts.party import get_party_account

		mode = _cash_mode(self.company)
		paid_to = frappe.db.get_value(
			"Mode of Payment Account", {"parent": mode, "company": self.company}, "default_account"
		)
		entry = frappe.new_doc("Payment Entry")
		entry.update(
			{
				"payment_type": "Receive",
				"company": self.company,
				"posting_date": nowdate(),
				"party_type": "Customer",
				"party": self.customer,
				"paid_from": get_party_account("Customer", self.customer, self.company),
				"paid_to": paid_to,
				"paid_amount": amount,
				"received_amount": amount,
				"source_exchange_rate": 1,
				"target_exchange_rate": 1,
				"mode_of_payment": mode,
			}
		)
		with as_role("accountant"):
			entry.insert()
			entry.submit()
		self.assertEqual(
			flt(frappe.db.get_value("Payment Entry", entry.name, "unallocated_amount")), flt(amount)
		)
		return entry.name

	def spend(self, amount):
		invoice = frappe.get_doc("Sales Invoice", self.invoice.name)
		return credit_sales._create_payment_entry_from_advance(invoice, self.advance, amount)

	def owed(self):
		return flt(frappe.db.get_value("Sales Invoice", self.invoice.name, "outstanding_amount"))

	def test_the_invoice_owes_what_is_left_once_the_advance_is_spent_and_the_ledger_links_the_payment_to_it(
		self,
	):
		self.spend(10)

		self.assertEqual(self.owed(), flt(self.before - 10, 2), "the 10 the customer spent are no more owed")
		linked = frappe.get_all(
			"Payment Ledger Entry",
			filters={"against_voucher_no": self.invoice.name, "voucher_no": self.advance, "delinked": 0},
			fields=["amount"],
		)
		self.assertTrue(linked, "the ledger has an entry that links the payment to the invoice")
		self.assertEqual(flt(sum(row.amount for row in linked)), -10)

	def test_the_payment_keeps_what_was_not_spent_as_her_credit_and_references_the_invoice(self):
		self.spend(10)

		self.assertEqual(flt(frappe.db.get_value("Payment Entry", self.advance, "unallocated_amount")), 15)
		(reference,) = frappe.get_all(
			"Payment Entry Reference",
			filters={"parent": self.advance, "reference_name": self.invoice.name},
			fields=["allocated_amount"],
		)
		self.assertEqual(flt(reference.allocated_amount), 10)

	def test_an_advance_cannot_be_spent_beyond_what_is_left_on_it_and_nothing_is_written(self):
		with self.assertRaises(frappe.ValidationError):
			self.spend(30)

		self.assertEqual(self.owed(), self.before)
		self.assertEqual(flt(frappe.db.get_value("Payment Entry", self.advance, "unallocated_amount")), 25)
