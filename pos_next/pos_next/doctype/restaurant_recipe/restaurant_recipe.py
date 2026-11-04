# //// Neoffice — added file (no upstream equivalent). A recipe of a restaurant (NeoResto, « Nora au restaurant », lot R3): ingredients for a
# //// number of portions, steps, allergens, provenance. The rules are pos_next/restaurant/recipes.py.
from frappe.model.document import Document

from pos_next.restaurant import recipes


class RestaurantRecipe(Document):
	def validate(self):
		recipes.validate(self)
