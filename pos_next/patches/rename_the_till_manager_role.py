# //// Neoffice — added file (no upstream equivalent). pre_model_sync patch: upstream's till manager role is
# //// `Nexus POS Manager`; the fork calls it `POSNext Manager`, the twin of `POSNext Cashier` (product owner,
# //// 09.11.2026: « c'est quoi ce rôle Nexus ? […] je veux pas de rôle comme ça »). The name is also written in the
# //// permission rows of about forty doctypes and reports (renamed in the files by scripts/rename_the_till_manager_role.py,
# //// which is run again after every upstream merge). On a site that already exists, the role itself and everything
# //// that points at it (the accounts that hold it, every DocPerm and Custom DocPerm, workspaces, pages and reports)
# //// must follow, and before the doctype sync: the sync writes the permission rows of the new name, and a rename done
# //// after it would meet a role that already exists.
import frappe
from frappe.model.rename_doc import rename_doc

OLD = "Nexus POS Manager"
NEW = "POSNext Manager"


def execute():
	rename(OLD, NEW)


def rename(old, new):
	"""Rename a role, with its links. A site where both exist keeps the new one and moves what pointed at the old.

	Safe to run again: with no `old` role, it does nothing.
	"""
	if not frappe.db.exists("Role", old):
		# The record is gone but accounts or rules can still carry its name (a site where the role was never made, or was
		# deleted by hand). Frappe refuses to save an account whose row names a role that does not exist, and the first
		# save the update makes of such an account makes the role again, under the name retired here: seen on the first
		# client instance that took this patch (neoffice-maintenance#2428).
		_move_what_still_says(old, new)
		return

	merging = bool(frappe.db.exists("Role", new))
	# the model's own function: the fork's `frappe.rename_doc` is whitelisted and takes no `ignore_permissions`
	rename_doc(
		"Role",
		old,
		new,
		force=True,
		merge=merging,
		ignore_permissions=True,
		show_alert=False,
		rebuild_search=False,
	)
	if merging:
		_hold_the_role_once(new)
	# the name of a role is its `role_name` (autoname by field): a rename moves the name, not the field
	if frappe.db.get_value("Role", new, "role_name") != new:
		frappe.db.set_value("Role", new, "role_name", new, update_modified=False)
	_move_what_still_says(old, new)
	frappe.clear_cache()


def _move_what_still_says(old, new):
	"""Every account and permission rule that still names `old` names `new`, and a row that would be a second copy goes."""
	holders = frappe.get_all(
		"Has Role", filters={"role": old}, fields=["name", "parent", "parenttype", "parentfield"]
	)
	rules = {
		doctype: frappe.get_all(
			doctype, filters={"role": old}, fields=["name", "parent", "permlevel", "if_owner"]
		)
		for doctype in ("Custom DocPerm", "DocPerm")
	}
	if not holders and not any(rules.values()):
		return
	if not frappe.db.exists("Role", new):
		frappe.get_doc({"doctype": "Role", "role_name": new, "desk_access": 1}).insert(ignore_permissions=True)
	for row in holders:
		twin = {
			"parent": row.parent,
			"parenttype": row.parenttype,
			"parentfield": row.parentfield,
			"role": new,
		}
		if frappe.db.exists("Has Role", twin):
			frappe.db.delete("Has Role", {"name": row.name})
		else:
			frappe.db.set_value("Has Role", row.name, "role", new, update_modified=False)
	for doctype, rows in rules.items():
		for rule in rows:
			twin = {"parent": rule.parent, "role": new, "permlevel": rule.permlevel, "if_owner": rule.if_owner}
			if frappe.db.exists(doctype, twin):
				frappe.db.delete(doctype, {"name": rule.name})
			else:
				frappe.db.set_value(doctype, rule.name, "role", new, update_modified=False)


def _hold_the_role_once(role):
	"""A merge moves the rows of the old role onto the new one: an account that held both now holds the new one twice."""
	seen = set()
	for row in frappe.get_all(
		"Has Role",
		filters={"role": role},
		fields=["name", "parent", "parenttype", "parentfield"],
		order_by="creation, name",
	):
		key = (row.parent, row.parenttype, row.parentfield)
		if key in seen:
			frappe.db.delete("Has Role", {"name": row.name})
		else:
			seen.add(key)
