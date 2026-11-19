# //// Neoffice — added file (no upstream equivalent).
"""What the answer of a sale says it owes (NeoSalon, voie 4, 19.11.2026, neoffice-maintenance#3138).

The customer credit a sale spends is set against the invoice in the ledger after the document in memory was read: the dialog of the sale said « Remaining: 10.00 » for a sale
the ledger had settled. With a credit spent, the answer reads what the invoice owes from the database again; without one it is the document's, as before.
"""

from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api.invoices import _what_the_sale_owes


class TestTheAnswerOfASaleSaysWhatItOwesAfterTheCreditItSpent(FrappeTestCase):
	def sale(self):
		return frappe._dict(name="SINV-1", outstanding_amount=10.0)

	def test_with_a_credit_spent_it_reads_what_the_ledger_left_not_what_the_document_held_before(self):
		with patch("frappe.db.get_value", return_value=0.0) as read:
			owed = _what_the_sale_owes(self.sale(), True)

		self.assertEqual(owed, 0.0)
		read.assert_called_once_with("Sales Invoice", "SINV-1", "outstanding_amount")

	def test_with_no_credit_spent_it_is_the_documents_and_the_database_is_not_asked(self):
		with patch("frappe.db.get_value", side_effect=AssertionError("no read without a credit")):
			self.assertEqual(_what_the_sale_owes(self.sale(), False), 10.0)

	def test_a_document_with_no_outstanding_says_zero_as_before(self):
		with patch("frappe.db.get_value", side_effect=AssertionError("no read without a credit")):
			self.assertEqual(_what_the_sale_owes(SimpleNamespace(name="SINV-2"), False), 0)

	def test_a_missing_row_reads_as_nothing_owed_never_as_an_error(self):
		with patch("frappe.db.get_value", return_value=None):
			self.assertEqual(_what_the_sale_owes(self.sale(), True), 0.0)
