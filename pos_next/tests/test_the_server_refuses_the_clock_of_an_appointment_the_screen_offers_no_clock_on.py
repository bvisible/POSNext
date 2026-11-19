# //// Neoffice — added file (no upstream equivalent).
"""The server holds what the screen hides: no clock on an absent, paid or finished appointment (NeoSalon, voie 4, 19.11.2026).

The sheet of an appointment shows no time button when the appointment is paid, finished or absent (`can.clock` = 0, `can_time` = False). The
gesture `clock_appointment` is the door the buttons call, and a cashier (or anything holding her session) can call it without them: played on osiris
with a cashier's own session, the start of an appointment marked « No Show » answered 200 and wrote a time record in progress (the time lane
only asks that the booking be confirmed). The screen's rule must also be the door's.

`test_the_clock_of_an_absent_appointment_is_refused` was marked as an expected failure while the door did not hold it (the tester's report of the
pass); the door now asks the money lane what may be done with the appointment (`_refuse_a_clock_the_sheet_hides`) and the mark is gone. The control
beside it (an appointment that allows its clock reaches the time lane) holds, so the refusal cannot be a door shut for everyone.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

ME = "pos_next.tests.test_the_server_refuses_the_clock_of_an_appointment_the_screen_offers_no_clock_on"
DAY = "2026-11-10"
SITE = {}


def the_list(pos_profile, date, providers=None):
	return SITE["list"]


def the_day(pos_profile, date):
	return SITE["day"]


def time_action(*args):
	SITE.setdefault("actions", []).append(args)
	return {"status": "In progress", "active_seconds": 0}


def an_appointment(**changes):
	appointment = {
		"booking": "ABS-1",
		"starts_at": f"{DAY} 09:00:00",
		"ends_at": f"{DAY} 09:45:00",
		"customer": "CUST-0007",
		"customer_name": "Mme Dupont",
		"steps": [
			{
				"booking": "ABS-1",
				"label": "Colour",
				"item_code": "SRV-ABS-1",
				"starts_at": f"{DAY} 09:00:00",
				"ends_at": f"{DAY} 09:45:00",
				"sales_person": "Luc",
				"sales_person_name": "Luc",
			}
		],
		"amount": 80.0,
		"paid_amount": 0.0,
		"state": "booked",
		"in_the_till": False,
		"invoice": None,
		"can": {"collect": 1, "move": 1, "cancel": 1, "clock": 1},
	}
	appointment.update(changes)
	return appointment


class TestTheServerRefusesTheClockOfAnAppointmentTheScreenOffersNoClockOn(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", 1)
		table = {
			getattr(appointments, name): []
			for name in dir(appointments)
			if name.endswith("_HOOK") and isinstance(getattr(appointments, name), str)
		}
		table[appointments.LIST_HOOK] = [f"{ME}.the_list"]
		table[appointments.DAY_HOOK] = [f"{ME}.the_day"]
		table[appointments.TIME_ACTION_HOOK] = [f"{ME}.time_action"]
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)
		SITE["day"] = {
			"visibility": "all",
			"people": [
				{
					"user": "luc@yopmail.com",
					"sales_person": "Luc",
					"sales_person_name": "Luc",
					"appointments": [
						{
							"booking": "ABS-1",
							"sales_person": "Luc",
							"starts_at": f"{DAY} 09:00:00",
							"ends_at": f"{DAY} 09:45:00",
						}
					],
				}
			],
			"unassigned": [],
		}

	def start(self):
		frappe.set_user(TILL)
		try:
			return appointments.clock_appointment("ABS-1", self.fx.profile, "start", date=DAY)
		finally:
			frappe.set_user("Administrator")

	def test_an_appointment_that_allows_its_clock_reaches_the_time_lane(self):
		SITE["list"] = [an_appointment()]

		answer = self.start()

		self.assertEqual(SITE["actions"], [("ABS-1", "start", self.fx.profile, None)])
		self.assertEqual(answer["clock"]["state"], "running")

	def test_the_clock_of_an_absent_appointment_is_refused(self):
		SITE["list"] = [
			an_appointment(state="absent", can={"collect": 0, "move": 0, "cancel": 0, "clock": 0})
		]

		with self.assertRaises((frappe.ValidationError, frappe.PermissionError)):
			self.start()

		self.assertNotIn(
			"actions", SITE, "the time lane was told to start the clock of an absent appointment"
		)
