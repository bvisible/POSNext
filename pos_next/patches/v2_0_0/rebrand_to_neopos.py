#//// Neoffice — added file (no upstream equivalent). Existing installs carry a "POS Next
#//// Receipt" Print Format whose name is its ID and which every POS Profile references; the
#//// fork is sold as Neopos, so the document is renamed (or dropped when the target already
#//// exists), the references rewritten, and the "POS Next" wording in Custom Field labels and
#//// descriptions replaced (771950bd, 2026-04-02 "rebrand: rename POS Next to Neopos").
import frappe


def execute():
	"""Rebrand POS Next to Neopos: rename Print Format and update custom field labels."""
	# Rename Print Format if it exists
	if frappe.db.exists("Print Format", "POS Next Receipt"):
		if not frappe.db.exists("Print Format", "Neopos Receipt"):
			frappe.rename_doc("Print Format", "POS Next Receipt", "Neopos Receipt", force=True)
		else:
			# Target already exists, just delete the old one
			frappe.delete_doc("Print Format", "POS Next Receipt", force=True, ignore_permissions=True)

	# Update POS Profiles that reference the old print format name
	frappe.db.sql("""
		UPDATE `tabPOS Profile`
		SET print_format = 'Neopos Receipt'
		WHERE print_format = 'POS Next Receipt'
	""")

	# Update custom field labels
	frappe.db.sql("""
		UPDATE `tabCustom Field`
		SET label = REPLACE(label, 'POS Next', 'Neopos')
		WHERE label LIKE '%POS Next%'
	""")

	# Update custom field descriptions
	frappe.db.sql("""
		UPDATE `tabCustom Field`
		SET description = REPLACE(description, 'POS Next', 'Neopos')
		WHERE description LIKE '%POS Next%'
	""")

	frappe.db.commit()
