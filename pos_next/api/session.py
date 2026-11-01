# //// Neoffice — added file (no upstream equivalent). The till keeps its staff signed in for as long as the till says
# //// (NeoRestau lot 1, product owner, 01.11.2026: "Ok, tu peux mettre 30 jours"). A waiter's phone and a till must not
# //// ask for a password every morning, and the length is a setting of the TILL (POS Settings.keep_signed_in_days, per
# //// POS Profile), not of the ERP's System Settings, whose `session_expiry` is the site's rule for everybody else.
"""Keep a till's staff signed in for the number of days the till's POS Settings say.

A session may carry ITS OWN expiry, stamped in `tabSessions.sessiondata` (the frappe fork honours it in the session cache, in
the database read, in the nightly sweep `clear_expired_sessions`, and gives the `sid` cookie that stamped life on EVERY
request: frappe/sessions.py "a session may carry ITS OWN expiry", frappe/auth.py `_session_max_age`). This endpoint stamps
the session of a signed-in member of the till's staff and gives the cookie of its own answer the same life. The model is
`neoffice_gym.api.session.remember_me`.

The gym's endpoint refuses accounts with desk access (ruling of 09.09.2026, for the members' journal: a phone left on a
weight bench must not leave the whole ERP open). THE TILL IS A DIFFERENT, EXPLICIT, PER-TILL CHOICE of the product owner
(01.11.2026): the staff of a till DO get the long session, desk accounts included, because a waiter's phone is the till.
The gym's ruling is untouched. Two things follow, and are kept in the open:

* The session is the browser's: the month also covers the desk, for a user who opens it on that device. The setting is
  capped at 90 days, and 0 (the default of a counter till) leaves the site's rule alone.
* Nothing here locks the device: a lost phone keeps its session until the day it is ended (an administrator's "end
  session", the user's own sign-out, the cap). The personal-code lock of the till is a task of its own.
"""

import frappe
from frappe import _, sessions
from frappe.utils import cint

# The longest a till may keep its staff signed in. A value above it (an import, a script) is cut here.
MAX_KEEP_SIGNED_IN_DAYS = 90
# What a till that becomes a restaurant till starts with (pos_settings.POSSettings.validate, the patch for the tills that
# already were): Daniel's "30 jours", 01.11.2026. A counter till starts at 0.
RESTAURANT_KEEP_SIGNED_IN_DAYS = 30


def expiry_to_stamp(keep_signed_in_days, current_expiry) -> str | None:
	"""The expiry to stamp on a session, or None when it stays as it is. Pure: no session, no database.

	`keep_signed_in_days` is the till's setting (0, empty or negative: the site's rule, nothing to stamp; above
	MAX_KEEP_SIGNED_IN_DAYS: cut to it). `current_expiry` is what the session lives by now, "HH:MM:SS" (its own stamp, else
	the site's rule): a session that already lives as long, or longer, is NEVER shortened, so a longer stamp that something
	else gave it, or a site rule longer than the till's, wins. A current expiry that cannot be read is replaced.
	"""
	days = max(0, min(cint(keep_signed_in_days), MAX_KEEP_SIGNED_IN_DAYS))
	if not days:
		return None
	wanted = f"{days * 24}:00:00"
	try:
		if (
			current_expiry
			and sessions.get_expiry_in_seconds(current_expiry) >= sessions.get_expiry_in_seconds(wanted)
		):
			return None
	except Exception:
		# An unreadable stamp is honoured by nobody (the fork falls back to the site's rule), so it is replaced
		pass
	return wanted


@frappe.whitelist(methods=["POST"])
def keep_signed_in(pos_profile):
	"""Stamp the caller's session with the length the till's POS Settings say; the till calls it once its profile is known.

	Returns `{"days": <the setting, capped>, "stamped": <whether the session was changed>}`. `{"days": 0, ...}` is a till
	that follows the site's rule. Refused (PermissionError) to a visitor, a portal account and anyone who is not on the
	till's own user list: the month is for the till's staff, not for every account that may run every till (a manager who
	works a till is on its list, as opening a shift needs him to be).
	"""
	_require_staff_of(pos_profile)
	days = _days_of(pos_profile)
	if not days:
		return {"days": 0, "stamped": False}

	session_obj = getattr(frappe.local, "session_obj", None)
	if not session_obj or session_obj.user != frappe.session.user or frappe.session.sid == "Guest":
		# No session of the user's own to stamp (a call with an API key, for one)
		return {"days": days, "stamped": False}

	data = session_obj.data.data
	stamp = expiry_to_stamp(days, data.get("session_expiry") or sessions.get_expiry_period())
	if stamp is None:
		return {"days": days, "stamped": False}

	# The session is already in the database by now. The stamp is changed and THEN the rewrite is forced: without
	# `force=True`, Session.update touches the database once every ten minutes at most, and the change would stay in memory.
	data.session_expiry = stamp
	session_obj.update(force=True)
	# AND the cookie, which the sign-in gave the site's life. Every later request gives it the stamped one (the fork's
	# auth._session_max_age); this is the answer to the call itself.
	frappe.local.cookie_manager.set_cookie(
		"sid", frappe.session.sid, max_age=sessions.get_expiry_in_seconds(stamp), httponly=True
	)
	return {"days": days, "stamped": True}


def _require_staff_of(pos_profile) -> None:
	"""A desk account that is on the till's user list, or PermissionError."""
	from pos_next.api.cash_entry import require_system_user

	require_system_user()
	if not pos_profile or not frappe.db.exists(
		"POS Profile User", {"parent": pos_profile, "user": frappe.session.user}
	):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _days_of(pos_profile) -> int:
	"""The till's setting as it stands, 0..MAX_KEEP_SIGNED_IN_DAYS. A till with no settings, or with settings switched off
	(the bootstrap reads the same row, `enabled = 1`), follows the site."""
	days = frappe.db.get_value(
		"POS Settings", {"pos_profile": pos_profile, "enabled": 1}, "keep_signed_in_days"
	)
	return max(0, min(cint(days), MAX_KEEP_SIGNED_IN_DAYS))
