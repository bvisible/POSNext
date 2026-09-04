#//// Neoffice — added file (no upstream equivalent). Child table on POS Profile listing which
#//// Journal Entry Templates the cashier may pick for a cash in/out movement, so a till cannot post
#//// to an arbitrary account. Cash movement outside a sale is ours to begin with: upstream closes a
#//// shift with whatever is in the drawer (82b2493a, 2026-03-28 "form at top on selection + POS
#//// Profile template filter config"; feature: 6c598630, same day).
import frappe
from frappe.model.document import Document


class POSCashEntryTemplate(Document):
	pass
