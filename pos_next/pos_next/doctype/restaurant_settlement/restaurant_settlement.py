# //// Neoffice — added file (no upstream equivalent). The journal of the orders settled when a restaurant's service closes (NeoResto lot 1, the
# //// product owner, 08.11.2026, solution C of the study of the open tables, note 57): one row per order, whatever its issue. It is what a cancelled
# //// order leaves behind (the draft itself is deleted), and what the report of the tables that were not cashed reads. Written by
# //// pos_next.restaurant.settlement, never by hand.
from frappe.model.document import Document


class RestaurantSettlement(Document):
	pass
