# //// Neoffice — added file (no upstream equivalent). The product took the name NeoResto (Daniel and Jérémy, 02.11.2026), and the page and the
# //// menu entry that `neoresto.setup` makes ONCE under the product's name are on the sites that have them under the old one: renamed here, so that
# //// the next migrate does not make a second pair. The page is now `Resto`, whose link is `/app/resto` (short like the other modules'), and its title
# //// `NeoResto`. The old name is written out in this file on purpose: it is what the sites hold.
"""Rename the page and the menu entry that NeoRestau made, and carry the site's flag to its new name."""

import frappe
import frappe.installer
from frappe.desk.utils import slug

# The model's own function: `frappe.rename_doc` is a whitelisted method of the desk, which takes no `ignore_permissions` (maintenance#1758)
from frappe.model.rename_doc import rename_doc

from pos_next.restaurant import mode, neoresto

# What a site holds from before the rename: the page (a public workspace), the menu entry (a virtual App Customization) and its title
OLD_PAGE = "NeoRestau"
OLD_APP = "neorestau"
OLD_TITLE = "NeoRestau"


def execute(old_page=OLD_PAGE, old_app=OLD_APP, old_title=OLD_TITLE):
	"""Idempotent, and it never merges nor overwrites: where the new name is already held, the old one is left for a person to decide.

	A title an administrator changed on the entry stays (the entry is "made once, and only made"); only the entry's name follows."""
	_rename_the_page(old_page, old_title)
	_rename_the_menu_entry(old_app, old_title, old_page)
	_carry_the_site_flag()


def _rename_the_page(old, old_title):
	new = neoresto.WORKSPACE
	if old == new or not frappe.db.exists("Workspace", old) or frappe.db.exists("Workspace", new):
		return
	# The roles the page holds and the entry's link to it follow the rename (child rows, link fields)
	rename_doc(
		"Workspace", old, new, force=True, ignore_permissions=True, show_alert=False, rebuild_search=False
	)
	changes = {"label": new}
	# The page said the old name as its title; a title an administrator wrote stays
	if frappe.db.get_value("Workspace", new, "title") in (old, old_title):
		changes["title"] = neoresto.TITLE
	frappe.db.set_value("Workspace", new, changes, update_modified=False)


def _rename_the_menu_entry(old, old_title, old_page):
	new = neoresto.APP
	if (
		old == new
		or not frappe.db.exists("App Customization", old)
		or frappe.db.exists("App Customization", new)
	):
		return
	rename_doc(
		"App Customization",
		old,
		new,
		force=True,
		ignore_permissions=True,
		show_alert=False,
		rebuild_search=False,
	)
	changes = {"app_name": new}
	if frappe.db.get_value("App Customization", new, "app_title") == old_title:
		changes["app_title"] = neoresto.TITLE
	# The theme opens the first page of the entry, and writes its link from that page's name at each save (`/app/<slug>`): it follows the page's new name
	if frappe.db.get_value("App Customization", new, "app_route") == f"/app/{slug(old_page)}":
		changes["app_route"] = f"/app/{slug(neoresto.WORKSPACE)}"
	frappe.db.set_value("App Customization", new, changes, update_modified=False)


def _carry_the_site_flag():
	"""The site's configuration said `neorestau_active`: it says the new name from now on. The new name, when the site already has it, stays as it says."""
	if mode.LEGACY_SITE_FLAG not in frappe.conf:
		return
	if mode.SITE_FLAG not in frappe.conf:
		frappe.installer.update_site_config(mode.SITE_FLAG, frappe.conf.get(mode.LEGACY_SITE_FLAG))
	# "None" is how Frappe's own writer asks for a key to be removed
	frappe.installer.update_site_config(mode.LEGACY_SITE_FLAG, "None")
