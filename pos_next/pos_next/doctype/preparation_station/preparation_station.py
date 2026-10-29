# //// Neoffice — added file (no upstream equivalent). A retail POS sends nothing to a kitchen.
# //// Neoffice sells POS to restaurants, so an order has to be split per preparation point (Bar,
# //// Kitchen…) to drive the KDS filtering (e005b94b, 2026-03-21 "Phase 3 - preparation stations
# //// (Bar/Kitchen) with KDS filtering").
# Copyright (c) 2024, BrainWise and contributors
# For license information, please see license.txt

# //// Neoffice — it belongs to a restaurant, and its name only has to be unique within that restaurant (NeoRestau
# //// lot 1, task 2). A station is named by a hash from now on: invoice lines link to it by name, and a name that is
# //// also the label could not be changed, nor shared by two restaurants.
import frappe
from frappe import _
from frappe.model.document import Document

from pos_next.restaurant import scope


class PreparationStation(Document):
	def validate(self):
		self._follow_the_room_it_stands_in()
		scope.attach_to_restaurant(self)
		scope.validate_label_unique_in_restaurant(self, "station_name")

	def _follow_the_room_it_stands_in(self):
		"""A station drawn on the plan of a room belongs to the restaurant of that room."""
		if not self.area:
			return
		restaurant = scope.restaurant_of_record("Restaurant Area", self.area)
		if not self.restaurant:
			self.restaurant = restaurant
		elif self.restaurant != restaurant:
			room = frappe.db.get_value("Restaurant Area", self.area, "area_name") or self.area
			frappe.throw(_("Room {0} belongs to another restaurant").format(room))
