# //// Neoffice — added file (no upstream equivalent). One course of a fixed-price menu (course name,
# //// item, order); the till walks these rows to build the step-by-step course selection dialog
# //// (9f4e85df, 2026-03-21 "Phase 4B - restaurant menus with course selection dialog").
import frappe
from frappe.model.document import Document


class RestaurantMenuCourse(Document):
	pass
