#//// Neoffice — added file (no upstream equivalent). One printable menu layout — theme, fonts,
#//// paper format, colours, custom CSS — for the PDF menu generator; the five shipped designs live
#//// in fixtures/menu_design_template.json. Upstream prints receipts, never a carte (b6e757dd,
#//// 2026-03-26 "add menu PDF generator with badges").
# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class MenuDesignTemplate(Document):
	pass
