# //// Neoffice — added file (no upstream equivalent).
"""The till takes the appointments of a reservation app over (NeoSalon, step 2, lot G4, the till's side; product owner, 10.11.2026).

A salon books its customers in a reservation app; the till lists the day's appointments and takes one over: the reservation prepares a draft
invoice, the till loads it and pays THAT draft. POS Next names no reservation app: it calls two hooks of the site
(`pos_next_appointments_of_the_day`, `pos_next_appointment_draft`) and takes the first answer that is not None. The suite plays the till's
side of the contract (note 10 of the vault, § G4) with stand-ins for the hooks, as the real cashier of the till:

- that nothing is shown while the till's tick is off or where the site has no hook;
- that the list is sorted, cut to the keys the till knows, and that a hook which has nothing to say, which breaks, or which refuses
  with a message, is handled as the contract says (the next hook, a log, the message as it is);
- that a draft is taken only for the booking asked, only if it is a DRAFT of THIS till, with lines; that the till reads the lines, their
  sales persons, the customer, the totals and the deposit from the invoice itself, and takes from the hook only the step of a line;
- that a visitor, a portal account and the cashier of another till are refused on both endpoints.
"""

import json
from unittest.mock import patch

import frappe
from frappe.exceptions import FrappeTypeError
from frappe.tests.utils import FrappeTestCase

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
	_sale,
	_till_fixture,
	_user,
)

ME = "pos_next.tests.test_the_till_takes_the_appointments_of_a_reservation_app"
# What the stand-ins answer, set by each test
SITE = {}


def nothing_to_say(pos_profile, date, providers=None):
	SITE.setdefault("calls", []).append(("nothing_to_say", pos_profile, date, providers))
	return None


def the_list(pos_profile, date, providers=None):
	SITE.setdefault("calls", []).append(("the_list", pos_profile, date, providers))
	return SITE["list"]


def a_broken_list(pos_profile, date, providers=None):
	raise RuntimeError("the reservation app is broken")


def a_refusing_list(pos_profile, date, providers=None):
	frappe.throw("The salon is closed today.")


def the_draft(booking, pos_profile):
	SITE.setdefault("calls", []).append(("the_draft", booking, pos_profile))
	return SITE["draft"]


def a_draft_with_nothing_to_say(booking, pos_profile):
	return None


def a_refusing_draft(booking, pos_profile):
	frappe.throw("This appointment is already collected.")


class TestTheTillTakesTheAppointmentsOfAReservationApp(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		# The cashier role reads every invoice and so works at any till: the cashier of ANOTHER till is one with no such role
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
		"""The hooks the site declares: `of_the_day=[paths]`, `draft=[paths]`."""
		# Every hook of the salon the site could declare is empty but the ones this test gives: the real site's own lanes are not under test here
		table = {
			getattr(appointments, name): []
			for name in dir(appointments)
			if name.endswith("_HOOK") and isinstance(getattr(appointments, name), str)
		}
		table[appointments.LIST_HOOK] = [f"{ME}.{path}" for path in hooks.get("of_the_day", [])]
		table[appointments.DRAFT_HOOK] = [f"{ME}.{path}" for path in hooks.get("draft", [])]
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

	def a_draft_of_the_till(self, **changes):
		"""A draft of the till as a reservation app prepares it for an appointment: a service per line, each with its person."""
		changes.setdefault(
			"items",
			[
				{
					"item_code": self.fx.item,
					"qty": 1,
					"rate": 65,
					"price_list_rate": 65,
					"sales_person": self.sonia,
				},
				{"item_code": self.fx.item, "qty": 1, "rate": 78, "price_list_rate": 78},
			],
		)
		changes.setdefault("payments", [])
		doc = frappe.get_doc(_sale(self.fx, **changes)).insert(ignore_permissions=True)
		return doc.name

	def an_appointment(self, **changes):
		return {
			"booking": "BKG-1",
			"starts_at": "2026-11-10 09:30:00",
			"ends_at": "2026-11-10 12:15:00",
			"customer": "CUST-0007",
			"customer_name": "Mme Dupont",
			"steps": [
				{
					"label": "Coupe femme",
					"item_code": "SRV-COUPE",
					"starts_at": "2026-11-10 09:30:00",
					"ends_at": "2026-11-10 10:15:00",
					"sales_person": "Sonia",
					"sales_person_name": "Sonia",
				}
			],
			"amount": 65.0,
			"paid_amount": 0.0,
			"state": "booked",
			"in_the_till": False,
			"invoice": None,
			**changes,
		}

	def a_draft_answer(self, invoice, **changes):
		"""What a hook has to answer at least: the invoice; and, if it likes, the step of a line and the hours."""
		return {"invoice": invoice, **changes}

	# The list of the money lane, when the site gives no day view: it is the agenda

	def test_what_an_absence_would_keep_and_give_back_reaches_the_till_and_is_none_when_the_app_says_nothing(
		self,
	):
		"""The cancel dialog says what marking her absent keeps and gives back before it is marked (12.11): the amounts of the money lane
		pass through; a reservation app that predates them says nothing, and the till must not read « nothing goes back » from a 0."""
		from pos_next.api import appointments as lane

		said = lane._listed(self.an_appointment(paid_amount=56.1, absent_kept="22.44", absent_refund=33.66))
		self.assertEqual((said["absent_kept"], said["absent_refund"]), (22.44, 33.66))
		silent = lane._listed(self.an_appointment())
		self.assertEqual((silent["absent_kept"], silent["absent_refund"]), (None, None))
		self.assertEqual(
			lane._listed(self.an_appointment(absent_kept="", absent_refund=[1]))["absent_kept"], None
		)

	def test_the_tick_is_off_by_default(self):
		self.assertEqual(frappe.get_meta("POS Settings").get_field("enable_appointments").default, "0")
		self.assertEqual(frappe.new_doc("POS Settings").enable_appointments, 0)

	def test_the_till_reads_the_tick_with_its_other_settings(self):
		from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS
		from pos_next.api.pos_profile import get_pos_settings

		self.assertIn("enable_appointments", POS_SETTINGS_FIELDS)
		self.assertEqual(DEFAULT_POS_SETTINGS["enable_appointments"], 0)
		self.assertEqual(self.as_the_cashier(get_pos_settings, self.fx.profile)["enable_appointments"], 1)

	def nothing_shown(self):
		return {
			"available": False,
			"date": "2026-11-10",
			"visibility": "all",
			"capabilities": {},
			"salon": None,
			"mine": [],
			"people": [],
			"appointments": [],
		}

	def test_nothing_is_shown_while_the_tick_is_off(self):
		self.site_has(of_the_day=["the_list"])
		SITE["list"] = [self.an_appointment()]
		self.tick(False)

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertEqual(answer, self.nothing_shown())
		self.assertNotIn("calls", SITE)

	def test_nothing_is_shown_where_the_site_has_no_reservation_app(self):
		self.site_has()

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertEqual(answer, self.nothing_shown())
		self.assertFalse(appointments.site_has_appointments())

	def test_the_appointments_come_sorted_by_time_and_cut_to_the_keys_the_till_knows(self):
		self.site_has(of_the_day=["the_list"])
		late = self.an_appointment(
			booking="BKG-2", starts_at="2026-11-10 14:00:00", notes="never shown", email="a@b.c"
		)
		early = self.an_appointment(state="paid", invoice="ACC-SINV-1", phone="079 000 00 00")
		SITE["list"] = [late, early, {"no": "booking"}, "not a dict", self.an_appointment(booking="")]

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertTrue(answer["available"])
		self.assertEqual([row["booking"] for row in answer["appointments"]], ["BKG-1", "BKG-2"])
		first = answer["appointments"][0]
		self.assertEqual(
			set(first),
			{
				"key",
				"booking",
				"starts_at",
				"ends_at",
				"customer",
				"customer_name",
				"steps",
				"amount",
				"paid_amount",
				"absent_kept",
				"absent_refund",
				"state",
				"invoice",
				"in_the_till",
				"to_handle",
				"busy",
				"clock",
				"can",
			},
		)
		self.assertEqual((first["state"], first["invoice"]), ("paid", "ACC-SINV-1"))
		self.assertEqual(
			set(first["steps"][0]),
			{
				"step",
				"label",
				"item_code",
				"qty",
				"options",
				"starts_at",
				"ends_at",
				"sales_person",
				"sales_person_name",
			},
		)
		self.assertEqual(answer["appointments"][1]["invoice"], None)

	def test_where_each_stands_is_what_the_money_lane_says_and_a_state_it_does_not_know_is_booked(self):
		self.site_has(of_the_day=["the_list"])
		SITE["list"] = [
			self.an_appointment(booking="BKG-1", state="booked"),
			# A draft open in the till: it is `booked` still, and `in_the_till` says so
			self.an_appointment(booking="BKG-2", state="booked", in_the_till=True, invoice="ACC-SINV-2"),
			self.an_appointment(booking="BKG-3", state="paid", invoice="ACC-SINV-3"),
			# A state the till does not know (and the old words of the first contract, which no lane says any more)
			self.an_appointment(booking="BKG-4", state="Paid", invoice="ACC-SINV-4"),
			self.an_appointment(booking="BKG-5", state="started"),
			self.an_appointment(booking="BKG-6", state="finished"),
			self.an_appointment(booking="BKG-7", state="absent"),
			self.an_appointment(booking="BKG-8", state="collected", in_the_till="no"),
		]

		rows = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")[
			"appointments"
		]

		self.assertEqual(
			[(r["booking"], r["state"], r["in_the_till"], r["invoice"]) for r in rows],
			[
				("BKG-1", "booked", False, None),
				("BKG-2", "booked", True, "ACC-SINV-2"),
				("BKG-3", "paid", False, "ACC-SINV-3"),
				("BKG-4", "booked", False, "ACC-SINV-4"),
				("BKG-5", "started", False, None),
				("BKG-6", "finished", False, None),
				("BKG-7", "absent", False, None),
				("BKG-8", "booked", False, None),
			],
		)

	def test_the_people_are_the_people_of_the_steps_when_the_site_gives_no_team(self):
		self.site_has(of_the_day=["the_list"])
		other = self.an_appointment(booking="BKG-2", starts_at="2026-11-10 14:00:00")
		other["steps"][0].update({"sales_person": "Luc", "sales_person_name": None})
		SITE["list"] = [self.an_appointment(), other]

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertEqual(
			[(p["key"], p["sales_person_name"], p["status"], p["periods"]) for p in answer["people"]],
			[("Sonia", "Sonia", "unknown", []), ("Luc", "Luc", "unknown", [])],
		)
		self.assertEqual(answer["visibility"], "all")

	def test_the_hook_is_given_the_till_the_day_and_the_people_asked_for(self):
		self.site_has(of_the_day=["the_list"])
		SITE["list"] = []

		self.as_the_cashier(
			appointments.get_appointments, self.fx.profile, "2026-11-10", json.dumps(["Sonia"])
		)
		self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-11", ["Luc", "Sonia"])
		self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-12")

		self.assertEqual(
			SITE["calls"],
			[
				("the_list", self.fx.profile, "2026-11-10", ["Sonia"]),
				("the_list", self.fx.profile, "2026-11-11", ["Luc", "Sonia"]),
				("the_list", self.fx.profile, "2026-11-12", None),
			],
		)

	def test_the_day_is_today_when_none_is_given(self):
		self.site_has(of_the_day=["the_list"])
		SITE["list"] = []

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile)

		self.assertEqual(answer["date"], frappe.utils.nowdate())

	def test_people_that_are_not_a_list_of_names_are_refused(self):
		self.site_has(of_the_day=["the_list"])
		for sent in ({"a": 1}, [1], [["x"]]):
			with self.subTest(sent=sent):
				with self.assertRaises(frappe.PermissionError):
					self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10", sent)

	def test_the_first_hook_with_an_answer_counts_and_one_with_nothing_to_say_is_passed_over(self):
		self.site_has(of_the_day=["nothing_to_say", "the_list"])
		SITE["list"] = [self.an_appointment()]

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertEqual([row["booking"] for row in answer["appointments"]], ["BKG-1"])
		self.assertEqual([call[0] for call in SITE["calls"]], ["nothing_to_say", "the_list"])

	def test_when_no_hook_answers_the_agenda_is_not_available(self):
		self.site_has(of_the_day=["nothing_to_say"])

		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertFalse(answer["available"])

	def test_a_hook_that_breaks_is_logged_and_the_next_one_answers(self):
		self.site_has(of_the_day=["a_broken_list", "the_list"])
		SITE["list"] = [self.an_appointment()]

		with patch("frappe.log_error") as logged:
			answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertEqual(len(answer["appointments"]), 1)
		self.assertEqual(logged.call_args.args[0], "The appointments hook failed")

	def test_a_refusal_the_reservation_words_reaches_the_cashier_as_it_is(self):
		self.site_has(of_the_day=["a_refusing_list", "the_list"])
		SITE["list"] = [self.an_appointment()]

		with self.assertRaises(frappe.ValidationError) as caught:
			self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		self.assertIn("The salon is closed today.", str(caught.exception))
		self.assertNotIn("calls", SITE)

	def test_an_answer_that_is_not_a_list_is_refused_and_an_empty_one_is_an_empty_agenda(self):
		self.site_has(of_the_day=["the_list"])
		for answer in ("not a list", 5, {"appointments": []}):
			with self.subTest(answer=answer):
				SITE["list"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")

		SITE["list"] = []
		answer = self.as_the_cashier(appointments.get_appointments, self.fx.profile, "2026-11-10")
		self.assertEqual((answer["available"], answer["people"], answer["appointments"]), (True, [], []))

	# The draft of an appointment

	def test_the_draft_is_read_from_the_invoice_with_the_person_of_each_line(self):
		self.site_has(draft=["the_draft"])
		invoice = self.a_draft_of_the_till(payments=[{"mode_of_payment": self.fx.mode, "amount": 30}])
		SITE["draft"] = self.a_draft_answer(invoice)

		draft = self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

		doc = frappe.get_doc("Sales Invoice", invoice)
		self.assertEqual((draft["booking"], draft["invoice"]), ("BKG-1", invoice))
		self.assertEqual((draft["customer"], draft["customer_name"]), (doc.customer, doc.customer_name))
		self.assertEqual(
			[
				(line["line"], line["rate"], line["sales_person"], line["sales_person_name"])
				for line in draft["items"]
			],
			[(doc.items[0].name, 65.0, self.sonia, SONIA), (doc.items[1].name, 78.0, None, None)],
		)
		self.assertEqual(
			[(p["mode_of_payment"], p["amount"]) for p in draft["payments"]], [(self.fx.mode, 30.0)]
		)
		self.assertEqual(set(draft["payments"][0]), {"mode_of_payment", "amount", "reference_no", "account"})
		self.assertEqual(draft["paid_amount"], doc.paid_amount)
		self.assertEqual(draft["currency"], doc.currency)
		self.assertEqual(draft["grand_total"], doc.grand_total)
		self.assertEqual(SITE["calls"], [("the_draft", "BKG-1", self.fx.profile)])

	def test_the_steps_and_the_hours_come_from_the_hook_for_the_lines_it_names(self):
		self.site_has(draft=["the_draft"])
		invoice = self.a_draft_of_the_till()
		doc = frappe.get_doc("Sales Invoice", invoice)
		SITE["draft"] = self.a_draft_answer(
			invoice,
			booking="BKG-1",
			starts_at="2026-11-10 09:30:00",
			ends_at="2026-11-10 12:15:00",
			items=[
				{
					"line": doc.items[0].name,
					"step": 1,
					"starts_at": "2026-11-10 09:30:00",
					"rate": 1,
					"sales_person": "Marc",
				},
				{"line": "a line that is not there", "step": 9},
				"not a dict",
			],
		)

		draft = self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

		self.assertEqual(
			[(line["step"], line["starts_at"]) for line in draft["items"]],
			[(1, "2026-11-10 09:30:00"), (None, None)],
		)
		# What the invoice holds is not the hook's to rewrite: the rate and the person stay the draft's
		self.assertEqual(
			[(line["rate"], line["sales_person"]) for line in draft["items"]],
			[(65.0, self.sonia), (78.0, None)],
		)
		self.assertEqual(
			(draft["starts_at"], draft["ends_at"]), ("2026-11-10 09:30:00", "2026-11-10 12:15:00")
		)

	def test_the_options_of_a_line_come_with_it_and_what_has_no_option_says_none(self):
		if not frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers"):
			self.skipTest("this site has no options on its invoice lines")
		self.site_has(draft=["the_draft"])
		invoice = self.a_draft_of_the_till()
		doc = frappe.get_doc("Sales Invoice", invoice)
		options = json.dumps([{"group": "Length", "choice": "Mid", "price_delta": 15}])
		frappe.db.set_value("Sales Invoice Item", doc.items[0].name, "posa_item_modifiers", options)
		SITE["draft"] = self.a_draft_answer(invoice)

		draft = self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

		self.assertEqual([line["posa_item_modifiers"] for line in draft["items"]], [options, None])

	def test_a_draft_that_names_the_booking_asked_or_none_is_taken(self):
		self.site_has(draft=["the_draft"])
		invoice = self.a_draft_of_the_till()
		for named in ({}, {"booking": "BKG-1"}):
			with self.subTest(named=named):
				SITE["draft"] = self.a_draft_answer(invoice, **named)
				self.assertEqual(
					self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)["invoice"],
					invoice,
				)

	def test_a_draft_that_names_another_booking_is_refused(self):
		self.site_has(draft=["the_draft"])
		SITE["draft"] = self.a_draft_answer(self.a_draft_of_the_till(), booking="BKG-9")

		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_an_answer_that_is_not_a_dict_is_refused(self):
		self.site_has(draft=["the_draft"])
		for answer in ("ACC-SINV-1", ["invoice"], 5):
			with self.subTest(answer=answer):
				SITE["draft"] = answer
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_a_draft_of_another_till_is_refused(self):
		self.site_has(draft=["the_draft"])
		SITE["draft"] = self.a_draft_answer(self.a_draft_of_the_till(pos_profile=self.fx.other_profile))

		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_an_invoice_that_is_not_a_draft_is_refused(self):
		self.site_has(draft=["the_draft"])
		invoice = self.a_draft_of_the_till()
		frappe.db.set_value("Sales Invoice", invoice, "docstatus", 1)
		SITE["draft"] = self.a_draft_answer(invoice)

		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_a_name_that_is_no_invoice_is_refused(self):
		self.site_has(draft=["the_draft"])
		for invoice in ("ACC-SINV-NOPE", None, ""):
			with self.subTest(invoice=invoice):
				SITE["draft"] = self.a_draft_answer(invoice)
				with self.assertRaises(frappe.ValidationError):
					self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_a_draft_with_no_line_is_refused(self):
		self.site_has(draft=["the_draft"])
		invoice = self.a_draft_of_the_till()
		frappe.db.delete("Sales Invoice Item", {"parent": invoice})
		SITE["draft"] = self.a_draft_answer(invoice)

		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_a_draft_is_not_taken_while_the_tick_is_off_nor_where_the_site_has_no_hook(self):
		self.site_has(draft=["the_draft"])
		SITE["draft"] = self.a_draft_answer(self.a_draft_of_the_till())
		self.tick(False)
		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)
		self.assertNotIn("calls", SITE)

		self.tick(True)
		self.site_has(draft=["a_draft_with_nothing_to_say"])
		with self.assertRaises(frappe.ValidationError):
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

	def test_a_refusal_the_reservation_words_reaches_the_cashier_when_a_draft_is_asked_for(self):
		self.site_has(draft=["a_refusing_draft"])

		with self.assertRaises(frappe.ValidationError) as caught:
			self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile)

		self.assertIn("This appointment is already collected.", str(caught.exception))

	def test_a_booking_that_is_not_a_text_is_refused(self):
		self.site_has(draft=["the_draft"])
		for sent in (["BKG-1"], {"a": 1}, "", "   ", None):
			with self.subTest(sent=sent):
				with self.assertRaises((frappe.PermissionError, frappe.ValidationError, FrappeTypeError)):
					self.as_the_cashier(appointments.take_appointment, sent, self.fx.profile)

	# Who may ask

	def test_a_visitor_a_portal_account_and_the_cashier_of_another_till_are_refused_on_both_endpoints(self):
		self.site_has(of_the_day=["the_list"], draft=["the_draft"])
		SITE["list"] = [self.an_appointment()]
		SITE["draft"] = self.a_draft_answer(self.a_draft_of_the_till())

		for user in ("Guest", PORTAL, OTHER_TILL):
			with self.subTest(user=user, method="get_appointments"):
				with self.assertRaises(frappe.PermissionError):
					self.as_the_cashier(
						appointments.get_appointments, self.fx.profile, "2026-11-10", user=user
					)
			with self.subTest(user=user, method="take_appointment"):
				with self.assertRaises(frappe.PermissionError):
					self.as_the_cashier(appointments.take_appointment, "BKG-1", self.fx.profile, user=user)

		self.assertNotIn("calls", SITE)

	def test_a_till_that_is_not_named_is_refused(self):
		for sent in (None, "", ["x"]):
			with self.subTest(sent=sent):
				with self.assertRaises((frappe.PermissionError, FrappeTypeError)):
					self.as_the_cashier(appointments.get_appointments, sent)
