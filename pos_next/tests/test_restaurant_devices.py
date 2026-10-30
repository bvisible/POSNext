# //// Neoffice — added file (no upstream equivalent).
"""A tablet opens the kitchen's or the runner's screen by scanning a QR code, with no password (NeoRestau lot 1, task 16).

A manager of the restaurant makes a one-time code at the till; the tablet redeems it and is signed in with an account of
its own: a portal account with no role and no password, bound to one restaurant and one screen (the kitchen, of every
station or of one; the runner). The kitchen's and the runner's endpoints accept that account, cut to its restaurant and
its station; every other endpoint keeps refusing it, as it refuses any portal account.

The suite relies on no patch and no after_migrate (a fresh CI site runs neither): it builds two restaurants of its own,
with their rooms, tables, stations and orders, and rolls everything back. The endpoints of the tablets are reached by
their dotted path, as a web request reaches them.
"""

import hashlib
import json
import random
from contextlib import contextmanager
from unittest.mock import patch

import frappe
import frappe.client
import frappe.handler
from frappe.auth import CookieManager, LoginManager
from frappe.desk import reportview
from frappe.desk.form import load
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, get_datetime, now_datetime, time_diff_in_seconds

from pos_next.api import cash_entry, restaurant, shifts
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import permissions
from pos_next.restaurant.permissions import ensure_restaurant_roles, grant_restaurant_permissions
from pos_next.tests.test_till_writes_need_the_till import _company, _customer, _item, _user

API = "pos_next.api.restaurant_devices"
CREATE = f"{API}.create_pairing_code"
REDEEM = f"{API}.redeem_pairing_code"
DEVICES = f"{API}.get_devices"
DISCONNECT = f"{API}.disconnect_device"
DEVICE = "Restaurant Device"
PAIRING = "Restaurant Device Pairing"
KITCHEN = "Kitchen"
RUNNER = "Runner"
MANAGER = "tablets-manager@yopmail.com"
ADMIN = "tablets-admin@yopmail.com"
CASHIER = "tablets-cashier@yopmail.com"
PORTAL = "tablets-portal@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
# A code of the right shape that no till ever made
UNKNOWN = "A" * 43
# What a device account holds: the roles every account holds, none of its own
EVERY_ACCOUNTS_ROLES = {"All", "Guest"}
MISSING = object()


def call(dotted, *args, **kwargs):
	"""An endpoint of the tablets, reached by its dotted path."""
	return frappe.get_attr(dotted)(*args, **kwargs)


def code_of(url):
	"""The code a QR code's address carries, in its fragment."""
	return url.split("#", 1)[1]


def sha256(code):
	return hashlib.sha256(code.encode()).hexdigest()


@contextmanager
def as_user(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


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
		"""A device account bound to a screen of a restaurant, as a pairing leaves it: a portal account with no role."""
		user = f"_test-tablet-{frappe.generate_hash(length=8)}@devices.invalid"
		_user(user, [], "Website User")
		frappe.db.delete("Has Role", {"parent": user, "parenttype": "User"})
		frappe.clear_cache(user=user)
		self.insert(
			DEVICE,
			device_name="_Test tablet",
			restaurant=restaurant,
			screen=screen,
			station=station,
			user=user,
		)
		return user

	def code(self, screen=KITCHEN, station=None, restaurant=None, user=MANAGER):
		"""A code made at the till by `user`, for a screen of the Bistro unless another restaurant is named."""
		with as_user(user):
			made = call(CREATE, screen=screen, station=station, restaurant=restaurant or self.bistro)
		return code_of(made["url"])

	@contextmanager
	def browser(self, method="POST", address=None):
		"""A web request from a browser with no session (a tablet that scanned a code), from an address of its own.

		What the request changed is put back afterwards; the sessions it opened are dropped from the cache when the test
		ends, and so are the rate limiter's counts of its address.
		"""
		address = address or f"203.0.113.{random.randint(1, 254)}"
		self.browser_addresses.append(address)
		# What was there before, told apart from what was not there at all (`request_ip` is there, as None)
		saved = {
			key: getattr(frappe.local, key, MISSING)
			for key in ("request", "request_ip", "login_manager", "cookie_manager", "session_obj", "lang")
		}
		frappe.set_user("Guest")
		frappe.utils.set_request(path=f"/api/method/{REDEEM}", method=method)
		frappe.local.request_ip = address
		frappe.local.form_dict = frappe._dict(cmd=REDEEM)
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

	def redeem(self, code):
		return call(REDEEM, code=code)

	def assert_refused_code(self, code):
		with self.assertRaises(frappe.ValidationError) as caught:
			self.redeem(code)
		self.assertEqual(type(caught.exception).__name__, "PairingCodeError")
		self.assertEqual(frappe.session.user, "Guest")

	def assert_refused(self, user, label, fn, *args, **kwargs):
		with as_user(user), self.assertRaises(frappe.PermissionError, msg=f"{label} answered {user}"):
			fn(*args, **kwargs)

	def sessions_of(self, user):
		return frappe.db.sql("select sid from `tabSessions` where user = %s", user, pluck=True)


class TestMakingACode(Tablets):
	def test_only_who_sets_up_the_restaurant_makes_a_code(self):
		kitchen_tablet = self.tablet(self.bistro, KITCHEN)
		for user in (CASHIER, PORTAL, kitchen_tablet, "Guest"):
			with self.subTest(user=user):
				self.assert_refused(
					user, "create_pairing_code", call, CREATE, KITCHEN, restaurant=self.bistro
				)
		self.assertFalse(frappe.db.exists(PAIRING, {"restaurant": self.bistro}))
		for user in (MANAGER, ADMIN, "Administrator"):
			with self.subTest(user=user):
				self.assertTrue(self.code(user=user))

	def test_a_code_is_random_kept_as_its_hash_and_valid_five_minutes(self):
		with as_user(MANAGER):
			made = call(CREATE, screen=KITCHEN, station=self.grill, restaurant=self.bistro)
		code = code_of(made["url"])
		# The till shows the page of the pairing; the code rides in the fragment, which no request carries
		self.assertTrue(made["url"].endswith(f"/pos/pair#{code}"), made["url"])
		self.assertGreaterEqual(len(code), 43)
		self.assertNotEqual(code, self.code(station=self.grill))
		self.assertEqual(made["expires_in"], 300)
		row = frappe.get_doc(PAIRING, {"code_hash": sha256(code)})
		self.assertEqual((row.restaurant, row.screen, row.station), (self.bistro, KITCHEN, self.grill))
		self.assertEqual(row.owner, MANAGER)
		self.assertIsNone(row.used_at)
		self.assertAlmostEqual(time_diff_in_seconds(row.expires_at, now_datetime()), 300, delta=10)
		# Only the hash is kept
		self.assertNotIn(code, json.dumps(row.as_dict(), default=str))

	def test_a_code_is_for_a_station_of_its_restaurant(self):
		with as_user(MANAGER):
			with self.assertRaises(frappe.ValidationError):
				call(CREATE, screen=KITCHEN, station=self.bar_grill, restaurant=self.bistro)
			with self.assertRaises(frappe.ValidationError):
				call(CREATE, screen="Till", restaurant=self.bistro)
			# The runner's screen shows every station
			made = call(CREATE, screen=RUNNER, station=self.grill, restaurant=self.bistro)
		self.assertIsNone(made["station"])
		self.assertFalse(frappe.db.get_value(PAIRING, {"code_hash": sha256(code_of(made["url"]))}, "station"))

	def test_a_manager_of_another_restaurant_makes_no_code_for_this_one(self):
		self.insert("User Permission", user=MANAGER, allow="Restaurant", for_value=self.bar)
		self.assert_refused(MANAGER, "create_pairing_code", call, CREATE, KITCHEN, restaurant=self.bistro)
		self.assertTrue(self.code(restaurant=self.bar))

	def test_where_neorestau_is_off_nothing_is_paired(self):
		code = self.code(station=self.grill)
		kitchen_tablet = self.tablet(self.bistro, KITCHEN)
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			with as_user(MANAGER), self.assertRaises(frappe.ValidationError):
				call(CREATE, screen=KITCHEN, restaurant=self.bistro)
			with self.browser(), self.assertRaises(frappe.ValidationError):
				self.redeem(code)
			self.assert_refused(kitchen_tablet, "get_kds_orders", restaurant.get_kds_orders)
		self.assertIsNone(frappe.db.get_value(PAIRING, {"code_hash": sha256(code)}, "used_at"))


class TestRedeemingACode(Tablets):
	def test_a_code_signs_the_tablet_in_once(self):
		code = self.code(station=self.grill)
		with self.browser():
			answer = self.redeem(code)
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
		# A portal account with no role, at an address that receives no mail, with no password
		account = frappe.get_doc("User", tablet)
		self.assertEqual((account.user_type, account.enabled), ("Website User", 1))
		self.assertTrue(tablet.endswith("@devices.invalid"), tablet)
		self.assertLessEqual(set(frappe.get_roles(tablet)), EVERY_ACCOUNTS_ROLES)
		self.assertFalse(
			frappe.db.sql(
				"select name from `__Auth` where doctype = 'User' and name = %s and fieldname = 'password'",
				tablet,
			)
		)
		# Bound to its restaurant and screen, paired by the manager who made the code
		device = frappe.get_doc(DEVICE, {"user": tablet})
		self.assertEqual(
			(device.restaurant, device.screen, device.station, device.paired_by, device.disconnected),
			(self.bistro, KITCHEN, self.grill, MANAGER, 0),
		)
		self.assertEqual(frappe.db.get_value(PAIRING, {"code_hash": sha256(code)}, "device"), device.name)
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
			self.assert_refused_code(code)

	def test_an_expired_or_unknown_code_is_refused(self):
		code = self.code(station=self.grill)
		frappe.db.set_value(
			PAIRING, {"code_hash": sha256(code)}, "expires_at", add_to_date(now_datetime(), seconds=-1)
		)
		with self.browser():
			for refused in (code, UNKNOWN, "short", None, {"code": code}, ["x"]):
				with self.subTest(code=refused):
					self.assert_refused_code(refused)
		self.assertFalse(frappe.db.exists(DEVICE, {"restaurant": self.bistro}))

	def test_a_screen_is_one_tablet_account(self):
		first, second, runner_code = (
			self.code(station=self.grill),
			self.code(station=self.grill),
			self.code(RUNNER),
		)
		with self.browser():
			self.redeem(first)
			grill = frappe.session.user
		with self.browser():
			self.redeem(second)
			again = frappe.session.user
		with self.browser():
			answer = self.redeem(runner_code)
			runner = frappe.session.user
		self.assertEqual(grill, again)
		self.assertNotEqual(grill, runner)
		self.assertEqual(frappe.db.count(DEVICE, {"restaurant": self.bistro}), 2)
		self.assertEqual(answer["redirect"], f"/pos/runner?restaurant={self.bistro.replace(' ', '+')}")
		# Both tablets of the grill stay signed in: pairing the second ends no session of the first
		self.assertEqual(len(self.sessions_of(grill)), 2)

	def test_a_get_never_spends_a_code(self):
		code = self.code(station=self.grill)
		with self.browser(method="GET"):
			frappe.local.form_dict.code = code
			with self.assertRaises(frappe.PermissionError):
				frappe.handler.execute_cmd(REDEEM)
			self.assertEqual(frappe.session.user, "Guest")
		self.assertIsNone(frappe.db.get_value(PAIRING, {"code_hash": sha256(code)}, "used_at"))
		redeem = frappe.get_attr(REDEEM)
		self.assertEqual(tuple(frappe.allowed_http_methods_for_whitelisted_func[redeem]), ("POST",))
		self.assertIn(redeem, frappe.guest_methods)
		for dotted in (CREATE, DISCONNECT):
			self.assertEqual(
				tuple(frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(dotted)]), ("POST",)
			)
			self.assertNotIn(frappe.get_attr(dotted), frappe.guest_methods)
		# The code still opens the tablet, by a POST
		with self.browser():
			self.assertIn("redirect", self.redeem(code))

	def test_redeeming_is_rate_limited(self):
		limit = frappe.get_attr(f"{API}.REDEEM_LIMIT")
		code = self.code(station=self.grill)
		with self.browser(address="198.51.100.71"):
			for _attempt in range(limit):
				self.assert_refused_code(UNKNOWN)
			# A good code as well, once the address has tried too often
			with self.assertRaises(frappe.RateLimitExceededError):
				self.redeem(code)
			self.assertEqual(frappe.session.user, "Guest")
		self.assertIsNone(frappe.db.get_value(PAIRING, {"code_hash": sha256(code)}, "used_at"))
		# Another address is not held back
		with self.browser(address="198.51.100.72"):
			self.assert_refused_code(UNKNOWN)

	def test_no_secret_is_written_anywhere(self):
		started = add_to_date(now_datetime(), seconds=-1)
		code = self.code(station=self.grill)
		with self.browser():
			self.redeem(code)
			tablet = frappe.session.user
		with self.browser():
			self.assert_refused_code(code)
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
				self.assertNotIn(code, json.dumps(rows, default=str))
		self.assertNotIn(code, json.dumps(frappe.get_doc("User", tablet).as_dict(), default=str))


class TestWhatATabletReaches(Tablets):
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


class TestTheTabletsOfARestaurant(Tablets):
	def test_disconnecting_a_tablet_ends_its_sessions_until_it_is_paired_again(self):
		code, next_code = self.code(station=self.grill), self.code(station=self.grill)
		with self.browser():
			self.redeem(code)
			tablet = frappe.session.user
			sid = frappe.session.sid
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
		# A new code opens the same tablet again
		with self.browser():
			self.redeem(next_code)
			self.assertEqual(frappe.session.user, tablet)
			self.assertEqual([order["name"] for order in restaurant.get_kds_orders()], [self.order])
		self.assertEqual(frappe.db.get_value(DEVICE, device, "disconnected"), 0)

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
		code = self.code(station=spare)
		with self.browser():
			self.redeem(code)
			tablet = frappe.session.user
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
