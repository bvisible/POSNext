# //// Neoffice — added file (no upstream equivalent).
"""A card has two levels: categories and, under them, sub-categories (NeoResto lot 1, product owner, 03.11.2026).

« Des sous-familles : vin blanc, vin rouge, bière… dans les boissons. » A category row of a card may be a sub-category (`is_subcategory`): a heading one level under the last
category that is not one. Every reader of the card hands it on: the till and the waiter's phone (the rows keep their `is_subcategory`), the guest's page (a category with its
`parent`), the printed card (a category with its `parent`, which the themes draw one step smaller) and the public menu (« Drinks · Wines »). A reader that does not know the
level reads a sub-category as a category: nothing is lost. The suite builds a card on the service suite's fixture and rolls back.
"""

import frappe

from pos_next.api import guest_ordering, public_menu
from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import ServiceCase


class TestACardHasSubCategories(ServiceCase):
	def setUp(self):
		super().setUp()
		self.card = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"card_name": "_Test Sub Card",
				"is_active": 1,
				"items": [
					{"item_type": "Category", "label": "Drinks"},
					{"item_type": "Category", "label": "Wines", "is_subcategory": 1},
					{"item_type": "Item", "item": self.cola},
					{"item_type": "Category", "label": "Starters"},
					{"item_type": "Item", "item": self.soup},
				],
			}
		).insert(ignore_permissions=True)

	def test_the_rows_keep_what_a_sub_category_is(self):
		rows = frappe.get_all("Restaurant Card Item", filters={"parent": self.card.name, "item_type": "Category"}, fields=["label", "is_subcategory"], order_by="idx")

		self.assertEqual([(r.label, r.is_subcategory) for r in rows], [("Drinks", 0), ("Wines", 1), ("Starters", 0)])

	def test_the_till_reads_the_level_of_each_row(self):
		card = restaurant_api._cards_with_items([frappe._dict(name=self.card.name)])[0]
		headings = [(row["label"], row.get("is_subcategory")) for row in card["items"] if row["item_type"] == "Category"]

		self.assertEqual(headings, [("Drinks", 0), ("Wines", 1), ("Starters", 0)])

	def test_the_guest_menu_names_the_category_a_sub_category_stands_under(self):
		menu = guest_ordering._build_menu_from_card(self.card.name)
		by_label = {category["label"]: category for category in menu["categories"]}

		self.assertEqual(by_label["Wines"]["parent"], "Drinks")
		self.assertNotIn("parent", by_label["Starters"])

	def test_a_sub_category_after_no_category_is_a_category(self):
		card = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"card_name": "_Test Lone Sub Card",
				"is_active": 1,
				"items": [{"item_type": "Category", "label": "Alone", "is_subcategory": 1}, {"item_type": "Item", "item": self.soup}],
			}
		).insert(ignore_permissions=True)

		menu = guest_ordering._build_menu_from_card(card.name)

		self.assertNotIn("parent", menu["categories"][0])

	def test_the_printed_card_names_the_category_a_sub_category_stands_under(self):
		data = restaurant_api.get_card_items_with_badges(self.card.name)
		by_label = {category["label"]: category for category in data["categories"]}

		self.assertEqual(by_label["Wines"]["parent"], "Drinks")
		# The title of « Drinks », whose dishes all stand under « Wines », stays
		self.assertEqual(by_label["Drinks"]["menu_items"], [])
		self.assertNotIn("parent", by_label["Drinks"])

	def test_the_public_menu_reads_a_sub_category_under_its_category(self):
		labels = [section["label"] for section in public_menu._sections(self.card, "fr")]

		self.assertIn("Drinks · Wines", labels)
		self.assertIn("Starters", labels)
