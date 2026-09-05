# //// Neoffice — added file (no upstream equivalent). One table on the floor plan: area, capacity,
# //// status (Empty / Occupied / Cleaning…) and x, y, size, shape for the plan editor. Upstream
# //// POSNext is a retail POS with no table service (458d81a9, 2026-03-20 "remove BrainWise
# //// branding, add restaurant mode, and code formatting").
# Copyright (c) 2024, BrainWise and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

class RestaurantTable(Document):
	pass
