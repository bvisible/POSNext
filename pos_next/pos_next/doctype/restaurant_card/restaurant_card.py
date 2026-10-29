# //// Neoffice — added file (no upstream equivalent). The carte a restaurant serves: an ordered list
# //// of category headers, dishes and menus that replaces the product grid at the till. validate()
# //// blanks price/item/menu on Category rows because a header is a separator, not a sellable line —
# //// a stale price there prints a price on the section title (f2392119, 2026-03-22 "restaurant card
# //// system (carte de restaurant)"; 9f1968d7, 2026-03-22).
import frappe
from frappe.model.document import Document

from pos_next.restaurant import scope


class RestaurantCard(Document):
	def validate(self):
		# //// Neoffice — a card belongs to a restaurant (NeoRestau lot 1, task 2); one that names none, a card
		# //// made before the restaurants, belongs to the default restaurant.
		scope.attach_to_restaurant(self)
		for item in self.items:
			# Clear irrelevant fields for category rows
			if item.item_type == "Category":
				item.price = 0
				item.item = None
				item.menu = None
