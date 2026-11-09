# //// Neoffice — added file (no upstream equivalent).
"""The draft of a line under a Pricing Rule holds the figure the payment computes (neoffice-maintenance#2081).

update_invoice clears `pricing_rules` on the draft and keeps the rate the till sent, so a 999.00 item under a fixed 50.00 offer
read 949.00 on the draft, while the payment puts the rules back and ERPNext computes the rate from the percentage rounded to the
Percent field's two decimals (50.00 / 999.00 = 5.005005 % -> 5.01 %): 948.95. `_settle_offer_line_like_the_payment` gives the draft
that figure. Nothing here reads the database: the line is a stand-in with the precisions of the Sales Invoice Item.
"""

import unittest

import frappe

from pos_next.api.invoices import _settle_offer_line_like_the_payment

PRECISIONS = {"discount_percentage": 2, "rate": 2, "discount_amount": 2}


class Line(frappe._dict):
	"""A Sales Invoice Item as far as the function reads it."""

	def precision(self, fieldname):
		return PRECISIONS[fieldname]


def line(**values):
	return Line({"price_list_rate": 999, "rate": 949, "discount_percentage": 0, "discount_amount": 0, **values})


class TestAnOfferLineOfTheDraftIsTheOneThePaymentComputes(unittest.TestCase):
	def test_a_fixed_amount_that_is_no_round_percentage_gets_the_rate_of_the_rounded_percentage(self):
		item = line(rate=949, discount_percentage=50 / 999 * 100, discount_amount=50)

		_settle_offer_line_like_the_payment(item)

		# 5.005005 % is kept as 5.01 %, as ERPNext rounds it, and the rate is the list price less that percentage
		self.assertEqual(item.discount_percentage, 5.01)
		self.assertEqual(item.rate, 948.95)
		self.assertEqual(item.discount_amount, 50.05)

	def test_a_round_percentage_is_left_as_it_is(self):
		item = line(price_list_rate=50, rate=42.5, discount_percentage=15, discount_amount=7.5)

		_settle_offer_line_like_the_payment(item)

		self.assertEqual((item.discount_percentage, item.rate, item.discount_amount), (15, 42.5, 7.5))

	def test_what_the_payment_does_not_recompute_is_left_to_the_till(self):
		for values in (
			# a rate rule, or a fixed amount alone: no percentage, the payment keeps the amount
			{"price_list_rate": 50, "rate": 30, "discount_percentage": 0, "discount_amount": 20},
			# an offered line: 100 % off
			{"price_list_rate": 10, "rate": 0, "discount_percentage": 100, "discount_amount": 10},
			# no list price to take the percentage off
			{"price_list_rate": 0, "rate": 7, "discount_percentage": 12.345, "discount_amount": 0},
		):
			with self.subTest(values=values):
				item = line(**values)

				_settle_offer_line_like_the_payment(item)

				self.assertEqual(
					(item.price_list_rate, item.rate, item.discount_percentage, item.discount_amount),
					(
						values["price_list_rate"],
						values["rate"],
						values["discount_percentage"],
						values["discount_amount"],
					),
				)
