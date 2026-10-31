# //// Neoffice — added file (no upstream equivalent).
"""A tablet opens the kitchen's or the runner's screen by scanning a QR code, with no password (NeoRestau lot 1, task 16).

A manager of the restaurant makes a one-time token at the till; the tablet redeems it and is signed in with an account of
its own: a portal account with no role, no password and no API key, at an address minted here, bound to one restaurant
and one screen (the kitchen, of every station or of one; the runner). The kitchen's and the runner's endpoints accept
that account, cut to its restaurant and its station; its session reaches nothing else, and nobody turns the account into
anything else.

The suite relies on no patch and no after_migrate (a fresh CI site runs neither): it builds two restaurants of its own,
with their rooms, tables, stations and orders, and rolls everything back. The endpoints of the tablets are reached by
their dotted path, as a web request reaches them; what is new is reached through frappe.get_attr, so that the suite
loads on the code before it and each test fails for its own reason.
"""

import hashlib
import inspect
import json
import random
import re
import secrets
from contextlib import contextmanager, nullcontext
from unittest.mock import patch

import frappe
import frappe.client
import frappe.handler
from frappe.api import v2 as api_v2
from frappe.auth import CookieManager, LoginManager
from frappe.desk import reportview
from frappe.desk.form import load
from frappe.model.rename_doc import rename_doc
from frappe.tests.test_api import make_request
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, get_test_client, now_datetime, time_diff_in_seconds

from pos_next.api import cash_entry, restaurant, shifts
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import devices, permissions
from pos_next.restaurant.permissions import ensure_restaurant_roles, grant_restaurant_permissions
from pos_next.tests.test_till_writes_need_the_till import _company, _customer, _item, _user

API = "pos_next.api.restaurant_devices"
CREATE = f"{API}.create_pairing_code"
REDEEM = f"{API}.redeem_pairing_code"
DEVICES = f"{API}.get_devices"
DISCONNECT = f"{API}.disconnect_device"
RETIRE = f"{API}.retire_pairing_codes"
DEVICE = "Restaurant Device"
PAIRING = "Restaurant Device Pairing"
KITCHEN = "Kitchen"
RUNNER = "Runner"
MANAGER = "tablets-manager@yopmail.com"
ADMIN = "tablets-admin@yopmail.com"
CASHIER = "tablets-cashier@yopmail.com"
PORTAL = "tablets-portal@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
# A token of the right shape that no till ever made
UNKNOWN = "A" * 43
# What a device account holds: the roles every account holds, none of its own
EVERY_ACCOUNTS_ROLES = {"All", "Guest"}
# The address of a device account this code mints: a nonce and its mark under the site's key
MINTED = re.compile(r"^tablet-[0-9a-f]{16}-[0-9a-f]{24}@devices\.invalid$")
# An address of the tablets' domain that this code did not mint (its mark is not the site key's)
FORGED = "tablet-0123456789abcdef-000000000000000000000000@devices.invalid"
MISSING = object()
# The redeems one address may try in ten minutes (the earlier code's limit as well)
REDEEM_LIMIT = getattr(devices, "REDEEM_LIMIT", 10)


def call(dotted, *args, **kwargs):
	"""An endpoint (or a rule) of the tablets, reached by its dotted path."""
	return frappe.get_attr(dotted)(*args, **kwargs)


def token_of(url):
	"""The token a QR code's address carries, in its fragment."""
	return url.split("#", 1)[1]


def sha256(token):
	return hashlib.sha256(token.encode()).hexdigest()


@contextmanager
def as_user(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


def tablet_address():
	"""The address of a device account, as the pairing mints it (the code before this round minted it with no mark)."""
	mint = getattr(devices, "new_account_name", None)
	return mint() if mint else f"tablet-{secrets.token_hex(8)}@{devices.ACCOUNT_DOMAIN}"


class Tablets(FrappeTestCase):
	"""Two restaurants of the test's own: the Bistro (a room, a table, a grill and a pastry station, an order at its
	table with a dish at each station) and the Bar (a room, a table, a grill of its own, an order at its table)."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases. The rules a
		# grant gave inside the transaction are dropped from the cache once it is rolled back (registered first, run last)
		self.changed_rules = []
		self.addCleanup(lambda: [frappe.clear_cache(doctype=doctype) for doctype in self.changed_rules or []])
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		# A sign-in, a disconnection and a few endpoints commit: nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		# Tablets presuppose NeoRestau; the site's own flag is not the test's to know
		neorestau = patch.dict(frappe.conf, {"neorestau_active": 1})
		neorestau.start()
		self.addCleanup(neorestau.stop)
		# The restaurant's roles and their rules, as a migrate leaves them (a fresh CI site runs no after_migrate)
		ensure_restaurant_roles()
		self.changed_rules = grant_restaurant_permissions()
		self.company = _company()
		self.item = _item(self.company)
		self.bistro = self.insert(
			"Restaurant", restaurant_name="_Test Tablets Bistro", company=self.company, enable_runner=1
		)
		self.bar = self.insert("Restaurant", restaurant_name="_Test Tablets Bar", company=self.company)
		room = self.insert("Restaurant Area", restaurant=self.bistro, area_name="_Test Tablets Room")
		bar_room = self.insert("Restaurant Area", restaurant=self.bar, area_name="_Test Tablets Room")
		self.table = self.insert("Restaurant Table", restaurant=self.bistro, area=room, table_name="_Test T1")
		self.bar_table = self.insert(
			"Restaurant Table", restaurant=self.bar, area=bar_room, table_name="_Test T1"
		)
		self.grill = self.insert("Preparation Station", restaurant=self.bistro, station_name="_Test Grill")
		self.pastry = self.insert("Preparation Station", restaurant=self.bistro, station_name="_Test Pastry")
		self.bar_grill = self.insert("Preparation Station", restaurant=self.bar, station_name="_Test Grill")
		self.order = self.make_order(self.table, [self.grill, self.pastry])
		self.bar_order = self.make_order(self.bar_table, [self.bar_grill])
		_user(MANAGER, [permissions.MANAGER_ROLE, CASHIER_ROLE], "System User")
		# The customer's administrator manages his restaurants too
		if not frappe.db.exists("Role", permissions.ADMIN_ROLE):
			self.insert("Role", role_name=permissions.ADMIN_ROLE, desk_access=1)
		_user(ADMIN, [permissions.ADMIN_ROLE], "System User")
		_user(CASHIER, [CASHIER_ROLE], "System User")
		# A portal account the restaurant's and the till's roles were given by mistake: a role makes no desk account
		_user(PORTAL, [permissions.MANAGER_ROLE, CASHIER_ROLE], "Website User")
		self.browser_addresses = []
		self.addCleanup(self.forget_browsers)

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def make_order(self, table, stations):
		"""A draft at a table with one dish per station named, sent to the kitchen."""
		currency = frappe.get_cached_value("Company", self.company, "default_currency")
		doc = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": self.company,
				"currency": currency,
				"selling_price_list": frappe.db.get_value(
					"Price List", {"selling": 1, "enabled": 1, "currency": currency}, "name"
				),
				"customer": _customer(),
				"restaurant_table": table,
				"ignore_pricing_rule": 1,
				"items": [{"item_code": self.item, "qty": 1, "rate": 10} for _station in stations],
			}
		).insert(ignore_permissions=True)
		for row, station in zip(doc.items, stations, strict=True):
			frappe.db.set_value(
				"Sales Invoice Item", row.name, {"preparation_station": station, "kds_status": "Pending"}
			)
		return doc.name

	def tablet(self, restaurant, screen, station=None):
		"""A device account bound to a screen of a restaurant, as a pairing leaves it."""
		user = devices.make_account("_Test tablet", restaurant)
		devices.keep_a_device_account(user)
		self.insert(
			DEVICE,
			device_name="_Test tablet",
			restaurant=restaurant,
			screen=screen,
			station=station,
			user=user,
		)
		return user

	def token(self, screen=KITCHEN, station=None, restaurant=None, user=MANAGER):
		"""A token made at the till by `user`, for a screen of the Bistro unless another restaurant is named."""
		with as_user(user):
			made = call(CREATE, screen=screen, station=station, restaurant=restaurant or self.bistro)
		return token_of(made["url"])

	@contextmanager
	def browser(self, method="POST", address=None, path=None, headers=None):
		"""A web request from a browser with no session (a tablet that scanned a token), from an address of its own.

		What the request changed is put back afterwards; the sessions it opened are dropped from the cache when the test
		ends, and so are the rate limiters' counts of its address.
		"""
		address = address or f"203.0.113.{random.randint(1, 254)}"
		self.browser_addresses.append(address)
		# What was there before, told apart from what was not there at all (`request_ip` is there, as None)
		saved = {
			key: getattr(frappe.local, key, MISSING)
			for key in ("request", "request_ip", "login_manager", "cookie_manager", "session_obj", "lang")
		}
		frappe.set_user("Guest")
		frappe.utils.set_request(path=path or f"/api/method/{REDEEM}", method=method, headers=headers or {})
		frappe.local.request_ip = address
		frappe.local.form_dict = frappe._dict(cmd=REDEEM) if path is None else frappe._dict()
		frappe.local.response = frappe._dict()
		frappe.local.cookie_manager = CookieManager()
		frappe.local.login_manager = LoginManager()
		try:
			yield
		finally:
			sid = frappe.session.sid
			if sid and sid not in ("Guest", "Administrator"):
				self.addCleanup(frappe.cache.hdel, "session", sid)
				self.addCleanup(frappe.cache.hdel, "last_db_session_update", sid)
			frappe.set_user("Administrator")
			for key, value in saved.items():
				if value is MISSING:
					if hasattr(frappe.local, key):
						delattr(frappe.local, key)
				else:
					setattr(frappe.local, key, value)
			frappe.local.response = frappe._dict()

	def forget_browsers(self):
		for address in self.browser_addresses:
			frappe.cache.delete(frappe.cache.make_key(f"rl:{REDEEM}:{address}"))
			frappe.cache.delete(frappe.cache.make_key(f"pos_next:tablet-redeem:{address}"))

	def redeem(self, token):
		# By position, as the earlier code's argument had another name (a test of this round fails for its own reason)
		return call(REDEEM, token)

	def paired(self, token):
		"""The tablet a token opens, in a browser of its own: (its account, its session id)."""
		with self.browser():
			self.redeem(token)
			return frappe.session.user, frappe.session.sid

	def pairing_of(self, token, fields="name"):
		"""The pairing row of a token, found by its hash (`token_hash`; `code_hash` before this round)."""
		field = "token_hash" if frappe.get_meta(PAIRING).has_field("token_hash") else "code_hash"
		return frappe.db.get_value(PAIRING, {field: sha256(token)}, fields)

	def assert_refused_token(self, token):
		with self.assertRaises(frappe.ValidationError) as caught:
			self.redeem(token)
		self.assertEqual(type(caught.exception).__name__, "PairingCodeError")
		self.assertEqual(frappe.session.user, "Guest")

	def assert_refused(self, user, label, fn, *args, **kwargs):
		with as_user(user), self.assertRaises(frappe.PermissionError, msg=f"{label} answered {user}"):
			fn(*args, **kwargs)

	def assert_no_token(self, token, text, where):
		# Said in words: a failure prints no token it found
		self.assertFalse(token in text, f"the plain token is in {where}")

	def sessions_of(self, user):
		return frappe.db.sql("select sid from `tabSessions` where user = %s", user, pluck=True)

	def a_session_of(self, user):
		"""A session of `user`, as a sign-in leaves its row (rolled back with the test)."""
		sid = frappe.generate_hash()
		frappe.db.sql(
			"""insert into `tabSessions` (sid, user, sessiondata, lastupdate, status, device)
			values (%s, %s, '{}', now(), 'Active', 'desktop')""",
			(sid, user),
		)
		return sid

	def an_oauth_token_of(self, user):
		"""An OAuth bearer token of `user`, written straight to the database (rolled back with the test)."""
		token = frappe.get_doc(
			{
				"doctype": "OAuth Bearer Token",
				"access_token": frappe.generate_hash(length=20),
				"user": user,
				"scopes": "all",
				"expires_in": 3600,
			}
		)
		token.db_insert()
		return token.access_token

	def has_roles(self, user):
		return frappe.db.count("Has Role", {"parent": user, "parenttype": "User"})


class TestMakingAToken(Tablets):
	def test_only_who_sets_up_the_restaurant_makes_a_token(self):
		kitchen_tablet = self.tablet(self.bistro, KITCHEN)
		for user in (CASHIER, PORTAL, kitchen_tablet, "Guest"):
			with self.subTest(user=user):
				self.assert_refused(
					user, "create_pairing_code", call, CREATE, KITCHEN, restaurant=self.bistro
				)
		self.assertFalse(frappe.db.exists(PAIRING, {"restaurant": self.bistro}))
		for user in (MANAGER, ADMIN, "Administrator"):
			with self.subTest(user=user):
				self.assertTrue(self.token(user=user))

	def test_a_token_is_random_kept_as_its_hash_and_valid_five_minutes(self):
		with as_user(MANAGER):
			made = call(CREATE, screen=KITCHEN, station=self.grill, restaurant=self.bistro)
		token = token_of(made["url"])
		# The till shows the page of the pairing; the token rides in the fragment, which no request carries
		self.assertTrue(made["url"].endswith(f"/pos/pair#{token}"), made["url"])
		self.assertGreaterEqual(len(token), 43)
		self.assertEqual(made["expires_in"], 300)
		row = frappe.get_doc(PAIRING, self.pairing_of(token))
		self.assertEqual((row.restaurant, row.screen, row.station), (self.bistro, KITCHEN, self.grill))
		self.assertEqual(row.owner, MANAGER)
		self.assertIsNone(row.used_at)
		self.assertAlmostEqual(time_diff_in_seconds(row.expires_at, now_datetime()), 300, delta=10)
		# Only the hash is kept
		self.assert_no_token(token, json.dumps(row.as_dict(), default=str), "its pairing row")
		self.assertNotEqual(token, self.token(screen=RUNNER))

	def test_a_token_is_for_a_station_of_its_restaurant(self):
		with as_user(MANAGER):
			with self.assertRaises(frappe.ValidationError):
				call(CREATE, screen=KITCHEN, station=self.bar_grill, restaurant=self.bistro)
			with self.assertRaises(frappe.ValidationError):
				call(CREATE, screen="Till", restaurant=self.bistro)
			# The runner's screen shows every station
			made = call(CREATE, screen=RUNNER, station=self.grill, restaurant=self.bistro)
		self.assertIsNone(made["station"])
		self.assertFalse(self.pairing_of(token_of(made["url"]), "station"))

	def test_a_manager_of_another_restaurant_makes_no_token_for_this_one(self):
		self.insert("User Permission", user=MANAGER, allow="Restaurant", for_value=self.bar)
		self.assert_refused(MANAGER, "create_pairing_code", call, CREATE, KITCHEN, restaurant=self.bistro)
		self.assertTrue(self.token(restaurant=self.bar))

	def test_a_new_token_retires_its_makers_earlier_one_for_that_screen(self):
		first = self.token(station=self.grill)
		other_screen = self.token(screen=RUNNER)
		colleagues = self.token(station=self.grill, user=ADMIN)
		second = self.token(station=self.grill)
		with self.browser():
			self.assert_refused_token(first)
		for still_valid in (second, other_screen, colleagues):
			with self.subTest(token=still_valid[:6]):
				self.assertIsNone(self.pairing_of(still_valid, "used_at"))
				self.paired(still_valid)

	def test_closing_the_dialog_retires_the_tokens_its_maker_left(self):
		grill, runner, colleagues = (
			self.token(station=self.grill),
			self.token(screen=RUNNER),
			self.token(screen=RUNNER, user=ADMIN),
		)
		self.assert_refused(CASHIER, "retire_pairing_codes", call, RETIRE, restaurant=self.bistro)
		with as_user(MANAGER):
			call(RETIRE, restaurant=self.bistro)
		with self.browser():
			for retired in (grill, runner):
				self.assert_refused_token(retired)
		self.paired(colleagues)

	def test_where_neorestau_is_off_nothing_is_paired(self):
		token = self.token(station=self.grill)
		kitchen_tablet = self.tablet(self.bistro, KITCHEN)
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			with as_user(MANAGER), self.assertRaises(frappe.ValidationError):
				call(CREATE, screen=KITCHEN, restaurant=self.bistro)
			with self.browser(), self.assertRaises(frappe.ValidationError):
				self.redeem(token)
			self.assert_refused(kitchen_tablet, "get_kds_orders", restaurant.get_kds_orders)
		self.assertIsNone(self.pairing_of(token, "used_at"))


class TestRedeemingAToken(Tablets):
	def test_a_token_signs_the_tablet_in_once(self):
		token = self.token(station=self.grill)
		with self.browser():
			answer = self.redeem(token)
			tablet = frappe.session.user
			sid = frappe.session.sid
			# The browser holds the session cookie of a normal sign-in; the session id is in no answer
			self.assertEqual(frappe.local.cookie_manager.cookies["sid"]["value"], sid)
			self.assertNotIn("sid", frappe.local.response)
			# Its screen: the kitchen of its station, in its restaurant, and the orders it shows are that station's
			self.assertEqual(
				answer["redirect"],
				f"/pos/kds?restaurant={self.bistro.replace(' ', '+')}&station={self.grill}",
			)
			orders = restaurant.get_kds_orders()
			self.assertEqual([order["name"] for order in orders], [self.order])
			self.assertEqual({line["preparation_station"] for line in orders[0]["items"]}, {self.grill})
		self.assertIn(sid, self.sessions_of(tablet))
		# A portal account with no role, at an address minted here, with no password
		account = frappe.get_doc("User", tablet)
		self.assertEqual((account.user_type, account.enabled), ("Website User", 1))
		self.assertRegex(tablet, MINTED)
		self.assertLessEqual(set(frappe.get_roles(tablet)), EVERY_ACCOUNTS_ROLES)
		self.assertFalse(
			frappe.db.sql(
				"select name from `__Auth` where doctype = 'User' and name = %s and fieldname = 'password'",
				tablet,
			)
		)
		# Bound to its restaurant and screen, paired by the manager who made the token
		device = frappe.get_doc(DEVICE, {"user": tablet})
		self.assertEqual(
			(device.restaurant, device.screen, device.station, device.paired_by, device.disconnected),
			(self.bistro, KITCHEN, self.grill, MANAGER, 0),
		)
		self.assertEqual(self.pairing_of(token, "device"), device.name)
		# The Activity Log says which tablet opened and who paired it
		logged = frappe.get_all(
			"Activity Log",
			filters={"reference_doctype": DEVICE, "reference_name": device.name},
			fields=["user", "subject", "link_name"],
		)
		self.assertEqual(len(logged), 1)
		self.assertEqual((logged[0].user, logged[0].link_name), (tablet, MANAGER))
		self.assertIn(frappe.utils.get_fullname(MANAGER), logged[0].subject)
		# Once
		with self.browser():
			self.assert_refused_token(token)

	def test_an_expired_or_unknown_token_is_refused(self):
		token = self.token(station=self.grill)
		frappe.db.set_value(
			PAIRING, self.pairing_of(token), "expires_at", add_to_date(now_datetime(), seconds=-1)
		)
		with self.browser():
			for refused in (token, UNKNOWN, "short", None, {"token": token}, ["x"]):
				with self.subTest(token=refused if not isinstance(refused, str) else refused[:6]):
					self.assert_refused_token(refused)
		self.assertFalse(frappe.db.exists(DEVICE, {"restaurant": self.bistro}))

	def test_a_screen_is_one_tablet_account(self):
		grill, _sid = self.paired(self.token(station=self.grill))
		again, _sid = self.paired(self.token(station=self.grill))
		runner_token = self.token(RUNNER)
		with self.browser():
			answer = self.redeem(runner_token)
			runner = frappe.session.user
		self.assertEqual(grill, again)
		self.assertNotEqual(grill, runner)
		self.assertEqual(frappe.db.count(DEVICE, {"restaurant": self.bistro}), 2)
		self.assertEqual(answer["redirect"], f"/pos/runner?restaurant={self.bistro.replace(' ', '+')}")
		# Both tablets of the grill stay signed in: pairing the second ends no session of the first
		self.assertEqual(len(self.sessions_of(grill)), 2)

	def test_a_tablet_paired_again_ends_the_session_it_came_with(self):
		grill_token, runner_token, again_token = (
			self.token(station=self.grill),
			self.token(RUNNER),
			self.token(station=self.pastry),
		)
		# One browser: the grill, then the runner, then the pastry
		with self.browser():
			self.redeem(grill_token)
			grill, grill_sid = frappe.session.user, frappe.session.sid
			self.redeem(runner_token)
			runner, runner_sid = frappe.session.user, frappe.session.sid
			self.redeem(again_token)
			pastry = frappe.session.user
		self.assertEqual(len({grill, runner, pastry}), 3)
		self.assertEqual(self.sessions_of(grill), [])
		self.assertEqual(self.sessions_of(runner), [])
		self.assertEqual(len(self.sessions_of(pastry)), 1)
		self.assertFalse(frappe.cache.hget("session", grill_sid))
		self.assertFalse(frappe.cache.hget("session", runner_sid))
		with as_user(MANAGER):
			counted = {row["device_name"]: row["sessions"] for row in call(DEVICES, restaurant=self.bistro)}
		self.assertEqual(sorted(counted.values()), [0, 0, 1])

	def test_two_first_pairings_of_one_screen_make_one_tablet(self):
		# Two managers' tokens for the same new screen, redeemed at the same instant: the second read no row before the
		# first made it, and meets it when it inserts its own
		first, second = self.token(station=self.grill), self.token(station=self.grill, user=ADMIN)
		accounts_before = frappe.db.count("User", {"name": ["like", "tablet-%@devices.invalid"]})
		first_tablet, _sid = self.paired(first)
		# The second pairing's first plain read of the tablets misses the row the first made (it was not committed yet);
		# a locking read sees it. Caught at the database, so that the earlier code's own read misses it the same way
		database = type(frappe.local.db)
		get_value = database.get_value
		missed = {"once": False}

		def miss_it_once(db, doctype, *args, **kwargs):
			if doctype == DEVICE and not kwargs.get("for_update") and not missed["once"]:
				missed["once"] = True
				return None
			return get_value(db, doctype, *args, **kwargs)

		with patch.object(database, "get_value", miss_it_once):
			second_tablet, _sid = self.paired(second)
		self.assertTrue(missed["once"])
		self.assertEqual(second_tablet, first_tablet)
		self.assertEqual(frappe.db.count(DEVICE, {"restaurant": self.bistro, "station": self.grill}), 1)
		self.assertEqual(
			frappe.db.count("User", {"name": ["like", "tablet-%@devices.invalid"]}), accounts_before + 1
		)

	def test_a_get_never_spends_a_token(self):
		token = self.token(station=self.grill)
		with self.browser(method="GET"):
			frappe.local.form_dict.token = token
			with self.assertRaises(frappe.PermissionError):
				frappe.handler.execute_cmd(REDEEM)
			self.assertEqual(frappe.session.user, "Guest")
		self.assertIsNone(self.pairing_of(token, "used_at"))
		redeem = frappe.get_attr(REDEEM)
		self.assertEqual(tuple(frappe.allowed_http_methods_for_whitelisted_func[redeem]), ("POST",))
		self.assertIn(redeem, frappe.guest_methods)
		for dotted in (CREATE, DISCONNECT, RETIRE):
			self.assertEqual(
				tuple(frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(dotted)]), ("POST",)
			)
			self.assertNotIn(frappe.get_attr(dotted), frappe.guest_methods)
		# The token still opens the tablet, by a POST
		with self.browser():
			self.assertIn("redirect", self.redeem(token))

	def test_redeeming_is_rate_limited(self):
		limit = REDEEM_LIMIT
		token = self.token(station=self.grill)
		with self.browser(address="198.51.100.71"):
			for _attempt in range(limit):
				self.assert_refused_token(UNKNOWN)
			# A good token as well, once the address has tried too often
			with self.assertRaises(frappe.RateLimitExceededError):
				self.redeem(token)
			self.assertEqual(frappe.session.user, "Guest")
		self.assertIsNone(self.pairing_of(token, "used_at"))
		# Another address is not held back
		with self.browser(address="198.51.100.72"):
			self.assert_refused_token(UNKNOWN)

	def test_the_limit_counts_the_address_nginx_saw_whatever_the_route_or_the_cmd(self):
		# Frappe's limiter keys on the request's `cmd` (which the v2 route never sets, so a caller sends his own) and on
		# the FIRST X-Forwarded-For entry (which a caller writes where nginx appends). Ten tries through the v2 route, each
		# with its own `cmd` and its own first entry, from the same peer: the eleventh is refused.
		peer = "198.51.100.90"
		self.browser_addresses.append(peer)
		path = f"/api/v2/method/{REDEEM}"
		for attempt in range(REDEEM_LIMIT + 1):
			headers = {"X-Forwarded-For": f"10.9.{attempt}.1, {peer}"}
			with self.browser(path=path, headers=headers, address=f"10.9.{attempt}.1"):
				frappe.local.form_dict = frappe._dict(
					token=UNKNOWN, code=UNKNOWN, cmd=f"pos_next.made.up.{attempt}"
				)
				if attempt < REDEEM_LIMIT:
					with self.assertRaises(frappe.ValidationError) as caught:
						api_v2.handle_rpc_call(REDEEM)
					self.assertEqual(type(caught.exception).__name__, "PairingCodeError")
				else:
					with self.assertRaises(frappe.RateLimitExceededError):
						api_v2.handle_rpc_call(REDEEM)

	def test_no_secret_is_written_anywhere(self):
		started = add_to_date(now_datetime(), seconds=-1)
		token = self.token(station=self.grill)
		tablet, _sid = self.paired(token)
		with self.browser():
			self.assert_refused_token(token)
		written = {
			"Error Log": ["error", "method"],
			"Activity Log": ["subject", "content"],
			"Version": ["data"],
			"Comment": ["content"],
			PAIRING: ["*"],
			DEVICE: ["*"],
		}
		for doctype, fields in written.items():
			with self.subTest(doctype=doctype):
				rows = frappe.get_all(doctype, filters={"creation": [">=", started]}, fields=fields)
				self.assert_no_token(token, json.dumps(rows, default=str), doctype)
		self.assert_no_token(
			token, json.dumps(frappe.get_doc("User", tablet).as_dict(), default=str), "the account"
		)

	def test_a_server_error_in_a_redeem_leaves_no_token_in_the_error_log(self):
		# A 5xx is logged with the variables of every frame of its traceback (on a site in developer mode) and the request's
		# form: the token is named `token` wherever it is held, which Frappe's error snapshot redacts, and is dropped
		# once hashed. The redeem's failure here is forced past the spend
		from frappe.utils.error import log_error
		from frappe.utils.logger import sanitized_dict

		token = self.token(station=self.grill)
		# Posted under the name the endpoint takes (`code` before this round), so that the earlier code shows its leak
		posted_as = next(iter(inspect.signature(frappe.get_attr(REDEEM)).parameters))
		logged = logged_form = None
		with patch.dict(frappe.conf, {"developer_mode": 1}), self.browser():
			frappe.local.form_dict = frappe._dict({"cmd": REDEEM, posted_as: token})
			with patch.object(devices, "pair", side_effect=RuntimeError("a forced server error")):
				try:
					frappe.handler.execute_cmd(REDEEM)
				except RuntimeError:
					# What the request handler records of a 5xx: the Error Log, and the form in frappe.log
					logged = log_error(title="a forced server error")
					logged_form = str(sanitized_dict(frappe.local.form_dict))
		self.assertIsNotNone(logged, "the forced server error did not happen")
		self.assertIn("a forced server error", logged.error)
		# The snapshot holds the frames' variables, redacted where they are a token's
		self.assertIn("********", logged.error)
		self.assert_no_token(token, logged.error, "the Error Log")
		self.assert_no_token(token, logged_form, "the form frappe.log records")

	def test_a_sign_in_another_app_refuses_leaves_the_till_and_the_tablet_agreeing(self):
		# An `on_session_creation` hook of another app (the theme's website profiles) refuses the tablet's account once the
		# session is made, which committed the spend: the session is ended, the row put back, the token is the till's again
		token = self.token(station=self.grill)
		original = LoginManager.run_trigger

		def refusing(manager, event="on_login"):
			if event == "on_session_creation":
				raise frappe.AuthenticationError("refused by another app")
			return original(manager, event)

		with self.browser(), patch.object(LoginManager, "run_trigger", refusing):
			with self.assertRaises(frappe.AuthenticationError):
				self.redeem(token)
		self.assertIsNone(self.pairing_of(token, "used_at"))
		self.assertFalse(frappe.db.exists(DEVICE, {"restaurant": self.bistro}))
		self.assertFalse(
			frappe.db.sql(
				"select sid from `tabSessions` where user like 'tablet-%%@devices.invalid'", pluck=True
			)
		)
		with as_user(MANAGER):
			self.assertEqual(call(DEVICES, restaurant=self.bistro), [])
		# Once the refusal is lifted, the same token opens the tablet
		tablet, _sid = self.paired(token)
		self.assertRegex(tablet, MINTED)

	def test_a_refusal_says_why_the_code_opens_nothing(self):
		# The person who scanned it knows what to do: a used code and an expired one are not a code the till never made
		used, expired = self.token(station=self.grill), self.token(RUNNER)
		self.paired(used)
		frappe.db.set_value(
			PAIRING, self.pairing_of(expired), "expires_at", add_to_date(now_datetime(), seconds=-1)
		)
		said = {
			"used": frappe._(
				"This code was already used: a code opens one screen, once. Ask for a new one at the till."
			),
			"expired": frappe._(
				"This code has expired: a code is valid for five minutes. Ask for a new one at the till."
			),
			"unknown": frappe._("This code opens no screen. Ask for a new one at the till."),
		}
		with self.browser():
			for label, token, reason in (
				("used", used, "used"),
				("expired", expired, "expired"),
				("unknown", UNKNOWN, "unknown"),
				("malformed", "short", "unknown"),
			):
				with self.subTest(code=label):
					with self.assertRaises(frappe.ValidationError) as caught:
						self.redeem(token)
					self.assertEqual(type(caught.exception).__name__, "PairingCodeError")
					self.assertEqual(str(caught.exception), said[reason])

	def test_a_redeem_with_no_token_gets_the_refusal_and_is_counted(self):
		# Not a server error (a 5xx writes an Error Log row and is counted nowhere): the refusal of any code that opens
		# nothing, counted against its address
		address = "198.51.100.61"
		with self.browser(address=address):
			frappe.local.form_dict = frappe._dict(cmd=REDEEM)
			with self.assertRaises(frappe.ValidationError) as caught:
				frappe.handler.execute_cmd(REDEEM)
			self.assertEqual(type(caught.exception).__name__, "PairingCodeError")
			self.assertLess(caught.exception.http_status_code, 500)
		counted = frappe.cache.get(frappe.cache.make_key(f"pos_next:tablet-redeem:{address}"))
		self.assertEqual(int(counted or 0), 1)

	def test_a_restaurant_pairing_many_tablets_from_one_address_is_not_held_back(self):
		# The rate limit counts the refusals: a restaurant pairs its stations and its runner behind one public address,
		# and a camera application may open the link twice
		address = "198.51.100.62"
		for attempt in range(REDEEM_LIMIT + 2):
			token = self.token(station=self.grill)
			with self.subTest(pairing=attempt + 1):
				with self.browser(address=address):
					self.assertIn("redirect", self.redeem(token))
				# The first three links are opened a second time: refused, and counted
				if attempt < 3:
					with self.browser(address=address):
						self.assert_refused_token(token)

	def test_the_sign_in_of_a_tablet_lets_one_login_through_and_nothing_after_it(self):
		# The pairing lets its own sign-in through once: another app's login hook, run in the same request, writes the
		# device account with the guards on, and a second sign-in of the same account is refused
		token = self.token(station=self.grill)
		seen = {}
		original = LoginManager.run_trigger

		def and_another_apps_hook(manager, event="on_login"):
			result = original(manager, event)
			if event == "on_login" and "@devices.invalid" in (manager.user or ""):
				seen["pairing"] = bool(frappe.local.flags.get(devices.PAIRING_FLAG))
				account = frappe.get_doc("User", manager.user)
				account.append("roles", {"role": "Customer"})
				try:
					account.save(ignore_permissions=True)
					seen["role"] = "written"
				except frappe.PermissionError:
					seen["role"] = "refused"
				try:
					devices.guard_device_login(manager)
					seen["second sign-in"] = "let through"
				except frappe.PermissionError:
					seen["second sign-in"] = "refused"
			return result

		with self.browser(), patch.object(LoginManager, "run_trigger", and_another_apps_hook):
			self.redeem(token)
			tablet = frappe.session.user
		self.assertEqual(seen, {"pairing": False, "role": "refused", "second sign-in": "refused"})
		self.assertEqual(self.has_roles(tablet), 0)
		self.assertRegex(tablet, MINTED)


class TestTheAccountOfATablet(Tablets):
	def test_a_binding_to_another_account_never_signs_it_in(self):
		# A row may name any account (a System Manager's script, a customised permission): only a device account minted here
		# is ever signed in; any other is left as it was and a fresh device account replaces it
		_user(FORGED, [], "Website User")
		frappe.db.delete("Has Role", {"parent": FORGED, "parenttype": "User"})
		first, _sid = self.paired(self.token(station=self.grill))
		device = frappe.db.get_value(DEVICE, {"user": first})
		for stranger in ("Administrator", MANAGER, PORTAL, FORGED):
			with self.subTest(account=stranger):
				frappe.db.set_value(DEVICE, device, "user", stranger)
				roles, sessions = self.has_roles(stranger), len(self.sessions_of(stranger))
				user_type = frappe.db.get_value("User", stranger, "user_type")
				tablet, _sid = self.paired(self.token(station=self.grill))
				self.assertNotEqual(tablet, stranger)
				self.assertRegex(tablet, MINTED)
				self.assertEqual(frappe.db.get_value(DEVICE, device, "user"), tablet)
				# The stranger is untouched: his roles, his user type, no session opened for him
				self.assertEqual(self.has_roles(stranger), roles)
				self.assertEqual(frappe.db.get_value("User", stranger, "user_type"), user_type)
				self.assertEqual(len(self.sessions_of(stranger)), sessions)

	def test_only_a_device_account_is_signed_in(self):
		sign_in = frappe.get_attr("pos_next.restaurant.devices.sign_in")
		for stranger in ("Administrator", MANAGER, PORTAL):
			with self.subTest(account=stranger), self.browser():
				with self.assertRaises(frappe.PermissionError):
					sign_in(frappe._dict(user=stranger, name="-"), MANAGER)
				self.assertEqual(frappe.session.user, "Guest")

	def test_nobody_turns_a_tablet_account_into_anything_else(self):
		# Each attempt is made past Frappe's own permission checks, so that the guard of the tablet's account is what says
		# no (a customer's administrator may write users: the theme's guard_protected_roles)
		tablet = self.tablet(self.bistro, KITCHEN)

		def saved(**changes):
			account = frappe.get_doc("User", tablet)
			for field, value in changes.items():
				if field == "roles":
					for role in value:
						account.append("roles", {"role": role})
				else:
					account.set(field, value)
			account.save(ignore_permissions=True)

		def give_it_a_token():
			frappe.get_doc(
				{
					"doctype": "OAuth Bearer Token",
					"access_token": frappe.generate_hash(length=20),
					"user": tablet,
					"scopes": "all",
					"expires_in": 3600,
				}
			).insert(ignore_permissions=True, ignore_links=True)

		attempts = {
			"a portal role": lambda: saved(roles=["Customer"]),
			"a desk role": lambda: saved(roles=["System Manager"]),
			"a password": lambda: saved(new_password="A-tablet-test-password-9"),
			"an API key": lambda: saved(api_key=frappe.generate_hash(length=15)),
			# Past the user's permissions: the model's rename (the fork's frappe.rename_doc takes no ignore_permissions)
			"another name": lambda: rename_doc(
				"User", tablet, "_test-renamed@devices.invalid", force=True, ignore_permissions=True
			),
			"an OAuth token": give_it_a_token,
		}
		for user in ("Administrator", ADMIN):
			for label, attempt in attempts.items():
				with self.subTest(user=user, attempt=label), as_user(user):
					with self.assertRaises(frappe.PermissionError):
						attempt()
		self.assertTrue(call("pos_next.restaurant.devices.is_clean_device_account", tablet))
		self.assertFalse(frappe.db.exists("OAuth Bearer Token", {"user": tablet}))

	def test_a_tablet_signs_in_by_its_pairing_only(self):
		# A password, a link, impersonation and `bench browse` all end in login_as
		tablet = self.tablet(self.bistro, KITCHEN)
		with self.browser():
			with self.assertRaises(frappe.PermissionError):
				frappe.local.login_manager.login_as(tablet)
			self.assertEqual(frappe.session.user, "Guest")
		self.assertEqual(self.sessions_of(tablet), [])

	def test_no_account_takes_the_address_of_a_tablet(self):
		# A merge moves the merged account's roles and password onto the address it is merged into: no account is merged
		# into a tablet's, or renamed to an address of the tablets
		tablet = self.tablet(self.bistro, KITCHEN)
		for label, new, merge in (
			("merged into a tablet's account", tablet, True),
			("renamed to a tablet's address", tablet_address(), False),
		):
			with self.subTest(attempt=label), self.assertRaises(frappe.PermissionError):
				rename_doc("User", MANAGER, new, force=True, merge=merge, ignore_permissions=True)
		self.assertTrue(frappe.db.exists("User", MANAGER))
		self.assertEqual(self.has_roles(tablet), 0)

	def test_a_migration_that_gives_every_account_a_role_leaves_the_tablet_alone(self):
		tablet = self.tablet(self.bistro, KITCHEN)
		# frappe.flags is a dict whose attributes are its keys
		with patch.dict(frappe.flags, {"in_patch": True}):
			frappe.get_doc("User", tablet).add_roles("Sales User")
		self.assertEqual(self.has_roles(tablet), 0)
		self.assertEqual(frappe.db.get_value("User", tablet, "user_type"), "Website User")

	def test_a_tablet_account_that_became_something_else_is_signed_out_not_let_through(self):
		# Written straight to the database, past every guard: the account now holds a desk role
		tablet, _sid = self.paired(self.token(station=self.grill))
		frappe.db.set_value("User", tablet, "user_type", "System User")
		desk_role = frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": tablet,
				"parenttype": "User",
				"parentfield": "roles",
				"role": "System Manager",
			}
		)
		desk_role.name = frappe.generate_hash(length=10)
		desk_role.db_insert()
		frappe.clear_cache(user=tablet)
		for label, endpoint in (
			("get_kds_orders", restaurant.get_kds_orders),
			("get_tables", restaurant.get_tables),
			("get_runner_orders", restaurant.get_runner_orders),
		):
			with self.subTest(label=label):
				self.assert_refused(tablet, label, endpoint)
		self.assertEqual(self.sessions_of(tablet), [])


class TestWhatATabletReaches(Tablets):
	def test_a_tablet_session_reaches_its_screens_and_nothing_else(self):
		confine = frappe.get_attr("pos_next.restaurant.devices.confine_tablet_session")
		self.assertIn("pos_next.restaurant.devices.confine_tablet_session", frappe.get_hooks("auth_hooks"))
		tablet = self.tablet(self.bistro, KITCHEN)
		reached = (
			("/pos", {}),
			("/pos/kds", {}),
			("/pos/pair", {}),
			("/pos-sw.js", {}),
			("/assets/pos_next/pos/assets/index.js", {}),
			("/files/menu.png", {}),
			("/pos/kds/index.html", {}),
			("/api/method/pos_next.api.restaurant.get_kds_orders", {}),
			("/api/v2/method/pos_next.api.restaurant.update_item_kds_status", {}),
			("/api/method/pos_next.api.localization.get_app_translations", {}),
			("/api/method/frappe.auth.get_logged_user", {}),
			("/api/method/frappe.realtime.get_user_info", {}),
			("/api/method/logout", {}),
		)
		refused = (
			("/app", {}),
			("/app/sales-invoice", {}),
			("/me", {}),
			("/", {}),
			("/private/files/invoice.pdf", {}),
			# A path that climbs out of its screen's pages: a raw request carries it as it was typed, and the website router
			# joins it onto each app's www folders, where `..` climbs out of any folder of that name an app has (the desk's
			# page, a print view, the webshop's cart, whose get_party makes its visitor a customer)
			("/pos/../app", {}),
			("/pos/kds/../../printview", {}),
			("/assets/../me", {}),
			("/assets/../cart", {}),
			("/files/../update-password", {}),
			("/api/method/frappe.client.get_list", {}),
			("/api/v2/method/frappe.client.get_list", {}),
			("/api/resource/Sales Invoice", {}),
			("/api/v2/document/Sales Invoice", {}),
			# Any other app's method that serves signed-in users: the webshop's cart makes its caller a customer
			("/api/method/webshop.webshop.shopping_cart.cart.get_cart_quotation", {}),
			("/api/method/pos_next.api.bootstrap.get_initial_data", {}),
			("/api/method/pos_next.api.utilities.get_csrf_token", {}),
			# A `cmd` runs before the path's method: smuggled, it is refused
			("/api/method/pos_next.api.restaurant.get_kds_orders", {"cmd": "frappe.client.get_list"}),
			("/", {"cmd": "frappe.client.get_list"}),
		)

		def reach(user, path, form):
			with self.browser(method="POST", path=path):
				frappe.set_user(user)
				frappe.local.form_dict = frappe._dict(form)
				confine()

		for path, form in reached:
			with self.subTest(path=path, form=form):
				reach(tablet, path, form)
		for path, form in refused:
			with self.subTest(path=path, form=form), self.assertRaises(frappe.PermissionError):
				reach(tablet, path, form)
		# Any other account goes its way
		for user in (MANAGER, PORTAL, "Guest"):
			with self.subTest(user=user):
				reach(user, "/app", {})
				reach(user, "/api/method/frappe.client.get_list", {})

	def test_a_kitchen_tablet_of_one_station_reads_its_station_only(self):
		grill = self.tablet(self.bistro, KITCHEN, self.grill)
		with as_user(grill):
			orders = restaurant.get_kds_orders()
			self.assertEqual([order["name"] for order in orders], [self.order])
			self.assertEqual({line["preparation_station"] for line in orders[0]["items"]}, {self.grill})
			self.assertEqual([row["name"] for row in restaurant.get_preparation_stations()], [self.grill])
			tables = restaurant.get_tables()
			self.assertEqual([table["name"] for table in tables["tables"]], [self.table])
		for label, fn, kwargs in (
			("get_kds_orders", restaurant.get_kds_orders, {"restaurant": self.bar}),
			("get_kds_orders", restaurant.get_kds_orders, {"station": self.pastry}),
			("get_kds_orders", restaurant.get_kds_orders, {"station": self.bar_grill}),
			("get_preparation_stations", restaurant.get_preparation_stations, {"station": self.bar_grill}),
			("get_tables", restaurant.get_tables, {"restaurant": self.bar}),
			# The runner's screen is not the kitchen's
			("get_runner_orders", restaurant.get_runner_orders, {}),
			("get_restaurant_settings", restaurant.get_restaurant_settings, {}),
			("mark_items_delivered", restaurant.mark_items_delivered, {"invoice_name": self.order}),
		):
			with self.subTest(label=label, kwargs=kwargs):
				self.assert_refused(grill, label, fn, **kwargs)
		# Its visits are noted on its row
		self.assertTrue(frappe.db.get_value(DEVICE, {"user": grill}, "last_seen"))

	def test_a_kitchen_tablet_of_every_station_reads_its_restaurant(self):
		kitchen = self.tablet(self.bistro, KITCHEN)
		with as_user(kitchen):
			orders = restaurant.get_kds_orders()
			self.assertEqual([order["name"] for order in orders], [self.order])
			self.assertEqual(
				{line["preparation_station"] for line in orders[0]["items"]}, {self.grill, self.pastry}
			)
			by_station = restaurant.get_kds_orders(station=self.pastry)
			self.assertEqual({line["preparation_station"] for line in by_station[0]["items"]}, {self.pastry})
			self.assertEqual(
				{row["name"] for row in restaurant.get_preparation_stations()}, {self.grill, self.pastry}
			)
		self.assert_refused(kitchen, "get_kds_orders", restaurant.get_kds_orders, station=self.bar_grill)

	def test_a_kitchen_tablet_moves_the_lines_of_its_station_only(self):
		grill = self.tablet(self.bistro, KITCHEN, self.grill)
		with as_user(grill):
			restaurant.update_item_kds_status(self.order, self.item, "Preparing")
		statuses = dict(
			frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": self.order},
				fields=["preparation_station", "kds_status"],
				as_list=True,
			)
		)
		self.assertEqual(statuses, {self.grill: "Preparing", self.pastry: "Pending"})
		# Not an order of its restaurant, nor an order still open
		self.assert_refused(
			grill,
			"update_item_kds_status",
			restaurant.update_item_kds_status,
			self.bar_order,
			self.item,
			"Ready",
		)
		self.assert_refused(grill, "update_kds_status", restaurant.update_kds_status, self.bar_order, "Ready")
		frappe.db.set_value("Sales Invoice", self.order, "docstatus", 1, update_modified=False)
		self.assert_refused(grill, "update_kds_status", restaurant.update_kds_status, self.order, "Ready")
		frappe.db.set_value("Sales Invoice", self.order, "docstatus", 0, update_modified=False)
		# The order's buttons act on the whole order, as on a kitchen screen filtered by station
		with as_user(grill):
			restaurant.update_kds_status(self.order, "Ready")
		self.assertEqual(frappe.db.get_value("Sales Invoice", self.order, "kds_status"), "Ready")
		self.assertNotEqual(frappe.db.get_value("Sales Invoice", self.bar_order, "kds_status"), "Ready")
		# A line of another station: nothing of its own to move
		pastry_only = self.make_order(self.table, [self.pastry])
		self.assert_refused(
			grill,
			"update_item_kds_status",
			restaurant.update_item_kds_status,
			pastry_only,
			self.item,
			"Ready",
		)

	def test_a_kitchen_tablet_sets_only_the_kitchens_states(self):
		grill = self.tablet(self.bistro, KITCHEN, self.grill)
		with as_user(grill):
			for status in ("Waiting", "Paid", "", "<b>Ready</b>"):
				with self.subTest(status=status):
					with self.assertRaises(frappe.ValidationError):
						restaurant.update_item_kds_status(self.order, self.item, status)
					with self.assertRaises(frappe.ValidationError):
						restaurant.update_kds_status(self.order, status)
		self.assertEqual(
			set(frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, pluck="kds_status")),
			{"Pending"},
		)
		self.assertNotIn(frappe.db.get_value("Sales Invoice", self.order, "kds_status"), ("Waiting", "Paid"))

	def test_the_screens_writes_take_a_post_only(self):
		# A tablet's session holds no CSRF token, and a top-level GET (a link opened on the tablet) carries its cookie: the
		# writes of its screens refuse a GET before anything is written (the screens and the till call them by POST)
		for dotted in (
			"pos_next.api.restaurant.update_item_kds_status",
			"pos_next.api.restaurant.mark_items_delivered",
		):
			with self.subTest(method=dotted):
				self.assertEqual(
					tuple(frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(dotted)]),
					("POST",),
				)
		frappe.db.set_value("Sales Invoice Item", {"parent": self.order}, "kds_status", "Ready")
		kitchen, runner = self.tablet(self.bistro, KITCHEN), self.tablet(self.bistro, RUNNER)
		for user, dotted, form in (
			(
				kitchen,
				"pos_next.api.restaurant.update_item_kds_status",
				{"invoice_name": self.order, "item_code": self.item, "status": "Preparing"},
			),
			(runner, "pos_next.api.restaurant.mark_items_delivered", {"invoice_name": self.order}),
		):
			with self.subTest(get=dotted), self.browser(method="GET", path=f"/api/method/{dotted}"):
				frappe.set_user(user)
				frappe.local.form_dict = frappe._dict(cmd=dotted, **form)
				with self.assertRaises(frappe.PermissionError):
					frappe.handler.execute_cmd(dotted)
		self.assertEqual(
			set(frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, pluck="kds_status")),
			{"Ready"},
		)

	def test_a_runner_tablet_reads_and_delivers_the_orders_of_its_restaurant(self):
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": ["in", [self.order, self.bar_order]]}, "kds_status", "Ready"
		)
		runner = self.tablet(self.bistro, RUNNER)
		with as_user(runner):
			self.assertEqual([order["name"] for order in restaurant.get_runner_orders()], [self.order])
			settings = restaurant.get_restaurant_settings()
			self.assertEqual((settings["restaurant"], settings["enable_runner"]), (self.bistro, True))
			# Nothing else of the restaurant's settings is a tablet's business
			self.assertFalse({"tip_account", "tip_item", "guest_menu", "takeaway_menu"} & set(settings))
			self.assertEqual([table["name"] for table in restaurant.get_tables()["tables"]], [self.table])
			restaurant.mark_items_delivered(self.order)
		self.assertEqual(
			set(frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, pluck="kds_status")),
			{"Delivered"},
		)
		for label, fn, kwargs in (
			("get_runner_orders", restaurant.get_runner_orders, {"restaurant": self.bar}),
			("get_restaurant_settings", restaurant.get_restaurant_settings, {"restaurant": self.bar}),
			("mark_items_delivered", restaurant.mark_items_delivered, {"invoice_name": self.bar_order}),
			# The kitchen's screen is not the runner's
			("get_kds_orders", restaurant.get_kds_orders, {}),
			("get_preparation_stations", restaurant.get_preparation_stations, {}),
			(
				"update_kds_status",
				restaurant.update_kds_status,
				{"invoice_name": self.order, "status": "Ready"},
			),
		):
			with self.subTest(label=label, kwargs=kwargs):
				self.assert_refused(runner, label, fn, **kwargs)
		self.assertEqual(
			frappe.db.get_value("Sales Invoice Item", {"parent": self.bar_order}, "kds_status"), "Ready"
		)

	def test_a_tablet_is_refused_everywhere_else(self):
		kitchen = self.tablet(self.bistro, KITCHEN)
		profile = frappe.db.get_value("POS Profile", {"disabled": 0}, "name")

		def desk_list():
			# The desk's list view reads what it lists from the request's form
			frappe.local.form_dict = frappe._dict(doctype="Sales Invoice", fields=json.dumps(["name"]))
			return reportview.get()

		elsewhere = [
			# The desk and frappe.client
			("frappe.client.get_list", frappe.client.get_list, ("Sales Invoice",), {}),
			("frappe.client.get_list", frappe.client.get_list, ("POS Profile",), {}),
			("frappe.client.get_list", frappe.client.get_list, ("Restaurant",), {}),
			("frappe.client.get_list", frappe.client.get_list, (DEVICE,), {}),
			("frappe.client.get_list", frappe.client.get_list, (PAIRING,), {}),
			("frappe.client.get_list", frappe.client.get_list, ("Preparation Station",), {}),
			(
				"frappe.client.get_value",
				frappe.client.get_value,
				("Sales Invoice", "name", {"name": self.order}),
				{},
			),
			("frappe.client.get_count", frappe.client.get_count, ("Sales Invoice",), {}),
			("frappe.client.get", frappe.client.get, ("Sales Invoice", self.order), {}),
			(
				"frappe.client.set_value",
				frappe.client.set_value,
				("Sales Invoice", self.order, "kds_status", "Ready"),
				{},
			),
			("reportview.get", desk_list, (), {}),
			("load.getdoc", load.getdoc, ("Sales Invoice", self.order), {}),
			# The till, its settings and its cash
			("get_opening_dialog_data", shifts.get_opening_dialog_data, (), {}),
			("get_cash_entry_templates", cash_entry.get_cash_entry_templates, (self.company, profile), {}),
			("get_restaurant_cards", restaurant.get_restaurant_cards, (), {"restaurant": self.bistro}),
			(
				"save_restaurant_settings",
				restaurant.save_restaurant_settings,
				("{}",),
				{"restaurant": self.bistro},
			),
			("get_takeaway_orders", restaurant.get_takeaway_orders, (), {"restaurant": self.bistro}),
			("update_table_status", restaurant.update_table_status, (self.table, "Empty"), {}),
			("get_table_order", restaurant.get_table_order, (self.table,), {}),
			# The tablets' own set-up
			("create_pairing_code", frappe.get_attr(CREATE), (KITCHEN,), {"restaurant": self.bistro}),
			("get_devices", frappe.get_attr(DEVICES), (), {"restaurant": self.bistro}),
			(
				"disconnect_device",
				frappe.get_attr(DISCONNECT),
				(frappe.db.get_value(DEVICE, {"user": kitchen}),),
				{},
			),
		]
		for label, fn, args, kwargs in elsewhere:
			with self.subTest(label=label, args=args):
				self.assert_refused(kitchen, label, fn, *args, **kwargs)
		self.assertNotEqual(frappe.db.get_value("Sales Invoice", self.order, "kds_status"), "Ready")
		self.assertEqual(frappe.db.get_value(DEVICE, {"user": kitchen}, "disconnected"), 0)
		# Frappe shares every account's own User record with it: the tablet reads its own, no other
		with as_user(kitchen):
			users = frappe.client.get_list("User", fields=["name"], limit_page_length=0)
		self.assertEqual([row["name"] for row in users], [kitchen])


class TestATabletSessionThroughTheRequestHandler(FrappeTestCase):
	"""A tablet's session, asked of Frappe's own request handler (frappe.app.application) from a thread of its own, as a
	browser's request is: the auth hooks, the routing of a `cmd`, /api and the pages all run as on the site. A tablet's
	account and a portal account, each signed in, are committed so that the handler's own connection sees them, and
	deleted at the end."""

	PORTAL = "tablets-handler-portal@yopmail.com"

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.tablet = self.account(tablet_address(), "_Test handler tablet")
		self.portal = self.account(self.PORTAL, "_Test handler portal")
		self.sids = {user: self.sign_in(user) for user in (self.tablet, self.portal)}
		frappe.db.commit()

	def account(self, address, first_name):
		"""A portal account with no role, written as a row: no other app's hook adds anything to it."""
		self.forget(address)
		self.addCleanup(self.forget, address)
		frappe.get_doc(
			{
				"doctype": "User",
				"name": address,
				"email": address,
				"first_name": first_name,
				"user_type": "Website User",
				"enabled": 1,
			}
		).db_insert()
		return address

	def sign_in(self, user):
		"""A session of `user`, opened as a sign-in opens it (for the tablet's account, as its pairing does)."""
		saved = {
			key: getattr(frappe.local, key, MISSING)
			for key in ("request", "request_ip", "login_manager", "cookie_manager", "session_obj")
		}
		try:
			frappe.utils.set_request(path="/", method="POST")
			frappe.local.request_ip = "203.0.113.7"
			frappe.local.cookie_manager = CookieManager()
			frappe.local.login_manager = LoginManager()
			# As the pairing lets its own sign-in through: a flag the first on_login takes (before fix round 2: a flag
			# raised around the whole sign-in; before fix round 1: none)
			if hasattr(devices, "SIGN_IN_FLAG"):
				frappe.local.flags[devices.SIGN_IN_FLAG] = user
			with getattr(devices, "pairing_writes", nullcontext)():
				frappe.local.login_manager.login_as(user)
			return frappe.session.sid
		finally:
			frappe.set_user("Administrator")
			for key, value in saved.items():
				if value is MISSING:
					if hasattr(frappe.local, key):
						delattr(frappe.local, key)
				else:
					setattr(frappe.local, key, value)
			frappe.local.response = frappe._dict()

	def forget(self, user):
		"""The account, its sessions and what signing in wrote, gone for good."""
		for sid in frappe.db.sql("select sid from `tabSessions` where user = %s", user, pluck=True):
			frappe.cache.hdel("session", sid)
			frappe.cache.hdel("last_db_session_update", sid)
		for doctype, field in (
			("Sessions", "user"),
			("Activity Log", "user"),
			("Has Role", "parent"),
			("DocShare", "user"),
		):
			frappe.db.delete(doctype, {field: user})
		frappe.db.delete("User", {"name": user})
		frappe.db.commit()
		frappe.cache.delete_value(f"raven_user_session_{user}")
		frappe.clear_cache(user=user)

	def ask(self, user, path, query=None):
		"""How Frappe's request handler answers a GET of `path` from the browser of `user`'s session."""
		return make_request(
			target=get_test_client(use_cookies=False).get,
			args=(path,),
			kwargs={
				"query_string": query or {},
				"headers": {"Cookie": f"sid={self.sids[user]}"},
				"buffered": True,
			},
			site=frappe.local.site,
		)

	def test_the_request_handler_keeps_a_tablet_session_to_its_screens(self):
		# The handler knows the session as the tablet's, and serves it the page of its screens
		answer = self.ask(self.tablet, "/api/method/frappe.auth.get_logged_user")
		self.assertEqual((answer.status_code, answer.json.get("message")), (200, self.tablet))
		self.assertEqual(self.ask(self.tablet, "/pos/kds").status_code, 200)
		# What a portal account reaches, a tablet does not
		for path, query in (
			("/api/method/frappe.client.get_list", {"doctype": "ToDo"}),
			("/api/v2/method/frappe.client.get_list", {"doctype": "ToDo"}),
			("/api/resource/ToDo", None),
			("/me", None),
			# The same page, by a path that starts like the assets' and climbs out of them (the router finds nothing there
			# while no app has a www/assets folder: the confinement does not rely on it)
			("/assets/../me", None),
			# A `cmd` runs whatever the path names: smuggled onto the page of the screens
			("/pos/kds", {"cmd": "frappe.client.get_list", "doctype": "ToDo"}),
		):
			with self.subTest(path=path, query=query):
				self.assertNotEqual(self.ask(self.portal, path, query).status_code, 403)
				self.assertEqual(self.ask(self.tablet, path, query).status_code, 403)
		# Nor the desk, another app's method that serves signed-in users, or a CSRF token
		for path in (
			"/app",
			"/app/sales-invoice",
			# The webshop's cart finds its caller's party, and makes him a customer (get_party)
			"/api/method/webshop.webshop.shopping_cart.cart.get_cart_quotation",
			"/api/method/pos_next.api.utilities.get_csrf_token",
		):
			with self.subTest(path=path):
				self.assertEqual(self.ask(self.tablet, path).status_code, 403)


class TestTheTabletsOfARestaurant(Tablets):
	def test_disconnecting_a_tablet_ends_its_sessions_until_it_is_paired_again(self):
		tablet, sid = self.paired(self.token(station=self.grill))
		self.assertTrue(frappe.cache.hget("session", sid))
		device = frappe.db.get_value(DEVICE, {"user": tablet})
		with as_user(MANAGER):
			listed = call(DEVICES, restaurant=self.bistro)
			self.assertEqual([row["name"] for row in listed], [device])
			self.assertEqual(
				(listed[0]["screen"], listed[0]["station_name"], listed[0]["paired_by_name"]),
				(KITCHEN, "_Test Grill", frappe.utils.get_fullname(MANAGER)),
			)
			self.assertEqual(call(DISCONNECT, device=device), {"ended_sessions": 1})
		self.assertEqual(self.sessions_of(tablet), [])
		self.assertFalse(frappe.cache.hget("session", sid))
		self.assertEqual(frappe.db.get_value(DEVICE, device, "disconnected"), 1)
		# A session that would still be there is refused all the same
		self.assert_refused(tablet, "get_kds_orders", restaurant.get_kds_orders)
		with as_user(MANAGER):
			self.assertTrue(call(DEVICES, restaurant=self.bistro)[0]["disconnected"])
		# A new token opens the same tablet again
		next_token = self.token(station=self.grill)
		with self.browser():
			self.redeem(next_token)
			self.assertEqual(frappe.session.user, tablet)
			self.assertEqual([order["name"] for order in restaurant.get_kds_orders()], [self.order])
		self.assertEqual(frappe.db.get_value(DEVICE, device, "disconnected"), 0)

	def test_disconnecting_stamps_the_moment_and_drops_the_tablets_oauth_tokens(self):
		tablet, _sid = self.paired(self.token(station=self.grill))
		device = frappe.db.get_value(DEVICE, {"user": tablet})
		# A token made past the guards (written straight to the database)
		frappe.get_doc(
			{
				"doctype": "OAuth Bearer Token",
				"access_token": frappe.generate_hash(length=20),
				"user": tablet,
				"scopes": "all",
				"expires_in": 3600,
			}
		).db_insert()
		before = now_datetime()
		with as_user(MANAGER):
			call(DISCONNECT, device=device)
		self.assertFalse(frappe.db.exists("OAuth Bearer Token", {"user": tablet}))
		self.assertGreaterEqual(frappe.db.get_value(DEVICE, device, "disconnected_at"), before)

	def test_a_session_older_than_the_last_disconnection_is_refused(self):
		token = self.token(station=self.grill)
		with self.browser():
			self.redeem(token)
			tablet = frappe.session.user
			old_session = frappe._dict(frappe.local.session)
			old_session.data = frappe._dict(frappe.local.session.data)
		device = frappe.db.get_value(DEVICE, {"user": tablet})
		with as_user(MANAGER):
			call(DISCONNECT, device=device)
		self.paired(self.token(station=self.grill))
		# The old session comes back (a cache that kept it): it was opened before the disconnection
		frappe.local.session = old_session
		try:
			with self.assertRaises(frappe.PermissionError):
				restaurant.get_kds_orders()
		finally:
			frappe.set_user("Administrator")

	def test_the_list_says_on_how_many_tablets_each_screen_is_open(self):
		self.paired(self.token(station=self.grill))
		self.paired(self.token(station=self.grill))
		with as_user(MANAGER):
			listed = call(DEVICES, restaurant=self.bistro)
		self.assertEqual([row["sessions"] for row in listed], [2])
		self.assertNotIn("user", listed[0])

	def test_a_deleted_restaurant_takes_its_tablets_with_it(self):
		cafe = self.insert("Restaurant", restaurant_name="_Test Tablets Cafe", company=self.company)
		tablet, _sid = self.paired(self.token(screen=RUNNER, restaurant=cafe))
		frappe.delete_doc("Restaurant", cafe, ignore_permissions=True)
		self.assertFalse(frappe.db.exists(DEVICE, {"restaurant": cafe}))
		self.assertFalse(frappe.db.exists(PAIRING, {"restaurant": cafe}))
		self.assertEqual(frappe.db.get_value("User", tablet, "enabled"), 0)
		self.assertEqual(self.sessions_of(tablet), [])
		# A restaurant made again under the same name inherits nothing
		self.insert("Restaurant", restaurant_name="_Test Tablets Cafe", company=self.company)
		with as_user(MANAGER):
			self.assertEqual(call(DEVICES, restaurant=cafe), [])
		self.assert_refused(tablet, "get_runner_orders", restaurant.get_runner_orders)

	def test_a_restaurant_whose_delete_is_refused_keeps_its_tablets(self):
		tablet, sid = self.paired(self.token(station=self.grill))
		# The Bistro's rooms, tables, stations and order link to it: its delete is refused
		with self.assertRaises(frappe.LinkExistsError):
			frappe.delete_doc("Restaurant", self.bistro, ignore_permissions=True)
		self.assertTrue(
			frappe.db.exists(DEVICE, {"user": tablet, "restaurant": self.bistro, "disconnected": 0})
		)
		self.assertEqual(frappe.db.get_value("User", tablet, "enabled"), 1)
		self.assertEqual(self.sessions_of(tablet), [sid])

	def test_a_row_naming_another_account_never_touches_that_account(self):
		# A row may name any account (a System Manager's script, a customised permission): disconnecting it, removing it
		# or removing its restaurant ends no session of that account, drops none of its tokens and never disables it
		def a_row_of(restaurant, stranger):
			device = frappe.db.get_value(DEVICE, {"user": self.tablet(restaurant, RUNNER)})
			frappe.db.set_value(DEVICE, device, "user", stranger)
			return device

		for number, stranger in enumerate(("Administrator", MANAGER, PORTAL), start=1):
			sid, access_token = self.a_session_of(stranger), self.an_oauth_token_of(stranger)
			enabled = frappe.db.get_value("User", stranger, "enabled")
			# Disconnected at the till, then removed from the desk
			device = a_row_of(self.bistro, stranger)
			with as_user(MANAGER):
				listed = {row["name"]: row for row in call(DEVICES, restaurant=self.bistro)}
				ended = call(DISCONNECT, device=device)
			frappe.delete_doc(DEVICE, device, ignore_permissions=True)
			# Its restaurant removed (a restaurant of its own, with no room, table or order)
			cafe = self.insert(
				"Restaurant", restaurant_name=f"_Test Tablets Cafe {number}", company=self.company
			)
			a_row_of(cafe, stranger)
			frappe.delete_doc("Restaurant", cafe, ignore_permissions=True)
			# What would hurt first: the account's session, its token, its being enabled; then what the till was told
			with self.subTest(account=stranger, kept="its session"):
				self.assertIn(sid, self.sessions_of(stranger))
			with self.subTest(account=stranger, kept="its OAuth token"):
				self.assertTrue(frappe.db.exists("OAuth Bearer Token", {"access_token": access_token}))
			with self.subTest(account=stranger, kept="enabled"):
				self.assertEqual(frappe.db.get_value("User", stranger, "enabled"), enabled)
			with self.subTest(account=stranger, told="the till"):
				self.assertEqual(ended, {"ended_sessions": 0})
				self.assertEqual(listed[device]["sessions"], 0)
				self.assertFalse(frappe.db.exists(DEVICE, {"restaurant": cafe}))

	def test_only_who_sets_up_the_restaurant_lists_and_disconnects_its_tablets(self):
		device = frappe.db.get_value(DEVICE, {"user": self.tablet(self.bistro, KITCHEN)})
		for user in (CASHIER, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.assert_refused(user, "get_devices", call, DEVICES, restaurant=self.bistro)
				self.assert_refused(user, "disconnect_device", call, DISCONNECT, device=device)
		self.insert("User Permission", user=MANAGER, allow="Restaurant", for_value=self.bar)
		self.assert_refused(MANAGER, "get_devices", call, DEVICES, restaurant=self.bistro)
		self.assert_refused(MANAGER, "disconnect_device", call, DISCONNECT, device=device)
		self.assertEqual(frappe.db.get_value(DEVICE, device, "disconnected"), 0)

	def test_a_removed_tablet_has_its_account_disabled(self):
		spare = self.insert("Preparation Station", restaurant=self.bistro, station_name="_Test Spare")
		tablet, _sid = self.paired(self.token(station=spare))
		device = frappe.db.get_value(DEVICE, {"user": tablet})
		# A station with a tablet can still be deleted: its tablet shows nothing any more
		frappe.delete_doc("Preparation Station", spare, ignore_permissions=True)
		with as_user(tablet):
			self.assertEqual(restaurant.get_kds_orders(), [])
			self.assertEqual(restaurant.get_kds_orders(station=spare), [])
			self.assertEqual(restaurant.get_preparation_stations(station=spare), [])
		with as_user(MANAGER):
			frappe.delete_doc(DEVICE, device)
		self.assertEqual(frappe.db.get_value("User", tablet, "enabled"), 0)
		self.assertEqual(self.sessions_of(tablet), [])
		self.assertFalse(frappe.db.exists(PAIRING, {"device": device}))

	def test_the_account_of_a_tablet_never_changes(self):
		device = frappe.get_doc(DEVICE, {"user": self.tablet(self.bistro, KITCHEN)})
		device.user = PORTAL
		with self.assertRaises(frappe.PermissionError):
			device.save(ignore_permissions=True)
