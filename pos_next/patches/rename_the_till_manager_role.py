# //// Neoffice — added file (no upstream equivalent). pre_model_sync patch: upstream's till manager role is
# //// `Nexus POS Manager`; the fork calls it `POSNext Manager`, the twin of `POSNext Cashier` (product owner,
# //// 09.11.2026: « c'est quoi ce rôle Nexus ? […] je veux pas de rôle comme ça »). The name is also written in the
# //// permission rows of about forty doctypes and reports (renamed in the files by scripts/rename_the_till_manager_role.py,
# //// which is run again after every upstream merge). On a site that already exists, the role itself and everything
# //// that points at it (the accounts that hold it, every DocPerm and Custom DocPerm, workspaces, pages and reports)
# //// must follow, and before the doctype sync: the sync writes the permission rows of the new name, and a rename done
# //// after it would meet a role that already exists.
import frappe

OLD = "Nexus POS Manager"
NEW = "POSNext Manager"


def execute():
	rename(OLD, NEW)


def rename(old, new):
	"""Rename a role, with its links. A site where both exist keeps the new one and moves what pointed at the old.

	Safe to run again: with no `old` role, it does nothing.
	"""
	if not frappe.db.exists("Role", old):
		return

	frappe.rename_doc(
		"Role",
		old,
		new,
		force=True,
		merge=bool(frappe.db.exists("Role", new)),
		ignore_permissions=True,
		show_alert=False,
		rebuild_search=False,
	)
	# the name of a role is its `role_name` (autoname by field): a rename moves the name, not the field
	if frappe.db.get_value("Role", new, "role_name") != new:
		frappe.db.set_value("Role", new, "role_name", new, update_modified=False)
	frappe.clear_cache()
