# //// Neoffice — added file (no upstream equivalent).
"""The cashier no longer cancels nor amends a sale, nor validates a payment from the desk (maintenance#852).

The POSNext Cashier role held cancel and amend on every Sales Invoice, and submit on Payment Entry: rules of the
upstream fixture (setup/custom_docperm.json), which `install.grant_cashier_permissions` gives a site that has no rule
for the role yet, and never corrects on a site that has one. They were not limited to the till's sales nor to the
cashier's own, and opened « take the money, then cancel the sale » from the desk. The till itself never used them: its
payment entries are made with permissions off (`partial_payments`), and no screen of the till cancels or amends an
invoice (a table's order is a draft, deleted by `cancel_table_order`).

Cancelling and amending belong to the manager (decision Q5, 26.09): the till manager holds them now through his own
Sales Invoice rule, which the after_migrate grant makes (maintenance#2078). Each rule of the cashier on these two
doctypes, level 0, is set to exactly the rights of the file, the way `billing_prepares_sales_invoices` (neoffice_theme)
did it for Billing. The modified date is left alone: the theme's permission sync reads it.
"""

import json

import frappe
from frappe.permissions import rights
from frappe.utils import cint

CASHIER_ROLE = "POSNext Cashier"
DOCTYPES = ("Sales Invoice", "Payment Entry")


def declared_rights():
	"""The rights setup/custom_docperm.json gives the cashier on each doctype of DOCTYPES, level 0: {doctype: set}."""
	with open(frappe.get_app_path("pos_next", "setup", "custom_docperm.json")) as f:
		rules = json.load(f)
	return {
		rule["parent"]: {right for right in rights if cint(rule.get(right))}
		for rule in rules
		if rule.get("role") == CASHIER_ROLE
		and rule.get("parent") in DOCTYPES
		and not cint(rule.get("permlevel"))
	}


def execute():
	for doctype, declared in declared_rights().items():
		names = frappe.get_all(
			"Custom DocPerm",
			filters={"parent": doctype, "role": CASHIER_ROLE, "permlevel": 0},
			pluck="name",
		)
		for name in names:
			frappe.db.set_value(
				"Custom DocPerm",
				name,
				{right: int(right in declared) for right in rights},
				update_modified=False,
			)
		if names:
			frappe.clear_cache(doctype=doctype)
