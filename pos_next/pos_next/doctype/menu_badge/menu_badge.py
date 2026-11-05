# //// Neoffice — added file (no upstream equivalent). Master catalogue of the allergen / diet badges
# //// (gluten, milk, vegan, halal…): label, type, colour and the SVG filename served from
# //// public/icons/badges. Shipped as a fixture so every instance starts from the same list
# //// (b6e757dd, 2026-03-26 "add menu PDF generator with badges").
# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cstr

# //// Neoffice — a badge's icon is the name of a file of the app's own icons (what `public_menu` keeps too)
BADGE_ICON = r"[\w\-]+\.(?:svg|png)"


class MenuBadge(Document):
	# //// Neoffice — the field is free text and its value becomes a path on the server
	# //// (restaurant.badge_icon_uri), which reads the file and answers its content: whoever may write a
	# //// badge named any file the server can read (maintenance#2296). An empty icon stays allowed: the badge
	# //// shows its name.
	def validate(self):
		if self.icon and not re.fullmatch(BADGE_ICON, cstr(self.icon)):
			frappe.throw(_("Icon must be a file name of the badge icons"))
