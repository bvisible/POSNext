# API module for POS Next

import frappe

# Import API modules to make them accessible
from . import auth, customers, invoices, items, offers, pos_profile, promotions, shifts, utilities

# //// Neoffice — pos_next/api/customer_display.py has no upstream equivalent: the fork drives a
# //// second, customer-facing screen (cart mirror, TWINT QR, self-service account creation) that
# //// upstream's retail POS does not ship. Listed here with the other API modules so it loads with
# //// the package (185c3c50, 2026-02-03 — the commit that added the whole CFD).
from . import customer_display


@frappe.whitelist(allow_guest=True)
def ping():
	"""Simple ping endpoint for connectivity checks"""
	return "pong"
