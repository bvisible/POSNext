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
