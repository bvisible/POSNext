# //// Neoffice — added file (no upstream equivalent).
"""The agenda of the salon day at the till is composed from what the three lanes of the salon answer (NeoSalon, step 2, lot G4; product owner, 10.11.2026).

The planning lane gives the day (who is there, what each holds, a colleague's appointment « busy » for a cashier who may not read it), the money lane
where each appointment stands, what it announces and what was paid, the time lane the state of the clock. POS Next composes them, as the real cashier of
the till, with stand-ins for the hooks:

- the people are the team of the day, with how each stands and the hours she works; the agenda is what the day view shows, and a booking the
  money lane lists that the day view does not show is shown to nobody;
- an appointment's state is worked out from the day view, the money lane and the clock (absent, paid, finished, started, booked);
- a busy appointment carries no name, no service, no amount and no gesture, whatever the hooks said;
- what the cashier may do is what the state allows, if the appointment is hers to work or she sees the whole salon, and if the site has the gesture;
- the time is asked only when the site has a time lane, and a clock that cannot be read is an idle clock.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	LUC,
	LUC_FIRST_NAME,
	SONIA,
	SONIA_FIRST_NAME,
	_forget_the_people_of_the_suite,
	a_sales_person,
	an_employee,
)
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_till_fixture,
	_user,
)

ME = "pos_next.tests.test_the_agenda_of_the_salon_day_is_composed_from_what_the_lanes_answer"
SITE = {}


def the_day(pos_profile, date=None):
	SITE.setdefault("calls", []).append(("day", pos_profile, date))
	return SITE.get("day")


def the_list(pos_profile, date=None, providers=None):
	SITE.setdefault("calls", []).append(("list", pos_profile, date, providers))
	return SITE.get("list")


def the_clocks(appointments_, pos_profile):
	SITE.setdefault("calls", []).append(("clocks", list(appointments_), pos_profile))
	return SITE.get("clocks")


def a_clock_that_refuses(appointments_, pos_profile):
	frappe.throw("Nobody can be timed on this.")


def a_time_action(appointment, action, pos_profile, employee=None):
	return {}


def a_check_move(*args):
	return {}


def a_move(*args):
	return {}


def a_cancel(*args):
	return {}


def some_services(*args):
	return []


def some_slots(*args):
	return []


def a_repeat(*args):
	return None


def a_booking(*args):
	return {}


HOOKS = {
	"day": appointments.DAY_HOOK,
	"list": appointments.LIST_HOOK,
	"clocks": appointments.TIME_STATE_HOOK,
	"time_action": appointments.TIME_ACTION_HOOK,
	"check_move": appointments.CHECK_MOVE_HOOK,
	"move": appointments.MOVE_HOOK,
	"cancel": appointments.CANCEL_HOOK,
	"services": appointments.SERVICES_HOOK,
	"slots": appointments.SLOTS_HOOK,
	"book": appointments.BOOK_HOOK,
	"repeat": appointments.REPEAT_HOOK,
}
STUBS = {
	"day": "the_day",
	"list": "the_list",
	"clocks": "the_clocks",
	"time_action": "a_time_action",
	"check_move": "a_check_move",
	"move": "a_move",
	"cancel": "a_cancel",
	"services": "some_services",
	"slots": "some_slots",
	"book": "a_booking",
	"repeat": "a_repeat",
}


class TestTheAgendaOfTheSalonDayIsComposedFromWhatTheLanesAnswer(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		_forget_the_people_of_the_suite()
		self.addCleanup(_forget_the_people_of_the_suite)
		# Luc is the signed-in cashier's own sales person, Sonia a colleague's
		self.luc_employee = an_employee(LUC_FIRST_NAME, self.fx.company, user_id=TILL)
		self.sonia_employee = an_employee(SONIA_FIRST_NAME, self.fx.company)
		self.luc = a_sales_person(LUC, self.luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, self.sonia_employee, self.fx.company, commission_rate=15)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", 1)

	def site_has(self, *names):
		"""The hooks the site declares, by the name of the gesture."""
		table = {hook: [f"{ME}.{STUBS[name]}"] if name in names else [] for name, hook in HOOKS.items()}
		# The old names of the extension points are empty too: the lanes of the work site do not answer for the suite
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def agenda(self, user=TILL):
		frappe.set_user(user)
		try:
			return appointments.get_appointments(self.fx.profile, "2026-11-10")
		finally:
			frappe.set_user("Administrator")

	def person(self, name, **changes):
		return {
			"user": f"{name.lower()}@example.com",
			"name": name,
			"sales_person": name,
			"sales_person_name": name,
			"state": "present",
			"reason": None,
			"periods": [["09:00", "18:00"]],
			"from": "09:00",
			"until": "18:00",
			"checked_in": "08:57",
			"has_hr_file": True,
			"bookings": 1,
			"booked_minutes": 60,
			"load": 12,
			"appointments": [],
			**changes,
		}

	def row(self, booking, person, starts="2026-11-10 09:00:00", **changes):
		return {
			"booking": booking,
			"item_code": "SRV-COUPE",
			"label": "Coupe",
			"starts_at": starts,
			"ends_at": starts.replace("09:00", "10:00"),
			"status": "Confirmed",
			"payment_status": "Unpaid",
			"attendance": "Booked",
			"attendees": 1,
			"customer": "CUST-1",
			"customer_name": "Mme Dupont",
			"provider": "x@example.com",
			"sales_person": person,
			"sales_person_name": person,
			"invoice": None,
			**changes,
		}

	def busy(self, person, starts="2026-11-10 10:00:00"):
		return {
			"busy": True,
			"starts_at": starts,
			"ends_at": starts.replace("10:00", "11:00"),
			"provider": "x@example.com",
			"sales_person": person,
			"sales_person_name": person,
			# What a hook that forgot to mask would add
			"customer_name": "Mme Secret",
			"label": "Colour",
			"amount": 120,
		}

	def a_day(self, visibility="all", people=None, unassigned=None, salon=None):
		SITE["day"] = {
			"day": "2026-11-10",
			"visibility": visibility,
			"people": people if people is not None else [],
			"unassigned": unassigned or [],
		}
		if salon is not None:
			SITE["day"]["salon"] = salon

	def a_salon(self, **changes):
		"""The block of the planning lane that says how the salon stands that day: closed for a holiday, unless changed."""
		return {"state": "closed", "reason": "holiday", "label": "Christmas Day", "periods": [], **changes}

	# The people

	def test_the_people_are_the_team_of_the_day_with_how_they_stand_and_the_hours_they_work(self):
		self.site_has("day")
		self.a_day(
			people=[
				self.person(LUC, periods=[["09:00", "12:00"], ["13:00", "17:00"], ["9", "x"], "no"]),
				self.person(
					SONIA, state="on_leave", reason="Leave until 20-11-2026", periods=[], **{"from": None}
				),
				{"user": "alix@example.com", "name": "Alix", "state": "dancing", "secret": "never shown"},
				{"name": "nobody here"},
				"not a dict",
			]
		)

		answer = self.agenda()

		self.assertEqual(
			[(p["key"], p["sales_person_name"], p["status"]) for p in answer["people"]],
			[(LUC, LUC, "present"), (SONIA, SONIA, "on_leave"), ("alix@example.com", "Alix", "unknown")],
		)
		self.assertEqual(answer["people"][0]["periods"], [["09:00", "12:00"], ["13:00", "17:00"]])
		self.assertEqual(answer["people"][1]["reason"], "Leave until 20-11-2026")
		self.assertEqual(
			set(answer["people"][2]),
			{
				"key",
				"user",
				"sales_person",
				"sales_person_name",
				"status",
				"reason",
				"periods",
				"from",
				"until",
				"checked_in",
			},
		)

	def test_the_cashier_knows_which_sales_person_she_is_and_what_she_may_see_of_the_salon(self):
		self.site_has("day")
		self.a_day(visibility="own", people=[self.person(LUC)])

		answer = self.agenda()

		self.assertEqual((answer["mine"], answer["visibility"]), ([self.luc], "own"))

	def test_a_visibility_the_planning_lane_does_not_know_is_the_narrow_one_only_when_it_says_own(self):
		self.site_has("day")
		for said, kept in (("own", "own"), ("all", "all"), ("whatever", "all")):
			with self.subTest(said=said):
				self.a_day(visibility=said)
				self.assertEqual(self.agenda()["visibility"], kept)

	# The appointments

	def test_an_appointment_is_what_the_day_view_shows_with_what_the_money_lane_adds(self):
		self.site_has("day", "list")
		self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])
		SITE["list"] = [
			{
				"booking": "BKG-1",
				"starts_at": "2026-11-10 09:00:00",
				"ends_at": "2026-11-10 10:00:00",
				"customer": "CUST-1",
				"customer_name": "Mme Dupont",
				"steps": [{"label": "Coupe femme", "item_code": "SRV-COUPE", "sales_person": LUC}],
				"amount": 65.0,
				"paid_amount": 40.0,
				"state": "booked",
				"in_the_till": True,
				"invoice": "ACC-SINV-1",
			},
			# A booking the day view does not show is shown to nobody
			{"booking": "BKG-SECRET", "amount": 99.0, "state": "booked"},
		]

		rows = self.agenda()["appointments"]

		self.assertEqual([r["booking"] for r in rows], ["BKG-1"])
		row = rows[0]
		self.assertEqual((row["amount"], row["paid_amount"], row["in_the_till"]), (65.0, 40.0, True))
		self.assertEqual(
			(row["invoice"], row["customer_name"], row["state"]), ("ACC-SINV-1", "Mme Dupont", "booked")
		)
		self.assertEqual(row["steps"][0]["label"], "Coupe femme")

	def test_without_the_money_lane_an_appointment_shows_its_service_and_announces_nothing(self):
		self.site_has("day")
		self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])

		row = self.agenda()["appointments"][0]

		self.assertEqual((row["amount"], row["paid_amount"], row["in_the_till"]), (0.0, 0.0, False))
		self.assertEqual((row["steps"][0]["label"], row["steps"][0]["sales_person"]), ("Coupe", LUC))

	def test_where_an_appointment_stands_comes_from_the_day_the_money_and_the_clock(self):
		self.site_has("day", "list", "clocks")
		self.a_day(
			people=[
				self.person(
					LUC,
					appointments=[
						self.row("BKG-1", LUC),
						self.row("BKG-2", LUC, attendance="No Show"),
						self.row("BKG-3", LUC, payment_status="Paid"),
						self.row("BKG-4", LUC),
						self.row("BKG-5", LUC),
						self.row("BKG-6", LUC),
						self.row("BKG-7", LUC),
						self.row("BKG-8", LUC),
						self.row("BKG-9", LUC),
						self.row("BKG-10", LUC),
					],
				)
			]
		)
		SITE["list"] = [
			{"booking": "BKG-7", "state": "paid", "invoice": "ACC-SINV-7"},
			{"booking": "BKG-8", "state": "absent"},
			# The money lane knows it from the same records as the time lane: it says it where the time lane says nothing
			{"booking": "BKG-9", "state": "finished"},
			{"booking": "BKG-10", "state": "started"},
		]
		SITE["clocks"] = {
			"BKG-4": {
				"status": "Finished",
				"active_seconds": 3300,
				"started_at": "2026-11-10 09:01:00",
				"ended_at": "2026-11-10 09:58:00",
			},
			"BKG-5": {"status": "In progress", "active_seconds": 600, "started_at": "2026-11-10 09:01:00"},
			"BKG-6": {"status": "Paused", "paused_by": "BKG-9"},
		}

		rows = {r["booking"]: r for r in self.agenda()["appointments"]}

		self.assertEqual(
			{b: r["state"] for b, r in rows.items()},
			{
				"BKG-1": "booked",
				"BKG-2": "absent",
				"BKG-3": "paid",
				"BKG-4": "finished",
				"BKG-5": "started",
				"BKG-6": "started",
				"BKG-7": "paid",
				"BKG-8": "absent",
				"BKG-9": "finished",
				"BKG-10": "started",
			},
		)
		self.assertEqual(rows["BKG-4"]["clock"]["active_seconds"], 3300)
		self.assertEqual(rows["BKG-5"]["clock"]["state"], "running")
		self.assertEqual(
			(rows["BKG-6"]["clock"]["state"], rows["BKG-6"]["clock"]["paused_by"]), ("paused", "BKG-9")
		)
		self.assertEqual(rows["BKG-1"]["clock"]["state"], "idle")

	def test_the_clock_carries_no_cost_and_no_margin_whatever_the_time_lane_says(self):
		self.site_has("day", "clocks")
		self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])
		SITE["clocks"] = {"BKG-1": {"status": "In progress", "cost": 42.0, "margin": 12.0, "hourly_cost": 30}}

		clock = self.agenda()["appointments"][0]["clock"]

		self.assertEqual(set(clock), {"state", "started_at", "ended_at", "active_seconds", "paused_by"})

	def test_the_time_lane_is_asked_for_the_bookings_of_the_day_and_not_for_a_busy_one(self):
		self.site_has("day", "clocks")
		self.a_day(
			people=[
				self.person(LUC, appointments=[self.row("BKG-1", LUC)]),
				self.person(SONIA, appointments=[self.busy(SONIA)]),
			]
		)

		self.agenda()

		self.assertEqual(
			[c for c in SITE["calls"] if c[0] == "clocks"], [("clocks", ["BKG-1"], self.fx.profile)]
		)

	def test_a_clock_that_cannot_be_read_or_a_site_with_no_time_lane_leaves_every_clock_idle(self):
		for hooks in (("day",), ("day", "clocks")):
			with self.subTest(hooks=hooks):
				SITE.clear()
				self.site_has(*hooks)
				self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])
				SITE["clocks"] = "not a dict"

				self.assertEqual(self.agenda()["appointments"][0]["clock"]["state"], "idle")
				# A site with no time lane is not asked anything
				if "clocks" not in hooks:
					self.assertNotIn("clocks", [c[0] for c in SITE["calls"]])

	def test_the_time_lane_that_refuses_leaves_the_clocks_idle_and_the_agenda_standing(self):
		self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])
		table = {
			appointments.DAY_HOOK: [f"{ME}.the_day"],
			appointments.TIME_STATE_HOOK: [f"{ME}.a_clock_that_refuses"],
		}
		# The old names of the extension points are empty too: the lanes of the work site do not answer for the suite
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		real = frappe.get_hooks
		with patch(
			"frappe.get_hooks",
			side_effect=lambda hook=None, *a, **k: table[hook] if hook in table else real(hook, *a, **k),
		):
			answer = self.agenda()

		self.assertEqual(answer["appointments"][0]["clock"]["state"], "idle")

	def test_the_unassigned_appointments_are_in_the_agenda_with_no_person(self):
		self.site_has("day")
		self.a_day(
			people=[self.person(LUC)],
			unassigned=[self.row("BKG-9", None, sales_person_name=None, starts="2026-11-10 15:00:00")],
		)

		rows = self.agenda()["appointments"]

		self.assertEqual([(r["booking"], r["steps"][0]["sales_person"]) for r in rows], [("BKG-9", None)])

	def test_the_appointments_are_sorted_by_hour(self):
		self.site_has("day")
		self.a_day(
			people=[
				self.person(
					LUC,
					appointments=[
						self.row("BKG-2", LUC, starts="2026-11-10 14:00:00"),
						self.row("BKG-1", LUC),
					],
				)
			]
		)

		self.assertEqual([r["booking"] for r in self.agenda()["appointments"]], ["BKG-1", "BKG-2"])

	def test_the_people_asked_for_filter_the_agenda_but_not_the_columns(self):
		self.site_has("day")
		self.a_day(
			people=[
				self.person(LUC, appointments=[self.row("BKG-1", LUC)]),
				self.person(SONIA, appointments=[self.row("BKG-2", SONIA, starts="2026-11-10 11:00:00")]),
			]
		)
		frappe.set_user(TILL)
		try:
			answer = appointments.get_appointments(self.fx.profile, "2026-11-10", [SONIA])
		finally:
			frappe.set_user("Administrator")

		self.assertEqual([r["booking"] for r in answer["appointments"]], ["BKG-2"])
		self.assertEqual(len(answer["people"]), 2)

	# What the money lane says the cashier may do

	def test_what_the_money_lane_says_the_cashier_may_do_can_only_take_gestures_away(self):
		self.site_has("day", "list", "move", "cancel", "time_action")
		self.a_day(
			people=[
				self.person(
					LUC,
					appointments=[
						self.row("BKG-1", LUC),
						self.row("BKG-2", LUC, starts="2026-11-10 11:00:00"),
						self.row("BKG-3", LUC, starts="2026-11-10 12:00:00"),
					],
				)
			]
		)
		SITE["list"] = [
			# A draft is open in the till: the lane keeps the appointment from being moved or cancelled
			{
				"booking": "BKG-1",
				"state": "booked",
				"in_the_till": True,
				"can": {"collect": True, "move": False, "cancel": False, "clock": True},
			},
			# The lane allows everything: what the state and the site allow stays
			{
				"booking": "BKG-2",
				"state": "booked",
				"can": {"collect": True, "move": True, "cancel": True, "clock": True},
			},
			# The lane says nothing about it: the till's own rule
			{"booking": "BKG-3", "state": "booked"},
		]

		rows = {r["booking"]: r["can"] for r in self.agenda()["appointments"]}

		self.assertEqual(rows["BKG-1"], {"collect": True, "move": False, "cancel": False, "clock": True})
		self.assertEqual(rows["BKG-2"], {"collect": True, "move": True, "cancel": True, "clock": True})
		self.assertEqual(rows["BKG-3"], {"collect": True, "move": True, "cancel": True, "clock": True})

	def test_what_the_money_lane_allows_never_gives_a_gesture_the_site_or_the_state_does_not_have(self):
		self.site_has("day", "list", "move")
		self.a_day(
			people=[
				self.person(
					LUC,
					appointments=[
						self.row("BKG-1", LUC),
						self.row("BKG-2", LUC, payment_status="Paid", starts="2026-11-10 11:00:00"),
					],
				)
			]
		)
		everything = {"collect": True, "move": True, "cancel": True, "clock": True}
		SITE["list"] = [
			{"booking": "BKG-1", "state": "booked", "can": everything},
			{"booking": "BKG-2", "state": "booked", "can": everything},
		]

		rows = {r["booking"]: r["can"] for r in self.agenda()["appointments"]}

		# No cancel and no time hook on this site; a paid one lets nothing be done to it
		self.assertEqual(rows["BKG-1"], {"collect": True, "move": True, "cancel": False, "clock": False})
		self.assertEqual(rows["BKG-2"], dict.fromkeys(("collect", "move", "cancel", "clock"), False))

	# How the salon stands on the day, and what was booked on a day it closes

	def test_a_day_the_planning_lane_does_not_say_how_the_salon_stands_has_no_salon(self):
		self.site_has("day")
		self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])

		answer = self.agenda()

		self.assertIsNone(answer["salon"])
		self.assertFalse(answer["appointments"][0]["to_handle"])

	def test_the_salon_block_is_read_with_only_the_keys_the_till_knows(self):
		self.site_has("day")
		self.a_day(
			salon={
				"state": "special",
				"reason": "special_hours",
				"label": "x" * 500,
				"periods": [["10:00", "14:00"], ["bad"], ["25:0", "26"], "no", ["15:00", "18:00"]],
				"secret": "never shown",
			}
		)

		salon = self.agenda()["salon"]

		self.assertEqual(set(salon), {"state", "reason", "label", "periods"})
		self.assertEqual((salon["state"], salon["reason"]), ("special", "special_hours"))
		self.assertEqual(len(salon["label"]), 140)
		self.assertEqual(salon["periods"], [["10:00", "14:00"], ["15:00", "18:00"]])

	def test_a_state_the_till_does_not_know_is_no_salon_and_a_reason_it_does_not_know_is_no_reason(self):
		self.site_has("day")
		for block in ("closed", ["closed"], {"state": "dancing"}, {"reason": "holiday"}):
			with self.subTest(block=str(block)):
				self.a_day(salon=block)
				self.assertIsNone(self.agenda()["salon"])
		self.a_day(salon=self.a_salon(reason="because", label=None))

		self.assertEqual(self.agenda()["salon"]["reason"], None)

	def test_on_a_closed_day_what_was_booked_and_nobody_has_begun_is_to_handle(self):
		self.site_has("day", "list", "clocks")
		self.a_day(
			salon=self.a_salon(),
			people=[
				self.person(
					LUC,
					appointments=[
						self.row("BKG-1", LUC),
						self.row("BKG-2", LUC, starts="2026-11-10 10:00:00"),
						self.row("BKG-3", LUC, payment_status="Paid", starts="2026-11-10 11:00:00"),
						self.row("BKG-4", LUC, attendance="No Show", starts="2026-11-10 12:00:00"),
						self.row("BKG-5", LUC, starts="2026-11-10 13:00:00"),
						self.row("BKG-6", LUC, starts="2026-11-10 14:00:00"),
					],
				),
				self.person(SONIA, appointments=[self.busy(SONIA)]),
			],
		)
		SITE["clocks"] = {"BKG-2": {"status": "In progress"}, "BKG-6": {"status": "Finished"}}
		SITE["list"] = [{"booking": "BKG-5", "state": "booked", "in_the_till": True, "invoice": "ACC-SINV-5"}]

		rows = {r["key"]: r for r in self.agenda()["appointments"]}

		self.assertEqual(
			{key: row["to_handle"] for key, row in rows.items()},
			{
				"BKG-1": "closed",
				# Under way, paid, absent, finished, or held in the till by a cashier: nothing to handle
				"BKG-2": None,
				"BKG-3": None,
				"BKG-4": None,
				"BKG-5": None,
				"BKG-6": None,
				# A colleague's busy hour: seventh of the day (the six of Luc come first)
				"busy-6": None,
			},
		)
		# Nothing is cancelled or changed by the till: the appointment stays what the lanes said
		self.assertEqual(rows["BKG-1"]["state"], "booked")

	def test_on_an_open_day_or_one_with_other_hours_nothing_is_to_handle(self):
		self.site_has("day", "move", "cancel")
		for block in (
			self.a_salon(state="open", reason=None, label=None, periods=[["09:00", "18:00"]]),
			self.a_salon(
				state="special", reason="special_hours", label="Late opening", periods=[["10:00", "14:00"]]
			),
		):
			with self.subTest(state=block["state"]):
				self.a_day(salon=block, people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])
				answer = self.agenda()

				self.assertEqual(answer["salon"]["state"], block["state"])
				self.assertFalse(answer["appointments"][0]["to_handle"])

	def test_a_closed_day_does_not_take_the_gestures_away_from_what_was_booked(self):
		self.site_has("day", "move", "cancel")
		self.a_day(salon=self.a_salon(), people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])

		row = self.agenda()["appointments"][0]

		# The cashier moves it or cancels it with the customer: the day being closed takes nothing away
		self.assertEqual(row["can"], {"collect": True, "move": True, "cancel": True, "clock": False})
		self.assertEqual(row["to_handle"], "closed")

	def test_the_planning_lane_says_on_each_appointment_why_it_needs_somebody_and_only_a_word_it_knows_counts(
		self,
	):
		self.site_has("day", "list", "clocks")
		self.a_day(
			salon=self.a_salon(state="open", reason=None, label=None, periods=[["09:00", "18:00"]]),
			people=[
				self.person(
					LUC,
					state="on_leave",
					appointments=[
						self.row("BKG-1", LUC, to_handle="away"),
						self.row("BKG-2", LUC, to_handle="closed", starts="2026-11-10 10:00:00"),
						self.row("BKG-3", LUC, to_handle="dancing", starts="2026-11-10 11:00:00"),
						self.row("BKG-4", LUC, to_handle=None, starts="2026-11-10 12:00:00"),
						# Under way, paid, held in the till: the lane's word changes nothing for the till
						self.row("BKG-5", LUC, to_handle="away", starts="2026-11-10 13:00:00"),
						self.row(
							"BKG-6",
							LUC,
							to_handle="away",
							payment_status="Paid",
							starts="2026-11-10 14:00:00",
						),
						self.row("BKG-7", LUC, to_handle="away", starts="2026-11-10 15:00:00"),
					],
				)
			],
		)
		SITE["clocks"] = {"BKG-5": {"status": "In progress"}}
		SITE["list"] = [{"booking": "BKG-7", "state": "booked", "in_the_till": True, "invoice": "ACC-SINV-7"}]

		rows = {r["booking"]: r["to_handle"] for r in self.agenda()["appointments"]}

		self.assertEqual(
			rows,
			{
				"BKG-1": "away",
				"BKG-2": "closed",
				"BKG-3": None,
				"BKG-4": None,
				"BKG-5": None,
				"BKG-6": None,
				"BKG-7": None,
			},
		)

	def test_a_closed_day_keeps_the_word_the_lane_gave_to_an_appointment_and_says_closed_for_the_others(self):
		self.site_has("day")
		self.a_day(
			salon=self.a_salon(),
			people=[
				self.person(
					LUC,
					appointments=[
						self.row("BKG-1", LUC, to_handle="away"),
						self.row("BKG-2", LUC, starts="2026-11-10 10:00:00"),
					],
				)
			],
		)

		rows = {r["booking"]: r["to_handle"] for r in self.agenda()["appointments"]}

		self.assertEqual(rows, {"BKG-1": "away", "BKG-2": "closed"})

	# What a colleague's appointment says

	def test_a_busy_appointment_carries_no_name_no_service_no_amount_and_no_gesture(self):
		self.site_has("day", "list", "clocks", "move", "cancel", "time_action")
		self.a_day(
			visibility="own",
			people=[
				self.person(SONIA, appointments=[self.busy(SONIA), self.busy(SONIA, "2026-11-10 12:00:00")])
			],
		)
		SITE["list"] = [{"booking": "BKG-1", "amount": 120.0, "state": "booked", "in_the_till": True}]

		rows = self.agenda()["appointments"]

		self.assertEqual([r["key"] for r in rows], ["busy-0", "busy-1"])
		row = rows[0]
		self.assertEqual(
			(row["booking"], row["customer"], row["customer_name"], row["invoice"]), (None, None, None, None)
		)
		self.assertEqual((row["amount"], row["paid_amount"], row["in_the_till"]), (0.0, 0.0, False))
		self.assertEqual(row["can"], {"collect": False, "move": False, "cancel": False, "clock": False})
		step = row["steps"][0]
		self.assertEqual((step["label"], step["item_code"], step["options"]), (None, None, None))
		# What stays is when, and who is busy
		self.assertEqual((step["starts_at"], step["sales_person"]), ("2026-11-10 10:00:00", SONIA))
		self.assertTrue(row["busy"])

	def test_the_whole_salon_may_be_worked_by_a_cashier_who_sees_it_all_within_what_the_state_allows(self):
		self.site_has("day", "move", "cancel", "time_action")
		self.a_day(
			visibility="all",
			people=[
				self.person(
					SONIA,
					appointments=[
						self.row("BKG-1", SONIA),
						self.row("BKG-2", SONIA, payment_status="Paid"),
						self.row("BKG-3", SONIA, attendance="No Show"),
					],
				)
			],
		)

		rows = {r["booking"]: r["can"] for r in self.agenda()["appointments"]}

		self.assertEqual(rows["BKG-1"], {"collect": True, "move": True, "cancel": True, "clock": True})
		self.assertEqual(rows["BKG-2"], dict.fromkeys(("collect", "move", "cancel", "clock"), False))
		self.assertEqual(rows["BKG-3"], dict.fromkeys(("collect", "move", "cancel", "clock"), False))

	def test_a_cashier_who_sees_only_her_own_may_work_only_her_own(self):
		self.site_has("day", "move", "cancel", "time_action")
		self.a_day(
			visibility="own",
			people=[
				self.person(LUC, appointments=[self.row("BKG-1", LUC)]),
				self.person(SONIA, appointments=[self.row("BKG-2", SONIA, starts="2026-11-10 11:00:00")]),
			],
			unassigned=[self.row("BKG-3", None, starts="2026-11-10 12:00:00")],
		)

		rows = {r["booking"]: r["can"] for r in self.agenda()["appointments"]}

		self.assertTrue(all(rows["BKG-1"].values()))
		self.assertFalse(any(rows["BKG-2"].values()))
		self.assertFalse(any(rows["BKG-3"].values()))

	def test_a_gesture_the_site_does_not_have_is_not_allowed_on_any_appointment(self):
		self.site_has("day")
		self.a_day(people=[self.person(LUC, appointments=[self.row("BKG-1", LUC)])])

		answer = self.agenda()

		self.assertEqual(
			answer["appointments"][0]["can"],
			{"collect": True, "move": False, "cancel": False, "clock": False},
		)
		self.assertEqual(
			answer["capabilities"],
			dict.fromkeys(("check_move", "move", "cancel", "clock", "repeat", "book"), False),
		)

	def test_the_capabilities_are_the_gestures_the_site_declares(self):
		self.site_has("day", "move", "check_move", "time_action", "services", "slots", "book", "repeat")
		self.a_day()

		self.assertEqual(
			self.agenda()["capabilities"],
			{"check_move": True, "move": True, "cancel": False, "clock": True, "repeat": True, "book": True},
		)

	# What is refused

	def test_a_day_view_that_is_not_a_day_is_refused(self):
		self.site_has("day")
		for answer in ("a day", 5, ["x"], {"people": "x"}, {"unassigned": "x"}):
			with self.subTest(answer=str(answer)):
				SITE["day"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.agenda()

	def test_an_agenda_is_asked_by_a_cashier_of_the_till_only(self):
		self.site_has("day")
		self.a_day()
		for user in ("Guest", OTHER_TILL):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.agenda(user)

		self.assertNotIn("calls", SITE)
