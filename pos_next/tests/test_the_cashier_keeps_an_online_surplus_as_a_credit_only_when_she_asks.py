# //// Neoffice — added file (no upstream equivalent).
"""What the cashier chose for what the customer paid online beyond the sale (NeoSalon, voie 4, 19.11.2026): it goes back on her card unless she asked to keep it as a credit.

The till sends its choice with the sale; this reads it, from the top of the payload or from the invoice, and a missing or odd value is « not asked »: the site then gives the
money back on the card, and never in cash.
"""

from frappe.tests.utils import FrappeTestCase

from pos_next.api.invoices import _keeps_the_online_surplus_as_a_credit


class TestTheCashierKeepsAnOnlineSurplusAsACreditOnlyWhenSheAsks(FrappeTestCase):
	def test_she_asked_at_the_top_of_the_payload_or_on_the_invoice(self):
		self.assertTrue(_keeps_the_online_surplus_as_a_credit({"keep_online_surplus_as_credit": 1}, {}))
		self.assertTrue(_keeps_the_online_surplus_as_a_credit({}, {"keep_online_surplus_as_credit": "1"}))
		self.assertTrue(_keeps_the_online_surplus_as_a_credit({"keep_online_surplus_as_credit": True}, None))

	def test_she_did_not_ask_when_it_is_zero_missing_or_odd(self):
		for data, invoice in (
			({"keep_online_surplus_as_credit": 0}, {}),
			({"keep_online_surplus_as_credit": "0"}, {"keep_online_surplus_as_credit": 0}),
			({}, {}),
			(None, None),
			({"keep_online_surplus_as_credit": ""}, {}),
		):
			with self.subTest(data=data, invoice=invoice):
				self.assertFalse(_keeps_the_online_surplus_as_a_credit(data, invoice))
