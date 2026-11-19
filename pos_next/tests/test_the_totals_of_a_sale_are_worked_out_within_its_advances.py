# //// Neoffice — added file (no upstream equivalent).
"""The totals of a sale that carries advance rows (NeoSalon, voie 4, 19.11.2026): the down payment of an appointment, paid online, is an advance of the invoice.

A sale at the till can shrink under what was paid ahead (a line taken off, a discount); ERPNext's totals then refuse the advance and the sale could not be saved (the tester saw the
417 at the till). The advance rows are taken at nothing while the totals are worked out and given back in their order at what the sale is worth, never more. A stand-in of the invoice
refuses an advance bigger than the sale, as ERPNext does (no database):

- a sale worth less than its advance takes what it is worth, and the totals are those of the sale with that advance on it;
- two advances are given back in their order, the second getting what the first left;
- a sale worth more than its advances keeps them whole; a sale with no advance has its totals worked out once, as before.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api.invoices import _work_the_totals_out_within_the_advances


class Row(frappe._dict):
	def precision(self, _field):
		return 2


class Sale(frappe._dict):
	"""An invoice worth `worth` with advance rows; its totals are refused when the advances exceed it, as ERPNext's are."""

	def calculate_taxes_and_totals(self):
		self.calls = self.get("calls", 0) + 1
		taken = sum(row.allocated_amount for row in self.advances)
		if taken > self.worth:
			raise frappe.ValidationError(f"Advance amount cannot be greater than {self.worth}")
		self.grand_total = self.worth
		self.rounded_total = self.worth
		self.total_advance = taken
		self.outstanding_amount = self.worth - taken


def a_sale(worth, *advances):
	return Sale(worth=worth, advances=[Row(allocated_amount=amount) for amount in advances])


class TestTheTotalsOfASaleAreWorkedOutWithinItsAdvances(FrappeTestCase):
	def test_a_sale_worth_less_than_its_advance_takes_what_it_is_worth(self):
		sale = a_sale(20, 30)

		_work_the_totals_out_within_the_advances(sale)

		self.assertEqual([row.allocated_amount for row in sale.advances], [20])
		self.assertEqual((sale.total_advance, sale.outstanding_amount), (20, 0))

	def test_two_advances_are_given_back_in_their_order_each_getting_what_the_other_left(self):
		sale = a_sale(20, 15, 10)

		_work_the_totals_out_within_the_advances(sale)

		self.assertEqual([row.allocated_amount for row in sale.advances], [15, 5])
		self.assertEqual(sale.total_advance, 20)

	def test_a_sale_worth_more_than_its_advances_keeps_them_whole(self):
		sale = a_sale(100, 30)

		_work_the_totals_out_within_the_advances(sale)

		self.assertEqual([row.allocated_amount for row in sale.advances], [30])
		self.assertEqual((sale.total_advance, sale.outstanding_amount), (30, 70))

	def test_a_sale_with_no_advance_has_its_totals_worked_out_once_as_before(self):
		sale = a_sale(100)

		_work_the_totals_out_within_the_advances(sale)

		self.assertEqual(sale.calls, 1)
		self.assertEqual(sale.grand_total, 100)

	def test_an_advance_row_that_takes_nothing_is_left_alone(self):
		sale = a_sale(20, 0)

		_work_the_totals_out_within_the_advances(sale)

		self.assertEqual([row.allocated_amount for row in sale.advances], [0])
