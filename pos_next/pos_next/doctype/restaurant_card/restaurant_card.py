import frappe
from frappe.model.document import Document


class RestaurantCard(Document):
	def validate(self):
		for item in self.items:
			# Clear price for category rows
			if item.item_type == "Category":
				item.price = None
				item.item = None
				item.menu = None
