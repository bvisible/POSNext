#//// Neoffice — added file (no upstream equivalent). A fixed-price menu (entrée/plat/dessert) sold
#//// as one line at the till while each chosen course still routes to its own preparation station.
#//// An ERPNext Product Bundle cannot express it: the guest picks one item per course at order time
#//// (9f4e85df, 2026-03-21 "Phase 4B - restaurant menus with course selection dialog").
import frappe
from frappe.model.document import Document


class RestaurantMenu(Document):
	pass
