# //// Neoffice — added file (no upstream equivalent).
"""The session a phone opens from a shop's fixed QR code.

The QR code carries the key of one shop till (POS Settings.shop_scan_key). A session opens only where that till lets
customers scan (enable_shop_scan), is no restaurant till, and has a shift open: it is bound to that shift and dies with it
(Guest Order Token.is_valid), and it lives the lifetime of an abandoned cart the till sets.
"""

import secrets

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, now_datetime

from pos_next.restaurant.mode import effective_restaurant_mode

DEFAULT_LIFETIME_HOURS = 4
SETTINGS_FIELDS = (
	"name",
	"pos_profile",
	"enable_shop_scan",
	"enable_restaurant_mode",
	"restaurant",
	"shop_cart_lifetime_hours",
	"shop_scan_phone_payment",
	"shop_scan_validation_on_phone",
)


def _unavailable():
	# One answer for an unknown key, a till that does not let customers scan and a restaurant till: nothing says which
	frappe.throw(_("Scanning in the shop is not available here."))


def shop_key(pos_profile: str) -> str:
	"""The key of the till's QR code, set the first time it is asked for."""
	name = frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, "name")
	if not name:
		frappe.throw(_("This till has no settings yet."))
	key = frappe.db.get_value("POS Settings", name, "shop_scan_key")
	if not key:
		key = secrets.token_urlsafe(16)
		frappe.db.set_value("POS Settings", name, "shop_scan_key", key, update_modified=False)
	return key


def poster_of(pos_profile: str) -> dict:
	"""What the poster of the shop's QR code carries: the address the code opens, and the shop's name (lot 5)."""
	from frappe.utils import get_url

	company = frappe.db.get_value("POS Profile", pos_profile, "company")
	return {
		"url": f"{get_url()}/pos/shop/{shop_key(pos_profile)}",
		"shop_name": frappe.db.get_value("Company", company, "company_name") or company,
	}


def is_shop_till(settings) -> bool:
	"""Whether a till's POS Settings (as a dict) let customers scan: switched on, and no restaurant till."""
	return bool(
		settings and cint(settings.get("enable_shop_scan")) and not effective_restaurant_mode(settings)
	)


def settings_of(pos_profile: str):
	return frappe.db.get_value(
		"POS Settings", {"pos_profile": pos_profile, "enabled": 1}, list(SETTINGS_FIELDS), as_dict=True
	)


def start(key: str) -> dict:
	"""Open a phone's session on the till whose QR code carries `key`: {"token", "shop_name", "expires_at"}."""
	from pos_next.api.guest_ordering import _get_active_pos_opening

	settings = (
		frappe.db.get_value(
			"POS Settings", {"shop_scan_key": key, "enabled": 1}, list(SETTINGS_FIELDS), as_dict=True
		)
		if key
		else None
	)
	if not is_shop_till(settings):
		_unavailable()
	opening = _get_active_pos_opening(settings.pos_profile)
	if not opening:
		frappe.throw(_("The shop is closed: scanning starts again when its till opens."))

	hours = cint(settings.shop_cart_lifetime_hours) or DEFAULT_LIFETIME_HOURS
	token_doc = frappe.get_doc(
		{
			"doctype": "Guest Order Token",
			"mode": "shop",
			"pos_profile": settings.pos_profile,
			"pos_opening": opening,
			"expires_at": add_to_date(now_datetime(), hours=hours),
		}
	)
	token_doc.flags.ignore_permissions = True
	token_doc.insert()
	company = frappe.db.get_value("POS Profile", settings.pos_profile, "company")
	return {
		"token": token_doc.token,
		"shop_name": frappe.db.get_value("Company", company, "company_name") or company,
		"expires_at": str(token_doc.expires_at),
	}


def require_shop_token(token: str):
	"""The phone's session of `token`: still valid, a shop one, on a till that still lets customers scan."""
	from pos_next.api.guest_ordering import _require_valid_token

	token_doc = _require_valid_token(token)
	if token_doc.mode != "shop":
		frappe.throw(_("This session has expired or is no longer active."), frappe.AuthenticationError)
	if not is_shop_till(settings_of(token_doc.pos_profile)):
		_unavailable()
	return token_doc
