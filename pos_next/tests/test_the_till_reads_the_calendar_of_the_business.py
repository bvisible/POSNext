# //// Neoffice — added file (no upstream equivalent).
"""The calendar of the business at the till (NeoSalon, voie 4, 19.11.2026): what each day of a period is for it (open, closed and why, other hours) and who is away, for the
window that moves an appointment. The site says it; the till plays its side with a stand-in for the hook, as the real cashier:

- that a visitor, a portal account and the cashier of another till are refused before the hook is called, and nothing is asked while the till's tick is off;
- that what the site answers is cleaned to the fixed shape (states and kinds among the known ones, texts cut, days as days, periods well formed), and cut to a
  period of two months at most; a start after an end is refused in words;
- that the period asked is read from today for fourteen days when none is given, and given to the site as days;
- that a site with no hook, a hook that says nothing or one that breaks has no calendar and never an error of the till; the former name of the hook still counts.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.api import appointments
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	_forget_the_people_of_the_suite,
)
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	PORTAL,
	TILL,
	_till_fixture,
	_user,
)

ME = "pos_next.tests.test_the_till_reads_the_calendar_of_the_business"
SITE = {}


def the_calendar(*args):
	SITE.setdefault("calls", []).append(("calendar", *args))
	return SITE.get("answer")


def nothing_to_say(*args):
	SITE.setdefault("calls", []).append(("nothing_to_say", *args))
	return None


def breaks(*args):
	raise RuntimeError("the lane is broken")


class TestTheTillReadsTheCalendarOfTheBusiness(FrappeTestCase):
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
		self.tick(True)

	def tick(self, on):
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", int(on))

	def site_has(self, calendar=(), legacy=()):
		"""The hooks the site declares: `calendar=["the_calendar"]` under the name of the hook, `legacy=[...]` under its former name; every other one is empty."""
		table = {getattr(appointments, name): [] for name in dir(appointments) if name.endswith("_HOOK")}
		table[appointments.CALENDAR_HOOK] = [f"{ME}.{path}" for path in calendar]
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		table[appointments.LEGACY_HOOKS[appointments.CALENDAR_HOOK]] = [f"{ME}.{path}" for path in legacy]
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

	def read(self, user=TILL, **period):
		return self.as_the_cashier(appointments.get_calendar, self.fx.profile, user=user, **period)

	# The door

	def test_a_visitor_a_portal_account_and_the_cashier_of_another_till_are_refused_before_the_site_hears_of_it(
		self,
	):
		self.site_has(calendar=["the_calendar"])
		SITE["answer"] = {"days": [], "absences": []}

		for user in ("Guest", PORTAL, OTHER_TILL):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.read(user)

		self.assertNotIn("calls", SITE)

	def test_nothing_is_asked_while_the_tick_is_off(self):
		self.site_has(calendar=["the_calendar"])
		SITE["answer"] = {"days": [], "absences": []}
		self.tick(False)

		self.assertEqual(self.read(), {"available": False, "days": [], "absences": []})

		self.assertNotIn("calls", SITE)

	# The period

	def test_fourteen_days_from_today_are_asked_when_no_period_is_given_and_the_days_go_to_the_site_as_days(
		self,
	):
		self.site_has(calendar=["the_calendar"])
		SITE["answer"] = {"days": [], "absences": []}

		self.read()

		today = nowdate()
		self.assertEqual(SITE["calls"], [("calendar", self.fx.profile, today, add_days(today, 13))])

	def test_a_period_is_given_as_asked_and_cut_to_two_months(self):
		self.site_has(calendar=["the_calendar"])
		SITE["answer"] = {"days": [], "absences": []}

		self.read(start="2026-12-01", end="2026-12-10")
		self.read(start="2026-12-01", end="2027-06-30")

		self.assertEqual(
			SITE["calls"],
			[
				("calendar", self.fx.profile, "2026-12-01", "2026-12-10"),
				("calendar", self.fx.profile, "2026-12-01", add_days("2026-12-01", 61)),
			],
		)

	def test_an_end_before_the_start_is_refused_in_words_before_the_site_is_asked(self):
		self.site_has(calendar=["the_calendar"])

		with self.assertRaises(frappe.ValidationError):
			self.read(start="2026-12-10", end="2026-12-01")

		self.assertNotIn("calls", SITE)

	# What it says

	def test_the_days_and_the_absences_come_cut_to_the_fixed_shape(self):
		self.site_has(calendar=["the_calendar"])
		SITE["answer"] = {
			"days": [
				{
					"day": "2026-12-24",
					"state": "closed",
					"reason": "holiday",
					"label": "Christmas Eve " * 30,
					"periods": [["09:00", "12:00"], ["bad", "13:00"], ["14:00", "18:00", "x"]],
					"secret": "x",
				},
				{"day": "2026-12-25", "state": "special", "reason": "no such reason", "label": None},
				{"day": "2026-12-26", "state": "open", "periods": [["08:30", "17:30"]]},
				{"day": "2026-12-27", "state": "dancing"},
				{"day": "yesterday", "state": "open"},
				"not a row",
			],
			"absences": [
				{
					"user": "someone@example.com",
					"sales_person": "Luc",
					"sales_person_name": "Luc Martin",
					"from": "2026-12-28",
					"to": "2026-12-31",
					"kind": "leave",
					"reason": "Annual leave " * 20,
				},
				{"sales_person": "Maya", "from": "2026-12-24", "to": "2026-12-24", "kind": "something odd"},
				{"sales_person": None, "from": "2026-12-24", "to": "2026-12-24"},
				{"sales_person": "Camille", "from": "soon", "to": "2026-12-24"},
			],
		}

		answer = self.read(start="2026-12-24", end="2026-12-31")

		self.assertTrue(answer["available"])
		self.assertEqual([d["day"] for d in answer["days"]], ["2026-12-24", "2026-12-25", "2026-12-26"])
		closed, special, open_day = answer["days"]
		self.assertEqual(set(closed), {"day", "state", "reason", "label", "periods"})
		self.assertEqual((closed["state"], closed["reason"]), ("closed", "holiday"))
		self.assertEqual(len(closed["label"]), 140)
		self.assertEqual(closed["periods"], [["09:00", "12:00"]])
		self.assertIsNone(special["reason"])
		self.assertEqual(open_day["periods"], [["08:30", "17:30"]])
		self.assertEqual(len(answer["absences"]), 2)
		luc, maya = answer["absences"]
		self.assertEqual(set(luc), {"sales_person", "sales_person_name", "from", "to", "kind", "reason"})
		self.assertEqual(
			(luc["sales_person_name"], luc["from"], luc["to"], luc["kind"]),
			("Luc Martin", "2026-12-28", "2026-12-31", "leave"),
		)
		self.assertEqual(len(luc["reason"]), 60)
		self.assertEqual(
			(maya["sales_person_name"], maya["kind"]),
			("Maya", "leave"),
			"an unknown kind is read as a leave; no name is the person",
		)
		self.assertNotIn("someone@example.com", repr(answer))
		self.assertNotIn("secret", repr(answer))

	def test_a_site_with_no_hook_or_a_hook_that_says_nothing_or_breaks_has_no_calendar_and_never_an_error(
		self,
	):
		unavailable = {"available": False, "days": [], "absences": []}
		self.site_has()
		self.assertEqual(self.read(), unavailable)
		for lane in ("nothing_to_say", "breaks"):
			with self.subTest(lane=lane):
				self.site_has(calendar=[lane])
				with patch("frappe.log_error"):
					self.assertEqual(self.read(), unavailable)

	def test_an_answer_that_is_not_a_mapping_has_no_calendar(self):
		self.site_has(calendar=["the_calendar"])
		for answer in ("a text", ["a", "list"], 12, True):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				self.assertFalse(self.read()["available"])

	def test_the_former_name_of_the_hook_still_answers(self):
		self.site_has(legacy=["the_calendar"])
		SITE["answer"] = {"days": [{"day": "2026-12-24", "state": "closed"}], "absences": []}

		answer = self.read(start="2026-12-24", end="2026-12-24")

		self.assertTrue(answer["available"])
		self.assertEqual(answer["days"][0]["state"], "closed")

	# What the till offers

	def test_the_till_offers_the_calendar_only_where_the_site_declares_it(self):
		self.site_has(calendar=["the_calendar"])
		self.assertTrue(appointments._capabilities()["calendar"])

		self.site_has(legacy=["the_calendar"])
		self.assertTrue(appointments._capabilities()["calendar"], "the former name counts")

		self.site_has()
		self.assertFalse(appointments._capabilities()["calendar"])
