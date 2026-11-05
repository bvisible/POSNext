# //// Neoffice — added file (no upstream equivalent). The POSNext settings of a new POS Profile (NeoResto lot 1, task 13b; product owner,
# //// 05.11.2026: « quand on créera un nouveau profil, comment ça crée le profil POSNext ? »). A till's POSNext settings are a document of
# //// their own (POS Settings), linked to the profile by name; nothing made it when the profile was made: the row came, with the defaults,
# //// the first time the till opened with that profile or someone opened the settings page, and until then the profile said « POS Settings: 0 ».
"""A new POS Profile has its POSNext settings from the moment it exists."""

import frappe

SAVEPOINT = "pos_next_new_profile_settings"


def create_for_new_profile(doc, method=None):
	"""After a POS Profile is inserted: make its POS Settings row with the defaults, as the till would at its first opening
	(`create_default_settings`), unless it has one (a profile made again under a name an earlier one had). The profile is what
	the user asked for: whatever goes wrong here is logged and undone, and never stops it."""
	from pos_next.pos_next.doctype.pos_settings.pos_settings import create_default_settings

	if frappe.db.exists("POS Settings", {"pos_profile": doc.name}):
		return
	frappe.db.savepoint(SAVEPOINT)
	try:
		create_default_settings(doc.name)
	except Exception:
		frappe.db.rollback(save_point=SAVEPOINT)
		frappe.log_error("POS Next: settings of a new POS Profile", frappe.get_traceback())
