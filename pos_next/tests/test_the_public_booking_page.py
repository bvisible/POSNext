# //// Neoffice — added file (no upstream equivalent).
"""The public booking page (/pos/reservation): what a visitor learns, asks and leaves behind (NeoRestau lot 1, task 18).

1. A visitor learns which tables are free for a time the page offers, for the restaurant's own duration, and nothing of
   the guests who hold the others: no name, phone, address, remark, booking nor time. A staff account sees who holds
   them, as it always did, at any time.
2. The form mails an address nobody has confirmed yet. It takes one plain address and a name that is only a name, so
   many bookings per visitor (the connection nginx accepted, never an address the visitor writes), per mailbox and per
   site, the last two counted only for a booking that was written; a booking that fills the field only a script fills
   is answered like any other and leaves nothing; the mail says only what the restaurant says; the booking lasts the
   restaurant's duration. A refused booking writes nothing and mails nothing.
3. A booking its guest never confirms from the e-mail holds its tables until the restaurant's deadline only: then it
   frees them at once, the job marks it Expired, it is never a no-show nor reminded, it leaves the till's list, the
   workspace and the statistics, and a confirmation that comes too late does not revive it. Whatever the till does to
   it vouches for it.
4. Every argument of the guest calls is a string where a string is expected: a list or a dict, which Frappe would read as
   a filter, is refused before anything is looked up; the confirmation link is counted per visitor and answers one
   sentence for every link that confirms nothing.

A visitor's call goes through Frappe's own request path (`through_the_web`): the HTTP request with its headers and its
JSON body or query string, Frappe's `make_form_dict` and `HTTPRequest.set_request_ip`, `frappe.api.handle` (route,
whitelist, guest sanitising, HTTP method, argument types) and `frappe.app.handle_exception` for a refusal, whose writes
are rolled back as `frappe.app.application` does. Only the session and the database are the test's own.

The suite relies on no restaurant of the site: a fresh CI site has none, the clone of a working site holds real ones and
real bookings. Every test builds its restaurant (open every day from 11:00 to 23:00), room and tables, nothing commits
(the commit is switched off and each test rolls back), no mail leaves (`frappe.sendmail` is a mock), and the limit
counters it touches in Redis are deleted before and after it. The form's limits are out of reach unless a test sets the
one it is about.
"""

import json
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

import frappe
import frappe.api
import frappe.realtime
from frappe.app import handle_exception, make_form_dict
from frappe.auth import HTTPRequest
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_datetime, getdate, now_datetime, nowdate, set_request

from pos_next.api import reservations
from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import check_overlap
from pos_next.restaurant.neorestau import reservation_views
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _user

API = "pos_next.api.reservations."
SUBMIT = API + "submit_guest_reservation"
TABLES = API + "get_available_tables"
SLOTS = API + "get_available_slots"
VERIFY = API + "verify_reservation"

RESTAURANT = "_Test Booking Restaurant"
ROOM = "_Test Booking Room"
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
OPENS, CLOSES = "11:00:00", "23:00:00"
NEXT_WEEK = add_days(nowdate(), 7)
AT = "20:00:00"
GUEST = "_Test Booking Guest"
ADDRESS = "test-booking-guest@yopmail.com"
PHONE = "0790000000"
# Another guest, whose booking a visitor must learn nothing of
OTHER_GUEST = "_Test Booking Other Guest"
OTHER_ADDRESS = "test-booking-other-guest@yopmail.com"
OTHER_PHONE = "0791112233"
OTHER_REMARK = "_Test booking remark: nut allergy"
OTHER_AT = "19:30:00"
VISITOR = "203.0.113.10"
VISITOR_FIELDS = {"name", "table_name", "capacity", "available"}
PORTAL_USER = "test-booking-portal@yopmail.com"
CASHIER = "test-booking-cashier@yopmail.com"
UNKNOWN_TOKEN = "_Test unknown booking token"
# The Redis namespace of the form's counters (reservations.LIMIT_KEY), emptied around each test
LIMIT_KEY = "pos_next:guest_reservation_limit:"
# Every limit of the guest calls, out of reach: a test sets the one it is about
NO_LIMITS = {
	kind: [1000, 86400]
	for kind in (
		"ip_minute",
		"ip_hour",
		"ip_day",
		"address_hour",
		"address_day",
		"site_hour",
		"site_day",
		"verify_minute",
		"verify_day",
	)
}


def forget_the_counters():
	frappe.cache.delete_keys(LIMIT_KEY)


def through_the_web(http_method, method, body=None, query=None, forwarded_for=None, user="Guest"):
	"""A call as Frappe serves it over HTTP; returns (HTTP status, answer as JSON).

	The request carries `forwarded_for` in X-Forwarded-For, as nginx passes it on (none: a request that came without
	the header, from 127.0.0.1), and a JSON body or a query string. Frappe reads it with its own make_form_dict and
	HTTPRequest.set_request_ip, frappe.api.handle routes and calls the method (whitelist, guest sanitising, HTTP method,
	argument types), and a refusal becomes its HTTP answer through frappe.app.handle_exception, its writes rolled back
	as frappe.app.application does. The session and the database are the test's own; frappe.local is put back.
	"""
	missing = object()
	kept = {
		name: getattr(frappe.local, name, missing)
		for name in ("request", "request_ip", "form_dict", "response", "message_log")
	}
	user_before = frappe.session.user
	set_request(
		method=http_method,
		path=f"/api/method/{method}",
		query_string=query,
		data=json.dumps(body) if body is not None else None,
		content_type="application/json" if body is not None else None,
		headers={"X-Forwarded-For": forwarded_for} if forwarded_for else {},
		environ_base={"REMOTE_ADDR": "127.0.0.1"},
	)
	try:
		frappe.set_user(user)
		# frappe/auth.py: the first X-Forwarded-For entry, as on a live request (the method uses no instance)
		HTTPRequest.set_request_ip(None)
		make_form_dict(frappe.local.request)
		frappe.local.response = frappe._dict({"docs": []})
		frappe.local.message_log = []
		frappe.db.savepoint("web_request")
		try:
			response = frappe.api.handle(frappe.local.request)
		except Exception as error:
			frappe.db.rollback(save_point="web_request")
			response = handle_exception(error)
		return response.status_code, json.loads(response.get_data(as_text=True) or "{}")
	finally:
		frappe.set_user(user_before)
		for name, value in kept.items():
			if value is not missing:
				setattr(frappe.local, name, value)
				continue
			try:
				delattr(frappe.local, name)
			except AttributeError:
				pass


def messages_of(answer):
	return [json.loads(entry).get("message") for entry in json.loads(answer.get("_server_messages") or "[]")]


def refusal_of(status, answer):
	"""What a refused call tells: its HTTP status, the kind of refusal and its sentences (never a traceback)."""
	return status, answer.get("exc_type"), messages_of(answer)


@contextmanager
def a_call_made_inside_the_server():
	"""No HTTP request is bound (a console, a job): what frappe.local held before is put back afterwards."""
	missing = object()
	before = getattr(frappe.local, "request", missing)
	frappe.local.request = None
	try:
		yield
	finally:
		if before is missing:
			del frappe.local.request
		else:
			frappe.local.request = before


class OnlineBooking:
	"""A restaurant that takes bookings online (no manager's validation), open every day from 11:00 to 23:00, with a
	room and two tables."""

	def setUp(self):
		super().setUp()
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		for patcher in (
			# The jobs commit: nothing of a test may stay
			patch.object(frappe.db, "commit"),
			# The guest entry points refuse to start anything where the site does not run NeoRestau (task 4), and the
			# site's own flag is not the test's to know; the limits are out of reach unless a test sets one
			patch.dict(frappe.conf, {"neorestau_active": 1, "guest_reservation_limits": dict(NO_LIMITS)}),
		):
			patcher.start()
			self.addCleanup(patcher.stop)
		mail = patch.object(frappe, "sendmail")
		self.sendmail = mail.start()
		self.addCleanup(mail.stop)
		forget_the_counters()
		self.addCleanup(forget_the_counters)

		self.restaurant = (
			frappe.get_doc(
				{
					"doctype": "Restaurant",
					"restaurant_name": RESTAURANT,
					"company": company[0],
					"enable_reservations": 1,
					"enable_online_reservations": 1,
					"opening_hours": [
						{"day_of_week": day, "from_time": OPENS, "to_time": CLOSES, "label": "_Test service"}
						for day in DAYS
					],
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		self.room = (
			frappe.get_doc({"doctype": "Restaurant Area", "restaurant": self.restaurant, "area_name": ROOM})
			.insert(ignore_permissions=True)
			.name
		)
		self.table = self.make_table("_Test Booking T1", capacity=2)
		self.other_table = self.make_table("_Test Booking T2", capacity=4)

	def make_table(self, label, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Table",
				"restaurant": self.restaurant,
				"area": self.room,
				"table_name": label,
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def make_reservation(self, tables=(), **values):
		"""A booking taken at the till."""
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Reservation",
				"restaurant": self.restaurant,
				"status": "Confirmed",
				"reservation_date": NEXT_WEEK,
				"reservation_time": AT,
				"duration": 5400,
				"no_of_guests": 2,
				"guest_name": OTHER_GUEST,
				"tables": [{"restaurant_table": table} for table in tables],
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def booking(self, **values):
		"""What the page sends for a booking, with `values` in place of its defaults."""
		return {
			"reservation_date": NEXT_WEEK,
			"reservation_time": AT,
			"no_of_guests": 2,
			"guest_name": GUEST,
			"phone": PHONE,
			"email": ADDRESS,
			"tables": "[]",
			"notes": "",
			"restaurant": self.restaurant,
			"subject": "",
			**values,
		}

	def web(self, http_method, method, body=None, query=None, ip=VISITOR, user="Guest"):
		return through_the_web(http_method, method, body=body, query=query, forwarded_for=ip, user=user)

	def book(self, ip=VISITOR, expect=200, **values):
		"""A visitor books on the public form, from `ip` (what X-Forwarded-For carries); the answer, as JSON."""
		status, answer = self.web("POST", SUBMIT, body=self.booking(**values), ip=ip)
		self.assertEqual(status, expect, answer)
		return answer

	def refused_booking(self, ip=VISITOR, **values):
		"""A booking the form refuses: what it tells, after checking it wrote nothing and mailed nothing."""
		before = self.bookings()
		self.sendmail.reset_mock()
		status, answer = self.web("POST", SUBMIT, body=self.booking(**values), ip=ip)
		self.assertNotEqual(status, 200, answer)
		self.sendmail.assert_not_called()
		self.assertEqual(self.bookings(), before)
		return refusal_of(status, answer)

	def verify(self, token, ip=VISITOR):
		return self.web("POST", VERIFY, body={"token": token}, ip=ip)

	def limit(self, **kinds):
		"""The limits for this test: those named (count, window in seconds), every other one out of reach."""
		frappe.conf["guest_reservation_limits"] = {**NO_LIMITS, **kinds}

	def set_restaurant(self, **values):
		frappe.db.set_value("Restaurant", self.restaurant, values)
		frappe.clear_document_cache("Restaurant")

	def set_hours(self, day, opens, closes):
		doc = frappe.get_doc("Restaurant", self.restaurant)
		doc.opening_hours = [row for row in doc.opening_hours if row.day_of_week != day]
		doc.append(
			"opening_hours", {"day_of_week": day, "from_time": opens, "to_time": closes, "label": "_Test"}
		)
		doc.save(ignore_permissions=True)
		frappe.clear_document_cache("Restaurant")

	def booking_of(self, address=ADDRESS):
		"""The newest booking of the restaurant for `address`."""
		return frappe.db.get_value(
			"Restaurant Reservation",
			{"restaurant": self.restaurant, "email": address.lower()},
			"name",
			order_by="creation desc",
		)

	def reservation(self, name):
		return frappe.get_doc("Restaurant Reservation", name)

	def status(self, name):
		return frappe.db.get_value("Restaurant Reservation", name, "status")

	def bookings(self):
		return frappe.db.count("Restaurant Reservation", {"restaurant": self.restaurant})

	def unverified_bookings_of_the_site(self):
		return frappe.db.count("Restaurant Reservation", {"verified": 0, "verification_token": ["is", "set"]})

	def mailed_to(self, address):
		return [call for call in self.sendmail.call_args_list if call.kwargs.get("recipients") == [address]]

	def past_its_deadline(self, name):
		"""The deadline of an online booking, a minute ago: its guest did not confirm it in time."""
		frappe.db.set_value(
			"Restaurant Reservation", name, "verification_deadline", now_datetime() - timedelta(minutes=1)
		)


class TestAVisitorLearnsWhichTablesAreFreeAndNothingElse(OnlineBooking, FrappeTestCase):
	def setUp(self):
		super().setUp()
		# Another guest holds the first table from 19:30, for the restaurant's 1 h 30: the 20:00 slot overlaps him
		self.other_booking = self.make_reservation(
			[self.table],
			reservation_time=OTHER_AT,
			phone=OTHER_PHONE,
			email=OTHER_ADDRESS,
			notes=OTHER_REMARK,
		)

	def tables_seen_by(self, user, at=AT, **arguments):
		query = {"date": NEXT_WEEK, "time": at, "restaurant": self.restaurant, **arguments}
		status, answer = self.web("GET", TABLES, query=query, user=user)
		self.assertEqual(status, 200, answer)
		return answer["message"]["tables"]

	def test_a_visitor_sees_which_tables_are_free_and_nothing_of_the_guests(self):
		_user(PORTAL_USER, [], "Website User")
		for user in ("Guest", PORTAL_USER):
			with self.subTest(user=user):
				tables = self.tables_seen_by(user)
				self.assertEqual(
					{table["name"]: table["available"] for table in tables},
					{self.table: False, self.other_table: True},
				)
				self.assertEqual([set(table) for table in tables], [VISITOR_FIELDS, VISITOR_FIELDS])
				answer = frappe.as_json(tables)
				for secret in (
					OTHER_GUEST,
					self.other_booking,
					OTHER_PHONE,
					OTHER_ADDRESS,
					OTHER_REMARK,
					"19:30",
				):
					self.assertNotIn(secret, answer)

	def test_a_staff_account_sees_who_holds_a_table_as_before(self):
		_user(CASHIER, [CASHIER_ROLE], "System User")
		for user in ("Administrator", CASHIER):
			with self.subTest(user=user):
				held = next(table for table in self.tables_seen_by(user) if table["name"] == self.table)
				self.assertFalse(held["available"])
				self.assertEqual(
					[(c["reservation"], c["guest_name"], c["time"]) for c in held["conflicts"]],
					[(self.other_booking, OTHER_GUEST, OTHER_AT)],
				)
				self.assertEqual((held["area_name"], held["restaurant"]), (ROOM, self.restaurant))

	def test_a_visitor_asks_about_the_slot_a_booking_takes_not_any_window(self):
		# From 17:00 the restaurant's 1 h 30 ends before the other guest comes at 19:30; four hours would reach him
		seen = {
			user: next(
				t for t in self.tables_seen_by(user, "17:00:00", duration=4 * 3600) if t["name"] == self.table
			)
			for user in ("Guest", "Administrator")
		}
		self.assertTrue(seen["Guest"]["available"])
		self.assertFalse(seen["Administrator"]["available"])

	def test_a_visitor_asks_only_about_the_times_the_page_offers(self):
		# The page offers the half hours from the opening to the closing of the day's window, both included
		for at, offered in (
			("11:00:00", True),
			("20:00:00", True),
			("23:00:00", True),
			("20:15:00", False),
			("19:59:59", False),
			("10:30:00", False),
			("23:30:00", False),
		):
			with self.subTest(time=at):
				query = {"date": NEXT_WEEK, "time": at, "restaurant": self.restaurant}
				status, answer = self.web("GET", TABLES, query=query)
				self.assertEqual(status == 200, offered, answer)
				if not offered:
					self.assertNotIn("message", answer)
		# A staff account asks about any time, as it always did
		self.assertTrue(self.tables_seen_by("Administrator", "20:15:00"))

	def test_the_half_hours_count_from_each_windows_own_start(self):
		self.set_hours(getdate(NEXT_WEEK).strftime("%A"), "11:45:00", "14:00:00")
		for at, offered in (
			("11:45:00", True),
			("12:15:00", True),
			("13:45:00", True),
			("12:00:00", False),
			("14:00:00", False),
		):
			with self.subTest(time=at):
				query = {"date": NEXT_WEEK, "time": at, "restaurant": self.restaurant}
				status, answer = self.web("GET", TABLES, query=query)
				self.assertEqual(status == 200, offered, answer)

	def test_a_booking_at_a_time_the_page_does_not_offer_tells_nothing_of_the_tables(self):
		# The other guest holds the first table from 19:30: a booking asked a second at a time would draw his booking
		offered_only = [frappe._("Please choose one of the times offered for this day")]
		for at in ("19:31:00", "19:59:59"):
			with self.subTest(time=at):
				refused = self.refused_booking(reservation_time=at, tables=json.dumps([self.table]))
				self.assertEqual(refused[2], offered_only)
		# Nor is a booking without any table taken at such a time
		self.assertEqual(self.refused_booking(reservation_time="20:15:00")[2], offered_only)
		# A time the page offers is a booking
		self.book(reservation_time="20:30:00", tables=json.dumps([self.other_table]))

	def test_a_desk_account_that_tries_the_page_books_at_any_time_as_it_asks_at_any_time(self):
		# Guard (green before and after): the grid holds a visitor, not the restaurant's own staff
		status, answer = self.web(
			"POST", SUBMIT, body=self.booking(reservation_time="20:15:00"), user="Administrator"
		)
		self.assertEqual(status, 200, answer)
		self.assertEqual(str(self.reservation(self.booking_of()).reservation_time), "20:15:00")


class TestAGuestCallTakesStringsNotFilters(OnlineBooking, FrappeTestCase):
	"""A JSON body keeps its types, and Frappe reads a list or a dict given as a filter value as an operator and a value:
	a guest call refuses them where it expects a string, before anything is looked up."""

	def setUp(self):
		super().setUp()
		# A booking nobody has confirmed: what a filter in place of a token would confirm
		self.book()
		self.waiting = self.booking_of()

	def test_a_list_a_dict_or_an_empty_token_confirms_nothing(self):
		before = self.unverified_bookings_of_the_site()
		self.sendmail.reset_mock()
		# A filter that a script would narrow letter by letter: here, the first letters of the waiting booking's token
		begins = self.reservation(self.waiting).verification_token[:8] + "%"
		for token in (["like", begins], {"like": begins}, ["is", "set"], "", "   "):
			with self.subTest(token=token):
				status, answer = self.verify(token)
				self.assertNotEqual(status, 200, answer)
				self.assertNotIn("message", answer)
		self.assertEqual(self.unverified_bookings_of_the_site(), before)
		self.assertEqual(self.reservation(self.waiting).verified, 0)
		self.sendmail.assert_not_called()
		self.assertFalse(frappe.db.exists("Customer", {"email_id": ADDRESS}))

	def test_a_link_that_confirms_nothing_says_the_same_whatever_the_reason(self):
		token = self.reservation(self.waiting).verification_token
		self.past_its_deadline(self.waiting)
		unknown = refusal_of(*self.verify(UNKNOWN_TOKEN))
		expired = refusal_of(*self.verify(token))
		empty = refusal_of(*self.verify(""))
		self.assertNotEqual(unknown[0], 200)
		self.assertEqual(expired, unknown)
		self.assertEqual(empty, unknown)

	def test_a_visitor_cannot_try_link_after_link(self):
		self.limit(verify_minute=[2, 86400])
		for _ in range(2):
			self.assertEqual(self.verify(UNKNOWN_TOKEN)[0], 417)
		status, answer = self.verify(UNKNOWN_TOKEN)
		self.assertEqual(status, 429, answer)
		# Another visitor is not refused, and the guest's own link still confirms his booking
		self.assertEqual(self.verify(UNKNOWN_TOKEN, ip="203.0.113.77")[0], 417)
		token = self.reservation(self.waiting).verification_token
		self.assertEqual(self.verify(token, ip="203.0.113.78")[0], 200)
		self.assertEqual(self.reservation(self.waiting).verified, 1)

	def test_a_restaurant_is_named_by_its_name_only(self):
		named_by_a_filter = {"restaurant_name": RESTAURANT}
		before = self.bookings()
		for http_method, method, body in (
			("POST", SLOTS, {"date": NEXT_WEEK, "restaurant": named_by_a_filter}),
			("POST", TABLES, {"date": NEXT_WEEK, "time": AT, "restaurant": named_by_a_filter}),
			("POST", SUBMIT, self.booking(email=OTHER_ADDRESS, restaurant=named_by_a_filter)),
		):
			with self.subTest(method=method):
				status, answer = self.web(http_method, method, body=body)
				self.assertNotEqual(status, 200, answer)
				self.assertNotIn("message", answer)
		self.assertEqual(self.bookings(), before)
		self.assertEqual(self.mailed_to(OTHER_ADDRESS), [])

	def test_the_tables_are_a_list_of_table_names_and_nothing_else(self):
		# `tables` is a JSON string, decoded into whatever it holds: an element Frappe's link validation would read as
		# filters, an element that cannot be hashed, a number, a list too long, or no JSON at all
		before = self.bookings()
		for tables in (
			json.dumps([{"name": ["like", "%"]}]),
			json.dumps([["like", "%"]]),
			json.dumps([5]),
			json.dumps([""]),
			json.dumps({"name": self.table}),
			json.dumps([f"_Test table {n}" for n in range(21)]),
			"[not json",
		):
			with self.subTest(tables=tables[:40]):
				status, answer = self.web(
					"POST", SUBMIT, body=self.booking(email=OTHER_ADDRESS, tables=tables)
				)
				self.assertEqual(status, 417, answer)
		self.assertEqual(self.bookings(), before)
		self.assertEqual(self.mailed_to(OTHER_ADDRESS), [])
		# A list of the restaurant's own tables is a booking
		self.book(email=OTHER_ADDRESS, tables=json.dumps([self.table, self.other_table]))
		taken = self.reservation(self.booking_of(OTHER_ADDRESS))
		self.assertEqual([row.restaurant_table for row in taken.tables], [self.table, self.other_table])

	def test_the_number_of_guests_is_a_number(self):
		for typed in ("abc", "2.5", ""):
			with self.subTest(no_of_guests=typed):
				self.assertEqual(self.refused_booking(email=OTHER_ADDRESS, no_of_guests=typed)[0], 417)
		self.book(email=OTHER_ADDRESS, no_of_guests="3")
		self.assertEqual(self.reservation(self.booking_of(OTHER_ADDRESS)).no_of_guests, 3)


class TestTheVisitorIsTheConnectionNginxAccepted(OnlineBooking, FrappeTestCase):
	"""Bench's own vhost overwrites X-Forwarded-For with the peer; the vhost of a customer's website domain appends the
	peer to whatever the caller wrote. The last entry is the peer under both."""

	def test_a_first_entry_the_caller_wrote_is_not_a_new_visitor(self):
		self.limit(ip_minute=[1, 86400])
		self.book(ip="198.51.100.7, 203.0.113.10")
		refused = self.refused_booking(ip="198.51.100.8, 203.0.113.10", email=OTHER_ADDRESS)
		self.assertEqual(refused[0], 429)
		# Another connection is another visitor
		self.book(ip="198.51.100.8, 203.0.113.11", email="test-booking-third@yopmail.com")

	def test_a_value_that_is_no_address_is_no_visitor_of_its_own(self):
		self.limit(ip_minute=[1, 86400])
		self.book(ip="not-an-address")
		refused = self.refused_booking(ip="another-thing-entirely", email=OTHER_ADDRESS)
		self.assertEqual(refused[0], 429)

	def test_a_request_without_the_header_is_counted_by_its_connection(self):
		self.limit(ip_minute=[1, 86400])
		self.book(ip=None)
		self.assertEqual(self.refused_booking(ip=None, email=OTHER_ADDRESS)[0], 429)


class TestTheBookingFormIsNoMailRelay(OnlineBooking, FrappeTestCase):
	def test_a_booking_mails_its_guest_once(self):
		self.book()
		self.assertEqual(len(self.mailed_to(ADDRESS)), 1)
		self.assertEqual(self.sendmail.call_count, 1)

	def test_a_booking_refused_after_it_was_written_pings_no_till(self):
		# The site's budget is spent: the booking is written, refused, and rolled back
		self.limit(site_hour=[0, 86400])
		with patch.object(frappe.realtime, "emit_via_redis") as emitted:
			self.assertEqual(self.refused_booking()[0], 429)
		self.assertNotIn("reservation_update", [call.args[0] for call in emitted.call_args_list])

	def test_a_written_booking_tells_the_tills_once_it_is_committed(self):
		with patch.object(frappe.realtime, "emit_via_redis") as emitted:
			self.book()
		self.assertNotIn("reservation_update", [call.args[0] for call in emitted.call_args_list])
		# Frappe sends what waits for the commit when the request commits, and drops it when it rolls back
		queued = [entry[0] for entry in getattr(frappe.local, "_realtime_log", [])]
		self.assertIn("reservation_update", queued)

	def test_a_visitor_past_his_limit_is_refused_and_nothing_is_written_nor_mailed(self):
		self.limit(ip_minute=[2, 86400])
		for n in range(2):
			self.book(email=f"test-booking-{n}@yopmail.com")
		self.assertEqual(self.refused_booking(email="test-booking-2@yopmail.com")[0], 429)
		# Another visitor is not refused
		self.book(email="test-booking-3@yopmail.com", ip="203.0.113.11")
		self.assertEqual(len(self.mailed_to("test-booking-3@yopmail.com")), 1)

	def test_an_ipv6_visitor_is_counted_by_his_network(self):
		self.limit(ip_minute=[1, 86400])
		self.book(ip="2001:db8:1:2::10")
		self.assertEqual(self.refused_booking(email=OTHER_ADDRESS, ip="2001:db8:1:2:ffff::1")[0], 429)
		self.book(email=OTHER_ADDRESS, ip="2001:db8:1:3::10")

	def test_a_visitor_gets_three_bookings_a_minute_by_default(self):
		frappe.conf.pop("guest_reservation_limits")
		# One fixed instant: the minute cannot turn during the test
		with patch.object(reservations, "epoch_seconds", return_value=1_900_000_000.0):
			for n in range(3):
				self.book(email=f"test-booking-d{n}@yopmail.com")
			self.assertEqual(self.refused_booking(email="test-booking-d3@yopmail.com")[0], 429)

	def test_one_address_is_not_mailed_past_its_limit_whoever_asks(self):
		self.limit(address_hour=[2, 86400])
		for n, typed in enumerate((ADDRESS, ADDRESS.upper())):
			self.book(email=typed, ip=f"203.0.113.{20 + n}")
			# Cancelled, it is not one of the address's bookings to come: only the limit refuses the next one
			frappe.db.set_value("Restaurant Reservation", self.booking_of(), "status", "Cancelled")
		self.assertEqual(self.refused_booking(email=ADDRESS.title(), ip="203.0.113.30")[0], 429)

	def test_the_tags_of_one_mailbox_are_one_address(self):
		self.limit(address_hour=[1, 86400])
		self.book(email="test-booking-guest+one@yopmail.com", ip="203.0.113.31")
		refused = self.refused_booking(email="Test-Booking-Guest+Two@YOPMAIL.com", ip="203.0.113.32")
		self.assertEqual(refused[0], 429)

	def test_the_site_mails_no_more_than_its_budget_and_a_visitor_past_his_own_limit_spends_none_of_it(self):
		self.limit(ip_minute=[1, 86400], site_hour=[2, 86400])
		self.book(email="test-booking-a@yopmail.com", ip="203.0.113.40")
		# The same visitor again and again: refused on his own limit, which costs the site nothing
		for n in range(3):
			self.assertEqual(
				self.refused_booking(email=f"test-booking-x{n}@yopmail.com", ip="203.0.113.40")[0], 429
			)
		self.book(email="test-booking-b@yopmail.com", ip="203.0.113.41")
		# Two bookings spent the site's budget: the next one is refused, whoever asks
		self.assertEqual(self.refused_booking(email="test-booking-c@yopmail.com", ip="203.0.113.42")[0], 429)

	def test_a_booking_its_own_rules_refuse_spends_no_budget(self):
		self.limit(address_hour=[1, 86400], site_hour=[1, 86400])
		yesterday = add_days(nowdate(), -1)
		for ip, values in (
			("203.0.113.50", {"reservation_date": yesterday}),
			("203.0.113.51", {"reservation_time": "08:00:00"}),
		):
			with self.subTest(values=values):
				self.assertEqual(self.refused_booking(ip=ip, **values)[0], 417)
		# The address and the site still have the one booking they may be mailed
		self.book(ip="203.0.113.52")
		self.assertEqual(len(self.mailed_to(ADDRESS)), 1)

	def test_a_call_made_inside_the_server_is_no_visitor(self):
		# Frappe's own rate limiter lets such a call through as well
		self.limit(ip_minute=[0, 86400], address_hour=[0, 86400], site_hour=[0, 86400])
		frappe.set_user("Guest")
		with a_call_made_inside_the_server():
			for n in range(3):
				reservations.submit_guest_reservation(**self.booking(email=f"test-booking-s{n}@yopmail.com"))
		frappe.set_user("Administrator")
		self.assertEqual(self.sendmail.call_count, 3)

	def test_an_address_with_three_bookings_to_come_is_refused_in_the_words_of_the_limits(self):
		for n in range(3):
			self.book(ip=f"203.0.113.{60 + n}")
		too_many_bookings = self.refused_booking(ip="203.0.113.70")
		self.limit(ip_minute=[0, 86400])
		too_many_requests = self.refused_booking(email=OTHER_ADDRESS, ip="203.0.113.71")
		# The answer tells a stranger nothing about the bookings of an address
		self.assertEqual(too_many_bookings, too_many_requests)
		self.assertEqual(too_many_bookings[0], 429)

	def test_a_booking_that_fills_the_hidden_field_is_answered_like_any_and_leaves_nothing(self):
		self.limit(site_hour=[1, 86400])
		dropped = self.book(subject="Cheap offer, click here")
		self.sendmail.assert_not_called()
		self.assertEqual(self.bookings(), 0)
		self.assertFalse(frappe.db.exists("Customer", {"email_id": ADDRESS}))
		# It mailed nothing, so it spent nothing of the site's budget: the one booking the site may mail still goes
		taken = self.book(email=OTHER_ADDRESS)
		self.assertEqual(dropped, taken)
		self.assertEqual(self.bookings(), 1)
		# Neither names the booking: a script learns nothing from a number that counts the restaurant's bookings
		self.assertNotIn("name", taken["message"])

	def test_a_booking_names_one_plain_address(self):
		for typed in (
			"test-booking-a@yopmail.com, test-booking-b@yopmail.com",
			"test-booking-a@yopmail.com;test-booking-b@yopmail.com",
			"Jane <test-booking-a@yopmail.com>",
			"test-booking-a@yopmail.com test-booking-b@yopmail.com",
			"not an address",
			["test-booking-a@yopmail.com", "test-booking-b@yopmail.com"],
		):
			with self.subTest(email=typed):
				self.refused_booking(email=typed)
		self.assertEqual(self.bookings(), 0)

	def test_a_name_is_only_a_name(self):
		for typed in (
			"Visit https://example.com",
			"www.example.com",
			"<b>Jane</b>",
			"jane@yopmail.com",
			"J" * 81,
			" ",
		):
			with self.subTest(name=typed):
				self.refused_booking(guest_name=typed)
		# Accents, an apostrophe, a hyphen and a dot make a name; the spaces around and between words are tidied
		self.book(guest_name="  Zoë  O'Neill-Dupré  Jr. ")
		self.assertEqual(self.reservation(self.booking_of()).guest_name, "Zoë O'Neill-Dupré Jr.")

	def test_the_mail_to_an_unconfirmed_address_says_only_what_the_restaurant_says(self):
		self.book(guest_name="Jane Visitor Words", notes="Remark of the visitor", phone="0791234567")
		(mail,) = self.mailed_to(ADDRESS)
		subject, message = mail.kwargs["subject"], mail.kwargs["message"]
		for typed in ("Jane Visitor Words", "Remark of the visitor", "0791234567"):
			self.assertNotIn(typed, subject + message)
		self.assertIn(RESTAURANT, subject)
		self.assertIn(RESTAURANT, message)
		self.assertIn("verify_reservation?token=", message)

	def test_a_visitor_does_not_choose_how_long_he_keeps_a_table(self):
		# From the opening to 23:59:59, the whole day: the restaurant's 1 h 30 is what a booking takes
		self.book(tables=json.dumps([self.table]), reservation_time=OPENS, duration="12:59:59")
		self.assertEqual(self.reservation(self.booking_of()).duration, 5400)
		self.book(email=OTHER_ADDRESS, tables=json.dumps([self.table]), reservation_time="13:00:00")


class TestABookingItsGuestNeverConfirmsExpires(OnlineBooking, FrappeTestCase):
	def assert_deadline_in(self, name, minutes):
		reservation = self.reservation(name)
		self.assertEqual(reservation.verified, 0)
		expected = now_datetime() + timedelta(minutes=minutes)
		self.assertLess(abs((get_datetime(reservation.verification_deadline) - expected).total_seconds()), 60)

	def test_the_guest_has_thirty_minutes_to_confirm_unless_his_restaurant_says_otherwise(self):
		self.book(tables=json.dumps([self.table]))
		self.assert_deadline_in(self.booking_of(), 30)
		self.set_restaurant(unconfirmed_reservation_expiry=10)
		self.book(email=OTHER_ADDRESS)
		self.assert_deadline_in(self.booking_of(OTHER_ADDRESS), 10)
		# Until then the table is held: no other booking takes it
		self.assertTrue(check_overlap([self.table], NEXT_WEEK, AT, 5400))
		self.refused_booking(email="test-booking-late@yopmail.com", tables=json.dumps([self.table]))

	def test_an_expired_booking_frees_its_tables_at_once(self):
		self.book(tables=json.dumps([self.table]))
		self.past_its_deadline(self.booking_of())
		# Before any job has run: the table is free for the till, for a visitor and for the next booking
		self.assertEqual(check_overlap([self.table], NEXT_WEEK, AT, 5400), [])
		query = {"date": NEXT_WEEK, "time": AT, "restaurant": self.restaurant}
		status, answer = self.web("GET", TABLES, query=query)
		self.assertTrue(next(t for t in answer["message"]["tables"] if t["name"] == self.table)["available"])
		self.book(email=OTHER_ADDRESS, tables=json.dumps([self.table]))
		taken = self.reservation(self.booking_of(OTHER_ADDRESS))
		self.assertEqual([row.restaurant_table for row in taken.tables], [self.table])

	def test_the_job_expires_what_its_guest_did_not_confirm_in_time_and_nothing_else(self):
		self.book()
		late = self.booking_of()
		self.past_its_deadline(late)
		self.book(email=OTHER_ADDRESS)
		in_time = self.booking_of(OTHER_ADDRESS)
		self.book(email="test-booking-confirmed@yopmail.com")
		confirmed = self.booking_of("test-booking-confirmed@yopmail.com")
		frappe.db.set_value("Restaurant Reservation", confirmed, "verified", 1)
		self.past_its_deadline(confirmed)
		at_the_till = self.make_reservation(reservation_time="12:00:00")
		reservations.expire_unconfirmed_reservations()
		self.assertEqual(
			{name: self.status(name) for name in (late, in_time, confirmed, at_the_till)},
			{late: "Expired", in_time: "Confirmed", confirmed: "Confirmed", at_the_till: "Confirmed"},
		)

	def test_the_job_runs_every_five_minutes(self):
		events = frappe.get_hooks("scheduler_events", app_name="pos_next")
		self.assertIn(
			"pos_next.api.reservations.expire_unconfirmed_reservations", events["cron"]["*/5 * * * *"]
		)

	def test_a_booking_its_guest_never_confirmed_is_never_a_no_show(self):
		self.book(reservation_date=nowdate(), reservation_time="12:00:00")
		unconfirmed = self.booking_of()
		at_the_till = self.make_reservation(reservation_date=nowdate(), reservation_time="12:00:00")
		# Hours after both: the job marks the booking taken at the till, not the one nobody confirmed
		with patch.object(reservations, "now_datetime", return_value=get_datetime(f"{nowdate()} 23:00:00")):
			reservations._mark_no_shows_of(self.restaurant)
		self.assertEqual((self.status(unconfirmed), self.status(at_the_till)), ("Confirmed", "No Show"))
		# Nor does the till mark it so
		with self.assertRaises(frappe.ValidationError):
			reservations.update_reservation_status(unconfirmed, "No Show")
		# Expired, it is no booking at all: the statistics count the one at the till, a no-show
		self.past_its_deadline(unconfirmed)
		reservations.expire_unconfirmed_reservations()
		stats = reservations.get_reservation_stats(nowdate(), nowdate(), restaurant=self.restaurant)
		self.assertEqual(
			(stats["total"], stats["by_status"], stats["no_show_rate"]), (1, {"No Show": 1}, 100.0)
		)

	def test_a_confirmation_that_comes_too_late_revives_nothing(self):
		self.book(tables=json.dumps([self.table]))
		name = self.booking_of()
		token = self.reservation(name).verification_token
		self.past_its_deadline(name)
		self.sendmail.reset_mock()
		self.assertNotEqual(self.verify(token)[0], 200)
		# Nor from the till: another guest may hold its table by now
		for status in ("Seated", "No Show", "Confirmed"):
			with self.subTest(status=status), self.assertRaises(frappe.ValidationError):
				reservations.update_reservation_status(name, status)
		reservations.expire_unconfirmed_reservations()
		self.assertNotEqual(self.verify(token)[0], 200)
		self.assertEqual((self.reservation(name).verified, self.status(name)), (0, "Expired"))
		self.sendmail.assert_not_called()

	def test_the_guest_who_confirms_in_time_keeps_his_booking_and_becomes_a_customer_then(self):
		with patch.object(reservations, "_find_or_create_customer", return_value=None) as customer:
			self.book(tables=json.dumps([self.table]))
			name = self.booking_of()
			# Nobody has shown the address is theirs yet: no customer is made for it
			customer.assert_not_called()
			status, answer = self.verify(self.reservation(name).verification_token)
			self.assertEqual(status, 200, answer)
			customer.assert_called_once()
		self.assertEqual(self.reservation(name).verified, 1)
		# Its deadline passes: it is a booking of the restaurant now, which keeps its table
		self.past_its_deadline(name)
		reservations.expire_unconfirmed_reservations()
		self.assertEqual(self.status(name), "Confirmed")
		self.assertTrue(check_overlap([self.table], NEXT_WEEK, AT, 5400))

	def test_a_manager_who_confirms_a_booking_takes_it_out_of_expiry(self):
		self.set_restaurant(require_reservation_validation=1)
		self.book()
		name = self.booking_of()
		self.assertEqual(self.status(name), "Pending")
		reservations.update_reservation_status(name, "Confirmed")
		self.assertIsNone(self.reservation(name).verification_deadline)
		reservations.expire_unconfirmed_reservations()
		self.assertEqual(self.status(name), "Confirmed")
		# It is the restaurant's booking: one that fails to come is a no-show
		reservations.update_reservation_status(name, "No Show")
		self.assertEqual(self.status(name), "No Show")

	def test_the_till_vouches_for_a_booking_whose_guest_phoned(self):
		# The restaurant does not validate online bookings: the booking is Confirmed and waits for its guest
		self.book()
		name = self.booking_of()
		listed = {r["name"]: r for r in reservations.get_reservations(NEXT_WEEK, restaurant=self.restaurant)}
		self.assertTrue(listed[name]["awaits_guest"])
		# The guest phones: the till confirms it for him
		reservations.update_reservation_status(name, "Confirmed")
		self.assertIsNone(self.reservation(name).verification_deadline)
		listed = {r["name"]: r for r in reservations.get_reservations(NEXT_WEEK, restaurant=self.restaurant)}
		self.assertFalse(listed[name]["awaits_guest"])
		reservations.expire_unconfirmed_reservations()
		self.assertEqual(self.status(name), "Confirmed")
		reservations.update_reservation_status(name, "No Show")
		self.assertEqual(self.status(name), "No Show")

	def test_whatever_the_till_does_to_a_booking_vouches_for_it(self):
		self.book()
		name = self.booking_of()
		reservations.update_reservation_status(name, "Seated")
		self.assertIsNone(self.reservation(name).verification_deadline)

	def test_a_duplicated_booking_carries_no_token_nor_deadline(self):
		meta = frappe.get_meta("Restaurant Reservation")
		for fieldname in ("verification_token", "verified", "verification_deadline"):
			with self.subTest(field=fieldname):
				self.assertTrue(meta.get_field(fieldname).no_copy)
		self.book()
		copy = frappe.copy_doc(self.reservation(self.booking_of()), ignore_no_copy=False)
		self.assertFalse(copy.verification_token or copy.verification_deadline or copy.verified)

	def test_the_tills_day_list_and_the_reminders_leave_out_what_nobody_confirmed(self):
		self.book(tables=json.dumps([self.table]))
		unconfirmed = self.booking_of()
		at_the_till = self.make_reservation([self.other_table], email=OTHER_ADDRESS)
		# Three hours before 20:00: the guest who booked at the till is reminded, the address nobody confirmed is not
		self.sendmail.reset_mock()
		with patch.object(reservations, "now_datetime", return_value=get_datetime(f"{NEXT_WEEK} 18:00:00")):
			reservations._send_reminders_of(self.restaurant)
		self.assertEqual((len(self.mailed_to(ADDRESS)), len(self.mailed_to(OTHER_ADDRESS))), (0, 1))
		# Expired, it leaves the day's list; it is still there for whoever asks for the expired ones
		self.past_its_deadline(unconfirmed)
		reservations.expire_unconfirmed_reservations()
		listed = reservations.get_reservations(NEXT_WEEK, restaurant=self.restaurant)
		self.assertEqual([r["name"] for r in listed], [at_the_till])
		expired = reservations.get_reservations(NEXT_WEEK, status="Expired", restaurant=self.restaurant)
		self.assertEqual([r["name"] for r in expired], [unconfirmed])

	def test_the_workspace_today_view_leaves_out_what_nobody_confirmed(self):
		self.book(reservation_date=nowdate(), reservation_time="12:00:00")
		unconfirmed = self.booking_of()
		at_the_till = self.make_reservation(reservation_date=nowdate(), reservation_time="12:00:00")
		self.past_its_deadline(unconfirmed)
		reservations.expire_unconfirmed_reservations()
		today = next(view for view in reservation_views(nowdate()) if view["key"] == "today")
		shown = frappe.get_all(
			"Restaurant Reservation",
			filters=[*today["filters"], ["restaurant", "=", self.restaurant]],
			pluck="name",
		)
		self.assertEqual(shown, [at_the_till])
