# //// Neoffice — added file (no upstream equivalent).
"""The endpoints of scanning in the shop (pos_next.shop_scan): the phone's, open to any visitor and gated by the session's
token, and the till's, for its own users.

A shop's Wi-Fi is one address for every customer in it: the session's limit is per address, but wide (120 an hour).
"""

import frappe
from frappe.rate_limiter import rate_limit

from pos_next.shop_scan import cart, session, till

SESSIONS_PER_ADDRESS = 120


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=SESSIONS_PER_ADDRESS, seconds=60 * 60)
def start_shop_session(key):
	"""Open a phone's session from the shop's QR code: {"token", "shop_name", "expires_at"}."""
	return session.start(key)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def scan_item(token, barcode, qty=1):
	return cart.scan(token, barcode, qty)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def set_line_qty(token, line, qty):
	return cart.set_line_qty(token, line, qty)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def get_shop_cart(token):
	return cart.get(token)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def finish_shop_cart(token):
	return cart.finish(token)


@frappe.whitelist()
def open_shop_cart(code, pos_profile):
	"""The phone's cart of `code` at the cashier's till, as it was priced; None for a code this till has no cart of."""
	from pos_next.api.cash_entry import require_till_user

	require_till_user(pos_profile)
	return till.open_cart(code, pos_profile)


@frappe.whitelist()
def list_shop_carts(pos_profile):
	"""The phones' carts of the cashier's till still waiting to be sold (the till's drafts list shows them)."""
	from pos_next.api.cash_entry import require_till_user

	require_till_user(pos_profile)
	return till.list_carts(pos_profile)
