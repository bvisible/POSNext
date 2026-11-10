# //// Neoffice — added file (no upstream equivalent).
"""The gestures of salon mode at the till: move, cancel, start or stop a step, what can be booked, the free slots, book
(NeoSalon, step 2, lot G4, the till's side; product owner, 10.11.2026).

Each gesture is a hook of the site's reservation app (note 10 of the vault, § G4, « Contrat v2 »); the till calls it and takes the first
answer that is not None. The suite plays the till's side with stand-ins for the hooks, as the real cashier of the till:

- that nothing is done while the till's tick is off or where the site has no hook, and that a visitor, a portal account and the cashier of
  another till are refused on every gesture before any hook is called;
- that what the cashier sends is checked before the reservation sees it (a time that is no time, a person or a customer the site does not
  know, a reason or an action the contract does not have, a gesture replayed from the future or from before a week);
- that what the reservation answers is read as the agenda reads it (only the keys the till knows) and that an answer about another
  appointment is refused;
- that the reservation's own refusal reaches the cashier as it is.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from pos_next.api import appointments
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	LUC,
	SONIA,
	_forget_the_people_of_the_suite,
	a_sales_person,
)
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	PORTAL,
	TILL,
	_till_fixture,
	_user,
)

ME = "pos_next.tests.test_the_till_moves_cancels_clocks_and_books_appointments"
SITE = {}


def _record(name, *args):
	SITE.setdefault("calls", []).append((name, *args))
	return SITE.get("answer")


def move(*args):
	return _record("move", *args)


def cancel(*args):
	return _record("cancel", *args)


def clock(*args):
	return _record("clock", *args)


def services(*args):
	return _record("services", *args)


def slots(*args):
	return _record("slots", *args)


def book(*args):
	return _record("book", *args)


def nothing_to_say(*args):
	SITE.setdefault("calls", []).append(("nothing_to_say", *args))
	return None


def refuses(*args):
	frappe.throw("The slot is already taken.")


def breaks(*args):
	raise RuntimeError("the reservation app is broken")


GESTURES = {
	"move": ("move", appointments.MOVE_HOOK),
	"cancel": ("cancel", appointments.CANCEL_HOOK),
	"clock": ("clock", appointments.CLOCK_HOOK),
	"services": ("services", appointments.SERVICES_HOOK),
	"slots": ("slots", appointments.SLOTS_HOOK),
	"book": ("book", appointments.BOOK_HOOK),
}


class TestTheTillMovesCancelsClocksAndBooksAppointments(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		_user(PORTAL, ["Customer"], "Website User")
		self.fx = _till_fixture()
		_forget_the_people_of_the_suite()
		self.addCleanup(_forget_the_people_of_the_suite)
		self.sonia = a_sales_person(SONIA, None, self.fx.company, commission_rate=15)
		self.luc = a_sales_person(LUC, None, self.fx.company, commission_rate=10)
		self.tick(True)

	def tick(self, on):
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", int(on))

	def site_has(self, **hooks):
		"""The hooks the site declares: `move=["move"]`, `clock=["refuses"]`..."""
		table = {hook: [f"{ME}.{path}" for path in hooks.get(name, [])] for name, hook in GESTURES.values()}
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def as_the_cashier(self, method, *args, user=TILL, **kwargs):
		frappe.set_user(user)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def a_row(self, **changes):
		return {
			"booking": "BKG-1",
			"starts_at": "2026-11-10 14:30:00",
			"ends_at": "2026-11-10 15:30:00",
			"customer": self.fx.customer,
			"customer_name": "Mme Dupont",
			"steps": [
				{
					"step": 1,
					"label": "Coupe",
					"item_code": self.fx.item,
					"starts_at": "2026-11-10 14:30:00",
					"ends_at": "2026-11-10 15:30:00",
					"sales_person": self.sonia,
					"sales_person_name": SONIA,
				}
			],
			"amount": 65.0,
			"state": "booked",
			**changes,
		}

	# The door

	def every_gesture(self):
		"""Each gesture with the arguments a cashier sends it with: (name, method, args)."""
		till = self.fx.profile
		chain = [{"item_code": self.fx.item}]
		return [
			("move", appointments.move_appointment, ("BKG-1", till, "2026-11-10 16:00:00")),
			("cancel", appointments.cancel_appointment, ("BKG-1", till)),
			("clock", appointments.clock_appointment, ("BKG-1", till, "start")),
			("services", appointments.get_services, (till,)),
			("slots", appointments.get_slots, (till, "2026-11-10", chain)),
			("book", appointments.book_appointment, (till, self.fx.customer, chain, "2026-11-10 16:00:00")),
		]

	def test_a_visitor_a_portal_account_and_the_cashier_of_another_till_are_refused_on_every_gesture(self):
		self.site_has(**{name: [name] for name in GESTURES})
		SITE["answer"] = self.a_row()

		for name, method, args in self.every_gesture():
			for user in ("Guest", PORTAL, OTHER_TILL):
				with self.subTest(gesture=name, user=user):
					with self.assertRaises(frappe.PermissionError):
						self.as_the_cashier(method, *args, user=user)

		self.assertNotIn("calls", SITE)

	def test_nothing_is_done_while_the_tick_is_off(self):
		self.site_has(**{name: [name] for name in GESTURES})
		SITE["answer"] = self.a_row()
		self.tick(False)

		for name, method, args in self.every_gesture():
			with self.subTest(gesture=name):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(method, *args)

		self.assertNotIn("calls", SITE)

	def test_a_gesture_the_site_has_no_hook_for_is_refused_and_a_list_is_empty(self):
		self.site_has()
		for name, method, args in self.every_gesture():
			with self.subTest(gesture=name):
				if name in ("services", "slots"):
					self.assertEqual(self.as_the_cashier(method, *args), [])
				else:
					with self.assertRaises(frappe.ValidationError):
						self.as_the_cashier(method, *args)

	def test_a_hook_with_nothing_to_say_is_passed_over_and_one_that_breaks_is_logged(self):
		self.site_has(move=["nothing_to_say", "breaks", "move"])
		SITE["answer"] = self.a_row()

		with patch("frappe.log_error") as logged:
			row = self.as_the_cashier(
				appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 14:30:00"
			)

		self.assertEqual(row["booking"], "BKG-1")
		self.assertEqual([call[0] for call in SITE["calls"]], ["nothing_to_say", "move"])
		self.assertEqual(logged.call_args.args[0], "The appointments hook failed")

	def test_the_reservations_own_refusal_reaches_the_cashier_as_it_is(self):
		self.site_has(move=["refuses"], cancel=["refuses"], clock=["refuses"], book=["refuses"])
		for name, method, args in self.every_gesture():
			if name in ("services", "slots"):
				continue
			with self.subTest(gesture=name):
				with self.assertRaises(frappe.ValidationError) as caught:
					self.as_the_cashier(method, *args)
				self.assertIn("The slot is already taken.", str(caught.exception))

	# Move

	def test_a_move_gives_the_reservation_the_booking_the_time_the_person_the_step_and_whether_to_warn(self):
		self.site_has(move=["move"])
		SITE["answer"] = self.a_row(starts_at="2026-11-10 16:00:00")

		row = self.as_the_cashier(
			appointments.move_appointment,
			"BKG-1",
			self.fx.profile,
			"2026-11-10 16:00",
			sales_person=self.luc,
			step=2,
			notify=0,
		)

		self.assertEqual(
			SITE["calls"],
			[("move", "BKG-1", self.fx.profile, "2026-11-10 16:00:00", self.luc, 2, False)],
		)
		self.assertEqual(row["starts_at"], "2026-11-10 16:00:00")
		self.assertEqual(set(row), set(appointments._appointment(self.a_row())))

	def test_a_move_warns_the_customer_unless_the_cashier_says_otherwise(self):
		self.site_has(move=["move"])
		SITE["answer"] = self.a_row()

		self.as_the_cashier(appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00")

		self.assertEqual(SITE["calls"][0][-3:], (None, None, True))

	def test_a_move_that_the_cashier_sends_badly_is_refused_before_the_reservation_sees_it(self):
		self.site_has(move=["move"])
		SITE["answer"] = self.a_row()
		till = self.fx.profile
		bad = (
			{"starts_at": "tomorrow morning"},
			{"starts_at": ""},
			{"starts_at": "2026-11-10 16:00:00", "sales_person": "Nobody Here"},
			{"starts_at": "2026-11-10 16:00:00", "step": 0},
			{"starts_at": "2026-11-10 16:00:00", "step": 99},
		)
		for sent in bad:
			with self.subTest(sent=sent):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.move_appointment, "BKG-1", till, **sent)

		self.assertNotIn("calls", SITE)

	def test_a_move_answered_for_another_appointment_is_refused(self):
		self.site_has(move=["move"])
		for answer in (self.a_row(booking="BKG-9"), "not a dict", {"no": "booking"}):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(
						appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
					)

	def test_a_booking_that_is_blank_is_refused_on_every_gesture_that_names_one(self):
		self.site_has(move=["move"], cancel=["cancel"], clock=["clock"])
		SITE["answer"] = self.a_row()
		till = self.fx.profile
		for method, args in (
			(appointments.move_appointment, (till, "2026-11-10 16:00:00")),
			(appointments.cancel_appointment, (till,)),
			(appointments.clock_appointment, (till, "start")),
		):
			with self.subTest(method=method.__name__):
				with self.assertRaises(frappe.PermissionError):
					self.as_the_cashier(method, "   ", *args)

		self.assertNotIn("calls", SITE)

	# Cancel

	def test_a_cancellation_says_what_was_paid_online_and_is_to_be_given_back(self):
		self.site_has(cancel=["cancel"])
		SITE["answer"] = {"state": "cancelled", "to_refund": 40, "secret": "never shown"}

		answer = self.as_the_cashier(appointments.cancel_appointment, "BKG-1", self.fx.profile)

		self.assertEqual(answer, {"booking": "BKG-1", "state": "cancelled", "to_refund": 40.0})
		self.assertEqual(SITE["calls"], [("cancel", "BKG-1", self.fx.profile, "cancelled", True)])

	def test_a_customer_who_did_not_come_is_marked_absent_and_nothing_is_given_back_when_nothing_is_said(
		self,
	):
		self.site_has(cancel=["cancel"])
		SITE["answer"] = {"to_refund": -5}

		answer = self.as_the_cashier(
			appointments.cancel_appointment, "BKG-1", self.fx.profile, "no_show", notify=0
		)

		self.assertEqual(answer, {"booking": "BKG-1", "state": "absent", "to_refund": 0.0})
		self.assertEqual(SITE["calls"][0][-2:], ("no_show", False))

	def test_a_reason_the_contract_does_not_have_is_refused(self):
		self.site_has(cancel=["cancel"])
		SITE["answer"] = {"state": "cancelled"}
		for reason in ("because", "", "Cancelled"):
			with self.subTest(reason=reason):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.cancel_appointment, "BKG-1", self.fx.profile, reason)

		self.assertNotIn("calls", SITE)

	def test_a_cancellation_answered_with_something_else_than_a_dict_is_refused(self):
		self.site_has(cancel=["cancel"])
		for answer in ("done", ["x"], 1):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.cancel_appointment, "BKG-1", self.fx.profile)

	# Start and stop

	def test_a_step_is_started_by_the_cashier_for_a_person_and_the_reservation_reads_its_own_clock(self):
		self.site_has(clock=["clock"])
		SITE["answer"] = self.a_row(state="started")

		row = self.as_the_cashier(
			appointments.clock_appointment, "BKG-1", self.fx.profile, "start", sales_person=self.luc
		)

		self.assertEqual(SITE["calls"], [("clock", "BKG-1", self.fx.profile, "start", None, self.luc, None)])
		self.assertEqual(row["state"], "started")

	def test_a_gesture_made_offline_is_replayed_with_the_moment_it_was_really_made(self):
		self.site_has(clock=["clock"])
		SITE["answer"] = self.a_row(state="finished")
		then = add_to_date(now_datetime(), hours=-3).strftime("%Y-%m-%d %H:%M")

		self.as_the_cashier(appointments.clock_appointment, "BKG-1", self.fx.profile, "stop", step=2, at=then)

		self.assertEqual(SITE["calls"][0][3:], ("stop", 2, None, f"{then}:00"))

	def test_a_replay_from_the_future_or_from_before_a_week_is_refused(self):
		self.site_has(clock=["clock"])
		SITE["answer"] = self.a_row()
		for at in (
			add_to_date(now_datetime(), hours=2),
			add_to_date(now_datetime(), days=-8),
			"yesterday at noon",
		):
			with self.subTest(at=at):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(
						appointments.clock_appointment, "BKG-1", self.fx.profile, "start", at=str(at)
					)

		self.assertNotIn("calls", SITE)

	def test_an_action_the_contract_does_not_have_is_refused(self):
		self.site_has(clock=["clock"])
		SITE["answer"] = self.a_row()
		for action in ("pause", "", "Start"):
			with self.subTest(action=action):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.clock_appointment, "BKG-1", self.fx.profile, action)

		self.assertNotIn("calls", SITE)

	# What can be booked

	def test_the_services_are_cut_to_what_the_till_knows(self):
		self.site_has(services=["services"])
		SITE["answer"] = [
			{
				"item_code": "SRV-COULEUR",
				"label": "Couleur",
				"price": 78,
				"duration_minutes": 90,
				"cost": 12,
				"options": [
					{
						"group": "Length",
						"required": 1,
						"choices": [{"label": "Mid", "price_delta": 15}, {"no": "label"}, "x"],
					},
					{"no": "group"},
				],
				"people": [{"sales_person": "Luc", "duration_minutes": 75}, {"nobody": True}],
			},
			{"label": "has no code"},
			"not a dict",
		]

		answer = self.as_the_cashier(appointments.get_services, self.fx.profile)

		self.assertEqual(
			answer,
			[
				{
					"item_code": "SRV-COULEUR",
					"label": "Couleur",
					"price": 78.0,
					"duration_minutes": 90,
					"options": [
						{
							"group": "Length",
							"required": True,
							"choices": [{"label": "Mid", "price_delta": 15.0}],
						}
					],
					"people": [{"sales_person": "Luc", "duration_minutes": 75}],
				}
			],
		)
		self.assertEqual(SITE["calls"], [("services", self.fx.profile)])

	def test_services_that_are_not_a_list_are_refused(self):
		self.site_has(services=["services"])
		for answer in ({"a": 1}, "x", 5):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.get_services, self.fx.profile)

	# The free slots

	def test_the_free_slots_of_a_chain_come_with_the_person_of_its_first_step(self):
		self.site_has(slots=["slots"])
		SITE["answer"] = [
			{"starts_at": "2026-11-10 15:30:00", "sales_person": "Maya", "sales_person_name": "Maya", "x": 1},
			{"starts_at": "2026-11-10 17:00:00"},
			{"no": "start"},
			"not a dict",
		]
		chain = f'[{{"item_code": "{self.fx.item}", "options": [{{"group": "Length"}}]}}]'

		answer = self.as_the_cashier(appointments.get_slots, self.fx.profile, "2026-11-10", chain, self.luc)

		self.assertEqual(
			answer,
			[
				{"starts_at": "2026-11-10 15:30:00", "sales_person": "Maya", "sales_person_name": "Maya"},
				{"starts_at": "2026-11-10 17:00:00", "sales_person": None, "sales_person_name": None},
			],
		)
		self.assertEqual(
			SITE["calls"],
			[
				(
					"slots",
					self.fx.profile,
					"2026-11-10",
					[{"item_code": self.fx.item, "options": '[{"group": "Length"}]'}],
					self.luc,
				)
			],
		)

	def test_a_chain_that_is_empty_too_long_or_made_of_unknown_services_is_refused_before_the_reservation_sees_it(
		self,
	):
		self.site_has(slots=["slots"], book=["book"])
		SITE["answer"] = []
		known = {"item_code": self.fx.item}
		for chain in (
			[],
			"",
			"not json at all {",
			[known] * (appointments.MOST_IN_A_CHAIN + 1),
			[{"item_code": "NO-SUCH-ITEM"}],
			[{"no": "code"}],
			["x"],
			{"item_code": self.fx.item},
			[{"item_code": self.fx.item, "options": "x" * (appointments.OPTIONS_LENGTH + 1)}],
		):
			with self.subTest(chain=str(chain)[:40]):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.get_slots, self.fx.profile, "2026-11-10", chain)

		self.assertNotIn("calls", SITE)

	# Book

	def test_a_new_appointment_is_booked_for_a_customer_the_site_knows(self):
		self.site_has(book=["book"])
		SITE["answer"] = self.a_row(booking="BKG-7")

		row = self.as_the_cashier(
			appointments.book_appointment,
			self.fx.profile,
			self.fx.customer,
			[{"item_code": self.fx.item}],
			"2026-11-10 15:30",
			notify=0,
		)

		self.assertEqual(row["booking"], "BKG-7")
		self.assertEqual(
			SITE["calls"],
			[
				(
					"book",
					self.fx.profile,
					self.fx.customer,
					[{"item_code": self.fx.item, "options": None}],
					"2026-11-10 15:30:00",
					None,
					False,
				)
			],
		)

	def test_an_appointment_for_a_customer_the_site_does_not_know_is_refused(self):
		self.site_has(book=["book"])
		SITE["answer"] = self.a_row()

		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(
				appointments.book_appointment,
				self.fx.profile,
				"NO-SUCH-CUSTOMER",
				[{"item_code": self.fx.item}],
				"2026-11-10 15:30:00",
			)

		self.assertNotIn("calls", SITE)

	def test_a_booking_that_is_answered_with_nothing_readable_is_refused(self):
		self.site_has(book=["book"])
		for answer in ("BKG-7", {"no": "booking"}, [self.a_row()]):
			with self.subTest(answer=str(answer)[:30]):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(
						appointments.book_appointment,
						self.fx.profile,
						self.fx.customer,
						[{"item_code": self.fx.item}],
						"2026-11-10 15:30:00",
					)
