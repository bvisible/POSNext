# //// Neoffice — added file (no upstream equivalent).
"""The cashier takes an appointment nobody has (neoffice-maintenance#3185; Jérémy, 20.11.2026: « Oui, elle le prend »).

A cashier who reads only her own appointments sees one nobody has, in full, and takes it: it becomes hers alone. The till opens the door and the site (the planning lane's
day view, the reservation's `pos_next_appointment_claim`) does the rest, under its own lock. This suite plays the cashier as she is, with the role of the persona `cashier`
and nothing else (no right is given to her role), with stand-ins for the hooks of the site, and pins:

- the agenda says `can["claim"]` of an appointment nobody has, to a cashier who is one of the people of the salon, where the site has the gesture, and of no other:
  not one somebody has, not a colleague's busy row, not a paid one, not one a cashier holds in her till, not to a cashier who gives no services;
- the door: a visitor, a portal account and an account that is not of the till are refused; a cashier who is no person of the salon, an appointment the day view does not
  show as nobody's (somebody took it since, a colleague who clicked first included) are told so in words, and the site is not asked;
- what the site refuses (she does not give the service, she is busy then) reaches her as it is said; a site that does not have the gesture says so.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role, make_persona
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments
from pos_next.tests import test_the_agenda_of_the_salon_day_is_composed_from_what_the_lanes_answer as lanes
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	a_sales_person,
	an_employee,
)
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

ME = "pos_next.tests.test_the_cashier_takes_an_appointment_nobody_has"
SITE = {}
DAY = "2026-11-10"
ANNA, ANNA_FIRST_NAME = "_Test Claim Anna", "TestClaimAnna"
BEA, BEA_FIRST_NAME = "_Test Claim Bea", "TestClaimBea"


def the_day(pos_profile, date=None):
	return SITE.get("day")


def the_list(pos_profile, date=None, providers=None):
	return SITE.get("list")


def a_claim(pos_profile, booking):
	SITE.setdefault("claims", []).append((pos_profile, booking))
	answer = SITE.get("claim")
	if isinstance(answer, Exception):
		raise answer
	return answer


def _forget_the_people():
	for doctype, filters in (
		("Sales Person", {"sales_person_name": ["in", [ANNA, BEA]]}),
		("Employee", {"first_name": ["in", [ANNA_FIRST_NAME, BEA_FIRST_NAME]]}),
	):
		for name in frappe.get_all(doctype, filters=filters, pluck="name"):
			frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)


class TestTheCashierTakesAnAppointmentNobodyHas(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE], "System User")  # a cashier who gives no services: no employee file
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.cashier = make_persona("cashier")
		self.addCleanup(_forget_the_people)
		_forget_the_people()
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": self.cashier})
		profile.save(ignore_permissions=True)
		# Anna is the persona `cashier`'s own sales person (she gives services); Bea is a colleague's
		self.anna = a_sales_person(
			ANNA, an_employee(ANNA_FIRST_NAME, self.fx.company, user_id=self.cashier), self.fx.company
		)
		self.bea = a_sales_person(BEA, an_employee(BEA_FIRST_NAME, self.fx.company), self.fx.company)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_appointments", 1)
		self.site_has("day", "list", "claim")

	def site_has(self, *names):
		"""The hooks the site declares: the lanes of the suite of the agenda for what it does not name, this suite's stand-ins for the day, the list and the claim."""
		table = {
			hook: [f"{lanes.ME}.{lanes.STUBS[name]}"] if name in names else []
			for name, hook in lanes.HOOKS.items()
		}
		table[appointments.DAY_HOOK] = [f"{ME}.the_day"] if "day" in names else []
		table[appointments.LIST_HOOK] = [f"{ME}.the_list"] if "list" in names else []
		table[appointments.CLAIM_HOOK] = [f"{ME}.a_claim"] if "claim" in names else []
		table.update({hook: [] for hook in appointments.LEGACY_HOOKS.values()})
		table.update({appointments.FILE_HOOK: [], appointments.CALENDAR_HOOK: []})
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)
		# the suite of the agenda answers the lanes it stands in for from its own table: the day and the list are this suite's
		lanes.SITE.clear()
		self.addCleanup(lanes.SITE.clear)

	def person(self, sales_person, appointments_=()):
		return {
			"user": f"{sales_person}@example.com",
			"name": sales_person,
			"sales_person": sales_person,
			"sales_person_name": sales_person,
			"state": "present",
			"reason": None,
			"periods": [["09:00", "18:00"]],
			"from": "09:00",
			"until": "18:00",
			"checked_in": "08:57",
			"has_hr_file": True,
			"bookings": len(appointments_),
			"booked_minutes": 60,
			"load": 12,
			"appointments": list(appointments_),
		}

	def row(self, booking, sales_person=None, starts="2026-11-10 09:00:00", **changes):
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
			"provider": "x@example.com" if sales_person else None,
			"sales_person": sales_person,
			"sales_person_name": sales_person,
			"invoice": None,
			**changes,
		}

	def a_day(self, unassigned=(), colleague=(), own=()):
		SITE["day"] = {
			"day": DAY,
			"visibility": "own",
			"salon": None,
			"people": [self.person(self.anna, own), self.person(self.bea, colleague)],
			"unassigned": list(unassigned),
		}

	def listed(self, booking, **changes):
		return {
			"booking": booking,
			"state": "booked",
			"in_the_till": False,
			"invoice": None,
			"starts_at": "2026-11-10 09:00:00",
			"ends_at": "2026-11-10 10:00:00",
			"customer": "CUST-1",
			"customer_name": "Mme Dupont",
			"amount": 60,
			"paid_amount": 0,
			"steps": [],
			"can": {"collect": True, "move": True, "cancel": True, "clock": True},
			**changes,
		}

	def agenda(self, user=None):
		with as_role("cashier") if user is None else self.signed_in(user):
			return appointments.get_appointments(self.fx.profile, DAY)

	def signed_in(self, user):
		class _Session:
			def __enter__(inner):
				frappe.set_user(user)

			def __exit__(inner, *exc):
				frappe.set_user("Administrator")

		return _Session()

	def rows(self, answer):
		return {row["booking"] or row["key"]: row for row in answer["appointments"]}

	def claim(self, booking, user=None):
		with as_role("cashier") if user is None else self.signed_in(user):
			return appointments.claim_appointment(booking, self.fx.profile, DAY)

	# --- what the agenda says

	def test_the_agenda_offers_to_take_an_appointment_nobody_has_to_a_person_of_the_salon_and_only_that_one(
		self,
	):
		self.a_day(
			unassigned=[self.row("BKG-NOBODY")],
			colleague=[self.row("BKG-BEA", self.bea, starts="2026-11-10 10:00:00")],
			own=[self.row("BKG-ANNA", self.anna, starts="2026-11-10 11:00:00")],
		)

		answer = self.agenda()
		rows = self.rows(answer)

		self.assertTrue(answer["capabilities"]["claim"])
		self.assertTrue(rows["BKG-NOBODY"]["claimable"])
		self.assertFalse(rows["BKG-NOBODY"]["may"])  # she does not work it before she has taken it
		self.assertFalse(any(rows["BKG-NOBODY"]["can"][gesture] for gesture in appointments.GESTURES))
		self.assertEqual(rows["BKG-NOBODY"]["customer_name"], "Mme Dupont")  # the team sees it in full
		self.assertFalse(rows["BKG-ANNA"]["claimable"])
		# a colleague's, for a cashier who reads only her own: the day view says it busy
		self.assertFalse(any(row["claimable"] for key, row in rows.items() if key not in ("BKG-NOBODY",)))

	def test_the_agenda_offers_it_to_nobody_where_the_site_has_not_the_gesture(self):
		self.site_has("day", "list")
		self.a_day(unassigned=[self.row("BKG-NOBODY")])

		answer = self.agenda()

		self.assertFalse(answer["capabilities"]["claim"])
		self.assertFalse(self.rows(answer)["BKG-NOBODY"]["claimable"])

	def test_the_agenda_offers_it_to_a_cashier_who_gives_no_services_to_nobody(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])

		answer = self.agenda(TILL)

		self.assertFalse(self.rows(answer)["BKG-NOBODY"]["claimable"])

	def test_the_agenda_does_not_offer_what_is_paid_absent_or_held_in_a_till(self):
		SITE["list"] = [
			self.listed("BKG-PAID", state="paid"),
			self.listed("BKG-ABSENT", state="absent"),
			self.listed("BKG-TILL", in_the_till=True, invoice="DRAFT-1"),
			self.listed("BKG-FREE"),
		]
		self.a_day(unassigned=[self.row(name) for name in ("BKG-PAID", "BKG-ABSENT", "BKG-TILL", "BKG-FREE")])

		rows = self.rows(self.agenda())

		self.assertEqual(
			{name: row["claimable"] for name, row in rows.items()},
			{"BKG-PAID": False, "BKG-ABSENT": False, "BKG-TILL": False, "BKG-FREE": True},
		)

	def test_a_busy_row_is_never_offered(self):
		busy = {
			"busy": True,
			"starts_at": "2026-11-10 10:00:00",
			"ends_at": "2026-11-10 11:00:00",
			"sales_person": None,
		}
		self.a_day(unassigned=[busy])

		rows = self.agenda()["appointments"]

		self.assertEqual([row["claimable"] for row in rows], [False])

	# --- the door

	def test_the_cashier_takes_it_and_the_site_is_asked_once(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])
		SITE["claim"] = {
			"booking": "BKG-NOBODY",
			"steps": ["BKG-NOBODY"],
			"sales_person": self.anna,
			"sales_person_name": ANNA,
		}

		done = self.claim("BKG-NOBODY")

		self.assertEqual(
			done, {"booking": "BKG-NOBODY", "sales_person": self.anna, "sales_person_name": ANNA}
		)
		self.assertEqual(SITE["claims"], [(self.fx.profile, "BKG-NOBODY")])

	def test_an_appointment_somebody_has_since_is_refused_in_words_and_the_site_is_not_asked(self):
		"""The colleague who clicked first: the day view shows it in her column now."""
		self.a_day(colleague=[self.row("BKG-NOBODY", self.bea)])

		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOBODY")

		self.assertIn("not free to take any more", str(caught.exception))
		self.assertNotIn("claims", SITE)

	def test_a_row_of_the_unassigned_column_that_names_a_person_is_not_free(self):
		"""A day view that lists a booking as nobody's yet gives it a person: the till believes the person, not the column."""
		self.a_day(unassigned=[self.row("BKG-NOBODY", self.bea)])

		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOBODY")

		self.assertIn("not free to take any more", str(caught.exception))
		self.assertNotIn("claims", SITE)

	def test_a_booking_the_day_does_not_show_says_the_same_words(self):
		self.a_day()

		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOT-THERE")

		self.assertIn("not free to take any more", str(caught.exception))
		self.assertNotIn("claims", SITE)

	def test_a_busy_row_is_not_taken(self):
		self.a_day(unassigned=[{"busy": True, "booking": "BKG-NOBODY", "sales_person": None}])

		with self.assertRaises(frappe.ValidationError):
			self.claim("BKG-NOBODY")
		self.assertNotIn("claims", SITE)

	def test_a_cashier_who_is_no_person_of_the_salon_is_told_so(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])

		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOBODY", user=TILL)

		self.assertIn("not one of the people of the salon", str(caught.exception))
		self.assertNotIn("claims", SITE)

	def test_what_the_site_refuses_reaches_her_as_it_is_said(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])
		SITE["claim"] = frappe.ValidationError("Anna is already booked then.")

		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOBODY")

		self.assertEqual(str(caught.exception), "Anna is already booked then.")

	def test_a_site_that_has_not_the_gesture_or_does_not_answer_says_so(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])
		SITE["claim"] = None
		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOBODY")
		self.assertIn("does not take appointments", str(caught.exception))

		self.site_has("day", "list")
		with self.assertRaises(frappe.ValidationError) as caught:
			self.claim("BKG-NOBODY")
		self.assertIn("does not take appointments", str(caught.exception))

	def test_a_visitor_a_portal_account_and_an_account_of_no_till_are_refused(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])
		SITE["claim"] = {"booking": "BKG-NOBODY", "sales_person": self.anna, "sales_person_name": ANNA}

		for who in ("Guest", OTHER_TILL):
			with self.subTest(who=who), self.assertRaises(frappe.PermissionError):
				with self.signed_in(who):
					appointments.claim_appointment("BKG-NOBODY", self.fx.profile, DAY)
		with as_role("portal_customer", customer=self.fx.customer), self.assertRaises(frappe.PermissionError):
			appointments.claim_appointment("BKG-NOBODY", self.fx.profile, DAY)
		self.assertNotIn("claims", SITE)

	def test_a_booking_that_is_no_text_is_refused_as_the_others_are(self):
		self.a_day(unassigned=[self.row("BKG-NOBODY")])
		for asked in ("", "  "):
			with self.subTest(asked=asked), self.assertRaises(frappe.PermissionError):
				self.claim(asked)
		self.assertNotIn("claims", SITE)

	def test_it_is_a_post_that_asks_and_a_whitelisted_one(self):
		self.assertIn(appointments.claim_appointment, frappe.whitelisted)
		self.assertEqual(
			tuple(frappe.allowed_http_methods_for_whitelisted_func[appointments.claim_appointment]), ("POST",)
		)
