import frappe
from frappe import _
from frappe.utils.password import check_password

# //// Neoffice — the only throttle on this path, so it counts the address nginx accepted, which a caller
# //// cannot write: on a vhost that appends to X-Forwarded-For the first entry reset it at will
# //// (maintenance#2296).
from pos_next.rate_limits import rate_limit_by_peer


@frappe.whitelist()
# //// Neoffice — by the address nginx accepted, see the import (maintenance#2296).
@rate_limit_by_peer(limit=5, seconds=60)
def verify_session_password(password=None):  # permission-check: ok the caller's own password, nothing else
	"""Verify the current session user's password for session lock re-authentication.

	NOTE: We must NOT raise frappe.AuthenticationError here because Frappe's
	error handler (app.py) calls login_manager.clear_cookies() for that
	exception type, which would destroy the user's session on a wrong password.
	Instead, we return a structured response indicating success or failure.
	"""
	if not password:
		return {"verified": False, "message": _("Password is required")}

	try:
		check_password(frappe.session.user, password)
		return {"verified": True}
	except frappe.AuthenticationError:
		return {"verified": False, "message": _("Incorrect password")}
