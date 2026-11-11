# //// Neoffice — added file (no upstream equivalent).
"""The guards of the till's audit (neoffice-maintenance#2296): who each refuses, and who it lets through.

A cashier takes real money at a till that cannot stop, so a guard is proven twice: the account or the
request it is there for is refused, and the real journey past it still passes (a cash sale, a partial
payment on a till that allows it, a return, an offline sale synced later, a guest's table and takeaway
orders, the shop scan, the customer display, the kitchen). A method is called the way the HTTP handler calls
it (`by_http`), so that the annotations of its signature count. Nothing here commits, and no real provider
is called.
"""

import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.exceptions import FrappeTypeError
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, add_to_date, flt, nowdate, now_datetime

from pos_next import realtime_events
from pos_next.api import (
	cash_entry,
	credit_sales,
	customer_display,
	gift_cards,
	guest_ordering,
	invoices,
	items,
	pos_profile,
	promotions,
	reservations,
	restaurant,
	sales_invoice_hooks,
	shifts,
	utilities,
)
from pos_next.restaurant import guest_account
from pos_next.shop_scan import cart, session
from pos_next.tests import test_a_takeaway_order_goes_to_the_end as takeaway_case
from pos_next.tests import test_guest_account as guest_case
from pos_next.tests import shop_scan_case
from pos_next.tests import test_service_families as service_case
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

API = "pos_next.api"
# What a JSON body makes of an unannotated parameter: a filter of the caller's choice
OPERATOR = ["like", "%"]
A_FILTER = {"name": ["like", "%"]}
PORTAL = "audit-n1-portal@yopmail.com"
DESK = "audit-n1-desk@yopmail.com"
OTHER_CASHIER = "audit-n1-other-cashier@yopmail.com"
DISPLAY = "audit-n1-display@yopmail.com"
MANAGER = "audit-n1-manager@yopmail.com"
ACCOUNTANT = "audit-n1-accountant@yopmail.com"
SALES_MANAGER = "audit-n1-sales-manager@yopmail.com"
KEPT = "audit-n1-kept@yopmail.com"
A_PLACE_ELSEWHERE = "https://elsewhere.example/landing"
REFUSED_NAME = (FrappeTypeError, frappe.PermissionError, frappe.AuthenticationError)


def by_http(path, **form):
	"""A method called as the handler calls it: looked up, asked whether the caller may, its form passed."""
	method = frappe.get_attr(path)
	frappe.is_whitelisted(method)
	return frappe.call(method, **form)


@contextmanager
def a_web_request(forwarded_for=None, **more):
	"""A web request around the block, with the X-Forwarded-For header nginx passes on."""
	missing = object()
	kept = {name: getattr(frappe.local, name, missing) for name in ("request", "request_ip")}
	headers = {"X-Forwarded-For": forwarded_for} if forwarded_for else {}
	frappe.local.request = SimpleNamespace(method="POST", headers=headers, path="/api/method/x", **more)
	frappe.local.request_ip = forwarded_for.split(",")[0].strip() if forwarded_for else "127.0.0.1"
	try:
		yield
	finally:
		for name, value in kept.items():
			if value is missing:
				delattr(frappe.local, name)
			else:
				setattr(frappe.local, name, value)


def keep_to(user, doctype, value):
	"""A User Permission that keeps `user` to `value`."""
	frappe.get_doc(
		{"doctype": "User Permission", "user": user, "allow": doctype, "for_value": value}
	).insert(ignore_permissions=True)
	frappe.cache.hdel("user_permissions", user)


class TillCase(FrappeTestCase):
	"""A till with its cashier and its open shift, another till, and the accounts around them."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		self.addCleanup(setattr, frappe.flags, "ignore_account_permission", self.account_flag)
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.local.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")
		_user(OTHER_CASHIER, [CASHIER_ROLE], "System User")
		_user(DISPLAY, ["Blogger"], "System User")
		_user(MANAGER, ["POSNext Manager"], "System User")
		_user(ACCOUNTANT, ["Accounts User"], "System User")
		_user(SALES_MANAGER, ["Sales Manager"], "System User")
		_user(KEPT, [CASHIER_ROLE], "System User")
		self.fx = _till_fixture()
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": DISPLAY})
		profile.save(ignore_permissions=True)
		self.settings = frappe.db.get_value("POS Settings", {"pos_profile": self.fx.profile}) or (
			frappe.get_doc({"doctype": "POS Settings", "pos_profile": self.fx.profile})
			.insert(ignore_permissions=True)
			.name
		)

	def as_user(self, user, method, *args, **kwargs):
		frappe.set_user(user)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def set_till(self, **values):
		frappe.db.set_value("POS Settings", self.settings, values)

	def open_the_shift(self):
		opened = self.as_user(
			TILL,
			shifts.create_opening_shift,
			self.fx.profile,
			self.fx.company,
			json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 50}]),
		)
		return opened["pos_opening_shift"]["name"]

	def a_draft(self, **changes):
		return self.as_user(TILL, invoices.update_invoice, json.dumps(_sale(self.fx, **changes)))["name"]

	def total(self):
		"""What the sale of `_sale` costs on this site: the clone's company taxes it, a fresh site not."""
		return flt(frappe.db.get_value("Sales Invoice", self.a_draft(), "grand_total"))

	def a_payment(self, amount):
		return [{"mode_of_payment": self.fx.mode, "amount": amount}]

	def pay(self, data=None, **changes):
		"""The till's two steps: the draft, then its payment, in full unless `changes` says what is paid."""
		payload = _sale(self.fx, **changes)
		draft = self.as_user(TILL, invoices.update_invoice, json.dumps(payload))
		payload["name"] = draft["name"]
		if "payments" not in changes:
			payload["payments"] = self.a_payment(draft["grand_total"])
		return self.as_user(
			TILL, invoices.submit_invoice, invoice=json.dumps(payload), data=json.dumps(data or {})
		)

	def a_return_of(self, sale):
		"""The return of the whole of `sale`, as the dialog sends it."""
		total = flt(frappe.db.get_value("Sales Invoice", sale, "grand_total"))
		return _sale(
			self.fx,
			is_return=1,
			return_against=sale,
			items=[{"item_code": self.fx.item, "qty": -1, "rate": 10, "price_list_rate": 10}],
			payments=self.a_payment(-total),
		)


class TestATokenIsAText(guest_case.GuestAccountCase):
	"""Findings 1 and 7: a value that names a session or a record is a text before any lookup."""

	def guest_calls(self):
		ordering = f"{API}.guest_ordering"
		scanning = f"{API}.shop_scan"
		return (
			(f"{ordering}.validate_token", {}),
			(f"{ordering}.get_guest_menu", {}),
			(f"{ordering}.submit_guest_order", {"items": "[]"}),
			(f"{ordering}.get_order_status", {}),
			(f"{ordering}.request_guest_code", {"email": "a@yopmail.com"}),
			(f"{ordering}.confirm_guest_code", {"email": "a@yopmail.com", "code": "1"}),
			(f"{ordering}.register_guest_account", {"proof": "p", "customer_name": "n"}),
			(f"{ordering}.signed_in_account", {}),
			(f"{ordering}.claim_signed_in_account", {}),
			(f"{ordering}.get_guest_receipt_pdf", {}),
			(f"{ordering}.create_guest_payment", {"amount": 1}),
			(f"{ordering}.confirm_guest_payment", {}),
			(f"{ordering}.submit_takeaway_order", {"items": "[]"}),
			(f"{scanning}.scan_item", {"barcode": "b"}),
			(f"{scanning}.set_line_qty", {"line": "l", "qty": 1}),
			(f"{scanning}.get_shop_cart", {}),
			(f"{scanning}.finish_shop_cart", {}),
			(f"{scanning}.pay_shop_cart", {}),
			(f"{scanning}.confirm_shop_payment", {}),
		)

	def test_no_guest_endpoint_takes_an_operator_for_a_token(self):
		frappe.set_user("Guest")
		for path, more in self.guest_calls():
			for token in (OPERATOR, ["regex", "^a"], A_FILTER):
				with self.subTest(path=path, token=token), self.assertRaises(REFUSED_NAME):
					by_http(path, token=token, **more)

	def test_the_lookup_itself_refuses_what_is_no_text(self):
		for token in (OPERATOR, A_FILTER, 12, "", None):
			with self.subTest(token=token), self.assertRaises(frappe.AuthenticationError):
				guest_ordering._get_token_doc(token)

	def test_a_phone_still_opens_with_its_own_token(self):
		frappe.set_user("Guest")
		self.assertTrue(by_http(f"{API}.guest_ordering.validate_token", token=self.token.token)["valid"])
		status = by_http(f"{API}.guest_ordering.get_order_status", token=self.token.token)
		self.assertEqual(status["items"], [])

	def test_a_table_order_still_passes_from_the_phone(self):
		answer = self.order((self.cola, 2))
		self.assertEqual(answer["status"], "sent_to_kitchen")
		status = self.as_guest(guest_ordering.get_order_status, self.token.token)
		self.assertEqual([row["item_code"] for row in status["items"]], [self.cola])

	def test_a_wrong_token_is_still_refused_as_one(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.AuthenticationError):
			by_http(f"{API}.guest_ordering.validate_token", token="no-such-token")


class TestTheShopKeyIsAText(shop_scan_case.ShopCase):
	"""Finding 10."""

	def test_a_key_given_as_an_operator_opens_no_session(self):
		frappe.set_user("Guest")
		for key in (OPERATOR, ["is", "not set"], A_FILTER):
			with self.subTest(key=key), self.assertRaises(REFUSED_NAME + (frappe.ValidationError,)):
				by_http(f"{API}.shop_scan.start_shop_session", key=key)
			with self.subTest(key=key, call="session"), self.assertRaises(frappe.ValidationError):
				session.start(key)
		self.assertFalse(frappe.db.exists("Guest Order Token", {"mode": "shop", "owner": "Guest"}))

	def test_the_key_of_the_poster_opens_the_session(self):
		frappe.set_user("Guest")
		answer = by_http(f"{API}.shop_scan.start_shop_session", key=self.key)
		self.assertTrue(answer["token"])

	def test_the_phone_scans_with_its_session(self):
		token = self.as_guest(session.start, self.key)["token"]
		frappe.set_user("Guest")
		answer = by_http(f"{API}.shop_scan.scan_item", token=token, barcode="PNXT-SHOP-A")
		self.assertEqual(len(answer["lines"]), 1)


class TestATakeawayOrderIsThePaidOne(takeaway_case.TakeawayCase):
	"""Findings 7 and 8: finishing a paid order makes no other, and reads no customer of the caller's."""

	def test_a_filter_tells_nothing_of_the_customers(self):
		frappe.set_user("Guest")
		answers = []
		for customer in (A_FILTER, {"name": ["like", "no such customer%"]}, "no such customer"):
			with self.assertRaises(frappe.ValidationError) as refused:
				by_http(
					f"{API}.guest_ordering.submit_takeaway_order",
					token=self.token.token,
					items=json.dumps([{"item_code": self.cola, "qty": 1}]),
					customer=customer,
				)
			answers.append(str(refused.exception))
		self.assertEqual(len(set(answers)), 1, answers)

	def test_a_paid_order_makes_no_second_order(self):
		invoice = self.an_order()
		self.the_provider_confirms(invoice)
		customer = frappe.get_all("Customer", limit=1, pluck="name")[0]
		before = frappe.db.count("Sales Invoice")

		frappe.set_user("Guest")
		answer = by_http(
			f"{API}.guest_ordering.submit_takeaway_order",
			token=self.token.token,
			items=json.dumps([{"item_code": self.soup, "qty": 40}]),
			customer=customer,
		)
		frappe.set_user("Administrator")

		self.assertEqual(frappe.db.count("Sales Invoice"), before)
		self.assertEqual(answer["invoice"], invoice)
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "invoice"), invoice)

	def test_the_takeaway_journey_is_untouched(self):
		invoice = self.an_order()
		self.the_provider_confirms(invoice)
		self.assertEqual(self.confirm(0)["status"], "success")
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)


class TestTheStatusOfATableIsItsParty(guest_case.GuestAccountCase):
	"""Finding 9."""

	def a_paid_order(self):
		order = self.save([self.line(self.cola)])
		frappe.db.set_value("Sales Invoice", order, "docstatus", 1)
		return order

	def test_the_next_party_reads_nothing_of_the_last_one(self):
		frappe.db.delete("Guest Order Token", {"table": self.table_a})
		self.a_paid_order()
		frappe.db.set_value(
			"Sales Invoice",
			{"restaurant_table": self.table_a},
			"modified",
			add_to_date(now_datetime(), hours=-3),
			update_modified=False,
		)

		token = self.a_token()
		status = self.as_guest(guest_ordering.get_order_status, token.token)

		self.assertIsNone(status["invoice"])
		self.assertEqual(status["items"], [])

	def test_the_party_that_paid_still_reads_its_order(self):
		token = self.a_token()
		order = self.a_paid_order()
		frappe.db.set_value(
			"Sales Invoice",
			order,
			"modified",
			add_to_date(token.creation, seconds=5),
			update_modified=False,
		)

		status = self.as_guest(guest_ordering.get_order_status, token.token)

		self.assertEqual(status["invoice"], order)


class TestWhatTheMenuTells(guest_case.GuestAccountCase):
	"""Finding 35: what is not on the menu is answered with what the caller sent."""

	def test_a_code_off_the_menu_reads_no_name(self):
		frappe.db.set_value("Item", self.gum, "item_name", "A name nobody may read")

		with self.assertRaises(frappe.ValidationError) as refused:
			self.order((self.gum, 1))

		self.assertNotIn("A name nobody may read", str(refused.exception))
		self.assertIn(self.gum, str(refused.exception))

	def test_a_dish_of_the_menu_is_still_ordered(self):
		self.assertEqual(self.order((self.cola, 1))["status"], "sent_to_kitchen")


class TestAGuestPaysFromTheSite(guest_case.GuestAccountCase):
	"""Finding 37."""

	def payment_with(self, success_url, failed_url):
		self.order((self.cola, 1))
		with (
			patch.object(guest_ordering, "_resolve_wallee_provider", return_value="Wallee"),
			patch.object(guest_ordering, "_wallee_mode_of_payment", return_value="Card"),
			patch(
				"payments.api.intent.create_intent",
				return_value={
					"status": "requires_action",
					"next_action_payload": {"url": "https://pay.example/x"},
				},
			) as create_intent,
		):
			self.as_guest(
				guest_ordering.create_guest_payment,
				self.token.token,
				5,
				None,
				0,
				success_url,
				failed_url,
			)
		return create_intent.call_args.kwargs["metadata"]

	def test_a_return_address_elsewhere_is_dropped(self):
		metadata = self.payment_with(A_PLACE_ELSEWHERE, "javascript:alert(1)")
		self.assertIsNone(metadata["success_url"])
		self.assertIsNone(metadata["failed_url"])

	def test_the_page_of_the_site_is_kept(self):
		site = frappe.utils.get_url()
		metadata = self.payment_with(
			f"{site}/pos/guest/t?payment=success", f"{site}/pos/guest/t?payment=failed"
		)
		self.assertEqual(metadata["success_url"], f"{site}/pos/guest/t?payment=success")
		self.assertEqual(metadata["failed_url"], f"{site}/pos/guest/t?payment=failed")


class TestTheCustomerDisplay(TillCase):
	"""Finding 2: the display reads what its till writes, and the till's account or the display's reads it."""

	def setUp(self):
		super().setUp()
		self.shift = self.open_the_shift()
		for prefix in (customer_display.CART_CACHE_PREFIX, customer_display.PAYMENT_QR_CACHE_PREFIX):
			self.addCleanup(frappe.cache().delete_value, f"{prefix}{self.shift}")
		self.as_user(
			TILL,
			customer_display.update_cart_data,
			self.shift,
			json.dumps({"items": [{"item_code": "x"}], "customer": "c", "customer_name": "Somebody"}),
		)

	def test_the_cart_of_a_till_is_refused_outside_it(self):
		for user in (PORTAL, DESK, OTHER_CASHIER):
			with self.subTest(user=user), self.assertRaises(frappe.PermissionError):
				self.as_user(user, customer_display.get_current_cart, self.shift)

	def test_the_cashier_the_display_and_a_manager_read_the_cart(self):
		for user in (TILL, DISPLAY, MANAGER, "Administrator"):
			with self.subTest(user=user):
				cart_data = self.as_user(user, customer_display.get_current_cart, self.shift)
				self.assertEqual(cart_data["customer_name"], "Somebody")

	def test_the_shift_of_a_till_and_its_settings_answer_the_till(self):
		for user in (PORTAL, DESK):
			for call, args in (
				(customer_display.get_pos_opening_entry, (self.fx.profile,)),
				(customer_display.get_display_settings, (self.fx.profile,)),
			):
				with self.subTest(user=user, call=call.__name__), self.assertRaises(frappe.PermissionError):
					self.as_user(user, call, *args)
		for user in (TILL, DISPLAY, MANAGER):
			with self.subTest(user=user):
				entry = self.as_user(
					user, customer_display.get_pos_opening_entry, self.fx.profile, self.shift
				)
				self.assertEqual(entry["pos_opening_entry"], self.shift)
				self.assertIn(
					"enable_customer_display",
					self.as_user(user, customer_display.get_display_settings, self.fx.profile),
				)

	def test_a_name_that_is_no_text_reads_no_cart(self):
		with self.assertRaises(REFUSED_NAME):
			self.as_user(TILL, customer_display.get_current_cart, A_FILTER)


class TestTheDisplayKey(TillCase):
	"""Finding 6: the key half is public: a limit on the refusals stands between a guess and the account."""

	def setUp(self):
		super().setUp()
		self.key = "n1displaykey"
		self.secret = "the-display-password"
		# //// Neoffice — the display's own account: the door takes no other (maintenance#2296, audit Q2,
		# //// test_the_customer_display_has_an_account_of_its_own)
		self.display = customer_display.ensure_display_account()
		customer_display.set_display_key(self.key, self.secret)
		self.addCleanup(self.forget_the_counters)
		self.peers = set()

	def forget_the_counters(self):
		for key in frappe.cache.get_keys("*pos_next:display-key:*"):
			frappe.cache.delete(key)

	def guess(self, secret, first="198.51.100.1", peer="203.0.113.50"):
		with a_web_request(f"{first}, {peer}"):
			frappe.set_user("Guest")
			try:
				return by_http(
					f"{API}.customer_display.validate_api_key", api_key_string=f"{self.key}:{secret}"
				)
			finally:
				frappe.set_user("Administrator")

	def test_the_display_signs_in(self):
		self.assertEqual(self.guess(self.secret)["user"], self.display)

	def test_a_guesser_is_held_back_whatever_he_writes_in_the_header(self):
		held_back = False
		for attempt in range(40):
			try:
				self.guess("wrong", first=f"198.51.100.{attempt}")
			except frappe.RateLimitExceededError:
				held_back = True
				break
			except frappe.AuthenticationError:
				continue
		self.assertTrue(held_back)
		with self.assertRaises(frappe.RateLimitExceededError):
			self.guess(self.secret)

	def test_another_address_is_not_held_back_for_the_first(self):
		for attempt in range(40):
			try:
				self.guess("wrong")
			except frappe.RateLimitExceededError:
				break
			except frappe.AuthenticationError:
				continue
		self.assertEqual(self.guess(self.secret, peer="203.0.113.51")["user"], self.display)

	def test_a_right_key_never_counts(self):
		for _attempt in range(40):
			self.assertTrue(self.guess(self.secret)["success"])

	def test_what_is_no_text_is_refused_by_its_type(self):
		frappe.set_user("Guest")
		with self.assertRaises(FrappeTypeError):
			by_http(f"{API}.customer_display.validate_api_key", api_key_string=OPERATOR)


class TestWhoHearsATill(TillCase):
	"""Finding 14: the till's events go to the accounts of the tills, not to every desk account."""

	def setUp(self):
		super().setUp()
		self.shift = self.open_the_shift()
		frappe.cache().delete_value(f"{customer_display.CART_CACHE_PREFIX}{self.shift}")
		self.addCleanup(frappe.cache().delete_value, f"{customer_display.CART_CACHE_PREFIX}{self.shift}")
		told = patch("frappe.publish_realtime")
		self.told = told.start()
		self.addCleanup(told.stop)

	def audience(self, event):
		calls = self.told.call_args_list
		return {call.kwargs.get("user") for call in calls if call.kwargs.get("event") == event}

	def assert_the_tills_alone(self, event):
		"""Each account with a shift open, the test's cashier among them, and nobody else."""
		told = self.audience(event)
		self.assertIn(TILL, told)
		self.assertNotIn(None, told)
		self.assertNotIn(DESK, told)
		for user in told:
			open_shift = {"user": user, "status": "Open", "docstatus": 1}
			self.assertTrue(frappe.db.exists("POS Opening Shift", open_shift))

	def test_a_customer_is_told_to_the_tills_alone(self):
		customer = frappe._dict(name="c", customer_name="n", mobile_no="1", email_id="e", disabled=0)
		realtime_events.emit_customer_event(customer, "on_update")
		self.assert_the_tills_alone("pos_customer_changed")

	def test_an_invoice_is_told_to_the_tills_alone(self):
		invoice = frappe._dict(
			name="i", is_pos=1, grand_total=1, customer="c", pos_profile=self.fx.profile
		)
		realtime_events.emit_invoice_created_event(invoice)
		self.assert_the_tills_alone("pos_invoice_created")

	def test_a_cart_is_told_to_the_till_and_its_display(self):
		self.as_user(TILL, customer_display.update_cart_data, self.shift, "{}")
		self.assertEqual(self.audience(f"pos_cart_updated_{self.shift}"), {TILL, DISPLAY})

	def test_a_payment_qr_is_told_to_the_till_and_its_display(self):
		self.as_user(TILL, customer_display.push_payment_qr, self.shift, "a-pairing-token")
		self.addCleanup(
			frappe.cache().delete_value, f"{customer_display.PAYMENT_QR_CACHE_PREFIX}{self.shift}"
		)
		self.assertEqual(self.audience(f"pos_payment_qr_{self.shift}"), {TILL, DISPLAY})


class TestABadgeReadsItsIcon(FrappeTestCase):
	"""Finding 4: the icon of a badge is a file of the badges' folder, never a path."""

	PATHS = (
		"../../../../../../sites/common_site_config.json",
		"/etc/passwd",
		"..\\..\\x.png",
		"gluten.svg/../../../../hooks.py",
	)

	def setUp(self):
		frappe.set_user("Administrator")
		self.addCleanup(frappe.db.rollback)
		self.addCleanup(frappe.clear_document_cache, "Menu Badge", "_Test N1 Badge")
		self.badge = frappe.get_doc(
			{
				"doctype": "Menu Badge",
				"badge_name": "_Test N1 Badge",
				"badge_type": "Allergen",
				"icon": "gluten.svg",
				"color": "#000000",
			}
		).insert(ignore_permissions=True, set_name="_Test N1 Badge", ignore_mandatory=True)

	def icon_of_the_card(self, icon):
		"""What the preview of a card returns for a dish carrying the badge, with `icon` already stored."""
		frappe.db.set_value("Menu Badge", self.badge.name, "icon", icon)
		frappe.clear_document_cache("Menu Badge", self.badge.name)
		item = SimpleNamespace(
			custom_item_badges=[SimpleNamespace(menu_badge=self.badge.name)],
			item_name="x",
			get=lambda key, default=None: default,
		)
		card = SimpleNamespace(
			items=[
				SimpleNamespace(
					item_type="Item",
					item="x",
					label="x",
					price=1,
					get=lambda key, default=None: default,
				)
			],
			get=lambda key, default=None: default,
			card_name="c",
			description="",
			image="",
		)
		real_doc, real_cached = frappe.get_doc, frappe.get_cached_doc
		with (
			patch.object(restaurant.permissions, "require"),
			patch.object(
				restaurant.frappe,
				"get_doc",
				side_effect=lambda *a, **k: card if a[0] == "Restaurant Card" else real_doc(*a, **k),
			),
			patch.object(
				restaurant.frappe,
				"get_cached_doc",
				side_effect=lambda *a, **k: item if a[0] == "Item" else real_cached(*a, **k),
			),
		):
			answer = restaurant.get_card_items_with_badges("c")
		return [
			badge
			for category in answer["categories"]
			for dish in category["menu_items"]
			for badge in dish.get("badges", [])
		]

	def test_a_stored_path_reads_no_file(self):
		for path in self.PATHS:
			with self.subTest(path=path):
				badges = self.icon_of_the_card(path)
				self.assertEqual(badges[0]["icon_uri"], "")

	def test_an_icon_of_the_app_is_still_drawn(self):
		badges = self.icon_of_the_card("gluten.svg")
		self.assertTrue(badges[0]["icon_uri"].startswith("data:image/png;base64,"))

	def test_a_badge_takes_no_path(self):
		for path in self.PATHS:
			self.badge.icon = path
			with self.subTest(path=path), self.assertRaises(frappe.ValidationError):
				self.badge.save(ignore_permissions=True)

	def test_a_badge_keeps_its_file_name(self):
		self.badge.reload()
		self.badge.icon = "vegan.svg"
		self.badge.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Menu Badge", self.badge.name, "icon"), "vegan.svg")


class TestASubmittedInvoiceIsNotRewritten(TillCase):
	"""Finding 5: a sale that was submitted is answered, never saved again."""

	def test_a_retry_is_answered_with_the_sale(self):
		done = self.pay()
		modified = frappe.db.get_value("Sales Invoice", done["name"], "modified")

		again = self.as_user(
			TILL,
			invoices.submit_invoice,
			invoice=json.dumps(_sale(self.fx, name=done["name"])),
			data="{}",
		)

		self.assertEqual((again["name"], again["status"]), (done["name"], 1))
		self.assertEqual(flt(again["grand_total"]), flt(done["grand_total"]))
		self.assertEqual(frappe.db.get_value("Sales Invoice", done["name"], "modified"), modified)

	def test_a_replay_rewrites_no_field(self):
		done = self.pay()
		stored = frappe.db.get_value("Sales Invoice", done["name"], "write_off_account")
		other = frappe.db.get_value(
			"Account",
			{
				"company": self.fx.company,
				"is_group": 0,
				"root_type": "Expense",
				"name": ["!=", stored or ""],
			},
			"name",
		)

		self.as_user(
			TILL,
			invoices.submit_invoice,
			invoice=json.dumps(_sale(self.fx, name=done["name"], write_off_account=other)),
			data="{}",
		)

		self.assertEqual(frappe.db.get_value("Sales Invoice", done["name"], "write_off_account"), stored)

	def test_a_replayed_return_refunds_once(self):
		a_return = self.a_return_of(self.pay()["name"])
		with patch.object(invoices, "_process_psp_refunds_for_return") as refund:
			first = self.as_user(TILL, invoices.submit_invoice, invoice=json.dumps(a_return), data="{}")
			self.as_user(
				TILL,
				invoices.submit_invoice,
				invoice=json.dumps({**a_return, "name": first["name"]}),
				data="{}",
			)
		self.assertEqual(refund.call_count, 1)

	def test_an_offline_sale_resent_stays_idempotent(self):
		replay = {"invoice": _sale(self.fx, offline_id="audit-n1-offline"), "data": {"sales_team": []}}
		first = self.as_user(TILL, invoices.submit_invoice, data=json.dumps(replay))
		before = frappe.db.count("Sales Invoice", {"owner": TILL})

		again = self.as_user(TILL, invoices.submit_invoice, data=json.dumps(replay))

		self.assertEqual(again["name"], first["name"])
		self.assertEqual(frappe.db.count("Sales Invoice", {"owner": TILL}), before)

	def test_a_sale_resent_under_a_new_offline_id_is_recorded_on_it(self):
		done = self.pay()
		replay = _sale(self.fx, name=done["name"], offline_id="audit-n1-offline-2")

		again = self.as_user(TILL, invoices.submit_invoice, invoice=json.dumps(replay), data="{}")

		self.assertEqual(again["name"], done["name"])
		self.assertEqual(
			frappe.db.get_value("Offline Invoice Sync", {"offline_id": "audit-n1-offline-2"}, "status"),
			"Synced",
		)

	def test_a_cancelled_sale_is_refused(self):
		done = self.pay()
		frappe.db.set_value("Sales Invoice", done["name"], "docstatus", 2)
		with self.assertRaises(frappe.ValidationError):
			self.as_user(
				TILL,
				invoices.submit_invoice,
				invoice=json.dumps(_sale(self.fx, name=done["name"])),
				data="{}",
			)
		self.assertEqual(frappe.db.get_value("Sales Invoice", done["name"], "docstatus"), 2)

	def a_payment_intent(self, reference=None, **values):
		values = {"provider": "_Test N1", "amount": 1000, "status": "succeeded", "currency": "CHF", **values}
		if reference:
			values.update(reference_doctype="Sales Invoice", reference_name=reference)
		return (
			frappe.get_doc({"doctype": "Payment Intent", **values})
			.insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
			.name
		)

	def test_a_refund_never_lands_on_the_payment_of_somebody_else(self):
		self.a_payment_intent()
		sale = self.pay()["name"]
		self.a_payment_intent(reference=sale, status="refunded")
		self.assertIsNone(invoices._find_original_intent(sale, "_Test N1", 1000))

	def test_a_sale_paid_before_the_link_existed_still_finds_its_payment(self):
		older = self.a_payment_intent()
		self.assertEqual(invoices._find_original_intent("no-link-yet", "_Test N1", 1000), older)

	def test_the_linked_payment_is_still_found(self):
		sale = self.pay()["name"]
		linked = self.a_payment_intent(reference=sale)
		self.assertEqual(invoices._find_original_intent(sale, "_Test N1", 1000), linked)


class TestTheTillGate(TillCase):
	"""Finding 18: the gate of the till reads the caller's User Permissions, and a share is no till."""

	def test_a_cashier_kept_to_another_till_is_refused(self):
		keep_to(KEPT, "POS Profile", self.fx.other_profile)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(KEPT, cash_entry.require_till_access, self.fx.profile)
		self.as_user(KEPT, cash_entry.require_till_access, self.fx.other_profile)

	def test_a_manager_kept_to_another_till_is_refused(self):
		keep_to(MANAGER, "POS Profile", self.fx.other_profile)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(MANAGER, cash_entry.require_till_access, self.fx.profile)

	def test_a_user_permission_on_the_company_counts(self):
		with patch(
			"frappe.permissions.get_user_permissions",
			return_value={"Company": [frappe._dict(doc="_Test N1 Other Company", applicable_for=None)]},
		):
			with self.assertRaises(frappe.PermissionError):
				self.as_user(KEPT, cash_entry.require_till_access, self.fx.profile)

	def test_a_row_of_the_till_stays_an_assignment(self):
		keep_to(TILL, "POS Profile", self.fx.other_profile)
		self.as_user(TILL, cash_entry.require_till_access, self.fx.profile)

	def test_a_cashier_with_no_user_permission_works_at_any_till(self):
		self.as_user(OTHER_CASHIER, cash_entry.require_till_access, self.fx.profile)
		self.as_user(TILL, cash_entry.require_till_access, self.fx.profile)
		self.as_user(MANAGER, cash_entry.require_till_access, self.fx.profile)

	def test_one_shared_invoice_is_no_till(self):
		draft = self.a_draft()
		frappe.share.add("Sales Invoice", draft, DESK, read=1, flags={"ignore_share_permission": True})
		with self.assertRaises(frappe.PermissionError):
			self.as_user(DESK, cash_entry.require_till_access, self.fx.profile)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(DESK, cash_entry.require_till_user)

	def test_a_till_named_by_a_filter_is_refused(self):
		for name in (OPERATOR, A_FILTER):
			with self.subTest(name=name), self.assertRaises(frappe.PermissionError):
				self.as_user(OTHER_TILL, cash_entry.require_till_access, name)

	def test_the_shift_of_a_kept_cashier_is_refused_at_the_other_till(self):
		keep_to(KEPT, "POS Profile", self.fx.other_profile)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(
				KEPT,
				shifts.create_opening_shift,
				self.fx.profile,
				self.fx.company,
				json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
			)


class TestWhatATillWrites(TillCase):
	"""Finding 19: what no till made is written by whoever may write it; a till's own stays the till's."""

	def a_document_of_the_desk(self, doctype):
		sale = _sale(self.fx, doctype=doctype)
		sale.pop("pos_profile")
		sale.pop("payments")
		if doctype == "Sales Order":
			sale["delivery_date"] = nowdate()
			for item in sale["items"]:
				item["delivery_date"] = nowdate()
		doc = frappe.get_doc(sale)
		doc.flags.ignore_permissions = True
		# A draft of the desk is no till's: left to itself, ERPNext gives a POS invoice with no profile the first one of
		# its company, which on a site of one company is a till of this test, whose user then passed the gate.
		doc.flags.ignore_pos_profile = True
		doc.insert()
		if frappe.get_meta(doctype).has_field("pos_profile"):
			self.assertFalse(frappe.db.get_value(doctype, doc.name, "pos_profile"), "a draft of the desk names no till")
		return doc.name

	def test_a_sales_order_of_the_desk_is_not_the_tills(self):
		order = self.a_document_of_the_desk("Sales Order")
		payload = _sale(self.fx, doctype="Sales Order", name=order, payments=[], customer=self.fx.customer)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(TILL, invoices.update_invoice, json.dumps(payload))

	def test_a_draft_of_the_desk_is_not_a_row_users(self):
		draft = self.a_document_of_the_desk("Sales Invoice")
		payload = _sale(self.fx, name=draft, pos_profile=self.fx.other_profile)
		with patch.object(
			invoices, "_strip_server_managed_fields", wraps=invoices._strip_server_managed_fields
		) as past_the_gate:
			with self.assertRaises(frappe.PermissionError):
				self.as_user(OTHER_TILL, invoices.update_invoice, json.dumps(payload))
		past_the_gate.assert_not_called()

	def test_a_sales_order_is_refused_where_the_till_takes_none(self):
		self.set_till(allow_sales_order=0)
		payload = _sale(self.fx, doctype="Sales Order", payments=[], delivery_date=nowdate())
		with self.assertRaises(frappe.PermissionError):
			self.as_user(TILL, invoices.update_invoice, json.dumps(payload))

	def test_the_till_saves_a_sales_order_where_it_takes_them(self):
		self.set_till(allow_sales_order=1)
		payload = _sale(self.fx, doctype="Sales Order", payments=[], delivery_date=nowdate())
		order = self.as_user(TILL, invoices.update_invoice, json.dumps(payload))
		self.assertEqual(order["doctype"], "Sales Order")
		self.assertEqual(order["pos_profile"], self.fx.profile)
		again = {**payload, "name": order["name"]}
		saved = self.as_user(TILL, invoices.update_invoice, json.dumps(again))
		self.assertEqual(saved["name"], order["name"])

	def test_the_till_saves_its_own_draft_again(self):
		draft = self.a_draft()
		saved = self.as_user(TILL, invoices.update_invoice, json.dumps(_sale(self.fx, name=draft)))
		self.assertEqual(saved["name"], draft)


class TestAWriteOffStaysWithinTheLimit(TillCase):
	"""Finding 20 (the till's limit is 1)."""

	def test_more_than_the_limit_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.pay(data={"write_off_amount": 5}, payments=self.a_payment(self.total() - 5))

	def test_the_limit_holds_through_the_draft(self):
		with self.assertRaises(frappe.ValidationError):
			self.pay(write_off_amount=5, payments=self.a_payment(self.total() - 5))

	def test_the_automatic_write_off_is_not_the_tills_to_ask(self):
		done = self.pay(write_off_outstanding_amount_automatically=1)
		flag = "write_off_outstanding_amount_automatically"
		self.assertEqual(frappe.db.get_value("Sales Invoice", done["name"], flag), 0)

	def test_a_till_with_no_limit_writes_nothing_off(self):
		frappe.db.set_value("POS Profile", self.fx.profile, "write_off_limit", 0)
		frappe.clear_document_cache("POS Profile", self.fx.profile)
		with self.assertRaises(frappe.ValidationError):
			self.pay(data={"write_off_amount": 5}, payments=self.a_payment(self.total() - 5))

	def test_what_the_limit_allows_is_written_off(self):
		done = self.pay(data={"write_off_amount": 0.5}, payments=self.a_payment(self.total() - 0.5))
		self.assertEqual(done["status"], 1)
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", done["name"], "write_off_amount")), 0.5)


class TestASaleIsPaid(TillCase):
	"""Finding 21: a sale on credit or in part is the till's to allow; a sale paid in full meets no guard."""

	def setUp(self):
		super().setUp()
		self.set_till(allow_partial_payment=0, allow_credit_sale=0)

	def refused(self, **kwargs):
		with self.assertRaises(frappe.ValidationError):
			self.pay(**kwargs)

	def test_no_payment_and_a_word_of_credit_is_refused(self):
		self.refused(data={"redeemed_customer_credit": 10}, payments=[])

	def test_a_row_of_nothing_is_refused(self):
		self.refused(payments=self.a_payment(0))

	def test_part_of_the_total_is_refused(self):
		self.refused(payments=self.a_payment(4))

	def test_a_sale_paid_in_full_passes(self):
		self.assertEqual(self.pay()["status"], 1)

	def test_cash_with_change_passes(self):
		done = self.pay(
			payments=self.a_payment(self.total() + 10),
			change_amount=10,
			base_change_amount=10,
			account_for_change_amount=frappe.db.get_value(
				"Mode of Payment Account",
				{"parent": self.fx.mode, "company": self.fx.company},
				"default_account",
			),
		)
		self.assertEqual(done["status"], 1)

	def test_a_rounding_left_on_the_cart_passes(self):
		done = self.pay(payments=self.a_payment(self.total() - 0.02))
		self.assertEqual(done["status"], 1)

	def test_a_partial_payment_passes_where_the_till_allows_it(self):
		self.set_till(allow_partial_payment=1)
		total = self.total()
		done = self.pay(payments=self.a_payment(4))
		self.assertEqual((done["status"], flt(done["outstanding_amount"], 2)), (1, flt(total - 4, 2)))

	def test_a_sale_on_account_passes_where_the_till_allows_it(self):
		self.set_till(allow_credit_sale=1)
		total = self.total()
		done = self.pay(data={"is_credit_sale": 1}, payments=[])
		self.assertEqual((done["status"], flt(done["outstanding_amount"], 2)), (1, total))

	def test_customer_credit_that_covers_the_sale_passes(self):
		total = self.total()
		dict_of_credit = [{"credit_to_redeem": total, "type": "Invoice", "credit_origin": "x"}]
		with patch.object(credit_sales, "redeem_customer_credit") as redeem:
			done = self.pay(
				data={"redeemed_customer_credit": total, "customer_credit_dict": dict_of_credit}, payments=[]
			)
		self.assertEqual(done["status"], 1)
		redeem.assert_called_once()

	def test_credit_that_covers_a_part_of_the_sale_is_refused(self):
		dict_of_credit = [{"credit_to_redeem": 1, "type": "Invoice", "credit_origin": "x"}]
		with patch.object(credit_sales, "redeem_customer_credit"):
			self.refused(
				data={"redeemed_customer_credit": 10, "customer_credit_dict": dict_of_credit}, payments=[]
			)

	def test_a_sale_made_offline_short_of_the_total_still_syncs(self):
		# Its money was taken and its total may differ from the server's: a refusal would leave it in the
		# queue
		replay = _sale(self.fx, offline_id="audit-n1-short", payments=self.a_payment(self.total() - 1))
		with patch("frappe.log_error") as logged:
			done = self.as_user(
				TILL, invoices.submit_invoice, data=json.dumps({"invoice": replay, "data": {}})
			)
		self.assertEqual(done["status"], 1)
		self.assertTrue(any("Offline sale" in str(call.args[0]) for call in logged.call_args_list))

	def test_a_sale_said_offline_with_nothing_paid_is_refused(self):
		replay = _sale(self.fx, offline_id="audit-n1-nothing", payments=self.a_payment(0))
		with self.assertRaises(frappe.ValidationError):
			self.as_user(TILL, invoices.submit_invoice, data=json.dumps({"invoice": replay, "data": {}}))

	def test_a_return_owes_nothing(self):
		a_return = self.a_return_of(self.pay()["name"])
		with patch.object(invoices, "_process_psp_refunds_for_return"):
			done = self.as_user(TILL, invoices.submit_invoice, invoice=json.dumps(a_return), data="{}")
		self.assertEqual(done["status"], 1)


class TestCreditEntriesNeedTheirRight(TillCase):
	"""Finding 22."""

	def test_a_cashier_cancels_no_journal_entry(self):
		draft = self.a_draft()
		with patch.object(credit_sales, "_cancel_credit_journal_entries") as cancelled:
			with self.assertRaises(frappe.PermissionError):
				self.as_user(TILL, credit_sales.cancel_credit_journal_entries, draft)
		cancelled.assert_not_called()

	def test_an_accountant_with_the_right_passes(self):
		draft = self.a_draft()
		with patch.object(credit_sales, "_cancel_credit_journal_entries", return_value=[]) as cancelled:
			credit_sales.cancel_credit_journal_entries(draft)
		cancelled.assert_called_once()


class TestCoupons(TillCase):
	"""Finding 23: a coupon is written by whoever writes coupons and rules; a bearer code is the managers'."""

	def a_coupon(self, code="AUDITN1", **values):
		return promotions.create_coupon(
			json.dumps(
				{
					"coupon_name": code,
					"coupon_type": "Promotional",
					"coupon_code": code,
					"discount_type": "Percentage",
					"discount_percentage": 10,
					"company": self.fx.company,
					"maximum_use": 5,
					**values,
				}
			)
		)["name"]

	def test_who_cannot_write_the_rule_writes_no_coupon(self):
		coupon = self.a_coupon()
		data = json.dumps({"name": coupon, "maximum_use": 50})
		for call, args in (
			(promotions.create_coupon, (json.dumps({"coupon_name": "x"}),)),
			(promotions.update_coupon, (data,)),
			(promotions.toggle_coupon, (coupon,)),
			(promotions.delete_coupon, (coupon,)),
		):
			with self.subTest(call=call.__name__), self.assertRaises(frappe.PermissionError):
				self.as_user(ACCOUNTANT, call, *args)
		self.assertEqual(frappe.db.get_value("Coupon Code", coupon, "maximum_use"), 5)

	def test_who_writes_both_writes_the_coupon(self):
		coupon = self.as_user(SALES_MANAGER, self.a_coupon)
		self.assertTrue(frappe.db.exists("Coupon Code", coupon))
		self.as_user(SALES_MANAGER, promotions.update_coupon, json.dumps({"name": coupon, "maximum_use": 50}))
		self.assertEqual(frappe.db.get_value("Coupon Code", coupon, "maximum_use"), 50)

	def test_the_cashier_lists_promotions_but_no_gift_card(self):
		card = self.a_coupon(
			"AUDITN1CARD",
			coupon_type="Gift Card",
			discount_type="Amount",
			discount_amount=100,
			customer=self.fx.customer,
		)
		promo = self.a_coupon("AUDITN1PROMO")
		frappe.db.set_value("Coupon Code", card, "gift_card_amount", 100)

		listed = {row.name for row in self.as_user(TILL, promotions.get_coupons, self.fx.company)}

		self.assertIn(promo, listed)
		self.assertNotIn(card, listed)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(TILL, promotions.get_coupon_details, card)
		self.assertEqual(self.as_user(TILL, promotions.get_coupon_details, promo)["name"], promo)

	def test_a_manager_lists_the_cards(self):
		card = self.a_coupon(
			"AUDITN1CARD2",
			coupon_type="Gift Card",
			discount_type="Amount",
			discount_amount=100,
			customer=self.fx.customer,
		)
		listed = {row.name for row in self.as_user(SALES_MANAGER, promotions.get_coupons, self.fx.company)}
		self.assertIn(card, listed)


class TestTheCatalogueOfThePromotions(TillCase):
	"""Finding 31."""

	def test_a_portal_account_reads_no_catalogue(self):
		for call, args in (
			(promotions.search_items, ("__",)),
			(promotions.get_item_groups, ()),
			(promotions.get_brands, ()),
		):
			with self.subTest(call=call.__name__), self.assertRaises(frappe.PermissionError):
				self.as_user(PORTAL, call, *args)

	def test_a_cashier_searches_the_items(self):
		answer = self.as_user(TILL, promotions.search_items, "tillwrite")
		self.assertIn(self.fx.item, [row.item_code for row in answer])
		self.assertTrue(self.as_user(TILL, promotions.get_item_groups))

	def test_a_wildcard_is_a_character_and_zero_is_no_way_past_the_cap(self):
		frappe.cache().delete_value(f"search_items_rate_limit:{TILL}")
		answer = self.as_user(TILL, promotions.search_items, "__", limit="0")
		self.assertLessEqual(len(answer), 20)
		for row in answer:
			self.assertTrue("__" in row.item_code or "__" in (row.item_name or ""))


class TestAGiftCardSpends(TillCase):
	"""Finding 24."""

	def a_card(self, amount=100):
		rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": "_Test N1 card",
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Amount",
				"discount_amount": amount,
				"selling": 1,
				"company": self.fx.company,
				"currency": self.fx.currency,
				"valid_from": nowdate(),
				"coupon_code_based": 1,
				"priority": "1",
			}
		).insert(ignore_permissions=True)
		return (
			frappe.get_doc(
				{
					"doctype": "Coupon Code",
					"coupon_name": "_Test N1 card",
					"coupon_code": "AUDITN1GIFT",
					"coupon_type": "Gift Card",
					"customer": self.fx.customer,
					"pricing_rule": rule.name,
					"gift_card_amount": amount,
					"original_gift_card_amount": amount,
					"valid_from": nowdate(),
					"maximum_use": 0,
				}
			)
			.insert(ignore_permissions=True, ignore_mandatory=True)
			.name
		)

	def a_sale(self, card, used, offline=False):
		return frappe._dict(
			doctype="Sales Invoice",
			name="ZZ-N1",
			is_return=0,
			return_against=None,
			coupon_code=card,
			posa_coupon_code=None,
			posa_gift_card_amount_used=used,
			discount_amount=used,
			pos_profile=None,
			posa_pos_opening_shift=None,
			flags=frappe._dict(pos_offline_sync=offline),
			get=lambda key, default=None: None,
		)

	def balance_of(self, card):
		return flt(frappe.db.get_value("Coupon Code", card, "gift_card_amount"))

	def test_a_sale_spends_what_the_card_holds(self):
		card = self.a_card()
		gift_cards.process_gift_card_on_submit(self.a_sale(card, 30))
		self.assertEqual(self.balance_of(card), 70)

	def test_a_sale_cannot_spend_more_than_the_card_holds(self):
		card = self.a_card()
		with self.assertRaises(frappe.ValidationError):
			gift_cards.process_gift_card_on_submit(self.a_sale(card, 180))
		self.assertEqual(self.balance_of(card), 100)

	def test_the_second_till_finds_the_card_spent(self):
		card = self.a_card()
		gift_cards.process_gift_card_on_submit(self.a_sale(card, 80))
		with self.assertRaises(frappe.ValidationError):
			gift_cards.process_gift_card_on_submit(self.a_sale(card, 80))

	def test_the_card_is_read_under_a_lock(self):
		card = self.a_card()
		real = frappe.db.get_value
		with patch.object(frappe.db, "get_value", side_effect=real) as read:
			gift_cards.process_gift_card_on_submit(self.a_sale(card, 30))
		self.assertTrue(any(call.kwargs.get("for_update") for call in read.call_args_list))

	def test_a_sale_made_offline_goes_through_and_empties_the_card(self):
		card = self.a_card()
		gift_cards.process_gift_card_on_submit(self.a_sale(card, 180, offline=True))
		self.assertEqual(self.balance_of(card), 0)


class TestACouponsCap(TillCase):
	"""Finding 25."""

	def a_coupon(self, maximum, used=0, **values):
		rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": f"_Test N1 cap {maximum} {used}",
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Percentage",
				"discount_percentage": 10,
				"selling": 1,
				"company": self.fx.company,
				"currency": self.fx.currency,
				"valid_from": nowdate(),
				"coupon_code_based": 1,
				"priority": "1",
			}
		).insert(ignore_permissions=True)
		return (
			frappe.get_doc(
				{
					"doctype": "Coupon Code",
					"coupon_name": f"_Test N1 cap {maximum} {used}",
					"coupon_code": f"AUDITN1CAP{maximum}{used}",
					"coupon_type": "Promotional",
					"pricing_rule": rule.name,
					"valid_from": nowdate(),
					"maximum_use": maximum,
					"used": used,
					**values,
				}
			)
			.insert(ignore_permissions=True, ignore_mandatory=True)
			.name
		)

	def a_sale(self, coupon, offline=False):
		return frappe._dict(name="ZZ-N1", coupon_code=coupon, flags=frappe._dict(pos_offline_sync=offline))

	def used(self, coupon):
		return frappe.db.get_value("Coupon Code", coupon, "used")

	def test_a_use_past_the_cap_is_refused(self):
		coupon = self.a_coupon(1, used=1)
		with self.assertRaises(frappe.ValidationError):
			sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon))
		self.assertEqual(self.used(coupon), 1)

	def test_a_use_within_the_cap_counts(self):
		coupon = self.a_coupon(2, used=1)
		sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon))
		self.assertEqual(self.used(coupon), 2)

	def test_a_coupon_with_no_cap_is_never_refused(self):
		coupon = self.a_coupon(0)
		sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon))
		sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon))
		self.assertEqual(self.used(coupon), 2)

	def test_a_sale_made_offline_is_never_refused(self):
		coupon = self.a_coupon(1, used=1)
		sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon, offline=True))
		self.assertEqual(self.used(coupon), 1)

	def test_a_gift_card_keeps_its_own_rule(self):
		coupon = self.a_coupon(1, used=1, pos_next_gift_card=1)
		sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon))

	def test_the_cap_is_read_under_a_lock(self):
		coupon = self.a_coupon(2)
		real = frappe.db.get_value
		with patch.object(frappe.db, "get_value", side_effect=real) as read:
			sales_invoice_hooks.update_coupon_usage_on_submit(self.a_sale(coupon))
		self.assertTrue(
			any(
				call.kwargs.get("for_update") and "maximum_use" in call.args[2]
				for call in read.call_args_list
				if len(call.args) > 2
			)
		)


class TestTheReturnSearch(TillCase):
	"""Findings 26 and 27."""

	def test_the_search_reads_sales_invoices_alone(self):
		for doctype in ("Delivery Note", "POS Invoice", "User"):
			with self.subTest(doctype=doctype), self.assertRaises(frappe.PermissionError):
				self.as_user(TILL, invoices.search_invoices_for_return, doctype=doctype)
			with self.subTest(doctype=doctype, call="items"), self.assertRaises(frappe.PermissionError):
				self.as_user(TILL, invoices.validate_return_items, "x", "[]", doctype=doctype)

	def test_the_till_searches_its_invoices(self):
		sale = self.pay()["name"]
		found = self.as_user(TILL, invoices.search_invoices_for_return, invoice_name=sale)
		self.assertEqual([row["name"] for row in found["invoices"]], [sale])

	def names(self, user, call, *args):
		return {row["name"] for row in self.as_user(user, call, *args)}

	def test_a_cashier_with_no_user_permission_finds_a_sale_of_the_other_till(self):
		sale = self.pay()["name"]
		self.assertIn(sale, self.names(TILL, invoices.get_returnable_invoices, 500, self.fx.other_profile))
		self.assertIn(sale, self.names(TILL, invoices.search_invoice_by_number, sale, self.fx.other_profile))

	def test_a_cashier_kept_to_another_till_does_not(self):
		sale = self.pay()["name"]
		keep_to(KEPT, "POS Profile", self.fx.other_profile)
		frappe.db.set_value("POS Profile", self.fx.other_profile, "company", self.fx.company)
		self.assertNotIn(
			sale, self.names(KEPT, invoices.get_returnable_invoices, 500, self.fx.other_profile)
		)
		self.assertNotIn(
			sale, self.names(KEPT, invoices.search_invoice_by_number, sale, self.fx.other_profile)
		)
		found = self.as_user(KEPT, invoices.search_invoices_for_return, invoice_name=sale)
		self.assertEqual(found["invoices"], [])

	def test_a_user_of_a_till_who_reads_no_invoice_reads_the_invoices_of_his_tills(self):
		sale = self.pay()["name"]
		self.assertNotIn(
			sale, self.names(OTHER_TILL, invoices.get_returnable_invoices, 500, self.fx.other_profile)
		)
		self.assertIn(sale, self.names(DISPLAY, invoices.get_returnable_invoices, 500, self.fx.profile))


class TestTheStockOfAWarehouse(TillCase):
	"""Finding 28."""

	def setUp(self):
		super().setUp()
		self.warehouse = frappe.db.get_value("POS Profile", self.fx.profile, "warehouse")
		other = frappe.db.get_value(
			"Warehouse",
			{"company": self.fx.company, "is_group": 0, "disabled": 0, "name": ["!=", self.warehouse]},
			"name",
		)
		self.other = other
		if not other:
			self.skipTest("The company has one warehouse")

	def read(self, user, warehouse):
		with a_web_request():
			frappe.set_user(user)
			try:
				return items.get_item_stock(self.fx.item, warehouse)
			finally:
				frappe.set_user("Administrator")

	def test_a_user_kept_out_of_a_warehouse_reads_none_of_its_stock(self):
		keep_to(KEPT, "Warehouse", self.warehouse)
		with self.assertRaises(frappe.PermissionError):
			self.read(KEPT, self.other)

	def test_a_user_reads_the_warehouse_he_is_kept_to(self):
		keep_to(KEPT, "Warehouse", self.warehouse)
		self.assertEqual(self.read(KEPT, self.warehouse)["warehouse"], self.warehouse)

	def test_the_warehouse_of_the_cashiers_own_till_is_never_refused(self):
		keep_to(TILL, "Warehouse", self.other)
		self.assertEqual(self.read(TILL, self.warehouse)["warehouse"], self.warehouse)

	def test_a_cashier_with_no_user_permission_reads_any(self):
		self.assertEqual(self.read(TILL, self.other)["warehouse"], self.other)

	def test_a_warehouse_named_by_a_filter_is_refused(self):
		with self.assertRaises(REFUSED_NAME):
			self.read(TILL, A_FILTER)


class TestTheReportsOfATill(TillCase):
	"""Findings 29 and 30: raw SQL reads no User Permission, so the reports ask for them."""

	def rows_of(self, user, call, *args):
		return self.as_user(user, call, *args)

	def test_the_cashier_report_keeps_to_the_tills_of_the_user(self):
		from pos_next.pos_next.report.cashier_performance_report import cashier_performance_report as report

		sale = self.pay()["name"]
		owner = frappe.db.get_value("Sales Invoice", sale, "owner")
		keep_to(KEPT, "POS Profile", self.fx.other_profile)

		self.assertIn(owner, {row.cashier for row in report.get_data(frappe._dict())})
		self.assertNotIn(owner, {row.cashier for row in self.rows_of(KEPT, report.get_data, frappe._dict())})

	def test_the_inventory_report_keeps_to_the_tills_of_the_user(self):
		from pos_next.pos_next.report.inventory_impact_and_fast_movers_report import (
			inventory_impact_and_fast_movers_report as report,
		)

		self.pay()
		keep_to(KEPT, "POS Profile", self.fx.other_profile)
		sold = {row.item_code for row in report.get_data(frappe._dict()) if flt(row.qty_sold)}
		kept = {
			row.item_code for row in self.rows_of(KEPT, report.get_data, frappe._dict()) if flt(row.qty_sold)
		}
		self.assertIn(self.fx.item, sold)
		self.assertNotIn(self.fx.item, kept)

	def test_the_chart_helpers_keep_to_the_tills_of_the_user(self):
		from pos_next.pos_next.report.sales_vs_shifts_report import sales_vs_shifts_report as report

		self.pay()
		keep_to(KEPT, "POS Profile", self.fx.other_profile)
		def total(rows):
			return sum(flt(row.get("total_sales") or row.get("total_amount")) for row in rows)

		filters = json.dumps({"pos_profile": self.fx.profile})
		charts = (report.get_hourly_breakdown, report.get_payment_method_breakdown, report.get_daily_trend)
		with patch("frappe.desk.query_report.get_report_doc"):
			for call in charts:
				with self.subTest(call=call.__name__):
					self.assertGreater(total(call(filters)), 0)
					self.assertEqual(total(self.rows_of(KEPT, call, filters)), 0)

	def test_no_user_permission_adds_no_condition(self):
		from pos_next.pos_next.report import user_permission_scope as scope

		filters = frappe._dict()
		self.assertEqual(scope.conditions("si", filters), [])
		self.assertEqual(filters, {})

	def test_the_company_counts_as_well(self):
		from pos_next.pos_next.report import user_permission_scope as scope

		filters = frappe._dict()
		with patch.object(
			scope,
			"get_permitted_documents",
			side_effect=lambda doctype: ["_Test Co"] if doctype == "Company" else [],
		):
			conditions = scope.conditions("si", filters)
		self.assertEqual(conditions, ["si.company IN %(permitted_company)s"])
		self.assertEqual(filters["permitted_company"], ("_Test Co",))


class TestSmallAnswers(TillCase):
	"""Findings 33 and 38: an answer carries what its caller uses."""

	def test_the_csrf_answer_carries_no_session_id(self):
		answer = self.as_user(TILL, utilities.get_csrf_token)
		self.assertNotIn("session_id", answer)
		self.assertIn("csrf_token", answer)

	def test_a_shift_carries_what_the_till_reads_of_its_company(self):
		frappe.db.set_value("Company", self.fx.company, "registration_details", "Not the cashier's")
		self.open_the_shift()
		company = self.as_user(TILL, shifts.check_opening_shift)["company"]
		self.assertEqual(company["name"], self.fx.company)
		self.assertEqual(company["default_currency"], self.fx.currency)
		self.assertNotIn("registration_details", company)
		self.assertNotIn("credit_limit", company)

	def test_the_opening_of_a_shift_as_well(self):
		opened = self.as_user(
			TILL,
			shifts.create_opening_shift,
			self.fx.profile,
			self.fx.company,
			json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
		)
		self.assertEqual(opened["company"]["default_currency"], self.fx.currency)
		self.assertNotIn("credit_limit", opened["company"])

	def test_the_data_of_a_till_as_well(self):
		data = self.as_user(TILL, pos_profile.get_pos_profile_data, self.fx.profile)
		self.assertEqual(data["company"]["name"], self.fx.company)
		self.assertNotIn("credit_limit", data["company"])


class TestTheLimitsOfAnAddress(takeaway_case.TakeawayCase):
	"""Findings 11, 12 and 32: a limit counts the address nginx accepted, not the one the caller writes."""

	METHOD = "pos_next.api.guest_ordering.create_takeaway_token"

	def forget(self, peer):
		frappe.cache.delete_value(f"rl:{self.METHOD}:{peer}")

	def test_a_new_first_entry_of_the_header_is_no_new_visitor(self):
		peer = "203.0.113.200"
		self.forget(peer)
		self.addCleanup(self.forget, peer)
		frappe.set_user("Guest")
		with patch.dict(frappe.local.form_dict, {"cmd": self.METHOD}):
			for attempt in range(guest_ordering.TAKEAWAY_SESSIONS_PER_VISITOR):
				with a_web_request(f"198.51.100.{attempt}, {peer}"):
					self.assertTrue(guest_ordering.create_takeaway_token()["token"])
			with a_web_request(f"198.51.100.250, {peer}"), self.assertRaises(frappe.RateLimitExceededError):
				guest_ordering.create_takeaway_token()

	def test_the_visitors_of_the_address_are_counted_alone(self):
		peers = ("203.0.113.201", "203.0.113.202")
		for peer in peers:
			self.forget(peer)
			self.addCleanup(self.forget, peer)
		frappe.set_user("Guest")
		with patch.dict(frappe.local.form_dict, {"cmd": self.METHOD}):
			for _attempt in range(guest_ordering.TAKEAWAY_SESSIONS_PER_VISITOR):
				with a_web_request(f"198.51.100.1, {peers[0]}"):
					guest_ordering.create_takeaway_token()
			with a_web_request(f"198.51.100.1, {peers[1]}"):
				self.assertTrue(guest_ordering.create_takeaway_token()["token"])

	def test_the_public_menu_counts_the_same_way(self):
		from pos_next.api import public_menu

		peer = "203.0.113.204"
		key = f"rl:pos_next.api.public_menu.get_public_menu:{peer}"
		frappe.cache.delete_value(key)
		self.addCleanup(frappe.cache.delete_value, key)
		with patch.object(public_menu, "RATE_LIMIT", 1):
			with a_web_request(f"198.51.100.1, {peer}"), self.assertRaises(frappe.DoesNotExistError):
				public_menu.get_public_menu("no such restaurant")
			with a_web_request(f"198.51.100.2, {peer}"), self.assertRaises(frappe.RateLimitExceededError):
				public_menu.get_public_menu("no such restaurant")

	def test_a_request_with_no_header_counts_as_its_own_address(self):
		from pos_next.rate_limits import rate_limit_by_peer

		calls = []

		@rate_limit_by_peer(limit=2, seconds=30)
		def probe():
			calls.append(1)

		key = f"rl:{probe.__module__}.probe:203.0.113.203"
		frappe.cache.delete_value(key)
		self.addCleanup(frappe.cache.delete_value, key)
		with a_web_request():
			frappe.local.request_ip = "203.0.113.203"
			probe()
			probe()
			with self.assertRaises(frappe.RateLimitExceededError):
				probe()
		self.assertEqual(len(calls), 2)

	def test_a_call_inside_the_server_counts_nothing(self):
		from pos_next.rate_limits import rate_limit_by_peer

		@rate_limit_by_peer(limit=1, seconds=30)
		def probe():
			return "done"

		self.assertEqual([probe(), probe()], ["done", "done"])

	def test_each_door_that_costs_work_has_its_limit(self):
		for path in (
			f"{API}.guest_ordering.get_guest_menu",
			f"{API}.guest_ordering.submit_guest_order",
			f"{API}.guest_ordering.get_guest_receipt_pdf",
			f"{API}.guest_ordering.create_guest_payment",
			f"{API}.guest_ordering.create_takeaway_token",
			f"{API}.shop_scan.start_shop_session",
			f"{API}.shop_scan.pay_shop_cart",
			f"{API}.shop_scan.scan_item",
			f"{API}.shop_scan.set_line_qty",
			f"{API}.public_menu.get_public_menu",
			f"{API}.auth.verify_session_password",
		):
			with self.subTest(path=path):
				self.assertTrue(getattr(frappe.get_attr(path), "peer_limit", None))


class TestAWriteTakesAPost(FrappeTestCase):
	"""Finding 13: a write that commits answers no link followed from another site."""

	def test_each_of_them_takes_a_post_alone(self):
		for path in (
			"restaurant.reset_all_tables",
			"restaurant.save_table_positions",
			"restaurant.save_station_positions",
			"restaurant.save_floor_plan_walls",
			"restaurant.save_floor_plan_bg",
			"restaurant.reorder_areas",
			"restaurant.update_takeaway_status",
			"restaurant.update_item_details",
			"restaurant.update_item_price",
			"restaurant.update_item_active",
			"restaurant.update_item_badges",
			"product_management.save_product",
			"localization.change_user_language",
			"invoices.update_invoice",
			"menu_pdf.save_card_design",
			"promotions.apply_referral_code",
		):
			with self.subTest(path=path):
				method = frappe.get_attr(f"{API}.{path}")
				self.assertEqual(tuple(frappe.allowed_http_methods_for_whitelisted_func[method]), ("POST",))


class TestTheRestaurantsOfAUser(service_case.ServiceCase):
	"""Findings 15, 16 and 17: a user kept to a restaurant reads and cancels nothing of another."""

	def setUp(self):
		super().setUp()
		_user(KEPT, [CASHIER_ROLE, "Restaurant Manager"], "System User")
		_user(OTHER_CASHIER, [CASHIER_ROLE], "System User")
		_user(DESK, ["Blogger"], "System User")

	def keep(self, restaurant_name):
		keep_to(KEPT, "Restaurant", restaurant_name)

	def as_user(self, user, method, *args, **kwargs):
		frappe.set_user(user)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def test_the_kitchen_of_another_restaurant_is_refused(self):
		self.keep(self.b)
		for call in (restaurant.get_kds_orders, restaurant.get_runner_orders, restaurant.get_takeaway_orders):
			with self.subTest(call=call.__name__), self.assertRaises(frappe.PermissionError):
				self.as_user(KEPT, call, restaurant=self.a)

	def test_a_user_reads_the_kitchen_he_is_kept_to(self):
		self.keep(self.b)
		for call in (restaurant.get_kds_orders, restaurant.get_runner_orders, restaurant.get_takeaway_orders):
			with self.subTest(call=call.__name__):
				self.assertIsNotNone(self.as_user(KEPT, call, restaurant=self.b))

	def test_a_kitchen_account_of_no_till_still_reads_the_kitchen(self):
		for call in (restaurant.get_kds_orders, restaurant.get_runner_orders, restaurant.get_takeaway_orders):
			with self.subTest(call=call.__name__):
				self.assertIsNotNone(self.as_user(DESK, call))

	def test_the_reservations_of_another_restaurant_are_refused(self):
		self.keep(self.b)
		today = nowdate()
		for call, args, kwargs in (
			(reservations.get_reservations, (), {"restaurant": self.a}),
			(reservations.get_reservation_stats, (today, today), {"restaurant": self.a}),
			(
				reservations.check_table_availability,
				(json.dumps([self.table_a]), today, "20:00:00", 5400),
				{},
			),
		):
			with self.subTest(call=call.__name__), self.assertRaises(frappe.PermissionError):
				self.as_user(KEPT, call, *args, **kwargs)

	def test_a_user_reads_the_reservations_he_is_kept_to(self):
		self.keep(self.b)
		today = nowdate()
		self.assertEqual(self.as_user(KEPT, reservations.get_reservations, restaurant=self.b), [])
		self.as_user(KEPT, reservations.get_reservation_stats, today, today, restaurant=self.b)
		answer = self.as_user(
			KEPT, reservations.check_table_availability, json.dumps([self.table_b]), today, "20:00:00", 5400
		)
		self.assertTrue(answer["available"])

	def test_a_cashier_with_no_user_permission_reads_them(self):
		self.assertEqual(self.as_user(OTHER_CASHIER, reservations.get_reservations, restaurant=self.a), [])

	def test_the_configuration_of_another_restaurant_is_refused(self):
		self.keep(self.b)
		for call in (
			restaurant.get_station_items_map,
			restaurant.get_active_menus,
			restaurant.get_active_cards,
		):
			with self.subTest(call=call.__name__), self.assertRaises(frappe.PermissionError):
				self.as_user(KEPT, call, restaurant=self.a)

	def test_a_user_kept_to_a_restaurant_reads_its_configuration(self):
		self.keep(self.b)
		for call in (
			restaurant.get_station_items_map,
			restaurant.get_active_menus,
			restaurant.get_active_cards,
		):
			with self.subTest(call=call.__name__):
				self.assertIsNotNone(self.as_user(KEPT, call, restaurant=self.b))

	def an_order_with_no_money_on_it(self):
		order = self.save([self.line(self.cola)])
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 0)
		return order

	def test_the_order_of_another_restaurant_is_not_cancelled(self):
		order = self.an_order_with_no_money_on_it()
		self.keep(self.b)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(KEPT, restaurant.cancel_table_order, order)
		self.assertTrue(frappe.db.exists("Sales Invoice", order))

	def test_the_waiter_cancels_the_order_of_his_restaurant(self):
		order = self.an_order_with_no_money_on_it()
		self.keep(self.a)
		answer = self.as_user(KEPT, restaurant.cancel_table_order, order)
		self.assertEqual(answer["status"], "success")
		self.assertFalse(frappe.db.exists("Sales Invoice", order))


class TestThePublicBookingForm(service_case.ServiceCase):
	"""Finding 36: the form says nothing of an address before it has a time it offers."""

	ADDRESS = "audit-n1-booked@yopmail.com"

	def setUp(self):
		super().setUp()
		frappe.db.set_value("Restaurant", self.a, {"enable_reservations": 1, "enable_online_reservations": 1})
		frappe.clear_document_cache("Restaurant")

	def ask(self, address, time="20:17:03"):
		frappe.set_user("Guest")
		try:
			with (
				patch.object(reservations, "_count_the_visitor"),
				patch.object(reservations, "_send_verification_email"),
				patch.object(reservations, "_count_the_mail"),
			):
				return reservations.submit_guest_reservation(
					add_days(nowdate(), 1), time, 2, "Somebody", "0790000000", address, restaurant=self.a
				)
		finally:
			frappe.set_user("Administrator")

	def test_a_time_the_page_does_not_offer_tells_nothing_of_the_address(self):
		for offset in range(3):
			frappe.get_doc(
				{
					"doctype": "Restaurant Reservation",
					"restaurant": self.a,
					"status": "Confirmed",
					"reservation_date": add_days(nowdate(), offset + 2),
					"reservation_time": "20:00:00",
					"duration": 5400,
					"no_of_guests": 2,
					"guest_name": "Somebody",
					"email": self.ADDRESS,
				}
			).insert(ignore_permissions=True)

		answers = []
		for address in (self.ADDRESS, "audit-n1-nobody@yopmail.com"):
			with self.assertRaises(frappe.ValidationError) as refused:
				self.ask(address)
			answers.append((type(refused.exception), str(refused.exception)))

		self.assertEqual(answers[0], answers[1])
