# //// Neoffice — added file (no upstream equivalent).
"""The item panel of the card editor is told the colour the dish takes from its family (NeoResto lot 1, product owner, 03.11.2026).

« Reprendre celle de la catégorie quand on en a mis une, mais qu'on puisse la modifier par article »: `get_item_edit_data` hands the panel the item group of the dish and
that group's colour (its own, else the nearest up the tree), beside the colour of the dish itself, which still wins on the screens. The suite uses the service suite's
fixture (items in item groups), sets the colour on the group, and rolls back.
"""

import frappe

from pos_next.api import restaurant
from pos_next.tests.test_service_families import ServiceCase

GREEN = "#6BAF6B"


class TestTheItemPanelCarriesTheFamilyColour(ServiceCase):
	def setUp(self):
		super().setUp()
		self.group = frappe.db.get_value("Item", self.soup, "item_group")

	def test_the_panel_reads_the_colour_of_the_dishs_group(self):
		frappe.db.set_value("Item Group", self.group, "service_color", GREEN)

		data = restaurant.get_item_edit_data(self.soup)

		self.assertEqual(data["item_group"], self.group)
		self.assertEqual(data["service_color"], GREEN)

	def test_a_group_with_no_colour_gives_none(self):
		frappe.db.set_value("Item Group", self.group, "service_color", "")

		self.assertEqual(restaurant.get_item_edit_data(self.soup)["service_color"], "")

	def test_the_colour_of_the_dish_itself_is_left_as_it_is(self):
		frappe.db.set_value("Item Group", self.group, "service_color", GREEN)
		frappe.db.set_value("Item", self.soup, "custom_color", "#EF4444")

		data = restaurant.get_item_edit_data(self.soup)

		self.assertEqual(data["custom_color"], "#EF4444")
		self.assertEqual(data["service_color"], GREEN)
