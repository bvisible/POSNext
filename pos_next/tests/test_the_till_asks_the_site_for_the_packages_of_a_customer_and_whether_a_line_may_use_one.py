# //// Neoffice — added file (no upstream equivalent).
"""The packages of sessions at the till (NeoSalon, lots G11, voie 1; product owner, 13.11.2026).

The till asks the site, through the hooks of the package lane, for the packages of a named customer and whether a line may be paid by one. The suite pins, as the
real cashier of the till, with stand-ins for the hooks:

- the packages come back clean (the keys the till knows, the types it expects, every list cut) and only where the site says it runs packages today;
- a till whose site does not say so is told nothing is available, not that the customer has no package;
- the question of a use writes nothing, is asked with what the till knows (customer, package, item, quantity, sessions already taken in the cart), and the till
  keeps an agreement only if the site says yes, for the package asked, with a line worth 0.00;
- a visitor, another till's cashier, and a call with no named customer are refused before any lane hears of it.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments, packages
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_till_fixture,
	_user,
)

ME = (
	"pos_next.tests.test_the_till_asks_the_site_for_the_packages_of_a_customer_and_whether_a_line_may_use_one"
)
SITE = {}


def the_packages(pos_profile, customer):
	SITE.setdefault("calls", []).append(("packages", pos_profile, customer))
	return SITE.get("packages")


def a_use(pos_profile, customer, package, item_code, qty=1, in_cart=0):
	SITE.setdefault("calls", []).append(("use", pos_profile, customer, package, item_code, qty, in_cart))
	return SITE.get("use")


def what_the_site_runs():
	return SITE.get("runs", {"repeat": False, "packages": True})


HOOKS = {
	"packages": appointments.PACKAGES_HOOK,
	"use": appointments.USE_PACKAGE_HOOK,
	"runs": appointments.TILL_CAPABILITIES_HOOK,
}
STUBS = {"packages": "the_packages", "use": "a_use", "runs": "what_the_site_runs"}
PACKAGE = {
	"package": "CPK-2026-00001",
	"title": "Forfait 10 brushings",
	"remaining": 7,
	"total": 10,
	"valid_till": "2027-11-10",
	"items": ["SRV-BRUSHING"],
	"item_groups": ["Soins"],
}
YES = {
	"ok": True,
	"line": {"customer_package": "CPK-2026-00001", "discount_percentage": 100},
	"remaining_after": 6,
	"label": "Réglé par le forfait · 1 séance",
}


class TestTheTillAsksTheSiteForThePackagesOfACustomerAndWhetherALineMayUseOne(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()

	def site_has(self, *names):
		"""The hooks the site declares, by the name of the lane."""
		table = {hook: [f"{ME}.{STUBS[name]}"] if name in names else [] for name, hook in HOOKS.items()}
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def ask(self, method, *args, user=TILL, **kwargs):
		frappe.set_user(user)
		try:
			return method(self.fx.profile, *args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def packages_of(self, customer="CUST-1", **kwargs):
		return self.ask(packages.get_customer_packages, customer, **kwargs)

	def use(self, package="CPK-2026-00001", item="SRV-BRUSHING", **kwargs):
		return self.ask(packages.check_package_use, "CUST-1", package, item, **kwargs)

	# the packages of a customer
	def test_the_packages_of_a_customer_come_back_clean(self):
		self.site_has("packages", "use", "runs")
		SITE["packages"] = [
			{
				**PACKAGE,
				"extra": "never read",
				"remaining": "7",
				"items": ["A"] * 400,
				"valid_till": "not a date",
			},
			{"package": "", "title": "no name"},
			"not a package",
		]

		answer = self.packages_of()

		self.assertEqual(answer["available"], True)
		self.assertEqual(len(answer["packages"]), 1)
		clean = answer["packages"][0]
		self.assertEqual((clean["package"], clean["remaining"], clean["total"]), ("CPK-2026-00001", 7, 10))
		self.assertIsNone(clean["valid_till"])
		self.assertEqual(len(clean["items"]), packages.MOST_ITEMS)
		self.assertNotIn("extra", clean)

	def test_at_most_fifty_packages_come_back(self):
		self.site_has("packages", "use", "runs")
		SITE["packages"] = [{**PACKAGE, "package": f"CPK-{n}"} for n in range(80)]

		self.assertEqual(len(self.packages_of()["packages"]), packages.MOST_PACKAGES)

	def test_a_customer_with_no_package_has_an_empty_list_and_it_is_available(self):
		self.site_has("packages", "use", "runs")
		SITE["packages"] = []

		self.assertEqual(self.packages_of(), {"available": True, "packages": []})

	def test_a_site_that_does_not_say_it_runs_packages_has_none_available_and_is_not_asked(self):
		self.site_has("packages", "use", "runs")
		SITE["runs"] = {"repeat": True, "packages": False}
		SITE["packages"] = [PACKAGE]

		self.assertEqual(self.packages_of(), {"available": False, "packages": []})
		self.assertNotIn("calls", SITE)

	def test_a_site_without_the_lane_has_none_available(self):
		self.site_has("runs")

		self.assertEqual(self.packages_of(), {"available": False, "packages": []})

	def test_an_answer_that_is_not_a_list_is_not_available(self):
		self.site_has("packages", "use", "runs")
		for answer in (None, {"packages": []}, "x"):
			with self.subTest(answer=str(answer)):
				SITE["packages"] = answer
				self.assertEqual(self.packages_of(), {"available": False, "packages": []})

	# the use of a package by a line
	def test_a_line_a_package_may_pay_comes_back_with_its_fields(self):
		self.site_has("packages", "use", "runs")
		SITE["use"] = {**YES, "extra": 1}

		answer = self.use(qty=1, in_cart=2)

		self.assertEqual(
			answer,
			{
				"ok": True,
				"line": {"customer_package": "CPK-2026-00001", "discount_percentage": 100},
				"remaining_after": 6,
				"label": "Réglé par le forfait · 1 séance",
			},
		)
		self.assertEqual(
			SITE["calls"], [("use", self.fx.profile, "CUST-1", "CPK-2026-00001", "SRV-BRUSHING", 1, 2)]
		)

	def test_a_refusal_says_its_words(self):
		self.site_has("packages", "use", "runs")
		SITE["use"] = {"ok": False, "why": "Ce forfait est échu."}

		self.assertEqual(self.use(), {"ok": False, "why": "Ce forfait est échu."})

	def test_an_agreement_that_is_not_one_is_a_refusal(self):
		self.site_has("packages", "use", "runs")
		other = {**YES, "line": {"customer_package": "CPK-OTHER", "discount_percentage": 100}}
		half = {**YES, "line": {"customer_package": "CPK-2026-00001", "discount_percentage": 50}}
		for answer in (
			other,
			half,
			{"ok": "yes", "line": YES["line"]},
			{"ok": True},
			{"ok": True, "line": "x"},
		):
			with self.subTest(answer=str(answer)):
				SITE["use"] = answer
				self.assertFalse(self.use()["ok"])

	def test_the_question_is_refused_where_the_site_does_not_run_packages_or_answers_nothing(self):
		self.site_has("packages", "use", "runs")
		SITE["runs"] = {"repeat": False, "packages": False}
		with self.assertRaisesRegex(frappe.ValidationError, "does not use packages"):
			self.use()
		SITE["runs"] = {"repeat": False, "packages": True}
		SITE["use"] = None
		with self.assertRaisesRegex(frappe.ValidationError, "does not use packages"):
			self.use()

	def test_a_quantity_out_of_bounds_is_refused_before_any_lane_hears_of_it(self):
		self.site_has("packages", "use", "runs")
		SITE["use"] = YES
		for qty in (0, -1, packages.MOST_QTY + 1):
			with self.subTest(qty=qty):
				with self.assertRaises(frappe.ValidationError):
					self.use(qty=qty)
		self.assertNotIn("calls", SITE)

	# who may ask
	def test_a_visitor_another_tills_cashier_and_a_call_with_no_customer_are_refused(self):
		self.site_has("packages", "use", "runs")
		SITE["packages"] = [PACKAGE]
		SITE["use"] = YES
		for user in ("Guest", OTHER_TILL):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.ask(packages.get_customer_packages, "CUST-1", user=user)
				with self.assertRaises(frappe.PermissionError):
					self.ask(
						packages.check_package_use, "CUST-1", "CPK-2026-00001", "SRV-BRUSHING", user=user
					)
		for customer in ("", "  ", None):
			with self.subTest(customer=customer):
				with self.assertRaises(frappe.PermissionError):
					self.ask(packages.get_customer_packages, customer)
		self.assertNotIn("calls", SITE)
