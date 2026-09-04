#//// Neoffice — added file (no upstream equivalent). Records each tip taken at the till (date,
#//// invoice, table, server, amount, method) and its later distribution, so transit account 2211
#//// can be cleared against named servers instead of being a black box. Upstream has no tip concept
#//// (a750c5e3, 2026-03-23 "add tip/pourboire management for restaurant module").
import frappe
from frappe.model.document import Document


class RestaurantTip(Document):
	pass
