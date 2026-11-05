# //// Neoffice — added file (no upstream equivalent).
"""What a save ADDS to an order the kitchen already has (NeoResto lot 1; product owner, 05.11.2026).

« Il faut faire un pop-up, parce qu'autrement, en cuisine, ils ne savent pas qu'on a rajouté cette information sur leur ticket, et il faut
imprimer le ticket avec l'ajout. » The printer's ticket is headed « Addition » for the dishes the order holds MORE of and the kitchen holds more of
than before the save: not a line held back by the waiter (more of the order, nothing for the kitchen), and not the next course the waiter orders
(more for the kitchen, nothing more on the order). Read without a site: the rule takes the order's lines before and after.
"""

import unittest

from pos_next.restaurant.service_families import added_dishes


def line(code, qty, status):
	return {"item_code": code, "qty": qty, "kds_status": status}


SOUP = line("SOUP", 1, "Delivered")
STEAK = line("STEAK", 1, "Preparing")


class TestWhatASaveAddsToASentOrder(unittest.TestCase):
	def test_a_first_send_adds_nothing(self):
		self.assertEqual(added_dishes([], [line("SOUP", 1, "Pending"), line("STEAK", 1, "Pending")]), {})
		# Lines stored but none at the kitchen yet
		self.assertEqual(added_dishes([line("SOUP", 1, ""), line("STEAK", 1, "Waiting")], [line("SOUP", 1, "Pending")]), {})

	def test_a_starter_ordered_after_the_mains_were_sent_is_an_addition(self):
		after = [SOUP, STEAK, line("TARTARE", 1, "Pending")]

		self.assertEqual(added_dishes([SOUP, STEAK], after), {"TARTARE": 1})

	def test_more_of_a_dish_the_kitchen_already_had_is_an_addition_of_the_extra_units(self):
		after = [SOUP, STEAK, line("STEAK", 2, "Pending")]

		self.assertEqual(added_dishes([SOUP, STEAK], after), {"STEAK": 2})

	def test_a_dish_added_and_held_back_by_the_waiter_is_no_addition_for_the_kitchen(self):
		after = [SOUP, STEAK, line("TART", 1, "Waiting")]

		self.assertEqual(added_dishes([SOUP, STEAK], after), {})

	def test_the_next_course_the_waiter_orders_is_no_addition(self):
		before = [SOUP, STEAK, line("TART", 1, "Waiting")]
		after = [SOUP, STEAK, line("TART", 1, "Pending")]

		self.assertEqual(added_dishes(before, after), {})

	def test_a_dish_taken_off_or_lowered_is_no_addition(self):
		self.assertEqual(added_dishes([SOUP, STEAK], [SOUP]), {})
		self.assertEqual(added_dishes([line("STEAK", 3, "Preparing")], [line("STEAK", 2, "Preparing")]), {})

	def test_several_dishes_are_told_each_with_its_units(self):
		after = [SOUP, STEAK, line("TARTARE", 1, "Pending"), line("BEER", 2, "Pending")]

		self.assertEqual(added_dishes([SOUP, STEAK], after), {"TARTARE": 1, "BEER": 2})

	def test_a_save_that_changes_nothing_adds_nothing(self):
		self.assertEqual(added_dishes([SOUP, STEAK], [SOUP, STEAK]), {})

	def test_a_line_with_no_dish_code_counts_for_nothing(self):
		after = [SOUP, STEAK, {"item_code": "", "qty": 1, "kds_status": "Pending"}, {"qty": 1, "kds_status": "Pending"}]

		self.assertEqual(added_dishes([SOUP, STEAK], after), {})


if __name__ == "__main__":
	unittest.main()
