# //// Neoffice — added file (no upstream equivalent).
"""The rule of the covers of a table (NeoResto lot 1, covers): how many people are seated, and the portions of each course.

The number of people is kept on the table's order. The kitchen's screens and ticket read it next to the portions the whole order
holds of each food course, so that « Mains 2/3 » can be shown (three people, two mains so far). This suite pins the pure part
of it, `pos_next.restaurant.covers`:

- `clean_covers`: the one validator of a number of people (a whole number from 0 to 99; 0 or nothing means none);
- `family_counts`: the portions per course (the food courses only, the tip's line and the lines of no quantity left out);
- `asks_on_open`: the restaurant's choice of asking the question when a table is first opened (on unless it says no).

The suite reads nothing from the database and writes nothing.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import covers

TIP = "_Test Covers Tip"


def line(family, qty=1, item="_Test Covers Dish", **more):
	return {"item_code": item, "service_family": family, "qty": qty, **more}


class TestTheNumberOfPeople(FrappeTestCase):
	def test_a_whole_number_from_one_to_ninety_nine_is_kept(self):
		for value in (1, 3, 12, 99, "1", "99", " 7 ", "+4", 3.0):
			with self.subTest(value=value):
				self.assertEqual(covers.clean_covers(value), int(float(str(value).strip())))

	def test_nothing_and_zero_mean_no_number(self):
		for value in (None, "", "   ", 0, "0", "00", 0.0, "-0"):
			with self.subTest(value=value):
				self.assertIsNone(covers.clean_covers(value))

	def test_what_is_no_whole_number_from_zero_to_ninety_nine_is_refused(self):
		for value in (
			-1,
			"-1",
			100,
			"100",
			1000,
			2.5,
			"2.5",
			"abc",
			"3 people",
			"1e1",
			"٣",
			True,
			False,
			[3],
			{"covers": 3},
		):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				covers.clean_covers(value)

	def test_a_number_too_long_to_be_read_is_refused_and_not_turned_into_a_huge_integer(self):
		for value in ("9" * 5000, "1" * 7, 10**30, float("inf"), float("nan"), 1e300):
			with self.subTest(value=str(value)[:12]), self.assertRaises(frappe.ValidationError):
				covers.clean_covers(value)

	def test_the_most_people_a_table_can_hold_is_ninety_nine(self):
		self.assertEqual(covers.MAX_COVERS, 99)

	def test_the_refusal_says_the_range(self):
		with self.assertRaises(frappe.ValidationError) as refused:
			covers.clean_covers(100)

		self.assertIn("99", str(refused.exception))


class TestThePortionsOfEachCourse(FrappeTestCase):
	def test_the_portions_of_each_food_course_are_added_up(self):
		lines = [line("Starter", 2), line("Starter", 1), line("Main", 3), line("Dessert", 1)]

		self.assertEqual(covers.family_counts(lines), {"Starter": 3, "Main": 3, "Dessert": 1})

	def test_only_the_courses_that_have_lines_are_told(self):
		self.assertEqual(covers.family_counts([line("Main", 2)]), {"Main": 2})
		self.assertEqual(covers.family_counts([]), {})
		self.assertEqual(covers.family_counts(None), {})

	def test_the_courses_come_in_the_order_of_the_meal(self):
		lines = [line("Dessert"), line("Main"), line("Starter")]

		self.assertEqual(list(covers.family_counts(lines)), ["Starter", "Main", "Dessert"])

	def test_a_drink_follows_no_course_and_is_not_counted(self):
		lines = [line("Drink", 4), line("Main", 1)]

		self.assertEqual(covers.family_counts(lines), {"Main": 1})
		self.assertEqual(covers.family_counts([line("Drink", 4)]), {})

	def test_a_line_of_no_family_or_of_a_family_nobody_knows_is_not_counted(self):
		lines = [
			line(""),
			line(None),
			line("Cheese", 2),
			{"item_code": "_Test Covers Gum", "qty": 3},
			line("Main"),
		]

		self.assertEqual(covers.family_counts(lines), {"Main": 1})

	def test_the_tip_is_no_dish_and_is_not_counted(self):
		lines = [line("Dessert", 1, item=TIP), line("Dessert", 1)]

		self.assertEqual(covers.family_counts(lines, TIP), {"Dessert": 1})
		self.assertEqual(
			covers.family_counts(lines), {"Dessert": 2}, "without a tip item named, every line is a dish"
		)
		self.assertEqual(covers.family_counts(lines, None), {"Dessert": 2})

	def test_a_line_of_no_quantity_is_not_counted(self):
		lines = [line("Main", 0), line("Main", None), line("Main", -1), line("Main", 2)]

		self.assertEqual(covers.family_counts(lines), {"Main": 2})

	def test_a_whole_quantity_is_told_as_a_whole_number_and_a_fraction_as_it_is(self):
		whole = covers.family_counts([line("Main", 2.0), line("Main", 1.0)])
		half = covers.family_counts([line("Starter", 0.5), line("Starter", 1)])

		self.assertEqual(whole, {"Main": 3})
		self.assertIsInstance(whole["Main"], int)
		self.assertEqual(half, {"Starter": 1.5})

	def test_every_line_counts_whatever_its_status_at_the_kitchen(self):
		"""The count is the order's: a dish held back, cooking or delivered is a portion of the meal alike (a line has no cancelled status)."""
		lines = [
			line("Main", 1, kds_status="Waiting"),
			line("Main", 1, kds_status="Pending"),
			line("Main", 1, kds_status="Preparing"),
			line("Main", 1, kds_status="Ready"),
			line("Main", 1, kds_status="Delivered"),
			line("Main", 1, kds_status=""),
		]

		self.assertEqual(covers.family_counts(lines), {"Main": 6})

	def test_a_row_with_nothing_in_it_is_skipped(self):
		self.assertEqual(covers.family_counts([None, {}, line("Main")]), {"Main": 1})


class TestWhetherTheTillAsks(FrappeTestCase):
	def test_it_asks_unless_the_restaurant_says_no(self):
		for settings, asks in (
			({}, 1),
			(None, 1),
			({"ask_covers_on_open": None}, 1),
			({"ask_covers_on_open": 1}, 1),
			({"ask_covers_on_open": "1"}, 1),
			({"ask_covers_on_open": True}, 1),
			({"ask_covers_on_open": 0}, 0),
			({"ask_covers_on_open": "0"}, 0),
			({"ask_covers_on_open": False}, 0),
		):
			with self.subTest(settings=settings):
				self.assertEqual(covers.asks_on_open(settings), asks)
