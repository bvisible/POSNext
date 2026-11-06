# //// Neoffice — added file (no upstream equivalent). The POSNext settings of a new POS Profile (NeoResto lot 1, task 13b; product owner,
# //// 05.11.2026: « quand on créera un nouveau profil, comment ça crée le profil POSNext ? »). A till's POSNext settings are a document of
# //// their own (POS Settings), linked to the profile by name; nothing made it when the profile was made: the row came, with the defaults,
# //// the first time the till opened with that profile or someone opened the settings page, and until then the profile said « POS Settings: 0 ».
"""A new POS Profile has its POSNext settings from the moment it exists, and they follow its on / off switch."""

import frappe
from frappe.utils import cint

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


# //// Neoffice — one switch for a till (Daniel, 06.11.2026): the profile's `disabled` (ERPNext's) and the record's `enabled` said the same thing
# //// twice, in two switches on the office's page. `enabled` is read by the code (offered, shop scan, restaurant settings and cards): it follows.
def keep_in_step(pos_profile, disabled):
	"""Make the POS Settings row of a till say what its profile says: in use unless the profile is disabled. Written straight, the record's
	own checks keep its settings to the till managers and this is the system keeping two flags alike, whoever saved the profile."""
	name = frappe.db.get_value("POS Settings", {"pos_profile": pos_profile})
	if not name:
		return
	enabled = 0 if cint(disabled) else 1
	if cint(frappe.db.get_value("POS Settings", name, "enabled")) == enabled:
		return
	frappe.db.set_value("POS Settings", name, "enabled", enabled)
	frappe.clear_document_cache("POS Settings", name)


def follow_the_profile(doc, method=None):
	"""After a POS Profile is saved: when its `disabled` moved, its POS Settings row follows. Left alone otherwise, so that a profile saved
	for any other reason never overwrites what was set on the record."""
	if doc.has_value_changed("disabled"):
		keep_in_step(doc.name, doc.disabled)


# //// Neoffice — a till deleted from ERPNext's own profile form (06.11.2026): its POS Settings row links to it, and nobody sees that row
# //// elsewhere than on the page, so the form would refuse with a link error naming a record the person never made. The row goes with its profile.
def remove_with_the_profile(doc, method=None):
	"""On a POS Profile's deletion: its POS Settings row goes first. If the profile is then refused (sales, sessions, other records
	mention it) the request is rolled back whole, row included."""
	for name in frappe.get_all("POS Settings", filters={"pos_profile": doc.name}, pluck="name"):
		frappe.delete_doc("POS Settings", name, ignore_permissions=True, force=True)
