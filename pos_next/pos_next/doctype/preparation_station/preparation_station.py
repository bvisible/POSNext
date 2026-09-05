# //// Neoffice — added file (no upstream equivalent). A retail POS sends nothing to a kitchen.
# //// Neoffice sells POS to restaurants, so an order has to be split per preparation point (Bar,
# //// Kitchen…) to drive the KDS filtering (e005b94b, 2026-03-21 "Phase 3 - preparation stations
# //// (Bar/Kitchen) with KDS filtering").
# Copyright (c) 2024, BrainWise and contributors
# For license information, please see license.txt

from frappe.model.document import Document

class PreparationStation(Document):
	pass
