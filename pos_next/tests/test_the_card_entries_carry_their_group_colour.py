# //// Neoffice — added file (no upstream equivalent).
"""The entries of a restaurant card carry the colour of their item group (NeoResto lot 1, product owner, 03.11.2026).

« Des couleurs par famille: bleu pour l'eau, brun pour le café… pour retrouver très vite le vin rouge, le vin blanc. » The family of an item has its colour at
the desk (Custom Field `service_color` of the Item Group: its own, else the nearest one up the tree, the rule the kitchen's tickets already follow); the card read
hands it to the till and to the phone beside the item's own `custom_color`, which still wins on the screen. The suite fakes the reads of the card, its items and
its groups, and runs the real read of the card.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant


def read_of(entries, items, colours):
	"""The card's entries as the till reads them, with `entries` as its rows, `items` as the items' rows and `colours` as the groups' colours."""

	def get_all(doctype, *args, **kwargs):
		if doctype == "Restaurant Card Item":
			return [frappe._dict(row) for row in entries]
		if doctype == "Item":
			return [frappe._dict(row) for row in items]
		return []

	units = {row["name"]: {"stock_uom": "Nos", "item_uoms": []} for row in items}
	with (
		patch.object(frappe, "get_all", get_all),
		patch.object(restaurant.item_units, "units_of", return_value=units),
		patch.object(restaurant.service_families, "group_colors", return_value=colours),
	):
		return restaurant._cards_with_items([frappe._dict(name="A card")])[0]["items"]


def item(code, group, **values):
	return {"name": code, "item_name": code, "image": None, "custom_color": "", "item_group": group, "standard_rate": 5, "is_stock_item": 0, "stock_uom": "Nos", **values}


def entry(code):
	return {"item_type": "Item", "label": "", "item": code, "menu": None, "price": 5, "sort_order": 1, "disabled": 0}


class TestTheCardEntriesCarryTheirGroupColour(FrappeTestCase):
	def test_a_dish_carries_the_colour_of_its_group(self):
		rows = read_of([entry("Cola")], [item("Cola", "Drinks")], {"Drinks": "#5B9BD5"})

		self.assertEqual(rows[0]["service_color"], "#5B9BD5")

	def test_a_dish_of_a_group_with_no_colour_carries_none(self):
		rows = read_of([entry("Soup")], [item("Soup", "Starters")], {"Drinks": "#5B9BD5"})

		self.assertEqual(rows[0]["service_color"], "")

	def test_the_dishes_of_two_groups_carry_each_their_own(self):
		rows = read_of(
			[entry("Cola"), entry("Soup")],
			[item("Cola", "Drinks"), item("Soup", "Starters")],
			{"Drinks": "#5B9BD5", "Starters": "#6BAF6B"},
		)

		self.assertEqual([row["service_color"] for row in rows], ["#5B9BD5", "#6BAF6B"])

	def test_the_colour_of_the_item_itself_is_left_as_it_is(self):
		rows = read_of([entry("Cola")], [item("Cola", "Drinks", custom_color="#EF4444")], {"Drinks": "#5B9BD5"})

		self.assertEqual(rows[0]["custom_color"], "#EF4444")
		self.assertEqual(rows[0]["service_color"], "#5B9BD5")

	def test_the_groups_are_read_once_whatever_the_number_of_dishes(self):
		colours = {"Drinks": "#5B9BD5"}
		with patch.object(restaurant.service_families, "group_colors", return_value=colours) as read:
			get_all = lambda doctype, *args, **kwargs: (  # noqa: E731
				[frappe._dict(entry(f"D{n}")) for n in range(5)]
				if doctype == "Restaurant Card Item"
				else [frappe._dict(item(f"D{n}", "Drinks")) for n in range(5)]
				if doctype == "Item"
				else []
			)
			units = {f"D{n}": {"stock_uom": "Nos", "item_uoms": []} for n in range(5)}
			with patch.object(frappe, "get_all", get_all), patch.object(restaurant.item_units, "units_of", return_value=units):
				restaurant._cards_with_items([frappe._dict(name="A card")])

		self.assertEqual(read.call_count, 1)
