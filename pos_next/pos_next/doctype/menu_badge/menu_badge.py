# //// Neoffice — added file (no upstream equivalent). Master catalogue of the allergen / diet badges
# //// (gluten, milk, vegan, halal…): label, type, colour and the SVG filename served from
# //// public/icons/badges. Shipped as a fixture so every instance starts from the same list
# //// (b6e757dd, 2026-03-26 "add menu PDF generator with badges").
# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MenuBadge(Document):
	pass
