# //// Neoffice — added file (no upstream equivalent). The personal code of the till (NeoResto lot 1, product owner,
# //// 01.11.2026): a waiter's phone stays signed in for 30 days (pos_next.api.session), and the counterpart is a lock that
# //// opens with a SHORT code of the waiter's own instead of the long account password, which is the pain on a phone.
"""The personal code of the till: four to six digits, kept hashed beside the account password and never in its place.

Where it lives. Frappe's own password store, `__Auth`, under a field name of its own (`pos_till_code`): `update_password` /
`check_password` hash it with passlib exactly as they hash the account password, and a field name other than `password` is a
row of its own, so setting or clearing a code never touches the account password. The length of the code is kept beside it
(`pos_till_code_length`, an encrypted row: a length is no secret, but the same store deletes both rows with the user). The
lock screen needs the length to send the code by itself at the last digit.

What a code is NOT. It opens the lock screen of a phone that is already signed in; it is no way to sign in, and it never
authorises a sensitive gesture (a refund, a discount): those keep asking a manager. Four digits are 10 000 possibilities, so
the guarantee is the throttle below, not the hash: anybody who can read the database can try them all, which is why the code
opens nothing but a screen on a session that already exists.

The throttle. Five wrong codes lock the user for 60 seconds, each further round of five doubles the wait up to 15 minutes, a
right code resets it. It is counted per USER (a restaurant's phones share one address, an address-based limit would lock the
whole room) and the attempts are counted with an atomic counter BEFORE the code is looked at, so that a hundred requests sent
at once get five looks, not a hundred. The password asked by `set_till_code` / `clear_till_code` has a throttle of its own,
the same numbers: an unlocked phone that is not its owner's must not become a way to guess the account password.

Nothing here logs, echoes or returns a code or a password.
"""

import math
import re
import time

import frappe
from frappe import _
from frappe.utils.password import (
	check_password,
	get_decrypted_password,
	remove_encrypted_password,
	set_encrypted_password,
	update_password,
)

# The `__Auth` field names. `password` is the account's own and is never written here.
CODE_FIELD = "pos_till_code"
LENGTH_FIELD = "pos_till_code_length"

MIN_CODE_LENGTH = 4
MAX_CODE_LENGTH = 6

WRONG_ATTEMPTS_BEFORE_LOCK = 5
FIRST_LOCK_SECONDS = 60
LONGEST_LOCK_SECONDS = 15 * 60
# Wrong attempts that did not reach the limit are forgotten after this long without one; the number of rounds already
# locked is remembered for a day, so that coming back after the lock does not start from a minute again
ATTEMPTS_MEMORY_SECONDS = 15 * 60
ROUNDS_MEMORY_SECONDS = 24 * 60 * 60

_CODE_SHAPE = re.compile(rf"[0-9]{{{MIN_CODE_LENGTH},{MAX_CODE_LENGTH}}}")


def _now() -> float:
	"""The clock of the throttle (a test moves it instead of waiting)."""
	return time.time()


# --- the rules of a code ---------------------------------------------------------------------------------------------


def is_too_easy(code: str) -> bool:
	"""One digit again and again (0000), or a run up or down the keypad (1234, 4321, 7890, 0987). Pure."""
	if len(set(code)) <= 1:
		return True
	steps = {(int(b) - int(a)) % 10 for a, b in zip(code, code[1:], strict=False)}
	return steps == {1} or steps == {9}


def _clean_new_code(code) -> str:
	"""The code as it will be kept, or a ValidationError that says what is wrong without echoing it."""
	# Only text is taken: 0482 sent as a number is 482, the digit is lost on the way
	text = code.strip() if isinstance(code, str) else ""
	if not _CODE_SHAPE.fullmatch(text):
		frappe.throw(_("The code must be {0} to {1} digits.").format(MIN_CODE_LENGTH, MAX_CODE_LENGTH))
	if is_too_easy(text):
		frappe.throw(_("This code is too easy to guess. Choose another one."))
	return text


# --- the throttle ----------------------------------------------------------------------------------------------------


def _lock_seconds(rounds: int) -> int:
	"""The wait of the round that comes after `rounds` rounds already locked: 60, 120, 240 ... up to 15 minutes."""
	return min(FIRST_LOCK_SECONDS * 2 ** min(rounds, 20), LONGEST_LOCK_SECONDS)


class _Throttle:
	"""Wrong attempts of one user in one scope ("code" or "password"), in the cache.

	`start()` counts the attempt BEFORE the secret is looked at (atomic, so parallel requests cannot all see "attempt 1");
	`fail(attempt)` locks when that attempt was the last allowed of its round; `succeed()` forgets everything. A cache that
	cannot be reached raises, and the attempt is refused: the door is never opened because the counter was unreachable.
	"""

	def __init__(self, scope: str, user: str):
		self.base = f"pos_till_code_throttle:{scope}:{user}"

	def _key(self, part: str):
		return frappe.cache.make_key(f"{self.base}:{part}")

	def _rounds(self) -> int:
		return int(frappe.cache.get(self._key("rounds")) or 0)

	def waiting(self) -> int:
		"""Seconds left of the lock, 0 when there is none."""
		until = frappe.cache.get(self._key("locked_until"))
		return max(0, math.ceil(float(until) - _now())) if until else 0

	def start(self):
		"""-> (seconds to wait, attempt). A non-zero wait means refused, the secret is not to be looked at."""
		wait = self.waiting()
		if wait:
			return wait, None
		rounds = self._rounds()
		key = self._key(f"attempts:{rounds}")
		number = int(frappe.cache.incr(key))
		frappe.cache.expire(key, ATTEMPTS_MEMORY_SECONDS)
		if number > WRONG_ATTEMPTS_BEFORE_LOCK:
			# The attempt that reached the limit is still looking, and sets the lock when it fails
			return _lock_seconds(rounds), None
		return 0, (rounds, number)

	def fail(self, attempt) -> int:
		"""The attempt was wrong. -> the seconds of the lock it set, 0 when it set none."""
		rounds, number = attempt
		if number < WRONG_ATTEMPTS_BEFORE_LOCK:
			return 0
		seconds = _lock_seconds(rounds)
		frappe.cache.set(self._key("locked_until"), repr(_now() + seconds), ex=seconds + 60)
		rounds_key = self._key("rounds")
		frappe.cache.incr(rounds_key)
		frappe.cache.expire(rounds_key, ROUNDS_MEMORY_SECONDS)
		return seconds

	def succeed(self) -> None:
		"""A right secret: the lock, the rounds and every count of this user in this scope are forgotten."""
		keys = [self._key("locked_until"), self._key("rounds")]
		keys += [self._key(f"attempts:{rounds}") for rounds in range(self._rounds() + 1)]
		frappe.cache.delete(*keys)


# --- what is stored --------------------------------------------------------------------------------------------------


def _has_code(user: str) -> bool:
	return bool(
		frappe.db.sql(
			"select 1 from `__Auth` where doctype = 'User' and name = %s and fieldname = %s and encrypted = 0 limit 1",
			(user, CODE_FIELD),
		)
	)


def _state(user: str) -> dict:
	"""`{"has_code", "length"}` of the user: the length is 0 when there is no code."""
	if not _has_code(user):
		return {"has_code": False, "length": 0}
	length = get_decrypted_password("User", user, LENGTH_FIELD, raise_exception=False)
	return {"has_code": True, "length": int(length) if length and str(length).isdigit() else 0}


def _require_desk_user() -> str:
	"""A desk account, like every endpoint of the till: a visitor and a portal account are refused (PermissionError)."""
	from pos_next.api.cash_entry import require_system_user

	require_system_user()
	return frappe.session.user


def _check_account_password(user: str, password) -> None:
	"""The CURRENT account password, behind its own throttle, or a ValidationError.

	`frappe.AuthenticationError` is never raised from here: Frappe's error handler clears the cookies of that exception, and
	a wrong password would sign the phone out. `delete_tracker_cache=False` keeps the account's failed-sign-in counters as
	they are (a right password here is no sign-in).
	"""
	throttle = _Throttle("password", user)
	wait, attempt = throttle.start()
	if wait:
		frappe.throw(_("Too many wrong passwords. Try again in {0} seconds.").format(wait))
	try:
		if not isinstance(password, str) or not password:
			raise frappe.AuthenticationError
		check_password(user, password, delete_tracker_cache=False)
	except frappe.AuthenticationError:
		wait = throttle.fail(attempt)
		if wait:
			frappe.throw(_("Too many wrong passwords. Try again in {0} seconds.").format(wait))
		frappe.throw(_("Incorrect password"))
	throttle.succeed()


def _matches(user: str, code) -> bool:
	"""Whether `code` is the user's code. A user with no code, or a malformed code, is simply "no"."""
	if not isinstance(code, str):
		return False
	code = code.strip()
	if not _CODE_SHAPE.fullmatch(code):
		return False
	try:
		check_password(user, code, fieldname=CODE_FIELD, delete_tracker_cache=False)
	except frappe.AuthenticationError:
		return False
	return True


def _refused(wait: int) -> dict:
	return {
		"verified": False,
		"locked": True,
		"wait_seconds": wait,
		"message": _("Too many wrong codes. Try again in {0} seconds.").format(wait),
	}


# --- the endpoints ---------------------------------------------------------------------------------------------------


@frappe.whitelist(methods=["POST"])
def has_till_code():
	"""Whether the SIGNED-IN user has a code, and its length. Nobody can ask about another user: there is no argument."""
	return _state(_require_desk_user())


@frappe.whitelist(methods=["POST"])
def set_till_code(password=None, code=None):
	"""Set (or replace) the signed-in user's code. Needs the CURRENT account password: a phone left unlocked cannot set one.

	Refused (ValidationError) for a wrong password or a code that is not four to six digits or is too easy; nothing is
	stored then. Other sessions of the user are left alone. A new code starts a clean throttle.
	"""
	user = _require_desk_user()
	code = _clean_new_code(code)
	_check_account_password(user, password)
	update_password(user, code, doctype="User", fieldname=CODE_FIELD, logout_all_sessions=False)
	set_encrypted_password("User", user, str(len(code)), fieldname=LENGTH_FIELD)
	_Throttle("code", user).succeed()
	return _state(user)


@frappe.whitelist(methods=["POST"])
def clear_till_code(password=None):
	"""Remove the signed-in user's code (needs the current account password). No code to remove is not an error."""
	user = _require_desk_user()
	_check_account_password(user, password)
	remove_encrypted_password("User", user, CODE_FIELD)
	remove_encrypted_password("User", user, LENGTH_FIELD)
	_Throttle("code", user).succeed()
	return _state(user)


@frappe.whitelist(methods=["POST"])
def verify_till_code(code=None):
	"""Is `code` the signed-in user's code? `{"verified": True}`, or `{"verified": False, "locked", "wait_seconds", "message"}`.

	A wrong code and no code at all give the same answer, and the throttle counts both: nothing here tells whether a code is
	set. A refusal by the throttle never raises (an AuthenticationError would make Frappe clear the cookies and sign the
	phone out): it is an answer, and says how many seconds to wait.
	"""
	user = _require_desk_user()
	throttle = _Throttle("code", user)
	wait, attempt = throttle.start()
	if wait:
		return _refused(wait)
	if _matches(user, code):
		throttle.succeed()
		return {"verified": True}
	wait = throttle.fail(attempt)
	if wait:
		return _refused(wait)
	return {"verified": False, "locked": False, "wait_seconds": 0, "message": _("Incorrect code")}
