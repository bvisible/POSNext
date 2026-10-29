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
from frappe.utils import cstr, flt

from pos_next.restaurant import permissions, scope
from pos_next.restaurant.settings import default_restaurant

# What lays a table out on the floor plan: everything but its status, which the service sets
LAYOUT_FIELDS = ("table_name", "area", "capacity", "pos_x", "pos_y", "width", "height", "shape")


class RestaurantTable(Document):
	def validate(self):
		self._only_its_status_without_the_floor_right()
		# The restaurant comes from the room (fetch_from does the same on save, after this check)
		self.restaurant = scope.restaurant_of_record("Restaurant Area", self.area)
		scope.validate_label_unique_in_restaurant(self, "table_name")
		self._stay_in_its_restaurant()

	def _only_its_status_without_the_floor_right(self):
		"""A cashier may write a table, for its status (NeoRestau lot 1, task 3); laying it out is the floor plan's.

		Checked on the document, so that no route (the desk form, the REST API, frappe.client) lets whoever may not
		lay out the floor (permissions.RIGHTS["manage_floor"]) change a table's label, room, seats, place, size or shape.
		"""
		before = self.get_doc_before_save()
		if not before or permissions.can("manage_floor"):
			return
		numbers = {"capacity", "pos_x", "pos_y", "width", "height"}

		def changed(field):
			cast = flt if field in numbers else cstr
			return cast(self.get(field)) != cast(before.get(field))

		if any(changed(field) for field in LAYOUT_FIELDS):
			frappe.throw(
				_("Only the status of a table changes without the right to lay out the floor plan"),
				frappe.PermissionError,
			)

	def _stay_in_its_restaurant(self):
		"""A table moved to a room of another restaurant would take its orders and reservations with it."""
		before = self.get_doc_before_save()
		if before and (before.restaurant or default_restaurant()) != self.restaurant:
			frappe.throw(_("Table {0} stays in its restaurant").format(self.table_name))
