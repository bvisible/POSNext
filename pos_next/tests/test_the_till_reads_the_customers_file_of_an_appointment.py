# //// Neoffice — added file (no upstream equivalent).
"""The customer's file of an appointment, read at the till (NeoSalon, voie 4, 19.11.2026): her last colour formula, where her allergy test stands, her
agreement for health data. Read only.

The site decides what the till may read of it: the till plays its side with a stand-in for the hook, as the real cashier:

- that a visitor, a portal account and the cashier of another till are refused before the hook is called, and nothing is asked while the till's tick is off;
- that what the site answers is cleaned to the fixed shape (texts cut, days as days, states among the known ones), that no key outside the contract
  goes through (a health remark, a photo, what a test found), and that anything but a mapping is no file;
- that a site with no hook, a hook that says nothing or one that breaks gives no file and never an error of the till;
- that the till offers the file only where the hook is declared AND the site says it keeps customer records (`file` of the capabilities hook).
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

ME = "pos_next.tests.test_the_till_reads_the_customers_file_of_an_appointment"
SITE = {}


def the_file(*args):
	SITE.setdefault("calls", []).append(("file", *args))
	return SITE.get("answer")


def nothing_to_say(*args):
	SITE.setdefault("calls", []).append(("nothing_to_say", *args))
	return None


def breaks(*args):
	raise RuntimeError("the lane is broken")


def refuses(*args):
	frappe.throw("The file cannot be read here.")


class TestTheTillReadsTheCustomersFileOfAnAppointment(FrappeTestCase):
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

	def site_has(self, file=(), capabilities=()):
		"""The hooks the site declares: `file=["the_file"]`, `capabilities=["says_yes"]`; every other one is empty."""
		table = {getattr(appointments, name): [] for name in dir(appointments) if name.endswith("_HOOK")}
		table[appointments.FILE_HOOK] = [f"{ME}.{path}" for path in file]
		table[appointments.TILL_CAPABILITIES_HOOK] = [f"{ME}.{path}" for path in capabilities]
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

	def read(self, user=TILL):
		return self.as_the_cashier(appointments.get_appointment_file, "BKG-1", self.fx.profile, user=user)

	# The door

	def test_a_visitor_a_portal_account_and_the_cashier_of_another_till_are_refused_before_the_site_hears_of_it(
		self,
	):
		self.site_has(file=["the_file"])
		SITE["answer"] = {"has_record": 1}

		for user in ("Guest", PORTAL, OTHER_TILL):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.read(user)

		self.assertNotIn("calls", SITE)

	def test_nothing_is_asked_while_the_tick_is_off(self):
		self.site_has(file=["the_file"])
		SITE["answer"] = {"has_record": 1}
		self.tick(False)

		with self.assertRaises(frappe.ValidationError):
			self.read()

		self.assertNotIn("calls", SITE)

	def test_a_blank_booking_is_refused_before_any_lane_hears_of_it(self):
		self.site_has(file=["the_file"])

		with self.assertRaises(frappe.PermissionError):
			self.as_the_cashier(appointments.get_appointment_file, "   ", self.fx.profile)

		self.assertNotIn("calls", SITE)

	# What it says

	def test_the_file_is_asked_for_the_appointment_of_this_till_and_comes_cut_to_the_fixed_shape(self):
		self.site_has(file=["the_file"])
		SITE["answer"] = {
			"customer": "CUST-1",
			"has_record": 1,
			"agreement": {"state": "given", "on": "2026-10-02", "text": "the whole text of the agreement"},
			"formula": {
				"service": "Balayage",
				"applied_on": "2026-10-02",
				"formula": "6.1 + 7.3 " * 100,
				"developer": "Oxydant 6 %",
				"minutes": 35,
				"remark": "Racines plus claires " * 30,
				"done_by": "someone@example.com",
			},
			"allergy": {
				"state": "current",
				"tested_on": "2026-10-01",
				"valid_until": "2027-04-01",
				"rule": "After a number of months",
				"result": "positive: nickel",
			},
			"health_notes": "asthma",
			"photos": ["/private/files/a.jpg"],
		}

		file = self.read()

		self.assertEqual(SITE["calls"], [("file", self.fx.profile, "BKG-1")])
		self.assertEqual(set(file), {"has_record", "agreement", "formula", "allergy"})
		self.assertEqual(file["has_record"], True)
		self.assertEqual(file["agreement"], {"state": "given", "on": "2026-10-02"})
		self.assertEqual(
			set(file["formula"]), {"service", "applied_on", "formula", "developer", "minutes", "remark"}
		)
		self.assertEqual(len(file["formula"]["formula"]), 600)
		self.assertEqual(len(file["formula"]["remark"]), 300)
		self.assertEqual(file["formula"]["minutes"], 35)
		self.assertEqual(
			file["allergy"],
			{
				"state": "current",
				"tested_on": "2026-10-01",
				"valid_until": "2027-04-01",
				"rule": "After a number of months",
			},
		)
		blob = repr(file)
		for private in ("asthma", "nickel", "a.jpg", "whole text", "someone@example.com"):
			self.assertNotIn(private, blob)

	def test_a_state_or_a_day_the_contract_does_not_know_is_read_as_none(self):
		self.site_has(file=["the_file"])
		SITE["answer"] = {
			"has_record": 0,
			"agreement": {"state": "granted-by-phone", "on": "yesterday"},
			"formula": None,
			"allergy": {"state": "maybe", "tested_on": "last spring", "valid_until": None, "rule": None},
		}

		file = self.read()

		self.assertEqual(file["has_record"], False)
		self.assertEqual(file["agreement"], {"state": "none", "on": None})
		self.assertIsNone(file["formula"])
		self.assertEqual(file["allergy"]["state"], "none")
		self.assertIsNone(file["allergy"]["tested_on"])

	def test_a_site_that_runs_no_salon_says_no_formula_and_no_allergy_test(self):
		self.site_has(file=["the_file"])
		SITE["answer"] = {"has_record": 1, "agreement": {"state": "withdrawn", "on": "2026-11-02"}}

		file = self.read()

		self.assertEqual(file["agreement"], {"state": "withdrawn", "on": "2026-11-02"})
		self.assertIsNone(file["formula"])
		self.assertIsNone(file["allergy"])

	def test_anything_but_a_mapping_is_no_file(self):
		for answer in ("a text", ["a", "list"], 12, True):
			with self.subTest(answer=answer):
				SITE.clear()
				self.site_has(file=["the_file"])
				SITE["answer"] = answer
				self.assertIsNone(self.read())

	def test_a_site_with_no_hook_or_a_hook_that_says_nothing_or_breaks_gives_no_file_and_never_an_error(self):
		self.site_has()
		self.assertIsNone(self.read())
		for lane in ("nothing_to_say", "breaks"):
			with self.subTest(lane=lane):
				self.site_has(file=[lane])
				with patch("frappe.log_error"):
					self.assertIsNone(self.read())

	def test_the_sites_own_refusal_reaches_the_cashier_as_it_is(self):
		self.site_has(file=["refuses"])

		with self.assertRaises(frappe.ValidationError) as caught:
			self.read()

		self.assertIn("The file cannot be read here.", str(caught.exception))

	# What the till offers

	def test_the_till_offers_the_file_only_where_the_hook_is_declared_and_the_site_says_it_keeps_records(
		self,
	):
		self.site_has(file=["the_file"], capabilities=["says_the_file_runs"])
		self.assertTrue(appointments._capabilities()["file"])

		self.site_has(file=["the_file"], capabilities=["says_the_file_does_not_run"])
		self.assertFalse(appointments._capabilities()["file"], "a declared hook alone says nothing")

		self.site_has(capabilities=["says_the_file_runs"])
		self.assertFalse(appointments._capabilities()["file"], "no hook: nothing to call")

		self.site_has(file=["the_file"], capabilities=["says_nothing_useful"])
		self.assertFalse(
			appointments._capabilities()["file"], "an answer that is not a mapping says nothing runs"
		)

	def test_the_other_capabilities_stay_as_they_were(self):
		self.site_has(file=["the_file"], capabilities=["says_the_file_runs"])

		capabilities = appointments._capabilities()

		self.assertFalse(capabilities["repeat"])
		self.assertFalse(capabilities["packages"])


def says_the_file_runs():
	return {"repeat": False, "packages": False, "file": True}


def says_the_file_does_not_run():
	return {"repeat": False, "packages": False, "file": False}


def says_nothing_useful():
	return ["not", "a", "mapping"]
