# //// Neoffice — added file (no upstream equivalent). The shopping list of a restaurant (NeoResto purchases, lot B): the rules
# //// are in pos_next.restaurant.shopping; the document only asks for them when it is saved.
from frappe.model.document import Document

from pos_next.restaurant import shopping


class RestaurantShoppingList(Document):
	def validate(self):
		shopping.validate_list(self)
