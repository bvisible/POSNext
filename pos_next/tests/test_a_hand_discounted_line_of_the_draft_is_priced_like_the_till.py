# //// Neoffice — added file (no upstream equivalent).
"""The draft of a table holds the rate the till shows for a line discounted by hand (neoffice-maintenance#2076).

« Valider » sends the cart line as it is: `rate` is the LIST price, the discount stays in `discount_percentage` (a fixed amount comes as the percentage it makes) and in
`amount`; the payment sends the discounted rate. With no pricing rule ERPNext keeps the rate it is given, so the draft of a table read 9.00 for a line the till showed at
8.10 (measured on osiris on 09.11.2026): the tile's total, the closing's settlement, the kitchen ticket and the table read back (the cart is rebuilt from the rate alone) all lost
the discount. `_price_a_hand_discounted_line_like_the_till` gives a line at its list price the rate the till computes; a line already discounted is left as it came.

The suite pins the rule on stand-in lines (no database), then through the till's save (`update_invoice`) of a table's order: the rate the draft holds, what the tile, the closing's
settlement and the table read back say of it, a second « Valider » that never takes the discount twice, the payment's shape that is left alone, and an offered line that stays at 0.
The people it acts as are the waiter (the cashier of the till): never Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

import unittest

import frappe
from frappe.utils import flt

from pos_next.api import restaurant as restaurant_api
from pos_next.api.invoices import _price_a_hand_discounted_line_like_the_till
from pos_next.restaurant import settlement
from pos_next.tests.test_the_notes_of_a_table import NotesCase

PRECISIONS = {"rate": 2, "discount_amount": 2, "discount_percentage": 2}


class Line(frappe._dict):
	"""A Sales Invoice Item as far as the function reads it."""

	def precision(self, fieldname):
		return PRECISIONS[fieldname]


def line(**values):
	return Line(
		{"price_list_rate": 9.5, "rate": 9.5, "discount_percentage": 0, "discount_amount": 0, **values}
	)


class TestTheRule(unittest.TestCase):
	def test_a_line_at_its_list_price_with_a_percentage_gets_the_discounted_rate(self):
		item = line(discount_percentage=10)

		_price_a_hand_discounted_line_like_the_till(item)

		self.assertEqual((item.rate, item.discount_amount), (8.55, 0.95))
		# The list price and the percentage are what the till sent
		self.assertEqual((item.price_list_rate, item.discount_percentage), (9.5, 10))

	def test_a_fixed_amount_comes_as_the_percentage_it_makes_and_is_not_rounded(self):
		# 1.00 off 4.20 is 23.809523809523807 % in the till's payload; rounded to two decimals it would read 3.19
		item = line(price_list_rate=4.2, rate=4.2, discount_percentage=1 / 4.2 * 100, discount_amount=1)

		_price_a_hand_discounted_line_like_the_till(item)

		self.assertEqual((item.rate, item.discount_amount), (3.2, 1.0))

	def test_a_line_already_discounted_is_left_as_it_came_so_that_a_discount_is_never_taken_twice(self):
		# The payment's shape, or a table read back and saved again: the rate is below the list price
		item = line(rate=8.55, discount_percentage=10, discount_amount=0.95)

		_price_a_hand_discounted_line_like_the_till(item)

		self.assertEqual((item.rate, item.discount_percentage, item.discount_amount), (8.55, 10, 0.95))

	def test_it_is_the_same_whatever_the_number_of_times_it_is_applied(self):
		item = line(discount_percentage=10)

		_price_a_hand_discounted_line_like_the_till(item)
		_price_a_hand_discounted_line_like_the_till(item)

		self.assertEqual(item.rate, 8.55)

	def test_what_is_no_discount_is_left_alone(self):
		for values in (
			# nothing taken off
			{"discount_percentage": 0},
			# an offered line: 100 % off is ERPNext's (the rate is 0 already)
			{"discount_percentage": 100, "rate": 0, "discount_amount": 9.5},
			# a percentage nobody can take off
			{"discount_percentage": 120},
			{"discount_percentage": -5},
			# no list price to take the percentage off
			{"price_list_rate": 0, "rate": 0, "discount_percentage": 10},
		):
			with self.subTest(values=values):
				item = line(**values)
				before = (item.rate, item.discount_percentage, item.discount_amount)

				_price_a_hand_discounted_line_like_the_till(item)

				self.assertEqual((item.rate, item.discount_percentage, item.discount_amount), before)


class TestTheDraftOfATable(NotesCase):
	def discounted(self, **more):
		"""A soup the way « Valider » sends it: at its list price, 10 % off, the discounted amount beside."""
		return self.line(
			self.soup,
			rate=10,
			price_list_rate=10,
			discount_percentage=10,
			discount_amount=1.0,
			amount=9.0,
			**more,
		)

	def rows(self, order):
		return frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order},
			fields=[
				"item_code",
				"rate",
				"price_list_rate",
				"discount_percentage",
				"discount_amount",
				"amount",
			],
			order_by="idx asc",
		)

	def total_of(self, order):
		return frappe.db.get_value("Sales Invoice", order, "grand_total")

	def test_the_draft_holds_the_discounted_rate_not_the_list_price(self):
		order = self.save([self.discounted()])

		(row,) = self.rows(order)

		self.assertEqual((row.rate, row.price_list_rate, row.amount), (9.0, 10, 9.0))
		self.assertEqual((row.discount_percentage, row.discount_amount), (10, 1.0))

	def test_it_is_the_draft_the_payment_shape_makes(self):
		# The same line sent the way the payment sends it, at its discounted rate, on the other table
		validated = self.save([self.discounted()])
		paid_shape = self.save(
			[self.line(self.soup, rate=9, price_list_rate=10, discount_percentage=10, discount_amount=1.0)],
			restaurant_table=self.table_a2,
		)

		self.assertEqual(self.rows(validated), self.rows(paid_shape))
		self.assertEqual(self.total_of(validated), self.total_of(paid_shape))

	def test_the_tile_the_closings_settlement_and_the_table_read_back_say_the_discounted_total(self):
		order = self.save([self.discounted()])
		total = self.total_of(order)

		self.assertEqual(flt(self.floor()[self.table_a]["order_summary"]["grand_total"]), flt(total))
		self.assertEqual(flt(settlement._owed(frappe.get_doc("Sales Invoice", order))), flt(total))
		with self.waiter():
			read_back = restaurant_api.get_table_order(self.table_a)
		(row,) = read_back["items"]
		self.assertEqual(row["rate"], 9.0)
		# ... and the cheque it is paid at is below the list price's
		self.assertLess(
			total, self.total_of(self.save([self.line(self.soup)], restaurant_table=self.table_a2))
		)

	def test_a_second_validate_never_takes_the_discount_twice(self):
		order = self.save([self.discounted()])

		# The cart is still the cart: the line comes again at its list price, with a salad added
		self.save([self.discounted(), self.line(self.salad)], name=order)

		soup, salad = self.rows(order)
		self.assertEqual((soup.rate, soup.amount), (9.0, 9.0))
		self.assertEqual((salad.rate, salad.amount), (10, 10))

	def test_the_table_read_back_and_saved_again_keeps_its_rate(self):
		order = self.save([self.discounted()])
		with self.waiter():
			(row,) = restaurant_api.get_table_order(self.table_a)["items"]

		# The cart rebuilt from the server holds the rate alone: no percentage, the list price is the rate
		self.save([self.line(self.soup, rate=row["rate"], price_list_rate=row["rate"])], name=order)

		(saved,) = self.rows(order)
		self.assertEqual((saved.rate, saved.amount), (9.0, 9.0))

	def test_an_offered_line_stays_at_nothing(self):
		order = self.save(
			[
				self.line(
					self.soup,
					rate=10,
					price_list_rate=10,
					discount_percentage=100,
					discount_amount=10,
					amount=0,
				)
			]
		)

		(row,) = self.rows(order)

		self.assertEqual((row.rate, row.amount), (0, 0))

	def test_a_line_with_no_discount_is_saved_as_ever(self):
		order = self.save([self.line(self.soup)])

		(row,) = self.rows(order)

		self.assertEqual((row.rate, row.price_list_rate, row.discount_percentage), (10, 10, 0))
