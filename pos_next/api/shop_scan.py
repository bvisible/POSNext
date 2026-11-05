# //// Neoffice — added file (no upstream equivalent).
"""The endpoints of scanning in the shop (pos_next.shop_scan): the phone's, open to any visitor and gated by the session's
token, and the till's, for its own users.

A shop's Wi-Fi is one address for every customer in it: the session's limit is per address, but wide (120 an hour).
"""

import frappe

# //// Neoffice — the limits count the address nginx accepted, not the first entry of X-Forwarded-For
# //// (maintenance#2296)
from pos_next.rate_limits import rate_limit_by_peer
from pos_next.shop_scan import cart, control, payment, session, till

SESSIONS_PER_ADDRESS = 120
# A payment page opened per cart and attempt: a shop full of customers on one Wi-Fi stays far below it
PAYMENTS_PER_ADDRESS = 120
# //// Neoffice — a scan prices the cart and saves it as the system: limited since maintenance#2296, far above
# //// a shop full of customers scanning on one Wi-Fi
SCANS_PER_MINUTE = 600


# //// Neoffice — `str`: a key is a text, see session.start; by the address nginx accepted (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit_by_peer(limit=SESSIONS_PER_ADDRESS, seconds=60 * 60)
def start_shop_session(key: str | None):  # permission-check: ok a public door: the poster's key is its gate
	"""Open a phone's session from the shop's QR code: {"token", "shop_name", "expires_at"}."""
	return session.start(key)


# //// Neoffice — `str`: see guest_ordering._get_token_doc; its calls are counted (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit_by_peer(limit=SCANS_PER_MINUTE, seconds=60)
def scan_item(token: str, barcode: str | None, qty=1):  # permission-check: ok the session's token is the gate
	return cart.scan(token, barcode, qty)


# //// Neoffice — `str`: see guest_ordering._get_token_doc; its calls are counted (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit_by_peer(limit=SCANS_PER_MINUTE, seconds=60)
def set_line_qty(token: str, line: str | None, qty):  # permission-check: ok the session's token is the gate
	return cart.set_line_qty(token, line, qty)


# //// Neoffice — `str`: see guest_ordering._get_token_doc (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
def get_shop_cart(token: str):
	return cart.get(token)


# //// Neoffice — `str`: see guest_ordering._get_token_doc (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
def finish_shop_cart(token: str):  # permission-check: ok the session's token is the gate
	return cart.finish(token)


# //// Neoffice — `str`: see guest_ordering._get_token_doc; by the address nginx accepted (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit_by_peer(limit=PAYMENTS_PER_ADDRESS, seconds=60 * 60)
def pay_shop_cart(token: str):  # permission-check: ok the session's token is the gate
	"""Open the payment page of the phone's cart, for what the server says it owes: {"payment_url", "intent_name"}."""
	return payment.start(token)


# //// Neoffice — `str`: see guest_ordering._get_token_doc (maintenance#2296).
@frappe.whitelist(allow_guest=True, methods=["POST"])
def confirm_shop_payment(token: str):
	"""The phone is back from the payment page: whether the provider settled it, and the cart."""
	return payment.confirm(token)


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


@frappe.whitelist(methods=["POST"])
def validate_shop_cart(code, pos_profile, missing=None, pos_opening_shift=None):
	"""The seller checked the paid cart of `code`: the sale submitted, the missing lines ({line, qty}) refunded first."""
	from pos_next.api.cash_entry import require_till_user

	require_till_user(pos_profile)
	return control.validate(code, pos_profile, missing, pos_opening_shift)


@frappe.whitelist()
def get_shop_poster(pos_profile):
	"""The address of the shop's QR code and the shop's name, for the poster the till prints (lot 5)."""
	from pos_next.api.cash_entry import require_till_user

	require_till_user(pos_profile)
	return session.poster_of(pos_profile)
