# //// Neoffice — added file (no upstream equivalent).
"""The guest's page carries the colour of a dish's family (NeoResto lot 1, product owner, 03.11.2026: « la même chose pour la page du client »).

The till's tiles and the waiter's phone take the colour of a dish's item group; the page a diner meets from the QR code of a table reads it too: each dish of the guest
menu carries `service_color`, unless the till of the table switched the colours of its tiles off (POS Settings.tile_colors). The suite builds a card of the service suite's
fixture (restaurant, till, items) and fakes only the reading of the groups' colours; nothing is committed.
"""

from unittest.mock import patch

import frappe

from pos_next.api import guest_ordering
from pos_next.tests.test_service_families import ServiceCase

GREEN = "#6BAF6B"


class TestTheGuestMenuCarriesTheGroupColour(ServiceCase):
	def setUp(self):
		super().setUp()
		self.group = frappe.db.get_value("Item", self.soup, "item_group")
		self.card = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"card_name": "_Test Colour Card",
				"is_active": 1,
				"items": [{"item_type": "Item", "item": self.soup}, {"item_type": "Item", "item": self.cola}],
			}
		).insert(ignore_permissions=True)

	def dishes(self, **kwargs):
		menu = guest_ordering._build_menu_from_card(self.card.name, **kwargs)
		return {dish["item_code"]: dish for category in menu["categories"] for dish in category["menu_items"]}

	def test_a_dish_carries_the_colour_of_its_group(self):
		dishes = self.dishes(colors={self.group: GREEN})

		self.assertEqual(dishes[self.soup]["service_color"], GREEN)

	def test_a_dish_carries_none_when_no_colour_is_given(self):
		self.assertEqual(self.dishes()[self.soup]["service_color"], "")
		self.assertEqual(self.dishes(colors={})[self.soup]["service_color"], "")

	def test_a_dish_of_another_group_carries_none(self):
		dishes = self.dishes(colors={"Some Other Group": GREEN})

		self.assertEqual(dishes[self.soup]["service_color"], "")

	def test_the_page_reads_the_colours_of_the_groups(self):
		token = self.token()
		with patch.object(guest_ordering.service_families, "group_colors", return_value={self.group: GREEN}):
			menu = guest_ordering.get_guest_menu(token.token)

		dishes = [dish for category in menu["categories"] for dish in category["menu_items"]]
		self.assertEqual({dish["item_code"]: dish["service_color"] for dish in dishes}[self.soup], GREEN)

	def test_a_till_that_switched_the_colours_off_hands_the_page_none(self):
		token = self.token()
		self.set_tile_colors(0)
		with patch.object(guest_ordering.service_families, "group_colors", return_value={self.group: GREEN}):
			menu = guest_ordering.get_guest_menu(token.token)

		for category in menu["categories"]:
			for dish in category["menu_items"]:
				self.assertEqual(dish["service_color"], "")

	def test_the_colours_are_on_unless_the_till_says_otherwise(self):
		self.assertTrue(guest_ordering._tile_colors_on(None))
		self.assertTrue(guest_ordering._tile_colors_on("A Till Nobody Set"))
		self.set_tile_colors(0)
		self.assertFalse(guest_ordering._tile_colors_on(self.fx.profile))
		self.set_tile_colors(1)
		self.assertTrue(guest_ordering._tile_colors_on(self.fx.profile))

	def token(self):
		frappe.db.set_value("Restaurant", self.a, "guest_menu", self.card.name)
		frappe.clear_document_cache("Restaurant")
		return frappe.get_doc(
			{"doctype": "Guest Order Token", "mode": "restaurant", "table": self.table_a, "pos_profile": self.fx.profile}
		).insert(ignore_permissions=True)

	def set_tile_colors(self, value):
		rows = frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name")
		if not rows:
			settings = frappe.get_doc(
				{"doctype": "POS Settings", "pos_profile": self.fx.profile, "enabled": 1, "tile_colors": value}
			)
			settings.flags.ignore_links = True
			settings.flags.ignore_mandatory = True
			settings.insert(ignore_permissions=True)
		else:
			frappe.db.set_value("POS Settings", rows[0], "tile_colors", value)
