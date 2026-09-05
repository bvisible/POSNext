# //// Neoffice — added file (no upstream equivalent). Child table holding the tables one reservation
# //// occupies: a party of ten takes three tables and the overlap check has to see all three
# //// (ebc3ecc5, 2026-03-29 "restaurant reservation system with POS dialog, online booking, and
# //// email notifications").
import frappe
from frappe.model.document import Document


class RestaurantReservationTable(Document):
	pass
