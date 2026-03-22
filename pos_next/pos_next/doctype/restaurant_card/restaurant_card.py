import frappe
from frappe.model.document import Document


class RestaurantCard(Document):
	def validate(self):
		for item in self.items:
			# Clear irrelevant fields for category rows
			if item.item_type == "Category":
				item.price = 0
				item.item = None
				item.menu = None
