# //// Neoffice — added file (no upstream equivalent).
"""The card editor's list says what each row holds without a click (NeoResto lot 1, product owner, 03.11.2026: « sans aucun clic, on ne voit pas grand-chose »).

`get_card_items_extra` hands the editor, for each dish of a card, its name, picture, colour (its own, else its item group's), item group and global price beside its description and
badges, and for each menu row the menu's name, picture and price. The suite builds a card on the service suite's fixture and rolls back.
"""

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import ServiceCase

GREEN = "#6BAF6B"


class TestTheCardEditorListsWhatARowHolds(ServiceCase):
	def setUp(self):
		super().setUp()
		self.group = frappe.db.get_value("Item", self.soup, "item_group")
		frappe.db.set_value("Item Group", self.group, "service_color", GREEN)
		frappe.db.set_value("Item", self.soup, {"standard_rate": 9.5, "custom_color": ""})
		self.menu = frappe.get_doc(
			{
				"doctype": "Restaurant Menu",
				"restaurant": self.a,
				"menu_name": "_Test Daily Menu",
				"price": 36,
				"is_active": 1,
				"courses": [{"course_name": "Starter", "item": self.soup, "item_name": "Soup"}],
			}
		).insert(ignore_permissions=True)
		self.card = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"card_name": "_Test Rows Card",
				"is_active": 1,
				"items": [
					{"item_type": "Menu", "menu": self.menu.name},
					{"item_type": "Category", "label": "Starters"},
					{"item_type": "Item", "item": self.soup},
				],
			}
		).insert(ignore_permissions=True)

	def test_a_dish_carries_its_name_its_group_its_colour_and_its_global_price(self):
		extra = restaurant_api.get_card_items_extra(self.card.name)[self.soup]

		self.assertEqual(extra["item_name"], frappe.db.get_value("Item", self.soup, "item_name"))
		self.assertEqual(extra["item_group"], self.group)
		self.assertEqual(extra["service_color"], GREEN)
		self.assertEqual(extra["custom_color"], "")
		self.assertEqual(extra["default_price"], 9.5)

	def test_the_colour_of_the_dish_itself_comes_beside_its_groups(self):
		frappe.db.set_value("Item", self.soup, "custom_color", "#EF4444")

		extra = restaurant_api.get_card_items_extra(self.card.name)[self.soup]

		self.assertEqual((extra["custom_color"], extra["service_color"]), ("#EF4444", GREEN))

	def test_a_menu_row_carries_the_menu_s_name_and_price(self):
		extra = restaurant_api.get_card_items_extra(self.card.name)[self.menu.name]

		self.assertEqual(extra["item_name"], "_Test Daily Menu")
		self.assertEqual(extra["default_price"], 36)
		self.assertEqual(extra["item_group"], "")
