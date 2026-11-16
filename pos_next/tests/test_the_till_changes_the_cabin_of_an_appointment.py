# //// Neoffice — added file (no upstream equivalent).
"""The cabin of an appointment at the till (NeoSalon, cabins level 2, 16.11.2026): the cabins it could be in, whether it could be put in one, putting it there,
and what a move says of the cabin.

The reservation decides what is free and why not; the till shows it. The suite plays the till's side with stand-ins for the hooks, as the real cashier:

- that nothing is done while the till's tick is off or where the site has no hook, and that a visitor, a portal account and the cashier of another till are
  refused on each of the three gestures before any hook is called;
- that what the reservation answers is read as the sheet reads it (names cut, a colour a colour and nothing else, `why` one of three words, no key it does
  not know), and that a site whose reservation knows no cabin answers nothing, never an error;
- that the till offers the cabin only where all three hooks are declared;
- that the cabin of a step, and what a move does to it, are read as the agenda reads them.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

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

ME = "pos_next.tests.test_the_till_changes_the_cabin_of_an_appointment"
SITE = {}
HOOKS = {
	"cabins": appointments.CABINS_HOOK,
	"cabin_check": appointments.CABIN_CHECK_HOOK,
	"cabin_change": appointments.CABIN_CHANGE_HOOK,
	"check_move": appointments.CHECK_MOVE_HOOK,
	"move": appointments.MOVE_HOOK,
}


def _record(name, *args):
	SITE.setdefault("calls", []).append((name, *args))
	return SITE.get("answer")


def cabins(*args):
	return _record("cabins", *args)


def cabin_check(*args):
	return _record("cabin_check", *args)


def cabin_change(*args):
	return _record("cabin_change", *args)


def check_move(*args):
	return _record("check_move", *args)


def move(*args):
	return _record("move", *args)


def nothing_to_say(*args):
	SITE.setdefault("calls", []).append(("nothing_to_say", *args))
	return None


def refuses(*args):
	frappe.throw("That cabin is taken.")


def breaks(*args):
	raise RuntimeError("the lane is broken")


class TestTheTillChangesTheCabinOfAnAppointment(FrappeTestCase):
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

	def site_has(self, **hooks):
		"""The hooks the site declares: `cabins=["cabins"]`, `cabin_change=["refuses"]`... every other one is empty."""
		# The day view and the others the suite does not name are empty: the lanes of the work site do not answer for the suite
		table = {getattr(appointments, name): [] for name in dir(appointments) if name.endswith("_HOOK")}
		table.update({hook: [f"{ME}.{path}" for path in hooks.get(name, [])] for name, hook in HOOKS.items()})
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def the_whole_site(self):
		self.site_has(cabins=["cabins"], cabin_check=["cabin_check"], cabin_change=["cabin_change"])

	def as_the_cashier(self, method, *args, user=TILL, **kwargs):
		frappe.set_user(user)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def every_gesture(self):
		till = self.fx.profile
		return [
			("cabins", appointments.get_appointment_cabins, ("BKG-1", till)),
			("cabin_check", appointments.check_appointment_cabin, ("BKG-1", till, "CAB-2")),
			("cabin_change", appointments.change_appointment_cabin, ("BKG-1", till, "CAB-2")),
		]

	# The door

	def test_a_visitor_a_portal_account_and_the_cashier_of_another_till_are_refused_on_every_cabin_gesture(
		self,
	):
		self.the_whole_site()
		SITE["answer"] = {"ok": 1}

		for name, method, args in self.every_gesture():
			for user in ("Guest", PORTAL, OTHER_TILL):
				with self.subTest(gesture=name, user=user):
					with self.assertRaises(frappe.PermissionError):
						self.as_the_cashier(method, *args, user=user)

		self.assertNotIn("calls", SITE)

	def test_nothing_is_done_while_the_tick_is_off(self):
		self.the_whole_site()
		SITE["answer"] = {"ok": 1}
		self.tick(False)

		for name, method, args in self.every_gesture():
			with self.subTest(gesture=name):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(method, *args)

		self.assertNotIn("calls", SITE)

	def test_a_blank_booking_is_refused_before_any_lane_hears_of_it(self):
		self.the_whole_site()
		till = self.fx.profile

		for method, args in (
			(appointments.get_appointment_cabins, (till,)),
			(appointments.check_appointment_cabin, (till, "CAB-2")),
			(appointments.change_appointment_cabin, (till, "CAB-2")),
		):
			with self.subTest(method=method.__name__):
				with self.assertRaises(frappe.PermissionError):
					self.as_the_cashier(method, "   ", *args)

		self.assertNotIn("calls", SITE)

	def test_a_site_whose_reservation_knows_no_cabin_lists_none_and_refuses_the_rest(self):
		self.site_has()

		self.assertEqual(
			self.as_the_cashier(appointments.get_appointment_cabins, "BKG-1", self.fx.profile), []
		)
		for name, method, args in self.every_gesture()[1:]:
			with self.subTest(gesture=name):
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(method, *args)

	def test_a_reservation_that_says_nothing_or_breaks_is_no_cabin_and_never_a_failure_of_the_till(self):
		for lane in ("nothing_to_say", "breaks"):
			with self.subTest(lane=lane):
				SITE.pop("calls", None)
				self.site_has(cabins=[lane], cabin_check=[lane], cabin_change=[lane])
				with patch("frappe.log_error"):
					listed = self.as_the_cashier(
						appointments.get_appointment_cabins, "BKG-1", self.fx.profile
					)
					with self.assertRaises(frappe.ValidationError):
						self.as_the_cashier(
							appointments.check_appointment_cabin, "BKG-1", self.fx.profile, "CAB-2"
						)
				self.assertEqual(listed, [])

	def test_the_reservations_own_refusal_reaches_the_cashier_as_it_is(self):
		self.site_has(cabins=["refuses"], cabin_check=["refuses"], cabin_change=["refuses"])

		for name, method, args in self.every_gesture():
			with self.subTest(gesture=name):
				with self.assertRaises(frappe.ValidationError) as caught:
					self.as_the_cashier(method, *args)
				self.assertIn("That cabin is taken.", str(caught.exception))

	# The list

	def test_the_cabins_of_an_appointment_come_cut_to_what_the_sheet_knows(self):
		self.the_whole_site()
		SITE["answer"] = [
			{
				"name": "CAB-1",
				"label": "Cabin 1",
				"color": "#C2723F",
				"current": 1,
				"free": 1,
				"why": None,
				"secret": 1,
			},
			{
				"name": "CAB-2",
				"label": "Cabin 2",
				"color": "red; background: url(x)",
				"current": 0,
				"free": 0,
				"why": "taken",
			},
			{
				"name": "CAB-3",
				"label": "",
				"color": None,
				"current": 0,
				"free": 0,
				"why": "something else entirely",
			},
			{"name": "CAB-4", "label": "Cabin 4", "current": 0, "free": 0, "why": "closed"},
			{"name": "CAB-5", "label": "Cabin 5", "current": 0, "free": 0, "why": "not_allowed"},
			{"label": "No name"},
			"not a dict",
		]

		listed = self.as_the_cashier(appointments.get_appointment_cabins, "BKG-1", self.fx.profile)

		self.assertEqual(SITE["calls"], [("cabins", self.fx.profile, "BKG-1")])
		self.assertEqual([c["name"] for c in listed], ["CAB-1", "CAB-2", "CAB-3", "CAB-4", "CAB-5"])
		self.assertEqual(set(listed[0]), {"name", "label", "color", "current", "free", "why"})
		self.assertEqual(
			(listed[0]["color"], listed[0]["current"], listed[0]["free"]), ("#C2723F", True, True)
		)
		self.assertIsNone(listed[1]["color"])  # a colour that is not a colour never reaches a style attribute
		self.assertEqual(listed[1]["why"], "taken")
		self.assertEqual((listed[2]["label"], listed[2]["why"]), ("CAB-3", None))
		self.assertEqual([c["why"] for c in listed[3:]], ["closed", "not_allowed"])

	def test_a_service_that_asks_for_no_cabin_is_answered_with_an_empty_list(self):
		self.the_whole_site()
		SITE["answer"] = None

		self.assertEqual(
			self.as_the_cashier(appointments.get_appointment_cabins, "BKG-1", self.fx.profile), []
		)

	def test_the_list_is_cut_to_the_most_a_sheet_shows(self):
		self.the_whole_site()
		SITE["answer"] = [{"name": f"CAB-{n}", "free": 1} for n in range(appointments.MOST_CABINS + 20)]

		listed = self.as_the_cashier(appointments.get_appointment_cabins, "BKG-1", self.fx.profile)

		self.assertEqual(len(listed), appointments.MOST_CABINS)

	# Check and change

	def test_whether_an_appointment_could_be_put_in_a_cabin_is_asked_and_answered_in_two_keys(self):
		self.the_whole_site()
		SITE["answer"] = {"ok": 0, "why": "Cabin 2 is taken at 10:00.", "secret": 1}

		answer = self.as_the_cashier(appointments.check_appointment_cabin, "BKG-1", self.fx.profile, "CAB-2")

		self.assertEqual(answer, {"ok": False, "why": "Cabin 2 is taken at 10:00."})
		self.assertEqual(SITE["calls"], [("cabin_check", self.fx.profile, "BKG-1", "CAB-2")])

	def test_a_change_is_asked_with_the_till_first_and_answers_the_cabins_it_left_and_went_to(self):
		self.the_whole_site()
		SITE["answer"] = {
			"booking": "BKG-1",
			"from": {"name": "CAB-1", "label": "Cabin 1", "color": "#C2723F", "secret": 1},
			"to": {"name": "CAB-2", "label": "Cabin 2", "color": "nonsense"},
			"internal": "never shown",
		}

		answer = self.as_the_cashier(appointments.change_appointment_cabin, "BKG-1", self.fx.profile, "CAB-2")

		self.assertEqual(SITE["calls"], [("cabin_change", self.fx.profile, "BKG-1", "CAB-2")])
		self.assertEqual(
			answer,
			{
				"booking": "BKG-1",
				"from": {"name": "CAB-1", "label": "Cabin 1", "color": "#C2723F"},
				"to": {"name": "CAB-2", "label": "Cabin 2", "color": None},
			},
		)

	def test_a_change_answered_with_nothing_readable_is_refused_not_believed(self):
		self.the_whole_site()
		for answer in ("done", ["x"], 1):
			with self.subTest(answer=answer):
				SITE["answer"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(
						appointments.change_appointment_cabin, "BKG-1", self.fx.profile, "CAB-2"
					)

	# What the agenda, the move and the capabilities say of it

	def test_the_till_offers_the_cabin_only_where_the_three_hooks_are_declared(self):
		self.the_whole_site()
		self.assertTrue(appointments._capabilities()["cabin"])

		for missing in ("cabins", "cabin_check", "cabin_change"):
			with self.subTest(missing=missing):
				hooks = {
					"cabins": ["cabins"],
					"cabin_check": ["cabin_check"],
					"cabin_change": ["cabin_change"],
				}
				del hooks[missing]
				self.site_has(**hooks)
				self.assertFalse(appointments._capabilities()["cabin"])

	def test_the_cabin_of_a_step_and_whether_it_still_has_to_be_placed_are_read_as_the_agenda_reads_them(
		self,
	):
		with_cabin = appointments._step(
			{
				"item": "Facial",
				"cabin": {"name": "CAB-1", "label": "Cabin 1", "color": "#C2723F", "secret": 1},
			}
		)
		without = appointments._step({"item": "Facial", "needs_cabin": 1})
		none_asked = appointments._step({"item": "Cut"})

		self.assertEqual(with_cabin["cabin"], {"name": "CAB-1", "label": "Cabin 1", "color": "#C2723F"})
		self.assertFalse(with_cabin["needs_cabin"])
		self.assertEqual((without["cabin"], without["needs_cabin"]), (None, True))
		self.assertEqual((none_asked["cabin"], none_asked["needs_cabin"]), (None, False))

	def test_a_move_says_what_it_does_to_the_cabin_and_says_nothing_when_the_service_asks_for_none(self):
		self.site_has(move=["move"], check_move=["check_move"])
		SITE["answer"] = {
			"ok": 1,
			"why": "",
			"booking": "BKG-1",
			"from": "2026-11-10 14:30:00",
			"to": "2026-11-10 16:00:00",
			"cabin": {
				"from": {"name": "CAB-1", "label": "Cabin 1"},
				"to": {"name": "CAB-2", "label": "Cabin 2", "color": "#112233"},
				"changed": 1,
				"secret": 1,
			},
		}

		checked = self.as_the_cashier(
			appointments.check_appointment_move, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
		)
		moved = self.as_the_cashier(
			appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
		)

		expected = {
			"from": {"name": "CAB-1", "label": "Cabin 1", "color": None},
			"to": {"name": "CAB-2", "label": "Cabin 2", "color": "#112233"},
			"changed": True,
		}
		self.assertEqual(checked["cabin"], expected)
		self.assertEqual(moved["cabin"], expected)

		SITE["answer"] = {
			"ok": 1,
			"booking": "BKG-1",
			"from": "2026-11-10 14:30:00",
			"to": "2026-11-10 16:00:00",
		}
		checked = self.as_the_cashier(
			appointments.check_appointment_move, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
		)
		moved = self.as_the_cashier(
			appointments.move_appointment, "BKG-1", self.fx.profile, "2026-11-10 16:00:00"
		)
		self.assertNotIn("cabin", checked)
		self.assertNotIn("cabin", moved)
