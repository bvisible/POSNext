# //// Neoffice — added file (no upstream equivalent).
"""A cashier who may only read her own appointments does not work a colleague's (NeoSalon, step 2, lot G4; found on the work site, trying the screen
with a coiffeuse's session: she took, and started the time of, a colleague's appointment, which the agenda showed her as « busy »).

The agenda hides what a cashier may not read; the door of the gestures says the same, because a hidden button is not a permission. Each gesture on a
booking (take it, check a move, move it, cancel it, time it) reads the planning lane's day view of the day of the agenda it was touched on:

- an appointment of her own is worked; a colleague's is refused as `Not permitted` before any lane hears of it, whatever the booking sent;
- a cashier who reads the whole salon works a colleague's, but never a « busy » row, an appointment the day view does not hold, or one it holds for no one;
- the time of a colleague is not started by naming her (`sales_person`) on an appointment of her own;
- a planning lane that is declared and says nothing, or breaks, lets nothing be worked; a site with no day view has no one to hide anything from;
- the day read is the day of the agenda (today when none is sent);
- the sale of an appointment (`after_a_sale`) is held to the same rule: a colleague's appointment is left alone and said in the error log.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

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

ME = "pos_next.tests.test_the_till_refuses_a_colleagues_appointment_to_a_cashier_who_may_only_read_her_own"
SITE = {}
MINE, HERS, BUSY, NOONE, UNKNOWN = "BKG-LUC", "BKG-SONIA", "BKG-BUSY", "BKG-NOONE", "BKG-NOT-ON-THE-DAY"


def _record(name, *args):
	SITE.setdefault("calls", []).append((name, *args))
	return SITE.get("answer")


def day(*args):
	SITE.setdefault("day_asked", []).append(args)
	return SITE["view"]


def nothing_to_say(*args):
	SITE.setdefault("day_asked", []).append(args)
	return None


def breaks(*args):
	raise RuntimeError("the lane is broken")


def check_move(*args):
	return _record("check_move", *args)


def move(*args):
	return _record("move", *args)


def cancel(*args):
	return _record("cancel", *args)


def time_action(*args):
	return _record("time_action", *args)


def draft(*args):
	return _record("draft", *args)


def sold(*args):
	return _record("sold", *args)


def a_view(visibility):
	"""The day as the planning lane gives it: Luc's appointment, Sonia's, a busy row of Sonia's, and one that is no one's."""
	return {
		"visibility": visibility,
		"people": [
			{"sales_person": LUC, "appointments": [{"booking": MINE, "sales_person": LUC}]},
			{
				"sales_person": SONIA,
				"appointments": [
					{"booking": HERS, "sales_person": SONIA},
					{"booking": BUSY, "busy": 1, "sales_person": SONIA},
				],
			},
		],
		"unassigned": [{"booking": NOONE}],
	}


HOOKS = {
	"day": appointments.DAY_HOOK,
	"check_move": appointments.CHECK_MOVE_HOOK,
	"move": appointments.MOVE_HOOK,
	"cancel": appointments.CANCEL_HOOK,
	"time_action": appointments.TIME_ACTION_HOOK,
	"draft": appointments.DRAFT_HOOK,
	"sold": appointments.SOLD_HOOK,
}


class TestTheTillRefusesAColleaguesAppointmentToACashierWhoMayOnlyReadHerOwn(FrappeTestCase):
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
		# The cashier is Luc: the employee whose user she is, behind the sales person Luc
		self.luc_employee = an_employee(LUC_FIRST_NAME, self.fx.company, user_id=TILL)
		self.luc = a_sales_person(LUC, self.luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, None, self.fx.company, commission_rate=15)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", 1)
		SITE["answer"] = {"booking": "answered", "from": "2026-11-10 14:30:00", "to": "2026-11-10 16:00:00"}

	def site_has(self, **hooks):
		"""The hooks the site declares: `day=["day"]`, `move=["move"]`... every other one is empty."""
		# Every hook of the till's appointments is empty unless the test names it: the lanes of the work site do not answer for the suite
		table = {getattr(appointments, name): [] for name in dir(appointments) if name.endswith("_HOOK")}
		table.update({hook: [f"{ME}.{path}" for path in hooks.get(name, [])] for name, hook in HOOKS.items()})
		# The old names of the extension points are empty too: the lanes of the work site do not answer for the suite
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def the_whole_site(self, visibility="own", **more):
		SITE["view"] = a_view(visibility)
		self.site_has(
			day=["day"],
			check_move=["check_move"],
			move=["move"],
			cancel=["cancel"],
			time_action=["time_action"],
			draft=["draft"],
			**more,
		)

	def as_the_cashier(self, method, *args, **kwargs):
		frappe.set_user(TILL)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def every_gesture(self, booking, **extra):
		"""Each gesture on a booking: (name, call). `take` is read through a stand-in draft: only the door is the point here."""
		till = self.fx.profile
		day_of = {"date": extra["date"]} if "date" in extra else {}
		return [
			("take", lambda: self.as_the_cashier(appointments.take_appointment, booking, till, **day_of)),
			(
				"check_move",
				lambda: self.as_the_cashier(
					appointments.check_appointment_move, booking, till, "2026-11-10 16:00:00", **day_of
				),
			),
			(
				"move",
				lambda: self.as_the_cashier(
					appointments.move_appointment, booking, till, "2026-11-10 16:00:00", **day_of
				),
			),
			("cancel", lambda: self.as_the_cashier(appointments.cancel_appointment, booking, till, **day_of)),
			(
				"clock",
				lambda: self.as_the_cashier(appointments.clock_appointment, booking, till, "start", **day_of),
			),
		]

	def test_a_cashier_who_reads_only_her_own_works_none_of_a_colleagues(self):
		self.the_whole_site("own")

		for booking in (HERS, BUSY, NOONE, UNKNOWN):
			for name, gesture in self.every_gesture(booking):
				with (
					self.subTest(booking=booking, gesture=name),
					patch.object(appointments, "_draft", return_value={}),
				):
					with self.assertRaises(frappe.PermissionError):
						gesture()

		self.assertNotIn("calls", SITE)

	def test_a_cashier_who_reads_only_her_own_works_her_own(self):
		self.the_whole_site("own")

		with patch.object(appointments, "_draft", return_value={"booking": MINE}):
			for name, gesture in self.every_gesture(MINE):
				with self.subTest(gesture=name):
					gesture()

		self.assertEqual(
			sorted({call[0] for call in SITE["calls"]}),
			["cancel", "check_move", "draft", "move", "time_action"],
		)
		for call in SITE["calls"]:
			self.assertIn(MINE, call)

	def test_a_cashier_who_reads_the_whole_salon_works_a_colleagues_but_never_a_busy_row_or_one_that_is_not_there(
		self,
	):
		self.the_whole_site("all")

		with patch.object(appointments, "_draft", return_value={}):
			for name, gesture in self.every_gesture(HERS):
				with self.subTest(gesture=name):
					gesture()
			for booking in (BUSY, UNKNOWN):
				for name, gesture in self.every_gesture(booking):
					with self.subTest(booking=booking, gesture=name):
						with self.assertRaises(frappe.PermissionError):
							gesture()
			# What is in the day view for no one is the salon's: the whole salon works it
			for name, gesture in self.every_gesture(NOONE):
				with self.subTest(booking=NOONE, gesture=name):
					gesture()

		seen = {word for call in SITE["calls"] for word in call if str(word).startswith("BKG-")}
		self.assertEqual(seen, {HERS, NOONE})

	def test_the_time_of_a_colleague_is_not_started_by_naming_her_on_an_appointment_of_ones_own(self):
		self.the_whole_site("own")

		with self.assertRaises(frappe.PermissionError):
			self.as_the_cashier(appointments.clock_appointment, MINE, self.fx.profile, "start", self.sonia)
		self.assertNotIn("calls", SITE)

		self.as_the_cashier(appointments.clock_appointment, MINE, self.fx.profile, "start", self.luc)
		self.assertEqual(SITE["calls"], [("time_action", MINE, "start", self.fx.profile, self.luc_employee)])

	def test_a_planning_lane_that_says_nothing_or_breaks_lets_nothing_be_worked(self):
		for lane in ("nothing_to_say", "breaks"):
			SITE.pop("calls", None)
			with self.subTest(lane=lane):
				self.site_has(day=[lane], move=["move"], time_action=["time_action"])
				with patch("frappe.log_error"):
					for name, gesture in self.every_gesture(MINE):
						with self.subTest(gesture=name):
							with self.assertRaises(frappe.PermissionError):
								gesture()
				self.assertNotIn("calls", SITE)

	def test_a_site_with_no_day_view_has_no_one_to_hide_an_appointment_from(self):
		self.site_has(move=["move"])

		self.as_the_cashier(appointments.move_appointment, HERS, self.fx.profile, "2026-11-10 16:00:00")

		self.assertEqual(SITE["calls"][0][:2], ("move", self.fx.profile))
		self.assertNotIn("day_asked", SITE)

	def test_the_day_read_is_the_day_of_the_agenda_and_today_when_none_is_sent(self):
		self.the_whole_site("own")

		self.as_the_cashier(
			appointments.move_appointment, MINE, self.fx.profile, "2026-11-12 16:00:00", date="2026-11-12"
		)
		self.as_the_cashier(appointments.move_appointment, MINE, self.fx.profile, "2026-11-12 16:00:00")

		self.assertEqual([asked[1] for asked in SITE["day_asked"]], ["2026-11-12", nowdate()])

	def test_the_sale_of_a_colleagues_appointment_leaves_it_alone_and_says_so_in_the_error_log(self):
		self.the_whole_site("own", sold=["sold"])

		with patch("frappe.log_error") as logged:
			frappe.set_user(TILL)
			try:
				appointments.after_a_sale(HERS, "ACC-SINV-1", self.fx.profile, True)
			finally:
				frappe.set_user("Administrator")

		self.assertNotIn("calls", SITE)
		self.assertEqual(logged.call_args[0][0], "A sale named an appointment its cashier may not work")

	def test_the_sale_of_her_own_appointment_tells_the_site_and_closes_its_time(self):
		self.the_whole_site("own", sold=["sold"])

		frappe.set_user(TILL)
		try:
			appointments.after_a_sale(MINE, "ACC-SINV-1", self.fx.profile, True)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(
			SITE["calls"],
			[
				("sold", MINE, "ACC-SINV-1", self.fx.profile),
				("time_action", MINE, "close_unmeasured", self.fx.profile, None),
			],
		)
