# //// Neoffice — added file (no upstream equivalent). Child table pinning the allergen / diet badges
# //// of one printed menu line. Swiss restaurants must declare allergens on the carte, which a
# //// retail POS has no notion of. The controller is empty on purpose: the rows are pure data read
# //// by the menu PDF generator (b6e757dd, 2026-03-26 "add menu PDF generator with badges").
# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class ItemBadge(Document):
	pass
