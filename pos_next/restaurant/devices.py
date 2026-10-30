# //// Neoffice — added file (no upstream equivalent). The kitchen's and the runner's tablets (NeoRestau lot 1, task 16):
# //// a manager shows a QR code at the till, the tablet scans it and opens its screen with no password typed. The tablet
# //// signs in with an account of its own, bound to one restaurant and one screen: the kitchen (every station, or one)
# //// or the runner. This module holds the rules: the one-time code, the device account, and the gate that the
# //// kitchen's and the runner's endpoints open to it, and nothing else.
"""The tablets of a restaurant: one-time pairing codes, device accounts, and what a device account may reach.

A DEVICE ACCOUNT is a portal account (a Website User) with no role and no password anyone knows. It is recognised by its
binding, a `Restaurant Device` row: its restaurant, its screen (the kitchen or the runner) and, for the kitchen, the
station it shows (none: every station). Every endpoint of the till refuses a portal account (cash_entry.
require_system_user, which every gate of the till and of the restaurant starts with); the kitchen's and the runner's
endpoints accept a bound device account explicitly (`screen_device`), cut to its own restaurant and station, and
nothing wider. A tablet that is disconnected, or whose site no longer runs NeoRestau, is refused like any portal account.

A PAIRING CODE opens a device account in one browser, once. A manager of the restaurant makes it at the till
(pos_next.api.restaurant_devices.create_pairing_code). It is random (32 bytes, URL-safe), kept as its SHA-256 hash only,
bound to the restaurant, the screen, the station and its maker, valid five minutes, and spent by the first redeem that
reaches it: the redeem reads its row with a lock and marks it used before anything else. The tablet redeems it by a POST
from the page the QR code opens, never by a GET, so that a link preview cannot spend it, and the redeem is rate-limited
per address. The code travels in the fragment of the address (`/pos/pair#<code>`), which a browser never sends to the
server: it is in no access log and in no Referer.
"""

import hashlib
import re
import secrets
from urllib.parse import urlencode

import frappe
from frappe import _
from frappe.utils import add_to_date, get_fullname, now_datetime, time_diff_in_seconds

from pos_next.restaurant import scope
from pos_next.restaurant.mode import neorestau_active

DEVICE = "Restaurant Device"
PAIRING = "Restaurant Device Pairing"
KITCHEN = "Kitchen"
RUNNER = "Runner"
SCREENS = (KITCHEN, RUNNER)
# A code: 32 random bytes, URL-safe (43 characters); what a redeem accepts before it looks anything up
CODE_BYTES = 32
_CODE_SHAPE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
# How long a code opens a tablet, in seconds
CODE_LIFETIME = 5 * 60
# The domain of the device accounts' addresses: reserved by RFC 2606, it can never receive a mail
ACCOUNT_DOMAIN = "devices.invalid"
# A tablet polls its screen every few seconds: its last visit is written at most once a minute
SEEN_EVERY = 60


class PairingCodeError(frappe.ValidationError):
	"""A code that opens nothing: unknown, already used or expired (the three are told apart to nobody)."""


def new_code() -> str:
	return secrets.token_urlsafe(CODE_BYTES)


def code_hash(code: str) -> str:
	"""What is kept of a code: its SHA-256 hash. A code is 256 random bits, so a plain hash is enough to find it."""
	return hashlib.sha256(code.encode()).hexdigest()


def well_formed(code) -> bool:
	return isinstance(code, str) and bool(_CODE_SHAPE.match(code))


def refuse_code() -> None:
	frappe.throw(
		_("This code has expired or was already used. Ask for a new one at the till."), PairingCodeError
	)


def _refuse() -> None:
	frappe.throw(_("Not permitted"), frappe.PermissionError)


def screen_device(*screens: str) -> frappe._dict | None:
	"""The tablet the session user is, when he is a device account of one of `screens`; None for anyone else.

	A device account is a portal account, enabled, bound to a `Restaurant Device` row that is not disconnected, on a
	site that runs NeoRestau. A desk account never is one (its own gates decide for it), nor a visitor. The tablet's
	last visit is noted on its row (at most once a minute: it polls its screen).
	"""
	user = frappe.session.user
	if not user or user in ("Guest", "Administrator"):
		return None
	from pos_next.api.cash_entry import is_desk_account

	if is_desk_account() or not neorestau_active():
		return None
	try:
		device = frappe.db.get_value(
			DEVICE,
			{"user": user, "disconnected": 0},
			["name", "restaurant", "screen", "station", "last_seen"],
			as_dict=True,
		)
	except Exception as error:
		# The code is updated and the site is not migrated yet: no tablet exists
		if frappe.db.is_table_missing(error):
			return None
		raise
	if not device or device.screen not in screens or not frappe.get_cached_value("User", user, "enabled"):
		return None
	if not device.last_seen or time_diff_in_seconds(now_datetime(), device.last_seen) >= SEEN_EVERY:
		frappe.db.set_value(DEVICE, device.name, "last_seen", now_datetime(), update_modified=False)
	return device


def cut_to_device(device: frappe._dict, restaurant=None, station=None) -> tuple[str, str | None]:
	"""The restaurant and the station a tablet's call is answered for: its own.

	A call that names another restaurant is refused, and so is a station that is not the tablet's (a kitchen tablet of
	one station) or not of its restaurant (a kitchen tablet of every station). A call that names none is answered for
	the tablet's restaurant and, on a tablet of one station, for that station.
	"""
	if restaurant and restaurant != device.restaurant:
		_refuse()
	if station:
		if not isinstance(station, str):
			_refuse()
		# A tablet of one station: its binding names it (whatever became of the station since)
		if device.station:
			if station != device.station:
				_refuse()
		elif scope.restaurant_of_record("Preparation Station", station) != device.restaurant:
			_refuse()
	return device.restaurant, device.station or station or None


def require_order_of_device(device: frappe._dict, invoice_name) -> None:
	"""Refuse a tablet an invoice that is not an open order of its restaurant (a draft at a table, or to take away).

	A refusal says nothing of whether the invoice exists.
	"""
	if not isinstance(invoice_name, str) or not invoice_name:
		_refuse()
	order = frappe.db.get_value(
		"Sales Invoice",
		invoice_name,
		["name", "docstatus", "restaurant_table", "is_takeaway", "pos_profile"],
		as_dict=True,
	)
	if not order or order.docstatus != 0 or not (order.restaurant_table or order.is_takeaway):
		_refuse()
	if not scope.keep_orders_of([order], device.restaurant):
		_refuse()


def screen_settings(restaurant: str) -> dict:
	"""What a tablet's screen reads of its restaurant's settings: whether the runner step is on.

	The opening hours, the tips, the guest ordering and the reservations are no tablet's business: the answer keeps
	only the shape the screens read (`get_restaurant_settings`).
	"""
	return {
		"restaurant": restaurant,
		"enable_runner": bool(frappe.db.get_value("Restaurant", restaurant, "enable_runner")),
		"opening_hours": [],
		"is_open": True,
		"current_slot": None,
	}


def device_label(screen: str, station: str | None = None) -> str:
	"""How a tablet is named: the runner, the kitchen of every station, or the kitchen of one station."""
	if screen == RUNNER:
		return _("Runner")
	if not station:
		return _("Kitchen, all stations")
	label = frappe.db.get_value("Preparation Station", station, "station_name") or station
	return _("Kitchen — {0}").format(label)


def screen_path(device: frappe._dict) -> str:
	"""The address of a tablet's screen: the kitchen (of its station) or the runner, of its restaurant."""
	query = {"restaurant": device.restaurant}
	if device.screen == RUNNER:
		return f"/pos/runner?{urlencode(query)}"
	if device.station:
		query["station"] = device.station
	return f"/pos/kds?{urlencode(query)}"


def pair(pairing: frappe._dict) -> frappe._dict:
	"""The tablet a spent code opens: the restaurant's device of that screen (and station), found or made, with its
	account, marked paired by the maker of the code and no longer disconnected."""
	filters = {
		"restaurant": pairing.restaurant,
		"screen": pairing.screen,
		"station": pairing.station or ["is", "not set"],
	}
	name = frappe.db.get_value(DEVICE, filters, "name", order_by="creation asc")
	device_name = pairing.device_name or device_label(pairing.screen, pairing.station)
	user = frappe.db.get_value(DEVICE, name, "user") if name else None
	if not (user and frappe.db.exists("User", user)):
		user = make_account(device_name, pairing.restaurant)
	values = {
		"device_name": device_name,
		"user": user,
		"paired_by": pairing.owner,
		"paired_at": now_datetime(),
		"disconnected": 0,
	}
	if name:
		frappe.db.set_value(DEVICE, name, values)
	else:
		name = (
			frappe.get_doc(
				{
					"doctype": DEVICE,
					"restaurant": pairing.restaurant,
					"screen": pairing.screen,
					"station": pairing.station or None,
					**values,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
	keep_a_device_account(user)
	return frappe.db.get_value(
		DEVICE, name, ["name", "device_name", "restaurant", "screen", "station", "user"], as_dict=True
	)


def make_account(device_name: str, restaurant: str) -> str:
	"""A new device account: a portal account at an address that can receive no mail, with no password and no role."""
	label = frappe.db.get_value("Restaurant", restaurant, "restaurant_name") or restaurant
	account = frappe.get_doc(
		{
			"doctype": "User",
			"email": f"tablet-{frappe.generate_hash(length=16)}@{ACCOUNT_DOMAIN}",
			"first_name": f"{device_name} ({label})"[:140],
			"user_type": "Website User",
			"send_welcome_email": 0,
			"enabled": 1,
		}
	)
	account.flags.ignore_permissions = True
	account.flags.no_welcome_mail = True
	account.insert()
	return account.name


def keep_a_device_account(user: str) -> None:
	"""A device account is an enabled portal account that holds no role at all.

	Other apps give every new user a role of theirs as it is inserted (the suite's, the learning platform's, the
	wiki's): a device account keeps none, so that nothing but its binding opens anything to it. Written straight to the
	database, so that no hook of another app runs again on it.
	"""
	frappe.db.delete("Has Role", {"parent": user, "parenttype": "User"})
	frappe.db.set_value("User", user, {"user_type": "Website User", "enabled": 1}, update_modified=False)
	frappe.clear_cache(user=user)


def log_pairing(device: frappe._dict, paired_by: str) -> None:
	"""The Activity Log says which tablet opened, and which manager paired it."""
	frappe.get_doc(
		{
			"doctype": "Activity Log",
			"user": device.user,
			"operation": "Login",
			"status": "Success",
			"subject": _("{0} was opened on a tablet, paired by {1}").format(
				device.device_name, get_fullname(paired_by)
			),
			"reference_doctype": DEVICE,
			"reference_name": device.name,
			"link_doctype": "User",
			"link_name": paired_by,
		}
	).insert(ignore_permissions=True, ignore_links=True)


def sign_in(device: frappe._dict, paired_by: str) -> None:
	"""Open the device account's session in the browser that redeemed the code: the session cookie of a normal login.

	The session names the manager who paired the tablet as its audit user. The session id stays in its HttpOnly cookie:
	the fork's login answers it in the response body as well (for the mobile application), which is taken out here.
	"""
	frappe.local.login_manager.login_as(device.user, audit_user=paired_by)
	for key in ("sid", "user_id", "full_name", "user_image", "home_page", "redirect_to"):
		frappe.local.response.pop(key, None)


def end_sessions(user: str, reason: str) -> int:
	"""End every session of a device account (in the database and in the cache); the number ended."""
	from frappe.sessions import delete_session

	sids = frappe.db.sql("select sid from `tabSessions` where user = %s", user, pluck=True)
	for sid in sids:
		delete_session(sid, user=user, reason=reason)
	return len(sids)


def forget_old_codes() -> None:
	"""A code is deleted a day after it expired: what a pairing did stays on its device and in the Activity Log."""
	frappe.db.delete(PAIRING, {"expires_at": ["<", add_to_date(now_datetime(), days=-1)]})
