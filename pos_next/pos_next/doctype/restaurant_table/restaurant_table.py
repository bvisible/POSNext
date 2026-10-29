# //// Neoffice — added file (no upstream equivalent). One table on the floor plan: area, capacity,
# //// status (Empty / Occupied / Cleaning…) and x, y, size, shape for the plan editor. Upstream
# //// POSNext is a retail POS with no table service (458d81a9, 2026-03-20 "remove BrainWise
# //// branding, add restaurant mode, and code formatting").
# Copyright (c) 2024, BrainWise and contributors
# For license information, please see license.txt

# //// Neoffice — a table is in the restaurant of its room, and its name only has to be unique within that
# //// restaurant (NeoRestau lot 1, task 2). A table is named by a hash from now on: invoices, reservations, tips and
# //// guest tokens link to it by name, and a name that is also the label could not be changed, nor shared by two
# //// restaurants.
import frappe
from frappe import _
from frappe.model.document import Document

from pos_next.restaurant import scope
from pos_next.restaurant.settings import default_restaurant


class RestaurantTable(Document):
	def validate(self):
		# The restaurant comes from the room (fetch_from does the same on save, after this check)
		self.restaurant = scope.restaurant_of_record("Restaurant Area", self.area)
		scope.validate_label_unique_in_restaurant(self, "table_name")
		self._stay_in_its_restaurant()

	def _stay_in_its_restaurant(self):
		"""A table moved to a room of another restaurant would take its orders and reservations with it."""
		before = self.get_doc_before_save()
		if before and (before.restaurant or default_restaurant()) != self.restaurant:
			frappe.throw(_("Table {0} stays in its restaurant").format(self.table_name))
