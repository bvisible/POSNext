# //// Neoffice — added file (no upstream equivalent).
"""The public booking page (/pos/reservation): what a visitor learns, asks and leaves behind (NeoRestau lot 1, task 18).

1. A visitor learns which tables are free for the slot he asks, for the restaurant's own duration, and nothing of the
   guests who hold the others: no name, phone, address, remark, booking nor time. A staff account sees who holds them,
   as it always did.
2. The form mails an address nobody has confirmed yet. It takes one plain address and a name that is only a name, so
   many bookings per visitor (IP), per address and per site; a booking that fills the field only a script fills is
   answered like any other and leaves nothing; the mail says only what the restaurant says. A refused booking writes
   nothing and mails nothing.
3. A booking its guest never confirms from the e-mail holds its tables until the restaurant's deadline only: then it
   frees them at once, the job marks it Expired, it is never a no-show nor reminded, it leaves the till's list and the
   statistics, and a confirmation that comes too late does not revive it.

The suite relies on no restaurant of the site: a fresh CI site has none, the clone of a working site holds real ones and
real bookings. Every test builds its restaurant, room and tables, nothing commits (the commit is switched off and each
test rolls back), no mail leaves (`frappe.sendmail` is a mock), and the limit counters it touches in Redis are deleted
before and after it. The form's limits are out of reach unless a test sets the one it is about.
"""

import json
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_datetime, now_datetime, nowdate, set_request

from pos_next.api import reservations
from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import check_overlap
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _user

RESTAURANT = "_Test Booking Restaurant"
ROOM = "_Test Booking Room"
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
# The Redis namespace of the form's counters (reservations.LIMIT_KEY), emptied around each test
LIMIT_KEY = "pos_next:guest_reservation_limit:"
# Every limit of the form, out of reach: a test sets the one it is about
NO_LIMITS = {
	kind: [1000, 86400]
	for kind in ("ip_minute", "ip_hour", "ip_day", "address_hour", "address_day", "site_hour", "site_day")
}


def forget_the_counters():
	frappe.cache.delete_keys(LIMIT_KEY)


@contextmanager
def a_visitor_calling_from(ip):
	"""A call as the web makes it: an HTTP request from `ip`. None: a call made inside the server (a console, a job),
	which no request carries. What frappe.local held before is put back afterwards."""
	missing = object()
	before = {attribute: getattr(frappe.local, attribute, missing) for attribute in ("request", "request_ip")}
	if ip is None:
		frappe.local.request = None
	else:
		set_request(method="POST", path="/api/method/pos_next.api.reservations.submit_guest_reservation")
		frappe.local.request_ip = ip
	try:
		yield
	finally:
		for attribute, value in before.items():
			if value is not missing:
				setattr(frappe.local, attribute, value)
				continue
			try:
				delattr(frappe.local, attribute)
			except AttributeError:
				pass


class OnlineBooking:
	"""A restaurant that takes bookings online (no manager's validation, no opening hours), a room and two tables."""

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
			# site's own flag is not the test's to know; the form's limits are out of reach unless a test sets one
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

	def book(self, ip=VISITOR, **values):
		"""A visitor books on the public form, from `ip` (None: a call made inside the server)."""
		arguments = {
			"reservation_date": NEXT_WEEK,
			"reservation_time": AT,
			"no_of_guests": 2,
			"guest_name": GUEST,
			"phone": PHONE,
			"email": ADDRESS,
			"restaurant": self.restaurant,
			**values,
		}
		frappe.set_user("Guest")
		try:
			with a_visitor_calling_from(ip):
				return reservations.submit_guest_reservation(**arguments)
		finally:
			frappe.set_user("Administrator")

	def as_visitor(self, call, *arguments, **keywords):
		frappe.set_user("Guest")
		try:
			return call(*arguments, **keywords)
		finally:
			frappe.set_user("Administrator")

	def set_restaurant(self, **values):
		frappe.db.set_value("Restaurant", self.restaurant, values)
		frappe.clear_document_cache("Restaurant")

	def reservation(self, name):
		return frappe.get_doc("Restaurant Reservation", name)

	def status(self, name):
		return frappe.db.get_value("Restaurant Reservation", name, "status")

	def bookings(self):
		return frappe.db.count("Restaurant Reservation", {"restaurant": self.restaurant})

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
		frappe.set_user(user)
		try:
			return reservations.get_available_tables(NEXT_WEEK, at, restaurant=self.restaurant, **arguments)[
				"tables"
			]
		finally:
			frappe.set_user("Administrator")

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
		four_hours = {"duration": 4 * 3600}
		seen = {
			user: next(
				t for t in self.tables_seen_by(user, "17:00:00", **four_hours) if t["name"] == self.table
			)
			for user in ("Guest", "Administrator")
		}
		self.assertTrue(seen["Guest"]["available"])
		self.assertFalse(seen["Administrator"]["available"])


class TestTheBookingFormIsNoMailRelay(OnlineBooking, FrappeTestCase):
	def limit(self, **kinds):
		"""The form's limits for this test: those named (count, window in seconds), every other one out of reach."""
		frappe.conf["guest_reservation_limits"] = {**NO_LIMITS, **kinds}

	def assert_refused_and_nothing_left(self, **booking):
		"""The booking is refused for a limit, and writes nothing and mails nothing."""
		before = self.bookings()
		self.sendmail.reset_mock()
		with self.assertRaises(frappe.RateLimitExceededError) as refused:
			self.book(**booking)
		self.sendmail.assert_not_called()
		self.assertEqual(self.bookings(), before)
		return str(refused.exception)

	def test_a_booking_mails_its_guest_once(self):
		self.book()
		self.assertEqual(len(self.mailed_to(ADDRESS)), 1)
		self.assertEqual(self.sendmail.call_count, 1)

	def test_a_visitor_past_his_limit_is_refused_and_nothing_is_written_nor_mailed(self):
		self.limit(ip_minute=[2, 86400])
		for n in range(2):
			self.book(email=f"test-booking-{n}@yopmail.com")
		self.assert_refused_and_nothing_left(email="test-booking-2@yopmail.com")
		# Another visitor is not refused
		self.book(email="test-booking-3@yopmail.com", ip="203.0.113.11")
		self.assertEqual(len(self.mailed_to("test-booking-3@yopmail.com")), 1)

	def test_an_ipv6_visitor_is_counted_by_his_network(self):
		self.limit(ip_minute=[1, 86400])
		self.book(ip="2001:db8:1:2::10")
		self.assert_refused_and_nothing_left(email="test-booking-v6@yopmail.com", ip="2001:db8:1:2:ffff::1")
		self.book(email="test-booking-v6@yopmail.com", ip="2001:db8:1:3::10")

	def test_a_visitor_gets_three_bookings_a_minute_by_default(self):
		frappe.conf.pop("guest_reservation_limits")
		# One fixed instant: the minute cannot turn during the test
		with patch.object(reservations, "epoch_seconds", return_value=1_900_000_000.0):
			for n in range(3):
				self.book(email=f"test-booking-d{n}@yopmail.com")
			self.assert_refused_and_nothing_left(email="test-booking-d3@yopmail.com")

	def test_one_address_is_not_mailed_past_its_limit_whoever_asks(self):
		self.limit(address_hour=[2, 86400])
		for n, typed in enumerate((ADDRESS, ADDRESS.upper())):
			name = self.book(email=typed, ip=f"203.0.113.{20 + n}")["name"]
			# Cancelled, it is not one of the address's bookings to come: only the limit refuses the next one
			frappe.db.set_value("Restaurant Reservation", name, "status", "Cancelled")
		self.assert_refused_and_nothing_left(email=ADDRESS.title(), ip="203.0.113.30")
		self.assertEqual(len(self.mailed_to(ADDRESS)), 0)

	def test_the_site_mails_no_more_than_its_budget_and_a_visitor_past_his_own_limit_spends_none_of_it(self):
		self.limit(ip_minute=[1, 86400], site_hour=[2, 86400])
		self.book(email="test-booking-a@yopmail.com", ip="203.0.113.40")
		# The same visitor again and again: refused on his own limit, which costs the site nothing
		for n in range(3):
			self.assert_refused_and_nothing_left(email=f"test-booking-x{n}@yopmail.com", ip="203.0.113.40")
		self.book(email="test-booking-b@yopmail.com", ip="203.0.113.41")
		# Two bookings spent the site's budget: the next one is refused, whoever asks
		self.assert_refused_and_nothing_left(email="test-booking-c@yopmail.com", ip="203.0.113.42")

	def test_a_call_made_inside_the_server_is_no_visitor(self):
		# Frappe's own rate limiter lets such a call through as well
		self.limit(ip_minute=[0, 86400], address_hour=[0, 86400], site_hour=[0, 86400])
		for n in range(3):
			self.book(email=f"test-booking-s{n}@yopmail.com", ip=None)
		self.assertEqual(self.sendmail.call_count, 3)

	def test_an_address_with_three_bookings_to_come_is_refused_in_the_words_of_the_limits(self):
		for n in range(3):
			self.book(ip=f"203.0.113.{50 + n}")
		too_many_bookings = self.assert_refused_and_nothing_left(ip="203.0.113.60")
		self.limit(ip_minute=[0, 86400])
		too_many_requests = self.assert_refused_and_nothing_left(email=OTHER_ADDRESS, ip="203.0.113.61")
		# The answer tells a stranger nothing about the bookings of an address
		self.assertEqual(too_many_bookings, too_many_requests)

	def test_a_booking_that_fills_the_hidden_field_is_answered_like_any_and_leaves_nothing(self):
		self.limit(site_hour=[1, 86400])
		dropped = self.book(subject="Cheap offer, click here")
		self.sendmail.assert_not_called()
		self.assertEqual(self.bookings(), 0)
		self.assertFalse(frappe.db.exists("Customer", {"email_id": ADDRESS}))
		# It mailed nothing, so it spent nothing of the site's budget: the one booking the site may mail still goes
		taken = self.book(email=OTHER_ADDRESS)
		self.assertEqual({**dropped, "name": taken["name"]}, taken)

	def test_a_booking_names_one_plain_address(self):
		for typed in (
			"test-booking-a@yopmail.com, test-booking-b@yopmail.com",
			"test-booking-a@yopmail.com;test-booking-b@yopmail.com",
			"Jane <test-booking-a@yopmail.com>",
			"test-booking-a@yopmail.com test-booking-b@yopmail.com",
			"not an address",
		):
			with self.subTest(email=typed), self.assertRaises(frappe.ValidationError):
				self.book(email=typed)
		self.sendmail.assert_not_called()
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
			with self.subTest(name=typed), self.assertRaises(frappe.ValidationError):
				self.book(guest_name=typed)
		self.sendmail.assert_not_called()
		self.assertEqual(self.bookings(), 0)
		# Accents, an apostrophe, a hyphen and a dot make a name; the spaces around and between words are tidied
		name = self.book(guest_name="  Zoë  O'Neill-Dupré  Jr. ")["name"]
		self.assertEqual(self.reservation(name).guest_name, "Zoë O'Neill-Dupré Jr.")

	def test_the_mail_to_an_unconfirmed_address_says_only_what_the_restaurant_says(self):
		self.book(guest_name="Jane Visitor Words", notes="Remark of the visitor", phone="0791234567")
		(mail,) = self.mailed_to(ADDRESS)
		subject, message = mail.kwargs["subject"], mail.kwargs["message"]
		for typed in ("Jane Visitor Words", "Remark of the visitor", "0791234567"):
			self.assertNotIn(typed, subject + message)
		self.assertIn(RESTAURANT, subject)
		self.assertIn(RESTAURANT, message)
		self.assertIn("verify_reservation?token=", message)


class TestABookingItsGuestNeverConfirmsExpires(OnlineBooking, FrappeTestCase):
	def assert_deadline_in(self, name, minutes):
		reservation = self.reservation(name)
		self.assertEqual(reservation.verified, 0)
		expected = now_datetime() + timedelta(minutes=minutes)
		self.assertLess(abs((get_datetime(reservation.verification_deadline) - expected).total_seconds()), 60)

	def test_the_guest_has_thirty_minutes_to_confirm_unless_his_restaurant_says_otherwise(self):
		self.assert_deadline_in(self.book(tables=json.dumps([self.table]))["name"], 30)
		self.set_restaurant(unconfirmed_reservation_expiry=10)
		self.assert_deadline_in(self.book(email=OTHER_ADDRESS)["name"], 10)
		# Until then the table is held: no other booking takes it
		self.assertTrue(check_overlap([self.table], NEXT_WEEK, AT, 5400))
		with self.assertRaises(frappe.ValidationError):
			self.book(email="test-booking-late@yopmail.com", tables=json.dumps([self.table]))

	def test_an_expired_booking_frees_its_tables_at_once(self):
		name = self.book(tables=json.dumps([self.table]))["name"]
		self.past_its_deadline(name)
		# Before any job has run: the table is free for the till, for a visitor and for the next booking
		self.assertEqual(check_overlap([self.table], NEXT_WEEK, AT, 5400), [])
		tables = self.as_visitor(reservations.get_available_tables, NEXT_WEEK, AT, restaurant=self.restaurant)
		self.assertTrue(next(t for t in tables["tables"] if t["name"] == self.table)["available"])
		taken = self.book(email=OTHER_ADDRESS, tables=json.dumps([self.table]))["name"]
		self.assertEqual([row.restaurant_table for row in self.reservation(taken).tables], [self.table])

	def test_the_job_expires_what_its_guest_did_not_confirm_in_time_and_nothing_else(self):
		late = self.book()["name"]
		self.past_its_deadline(late)
		in_time = self.book(email=OTHER_ADDRESS)["name"]
		confirmed = self.book(email="test-booking-confirmed@yopmail.com")["name"]
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
		unconfirmed = self.book(reservation_date=nowdate(), reservation_time="08:00:00")["name"]
		at_the_till = self.make_reservation(reservation_date=nowdate(), reservation_time="08:00:00")
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
		name = self.book(tables=json.dumps([self.table]))["name"]
		token = self.reservation(name).verification_token
		self.past_its_deadline(name)
		self.sendmail.reset_mock()
		with self.assertRaises(frappe.ValidationError):
			self.as_visitor(reservations.verify_reservation, token)
		# Nor from the till: another guest may hold its table by now
		for status in ("Seated", "No Show"):
			with self.subTest(status=status), self.assertRaises(frappe.ValidationError):
				reservations.update_reservation_status(name, status)
		reservations.expire_unconfirmed_reservations()
		with self.assertRaises(frappe.ValidationError):
			self.as_visitor(reservations.verify_reservation, token)
		self.assertEqual((self.reservation(name).verified, self.status(name)), (0, "Expired"))
		self.sendmail.assert_not_called()

	def test_the_guest_who_confirms_in_time_keeps_his_booking_and_becomes_a_customer_then(self):
		with patch.object(reservations, "_find_or_create_customer", return_value=None) as customer:
			name = self.book(tables=json.dumps([self.table]))["name"]
			# Nobody has shown the address is theirs yet: no customer is made for it
			customer.assert_not_called()
			self.as_visitor(reservations.verify_reservation, self.reservation(name).verification_token)
			customer.assert_called_once()
		self.assertEqual(self.reservation(name).verified, 1)
		# Its deadline passes: it is a booking of the restaurant now, which keeps its table
		self.past_its_deadline(name)
		reservations.expire_unconfirmed_reservations()
		self.assertEqual(self.status(name), "Confirmed")
		self.assertTrue(check_overlap([self.table], NEXT_WEEK, AT, 5400))

	def test_a_manager_who_confirms_a_booking_takes_it_out_of_expiry(self):
		self.set_restaurant(require_reservation_validation=1)
		name = self.book()["name"]
		self.assertEqual(self.status(name), "Pending")
		reservations.update_reservation_status(name, "Confirmed")
		self.assertIsNone(self.reservation(name).verification_deadline)
		reservations.expire_unconfirmed_reservations()
		self.assertEqual(self.status(name), "Confirmed")
		# It is the restaurant's booking: one that fails to come is a no-show
		reservations.update_reservation_status(name, "No Show")
		self.assertEqual(self.status(name), "No Show")

	def test_the_tills_day_list_and_the_reminders_leave_out_what_nobody_confirmed(self):
		unconfirmed = self.book(tables=json.dumps([self.table]))["name"]
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
