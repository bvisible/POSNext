#//// Neoffice — added file (no upstream equivalent). A room / terrace / floor of the restaurant,
#//// carrying its floor-plan geometry (walls, background). Upstream POSNext serves a counter, not a
#//// room, so it has no notion of a floor (458d81a9, 2026-03-20 "remove BrainWise branding, add
#//// restaurant mode, and code formatting").
# Copyright (c) 2024, BrainWise and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

class RestaurantArea(Document):
	pass
