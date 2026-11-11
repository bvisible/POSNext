# //// Neoffice — added file (no upstream equivalent).
"""A till keeps its staff signed in for as long as the till says (NeoResto lot 1, product owner, 01.11.2026).

The setting is the till's own, on its POS Settings (`keep_signed_in_days`, 0 = the site's session rule), not the site's
System Settings. The till calls `pos_next.api.session.keep_signed_in` once its profile is known; the endpoint stamps
the session with its own expiry, forces the session row to be rewritten and gives the `sid` cookie the same life.

The suite works on REAL sessions: a user is signed in through `LoginManager.login_as`, as a sign-in does, the endpoint
runs on that session, and what it left is read where Frappe reads it: the session object, the `tabSessions` row, the
cache, the cookie the response will carry, the cookie of the NEXT request (`CookieManager.init_cookies`) and the nightly
sweep (`get_expired_sessions`), which the frappe fork teaches to honour a session's own expiry. The last class goes through
Frappe's own request handler, as a browser does, and reads the `Set-Cookie` header.

The site's rule is pinned to 6 hours in every test (osiris's own): a fresh bench has none and falls back to 240 hours. The
tills are the rows the endpoint reads, a POS Settings row and the POS Profile User rows (it never loads the POS Profile).
"""

from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe import sessions
from frappe.auth import CookieManager, LoginManager
from frappe.tests.test_api import make_request
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, get_test_client, now

from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _user

API = "pos_next.api.session"
KEEP = f"{API}.keep_signed_in"
MISSING = object()

STAFF = "keepsigned-staff@yopmail.com"
OUTSIDER = "keepsigned-outsider@yopmail.com"
MANAGER = "keepsigned-manager@yopmail.com"
PORTAL = "keepsigned-portal@yopmail.com"
TILL = "_PNXT keep-signed-in till"
OTHER_TILL = "_PNXT keep-signed-in other till"
NO_SETTINGS_TILL = "_PNXT keep-signed-in till with no settings"
CHOSEN_TILL = "_PNXT keep-signed-in till with a chosen number"
PATCH = "pos_next.patches.neorestau.keep_restaurant_staff_signed_in.execute"
# The site's rule, as osiris has it
SITE_RULE = "06:00:00"
MONTH = 720 * 3600
QUARTER = 2160 * 3600


def keep_signed_in(pos_profile):
	"""The endpoint, reached by its dotted path (the suite loads on the code before it, each test fails for its own reason)."""
	return frappe.get_attr(KEEP)(pos_profile)


def expiry_to_stamp(*args):
	return frappe.get_attr(f"{API}.expiry_to_stamp")(*args)


def stamped_in_the_row(sid):
	"""The expiry stamped in `tabSessions.sessiondata`, in seconds: read by the fork's own helper, from the column as stored."""
	row = frappe.db.sql("select sessiondata from `tabSessions` where sid = %s", sid)
	return sessions._stamped_expiry_in_seconds(row[0][0]) if row else None


def stamped_in_the_cache(sid):
	return sessions.get_expiry_in_seconds(frappe.cache.hget("session", sid)["data"]["session_expiry"])


def a_session_that_is_aged(sid, hours):
	frappe.db.sql(
		"update `tabSessions` set lastupdate = %s where sid = %s",
		(add_to_date(now(), hours=-hours, as_string=True), sid),
	)


@contextmanager
def signed_in(user, address="203.0.113.9", audit_user=None):
	"""`user` signed in as a sign-in does it, in a browser of its own: the request, the cookies and the session stay in place
	for the endpoint to run on. What the sign-in changed in the request is put back afterwards, and the session leaves the cache.

	`audit_user`: the session is minted for an audit, as `bench browse --user-for-audit <name>` mints it."""
	saved = {
		key: getattr(frappe.local, key, MISSING)
		for key in ("request", "request_ip", "login_manager", "cookie_manager", "session_obj", "lang")
	}
	frappe.set_user("Guest")
	frappe.utils.set_request(path=f"/api/method/{KEEP}", method="POST")
	frappe.local.request_ip = address
	frappe.local.form_dict = frappe._dict()
	frappe.local.response = frappe._dict()
	frappe.local.cookie_manager = CookieManager()
	frappe.local.login_manager = LoginManager()
	sid = None
	try:
		frappe.local.login_manager.login_as(user, audit_user=audit_user)
		sid = frappe.session.sid
		yield sid
	finally:
		if sid and sid not in ("Guest", "Administrator"):
			frappe.cache.hdel("session", sid)
			frappe.cache.hdel("last_db_session_update", sid)
		frappe.set_user("Administrator")
		for key, value in saved.items():
			if value is MISSING:
				if hasattr(frappe.local, key):
					delattr(frappe.local, key)
			else:
				setattr(frappe.local, key, value)
		frappe.local.response = frappe._dict()


def saved(doc):
	"""A POS Settings document saved as the test's own code saves it: the till's POS Profile is not written, so its link is not checked."""
	doc.flags.ignore_links = True
	doc.save(ignore_permissions=True)
	return doc


def a_till(name, users, days=None, **settings):
	"""A till of the test's own: the rows of its user list and, when `days` is given, its POS Settings.

	The endpoint reads those rows and nothing else (never the POS Profile), so no POS Profile is written."""
	for parent in frappe.get_all("POS Settings", filters={"pos_profile": name}, pluck="name"):
		frappe.delete_doc("POS Settings", parent, force=True, ignore_permissions=True)
	frappe.db.delete("POS Profile User", {"parent": name})
	for idx, user in enumerate(users, start=1):
		frappe.get_doc(
			{
				"doctype": "POS Profile User",
				"parent": name,
				"parenttype": "POS Profile",
				"parentfield": "applicable_for_users",
				"idx": idx,
				"user": user,
			}
		).db_insert()
	if days is not None:
		settings["keep_signed_in_days"] = days
	if days is None and not settings:
		return name
	frappe.get_doc({"doctype": "POS Settings", "pos_profile": name, "enabled": 1, **settings}).insert(
		ignore_permissions=True, ignore_mandatory=True, ignore_links=True
	)
	return name


class WhatTheTillAsks(FrappeTestCase):
	"""The pure decision: the till's setting and the session's current expiry in, the expiry to stamp (or None) out."""

	def test_zero_follows_the_site_rule(self):
		for days in (0, None, "", "0", -3):
			with self.subTest(days=days):
				self.assertIsNone(expiry_to_stamp(days, SITE_RULE))

	def test_days_are_stamped_as_hours(self):
		self.assertEqual(expiry_to_stamp(30, SITE_RULE), "720:00:00")
		self.assertEqual(expiry_to_stamp(1, SITE_RULE), "24:00:00")
		# The Int field comes back as text from some callers
		self.assertEqual(expiry_to_stamp("30", SITE_RULE), "720:00:00")

	def test_no_session_is_shortened(self):
		# The same length again, a longer stamp, the site's own rule when it is longer than the till's
		self.assertIsNone(expiry_to_stamp(30, "720:00:00"))
		self.assertIsNone(expiry_to_stamp(30, "1440:00:00"))
		self.assertIsNone(expiry_to_stamp(30, "2160:00:00"))
		self.assertIsNone(expiry_to_stamp(7, "240:00:00"))
		# A longer one when it is shorter
		self.assertEqual(expiry_to_stamp(30, "240:00:00"), "720:00:00")
		self.assertEqual(expiry_to_stamp(30, "719:59:59"), "720:00:00")

	def test_the_setting_is_capped_at_ninety_days(self):
		self.assertEqual(expiry_to_stamp(90, SITE_RULE), "2160:00:00")
		self.assertEqual(expiry_to_stamp(91, SITE_RULE), "2160:00:00")
		self.assertEqual(expiry_to_stamp(10000, SITE_RULE), "2160:00:00")

	def test_a_session_with_no_readable_stamp_is_stamped(self):
		for current in (None, "", "garbage", "12"):
			with self.subTest(current=current):
				self.assertEqual(expiry_to_stamp(30, current), "720:00:00")


class TheTillsSettingsDocument(FrappeTestCase):
	"""`keep_signed_in_days` on POS Settings: a range, and 30 for a till that becomes a restaurant till."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)

	def test_the_field_exists_and_follows_the_site_by_default(self):
		meta = frappe.get_meta("POS Settings")
		field = meta.get_field("keep_signed_in_days")
		self.assertEqual(field.fieldtype, "Int")
		self.assertEqual(str(field.default or 0), "0")
		till = a_till(TILL, [STAFF], enabled=1)
		days = frappe.db.get_value("POS Settings", {"pos_profile": till}, "keep_signed_in_days")
		self.assertEqual(days, 0)

	def test_a_value_out_of_range_is_refused(self):
		for days in (-1, 91, 365):
			with self.subTest(days=days), self.assertRaises(frappe.ValidationError):
				a_till(TILL, [STAFF], days)
		for days in (0, 1, 30, 90):
			with self.subTest(days=days):
				a_till(TILL, [STAFF], days)
				self.assertEqual(
					frappe.db.get_value("POS Settings", {"pos_profile": TILL}, "keep_signed_in_days"), days
				)

	def test_a_new_restaurant_till_keeps_staff_signed_in_for_thirty_days(self):
		a_till(TILL, [STAFF], enable_restaurant_mode=1)
		self.assertEqual(
			frappe.db.get_value("POS Settings", {"pos_profile": TILL}, "keep_signed_in_days"), 30
		)

	def test_a_new_counter_till_follows_the_site(self):
		a_till(TILL, [STAFF], enable_restaurant_mode=0)
		self.assertEqual(frappe.db.get_value("POS Settings", {"pos_profile": TILL}, "keep_signed_in_days"), 0)

	def test_a_till_that_becomes_a_restaurant_till_takes_thirty_days(self):
		a_till(TILL, [STAFF], enable_restaurant_mode=0)
		doc = frappe.get_doc("POS Settings", {"pos_profile": TILL})
		doc.enable_restaurant_mode = 1
		saved(doc)
		self.assertEqual(doc.keep_signed_in_days, 30)

	def test_a_choice_of_the_manager_is_never_overwritten(self):
		# Zero on a restaurant till, chosen after the tick: the next saves leave it
		a_till(TILL, [STAFF], enable_restaurant_mode=1)
		doc = frappe.get_doc("POS Settings", {"pos_profile": TILL})
		doc.keep_signed_in_days = 0
		saved(doc)
		doc = frappe.get_doc("POS Settings", {"pos_profile": TILL})
		doc.silent_print = 0 if doc.silent_print else 1
		saved(doc)
		self.assertEqual(doc.keep_signed_in_days, 0)
		# Fourteen days on a till that is ticked in the same save as the days are chosen
		a_till(OTHER_TILL, [STAFF], enable_restaurant_mode=0)
		other = frappe.get_doc("POS Settings", {"pos_profile": OTHER_TILL})
		other.enable_restaurant_mode = 1
		other.keep_signed_in_days = 14
		saved(other)
		self.assertEqual(other.keep_signed_in_days, 14)

	def test_the_patch_gives_thirty_days_to_the_restaurant_tills_that_already_were(self):
		"""A restaurant till written before the field existed holds 0; a counter till and a till whose manager chose a number
		are left as they are. A second run changes nothing."""
		old_restaurant_till = a_till(TILL, [STAFF], enable_restaurant_mode=1)
		frappe.db.set_value("POS Settings", {"pos_profile": old_restaurant_till}, "keep_signed_in_days", 0)
		counter_till = a_till(OTHER_TILL, [STAFF], enable_restaurant_mode=0)
		chosen_till = a_till(CHOSEN_TILL, [STAFF], 14, enable_restaurant_mode=1)

		def days(till):
			return frappe.db.get_value("POS Settings", {"pos_profile": till}, "keep_signed_in_days")

		for _run in range(2):
			frappe.get_attr(PATCH)()
			self.assertEqual(days(old_restaurant_till), 30)
			self.assertEqual(days(counter_till), 0)
			self.assertEqual(days(chosen_till), 14)


class TheEndpoint(FrappeTestCase):
	"""`keep_signed_in(pos_profile)` on a real session."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Whatever the class built is rolled back with the class, by the base class
		cls.addClassCleanup(frappe.set_user, "Administrator")
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		_user(STAFF, [CASHIER_ROLE], "System User")
		_user(OUTSIDER, ["Blogger"], "System User")
		# A till manager (a role that runs every till) that is on no till's list
		_user(MANAGER, ["System Manager"], "System User")
		_user(PORTAL, ["Customer"], "Website User")

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.savepoint("keep_signed_in")
		self.addCleanup(frappe.db.rollback, save_point="keep_signed_in")
		self.addCleanup(frappe.set_user, "Administrator")
		# The site's rule, as osiris has it: a fresh bench has none and falls back to 240 hours
		rule = patch.object(sessions, "get_expiry_period", return_value=SITE_RULE)
		rule.start()
		self.addCleanup(rule.stop)
		a_till(TILL, [STAFF], 30)
		a_till(OTHER_TILL, [OUTSIDER], 30)

	def stamp(self, sid=None):
		"""The expiry stamped on the session now signed in, as the session object holds it."""
		return frappe.local.session_obj.data.data.get("session_expiry")

	# --- what it stamps ----------------------------------------------------------------------------------------------

	def test_a_session_signed_in_before_the_call_has_the_site_rule(self):
		with signed_in(STAFF) as sid:
			self.assertEqual(self.stamp(), SITE_RULE)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)

	def test_the_session_is_stamped_where_frappe_reads_it(self):
		with signed_in(STAFF) as sid:
			self.assertEqual(keep_signed_in(TILL), {"days": 30, "stamped": True})
			# The session object, the row of `tabSessions` as stored, the cache
			self.assertEqual(self.stamp(), "720:00:00")
			self.assertEqual(stamped_in_the_row(sid), MONTH)
			self.assertEqual(stamped_in_the_cache(sid), MONTH)

	def test_the_cookie_of_the_answer_lives_as_long_as_the_session(self):
		with signed_in(STAFF) as sid:
			keep_signed_in(TILL)
			cookie = frappe.local.cookie_manager.cookies["sid"]
			self.assertEqual(cookie["value"], sid)
			self.assertEqual(cookie["max_age"], MONTH)
			self.assertTrue(cookie["httponly"])

	def test_the_cookie_of_the_next_request_keeps_the_month(self):
		"""`init_cookies` runs on EVERY request: before the fork's fix it took the month back with the site's six hours."""
		with signed_in(STAFF):
			keep_signed_in(TILL)
			next_request = CookieManager()
			next_request.init_cookies()
			self.assertEqual(next_request.cookies["sid"]["max_age"], MONTH)

	def test_a_call_made_twice_stamps_once(self):
		with signed_in(STAFF):
			self.assertEqual(keep_signed_in(TILL), {"days": 30, "stamped": True})
			self.assertEqual(keep_signed_in(TILL), {"days": 30, "stamped": False})
			self.assertEqual(self.stamp(), "720:00:00")

	def test_the_sweep_keeps_a_month_of_staff_and_still_takes_the_rest(self):
		with signed_in(STAFF) as sid:
			keep_signed_in(TILL)
			a_session_that_is_aged(sid, 26)
			self.assertNotIn(sid, sessions.get_expired_sessions(), "26 hours is inside the 30 days stamped")
			a_session_that_is_aged(sid, 31 * 24)
			self.assertIn(sid, sessions.get_expired_sessions(), "31 days is past the stamp")
		# A session no till stamped keeps the site's six hours
		a_till(TILL, [STAFF], 0)
		with signed_in(STAFF) as sid:
			keep_signed_in(TILL)
			a_session_that_is_aged(sid, 26)
			self.assertIn(sid, sessions.get_expired_sessions())

	# --- what it leaves alone ----------------------------------------------------------------------------------------

	def test_zero_stamps_nothing(self):
		a_till(TILL, [STAFF], 0)
		with signed_in(STAFF) as sid:
			cookie_before = dict(frappe.local.cookie_manager.cookies["sid"])
			self.assertEqual(keep_signed_in(TILL), {"days": 0, "stamped": False})
			self.assertEqual(self.stamp(), SITE_RULE)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)
			self.assertEqual(frappe.local.cookie_manager.cookies["sid"], cookie_before)

	def test_a_till_with_no_settings_stamps_nothing(self):
		a_till(NO_SETTINGS_TILL, [STAFF])
		self.assertFalse(frappe.db.exists("POS Settings", {"pos_profile": NO_SETTINGS_TILL}))
		with signed_in(STAFF):
			self.assertEqual(keep_signed_in(NO_SETTINGS_TILL), {"days": 0, "stamped": False})
			self.assertEqual(self.stamp(), SITE_RULE)
		# and the endpoint writes no settings of its own
		self.assertFalse(frappe.db.exists("POS Settings", {"pos_profile": NO_SETTINGS_TILL}))

	def test_settings_that_are_switched_off_stamp_nothing(self):
		frappe.db.set_value("POS Settings", {"pos_profile": TILL}, "enabled", 0)
		with signed_in(STAFF):
			self.assertEqual(keep_signed_in(TILL), {"days": 0, "stamped": False})
			self.assertEqual(self.stamp(), SITE_RULE)

	def test_a_session_that_lasts_longer_is_never_shortened(self):
		with signed_in(STAFF) as sid:
			# Stamped by something else for 60 days
			frappe.local.session_obj.data.data.session_expiry = "1440:00:00"
			frappe.local.session_obj.update(force=True)
			cookie_before = dict(frappe.local.cookie_manager.cookies["sid"])
			self.assertEqual(keep_signed_in(TILL), {"days": 30, "stamped": False})
			self.assertEqual(self.stamp(), "1440:00:00")
			self.assertEqual(stamped_in_the_row(sid), 1440 * 3600)
			self.assertEqual(frappe.local.cookie_manager.cookies["sid"], cookie_before)

	def test_a_site_rule_longer_than_the_tills_is_not_shortened_either(self):
		frappe.db.set_value("POS Settings", {"pos_profile": TILL}, "keep_signed_in_days", 7)
		with patch.object(sessions, "get_expiry_period", return_value="240:00:00"):
			with signed_in(STAFF) as sid:
				self.assertEqual(keep_signed_in(TILL), {"days": 7, "stamped": False})
				self.assertEqual(stamped_in_the_row(sid), 240 * 3600)

	def test_the_setting_is_capped_at_ninety_days(self):
		# A value the document would refuse, written under it (an import, a script)
		frappe.db.set_value("POS Settings", {"pos_profile": TILL}, "keep_signed_in_days", 365)
		with signed_in(STAFF) as sid:
			self.assertEqual(keep_signed_in(TILL), {"days": 90, "stamped": True})
			self.assertEqual(stamped_in_the_row(sid), QUARTER)
			self.assertEqual(frappe.local.cookie_manager.cookies["sid"]["max_age"], QUARTER)

	def test_a_negative_value_stamps_nothing(self):
		frappe.db.set_value("POS Settings", {"pos_profile": TILL}, "keep_signed_in_days", -5)
		with signed_in(STAFF):
			self.assertEqual(keep_signed_in(TILL), {"days": 0, "stamped": False})
			self.assertEqual(self.stamp(), SITE_RULE)

	# --- who may ask ---------------------------------------------------------------------------------------------------

	def test_a_visitor_is_refused(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			keep_signed_in(TILL)

	def test_a_visitor_stamps_no_session(self):
		with signed_in(STAFF) as sid:
			# The same request, as a visitor
			frappe.set_user("Guest")
			with self.assertRaises(frappe.PermissionError):
				keep_signed_in(TILL)
		self.assertEqual(stamped_in_the_row(sid), 6 * 3600)

	def test_a_portal_account_is_refused(self):
		a_till(TILL, [STAFF, PORTAL], 30)
		with signed_in(PORTAL) as sid:
			with self.assertRaises(frappe.PermissionError):
				keep_signed_in(TILL)
			self.assertEqual(self.stamp(), SITE_RULE)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)

	def test_a_user_who_is_not_on_the_tills_list_is_refused(self):
		with signed_in(OUTSIDER) as sid:
			with self.assertRaises(frappe.PermissionError):
				keep_signed_in(TILL)
			self.assertEqual(self.stamp(), SITE_RULE)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)
		# Nor does the other till's list open this till: the list of the till NAMED is the one that counts
		with signed_in(STAFF) as sid:
			with self.assertRaises(frappe.PermissionError):
				keep_signed_in(OTHER_TILL)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)

	def test_a_till_manager_who_is_not_on_the_tills_list_is_refused(self):
		"""The month is for the till's own staff, not for every account that may run every till: a manager who works a till
		is on its list, as the shift opening needs him to be."""
		with signed_in(MANAGER) as sid:
			with self.assertRaises(frappe.PermissionError):
				keep_signed_in(TILL)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)

	def test_a_missing_till_is_refused(self):
		with signed_in(STAFF) as sid:
			for profile in (None, "", "no such till"):
				with self.subTest(profile=profile), self.assertRaises(frappe.PermissionError):
					keep_signed_in(profile)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)

	def test_a_session_minted_for_an_audit_keeps_the_site_rule(self):
		"""A desk session minted for a test or an audit (`bench browse --user-for-audit`) is not the till's staff at work: a
		test run that opens /pos must not leave an open session for a month (neoffice-maintenance#1113: 16 of the 42
		Administrator sessions of the test instance carried 30 days)."""
		with signed_in(STAFF, audit_user="audit-run") as sid:
			self.assertEqual(keep_signed_in(TILL), {"days": 30, "stamped": False})
			self.assertEqual(self.stamp(), SITE_RULE)
			self.assertEqual(stamped_in_the_row(sid), 6 * 3600)
			self.assertNotEqual(frappe.local.cookie_manager.cookies["sid"].get("max_age"), MONTH)

	def test_a_get_is_not_enough(self):
		"""The endpoint changes a session: it answers a POST only."""
		allowed = frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(KEEP)]
		self.assertEqual(list(allowed), ["POST"])


class TestKeepSignedInThroughTheRequestHandler(FrappeTestCase):
	"""The endpoint asked of Frappe's own request handler (frappe.app.application) from a thread of its own, as a browser's
	request is: the `Set-Cookie` header of the answer, and of the NEXT request, carry the month. The user, the till and the
	sessions are committed, so that the handler's own connection sees them, and deleted at the end."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.forget()
		self.addCleanup(self.forget)
		self.site_rule = frappe.defaults.get_global_default("session_expiry")
		frappe.defaults.set_global_default("session_expiry", "06:00")
		self.addCleanup(self.put_the_site_rule_back)
		_user(STAFF, [CASHIER_ROLE], "System User")
		a_till(TILL, [STAFF], 30)
		a_till(OTHER_TILL, [STAFF], 0)
		self.sid = self.sign_in(STAFF)
		frappe.db.commit()

	def put_the_site_rule_back(self):
		if self.site_rule:
			frappe.defaults.set_global_default("session_expiry", self.site_rule)
		else:
			frappe.defaults.clear_default("session_expiry")
		frappe.db.commit()

	def forget(self):
		"""The user, the tills, their sessions and what signing in wrote, gone for good."""
		for sid in frappe.db.sql("select sid from `tabSessions` where user = %s", STAFF, pluck=True):
			frappe.cache.hdel("session", sid)
			frappe.cache.hdel("last_db_session_update", sid)
		for till in (TILL, OTHER_TILL):
			for name in frappe.get_all("POS Settings", filters={"pos_profile": till}, pluck="name"):
				frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
			frappe.db.delete("POS Profile User", {"parent": till})
		for doctype, field in (("Sessions", "user"), ("Activity Log", "user"), ("Has Role", "parent")):
			frappe.db.delete(doctype, {field: STAFF})
		frappe.db.delete("User", {"name": STAFF})
		frappe.db.commit()
		frappe.clear_cache(user=STAFF)

	def sign_in(self, user):
		with signed_in(user) as sid:
			return sid

	def ask(self, path, method="POST", data=None):
		client = get_test_client(use_cookies=False)
		return make_request(
			target=getattr(client, method.lower()),
			args=(path,),
			kwargs={"data": data or {}, "headers": {"Cookie": f"sid={self.sid}"}, "buffered": True},
			site=frappe.local.site,
		)

	@staticmethod
	def sid_cookie(answer):
		"""The `sid` cookie an answer sets: (its value, its Max-Age)."""
		for header in answer.headers.getlist("Set-Cookie"):
			if header.startswith("sid="):
				attributes = dict(
					part.strip().split("=", 1) if "=" in part else (part.strip(), True)
					for part in header.split(";")[1:]
				)
				return header.split(";")[0].split("=", 1)[1], int(attributes.get("Max-Age", -1))
		return None, None

	def test_the_answer_and_the_next_request_carry_the_month(self):
		answer = self.ask(f"/api/method/{KEEP}", data={"pos_profile": TILL})
		self.assertEqual(answer.status_code, 200, answer.data)
		self.assertEqual(answer.json["message"], {"days": 30, "stamped": True})
		self.assertEqual(self.sid_cookie(answer), (self.sid, MONTH))
		# The page the till loads next: the cookie is given the session's own life, not the site's six hours
		later = self.ask("/api/method/frappe.auth.get_logged_user", method="GET")
		self.assertEqual(later.json["message"], STAFF)
		self.assertEqual(self.sid_cookie(later), (self.sid, MONTH))
		self.assertEqual(stamped_in_the_row(self.sid), MONTH)

	def test_a_till_set_to_zero_keeps_the_site_rule_on_both(self):
		answer = self.ask(f"/api/method/{KEEP}", data={"pos_profile": OTHER_TILL})
		self.assertEqual(answer.json["message"], {"days": 0, "stamped": False})
		self.assertEqual(self.sid_cookie(answer), (self.sid, 6 * 3600))
		later = self.ask("/api/method/frappe.auth.get_logged_user", method="GET")
		self.assertEqual(self.sid_cookie(later), (self.sid, 6 * 3600))

	def test_a_get_is_refused(self):
		answer = self.ask(f"/api/method/{KEEP}", method="GET", data=None)
		self.assertEqual(answer.status_code, 403)
		self.assertEqual(stamped_in_the_row(self.sid), 6 * 3600)
