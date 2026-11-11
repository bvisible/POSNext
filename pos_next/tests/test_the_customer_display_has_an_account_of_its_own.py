# //// Neoffice — added file (no upstream equivalent).
"""The customer display signs in with an account of its own, never with the client's super account (maintenance#2296,
audit Q2).

The display paired with the client's API password, the secret of the super account (Admin, every right of the API), and
kept that key in the browser of the till, in clear, with no end date. It now pairs with a password a till manager draws
at the till for the display's own account: a portal account holding one role that opens no doctype, whose session
reaches the calls of the display and nothing else. The key of any other account is refused at the display's door.

The suite builds its till with the fixtures of the audit (TillCase) and rolls everything back. What is new is reached
through frappe.get_attr, so that the suite loads on the code before it and each test fails for its own reason.
"""

import json
from contextlib import contextmanager

import frappe

from pos_next.api import customer_display
from pos_next.tests.test_audit_guards_n1 import (
	DESK,
	MANAGER,
	PORTAL,
	TILL,
	TillCase,
	a_web_request,
	by_http,
)

API = "pos_next.api.customer_display"
ACCOUNT = "customer-display@displays.invalid"
ROLE = "POSNext Customer Display"
# The client's own administrator: the account whose key the display used to keep
SUPER = "display-q2-super@yopmail.com"


def new(name):
	return frappe.get_attr(f"{API}.{name}")


class TestTheCustomerDisplayHasAnAccountOfItsOwn(TillCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(self.forget_the_counters)
		self.shift = self.open_the_shift()
		for prefix in (customer_display.CART_CACHE_PREFIX, customer_display.PAYMENT_QR_CACHE_PREFIX):
			self.addCleanup(frappe.cache().delete_value, f"{prefix}{self.shift}")
		self.as_user(
			TILL,
			customer_display.update_cart_data,
			self.shift,
			json.dumps({"items": [{"item_code": "x"}], "customer": "c", "customer_name": "Somebody"}),
		)

	def forget_the_counters(self):
		for key in frappe.cache.get_keys("*pos_next:display-key:*"):
			frappe.cache.delete(key)

	def draw(self, user=MANAGER):
		return self.as_user(user, by_http, f"{API}.new_display_password")["password"]

	def pair(self, password, peer="203.0.113.60"):
		with a_web_request(peer):
			frappe.set_user("Guest")
			try:
				return by_http(f"{API}.pair_display", password=password)
			finally:
				frappe.set_user("Administrator")

	def validate(self, key, peer="203.0.113.61"):
		with a_web_request(peer):
			frappe.set_user("Guest")
			try:
				return by_http(f"{API}.validate_api_key", api_key_string=key)
			finally:
				frappe.set_user("Administrator")

	# --- the password -------------------------------------------------------------------------------------------

	def test_a_till_manager_draws_the_password_and_nobody_else(self):
		for user in (TILL, DESK, PORTAL, "Guest"):
			with self.subTest(user=user), self.assertRaises(frappe.PermissionError):
				self.draw(user)
		password = self.draw()
		self.assertEqual(len(password), 20)
		self.assertTrue(set(password) <= set("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"))
		self.assertNotEqual(password, self.draw(), "two draws gave the same password")

	def test_the_account_is_a_portal_account_that_holds_the_display_role_only(self):
		self.draw()
		account = frappe.db.get_value("User", ACCOUNT, ["user_type", "enabled", "api_key"], as_dict=True)
		self.assertEqual((account.user_type, account.enabled), ("Website User", 1))
		self.assertTrue(account.api_key)
		self.assertEqual(frappe.get_all("Has Role", filters={"parent": ACCOUNT}, pluck="role"), [ROLE])
		self.assertEqual(frappe.db.get_value("Role", ROLE, "desk_access"), 0)
		for doctype in ("Sales Invoice", "Customer", "POS Profile", "POS Opening Shift", "Item", "Payment Entry"):
			with self.subTest(doctype=doctype):
				self.assertFalse(frappe.has_permission(doctype, "read", user=ACCOUNT))
		# A sign-in password is never the display's
		self.assertFalse(
			frappe.db.sql(
				"select 1 from `__Auth` where doctype='User' and name=%s and fieldname='password'", ACCOUNT
			)
		)

	# --- the pairing --------------------------------------------------------------------------------------------

	def test_the_display_pairs_with_its_password_and_keeps_its_own_key(self):
		password = self.draw()
		paired = self.pair(password)
		self.assertEqual(paired["user"], ACCOUNT)
		key = paired["key"]
		self.assertEqual(key.split(":")[1], password)
		self.assertEqual(key.split(":")[0], frappe.db.get_value("User", ACCOUNT, "api_key"))
		self.assertEqual(self.validate(key)["user"], ACCOUNT)

	def test_a_wrong_or_a_previous_password_pairs_nothing(self):
		previous = self.draw()
		key = self.pair(previous)["key"]
		self.draw()
		with self.assertRaises(frappe.AuthenticationError):
			self.pair(previous)
		with self.assertRaises(frappe.AuthenticationError):
			self.validate(key)
		with self.assertRaises(frappe.AuthenticationError):
			self.pair("not-the-password")

	def test_the_key_of_the_super_account_is_refused_at_the_display(self):
		from pos_next.tests.test_till_writes_need_the_till import _user

		_user(SUPER, ["Admin", "POSNext Manager"], "System User")
		# As the page of the API password sets it: the key half, and the secret saved as a Password field
		account = frappe.get_doc("User", SUPER)
		account.api_key = "q2superkey"
		account.api_secret = "the-api-password"
		account.save(ignore_permissions=True)
		with self.assertRaises(frappe.AuthenticationError):
			self.validate("q2superkey:the-api-password")
		# Nor does its password pair a display
		self.draw()
		with self.assertRaises(frappe.AuthenticationError):
			self.pair("the-api-password")

	def test_a_refused_password_counts_against_its_address(self):
		self.draw()
		held_back = False
		for _attempt in range(40):
			try:
				self.pair("wrong", peer="203.0.113.62")
			except frappe.RateLimitExceededError:
				held_back = True
				break
			except frappe.AuthenticationError:
				continue
		self.assertTrue(held_back)

	# --- what the display reads -----------------------------------------------------------------------------------

	def test_the_display_reads_the_cart_of_a_till(self):
		self.draw()
		frappe.set_user(ACCOUNT)
		try:
			self.assertIn(self.fx.profile, [row.name for row in customer_display.get_pos_profiles()])
			entry = customer_display.get_pos_opening_entry(self.fx.profile, self.shift)
			self.assertEqual(entry["pos_opening_entry"], self.shift)
			self.assertIn("enable_customer_display", customer_display.get_display_settings(self.fx.profile))
			self.assertEqual(customer_display.get_current_cart(self.shift)["customer_name"], "Somebody")
		finally:
			frappe.set_user("Administrator")

	def test_a_portal_account_lists_no_till_of_the_display(self):
		with self.assertRaises(frappe.PermissionError):
			self.as_user(PORTAL, customer_display.get_pos_profiles)

	def test_the_display_writes_no_cart(self):
		self.draw()
		for call, args in (
			(customer_display.update_cart_data, (self.shift, "{}")),
			(customer_display.clear_cart_cache, (self.shift,)),
			(customer_display.push_payment_qr, (self.shift, "a-pairing-token")),
		):
			with self.subTest(call=call.__name__), self.assertRaises(frappe.PermissionError):
				self.as_user(ACCOUNT, call, *args)

	def test_the_display_creates_a_customer_only_where_the_till_lets_it(self):
		self.draw()
		self.set_till(enabled=1, enable_customer_display=1, enable_customer_display_account_creation=0)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(ACCOUNT, customer_display.create_customer_from_display, "Display Q2 Refused", self.shift)
		self.set_till(enable_customer_display_account_creation=1)
		made = self.as_user(
			ACCOUNT,
			customer_display.create_customer_from_display,
			"Display Q2 Customer",
			self.shift,
			email=f"display-q2-{frappe.generate_hash(length=6)}@yopmail.com",
		)
		self.assertEqual(made["customer"]["customer_name"], "Display Q2 Customer")

	# --- what its session reaches --------------------------------------------------------------------------------

	@contextmanager
	def request_to(self, path):
		kept = {name: getattr(frappe.local, name, None) for name in ("request", "form_dict")}
		frappe.utils.set_request(path=path, method="POST")
		try:
			yield
		finally:
			for name, value in kept.items():
				setattr(frappe.local, name, value)

	def reach(self, user, path, form=None):
		confine = new("confine_display_session")
		with self.request_to(path):
			frappe.set_user(user)
			# After set_user, which empties the form
			frappe.local.form_dict = frappe._dict(form or {})
			try:
				confine()
			finally:
				frappe.set_user("Administrator")

	def test_the_display_session_reaches_the_display_and_nothing_else(self):
		self.assertIn(f"{API}.confine_display_session", frappe.get_hooks("auth_hooks"))
		self.draw()
		reached = (
			"/pos/display",
			"/pos",
			"/assets/pos_next/pos/assets/index.js",
			"/files/an-ad.png",
			f"/api/method/{API}.get_current_cart",
			f"/api/method/{API}.get_pos_profiles",
			f"/api/v2/method/{API}.get_pos_opening_entry",
			"/api/method/pos_next.api.localization.get_app_translations",
			"/api/method/frappe.auth.get_logged_user",
		)
		refused = (
			("/api/method/frappe.client.get_list", {"doctype": "Sales Invoice"}),
			("/api/v2/method/frappe.client.get_list", {}),
			("/api/resource/Sales Invoice", {}),
			("/api/v2/document/Sales Invoice", {}),
			("/api/method/pos_next.api.customer_display.update_cart_data", {}),
			("/api/method/pos_next.api.bootstrap.get_initial_data", {}),
			("/app", {}),
			("/app/sales-invoice", {}),
			("/me", {}),
			("/pos/../app", {}),
			# A `cmd` runs before the path's method: smuggled, it is refused
			(f"/api/method/{API}.get_current_cart", {"cmd": "frappe.client.get_list"}),
		)
		for path in reached:
			with self.subTest(path=path):
				self.reach(ACCOUNT, path)
		for path, form in refused:
			with self.subTest(path=path, form=form), self.assertRaises(frappe.PermissionError):
				self.reach(ACCOUNT, path, form)
		# Any other account goes its way
		for user in (MANAGER, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.reach(user, "/api/method/frappe.client.get_list", {"doctype": "Sales Invoice"})
