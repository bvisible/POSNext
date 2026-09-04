# -*- coding: utf-8 -*-
# API module for POS Next

import frappe

# Import API modules to make them accessible
from . import invoices
from . import items
from . import shifts
from . import pos_profile
from . import customers
from . import offers
from . import promotions
from . import utilities
#//// Neoffice — pos_next/api/customer_display.py has no upstream equivalent: the fork drives a
#//// second, customer-facing screen (cart mirror, TWINT QR, self-service account creation) that
#//// upstream's retail POS does not ship. Listed here with the other API modules so it loads with
#//// the package (185c3c50, 2026-02-03 — the commit that added the whole CFD).
# //// use dynamic customer group and territory lookup for customer display — 185c3c5
from . import customer_display
from . import auth

@frappe.whitelist(allow_guest=True)
def ping():
    """Simple ping endpoint for connectivity checks"""
    return "pong"
