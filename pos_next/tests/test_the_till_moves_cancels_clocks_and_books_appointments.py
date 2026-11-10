# //// Neoffice — added file (no upstream equivalent).
"""The gestures of salon mode at the till: check a move, move, cancel, start / pause / finish the time, what can be booked, the free slots, book
(NeoSalon, step 2, lot G4, the till's side; product owner, 10.11.2026).

Each gesture is a hook of the site's lanes (note 10 of the vault, § G4, « Contrat v2 », and the notes of the lanes); the till calls it and takes the
first answer that is not None. The suite plays the till's side with stand-ins for the hooks, as the real cashier of the till:

- that nothing is done while the till's tick is off or where the site has no hook, and that a visitor, a portal account and the cashier of
  another till are refused on every gesture before any hook is called;
- that what the cashier sends is checked before the lanes see it (a time that is no time, a person or a customer the site does not know, a
  reason or an action the contract does not have);
- that the hooks are called with the arguments of the lane that fills them (the planning lane puts the till first, the time lane the appointment);
- that what a lane answers is read as the agenda reads it (only the keys the till knows), and that a clock carries no cost and no margin;
- that the lane's own refusal reaches the cashier as it is.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	LUC,
	LUC_FIRST_NAME,
	SONIA,
	_forget_the_people_of_the_suite,
	a_sales_person,
	an_employee,
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


def check_move(*args):
	return _record("check_move", *args)


def move(*args):
	return _record("move", *args)


def cancel(*args):
	return _record("cancel", *args)


def time_action(*args):
	return _record("time_action", *args)


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
	raise RuntimeError("the lane is broken")


GESTURES = {
	"check_move": appointments.CHECK_MOVE_HOOK,
	"move": appointments.MOVE_HOOK,
	"cancel": appointments.CANCEL_HOOK,
	"time_action": appointments.TIME_ACTION_HOOK,
	"services": appointments.SERVICES_HOOK,
	"slots": appointments.SLOTS_HOOK,
	"book": appointments.BOOK_HOOK,
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
		self.luc_employee = an_employee(LUC_FIRST_NAME, self.fx.company)
		self.luc = a_sales_person(LUC, self.luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, None, self.fx.company, commission_rate=15)
		self.tick(True)

	def tick(self, on):
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", int(on))

	def site_has(self, **hooks):
		"""The hooks the site declares: `move=["move"]`, `time_action=["refuses"]`..."""
		table = {hook: [f"{ME}.{path}" for path in hooks.get(name, [])] for name, hook in GESTURES.items()}
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

	# The door

	def every_gesture(self):
		"""Each gesture with the arguments a cashier sends it with: (name, method, args)."""
		till = self.fx.profile
		chain = [{"item_code": self.fx.item}]
		return [
			("check_move", appointments.check_appointment_move, ("BKG-1", till, "2026-11-10 16:00:00")),
			("move", appointments.move_appointment, ("BKG-1", till, "2026-11-10 16:00:00")),
			("cancel", appointments.cancel_appointment, ("BKG-1", till)),
			("time_action", appointments.clock_appointment, ("BKG-1", till, "start")),
			("services", appointments.get_services, (till,)),
			("slots", appointments.get_slots, (till, "2026-11-10", chain)),
			("book", appointments.book_appointment, (till, self.fx.customer, chain, "2026-11-10 16:00:00")),
		]

	def test_a_visitor_a_portal_account_and_the_cashier_of_another_till_are_refused_on_every_gesture(self):
		self.site_has(**{name: [name] for name in GESTURES})
		SITE["answer"] = {"booking": "BKG-1"}

		for name, method, args in self.every_gesture():
			for user in ("Guest", PORTAL, OTHER_TILL):
				with self.subTest(gesture=name, user=user):
					with self.assertRaises(frappe.PermissionError):
						self.as_the_cashier(method, *args, user=user)

		self.assertNotIn("calls", SITE)

	def test_nothing_is_done_while_the_tick_is_off(self):
		self.site_has(**{name: [name] for name in GESTURES})
		SITE["answer"] = {"booking": "BKG-1"}
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

	def test_a_hook_with_nothing_to_say_is_passed_over_and_one_that_breaks_is_logged_and_passed_over_too(
		self,
	):
		SITE["answer"] = {"from": "2026-11-10 14:30:00", "to": "2026-11-10 16:00:00"}
		self.site_has(move=["nothing_to_say", "breaks", "move"])

		with patch("frappe.log_error") as logged:
			row = self.as_the_cashier(
				appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
			)

		self.assertEqual(row["to"], "2026-11-10 16:00:00")
		self.assertEqual([call[0] for call in SITE["calls"]], ["nothing_to_say", "move"])
		self.assertEqual(logged.call_args.args[0], "The appointments hook failed")

	def test_the_lanes_own_refusal_reaches_the_cashier_as_it_is(self):
		self.site_has(
			check_move=["refuses"],
			move=["refuses"],
			cancel=["refuses"],
			time_action=["refuses"],
			book=["refuses"],
		)
		for name, method, args in self.every_gesture():
			if name in ("services", "slots"):
				continue
			with self.subTest(gesture=name):
				with self.assertRaises(frappe.ValidationError) as caught:
					self.as_the_cashier(method, *args)
				self.assertIn("The slot is already taken.", str(caught.exception))

	# Check a move, move

	def test_a_move_is_asked_the_way_the_planning_lane_takes_it_with_the_till_first(self):
		self.site_has(move=["move"])
		SITE["answer"] = {
			"booking": "BKG-1",
			"from": "2026-11-10 14:30:00",
			"to": "2026-11-10 16:00:00",
			"provider_changed": 1,
			"notified": {"email": True, "sms": False, "secret": "never shown"},
			"internal": "never shown",
		}

		answer = self.as_the_cashier(
			appointments.move_appointment,
			"BKG-1",
			self.fx.profile,
			"2026-11-10 16:00",
			sales_person=self.luc,
			notify=0,
		)

		self.assertEqual(
			SITE["calls"], [("move", self.fx.profile, "BKG-1", "2026-11-10 16:00:00", self.luc, 0)]
		)
		self.assertEqual(
			answer,
			{
				"booking": "BKG-1",
				"from": "2026-11-10 14:30:00",
				"to": "2026-11-10 16:00:00",
				"provider_changed": True,
				"notified": {"email": True, "sms": False},
			},
		)

	def test_a_move_warns_the_customer_unless_the_cashier_says_otherwise(self):
		self.site_has(move=["move"])
		SITE["answer"] = {}

		self.as_the_cashier(appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00")

		self.assertEqual(SITE["calls"][0][-2:], (None, 1))

	def test_a_move_that_the_cashier_sends_badly_is_refused_before_the_lane_sees_it(self):
		self.site_has(move=["move"], check_move=["check_move"])
		SITE["answer"] = {}
		till = self.fx.profile
		bad = (
			{"starts_at": "tomorrow morning"},
			{"starts_at": ""},
			{"starts_at": "2026-11-10 16:00:00", "sales_person": "Nobody Here"},
		)
		for sent in bad:
			with self.subTest(sent=sent):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.move_appointment, "BKG-1", till, **sent)
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.check_appointment_move, "BKG-1", till, **sent)

		self.assertNotIn("calls", SITE)

	def test_a_move_answered_with_nothing_readable_is_refused(self):
		self.site_has(move=["move"])
		for answer in ("done", ["x"], 1):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(
						appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
					)

	def test_whether_a_move_could_be_made_is_asked_and_answered_in_two_keys(self):
		self.site_has(check_move=["check_move"])
		SITE["answer"] = {"ok": 0, "why": "Camille has Mme Vial at 16:00.", "secret": 1}

		answer = self.as_the_cashier(
			appointments.check_appointment_move,
			"BKG-1",
			self.fx.profile,
			"2026-11-10 16:00",
			sales_person=self.luc,
		)

		self.assertEqual(answer, {"ok": False, "why": "Camille has Mme Vial at 16:00."})
		self.assertEqual(
			SITE["calls"], [("check_move", self.fx.profile, "BKG-1", "2026-11-10 16:00:00", self.luc)]
		)

	def test_a_booking_that_is_blank_is_refused_on_every_gesture_that_names_one(self):
		self.site_has(
			move=["move"], cancel=["cancel"], time_action=["time_action"], check_move=["check_move"]
		)
		SITE["answer"] = {}
		till = self.fx.profile
		for method, args in (
			(appointments.move_appointment, (till, "2026-11-10 16:00:00")),
			(appointments.check_appointment_move, (till, "2026-11-10 16:00:00")),
			(appointments.cancel_appointment, (till,)),
			(appointments.clock_appointment, (till, "start")),
		):
			with self.subTest(method=method.__name__):
				with self.assertRaises(frappe.PermissionError):
					self.as_the_cashier(method, "   ", *args)

		self.assertNotIn("calls", SITE)

	# Cancel

	def test_a_cancellation_says_what_was_refunded_and_what_is_still_to_give_back(self):
		self.site_has(cancel=["cancel"])
		SITE["answer"] = {"state": "cancelled", "refunded": 40, "to_refund": -3, "secret": "never shown"}

		answer = self.as_the_cashier(appointments.cancel_appointment, "BKG-1", self.fx.profile)

		self.assertEqual(
			answer, {"booking": "BKG-1", "state": "cancelled", "refunded": 40.0, "to_refund": 0.0}
		)
		self.assertEqual(SITE["calls"], [("cancel", "BKG-1", self.fx.profile, "cancelled", True)])

	def test_a_customer_who_did_not_come_is_marked_absent_and_nothing_is_given_back_when_nothing_is_said(
		self,
	):
		self.site_has(cancel=["cancel"])
		SITE["answer"] = {"to_refund": 12}

		answer = self.as_the_cashier(
			appointments.cancel_appointment, "BKG-1", self.fx.profile, "no_show", notify=0
		)

		self.assertEqual(answer, {"booking": "BKG-1", "state": "absent", "refunded": 0.0, "to_refund": 12.0})
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

	# The time

	def test_a_gesture_of_the_time_is_asked_the_way_the_time_lane_takes_it_and_sends_no_hour(self):
		self.site_has(time_action=["time_action"])
		SITE["answer"] = {
			"booking": "BKG-1",
			"status": "In progress",
			"active_seconds": 120,
			"started_at": "2026-11-10 14:00:00",
			"paused_by": "BKG-9",
			"cost": 12.5,
			"margin": 40.0,
		}

		answer = self.as_the_cashier(appointments.clock_appointment, "BKG-1", self.fx.profile, "start")

		self.assertEqual(SITE["calls"], [("time_action", "BKG-1", "start", self.fx.profile, None)])
		self.assertEqual(
			answer,
			{
				"booking": "BKG-1",
				"clock": {
					"state": "running",
					"started_at": "2026-11-10 14:00:00",
					"ended_at": None,
					"active_seconds": 120,
					"paused_by": "BKG-9",
				},
			},
		)

	def test_the_front_desk_times_a_colleague_by_naming_her_and_the_lane_gets_her_employee(self):
		self.site_has(time_action=["time_action"])
		SITE["answer"] = {"status": "Not started"}

		self.as_the_cashier(
			appointments.clock_appointment, "BKG-1", self.fx.profile, "pause", sales_person=self.luc
		)

		self.assertEqual(
			SITE["calls"], [("time_action", "BKG-1", "pause", self.fx.profile, self.luc_employee)]
		)

	def test_a_person_who_has_no_employee_is_timed_as_the_appointments_own(self):
		self.site_has(time_action=["time_action"])
		SITE["answer"] = {}

		self.as_the_cashier(
			appointments.clock_appointment, "BKG-1", self.fx.profile, "finish", sales_person=self.sonia
		)

		self.assertEqual(SITE["calls"][0][-1], None)

	def test_the_four_gestures_of_the_time_pass_and_any_other_is_refused_before_the_lane_sees_it(self):
		self.site_has(time_action=["time_action"])
		SITE["answer"] = {}
		for action in ("start", "pause", "finish", "close_unmeasured"):
			with self.subTest(action=action):
				self.as_the_cashier(appointments.clock_appointment, "BKG-1", self.fx.profile, action)
		calls = len(SITE["calls"])
		for action in ("stop", "", "Start", "start now"):
			with self.subTest(action=action):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.clock_appointment, "BKG-1", self.fx.profile, action)

		self.assertEqual((calls, len(SITE["calls"])), (4, 4))

	def test_a_gesture_of_the_time_answered_with_nothing_readable_is_refused(self):
		self.site_has(time_action=["time_action"])
		for answer in ("done", ["x"], 1):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.clock_appointment, "BKG-1", self.fx.profile, "start")

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

	def test_a_chain_that_is_empty_too_long_or_made_of_unknown_services_is_refused_before_the_lane_sees_it(
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
		SITE["answer"] = {"booking": "BKG-7", "starts_at": "2026-11-10 15:30:00", "secret": 1}

		row = self.as_the_cashier(
			appointments.book_appointment,
			self.fx.profile,
			self.fx.customer,
			[{"item_code": self.fx.item}],
			"2026-11-10 15:30",
			notify=0,
		)

		self.assertEqual(row, {"booking": "BKG-7", "starts_at": "2026-11-10 15:30:00"})
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
		SITE["answer"] = {"booking": "BKG-7"}

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
		for answer in ("BKG-7", {"no": "booking"}, [{"booking": "BKG-7"}]):
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
