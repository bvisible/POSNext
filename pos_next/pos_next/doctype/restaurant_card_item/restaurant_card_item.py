#//// Neoffice — added file (no upstream equivalent). One row of a Restaurant Card: Category header,
#//// Item or Menu, with an optional card-specific price override — the same dish can cost more on
#//// the terrace card than at the bar (f2392119, 2026-03-22 "restaurant card system (carte de
#//// restaurant)").
import frappe
from frappe.model.document import Document


class RestaurantCardItem(Document):
	pass
