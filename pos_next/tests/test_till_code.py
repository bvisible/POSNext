# //// Neoffice — added file (no upstream equivalent).
"""The personal code of the till (NeoResto lot 1, product owner, 01.11.2026).

A waiter's phone stays signed in for 30 days; the counterpart is a lock that is opened by a SHORT PERSONAL CODE instead of
the long account password. `pos_next.api.till_code` keeps that code, hashed, beside the account password and never in its
place, and checks it behind a throttle of its own.

The suite works on REAL accounts (a password is set the way Frappe sets it, the code is stored and read back from `__Auth`
where Frappe keeps it) and, for the sessions, on a REAL sign-in (`LoginManager.login_as`, as the session suite does). The
throttle lives in the cache; the clock it reads is `till_code._now`, which a test moves instead of waiting.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils.password import check_password, update_password

from pos_next.tests.test_keeping_staff_signed_in import a_till, saved, signed_in
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _user

API = "pos_next.api.till_code"
STAFF = "tillcode-staff@yopmail.com"
OTHER = "tillcode-other@yopmail.com"
PORTAL = "tillcode-portal@yopmail.com"
PASSWORD = "Tillcode-Account#2026"
OTHER_PASSWORD = "Tillcode-Other#2026"
CODE = "4829"


def endpoint(name):
	"""An endpoint by its dotted path (the suite loads on the code before it, each test fails for its own reason)."""
	return frappe.get_attr(f"{API}.{name}")


def has_till_code():
	return endpoint("has_till_code")()


def set_till_code(password, code):
	return endpoint("set_till_code")(password, code)


def clear_till_code(password):
	return endpoint("clear_till_code")(password)


def verify_till_code(code):
	return endpoint("verify_till_code")(code)


def stored(user, fieldname="pos_till_code"):
	"""The row of `__Auth` as stored: the password column and the encrypted flag, or None."""
	rows = frappe.db.sql(
		"select password, encrypted from `__Auth` where doctype = 'User' and name = %s and fieldname = %s",
		(user, fieldname),
	)
	return rows[0] if rows else None


def forget_throttle():
	frappe.cache.delete_keys("pos_till_code_throttle")


class Clock:
	"""A clock for the throttle that a test moves by hand."""

	def __init__(self, start=1_000_000.0):
		self.now = start

	def __call__(self):
		return self.now

	def advance(self, seconds):
		self.now += seconds


class TillCodeCase(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Whatever the class built is rolled back with the class, by the base class
		cls.addClassCleanup(frappe.set_user, "Administrator")
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		_user(STAFF, [CASHIER_ROLE], "System User")
		_user(OTHER, [CASHIER_ROLE], "System User")
		_user(PORTAL, ["Customer"], "Website User")
		update_password(STAFF, PASSWORD)
		update_password(OTHER, OTHER_PASSWORD)
		update_password(PORTAL, PASSWORD)

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.savepoint("till_code")
		self.addCleanup(frappe.db.rollback, save_point="till_code")
		self.addCleanup(frappe.set_user, "Administrator")
		forget_throttle()
		self.addCleanup(forget_throttle)
		self.clock = Clock()
		clock = patch(f"{API}._now", self.clock)
		clock.start()
		self.addCleanup(clock.stop)
		frappe.set_user(STAFF)

	def wrong_codes(self, how_many, code="9306"):
		return [verify_till_code(code) for _attempt in range(how_many)]


class WhatACodeMayBe(TillCodeCase):
	"""Four to six digits, digits only, and nothing everybody tries first."""

	def test_four_to_six_digits_are_accepted(self):
		for code in ("4829", "70516", "380417", "0482", "1357", "2468"):
			with self.subTest(code=code):
				set_till_code(PASSWORD, code)
				self.assertTrue(verify_till_code(code)["verified"])

	def test_the_length_is_four_to_six(self):
		for code in ("", "1", "482", "4829017", "48290172"):
			with self.subTest(code=code), self.assertRaises(frappe.ValidationError):
				set_till_code(PASSWORD, code)
		self.assertFalse(has_till_code()["has_code"])

	def test_digits_only(self):
		for code in ("48a9", "48 29", "48-29", "４８２９", "48.9", "abcd", "4829\n1"):
			with self.subTest(code=code), self.assertRaises(frappe.ValidationError):
				set_till_code(PASSWORD, code)
		self.assertFalse(has_till_code()["has_code"])

	def test_a_code_that_is_not_text_is_refused(self):
		# 0482 sent as a number is 482: the digits are lost on the way, so only text is taken
		for code in (None, 4829, 482.9, ["4829"], {"code": "4829"}):
			with self.subTest(code=code), self.assertRaises(frappe.ValidationError):
				set_till_code(PASSWORD, code)
		self.assertFalse(has_till_code()["has_code"])

	def test_the_code_everybody_tries_first_is_refused(self):
		# One digit again and again, a run up or down the keypad (turning the corner at 9 and 0 as well)
		trivial = (
			"0000",
			"1111",
			"9999",
			"11111",
			"222222",
			"1234",
			"4321",
			"2345",
			"6789",
			"9876",
			"0123",
			"3210",
			"7890",
			"0987",
			"9012",
			"12345",
			"54321",
			"123456",
			"654321",
			"567890",
		)
		for code in trivial:
			with self.subTest(code=code), self.assertRaises(frappe.ValidationError):
				set_till_code(PASSWORD, code)
		self.assertFalse(has_till_code()["has_code"])

	def test_a_code_that_only_looks_like_a_run_is_accepted(self):
		for code in ("1324", "1212", "2580", "1357", "135790"):
			with self.subTest(code=code):
				set_till_code(PASSWORD, code)
				self.assertTrue(verify_till_code(code)["verified"])

	def test_the_refusal_names_the_reason_and_never_echoes_the_code(self):
		with self.assertRaises(frappe.ValidationError) as caught:
			set_till_code(PASSWORD, "1234")
		self.assertNotIn("1234", str(caught.exception))
		self.assertNotIn(PASSWORD, str(caught.exception))
		with self.assertRaises(frappe.ValidationError) as caught:
			set_till_code("not the password", CODE)
		self.assertNotIn(CODE, str(caught.exception))


class SettingTheCode(TillCodeCase):
	"""`set_till_code(password, code)`: the CURRENT account password, then the code, hashed beside the password."""

	def test_nobody_has_a_code_to_begin_with(self):
		self.assertEqual(has_till_code(), {"has_code": False, "length": 0})

	def test_a_code_is_set_with_the_right_password(self):
		self.assertEqual(set_till_code(PASSWORD, CODE), {"has_code": True, "length": 4})
		self.assertEqual(has_till_code(), {"has_code": True, "length": 4})
		set_till_code(PASSWORD, "380417")
		self.assertEqual(has_till_code(), {"has_code": True, "length": 6})

	def test_a_wrong_password_refuses_and_stores_nothing(self):
		for password in ("not the password", "", None, CODE, OTHER_PASSWORD):
			with self.subTest(password=password), self.assertRaises(frappe.ValidationError):
				set_till_code(password, CODE)
		self.assertIsNone(stored(STAFF))
		self.assertIsNone(stored(STAFF, "pos_till_code_length"))
		self.assertEqual(has_till_code(), {"has_code": False, "length": 0})

	def test_a_wrong_password_never_changes_a_code_already_set(self):
		set_till_code(PASSWORD, CODE)
		before = stored(STAFF)
		with self.assertRaises(frappe.ValidationError):
			set_till_code("not the password", "380417")
		self.assertEqual(stored(STAFF), before)
		self.assertTrue(verify_till_code(CODE)["verified"])

	def test_a_wrong_password_is_not_an_authentication_error(self):
		"""Frappe's error handler clears the cookies of an AuthenticationError: the session of the phone would be signed out."""
		with self.assertRaises(frappe.ValidationError) as caught:
			set_till_code("not the password", CODE)
		self.assertNotIsInstance(caught.exception, frappe.AuthenticationError)

	def test_the_code_is_stored_as_a_hash_never_as_the_code(self):
		set_till_code(PASSWORD, CODE)
		password, encrypted = stored(STAFF)
		self.assertNotEqual(password, CODE)
		self.assertNotIn(CODE, password)
		self.assertEqual(encrypted, 0, "a hash, not an encrypted value that can be read back")
		self.assertTrue(password.startswith("$pbkdf2-sha256$") or password.startswith("$argon2"), password)
		# Hashed with a salt of its own: the same code twice is not the same stored value
		set_till_code(PASSWORD, CODE)
		self.assertNotEqual(stored(STAFF)[0], password)

	def test_the_code_is_in_no_column_of_the_user_and_no_default(self):
		set_till_code(PASSWORD, CODE)
		row = json.dumps(frappe.get_doc("User", STAFF).as_dict(), default=str)
		self.assertNotIn(CODE, row)
		defaults = json.dumps(
			frappe.db.sql("select * from `tabDefaultValue` where parent = %s", STAFF, as_dict=True), default=str
		)
		self.assertNotIn(CODE, defaults)

	def test_the_account_password_still_works_and_is_unchanged(self):
		before = stored(STAFF, "password")
		set_till_code(PASSWORD, CODE)
		self.assertEqual(stored(STAFF, "password"), before)
		self.assertEqual(check_password(STAFF, PASSWORD), STAFF)
		# and the code is not a way in with the account password's door
		with self.assertRaises(frappe.AuthenticationError):
			check_password(STAFF, CODE)

	def test_the_code_is_not_accepted_as_the_account_password_either_way(self):
		set_till_code(PASSWORD, CODE)
		self.assertFalse(verify_till_code(PASSWORD)["verified"])

	def test_a_new_code_replaces_the_old_one(self):
		set_till_code(PASSWORD, CODE)
		set_till_code(PASSWORD, "380417")
		self.assertFalse(verify_till_code(CODE)["verified"])
		self.assertTrue(verify_till_code("380417")["verified"])

	def test_a_code_belongs_to_its_user(self):
		set_till_code(PASSWORD, CODE)
		frappe.set_user(OTHER)
		self.assertEqual(has_till_code(), {"has_code": False, "length": 0})
		self.assertFalse(verify_till_code(CODE)["verified"])
		# The other user sets the same code: two rows, two hashes
		set_till_code(OTHER_PASSWORD, CODE)
		self.assertNotEqual(stored(OTHER)[0], stored(STAFF)[0])

	def test_the_password_of_another_account_is_not_enough(self):
		with self.assertRaises(frappe.ValidationError):
			set_till_code(OTHER_PASSWORD, CODE)
		self.assertIsNone(stored(STAFF))

	def test_setting_a_code_leaves_the_user_record_alone(self):
		modified = frappe.db.get_value("User", STAFF, "modified")
		set_till_code(PASSWORD, CODE)
		self.assertEqual(frappe.db.get_value("User", STAFF, "modified"), modified)

	def test_setting_a_code_starts_a_clean_throttle(self):
		set_till_code(PASSWORD, CODE)
		self.wrong_codes(4)
		set_till_code(PASSWORD, "380417")
		self.wrong_codes(4)
		self.assertTrue(verify_till_code("380417")["verified"])


class ClearingTheCode(TillCodeCase):
	def test_clearing_needs_the_password(self):
		set_till_code(PASSWORD, CODE)
		for password in ("not the password", "", None, CODE):
			with self.subTest(password=password), self.assertRaises(frappe.ValidationError):
				clear_till_code(password)
		self.assertTrue(has_till_code()["has_code"])
		self.assertTrue(verify_till_code(CODE)["verified"])

	def test_clearing_removes_the_code_and_what_goes_with_it(self):
		set_till_code(PASSWORD, CODE)
		self.assertEqual(clear_till_code(PASSWORD), {"has_code": False, "length": 0})
		self.assertEqual(has_till_code(), {"has_code": False, "length": 0})
		self.assertIsNone(stored(STAFF))
		self.assertIsNone(stored(STAFF, "pos_till_code_length"))
		self.assertFalse(verify_till_code(CODE)["verified"])

	def test_clearing_leaves_the_account_password_alone(self):
		set_till_code(PASSWORD, CODE)
		before = stored(STAFF, "password")
		clear_till_code(PASSWORD)
		self.assertEqual(stored(STAFF, "password"), before)
		self.assertEqual(check_password(STAFF, PASSWORD), STAFF)

	def test_clearing_when_there_is_no_code_is_not_an_error(self):
		self.assertEqual(clear_till_code(PASSWORD), {"has_code": False, "length": 0})

	def test_clearing_does_not_touch_another_users_code(self):
		set_till_code(PASSWORD, CODE)
		frappe.set_user(OTHER)
		set_till_code(OTHER_PASSWORD, "380417")
		clear_till_code(OTHER_PASSWORD)
		frappe.set_user(STAFF)
		self.assertTrue(verify_till_code(CODE)["verified"])


class VerifyingTheCode(TillCodeCase):
	def test_the_right_code_is_verified(self):
		set_till_code(PASSWORD, CODE)
		self.assertEqual(verify_till_code(CODE), {"verified": True})

	def test_a_wrong_code_is_not(self):
		set_till_code(PASSWORD, CODE)
		for code in ("9306", "4828", "48290", "", None, 4829, "abcd", " ", "4829 4829"):
			with self.subTest(code=code):
				answer = verify_till_code(code)
				self.assertFalse(answer["verified"])
				self.assertIn("message", answer)

	def test_the_code_is_taken_as_typed_without_the_spaces_around_it(self):
		set_till_code(PASSWORD, CODE)
		self.assertTrue(verify_till_code(f" {CODE} ")["verified"])

	def test_a_user_with_no_code_gets_the_answer_of_a_wrong_code(self):
		"""Nothing in the answer says whether a code is set: a wrong code and no code at all read the same."""
		with_no_code = verify_till_code(CODE)
		set_till_code(PASSWORD, "380417")
		with_a_code = verify_till_code(CODE)
		self.assertEqual(with_no_code, with_a_code)
		self.assertEqual(set(with_no_code), {"verified", "message", "locked", "wait_seconds"})

	def test_the_answer_never_echoes_the_code_or_the_password(self):
		set_till_code(PASSWORD, CODE)
		for answer in (verify_till_code(CODE), verify_till_code("9306"), set_till_code(PASSWORD, CODE)):
			text = json.dumps(answer)
			self.assertNotIn(CODE, text)
			self.assertNotIn("9306", text)
			self.assertNotIn(PASSWORD, text)

	def test_nothing_is_logged_with_a_code_or_a_password(self):
		with patch("frappe.log_error") as log_error, patch("frappe.logger") as logger, patch("builtins.print") as printed:
			set_till_code(PASSWORD, CODE)
			verify_till_code("9306")
			verify_till_code(CODE)
			clear_till_code(PASSWORD)
			with self.assertRaises(frappe.ValidationError):
				set_till_code("not the password", "380417")
		for mock in (log_error, logger, printed):
			self.assertNotIn(CODE, repr(mock.mock_calls))
			self.assertNotIn("9306", repr(mock.mock_calls))
			self.assertNotIn("380417", repr(mock.mock_calls))
			self.assertNotIn(PASSWORD, repr(mock.mock_calls))

	def test_the_endpoints_answer_a_post_only(self):
		for name in ("has_till_code", "set_till_code", "clear_till_code", "verify_till_code"):
			with self.subTest(name=name):
				function = endpoint(name)
				self.assertEqual(tuple(frappe.allowed_http_methods_for_whitelisted_func[function]), ("POST",))

	def test_the_account_login_counters_are_not_touched_by_a_right_code(self):
		"""`check_password` forgets the failed sign-ins of the account on a success unless it is told not to: a code must not do that."""
		set_till_code(PASSWORD, CODE)
		with patch("frappe.utils.password.delete_login_failed_cache") as forget:
			verify_till_code(CODE)
			verify_till_code("9306")
			set_till_code(PASSWORD, "380417")
			clear_till_code(PASSWORD)
		forget.assert_not_called()


class WhoMayHaveACode(TillCodeCase):
	def calls(self):
		return (
			has_till_code,
			lambda: set_till_code(PASSWORD, CODE),
			lambda: clear_till_code(PASSWORD),
			lambda: verify_till_code(CODE),
		)

	def test_a_visitor_is_refused(self):
		frappe.set_user("Guest")
		for call in self.calls():
			with self.assertRaises(frappe.PermissionError):
				call()
		self.assertIsNone(stored("Guest"))

	def test_a_portal_account_is_refused(self):
		frappe.set_user(PORTAL)
		for call in self.calls():
			with self.assertRaises(frappe.PermissionError):
				call()
		self.assertIsNone(stored(PORTAL))

	def test_the_refusal_comes_before_the_password_is_looked_at(self):
		"""A portal account is not told whether its password was right."""
		frappe.set_user(PORTAL)
		with self.assertRaises(frappe.PermissionError):
			set_till_code("not the password", CODE)

	def test_a_desk_account_may(self):
		for call in self.calls():
			call()

	def test_administrator_may(self):
		frappe.set_user("Administrator")
		update_password("Administrator", PASSWORD)
		self.assertEqual(set_till_code(PASSWORD, CODE), {"has_code": True, "length": 4})
		self.assertTrue(verify_till_code(CODE)["verified"])


class TheThrottle(TillCodeCase):
	"""Five wrong codes lock the user for 60 seconds, each further round doubles it up to 15 minutes, a right code resets it."""

	def setUp(self):
		super().setUp()
		set_till_code(PASSWORD, CODE)

	def test_four_wrong_codes_lock_nothing(self):
		answers = self.wrong_codes(4)
		self.assertTrue(all(not a["locked"] and a["wait_seconds"] == 0 for a in answers))
		self.assertTrue(verify_till_code(CODE)["verified"])

	def test_the_fifth_wrong_code_locks_for_a_minute(self):
		answers = self.wrong_codes(5)
		self.assertEqual([a["locked"] for a in answers], [False, False, False, False, True])
		self.assertEqual(answers[-1]["wait_seconds"], 60)
		self.assertFalse(answers[-1]["verified"])

	def test_the_right_code_is_refused_while_the_lock_lasts(self):
		self.wrong_codes(5)
		answer = verify_till_code(CODE)
		self.assertFalse(answer["verified"])
		self.assertTrue(answer["locked"])
		self.assertEqual(answer["wait_seconds"], 60)

	def test_the_refusal_says_how_long_to_wait_and_the_wait_runs_down(self):
		self.wrong_codes(5)
		self.clock.advance(20)
		answer = verify_till_code(CODE)
		self.assertEqual((answer["locked"], answer["wait_seconds"]), (True, 40))
		self.assertIn("40", answer["message"])
		self.clock.advance(39)
		self.assertEqual(verify_till_code(CODE)["wait_seconds"], 1)

	def test_the_lock_is_over_after_the_minute(self):
		self.wrong_codes(5)
		self.clock.advance(60)
		self.assertEqual(verify_till_code(CODE), {"verified": True})

	def test_attempts_during_the_lock_do_not_lengthen_it(self):
		self.wrong_codes(5)
		for _attempt in range(20):
			verify_till_code("9306")
			verify_till_code(CODE)
		self.clock.advance(60)
		self.assertTrue(verify_till_code(CODE)["verified"])

	def test_each_further_round_doubles_the_wait_up_to_fifteen_minutes(self):
		waits = []
		for _round in range(7):
			answers = self.wrong_codes(5)
			waits.append(answers[-1]["wait_seconds"])
			self.clock.advance(answers[-1]["wait_seconds"])
		self.assertEqual(waits, [60, 120, 240, 480, 900, 900, 900])

	def test_a_right_code_resets_the_rounds(self):
		for _round in range(3):
			answers = self.wrong_codes(5)
			self.clock.advance(answers[-1]["wait_seconds"])
		self.assertTrue(verify_till_code(CODE)["verified"])
		# The next round is the first again: a minute, not 8 minutes
		self.assertEqual(self.wrong_codes(5)[-1]["wait_seconds"], 60)

	def test_a_right_code_resets_the_count_of_wrong_ones(self):
		self.wrong_codes(4)
		self.assertTrue(verify_till_code(CODE)["verified"])
		answers = self.wrong_codes(4)
		self.assertFalse(any(a["locked"] for a in answers))

	def test_the_fifth_attempt_may_be_the_right_one(self):
		self.wrong_codes(4)
		self.assertEqual(verify_till_code(CODE), {"verified": True})
		self.assertFalse(verify_till_code("9306")["locked"])

	def test_a_user_with_no_code_is_throttled_the_same(self):
		frappe.set_user(OTHER)
		answers = self.wrong_codes(5)
		self.assertEqual(answers[-1]["wait_seconds"], 60)
		self.assertTrue(verify_till_code(CODE)["locked"])

	def test_the_lock_is_one_users_own(self):
		self.wrong_codes(5)
		frappe.set_user(OTHER)
		set_till_code(OTHER_PASSWORD, "380417")
		self.assertTrue(verify_till_code("380417")["verified"])

	def test_five_wrong_passwords_lock_the_setting_of_a_code_too(self):
		"""A stolen phone that is unlocked must not be a way to guess the account password."""
		for _attempt in range(5):
			with self.assertRaises(frappe.ValidationError):
				set_till_code("not the password", "380417")
		with self.assertRaises(frappe.ValidationError) as caught:
			set_till_code(PASSWORD, "380417")
		self.assertIn("60", str(caught.exception))
		with self.assertRaises(frappe.ValidationError):
			clear_till_code(PASSWORD)
		self.assertTrue(verify_till_code(CODE)["verified"], "the code that was set is untouched")
		self.clock.advance(60)
		self.assertEqual(set_till_code(PASSWORD, "380417")["length"], 6)

	def test_wrong_passwords_and_wrong_codes_are_counted_apart(self):
		for _attempt in range(4):
			with self.assertRaises(frappe.ValidationError):
				set_till_code("not the password", "380417")
		self.wrong_codes(4)
		self.assertTrue(verify_till_code(CODE)["verified"])
		self.assertEqual(set_till_code(PASSWORD, "380417")["length"], 6)

	def test_an_unreadable_throttle_does_not_open_the_door(self):
		"""When the cache cannot be read the code is not waved through."""
		with patch(f"{API}._Throttle.start", side_effect=ConnectionError("no cache")):
			with self.assertRaises(Exception):
				verify_till_code(CODE)


class OnARealSession(FrappeTestCase):
	"""The code is set and used on the session of a phone that is signed in; no other session of the user is touched."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.addClassCleanup(frappe.set_user, "Administrator")
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		_user(STAFF, [CASHIER_ROLE], "System User")
		update_password(STAFF, PASSWORD)

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.savepoint("till_code_session")
		self.addCleanup(frappe.db.rollback, save_point="till_code_session")
		self.addCleanup(frappe.set_user, "Administrator")
		forget_throttle()
		self.addCleanup(forget_throttle)

	def sessions_of(self, user):
		return {row[0] for row in frappe.db.sql("select sid from `tabSessions` where user = %s", user)}

	def test_setting_and_using_a_code_signs_nobody_out(self):
		with signed_in(STAFF) as sid:
			other_sessions = self.sessions_of(STAFF) - {sid}
			set_till_code(PASSWORD, CODE)
			self.assertTrue(verify_till_code(CODE)["verified"])
			self.assertFalse(verify_till_code("9306")["verified"])
			clear_till_code(PASSWORD)
			self.assertIn(sid, self.sessions_of(STAFF))
			self.assertEqual(self.sessions_of(STAFF) - {sid}, other_sessions)
			self.assertEqual(frappe.session.user, STAFF)

	def test_a_second_phone_of_the_same_user_stays_signed_in(self):
		with signed_in(STAFF) as first:
			pass
		# The helper leaves the row of the first sign-in in `tabSessions`: it stands for another device of the user
		self.assertIn(first, self.sessions_of(STAFF))
		with signed_in(STAFF) as second:
			set_till_code(PASSWORD, CODE)
			verify_till_code(CODE)
			clear_till_code(PASSWORD)
		self.assertNotEqual(first, second)
		self.assertLessEqual({first, second}, self.sessions_of(STAFF))

	def test_a_wrong_password_does_not_clear_the_cookie_of_the_session(self):
		with signed_in(STAFF) as sid:
			with self.assertRaises(frappe.ValidationError):
				set_till_code("not the password", CODE)
			self.assertIn(sid, self.sessions_of(STAFF))
			self.assertEqual(frappe.session.user, STAFF)


class TheSettingsOfTheLock(FrappeTestCase):
	"""The lock is the till's own choice in its POS Settings: off by default, a delay, and whether leaving the screen locks at once."""

	TILL = "_PNXT till lock till"
	OTHER_TILL = "_PNXT till lock other till"
	PATCH = "pos_next.patches.neorestau.keep_the_screen_lock_of_the_tills_that_lock"

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)

	def column(self, till, fieldname):
		return frappe.db.get_value("POS Settings", {"pos_profile": till}, fieldname)

	def test_a_till_does_not_lock_unless_its_manager_says_so(self):
		meta = frappe.get_meta("POS Settings")
		self.assertEqual(str(meta.get_field("enable_session_lock").default or 0), "0")
		self.assertEqual(str(meta.get_field("session_lock_timeout").default), "5")
		till = a_till(self.TILL, [STAFF], enable_restaurant_mode=1)
		self.assertEqual(self.column(till, "enable_session_lock"), 0)

	def test_leaving_the_screen_locks_only_when_asked(self):
		field = frappe.get_meta("POS Settings").get_field("session_lock_on_leave")
		self.assertEqual(field.fieldtype, "Check")
		self.assertEqual(str(field.default or 0), "0")
		self.assertEqual(field.depends_on, "enable_session_lock")
		till = a_till(self.TILL, [STAFF], enable_restaurant_mode=1, enable_session_lock=1)
		self.assertEqual(self.column(till, "session_lock_on_leave"), 0)

	def test_the_fields_reach_the_till_and_have_a_default_for_a_till_with_no_settings(self):
		from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS, merge_pos_settings

		for key in ("enable_session_lock", "session_lock_timeout", "session_lock_on_leave"):
			self.assertIn(key, POS_SETTINGS_FIELDS)
			self.assertIn(key, DEFAULT_POS_SETTINGS)
		self.assertEqual(DEFAULT_POS_SETTINGS["session_lock_on_leave"], 0)
		till = a_till(
			self.TILL, [STAFF], enable_session_lock=1, session_lock_timeout=12, session_lock_on_leave=1
		)
		row = frappe.db.get_value("POS Settings", {"pos_profile": till}, "*", as_dict=True)
		merged = merge_pos_settings(row)
		keys = ("enable_session_lock", "session_lock_timeout", "session_lock_on_leave")
		self.assertEqual(tuple(merged[key] for key in keys), (1, 12, 1))

	def test_a_manager_saves_the_lock_with_the_other_settings(self):
		till = a_till(self.TILL, [STAFF], enable_session_lock=0)
		doc = frappe.get_doc("POS Settings", {"pos_profile": till})
		doc.enable_session_lock = 1
		doc.session_lock_timeout = 3
		doc.session_lock_on_leave = 1
		saved(doc)
		keys = ("enable_session_lock", "session_lock_timeout", "session_lock_on_leave")
		self.assertEqual(tuple(self.column(till, key) for key in keys), (1, 3, 1))

	def test_the_patch_keeps_the_present_behaviour_of_the_tills_that_already_lock(self):
		"""Until now a lock locked the moment the screen was left. A till that locks keeps that; the new default (wait for the
		delay) is for the tills that start locking from now on. A second run changes nothing."""
		locking = a_till(self.TILL, [STAFF], enable_session_lock=1)
		not_locking = a_till(self.OTHER_TILL, [STAFF], enable_session_lock=0)
		self.assertEqual(self.column(locking, "session_lock_on_leave"), 0)
		for _run in range(2):
			frappe.get_attr(f"{self.PATCH}.execute")()
			self.assertEqual(self.column(locking, "session_lock_on_leave"), 1)
			self.assertEqual(self.column(not_locking, "session_lock_on_leave"), 0)
