# //// Neoffice — added file (no upstream equivalent).
"""The kitchen's and the runner's lists tell each dish its service family and its category color (NeoResto lot 1, Daniel's
request of 01.11: « séparer entrée, plat, dessert » on the tickets, and « une couleur de fond pour les catégories »).

`get_kds_orders` and `get_runner_orders` return on every line:

- `service_family`: the family the line was stored with (the waiter may have given one line another), else the family its
  item's group gives, `""` when it has none;
- `service_color`: the color of the line's Item Group, or of the nearest ancestor group that has one, `""` when none. Only a
  strict `#RRGGBB` is ever returned: the value is user data and the screens put it in a style, so a value of any other shape
  is treated as no color at all (and the walk up the tree goes on to the ancestor's).

The colors of a whole call come from ONE read of the Item Group tree, whatever the number of lines.

The suite builds everything it needs (the menu of `test_service_families`, a restaurant, a table, a till) and rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import service_families
from pos_next.tests import test_service_families as menu
from pos_next.tests.test_service_families import ServiceCase

DRINKS_COLOR = "#CFE8FF"
STARTERS_COLOR = "#D8F0D0"
KITCHEN_COLOR = "#FFE9C7"
CAKES_COLOR = "#F7D9E6"
BAD_COLORS = [
	"red",
	"#FFF",
	"#12345",
	"#1234567",
	"#GGGGGG",
	"rgb(1, 2, 3)",
	"#CFE8FF;background:url(x)",
	"#CFE8FF\n",
	" #CFE8FF",
	"javascript:alert(1)",
	"#CFE8FF\"><script>",
]


def paint(group, color):
	frappe.db.set_value("Item Group", group, "service_color", color, update_modified=False)


def tagged(lines):
	"""The lines of a ticket by the name of their item, the prefix of the test menu left off."""
	return {line["item_code"].replace("_Test SF ", ""): line for line in lines}


class PaintedMenu(ServiceCase):
	"""A table's order of a drink, a starter, a main and a dessert, as the till saves it; the groups painted."""

	def setUp(self):
		super().setUp()
		self.table_a2 = self.make_table(self.a, self.room_a, table_name="T2")
		paint(menu.DRINKS, DRINKS_COLOR)
		paint(menu.STARTERS, STARTERS_COLOR)
		paint(menu.KITCHEN, KITCHEN_COLOR)
		paint(menu.CAKES, CAKES_COLOR)

	def an_order(self, items=None, **changes):
		items = items or [self.cola, self.soup, self.penne, self.tart, self.gum]
		return self.save([self.line(item) for item in items], **changes)

	def make_everything_ready(self, order):
		"""Every line of the order at the pass: the runner lists it."""
		for row in frappe.get_all("Sales Invoice Item", filters={"parent": order}, pluck="name"):
			frappe.db.set_value(
				"Sales Invoice Item", row, {"preparation_station": self.station_a, "kds_status": "Ready"}
			)

	def kitchen_lines(self, order):
		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		return tagged(orders[order]["items"])

	def runner_lines(self, order):
		self.make_everything_ready(order)
		orders = {o["name"]: o for o in restaurant_api.get_runner_orders(restaurant=self.a)}
		return tagged(orders[order]["items"])

	def statements_about(self, table, call):
		"""The SQL statements `call` sends that read the given table."""
		sent = []
		real = frappe.db.sql

		def spy(query, *args, **kwargs):
			sent.append(str(query))
			return real(query, *args, **kwargs)

		with patch.object(frappe.db, "sql", side_effect=spy):
			call()
		return [query for query in sent if f"`tab{table}`" in query]


class TestTheColorOfAGroup(PaintedMenu):
	def test_the_item_group_has_a_color_field(self):
		field = frappe.get_meta("Item Group").get_field("service_color")

		self.assertEqual(field.fieldtype, "Color")
		self.assertFalse(field.reqd, "the color is optional")

	def test_a_group_with_a_color_has_it(self):
		self.assertEqual(service_families.color_of_group(menu.DRINKS), DRINKS_COLOR)

	def test_a_sub_group_with_none_takes_the_nearest_one_up_the_tree(self):
		# Pasta sits in the Kitchen; Tarts in Cakes, which sits in the Kitchen too
		self.assertEqual(service_families.color_of_group(menu.PASTA), KITCHEN_COLOR)
		self.assertEqual(service_families.color_of_group(menu.TARTS), CAKES_COLOR)

	def test_the_nearest_color_wins_over_the_parents(self):
		self.assertEqual(service_families.color_of_group(menu.STARTERS), STARTERS_COLOR)
		self.assertEqual(service_families.color_of_group(menu.KITCHEN), KITCHEN_COLOR)

	def test_a_group_with_no_color_anywhere_up_the_tree_has_none(self):
		self.assertEqual(service_families.color_of_group(menu.SHOP), "")
		self.assertEqual(service_families.color_of_group(menu.MENU), "")
		self.assertEqual(service_families.color_of_group(None), "")
		self.assertEqual(service_families.color_of_group("_Test SF No Such Group"), "")

	def test_the_map_holds_the_resolved_color_of_every_group_that_has_one(self):
		colors = service_families.group_colors()

		self.assertEqual(colors[menu.DRINKS], DRINKS_COLOR)
		self.assertEqual(colors[menu.PASTA], KITCHEN_COLOR)
		self.assertNotIn(menu.SHOP, colors)

	def test_a_value_that_is_no_color_is_not_taken_for_one(self):
		for bad in BAD_COLORS:
			with self.subTest(color=bad):
				paint(menu.SHOP, bad)

				self.assertEqual(service_families.color_of_group(menu.SHOP), "")
				self.assertNotIn(menu.SHOP, service_families.group_colors())

	def test_a_value_that_is_no_color_is_walked_past_to_the_parents(self):
		for bad in BAD_COLORS:
			with self.subTest(color=bad):
				paint(menu.STARTERS, bad)

				self.assertEqual(service_families.color_of_group(menu.STARTERS), KITCHEN_COLOR)

	def test_the_case_of_the_digits_is_kept(self):
		paint(menu.SHOP, "#aBc012")

		self.assertEqual(service_families.color_of_group(menu.SHOP), "#aBc012")


class TestTheKitchenListTellsTheFamily(PaintedMenu):
	def test_each_line_carries_the_family_it_was_stored_with(self):
		lines = self.kitchen_lines(self.an_order())

		self.assertEqual(
			{item: line["service_family"] for item, line in lines.items()},
			{"Cola": "Drink", "Soup": "Starter", "Penne": "Main", "Tart": "Dessert", "Gum": ""},
		)

	def test_a_family_the_waiter_gave_to_one_line_is_kept(self):
		# « une entrée prise en plat »: the soup was ordered as a main, whatever its group says
		order = self.an_order()
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": order, "item_code": self.soup}, "service_family", "Main"
		)

		self.assertEqual(self.kitchen_lines(order)["Soup"]["service_family"], "Main")

	def test_an_old_line_with_no_family_takes_that_of_its_items_group(self):
		order = self.an_order()
		frappe.db.set_value("Sales Invoice Item", {"parent": order}, "service_family", "")

		lines = self.kitchen_lines(order)

		self.assertEqual(
			{item: line["service_family"] for item, line in lines.items()},
			{"Cola": "Drink", "Soup": "Starter", "Penne": "Main", "Tart": "Dessert", "Gum": ""},
		)

	def test_a_stored_value_that_is_no_family_is_not_taken_for_one(self):
		order = self.an_order()
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": order, "item_code": self.soup}, "service_family", "Cheese"
		)

		self.assertEqual(self.kitchen_lines(order)["Soup"]["service_family"], "Starter")

	def test_a_site_that_sets_no_family_tells_none(self):
		for group in (menu.DRINKS, menu.KITCHEN, menu.STARTERS, menu.CAKES):
			frappe.db.set_value("Item Group", group, "service_family", "")
		order = self.an_order()

		lines = self.kitchen_lines(order)

		self.assertEqual({line["service_family"] for line in lines.values()}, {""})


class TestTheKitchenListTellsTheColor(PaintedMenu):
	def test_each_line_carries_the_color_of_its_group(self):
		lines = self.kitchen_lines(self.an_order())

		self.assertEqual(lines["Cola"]["service_color"], DRINKS_COLOR)
		self.assertEqual(lines["Soup"]["service_color"], STARTERS_COLOR)

	def test_a_line_of_a_sub_group_with_none_takes_the_nearest_ancestor_that_has_one(self):
		lines = self.kitchen_lines(self.an_order())

		self.assertEqual(lines["Penne"]["service_color"], KITCHEN_COLOR)
		self.assertEqual(lines["Tart"]["service_color"], CAKES_COLOR)

	def test_a_line_of_a_group_with_no_color_anywhere_has_none(self):
		lines = self.kitchen_lines(self.an_order())

		self.assertEqual(lines["Gum"]["service_color"], "")

	def test_the_color_is_the_items_group_even_when_the_family_is_the_waiters(self):
		order = self.an_order()
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": order, "item_code": self.soup}, "service_family", "Main"
		)

		soup = self.kitchen_lines(order)["Soup"]

		self.assertEqual((soup["service_family"], soup["service_color"]), ("Main", STARTERS_COLOR))

	def test_a_value_that_is_no_color_is_never_returned(self):
		order = self.an_order()
		for bad in BAD_COLORS:
			with self.subTest(color=bad):
				paint(menu.DRINKS, bad)

				self.assertEqual(self.kitchen_lines(order)["Cola"]["service_color"], "")

	def test_a_value_that_is_no_color_leaves_the_parents_color_to_its_lines(self):
		order = self.an_order()
		paint(menu.STARTERS, "red")

		self.assertEqual(self.kitchen_lines(order)["Soup"]["service_color"], KITCHEN_COLOR)

	def test_a_site_not_migrated_yet_tells_no_color_and_still_answers(self):
		order = self.an_order()
		has_column = frappe.db.has_column

		def without_the_color(doctype, column):
			if (doctype, column) == ("Item Group", "service_color"):
				return False
			return has_column(doctype, column)

		with patch.object(frappe.db, "has_column", side_effect=without_the_color):
			lines = self.kitchen_lines(order)

		self.assertEqual({line["service_color"] for line in lines.values()}, {""})
		self.assertEqual(lines["Soup"]["service_family"], "Starter")

	def test_the_groups_are_read_once_whatever_the_number_of_lines(self):
		two = self.an_order([self.cola, self.soup])
		many = self.an_order(
			[
				self.cola,
				self.soup,
				self.salad,
				self.penne,
				self.steak,
				self.tart,
				self.gum,
				self.cola,
				self.soup,
			],
			restaurant_table=self.table_a2,
		)

		reads = self.statements_about("Item Group", lambda: restaurant_api.get_kds_orders(restaurant=self.a))

		self.assertEqual(len(reads), 1, reads)
		self.assertTrue({two, many} <= {o["name"] for o in restaurant_api.get_kds_orders(restaurant=self.a)})


class TestTheRunnerListTellsTheFamilyAndTheColor(PaintedMenu):
	def test_each_line_carries_its_family_and_its_color(self):
		lines = self.runner_lines(self.an_order())

		self.assertEqual(
			{item: (line["service_family"], line["service_color"]) for item, line in lines.items()},
			{
				"Cola": ("Drink", DRINKS_COLOR),
				"Soup": ("Starter", STARTERS_COLOR),
				"Penne": ("Main", KITCHEN_COLOR),
				"Tart": ("Dessert", CAKES_COLOR),
				"Gum": ("", ""),
			},
		)

	def test_a_family_the_waiter_gave_to_one_line_is_kept(self):
		order = self.an_order()
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": order, "item_code": self.tart}, "service_family", "Main"
		)

		self.assertEqual(self.runner_lines(order)["Tart"]["service_family"], "Main")

	def test_an_old_line_with_no_family_takes_that_of_its_items_group(self):
		order = self.an_order()
		frappe.db.set_value("Sales Invoice Item", {"parent": order}, "service_family", "")

		lines = self.runner_lines(order)

		self.assertEqual(lines["Soup"]["service_family"], "Starter")
		self.assertEqual(lines["Gum"]["service_family"], "")

	def test_a_value_that_is_no_color_is_never_returned(self):
		order = self.an_order()
		self.make_everything_ready(order)
		for bad in BAD_COLORS:
			with self.subTest(color=bad):
				paint(menu.DRINKS, bad)
				orders = {o["name"]: o for o in restaurant_api.get_runner_orders(restaurant=self.a)}

				self.assertEqual(tagged(orders[order]["items"])["Cola"]["service_color"], "")

	def test_the_groups_are_read_once_whatever_the_number_of_lines(self):
		first = self.an_order([self.cola, self.soup])
		second = self.an_order(
			[self.cola, self.soup, self.salad, self.penne, self.steak, self.tart, self.gum, self.cola],
			restaurant_table=self.table_a2,
		)
		self.make_everything_ready(first)
		self.make_everything_ready(second)

		reads = self.statements_about(
			"Item Group", lambda: restaurant_api.get_runner_orders(restaurant=self.a)
		)

		self.assertEqual(len(reads), 1, reads)


class TestTheLinesAreStampedWithTwoReads(PaintedMenu):
	"""`stamp_lines` is what both lists call: the items and the groups are each read once, however many lines."""

	def lines(self, items):
		return [
			{"item_code": item, "service_family": "", "name": f"row-{index}"}
			for index, item in enumerate(items)
		]

	def test_it_gives_each_line_its_family_and_its_color(self):
		lines = self.lines([self.cola, self.penne, self.gum])

		service_families.stamp_lines(lines)

		self.assertEqual(
			[(line["service_family"], line["service_color"]) for line in lines],
			[("Drink", DRINKS_COLOR), ("Main", KITCHEN_COLOR), ("", "")],
		)

	def test_it_reads_the_items_and_the_groups_once_each_for_two_lines_or_for_many(self):
		for items in ([self.cola, self.soup], [self.cola, self.soup, self.penne, self.tart, self.gum] * 4):
			with self.subTest(lines=len(items)):
				lines = self.lines(items)

				stamp = lambda lines=lines: service_families.stamp_lines(lines)  # noqa: E731
				items_read = self.statements_about("Item", stamp)
				groups_read = self.statements_about("Item Group", stamp)

				self.assertEqual((len(items_read), len(groups_read)), (1, 1))

	def test_it_reads_nothing_for_no_line(self):
		reads = self.statements_about("Item Group", lambda: service_families.stamp_lines([]))

		self.assertEqual(reads, [])

	def test_a_line_of_an_unknown_item_has_neither(self):
		lines = [{"item_code": "_Test SF No Such Item", "service_family": ""}]

		service_families.stamp_lines(lines)

		self.assertEqual((lines[0]["service_family"], lines[0]["service_color"]), ("", ""))


class TestTheGroupsAreNotRequiredToBeMigrated(FrappeTestCase):
	def test_a_site_without_either_column_answers_with_empty_maps(self):
		with patch.object(frappe.db, "has_column", return_value=False):
			self.assertEqual(service_families.group_colors(), {})
			self.assertEqual(service_families.group_families(), {})
