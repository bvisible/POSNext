# //// Neoffice — added file (no upstream equivalent).
"""A POS sale that an advance of the invoice covers (the down payment of an appointment, paid online; NeoSalon, voie 4, 19.11.2026) has nothing to collect at the till.

ERPNext still wants a mode of payment on a POS invoice at submit, so the till gives it one line of the profile's default mode, of nothing. This proves, with a stand-in of the
invoice (no database), when the line is added and when it never is:

- that a POS sale with an advance row that takes something and no payment line of its own gets exactly one line, of the default mode of its profile, for 0;
- that the first mode serves when none is marked default, and that a profile with no mode adds nothing (the sale is then refused as before);
- that a sale with payment lines, with no advance (or an advance that takes nothing), that is not a POS sale, or a return, is left exactly as it is.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api.invoices import _a_line_for_a_sale_its_advances_cover


class Invoice(frappe._dict):
	"""The few things of an invoice the helper reads and writes."""

	def append(self, table, row):
		self.setdefault(table, []).append(frappe._dict(row))


def the_sale(**more):
	values = {
		"is_pos": 1,
		"is_return": 0,
		"pos_profile": "Till 1",
		"payments": [],
		"advances": [frappe._dict(allocated_amount=30)],
	}
	values.update(more)
	return Invoice(values)


def a_profile(*modes):
	return frappe._dict(
		payments=[frappe._dict(mode_of_payment=name, default=default) for name, default in modes]
	)


class TestASaleItsAdvancesCoverGetsALineOfNothing(FrappeTestCase):
	def run_it(self, sale, profile=None):
		with patch("frappe.get_cached_doc", return_value=profile or a_profile(("Cash", 0), ("Card", 1))):
			_a_line_for_a_sale_its_advances_cover(sale)
		return sale

	def test_a_sale_covered_by_an_advance_with_no_line_of_its_own_gets_one_of_the_default_mode_for_nothing(
		self,
	):
		sale = self.run_it(the_sale())

		self.assertEqual([(row.mode_of_payment, row.amount) for row in sale.payments], [("Card", 0)])

	def test_the_first_mode_serves_when_none_is_the_default_and_a_profile_without_a_mode_adds_nothing(self):
		first = self.run_it(the_sale(), a_profile(("Cash", 0), ("Card", 0)))
		self.assertEqual([row.mode_of_payment for row in first.payments], ["Cash"])

		none = self.run_it(the_sale(), a_profile())
		self.assertEqual(none.payments, [])

	def test_a_sale_with_lines_of_its_own_is_left_as_it_is(self):
		line = frappe._dict(mode_of_payment="Cash", amount=70)

		sale = self.run_it(the_sale(payments=[line]))

		self.assertEqual(sale.payments, [line])

	def test_a_sale_with_no_advance_or_an_advance_that_takes_nothing_gets_no_line(self):
		for advances in ([], [frappe._dict(allocated_amount=0)]):
			with self.subTest(advances=advances):
				self.assertEqual(self.run_it(the_sale(advances=advances)).payments, [])

	def test_a_return_and_a_sale_that_is_not_a_pos_sale_are_left_alone(self):
		for more in ({"is_return": 1}, {"is_pos": 0}):
			with self.subTest(more=more):
				self.assertEqual(self.run_it(the_sale(**more)).payments, [])

	def test_the_profile_of_the_till_is_read_when_the_sale_names_none(self):
		sale = the_sale(pos_profile=None)
		with patch("frappe.get_cached_doc", return_value=a_profile(("Card", 1))) as read:
			_a_line_for_a_sale_its_advances_cover(sale, "Till 2")

		read.assert_called_once_with("POS Profile", "Till 2")
		self.assertEqual([row.mode_of_payment for row in sale.payments], ["Card"])
