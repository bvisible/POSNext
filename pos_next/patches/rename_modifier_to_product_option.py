#//// Neoffice — added file (no upstream equivalent). pre_model_sync patch for the rename of
#//// upstream's Item Modifier* doctypes to Product Option*: they describe restaurant product
#//// options (sauce, cooking, extras), which "modifier" made ambiguous against item variants.
#//// It has to run before the doctype sync, otherwise migrate creates the renamed tables empty
#//// and leaves the data behind (a1da8cc0, 2026-03-23 "feat: rename Item Modifier → Product
#//// Option Group").
import frappe

def execute():
	"""Rename Item Modifier DocTypes to Product Option DocTypes."""
	renames = [
		("Item Modifier Option", "Product Option"),
		("Item Modifier Group Item", "Product Option Group Item"),
		("Item Modifier Group", "Product Option Group"),
	]
	for old_name, new_name in renames:
		if frappe.db.exists("DocType", old_name) and not frappe.db.exists("DocType", new_name):
			frappe.rename_doc("DocType", old_name, new_name, force=True)
			frappe.db.commit()
