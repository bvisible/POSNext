# //// Neoffice — added file (no upstream equivalent). The notice of a guest's order or payment stays on the till until somebody has seen it (NeoResto lot 1, Daniel, 02.11.2026: the glass of wine ordered at table 7
# //// went away on its own after thirty seconds). The default of `floor_popup_seconds` moved from 30 to 0 (« until it is seen »); the tills that already hold the old default take the new one.
"""Move the tills that kept the old default of the floor notice (30 seconds) to the new one (until it is seen)."""

import frappe


def execute():
	"""A till that was given a number of seconds other than the old default chose it: only the untouched default moves, once. Nothing is done where the column does not exist yet."""
	if not frappe.db.has_column("POS Settings", "floor_popup_seconds"):
		return
	frappe.db.sql("update `tabPOS Settings` set floor_popup_seconds = 0 where floor_popup_seconds = 30")
