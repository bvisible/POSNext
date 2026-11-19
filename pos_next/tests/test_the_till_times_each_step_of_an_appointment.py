# //// Neoffice — added file (no upstream equivalent).
"""The time of each step of an appointment done in several times, at the till (NeoSalon, voie 4, 19.11.2026).

A colour is several bookings of several people (the application, the pose where nobody is needed, the rinse and the cut): ONE appointment for the
cashier, but a clock per step. The till asks the time lane where each step stands (a step is a booking of its own), says it step by step, and
carries the appointment's own clock as the sum of them. Each step says whether THIS cashier may time it; the gesture names the step's booking.
When the sale of an appointment is booked, the time lane is told to `close` the whole appointment (every step), and a lane that does not know that
gesture yet (a reservation app not updated) is told the older way. The suite plays the till's side with stand-ins for the lanes, as the real cashier:

- that every step of an appointment of several steps carries the clock the time lane gave it, and an appointment of one step carries what it did;
- that the appointment's clock is the sum of its steps (running if one runs, in pause if one is, done when all are, the length worked added up);
- that a step can be timed only by a cashier who may work its person, on its day, while the appointment is not paid, finished or absent;
- that a gesture on a step reaches the time lane with the step's own booking, and that a colleague's step is refused;
- that a sale closes every step through `close`, falls back to the older gesture when the lane refuses `close`, and never raises.
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

ME = "pos_next.tests.test_the_till_times_each_step_of_an_appointment"
SITE = {}
DAY = "2026-11-10"


def the_list(pos_profile, date, providers=None):
	return SITE["list"]


def the_day(pos_profile, date):
	return SITE["day"]


def the_state(bookings, pos_profile):
	SITE.setdefault("asked", []).append(list(bookings))
	return {booking: SITE["state"][booking] for booking in bookings if booking in SITE["state"]}


def time_action(*args):
	SITE.setdefault("actions", []).append(args)
	return SITE.get("answer", {"status": "Finished"})


def a_lane_that_does_not_know_close(booking, action, pos_profile, employee=None):
	SITE.setdefault("actions", []).append((booking, action, pos_profile, employee))
	if action == "close":
		frappe.throw("Unknown gesture close.")
	return {"status": "Finished"}


def a_lane_that_breaks(*args):
	raise RuntimeError("the time lane is broken")


def a_state(status, seconds=0, **values):
	return {"status": status, "active_seconds": seconds, **values}


class TestTheTillTimesEachStepOfAnAppointment(FrappeTestCase):
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
		self.luc_employee = an_employee(LUC_FIRST_NAME, self.fx.company, user_id=TILL)
		self.luc = a_sales_person(LUC, self.luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, None, self.fx.company, commission_rate=15)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", 1)

	def site_has(self, **hooks):
		"""The hooks the site declares: `of_the_day`, `day`, `time_state`, `time_action` (lists of the stand-ins' names)."""
		table = {
			getattr(appointments, name): []
			for name in dir(appointments)
			if name.endswith("_HOOK") and isinstance(getattr(appointments, name), str)
		}
		for name, hook in (
			("of_the_day", appointments.LIST_HOOK),
			("day", appointments.DAY_HOOK),
			("time_state", appointments.TIME_STATE_HOOK),
			("time_action", appointments.TIME_ACTION_HOOK),
		):
			table[hook] = [f"{ME}.{path}" for path in hooks.get(name, [])]
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
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

	def a_colour(self, **changes):
		"""The application (Luc, 09:00), a pose of half an hour, the rinse and the cut (Sonia, 10:00), the finish (Luc, 10:45): three steps."""
		steps = [
			("COL-1", "Application", "Luc", "09:00", "09:30"),
			("COL-2", "Rinse and cut", "Sonia", "10:00", "10:45"),
			("COL-3", "Finish", "Luc", "10:45", "11:00"),
		]
		appointment = {
			"booking": "COL-1",
			"starts_at": f"{DAY} 09:00:00",
			"ends_at": f"{DAY} 11:00:00",
			"customer": "CUST-0007",
			"customer_name": "Mme Dupont",
			"steps": [
				{
					"booking": booking,
					"label": label,
					"item_code": "SRV-" + booking,
					"starts_at": f"{DAY} {start}:00",
					"ends_at": f"{DAY} {end}:00",
					"sales_person": person,
					"sales_person_name": person,
				}
				for booking, label, person, start, end in steps
			],
			"amount": 150.0,
			"paid_amount": 0.0,
			"state": "booked",
			"in_the_till": False,
			"invoice": None,
			"can": {"collect": 1, "move": 1, "cancel": 1, "clock": 1},
		}
		appointment.update(changes)
		return appointment

	def the_agenda(self):
		return self.as_the_cashier(appointments.get_appointments, self.fx.profile, DAY)

	def a_day_where(self, *held, visibility="all"):
		"""The planning lane's day view: the bookings `(booking, sales person, from, to)` held, each in the column of its person."""
		columns = {}
		for booking, person, start, end in held:
			column = columns.setdefault(
				person,
				{
					"user": f"{person}@yopmail.com",
					"sales_person": person,
					"sales_person_name": person,
					"appointments": [],
				},
			)
			column["appointments"].append(
				{
					"booking": booking,
					"sales_person": person,
					"starts_at": f"{DAY} {start}:00",
					"ends_at": f"{DAY} {end}:00",
				}
			)
		return {"visibility": visibility, "people": list(columns.values()), "unassigned": []}

	# The clock of each step

	def test_every_step_of_an_appointment_in_several_times_carries_the_clock_the_time_lane_gave_it(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {
			"COL-1": a_state("Finished", 1800, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:30:00"),
			"COL-2": a_state("In progress", 600, started_at=f"{DAY} 10:00:00", paused_by="COL-9"),
			"COL-3": a_state("Not started"),
		}

		(row,) = self.the_agenda()["appointments"]

		clocks = [step["clock"] for step in row["steps"]]
		self.assertEqual([c["state"] for c in clocks], ["done", "running", "idle"])
		self.assertEqual([c["active_seconds"] for c in clocks], [1800, 600, 0])
		self.assertEqual(
			(clocks[0]["started_at"], clocks[0]["ended_at"]), (f"{DAY} 09:00:00", f"{DAY} 09:30:00")
		)
		self.assertEqual(clocks[1]["paused_by"], "COL-9")

	def test_the_time_lane_is_asked_once_for_every_step_of_the_appointments_of_several_steps(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {}

		self.the_agenda()

		self.assertEqual(SITE["asked"], [["COL-1", "COL-2", "COL-3"]])

	def test_no_cost_and_no_margin_reaches_the_till_with_a_step(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {"COL-1": a_state("In progress", 60, cost=12.5, margin=40.0, hourly_rate=60)}

		(row,) = self.the_agenda()["appointments"]

		self.assertEqual(
			set(row["steps"][0]["clock"]),
			{"state", "started_at", "ended_at", "active_seconds", "paused_by", "estimated"},
		)

	def test_a_step_the_lane_does_not_know_stays_idle_and_a_lane_that_breaks_leaves_every_step_idle(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {"COL-2": a_state("Paused", 300)}

		(row,) = self.the_agenda()["appointments"]
		self.assertEqual([s["clock"]["state"] for s in row["steps"]], ["idle", "paused", "idle"])

		self.site_has(of_the_day=["the_list"], time_state=["a_lane_that_breaks"], time_action=["time_action"])
		(row,) = self.the_agenda()["appointments"]
		self.assertEqual([s["clock"]["state"] for s in row["steps"]], ["idle", "idle", "idle"])

	def test_the_time_lane_is_asked_once_for_the_bookings_of_the_day_view_and_the_steps_together(self):
		self.site_has(
			of_the_day=["the_list"], day=["the_day"], time_state=["the_state"], time_action=["time_action"]
		)
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {
			"COL-1": a_state("Finished", 600, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:10:00"),
			"COL-2": a_state("In progress", 300, started_at=f"{DAY} 10:00:00"),
		}
		SITE["day"] = self.a_day_where(
			("COL-1", self.luc, "09:00", "09:30"), ("COL-2", self.sonia, "10:00", "10:45")
		)

		rows = self.the_agenda()["appointments"]

		self.assertEqual(SITE["asked"], [["COL-1", "COL-2", "COL-3"]])
		colour = next(row for row in rows if row["booking"] == "COL-1")
		self.assertEqual([s["clock"]["state"] for s in colour["steps"]], ["done", "running", "idle"])

	def test_a_first_step_done_does_not_make_the_appointment_finished_while_another_is_still_to_do(self):
		self.site_has(
			of_the_day=["the_list"], day=["the_day"], time_state=["the_state"], time_action=["time_action"]
		)
		SITE["list"] = [self.a_colour(state="started")]
		SITE["state"] = {
			"COL-1": a_state("Finished", 600, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:10:00"),
			"COL-2": a_state("Not started"),
			"COL-3": a_state("Not started"),
		}
		SITE["day"] = self.a_day_where(("COL-1", self.luc, "09:00", "09:30"))

		colour = next(row for row in self.the_agenda()["appointments"] if row["booking"] == "COL-1")

		self.assertEqual(colour["state"], "started", "the first step is done, the colour is not")
		self.assertEqual(colour["clock"]["state"], "idle")

	def test_an_appointment_whose_steps_are_all_done_is_finished_and_one_that_runs_is_started(self):
		self.site_has(
			of_the_day=["the_list"], day=["the_day"], time_state=["the_state"], time_action=["time_action"]
		)
		SITE["day"] = self.a_day_where(("COL-1", self.luc, "09:00", "09:30"))
		done = a_state("Finished", 600, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:10:00")
		for name, states, stands, expected in (
			("all done", [done, done, done], "finished", "finished"),
			("one runs", [done, a_state("In progress", 60), a_state("Not started")], "started", "started"),
			("one in pause", [a_state("Paused", 60), done, a_state("Not started")], "started", "started"),
		):
			with self.subTest(name):
				SITE["list"] = [self.a_colour(state=stands)]
				SITE["state"] = {f"COL-{n}": state for n, state in enumerate(states, 1)}

				colour = next(row for row in self.the_agenda()["appointments"] if row["booking"] == "COL-1")

				self.assertEqual(colour["state"], expected)

	def test_an_appointment_of_one_step_keeps_its_clock_and_asks_the_time_lane_nothing_more(self):
		self.site_has(
			of_the_day=["the_list"], day=["the_day"], time_state=["the_state"], time_action=["time_action"]
		)
		appointment = self.a_colour()
		appointment["steps"] = appointment["steps"][:1]
		SITE["list"] = [appointment]
		SITE["state"] = {"COL-1": a_state("In progress", 900, started_at=f"{DAY} 09:00:00")}
		SITE["day"] = self.a_day_where(("COL-1", self.luc, "09:00", "09:30"))

		(row,) = self.the_agenda()["appointments"]

		self.assertEqual(
			SITE["asked"],
			[["COL-1"]],
			"one step: the clock of the day view is the step's, nothing to ask apart",
		)
		self.assertEqual((row["clock"]["state"], row["clock"]["active_seconds"]), ("running", 900))
		self.assertEqual(row["steps"][0]["clock"], row["clock"])

	# The clock of the appointment is the sum of its steps

	def test_the_clock_of_an_appointment_is_running_when_a_step_runs_and_adds_the_time_worked_up(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {
			"COL-1": a_state("Finished", 1800, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:30:00"),
			"COL-2": a_state("In progress", 600, started_at=f"{DAY} 10:00:00"),
			"COL-3": a_state("Not started"),
		}

		(row,) = self.the_agenda()["appointments"]

		clock = row["clock"]
		self.assertEqual((clock["state"], clock["active_seconds"]), ("running", 2400))
		self.assertEqual((clock["started_at"], clock["ended_at"]), (f"{DAY} 09:00:00", None))
		self.assertFalse(clock["estimated"])

	def test_the_clock_of_an_appointment_by_where_its_steps_stand(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		finished = a_state("Finished", 600, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:10:00")
		for name, states, expected in (
			("one in pause, none running", ["Finished", "Paused", "Not started"], "paused"),
			("one running and another in pause", ["Paused", "In progress", "Not started"], "running"),
			("all done", ["Finished", "Finished", "Finished"], "done"),
			("none begun", ["Not started", "Not started", "Not started"], "idle"),
			("some done, the rest still to do", ["Finished", "Not started", "Not started"], "idle"),
		):
			with self.subTest(name):
				SITE["state"] = {
					f"COL-{n}": (finished if status == "Finished" else a_state(status, 60))
					for n, status in enumerate(states, 1)
				}
				(row,) = self.the_agenda()["appointments"]
				self.assertEqual(row["clock"]["state"], expected)

	def test_the_clock_of_a_finished_appointment_ends_when_its_last_step_ended_and_says_when_one_is_an_estimate(
		self,
	):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {
			"COL-1": a_state("Finished", 100, started_at=f"{DAY} 09:00:00", ended_at=f"{DAY} 09:05:00"),
			"COL-2": a_state(
				"Finished", 200, started_at=f"{DAY} 10:00:00", ended_at=f"{DAY} 10:30:00", estimated=1
			),
			"COL-3": a_state("Finished", 300, started_at=f"{DAY} 10:45:00", ended_at=f"{DAY} 10:55:00"),
		}

		(row,) = self.the_agenda()["appointments"]

		clock = row["clock"]
		self.assertEqual((clock["state"], clock["active_seconds"]), ("done", 600))
		self.assertEqual((clock["started_at"], clock["ended_at"]), (f"{DAY} 09:00:00", f"{DAY} 10:55:00"))
		self.assertTrue(clock["estimated"])

	# Who may time a step

	def test_a_step_can_be_timed_by_a_cashier_who_sees_the_whole_salon_while_the_appointment_allows_it(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {}

		(row,) = self.the_agenda()["appointments"]

		self.assertEqual([step["can_time"] for step in row["steps"]], [True, True, True])

	def test_nothing_of_the_time_is_offered_when_the_appointment_is_paid_finished_or_absent_or_the_site_has_no_time_lane(
		self,
	):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["state"] = {}
		for state in ("paid", "finished", "absent"):
			with self.subTest(state):
				SITE["list"] = [
					self.a_colour(state=state, can={"collect": 0, "move": 0, "cancel": 0, "clock": 0})
				]
				(row,) = self.the_agenda()["appointments"]
				self.assertEqual([step["can_time"] for step in row["steps"]], [False, False, False])
		with self.subTest("no time lane"):
			self.site_has(of_the_day=["the_list"])
			SITE["list"] = [self.a_colour()]
			(row,) = self.the_agenda()["appointments"]
			self.assertEqual([step["can_time"] for step in row["steps"]], [False, False, False])

	def test_a_step_that_is_not_of_the_day_of_the_agenda_or_names_no_booking_cannot_be_timed(self):
		self.site_has(of_the_day=["the_list"], time_state=["the_state"], time_action=["time_action"])
		SITE["state"] = {}
		appointment = self.a_colour()
		appointment["steps"][1]["starts_at"] = "2026-11-11 10:00:00"
		appointment["steps"][1]["ends_at"] = "2026-11-11 10:45:00"
		del appointment["steps"][2]["booking"]
		SITE["list"] = [appointment]

		(row,) = self.the_agenda()["appointments"]

		self.assertEqual([step["can_time"] for step in row["steps"]], [True, False, False])

	def test_a_cashier_who_may_only_read_her_own_times_only_the_steps_of_her_own_person(self):
		self.site_has(
			of_the_day=["the_list"], day=["the_day"], time_state=["the_state"], time_action=["time_action"]
		)
		SITE["list"] = [self.a_colour()]
		SITE["state"] = {}
		SITE["day"] = self.a_day_where(("COL-1", self.luc, "09:00", "09:30"), visibility="own")
		# The money lane names the persons as the planning lane does: Luc's steps are hers, Sonia's are not
		SITE["list"][0]["steps"][0]["sales_person"] = self.luc
		SITE["list"][0]["steps"][2]["sales_person"] = self.luc
		SITE["list"][0]["steps"][1]["sales_person"] = self.sonia

		rows = self.the_agenda()["appointments"]

		colour = next(row for row in rows if row["booking"] == "COL-1")
		self.assertEqual([step["can_time"] for step in colour["steps"]], [True, False, True])

	# A gesture on a step

	def test_a_gesture_on_a_step_reaches_the_time_lane_with_the_booking_of_that_step(self):
		self.site_has(day=["the_day"], time_action=["time_action"])
		SITE["day"] = self.a_day_where(("COL-2", self.sonia, "10:00", "10:45"))
		SITE["answer"] = a_state("In progress", 0, started_at=f"{DAY} 10:00:00")

		answer = self.as_the_cashier(
			appointments.clock_appointment, "COL-2", self.fx.profile, "start", date=DAY
		)

		self.assertEqual(SITE["actions"], [("COL-2", "start", self.fx.profile, None)])
		self.assertEqual((answer["booking"], answer["clock"]["state"]), ("COL-2", "running"))

	def test_a_gesture_on_a_colleagues_step_is_refused_before_the_time_lane_hears_of_it(self):
		self.site_has(day=["the_day"], time_action=["time_action"])
		SITE["day"] = self.a_day_where(("COL-2", self.sonia, "10:00", "10:45"), visibility="own")

		with self.assertRaises(frappe.PermissionError):
			self.as_the_cashier(appointments.clock_appointment, "COL-2", self.fx.profile, "start", date=DAY)

		self.assertNotIn("actions", SITE)

	# The sale closes every step

	def test_a_sale_tells_the_time_lane_to_close_the_whole_appointment_without_reading_its_clock_first(self):
		self.site_has(time_state=["the_state"], time_action=["time_action"])
		SITE["state"] = {}

		appointments.after_a_sale("COL-1", "INV-1", self.fx.profile, False, date=DAY)

		self.assertEqual(SITE["actions"], [("COL-1", "close", self.fx.profile, None)])
		self.assertNotIn("asked", SITE)

	def test_a_time_lane_that_does_not_know_close_yet_is_told_the_older_way_from_where_the_first_step_stands(
		self,
	):
		self.site_has(time_state=["the_state"], time_action=["a_lane_that_does_not_know_close"])
		for status, expected in (
			("Not started", "close_unmeasured"),
			("In progress", "finish"),
			("Paused", "finish"),
			("Finished", None),
		):
			with self.subTest(status):
				SITE.pop("actions", None)
				SITE["state"] = {"COL-1": a_state(status, 60)}

				appointments.after_a_sale("COL-1", "INV-1", self.fx.profile, False, date=DAY)

				older = [call[1] for call in SITE["actions"][1:]]
				self.assertEqual((SITE["actions"][0][1], older), ("close", [expected] if expected else []))

	def test_a_sale_never_raises_whatever_the_time_lane_does(self):
		for lane in ("a_lane_that_breaks", "a_lane_that_does_not_know_close"):
			with self.subTest(lane):
				self.site_has(time_state=["the_state"], time_action=[lane])
				SITE["state"] = {}

				appointments.after_a_sale("COL-1", "INV-1", self.fx.profile, False, date=DAY)

	def test_a_site_with_no_time_lane_closes_nothing_and_says_nothing(self):
		self.site_has()

		appointments.after_a_sale("COL-1", "INV-1", self.fx.profile, False, date=DAY)

		self.assertNotIn("actions", SITE)
