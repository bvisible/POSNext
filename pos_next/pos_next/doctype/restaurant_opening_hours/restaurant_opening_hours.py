#//// Neoffice — added file (no upstream equivalent). One weekly opening slot (day, from, to) and
#//// the card served during it, so the till shows the lunch carte at noon and the evening one at
#//// 19:00 by itself; a slot may span midnight, which is why the check is not a plain from <= now
#//// <= to (32f2415d, 2026-03-23 "add Restaurant Settings with opening hours and time-based card
#//// availability").
import frappe
from frappe.model.document import Document


class RestaurantOpeningHours(Document):
	pass
