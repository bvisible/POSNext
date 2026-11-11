# -*- coding: utf-8 -*-
# //// Neoffice — added file (no upstream equivalent). Upstream POSNext has no customer-facing
# //// second screen. This backend drives it: display pairing/auth, realtime cart mirroring
# //// bound to the launching POS's exact shift, TWINT QR mirroring, the idle ads carousel, and
# //// customer self-creation from the display — Individual/Company toggle, structured street +
# //// N° (ADR-002), and customer group / territory / currency resolved from the site instead of
# //// the hardcoded English defaults, which simply do not exist on a French site
# //// (185c3c50, a2ffc7d5, 71619d17, f07aa35b 2026-02; 87f168fe, bcc36a22 2026-03;
# //// 14a49016, 9a807f74, 34ad77fe 2026-06; d7584e7b 2026-07-17 "structured street + N°").
# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

"""
Customer Display API for POS Next.
Handles authentication, cart synchronization, and customer creation
for secondary display screens.
"""

# //// Neoffice — hmac: the display's secret is compared in constant time (validate_api_key)
import hmac
import json

# //// Neoffice — secrets: the display's password is drawn by the server (new_display_password)
import secrets

import frappe
from frappe import _
from frappe.utils import cint, flt, now

# Cache key prefix for cart data
CART_CACHE_PREFIX = "pos_next_cart_"
CART_CACHE_TTL = 3600  # 1 hour TTL for cart cache

# Payment QR (e.g. TWINT pairing token) shown on the customer display while a
# QR-bridge payment is awaiting the customer's scan. Short TTL — it is cleared
# as soon as the payment reaches a terminal state.
PAYMENT_QR_CACHE_PREFIX = "pos_next_payment_qr_"
PAYMENT_QR_CACHE_TTL = 600  # 10 minutes

# //// Neoffice — the refusals one address may earn at the display's sign-in (validate_api_key): a person
# //// mistyping stays far below it
KEY_REFUSALS_PER_ADDRESS = 10
KEY_REFUSALS_WINDOW = 600  # 10 minutes

# //// Neoffice — added (no upstream equivalent). The display's own account (maintenance#2296, audit Q2). The display
# //// signed in with the key of the client's super account (every right of the API, Admin role) and kept it in the
# //// browser of the till, in clear and with no end date: whoever read that browser left with the whole ERP. It now
# //// signs in with an account of its own: a portal account holding one role that opens no doctype, whose session
# //// reaches the calls of the display and nothing else (confine_display_session), with a key of its own that a till
# //// manager draws at the till (new_display_password). A key stolen from a display gives the carts of the counters.
DISPLAY_ACCOUNT = "customer-display@displays.invalid"
DISPLAY_ROLE = "POSNext Customer Display"
# The display's password: drawn by the server, typed once on the display by a person (no 0/O, 1/l/I to mistake)
DISPLAY_SECRET_LENGTH = 20
DISPLAY_SECRET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
# What the display's session may call: the display's own calls, and what the app reads as it starts (who is signed in,
# the words of its language, whether the server answers, the site's name), the socket server's check of its connection,
# and signing out. Measured on the display's traffic at osiris (11.11.2026).
DISPLAY_METHODS = frozenset(
	{
		"pos_next.api.customer_display.validate_api_key",
		"pos_next.api.customer_display.pair_display",
		"pos_next.api.customer_display.get_pos_profiles",
		"pos_next.api.customer_display.get_pos_opening_entry",
		"pos_next.api.customer_display.get_display_settings",
		"pos_next.api.customer_display.get_current_cart",
		"pos_next.api.customer_display.create_customer_from_display",
		"pos_next.api.customer_display.get_in_app_ads",
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
# The pages its session may open: the app of the display, the static assets, the public files (the ads' images)
DISPLAY_PAGES = ("/pos", "/pos-sw.js")
DISPLAY_PAGE_PREFIXES = ("/pos/", "/assets/", "/files/")


def is_display_account(user=None) -> bool:
	"""Whether `user` (the session user by default) is the display's own account."""
	return (user or frappe.session.user) == DISPLAY_ACCOUNT


def _ensure_display_role():
	if not frappe.db.exists("Role", DISPLAY_ROLE):
		frappe.get_doc(
			{"doctype": "Role", "role_name": DISPLAY_ROLE, "desk_access": 0}
		).insert(ignore_permissions=True)
	else:
		frappe.db.set_value("Role", DISPLAY_ROLE, "desk_access", 0, update_modified=False)


def ensure_display_account() -> str:
	"""The display's account, made when it is missing, and put back to what it is: an enabled portal account that holds
	the display's role and nothing else, with no password.

	Other apps give every new user a role of theirs as it is inserted (the suite's, the learning platform's, the
	wiki's): the account keeps none, so that nothing but the display's calls opens anything to it. Written straight to
	the database after the insert, so that no hook of another app runs again on it.
	"""
	from frappe.utils.password import remove_encrypted_password

	_ensure_display_role()
	if not frappe.db.exists("User", DISPLAY_ACCOUNT):
		account = frappe.get_doc(
			{
				"doctype": "User",
				"email": DISPLAY_ACCOUNT,
				"first_name": "Customer display",
				"user_type": "Website User",
				"send_welcome_email": 0,
				"enabled": 1,
			}
		)
		account.flags.ignore_permissions = True
		account.flags.no_welcome_mail = True
		account.insert()
	held = frappe.get_all("Has Role", filters={"parent": DISPLAY_ACCOUNT, "parenttype": "User"}, pluck="role")
	if held != [DISPLAY_ROLE]:
		frappe.db.delete("Has Role", {"parent": DISPLAY_ACCOUNT, "parenttype": "User"})
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"name": frappe.generate_hash(length=10),
				"parent": DISPLAY_ACCOUNT,
				"parenttype": "User",
				"parentfield": "roles",
				"idx": 1,
				"role": DISPLAY_ROLE,
			}
		).db_insert()
	# A sign-in password is never the display's: it signs in with its key
	remove_encrypted_password("User", DISPLAY_ACCOUNT, "password")
	frappe.db.set_value(
		"User",
		DISPLAY_ACCOUNT,
		{"user_type": "Website User", "enabled": 1, "role_profile_name": None},
		update_modified=False,
	)
	frappe.clear_cache(user=DISPLAY_ACCOUNT)
	return DISPLAY_ACCOUNT


def _display_tills() -> list:
	"""The tills a display may follow: every till of the site in use, as the key it replaces could (a till picks its
	screen: a display shows the shift the till opened it on)."""
	return frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name", order_by="name")


def _require_display_till(pos_profile):
	"""The display's account reads a till of the site in use; refused anything else."""
	if not pos_profile or not isinstance(pos_profile, str) or pos_profile not in _display_tills():
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _the_display_may_create_a_customer(pos_opening_entry, email):
	"""The display's account creates a customer for an open shift of a till in use whose settings let the customer
	create an account on the display; refused anything else. A new customer whose e-mail a Contact already carries is
	refused, as for a cashier (customers._elevate_primary_contact): the Contact belongs to another party."""
	opening = isinstance(pos_opening_entry, str) and frappe.db.get_value(
		"POS Opening Shift",
		pos_opening_entry,
		["pos_profile", "docstatus", "status", "pos_closing_shift"],
		as_dict=True,
	)
	if not opening or opening.docstatus != 1 or opening.status != "Open" or opening.pos_closing_shift:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	_require_display_till(opening.pos_profile)
	if not frappe.db.get_value(
		"POS Settings",
		{"pos_profile": opening.pos_profile, "enabled": 1},
		"enable_customer_display_account_creation",
	):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	email = (email or "").strip()
	if email and frappe.db.exists("Contact", {"email_id": email}):
		frappe.throw(
			_(
				"A contact already uses the e-mail {0}. Look for the existing customer, or ask someone allowed to manage contacts."
			).format(email),
			frappe.PermissionError,
		)


def confine_display_session():
	"""``auth_hooks``: the display's session reaches the display and nothing else.

	Run for every request once its caller is known (by cookie, token or key). The display's account may open the pages
	of the app and the static assets (by a path that does not climb out of them), and call DISPLAY_METHODS; anything
	else (the desk, `frappe.client`, any other app's whitelisted method, a website page) gets the 403 a portal account
	gets. Any other session goes on at once. The reading of a request is the tablets' (devices._methods_called).
	"""
	from pos_next.restaurant.devices import _methods_called

	session = getattr(frappe.local, "session", None)
	if not session or session.get("user") != DISPLAY_ACCOUNT:
		return
	request = getattr(frappe.local, "request", None)
	if request is None:
		return
	called = _methods_called(request)
	if called is None:
		path = request.path or ""
		if ".." not in path.split("/") and (path in DISPLAY_PAGES or path.startswith(DISPLAY_PAGE_PREFIXES)):
			return
	elif all(method in DISPLAY_METHODS for method in called):
		return
	frappe.throw(_("Not permitted"), frappe.PermissionError)


def set_display_key(api_key: str, secret: str) -> None:
	"""The display's account takes this key: its half `api_key`, and its secret kept encrypted, as a saved Password
	field is (its column holds as many stars, the value lives in __Auth)."""
	from frappe.utils.password import set_encrypted_password

	frappe.db.set_value(
		"User", DISPLAY_ACCOUNT, {"api_key": api_key, "api_secret": "*" * len(secret)}, update_modified=False
	)
	set_encrypted_password("User", DISPLAY_ACCOUNT, secret, "api_secret")
	frappe.clear_cache(user=DISPLAY_ACCOUNT)


def _new_secret() -> str:
	return "".join(secrets.choice(DISPLAY_SECRET_ALPHABET) for _ in range(DISPLAY_SECRET_LENGTH))


# //// Neoffice — added (no upstream equivalent): the till manager draws the display's password at the till (the
# //// settings of the till, Customer display), and types it once on each display. Drawn by the server: a person
# //// never chooses it. A new one replaces the last, and every display paired with the last pairs again.
@frappe.whitelist(methods=["POST"])
def new_display_password():
	"""Draw a new password for the customer displays of the site and answer it, once: it is kept encrypted only."""
	from pos_next.api.cash_entry import require_till_manager

	require_till_manager()
	ensure_display_account()
	secret = _new_secret()
	set_display_key(frappe.generate_hash(length=15), secret)
	frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": "User",
			"reference_name": DISPLAY_ACCOUNT,
			"content": _("New customer display password drawn by {0}").format(frappe.session.user),
		}
	).insert(ignore_permissions=True)
	return {"password": secret}


# //// Neoffice — added (no upstream equivalent): what a display sends when a person types the password the till
# //// manager drew. Answers the key the display keeps, its account's own (the key half is the site's, drawn with it).
# //// The same limit on refusals as validate_api_key.
@frappe.whitelist(allow_guest=True, methods=["POST"])
def pair_display(password: str | None = None):
	"""Pair a customer display with the password drawn at the till; answer the key it keeps."""
	from frappe.utils.password import get_decrypted_password

	_hold_back_a_guessing_address()
	if not password:
		_refuse_the_key(_("Wrong password"))
	account = frappe.db.get_value("User", {"name": DISPLAY_ACCOUNT, "enabled": 1}, ["name", "api_key"], as_dict=True)
	stored = account and account.api_key and get_decrypted_password(
		"User", DISPLAY_ACCOUNT, "api_secret", raise_exception=False
	)
	if not stored:
		_refuse_the_key(
			_("No password for the customer displays yet: a till manager draws one in the till's settings, Customer display.")
		)
	if not hmac.compare_digest(stored.encode(), password.strip().encode()):
		_refuse_the_key(_("Wrong password"))
	return {
		"success": True,
		"key": f"{account.api_key}:{stored}",
		"user": DISPLAY_ACCOUNT,
		"full_name": frappe.db.get_value("User", DISPLAY_ACCOUNT, "full_name"),
	}


# //// Neoffice — the customer display's writes come from the till, for its own shift: a submitted POS
# //// Opening Shift still open, the caller's own (a till manager may write to any till's), at a till the
# //// caller may use. The shift's rule is pos_closing_shift.require_shift_access.
def _require_display_writer(pos_opening_entry):
    from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import require_shift_access

    opening = require_shift_access(pos_opening_entry)
    if opening.docstatus != 1 or opening.status != "Open" or opening.pos_closing_shift:
        frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added (no upstream equivalent). The key half of the display's credential is public: it ships
# //// in the display's own page, the same on every site, and the secret is a password a person chose. Nothing
# //// limited the guesses, on a door open to any visitor (maintenance#2296). Only refusals count, per address
# //// nginx accepted (the display of a shop signs in at each page load, and a shop's tills share one
# //// address). Changing the credential itself is a decision for the fleet, not this code's; the same pair is
# //// also tried by Frappe on any route (`Authorization: token`), which no code of this app sees.
def _key_refusals() -> str | None:
    """Where the refusals of the caller's address are counted; None for a call made inside the server."""
    from pos_next.restaurant.devices import request_peer_ip

    if not getattr(frappe.local, "request", None):
        return None
    return frappe.cache.make_key(f"pos_next:display-key:{request_peer_ip() or 'unknown'}")


def _hold_back_a_guessing_address():
    key = _key_refusals()
    if key and int(frappe.cache.get(key) or 0) >= KEY_REFUSALS_PER_ADDRESS:
        frappe.throw(
            _("You hit the rate limit because of too many requests. Please try after sometime."),
            frappe.RateLimitExceededError,
        )


def _refuse_the_key(message):
    key = _key_refusals()
    if key:
        frappe.cache.set(key, 0, ex=KEY_REFUSALS_WINDOW, nx=True)
        frappe.cache.incrby(key, 1)
    frappe.throw(message, frappe.AuthenticationError)


# //// Neoffice — `str`: the key is a text (maintenance#2296).
@frappe.whitelist(allow_guest=True)
def validate_api_key(api_key_string: str | None):
    """
    Validate API key and return user information.

    API key format: api_key:api_secret

    Args:
        api_key_string (str): Combined api_key:api_secret string

    Returns:
        dict: User information if valid, error if invalid
    """
    # //// Neoffice — first, so that a held-back address learns nothing, a right guess included (see
    # //// _key_refusals).
    _hold_back_a_guessing_address()

    if not api_key_string:
        frappe.throw(_("API key is required"), frappe.AuthenticationError)

    # Split api_key:api_secret
    parts = api_key_string.split(":")
    if len(parts) != 2:
        _refuse_the_key(_("Invalid API key format. Expected format: api_key:api_secret"))

    api_key, api_secret = parts

    # Find user with this API key
    user = frappe.db.get_value(
        "User",
        {"api_key": api_key, "enabled": 1},
        ["name", "full_name", "email"],
        as_dict=True
    )

    # //// Neoffice — the display's own account only (maintenance#2296, audit Q2): the key of any other account,
    # //// the client's super account first, is refused as an unknown one, so that a display still holding it
    # //// pairs again and drops it. Before the secret is compared: the answer tells nothing of another account.
    if not user or not is_display_account(user.name):
        _refuse_the_key(_("Invalid API key"))

    # Validate API secret
    user_doc = frappe.get_doc("User", user.name)
    if not user_doc.api_secret:
        _refuse_the_key(_("API secret not configured for this user"))

    # Compare secrets (api_secret is stored encrypted, get_password decrypts it)
    stored_secret = user_doc.get_password("api_secret")
    if not hmac.compare_digest(stored_secret.encode(), api_secret.encode()):
        _refuse_the_key(_("Invalid API secret"))

    # Set session user for subsequent calls
    frappe.set_user(user.name)

    return {
        "success": True,
        "user": user.name,
        "full_name": user.full_name,
        "email": user.email
    }


@frappe.whitelist()
def get_pos_profiles():
    """
    Get list of POS profiles accessible to the current user.

    Returns:
        list: List of POS profiles with name, company, warehouse
    """
    # //// Neoffice — the display's own account follows any till of the site in use (see _display_tills), as the key
    # //// it replaces did: it is assigned to none.
    if is_display_account():
        return frappe.get_all(
            "POS Profile",
            filters={"disabled": 0},
            fields=["name", "company", "warehouse", "currency"],
            order_by="name",
        )

    profiles = frappe.db.sql(
        """
        SELECT DISTINCT p.name, p.company, p.warehouse, p.currency
        FROM `tabPOS Profile` p
        INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
        WHERE p.disabled = 0 AND u.user = %s
        ORDER BY p.name
        """,
        frappe.session.user,
        as_dict=True
    )

    return profiles


# //// Neoffice — the reads of the display answer the till (maintenance#2296): a shift's cart holds the
# //// customer and every line of the sale in progress, and it was served to any signed-in account, a portal
# //// customer's included, by a sequential shift name. Who reads it: the shift's cashier, a till manager, or
# //// an account assigned to the till, which is what a paired display runs under (`get_pos_profiles` lists it
# //// the tills of its rows). A cashier of another till is none of these.
def _require_display_reader(pos_opening_entry):
    from pos_next.api.cash_entry import is_till_manager, require_system_user, require_till_access

    # //// Neoffice — the display's own account (a portal account, maintenance#2296 audit Q2) reads the shift of a
    # //// till of the site in use; it is the cashier of none.
    if is_display_account():
        opening = isinstance(pos_opening_entry, str) and frappe.db.get_value(
            "POS Opening Shift", pos_opening_entry, ["pos_profile"], as_dict=True
        )
        if not opening:
            frappe.throw(_("Not permitted"), frappe.PermissionError)
        _require_display_till(opening.pos_profile)
        return
    require_system_user()
    opening = isinstance(pos_opening_entry, str) and frappe.db.get_value(
        "POS Opening Shift", pos_opening_entry, ["user", "pos_profile"], as_dict=True
    )
    if not opening:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    user = frappe.session.user
    assigned = frappe.db.exists("POS Profile User", {"parent": opening.pos_profile, "user": user})
    if opening.user != user and not assigned and not is_till_manager():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    require_till_access(opening.pos_profile)


# //// Neoffice — what the display hears (maintenance#2296). An event with no user goes to room `all`, every
# //// desk account of the site whatever its rights: a cart, a payment's pairing token and a new customer's
# //// contact details reached accounts that read none of them. They now go to the shift's cashier and the
# //// accounts assigned to the till; any other display keeps its five-second poll of get_current_cart.
def _tell_the_display(event, pos_opening_entry, message, after_commit):
    opening = frappe.db.get_value(
        "POS Opening Shift", pos_opening_entry, ["user", "pos_profile"], as_dict=True
    )
    assigned = frappe.get_all("POS Profile User", filters={"parent": opening.pos_profile}, pluck="user")
    for user in {opening.user, *assigned}:
        frappe.publish_realtime(event=event, message=message, user=user, after_commit=after_commit)


# //// Neoffice — `str | None`: a name is a text (maintenance#2296); the till's own gate, below.
@frappe.whitelist()
def get_pos_opening_entry(pos_profile: str | None, opening: str | None = None):
    """
    Get the active POS Opening Entry for a given POS profile.

    Args:
        pos_profile (str): POS Profile name
        opening (str, optional): a specific POS Opening Shift to pin to. When
            the customer display is launched from a POS it passes that POS's
            own opening entry here, so the display follows the right cashier
            even when several shifts are open on the same profile. Falls back
            to "most recent open shift for this profile" when omitted/invalid.

    Returns:
        dict: POS Opening Entry details or None if no active session
    """
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    # //// Neoffice — its answer names the till's cashier and company: the till's (see
    # //// _require_display_reader), or the display's own account's.
    from pos_next.api.cash_entry import require_till_access

    if is_display_account():
        _require_display_till(pos_profile)
    else:
        require_till_access(pos_profile)

    open_entry = None

    # 1. Pinned opening entry (passed by the launching POS) — use it as long as
    #    it is genuinely open for this profile.
    if opening:
        open_entry = frappe.db.get_value(
            "POS Opening Shift",
            {
                "name": opening,
                "pos_profile": pos_profile,
                "docstatus": 1,
                "status": "Open",
                "pos_closing_shift": ["is", "not set"],
            },
            ["name", "user", "pos_profile", "company", "period_start_date"],
            as_dict=True,
        )

    # 2. Fallback: most recent open shift for this profile (any user).
    if not open_entry:
        open_entry = frappe.db.get_value(
            "POS Opening Shift",
            {
                "pos_profile": pos_profile,
                "docstatus": 1,
                "status": "Open",
                "pos_closing_shift": ["is", "not set"]
            },
            ["name", "user", "pos_profile", "company", "period_start_date"],
            as_dict=True,
            order_by="period_start_date desc"
        )

    if not open_entry:
        return None

    # Get POS profile details
    profile = frappe.get_cached_doc("POS Profile", pos_profile)

    # Get company country for address preselection
    company_country = None
    if open_entry.company:
        company_country = frappe.db.get_value("Company", open_entry.company, "country")

    return {
        "pos_opening_entry": open_entry.name,
        "user": open_entry.user,
        "pos_profile": open_entry.pos_profile,
        "company": open_entry.company,
        "period_start_date": open_entry.period_start_date,
        "currency": profile.currency,
        "warehouse": profile.warehouse,
        "country": company_country
    }


# //// Neoffice — `str | None`: a name is a text (maintenance#2296); the till's own gate, below.
@frappe.whitelist()
def get_display_settings(pos_profile: str | None):
    """
    Get customer display settings from POS Settings.

    Args:
        pos_profile (str): POS Profile name

    Returns:
        dict: Display settings
    """
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    # //// Neoffice — the till's settings answer the till (see _require_display_reader), or the display's own account.
    from pos_next.api.cash_entry import require_till_access

    if is_display_account():
        _require_display_till(pos_profile)
    else:
        require_till_access(pos_profile)

    # Get POS Settings for this profile
    settings = frappe.db.get_value(
        "POS Settings",
        {"pos_profile": pos_profile, "enabled": 1},
        [
            "enable_customer_display",
            "enable_customer_display_account_creation",
            "customer_display_show_address_fields"
        ],
        as_dict=True
    )

    if not settings:
        # Return defaults if no settings found
        return {
            "enable_customer_display": False,
            "enable_account_creation": False,
            "show_address_fields": False,
            "has_loyalty_program": False
        }

    # Check if a loyalty program exists for the profile's company
    company = frappe.db.get_value("POS Profile", pos_profile, "company")
    has_loyalty = False
    if company:
        has_loyalty = bool(frappe.db.get_value(
            "Loyalty Program",
            {"company": company, "auto_opt_in": 1},
            "name"
        ))

    return {
        "enable_customer_display": bool(settings.enable_customer_display),
        "enable_account_creation": bool(settings.enable_customer_display_account_creation),
        "show_address_fields": bool(settings.customer_display_show_address_fields),
        "has_loyalty_program": has_loyalty
    }


# //// Neoffice — `str | None`: a name is a text (maintenance#2296).
@frappe.whitelist()
def update_cart_data(pos_opening_entry: str | None, cart_data):
    """
    Store cart data in Redis cache and emit realtime event.
    Called by the main POS when cart changes.

    Args:
        pos_opening_entry (str): POS Opening Entry name
        cart_data (str|dict): Cart data JSON

    Returns:
        dict: Success status
    """
    # //// Neoffice — its caller is the till (useCustomerDisplaySync), writing to its own shift's display:
    # //// the shift's own cashier while the shift is open, or a till manager (_require_display_writer).
    _require_display_writer(pos_opening_entry)
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    # Parse cart data if string
    if isinstance(cart_data, str):
        cart_data = json.loads(cart_data)

    # Validate POS Opening Entry exists and is open
    entry = frappe.db.get_value(
        "POS Opening Shift",
        pos_opening_entry,
        ["name", "status", "pos_profile"],
        as_dict=True
    )

    if not entry:
        frappe.throw(_("POS Opening Entry not found"))

    if entry.status != "Open":
        frappe.throw(_("POS session is not open"))

    # Add metadata
    cart_data["_updated_at"] = now()
    cart_data["_pos_opening_entry"] = pos_opening_entry

    # Store in Redis cache
    cache_key = f"{CART_CACHE_PREFIX}{pos_opening_entry}"
    frappe.cache().set_value(cache_key, cart_data, expires_in_sec=CART_CACHE_TTL)

    # Emit realtime event to customer display
    # //// Neoffice — to the till and its display, not to every desk account (see _tell_the_display);
    # //// immediately, for responsiveness
    _tell_the_display(
        f"pos_cart_updated_{pos_opening_entry}", pos_opening_entry, cart_data, after_commit=False
    )

    return {"success": True}


# //// Neoffice — `str | None`: a name is a text (maintenance#2296); who reads a cart is
# //// _require_display_reader's.
@frappe.whitelist()
def get_current_cart(pos_opening_entry: str | None):
    """
    Get current cart data from cache.

    Args:
        pos_opening_entry (str): POS Opening Entry name

    Returns:
        dict: Cart data or empty cart structure
    """
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    _require_display_reader(pos_opening_entry)

    # Try to get from Redis cache
    cache_key = f"{CART_CACHE_PREFIX}{pos_opening_entry}"
    cart_data = frappe.cache().get_value(cache_key)

    # Attach the active payment QR (if any) so the polling fallback also
    # surfaces it when Socket.IO is unavailable.
    payment_qr = frappe.cache().get_value(f"{PAYMENT_QR_CACHE_PREFIX}{pos_opening_entry}")

    if cart_data:
        cart_data["_payment_qr"] = payment_qr or None
        return cart_data

    # Return empty cart structure if not found
    return {
        "items": [],
        "customer": None,
        "customer_name": None,
        "subtotal": 0,
        "total_tax": 0,
        "discount_amount": 0,
        "grand_total": 0,
        "currency": "EUR",
        "_updated_at": None,
        "_payment_qr": payment_qr or None,
        "_pos_opening_entry": pos_opening_entry
    }


# //// Neoffice — `str | None`: a name is a text (maintenance#2296).
@frappe.whitelist()
def create_customer_from_display(customer_name, pos_opening_entry: str | None, email=None, mobile_no=None,
                                  address_line1=None, city=None, pincode=None, country=None,
                                  customer_type=None, house_number=None):
    """
    Create a new customer from the customer display.
    Optionally creates an address if address fields are provided.
    Notifies the main POS via realtime event.

    Args:
        customer_name (str): Customer name (required)
        pos_opening_entry (str): POS Opening Entry name (required)
        email (str): Email address (optional)
        mobile_no (str): Mobile number (optional)
        address_line1 (str): Street name (optional)
        house_number (str): House number, structured address (optional)
        city (str): City (optional)
        pincode (str): Postal code (optional)
        country (str): Country (optional)

    Returns:
        dict: Created customer data
    """
    if not customer_name:
        frappe.throw(_("Customer name is required"))

    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    # Check permission
    # //// Neoffice — the display's own account holds no right on any doctype (maintenance#2296, audit Q2): it
    # //// creates a customer for an open shift of a till in use whose settings let the customer do so, and that
    # //// customer only (_the_display_may_create_a_customer).
    by_the_display = is_display_account()
    if by_the_display:
        _the_display_may_create_a_customer(pos_opening_entry, email)
    elif not frappe.has_permission("Customer", "create"):
        frappe.throw(_("You don't have permission to create customers"), frappe.PermissionError)

    # Get POS profile to determine company and customer settings
    entry = frappe.db.get_value(
        "POS Opening Shift",
        pos_opening_entry,
        ["pos_profile", "company"],
        as_dict=True
    )

    if not entry:
        frappe.throw(_("POS Opening Entry not found"))

    # Get default customer group and territory from POS profile or system defaults
    profile = frappe.get_cached_doc("POS Profile", entry.pos_profile)

    # Get customer group from profile, or find system default
    customer_group = None
    if hasattr(profile, "customer_group") and profile.customer_group:
        customer_group = profile.customer_group

    if not customer_group:
        # Try to get a valid customer group (prefer "Individual" variants)
        customer_group = frappe.db.get_value(
            "Customer Group",
            {"is_group": 0},
            "name",
            order_by="name"
        )

    if not customer_group:
        frappe.throw(_("No customer group found. Please configure a customer group."))

    # Get territory from selling settings or first available
    territory = frappe.db.get_single_value("Selling Settings", "territory") or frappe.db.get_value(
        "Territory",
        {"is_group": 0},
        "name",
        order_by="name"
    )

    if not territory:
        frappe.throw(_("No territory found. Please configure a territory."))

    # Get default loyalty program
    loyalty_program = None
    if entry.company:
        loyalty_program = frappe.db.get_value(
            "Loyalty Program",
            {"company": entry.company, "auto_opt_in": 1},
            "name"
        )

    # Get default currency from POS profile or company
    default_currency = profile.currency if profile.currency else frappe.db.get_value(
        "Company", entry.company, "default_currency"
    )

    # Create customer
    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": customer_name,
        "customer_type": customer_type if customer_type in ("Individual", "Company") else "Individual",
        "customer_group": customer_group,
        "territory": territory,
        "mobile_no": mobile_no or "",
        "email_id": email or "",
        "loyalty_program": loyalty_program,
        "default_currency": default_currency
    })

    # A cashier holding only POSNext Cashier gets THIS customer's primary Contact and address
    # created for it, as in pos_next.api.customers.create_customer (see its address book block).
    from pos_next.api.customers import _elevate_primary_contact, _lacks_right

    # //// Neoffice — the display's account creates the customer and its primary Contact as the till does for it.
    elevated = True if by_the_display else _elevate_primary_contact(customer)
    if by_the_display:
        customer.flags.ignore_permissions = True
    try:
        customer.insert()
    finally:
        if elevated:
            customer.flags.ignore_permissions = False

    # Create address if address fields are provided
    address_name = None
    if address_line1 or city or pincode or country:
        try:
            address = frappe.get_doc({
                "doctype": "Address",
                "address_title": customer_name,
                "address_type": "Billing",
                "address_line1": address_line1 or "",
                # Structured address: the house number has its own field.
                "custom_house_number": house_number or "",
                "city": city or "",
                "pincode": pincode or "",
                "country": country or frappe.db.get_default("country") or "Switzerland",
                "links": [{
                    "link_doctype": "Customer",
                    "link_name": customer.name
                }]
            })
            # Linked to the customer just created, and to nothing else.
            address.insert(
                ignore_permissions=by_the_display
                or (
                    _lacks_right("Address")
                    and frappe.has_permission("Customer", "write", doc=customer.name)
                )
            )
            address_name = address.name

            # Set as primary address
            customer.db_set("customer_primary_address", address.name)
        except Exception as e:
            # Log error but don't fail customer creation
            frappe.log_error("Address creation failed", str(e))

    # Emit realtime event to notify POS
    event_name = f"customer_created_{pos_opening_entry}"
    event_data = {
        "name": customer.name,
        "customer_name": customer.customer_name,
        "mobile_no": customer.mobile_no,
        "email_id": customer.email_id,
        "address": address_name,
        "created_from": "customer_display"
    }
    frappe.logger().info(f"Emitting customer_created event: {event_name} with data: {event_data}")
    # //// Neoffice — to the till and its display, not to every desk account (see _tell_the_display)
    _tell_the_display(event_name, pos_opening_entry, event_data, after_commit=True)

    return {
        "success": True,
        "customer": customer.as_dict()
    }


@frappe.whitelist()
def clear_cart_cache(pos_opening_entry):
    """
    Clear cart cache for a POS session.
    Called when shift is closed or cart is cleared.

    Args:
        pos_opening_entry (str): POS Opening Entry name

    Returns:
        dict: Success status
    """
    # //// Neoffice — its caller is the till (useCustomerDisplaySync), writing to its own shift's display:
    # //// the shift's own cashier while the shift is open, or a till manager (_require_display_writer).
    _require_display_writer(pos_opening_entry)
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    cache_key = f"{CART_CACHE_PREFIX}{pos_opening_entry}"
    frappe.cache().delete_value(cache_key)

    # Emit event to clear display
    # //// Neoffice — to the till and its display, not to every desk account (see _tell_the_display)
    _tell_the_display(
        f"pos_cart_updated_{pos_opening_entry}",
        pos_opening_entry,
        {
            "items": [],
            "customer": None,
            "customer_name": None,
            "subtotal": 0,
            "total_tax": 0,
            "discount_amount": 0,
            "grand_total": 0,
            "currency": "EUR",
            "_cleared": True,
            "_updated_at": now(),
            "_pos_opening_entry": pos_opening_entry
        },
        after_commit=False,
    )

    return {"success": True}


@frappe.whitelist()
def notify_sale_complete(pos_opening_entry, invoice_name=None, grand_total=0):
    """
    Notify customer display that a sale has been completed.
    Shows thank you message on the display.

    Args:
        pos_opening_entry (str): POS Opening Entry name
        invoice_name (str): Sales Invoice name (optional)
        grand_total (float): Total amount paid (optional)

    Returns:
        dict: Success status
    """
    # //// Neoffice — its caller is the till (useCustomerDisplaySync), writing to its own shift's display:
    # //// the shift's own cashier while the shift is open, or a till manager (_require_display_writer).
    _require_display_writer(pos_opening_entry)
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    # Emit sale complete event
    # //// Neoffice — to the till and its display, not to every desk account (see _tell_the_display)
    _tell_the_display(
        f"pos_sale_complete_{pos_opening_entry}",
        pos_opening_entry,
        {
            "invoice_name": invoice_name,
            "grand_total": flt(grand_total),
            "timestamp": now()
        },
        after_commit=True,
    )

    # Clear cart cache after sale
    clear_cart_cache(pos_opening_entry)

    # A completed sale also retires any payment QR still on screen.
    clear_payment_qr(pos_opening_entry)

    return {"success": True}


@frappe.whitelist()
def push_payment_qr(pos_opening_entry, pairing_token, amount=0, currency="CHF",
                    mode_of_payment=None, provider=None):
    """
    Push a payment QR code to the customer display.

    Used by the main POS when a QR-bridge payment (TWINT) reaches the
    "awaiting scan" state: the customer-facing screen shows the QR full-screen
    so the buyer can scan it with their phone. The QR itself is rendered on the
    display from ``pairing_token`` (the front-end already bundles a QR lib).

    Args:
        pos_opening_entry (str): POS Opening Entry name
        pairing_token (str): the raw token to encode as a QR (e.g. TWINT pairing token)
        amount (float): amount to pay, for display
        currency (str): currency code, for display
        mode_of_payment (str): payment method label, for display
        provider (str): payment provider (e.g. "TWINT"), for display/branding

    Returns:
        dict: Success status
    """
    # //// Neoffice — its caller is the till (useCustomerDisplaySync), writing to its own shift's display:
    # //// the shift's own cashier while the shift is open, or a till manager (_require_display_writer).
    _require_display_writer(pos_opening_entry)
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))
    if not pairing_token:
        frappe.throw(_("Pairing token is required"))

    payload = {
        "pairing_token": pairing_token,
        "amount": flt(amount),
        "currency": currency or "CHF",
        "mode_of_payment": mode_of_payment,
        "provider": provider,
        "_updated_at": now(),
        "_pos_opening_entry": pos_opening_entry,
    }

    cache_key = f"{PAYMENT_QR_CACHE_PREFIX}{pos_opening_entry}"
    frappe.cache().set_value(cache_key, payload, expires_in_sec=PAYMENT_QR_CACHE_TTL)

    # //// Neoffice — to the till and its display, not to every desk account (see _tell_the_display);
    # //// immediately, for responsiveness
    _tell_the_display(f"pos_payment_qr_{pos_opening_entry}", pos_opening_entry, payload, after_commit=False)

    return {"success": True}


@frappe.whitelist()
def clear_payment_qr(pos_opening_entry):
    """
    Remove the payment QR from the customer display.

    Called when the QR-bridge payment reaches a terminal state (succeeded /
    failed / canceled) or the cashier closes the payment dialog.

    Args:
        pos_opening_entry (str): POS Opening Entry name

    Returns:
        dict: Success status
    """
    # //// Neoffice — its caller is the till (useCustomerDisplaySync), writing to its own shift's display:
    # //// the shift's own cashier while the shift is open, or a till manager (_require_display_writer).
    _require_display_writer(pos_opening_entry)
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    cache_key = f"{PAYMENT_QR_CACHE_PREFIX}{pos_opening_entry}"
    frappe.cache().delete_value(cache_key)

    # //// Neoffice — to the till and its display, not to every desk account (see _tell_the_display)
    _tell_the_display(
        f"pos_payment_qr_cleared_{pos_opening_entry}",
        pos_opening_entry,
        {
            "_cleared": True,
            "_updated_at": now(),
            "_pos_opening_entry": pos_opening_entry,
        },
        after_commit=False,
    )

    return {"success": True}


@frappe.whitelist(allow_guest=True)
def get_in_app_ads():
    """Return the enabled In-App Ads (image + name) for the customer display.

    Shown on the buyer-facing screen while the cart is empty: nothing when
    there are no ads, a single still image for one ad, an auto-scrolling
    carousel for several. Only ads with an image are returned.
    """
    ads = frappe.get_all(
        "In-App Ads",
        filters={"enabled": 1},
        fields=["name", "ad_name", "image"],
        order_by="creation asc",
    )
    return [a for a in ads if a.get("image")]
