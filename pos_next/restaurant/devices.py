# //// Neoffice — added file (no upstream equivalent). The kitchen's and the runner's tablets (NeoRestau lot 1, task 16):
# //// a manager shows a QR code at the till, the tablet scans it and opens its screen with no password typed. The tablet
# //// signs in with an account of its own, bound to one restaurant and one screen: the kitchen (every station, or one)
# //// or the runner. This module holds the rules: the one-time token, the device account and the guards that keep it
# //// one, the gate the kitchen's and the runner's endpoints open to it, and the confinement of its session to them.
"""The tablets of a restaurant: one-time pairing tokens, device accounts, and what a device account may reach.

A DEVICE ACCOUNT is a portal account (a Website User) with no role, no password and no API key. Its address is minted
here, `tablet-<nonce>-<mark>@devices.invalid`, the mark being an HMAC of the nonce under the site's encryption key: no
account can pass for one without that key (`minted_here`). It is opened only by this module's pairing, which raises
PAIRING_FLAG around its own writes of the account and SIGN_IN_FLAG for its one sign-in; the guards of the User doctype
refuse everyone else a role, a password, an API key, another user type or a new name for it (or its address), and its
sign-in by any other path (`guard_*`). Disconnecting, removing a tablet or its restaurant touches an account only when it
was minted here: a row that names any other account leaves that account alone.

Its BINDING is a `Restaurant Device` row: its restaurant, its screen (the kitchen or the runner) and, for the kitchen,
the station it shows (none: every station). A pairing reuses the row's account only when it is a device account made
here; any other account a row may name (an administrator, a cashier, a customer) is never signed in: a fresh device
account replaces it.

Its SESSION is confined (`confine_tablet_session`, an auth hook, run for every request once the caller is known, by
cookie, token or key): the page of its screen and the assets, the calls its screens make and nothing else; every other
call gets the 403 a portal account gets. The kitchen's and the runner's endpoints accept it (`screen_device`), cut to
its own restaurant and station; an account that is no longer a clean device account, or a session older than the
tablet's last disconnection, has its sessions ended and is refused, never handed to the desk's gates.

A PAIRING TOKEN opens a device account in one browser, once. A manager of the restaurant makes it at the till
(pos_next.api.restaurant_devices.create_pairing_code). It is random (32 bytes, URL-safe), kept as its SHA-256 hash only,
bound to the restaurant, the screen, the station and its maker, valid five minutes, retired when its maker makes
another for the same screen or closes the dialog, and spent by the first redeem that reaches it: the redeem reads its row
with a lock and marks it used before anything else. The tablet redeems it by a POST from the page the QR code opens,
never by a GET, so that a link preview cannot spend it; the redeem is rate-limited per address. The token travels in the
fragment of the address (`/pos/pair#<token>`), which a browser never sends to the server: it is in no access log and in
no Referer. On the server it is named `token` wherever it is held, which Frappe's error snapshots redact.
"""

import hashlib
import hmac
import re
import secrets
from contextlib import contextmanager
from urllib.parse import urlencode

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, get_fullname, now_datetime, time_diff_in_seconds

from pos_next.restaurant import scope
from pos_next.restaurant.mode import neorestau_active

DEVICE = "Restaurant Device"
PAIRING = "Restaurant Device Pairing"
KITCHEN = "Kitchen"
RUNNER = "Runner"
SCREENS = (KITCHEN, RUNNER)
# The states a kitchen's tablet may set on an order or a line: the kitchen's own (Waiting is the till's: not sent yet)
KDS_STATES = ("Pending", "Preparing", "Ready", "Delivered")
# A token: 32 random bytes, URL-safe (43 characters); what a redeem accepts before it looks anything up
TOKEN_BYTES = 32
_TOKEN_SHAPE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
# How long a token opens a tablet, in seconds
TOKEN_LIFETIME = 5 * 60
# The domain of the device accounts' addresses: reserved by RFC 2606, it can never receive a mail
ACCOUNT_DOMAIN = "devices.invalid"
_ACCOUNT_NAME = re.compile(r"^tablet-([0-9a-f]{16})-([0-9a-f]{24})@devices\.invalid$")
# A tablet polls its screen every few seconds: its last visit is written at most once a minute
SEEN_EVERY = 60
# The redeems one address may try: a restaurant pairs a few tablets at a time, from the same address
REDEEM_LIMIT = 10
REDEEM_WINDOW = 10 * 60
# Raised by this module around its own writes of a device account (not its sign-in): the guards let nothing else write it
PAIRING_FLAG = "pos_next_pairing_a_tablet"
# Names the one device account the pairing signs in, and is taken by the first on_login that sees it
SIGN_IN_FLAG = "pos_next_signing_a_tablet_in"
_FRESH_DEVICE = "pos_next_fresh_device"

# What a tablet's session may call: the calls of its screens, pairing again, what the app reads as it starts (who is
# signed in, the words of its language, whether the server answers, the site's name for the socket), the socket server's
# authentication of its connection, and signing out. Measured on the screens' traffic (task 16, fix round 1).
TABLET_METHODS = frozenset(
	{
		"pos_next.api.restaurant.get_tables",
		"pos_next.api.restaurant.get_preparation_stations",
		"pos_next.api.restaurant.get_kds_orders",
		"pos_next.api.restaurant.update_item_kds_status",
		"pos_next.api.restaurant.update_kds_status",
		"pos_next.api.restaurant.get_runner_orders",
		"pos_next.api.restaurant.mark_items_delivered",
		"pos_next.api.restaurant.get_restaurant_settings",
		"pos_next.api.restaurant_devices.redeem_pairing_code",
		"frappe.auth.get_logged_user",
		"pos_next.api.localization.get_app_translations",
		"pos_next.api.localization.get_user_language",
		"pos_next.api.localization.get_allowed_locales",
		"pos_next.api.ping",
		"pos_next.api.utilities.get_site_info",
		"frappe.realtime.get_user_info",
		"logout",
		"web_logout",
		"frappe.handler.logout",
		"frappe.handler.web_logout",
	}
)
# The pages a tablet's session may open: the app of its screens and its service worker, the static assets, public files
TABLET_PAGES = ("/pos", "/pos-sw.js")
TABLET_PAGE_PREFIXES = ("/pos/", "/assets/", "/files/")
_API_METHOD_PREFIXES = ("/api/method/", "/api/v1/method/", "/api/v2/method/")


class PairingCodeError(frappe.ValidationError):
	"""A token that opens nothing: unknown, already used or expired (its message says which: refuse_token)."""


# --- tokens -----------------------------------------------------------------------------------------------------


def new_token() -> str:
	return secrets.token_urlsafe(TOKEN_BYTES)


def token_hash(token: str) -> str:
	"""What is kept of a token: its SHA-256 hash. A token is 256 random bits, so a plain hash is enough to find it."""
	return hashlib.sha256(token.encode()).hexdigest()


def well_formed(token) -> bool:
	return isinstance(token, str) and bool(_TOKEN_SHAPE.match(token))


def refuse_token(reason: str = "unknown") -> None:
	"""Refuse a token that opens nothing, saying why (`used`, `expired`, anything else: unknown), and count the refusal
	against the address that tried it (count_a_refusal). A token is 256 random bits: telling a used one from an unknown
	one tells a guesser nothing he could use, and tells the person who scanned it what to do."""
	count_a_refusal()
	if reason == "used":
		message = _(
			"This code was already used: a code opens one screen, once. Ask for a new one at the till."
		)
	elif reason == "expired":
		message = _("This code has expired: a code is valid for five minutes. Ask for a new one at the till.")
	else:
		message = _("This code opens no screen. Ask for a new one at the till.")
	frappe.throw(message, PairingCodeError)


def _refuse() -> None:
	frappe.throw(_("Not permitted"), frappe.PermissionError)


def retire_tokens(owner: str, restaurant: str, screen: str | None = None, station: str | None = None) -> None:
	"""Expire the tokens a maker made and nobody used yet: of one screen (a new token replaces them), or all of a
	restaurant's (its dialog is closed)."""
	now = now_datetime()
	values = {"owner": owner, "restaurant": restaurant, "now": now, "screen": screen, "station": station}
	# Written in SQL: Frappe's "is not set" on a Datetime compares it with '', which an UPDATE refuses in strict mode
	conditions = [
		"owner = %(owner)s",
		"restaurant = %(restaurant)s",
		"used_at is null",
		"expires_at > %(now)s",
	]
	if screen:
		conditions.append("screen = %(screen)s")
		conditions.append("station = %(station)s" if station else "ifnull(station, '') = ''")
	frappe.db.sql(
		f"update `tab{PAIRING}` set expires_at = %(now)s where {' and '.join(conditions)}",  # nosemgrep
		values,
	)


def forget_old_tokens() -> None:
	"""A token is deleted a day after it expired: what a pairing did stays on its device and in the Activity Log."""
	frappe.db.delete(PAIRING, {"expires_at": ["<", add_to_date(now_datetime(), days=-1)]})


def request_peer_ip() -> str:
	"""The address of the connection nginx accepted: the one X-Forwarded-For entry a caller cannot write.

	Copied from neoffice_devops.guards.request_peer_ip. Frappe's `frappe.local.request_ip` is the FIRST entry of
	X-Forwarded-For: where nginx appends to the header (a customer's website domain, tracker #1904) that entry is whatever
	the caller wrote, and only the last one is nginx's. A request without the header did not come through nginx: Frappe's
	own address stands.
	"""
	try:
		forwarded = frappe.get_request_header("X-Forwarded-For") or ""
	except (RuntimeError, AttributeError):
		forwarded = ""
	entries = [part.strip() for part in forwarded.split(",") if part.strip()]
	if entries:
		return entries[-1]
	return (getattr(frappe.local, "request_ip", None) or "").strip()


def _refusals_key() -> str | None:
	"""Where the refused redeems of the caller's address are counted; None for an in-process call (no web client).

	Frappe's rate limiter counts per `rl:<form_dict.cmd>:<request_ip>`: the v2 route never sets `cmd`, so a caller who
	sends a `cmd` of his own starts a new count at will, and `request_ip` is the entry of X-Forwarded-For a caller writes.
	This count is the redeem's own, per address nginx accepted the connection from.
	"""
	if not getattr(frappe.local, "request", None):
		return None
	return frappe.cache.make_key(f"pos_next:tablet-redeem:{request_peer_ip() or 'unknown'}")


def hold_back_a_guessing_address() -> None:
	"""Refuse an address whose redeems were refused REDEEM_LIMIT times within REDEEM_WINDOW, good token or not.

	Only refusals count: a restaurant pairs its stations and its runner from one public address, and a camera
	application may open a link twice; a guesser is refused every time.
	"""
	key = _refusals_key()
	if key and int(frappe.cache.get(key) or 0) >= REDEEM_LIMIT:
		frappe.throw(
			_("You hit the rate limit because of too many requests. Please try after sometime."),
			frappe.RateLimitExceededError,
		)


def count_a_refusal() -> None:
	"""One more refused redeem for the caller's address (the window starts at its first refusal)."""
	key = _refusals_key()
	if key:
		frappe.cache.set(key, 0, ex=REDEEM_WINDOW, nx=True)
		frappe.cache.incrby(key, 1)


# --- device accounts ----------------------------------------------------------------------------------------------


def _mark(nonce: str) -> str:
	from frappe.utils.password import get_encryption_key

	key = get_encryption_key().encode()
	return hmac.new(key, f"pos_next.restaurant_device:{nonce}".encode(), hashlib.sha256).hexdigest()[:24]


def new_account_name() -> str:
	nonce = secrets.token_hex(8)
	return f"tablet-{nonce}-{_mark(nonce)}@{ACCOUNT_DOMAIN}"


def minted_here(user) -> bool:
	"""Whether `user` is the address of a device account this module made: its mark is the site key's."""
	found = _ACCOUNT_NAME.match(user) if isinstance(user, str) else None
	return bool(found) and hmac.compare_digest(found.group(2), _mark(found.group(1)))


def desk_roles(user: str) -> list[str]:
	return frappe.db.sql(
		"""select hr.role from `tabHas Role` hr join `tabRole` r on r.name = hr.role
		where hr.parent = %s and hr.parenttype = 'User' and r.desk_access = 1""",
		user,
		pluck=True,
	)


def is_device_account(user) -> bool:
	"""A device account: made here, a portal account, holding no desk role (what a pairing may reuse)."""
	if not minted_here(user) or user in frappe.STANDARD_USERS:
		return False
	if frappe.db.get_value("User", user, "user_type") != "Website User":
		return False
	return not desk_roles(user)


def is_clean_device_account(user) -> bool:
	"""A device account as a pairing leaves it: enabled, a portal account, no role at all, no password, no API key."""
	if not is_device_account(user):
		return False
	account = frappe.db.get_value("User", user, ["enabled", "api_key"], as_dict=True)
	if not account or not account.enabled or account.api_key:
		return False
	if frappe.db.exists("Has Role", {"parent": user, "parenttype": "User"}):
		return False
	# A password or an API secret lives in __Auth
	return not frappe.db.sql("select 1 from `__Auth` where doctype = 'User' and name = %s limit 1", user)


@contextmanager
def pairing_writes():
	"""This module's own writes of a device account and its sign-in, which the guards let through."""
	previous = frappe.local.flags.get(PAIRING_FLAG)
	frappe.local.flags[PAIRING_FLAG] = True
	try:
		yield
	finally:
		frappe.local.flags[PAIRING_FLAG] = previous


def _pairing() -> bool:
	return bool(frappe.local.flags.get(PAIRING_FLAG))


def make_account(device_name: str, restaurant: str) -> str:
	"""A new device account: a portal account at an address minted here, with no password and no role."""
	label = frappe.db.get_value("Restaurant", restaurant, "restaurant_name") or restaurant
	with pairing_writes():
		account = frappe.get_doc(
			{
				"doctype": "User",
				"email": new_account_name(),
				"first_name": f"{device_name} ({label})"[:140],
				"user_type": "Website User",
				"send_welcome_email": 0,
				"enabled": 1,
			}
		)
		account.flags.ignore_permissions = True
		account.flags.no_welcome_mail = True
		account.insert()
	keep_a_device_account(account.name)
	return account.name


def keep_a_device_account(user: str) -> None:
	"""A device account is an enabled portal account with no role, no password and no API key.

	Other apps give every new user a role of theirs as it is inserted (the suite's, the learning platform's, the
	wiki's): a device account keeps none, so that nothing but its binding opens anything to it. Written straight to the
	database, so that no hook of another app runs again on it.
	"""
	from frappe.utils.password import delete_all_passwords_for

	frappe.db.delete("Has Role", {"parent": user, "parenttype": "User"})
	delete_all_passwords_for("User", user)
	frappe.db.set_value(
		"User",
		user,
		{"user_type": "Website User", "enabled": 1, "api_key": None, "role_profile_name": None},
		update_modified=False,
	)
	frappe.clear_cache(user=user)


def end_sessions(user: str, reason: str) -> int:
	"""End every session of a device account (in the database and in the cache); the number ended."""
	from frappe.sessions import delete_session

	sids = frappe.db.sql("select sid from `tabSessions` where user = %s", user, pluck=True)
	for sid in sids:
		delete_session(sid, user=user, reason=reason)
	return len(sids)


def open_sessions(users: list[str]) -> dict[str, int]:
	"""How many sessions each device account has open: one per tablet signed in with it (any other account a row names
	counts none: its sessions are not a tablet's)."""
	users = [user for user in users if minted_here(user)]
	if not users:
		return {}
	return dict(
		frappe.db.sql(
			"select user, count(*) from `tabSessions` where user in %(users)s group by user",
			{"users": tuple(users)},
		)
	)


# --- the guards of a device account (User and OAuth Bearer Token doc events, on_login) ---------------------------


def guard_device_account_before_validate(doc, method=None):
	"""User ``before_validate``: no password and no API key on a tablet's account (User.validate empties
	``new_password`` before any ``validate`` hook could see it)."""
	if not minted_here(doc.name or doc.get("email")) or _pairing():
		return
	if doc.get("new_password"):
		frappe.throw(
			_("A tablet's account has no password: it signs in with a code shown at the till."),
			frappe.PermissionError,
		)
	before = None if doc.is_new() else doc.get_doc_before_save()
	if doc.get("api_key") and (before is None or before.get("api_key") != doc.get("api_key")):
		frappe.throw(_("A tablet's account has no API key."), frappe.PermissionError)


def guard_device_account(doc, method=None):
	"""User ``validate``: a tablet's account stays a portal account that holds no role.

	A migration that gives every account something (a patch adding a role to all users) is not refused, which would stop
	the migration: the tablet's account is left as it was.
	"""
	if not minted_here(doc.name) or _pairing():
		return
	if frappe.flags.in_migrate or frappe.flags.in_install or frappe.flags.in_patch:
		doc.set("roles", [])
		doc.role_profile_name = None
		doc.user_type = "Website User"
		return
	if doc.get("roles") or doc.get("role_profile_name") or doc.user_type != "Website User":
		frappe.throw(
			_(
				"A tablet's account holds no role and stays a portal account. Disconnect or remove the tablet instead."
			),
			frappe.PermissionError,
		)


def guard_device_rename(doc, method=None, *args, **kwargs):
	"""User ``before_rename`` (args: old name, new name, merge): a tablet's account keeps the address its mark was made
	for, and no account takes an address of the tablets (a merge moves the merged account's roles and password onto the
	address it is merged into)."""
	if minted_here(doc.name):
		frappe.throw(_("A tablet's account cannot be renamed."), frappe.PermissionError)
	new = args[1] if len(args) > 1 else kwargs.get("new")
	if isinstance(new, str) and new.endswith(f"@{ACCOUNT_DOMAIN}"):
		frappe.throw(_("No account takes the address of a tablet."), frappe.PermissionError)


def guard_device_login(login_manager):
	"""``on_login``: a tablet's account signs in by its pairing and nothing else, once.

	A password, a reset or e-mail link, impersonation and ``bench browse`` all end in LoginManager.post_login, which runs
	this hook before the session is made: refusing here leaves no session. The pairing's own sign-in is let through by
	SIGN_IN_FLAG, which names the account and is taken here: a second sign-in in the same request is refused, and the
	other apps' login hooks never run with the guards of the account off.
	"""
	user = getattr(login_manager, "user", None)
	if not minted_here(user):
		return
	if frappe.local.flags.pop(SIGN_IN_FLAG, None) == user:
		return
	frappe.throw(_("A tablet signs in by scanning a code shown at the till."), frappe.PermissionError)


def guard_oauth_token(doc, method=None):
	"""OAuth Bearer Token ``validate``: a tablet's account never holds a token, which would outlive its disconnection."""
	if minted_here(doc.get("user")):
		frappe.throw(_("A tablet's account holds no token."), frappe.PermissionError)


# --- the confinement of a tablet's session (auth hook) -----------------------------------------------------------


def _methods_called(request) -> list[str] | None:
	"""The whitelisted methods a request runs: its `cmd` (which Frappe runs before the path's), and the method of an
	/api path; "" for an /api path that names none. None for a page or an asset."""
	called = []
	cmd = frappe.form_dict.get("cmd")
	if cmd:
		called.append(str(cmd))
	path = request.path or ""
	if path.startswith("/api/"):
		for prefix in _API_METHOD_PREFIXES:
			if path.startswith(prefix):
				called.append(path[len(prefix) :].strip("/"))
				break
		else:
			called.append("")
	return called or None


def confine_tablet_session():
	"""``auth_hooks``: a tablet's session reaches its screens and nothing else.

	Run for every request once its caller is known (by cookie, token or key). A session of an account of the tablets'
	domain may open the page of its screens and the static assets (by a path that does not climb out of them), and call
	TABLET_METHODS; anything else (the desk, `frappe.client`, any other app's whitelisted method, a website page) gets the
	403 a portal account gets. Any other session goes on at once.
	"""
	session = getattr(frappe.local, "session", None)
	user = session.get("user") if session else None
	if not user or not user.endswith(f"@{ACCOUNT_DOMAIN}"):
		return
	request = getattr(frappe.local, "request", None)
	if request is None:
		return
	called = _methods_called(request)
	if called is None:
		path = request.path or ""
		# A path that climbs (`/assets/../cart`) is never one of these pages: the request reaches the server as it was
		# written, and the website router joins the path onto each app's www folders, where `..` climbs out of any folder
		# of that name an app has (none has one today: the allowlist does not rely on it)
		if ".." not in path.split("/") and (path in TABLET_PAGES or path.startswith(TABLET_PAGE_PREFIXES)):
			return
	elif all(method in TABLET_METHODS for method in called):
		return
	_refuse()


# --- the gate of the kitchen's and the runner's endpoints --------------------------------------------------------


def screen_device(*screens: str) -> frappe._dict | None:
	"""The tablet the session user is, for one of `screens`; None for anyone who is no tablet (the endpoint's own gates
	decide for them).

	A device account (made here) is never handed to those gates: whatever it may have become (a desk role, a password,
	another user type, disabled), it is refused and its sessions are ended; so is a tablet that is disconnected, bound to
	another screen, on a site that no longer runs NeoRestau, or a session older than its last disconnection. The tablet's
	last visit is noted on its row (at most once a minute: it polls its screen).
	"""
	user = frappe.session.user
	if not minted_here(user):
		return None
	if not is_clean_device_account(user):
		end_sessions(user, _("Tablet account changed"))
		_refuse()
	if not neorestau_active():
		_refuse()
	try:
		device = frappe.db.get_value(
			DEVICE,
			{"user": user, "disconnected": 0},
			["name", "restaurant", "screen", "station", "last_seen", "disconnected_at"],
			as_dict=True,
		)
	except Exception as error:
		# The code is updated and the site is not migrated yet: no tablet exists
		if frappe.db.is_table_missing(error):
			_refuse()
		raise
	if not device or device.screen not in screens:
		_refuse()
	created = (frappe.session.data or {}).get("creation")
	if device.disconnected_at and created and get_datetime(created) < get_datetime(device.disconnected_at):
		from frappe.sessions import delete_session

		delete_session(frappe.session.sid, user=user, reason=_("Tablet disconnected"))
		_refuse()
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


def require_kds_state(status) -> None:
	"""Refuse a tablet a state that is not the kitchen's (KDS_STATES)."""
	if status not in KDS_STATES:
		frappe.throw(_("This is not a state of the kitchen."))


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


# --- pairing ------------------------------------------------------------------------------------------------------


def device_label(screen: str, station: str | None = None) -> str:
	"""How a tablet is named: the runner, the kitchen of every station, or the kitchen of one station."""
	if screen == RUNNER:
		return _("Runner")
	if not station:
		return _("Kitchen, all stations")
	label = frappe.db.get_value("Preparation Station", station, "station_name") or station
	return _("Kitchen — {0}").format(label)


def device_key(restaurant: str, screen: str, station: str | None) -> str:
	"""The one tablet row of a screen of a restaurant: unique in the table, so that two first pairings of the same
	screen at the same instant make one row, not two."""
	return hashlib.sha256(f"{restaurant}\x1f{screen}\x1f{station or ''}".encode()).hexdigest()


def find_device(key: str, latest: bool = False) -> frappe._dict | None:
	"""The tablet row of a screen. `latest`: a locking read, which sees what another transaction committed since this
	one first read (REPEATABLE READ keeps a plain read on the transaction's first snapshot)."""
	return frappe.db.get_value(
		DEVICE,
		{"device_key": key},
		["name", "user", "device_name", "paired_by", "paired_at", "disconnected", "disconnected_at"],
		as_dict=True,
		for_update=latest,
	)


def screen_path(device: frappe._dict) -> str:
	"""The address of a tablet's screen: the kitchen (of its station) or the runner, of its restaurant."""
	query = {"restaurant": device.restaurant}
	if device.screen == RUNNER:
		return f"/pos/runner?{urlencode(query)}"
	if device.station:
		query["station"] = device.station
	return f"/pos/kds?{urlencode(query)}"


def pair(pairing: frappe._dict) -> tuple[frappe._dict, frappe._dict | None]:
	"""The tablet a spent token opens, and what its row was before (None: made now).

	The restaurant's device of that screen (and station), found or made, marked paired by the maker of the token and no
	longer disconnected. Its account is reused only when it is a device account made here; any other account its row
	names is never signed in: a fresh device account replaces it. Two first pairings of the same screen at the same
	instant: the second one's insert meets the first one's row (device_key is unique), gives up its own account and
	takes that row.
	"""
	key = device_key(pairing.restaurant, pairing.screen, pairing.station)
	before = find_device(key)
	device_name = pairing.device_name or device_label(pairing.screen, pairing.station)
	values = {
		"device_name": device_name,
		"paired_by": pairing.owner,
		"paired_at": now_datetime(),
		"disconnected": 0,
	}
	if before is None:
		frappe.db.savepoint(_FRESH_DEVICE)
		try:
			user = make_account(device_name, pairing.restaurant)
			with pairing_writes():
				name = (
					frappe.get_doc(
						{
							"doctype": DEVICE,
							"restaurant": pairing.restaurant,
							"screen": pairing.screen,
							"station": pairing.station or None,
							"device_key": key,
							"user": user,
							**values,
						}
					)
					.insert(ignore_permissions=True)
					.name
				)
		except (frappe.DuplicateEntryError, frappe.UniqueValidationError):
			# Another tablet scanned a token of the same screen at the same instant and made the row first
			frappe.db.rollback(save_point=_FRESH_DEVICE)
			before = find_device(key, latest=True)
			if before is None:
				raise
	if before is not None:
		user = before.user if before.user and is_device_account(before.user) else None
		if not user:
			user = make_account(device_name, pairing.restaurant)
		frappe.db.set_value(DEVICE, before.name, {**values, "user": user})
		name = before.name
		keep_a_device_account(user)
	return (
		frappe.db.get_value(
			DEVICE, name, ["name", "device_name", "restaurant", "screen", "station", "user"], as_dict=True
		),
		before,
	)


def sign_in(device: frappe._dict, paired_by: str) -> None:
	"""Open the device account's session in the browser that redeemed the token: the session cookie of a normal login.

	Only a clean device account made here is signed in, checked right before `login_as`. The session names the manager
	who paired the tablet as its audit user. A tablet paired again (to the same screen or another) ends the session it
	came with, so that the till counts one session per tablet. The session id stays in its HttpOnly cookie: the fork's
	login answers it in the response body as well (for the mobile application), which is taken out here.
	"""
	if not is_clean_device_account(device.user):
		frappe.throw(
			_("This tablet cannot be opened. Ask for a new code at the till."), frappe.PermissionError
		)
	# A tablet paired again brings the session it had: ended once the new one is open, so that it counts no more
	earlier = frappe.session.sid if minted_here(frappe.session.user) else None
	# Lets this one sign-in through guard_device_login, which takes it: the guards of the account stay on meanwhile
	frappe.local.flags[SIGN_IN_FLAG] = device.user
	try:
		frappe.local.login_manager.login_as(device.user, audit_user=paired_by)
	finally:
		frappe.local.flags.pop(SIGN_IN_FLAG, None)
	if earlier and earlier != frappe.session.sid:
		from frappe.sessions import delete_session

		delete_session(earlier, reason=_("Tablet paired again"))
	for key in ("sid", "user_id", "full_name", "user_image", "home_page", "redirect_to"):
		frappe.local.response.pop(key, None)


def undo_pairing(pairing: frappe._dict, device: frappe._dict, before: frappe._dict | None) -> None:
	"""A sign-in refused after the session was made (an `on_session_creation` hook of another app): the session made is
	ended, the tablet's row is put back as it was (or removed, its account disabled, if this pairing made it) and the token
	is the till's again until it expires, so that the till and the tablet agree that nothing opened. Committed: the
	session's start committed the spend already."""
	from frappe.sessions import delete_session

	session_obj = getattr(frappe.local, "session_obj", None)
	sid = getattr(session_obj, "sid", None)
	if sid and sid != "Guest" and getattr(session_obj, "user", None) == device.user:
		delete_session(sid, user=device.user, reason=_("Tablet sign-in refused"))
	# Nothing more of this request runs as the tablet
	frappe.set_user("Guest")
	frappe.db.set_value(PAIRING, pairing.name, {"used_at": None, "device": None}, update_modified=False)
	if before is None:
		# Made by this pairing: the row goes, and its account is disabled with it (on_trash), never signed in
		frappe.delete_doc(DEVICE, device.name, ignore_permissions=True, force=True)
	else:
		frappe.db.set_value(
			DEVICE,
			before.name,
			{
				field: before.get(field)
				for field in (
					"user",
					"device_name",
					"paired_by",
					"paired_at",
					"disconnected",
					"disconnected_at",
				)
			},
		)
	frappe.db.commit()


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


def disconnect(device: str, user: str, reason: str) -> int:
	"""Disconnect a tablet: refused until it scans a new token, its OAuth tokens dropped, its sessions ended (their
	number). A session made before this moment is refused even if it survived (disconnected_at). The account is touched
	only when it was minted here: a row that names any other account (an administrator, a cashier) is disconnected and
	that account left alone."""
	frappe.db.set_value(DEVICE, device, {"disconnected": 1, "disconnected_at": now_datetime()})
	if not minted_here(user):
		return 0
	frappe.db.delete("OAuth Bearer Token", {"user": user})
	return end_sessions(user, reason)


def forget_the_tablets_of(doc, method=None):
	"""Restaurant ``after_delete``: its tablets go with it (sessions ended, accounts disabled, tokens deleted, each by
	RestaurantDevice.on_trash, which touches an account only when it was minted here), so that a restaurant made again
	under the same name inherits none of them.

	After the delete, once its links were checked: ending a session commits, so a restaurant whose delete is refused
	(its rooms, tables or orders still link to it) keeps its tablets as they were.
	"""
	for name in frappe.get_all(DEVICE, filters={"restaurant": doc.name}, pluck="name"):
		frappe.delete_doc(DEVICE, name, ignore_permissions=True, force=True)
	frappe.db.delete(PAIRING, {"restaurant": doc.name})
