# //// Neoffice — added file (no upstream equivalent). Records each tip taken at the till (date,
# //// invoice, table, server, amount, method) and its later distribution, so transit account 2211
# //// can be cleared against named servers instead of being a black box. Upstream has no tip concept
# //// (a750c5e3, 2026-03-23 "add tip/pourboire management for restaurant module").
import frappe
from frappe.model.document import Document

from pos_next.restaurant import scope
from pos_next.restaurant.settings import restaurant_for_profile


class RestaurantTip(Document):
	def validate(self):
		# //// Neoffice — a tip belongs to the restaurant it was taken in (NeoRestau lot 1, task 2): the one of its
		# //// table, else of the till that rang up its invoice, else the default restaurant.
		if self.restaurant:
			return
		if self.restaurant_table:
			self.restaurant = scope.restaurant_of_record("Restaurant Table", self.restaurant_table)
			return
		profile = None
		if self.sales_invoice:
			profile = frappe.db.get_value("Sales Invoice", self.sales_invoice, "pos_profile")
		self.restaurant = restaurant_for_profile(profile)
