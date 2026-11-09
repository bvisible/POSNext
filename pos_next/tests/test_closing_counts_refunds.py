# //// Neoffice — added file (no upstream equivalent).
"""The closing's "Money taken" counts what a return refunded, not the return's invoice total.

It also counts as "not collected" only what a sale really still owes: a sale of a till that rounds cash
owes its rounded total, so a fully paid rounded sale leaves nothing outstanding (neoffice-maintenance#2083).
"""

import unittest

import frappe

from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import _process_invoice


def _invoice(
	name, grand_total, paid_amount, is_return=0, payments=None, rounded_total=0, disable_rounded_total=0
):
	return frappe._dict(
		{
			"name": name,
			"posting_date": "2026-10-04",
			"customer": "Test Customer",
			"currency": "CHF",
			"conversion_rate": 1,
			"grand_total": grand_total,
			"base_grand_total": grand_total,
			"rounded_total": rounded_total,
			"base_rounded_total": rounded_total,
			"disable_rounded_total": disable_rounded_total,
			"net_total": grand_total,
			"base_net_total": grand_total,
			"paid_amount": paid_amount,
			"base_paid_amount": paid_amount,
			"total_qty": 1,
			"is_return": is_return,
			"return_against": "INV-SALE" if is_return else None,
			"change_amount": 0,
			"base_change_amount": 0,
			"taxes": [],
			"payments": payments or [],
		}
	)


def _summary():
	return {
		"grand_total": 0,
		"net_total": 0,
		"total_quantity": 0,
		"returns_total": 0,
		"returns_count": 0,
		"sales_total": 0,
		"sales_count": 0,
		"collected_total": 0,
		"outstanding_total": 0,
	}


class TestClosingCountsRefunds(unittest.TestCase):
	def test_a_rounded_cash_refund_counts_what_left_the_drawer(self):
		# A CHF till rounds to 0.05: a -13.41 return refunds -13.40 in cash.
		summary = _summary()
		refund = _invoice(
			"INV-RET",
			grand_total=-13.41,
			paid_amount=-13.40,
			is_return=1,
			payments=[frappe._dict({"mode_of_payment": "Cash", "amount": -13.40, "base_amount": -13.40})],
		)
		txn = _process_invoice(refund, "sales_invoice", "CHF", "Cash", [], [], summary)
		self.assertAlmostEqual(txn["collected_amount"], -13.40)
		self.assertAlmostEqual(summary["collected_total"], -13.40)
		# The invoiced side keeps the accrual figure.
		self.assertAlmostEqual(txn["grand_total"], -13.41)

	def test_money_taken_matches_the_cash_lines(self):
		# A rounded sale and its rounded refund: the drawer is back where it started.
		summary = _summary()
		sale = _invoice(
			"INV-SALE",
			grand_total=26.91,
			paid_amount=26.90,
			payments=[frappe._dict({"mode_of_payment": "Cash", "amount": 26.90, "base_amount": 26.90})],
		)
		refund = _invoice(
			"INV-RET",
			grand_total=-26.91,
			paid_amount=-26.90,
			is_return=1,
			payments=[frappe._dict({"mode_of_payment": "Cash", "amount": -26.90, "base_amount": -26.90})],
		)
		for invoice in (sale, refund):
			_process_invoice(invoice, "sales_invoice", "CHF", "Cash", [], [], summary)
		self.assertAlmostEqual(summary["collected_total"], 0)

	def test_a_fully_paid_rounded_sale_leaves_nothing_outstanding(self):
		# CHF 0.05 rounding: the customer owes and pays 17.45 for a 17.46 grand_total.
		summary = _summary()
		sale = _invoice(
			"INV-SALE",
			grand_total=17.46,
			paid_amount=17.45,
			rounded_total=17.45,
			payments=[frappe._dict({"mode_of_payment": "Cash", "amount": 17.45, "base_amount": 17.45})],
		)
		txn = _process_invoice(sale, "sales_invoice", "CHF", "Cash", [], [], summary)
		self.assertEqual(txn["outstanding_amount"], 0)
		self.assertEqual(summary["outstanding_total"], 0)
		# The invoiced side keeps the accrual figure that ties to the GL.
		self.assertAlmostEqual(txn["grand_total"], 17.46)

	def test_a_real_shortfall_is_still_counted_when_the_till_does_not_round(self):
		summary = _summary()
		sale = _invoice(
			"INV-SALE",
			grand_total=17.46,
			paid_amount=17.00,
			disable_rounded_total=1,
			payments=[frappe._dict({"mode_of_payment": "Cash", "amount": 17.00, "base_amount": 17.00})],
		)
		txn = _process_invoice(sale, "sales_invoice", "CHF", "Cash", [], [], summary)
		self.assertAlmostEqual(txn["outstanding_amount"], 0.46)
		self.assertAlmostEqual(summary["outstanding_total"], 0.46)

	def test_an_unpaid_credit_sale_owes_its_rounded_total(self):
		summary = _summary()
		sale = _invoice("INV-SALE", grand_total=17.46, paid_amount=0, rounded_total=17.45)
		txn = _process_invoice(sale, "sales_invoice", "CHF", "Cash", [], [], summary)
		self.assertAlmostEqual(txn["outstanding_amount"], 17.45)
		self.assertAlmostEqual(summary["outstanding_total"], 17.45)

	def test_a_sale_without_rounding_owes_its_grand_total(self):
		# rounded_total empty (0): the grand total is the figure owed, as before.
		summary = _summary()
		sale = _invoice("INV-SALE", grand_total=17.46, paid_amount=10.00)
		txn = _process_invoice(sale, "sales_invoice", "CHF", "Cash", [], [], summary)
		self.assertAlmostEqual(txn["outstanding_amount"], 7.46)
