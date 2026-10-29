# //// Neoffice — added file (no upstream equivalent).
"""Which restaurant cards the till shows, against the opening hours (maintenance#1754).

As soon as one opening-hours slot named a card, every card the schedule did not name was hidden: a card just
created in the card editor never showed at the till. A card the schedule names follows its slots; a card it names
nowhere is shown at every hour.

The opening hours are a restaurant's own, so the test gives a restaurant of its own, with one slot, and asks for
that restaurant's cards: it neither reads nor changes the hours of a real restaurant.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant

IN_A_SLOT = "_Test Card In A Slot 1754"
WITHOUT_A_SLOT = "_Test Card Without A Slot 1754"
RESTAURANT = "_Test Restaurant Cards 1754"
A_MONDAY = "2026-10-19"


class TestRestaurantCardsWithoutASlot(FrappeTestCase):
	def setUp(self):
		for name in (IN_A_SLOT, WITHOUT_A_SLOT):
			if not frappe.db.exists("Restaurant Card", name):
				frappe.get_doc({"doctype": "Restaurant Card", "card_name": name, "is_active": 1}).insert(
					ignore_permissions=True
				)
		self.restaurant = (
			frappe.get_doc(
				{
					"doctype": "Restaurant",
					"restaurant_name": RESTAURANT,
					"company": frappe.get_all("Company", limit=1, pluck="name")[0],
					"opening_hours": [
						{
							"day_of_week": "Monday",
							"from_time": "09:00:00",
							"to_time": "10:00:00",
							"label": "Breakfast",
							"restaurant_card": IN_A_SLOT,
						}
					],
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def tearDown(self):
		frappe.delete_doc("Restaurant", self.restaurant, ignore_permissions=True, force=True)
		for name in (IN_A_SLOT, WITHOUT_A_SLOT):
			frappe.delete_doc("Restaurant Card", name, ignore_permissions=True, force=True)

	def cards_at(self, time: str) -> list[str]:
		with (
			patch.object(frappe.utils, "nowdate", return_value=A_MONDAY),
			patch.object(frappe.utils, "nowtime", return_value=time),
		):
			return [card["name"] for card in restaurant.get_active_cards(self.restaurant)]

	def test_a_card_the_schedule_names_nowhere_shows_at_every_hour(self):
		self.assertIn(WITHOUT_A_SLOT, self.cards_at("09:30:00"))
		self.assertIn(WITHOUT_A_SLOT, self.cards_at("20:00:00"))

	def test_a_card_the_schedule_names_follows_its_slots(self):
		self.assertIn(IN_A_SLOT, self.cards_at("09:30:00"))
		self.assertNotIn(IN_A_SLOT, self.cards_at("20:00:00"))
