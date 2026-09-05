# //// Neoffice — added file (no upstream equivalent). Routes a whole Item Group to a preparation
# //// station, so a carte of 300 dishes does not need 300 per-item rows; the per-item table stays
# //// the override (34ee11a8, 2026-03-25 "merge all restaurant enhancements - station groups,
# //// realtime cards, shift closing, full editors").
# Copyright (c) 2026, NeoService and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class PreparationStationItemGroup(Document):
	pass
