# //// Neoffice — added file (no upstream equivalent). A room / terrace / floor of the restaurant,
# //// carrying its floor-plan geometry (walls, background). Upstream POSNext serves a counter, not a
# //// room, so it has no notion of a floor (458d81a9, 2026-03-20 "remove BrainWise branding, add
# //// restaurant mode, and code formatting").
# Copyright (c) 2024, BrainWise and contributors
# For license information, please see license.txt

# //// Neoffice — it belongs to a restaurant, and its name only has to be unique within that restaurant (NeoRestau
# //// lot 1, task 2). A room is named by a hash from now on: its tables, its stations and the tills' default room
# //// link to it by name, and a name that is also the label could not be changed, nor shared by two restaurants.
import frappe
from frappe import _
from frappe.model.document import Document

from pos_next.restaurant import scope
from pos_next.restaurant.settings import default_restaurant


class RestaurantArea(Document):
	def validate(self):
		scope.attach_to_restaurant(self)
		scope.validate_label_unique_in_restaurant(self, "area_name")
		self._keep_its_restaurant_once_it_holds_tables()

	def _keep_its_restaurant_once_it_holds_tables(self):
		"""A room that holds tables or stations stays in its restaurant: they, their orders and their reservations are
		that restaurant's."""
		before = self.get_doc_before_save()
		if not before or (before.restaurant or default_restaurant()) == self.restaurant:
			return
		if frappe.db.exists("Restaurant Table", {"area": self.name}) or frappe.db.exists(
			"Preparation Station", {"area": self.name}
		):
			frappe.throw(_("Room {0} holds tables or stations: it stays in its restaurant").format(self.area_name))
