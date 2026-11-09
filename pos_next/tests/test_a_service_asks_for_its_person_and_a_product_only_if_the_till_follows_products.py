# //// Neoffice — added file (no upstream equivalent).
"""Which lines of a sale ask for their sales person (NeoSalon, step 1, lot G1; product owner, 09.11.2026, decision T5).

The till's « sales persons » setting makes it ask for a person on every billable line. A salon sells services and products, and the
product owner decided that it is a setting, not a fixed rule: services always ask, a product asks only when the till follows the sales of
products by person too (`POS Settings.track_product_sales_by_person`, off by default). What a line is — service or product — is told
by the site through the hook `pos_next_item_kind(item_code)`; without it, or when it has no answer, the line is a service and the
rule is exactly what it was.

The suite pins:

- that nothing changes without the hook: a product asks for its person like any line;
- that with the hook and the setting off, a product asks for none, a service still does, and a person chosen for the sale still covers both;
- that with the setting on, a product asks like a service;
- that a hook with no answer, or that fails, leaves the line asking, and a failure is logged;
- that a line worth nothing, and a sale played back from the offline queue, ask for none (the till and the server agree on this);
- what the till is told about the kind of each line it holds, and who may ask.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.sales_person_lines import item_kind, item_kinds
from pos_next.tests.test_service_families import a_group, an_item, the_root
from pos_next.tests.test_the_till_offers_every_sales_person_and_marks_the_cashiers_own import (
	LUC,
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

SHELF = "_Test SB Shelf"
SHAMPOO = "_Test SB Shampoo"
HOOK = "pos_next_item_kind"
THE_HOOK = "pos_next.tests.test_a_service_asks_for_its_person_and_a_product_only_if_the_till_follows_products.what_the_site_says"
# What the site's hook answers, item by item: set by each test (an item it does not name gets None)
ANSWERS = {}
REQUIRED = "Sales Person is required"


def what_the_site_says(item_code):
	"""The hook of the suite, in the place of the site's own."""
	answer = ANSWERS.get(item_code)
	if isinstance(answer, Exception):
		raise answer
	return answer


class TestAServiceAsksForItsPersonAndAProductOnlyIfTheTillFollowsProducts(FrappeTestCase):
	def setUp(self):
		super().setUp()
		_forget_the_people_of_the_suite()
		self.addCleanup(_forget_the_people_of_the_suite)
		self.addCleanup(ANSWERS.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")  # the fixture's second till names it
		_user(PORTAL, ["Customer"], "Website User")
		self.fx = _till_fixture()
		# The people first, the setting after: while a till asks for a sales person, saving an employee makes the sales person
		luc_employee = an_employee("TestSPLuc", self.fx.company, user_id=TILL)
		sonia_employee = an_employee("TestSPSonia", self.fx.company)
		self.luc = a_sales_person(LUC, luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, sonia_employee, self.fx.company, commission_rate=15)
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Single"
		)
		self.service = self.fx.item
		self.product = an_item(SHAMPOO, a_group(SHELF, the_root()), self.fx.company)
		self.the_site_says({self.service: "service", self.product: "product"})

	def the_site_says(self, answers):
		ANSWERS.clear()
		ANSWERS.update(answers)
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return [THE_HOOK] if hook == HOOK else real(hook, *args, **kwargs)

		hooks = patch("frappe.get_hooks", side_effect=get_hooks)
		hooks.start()
		self.addCleanup(hooks.stop)

	def follow_products(self, on):
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "track_product_sales_by_person", int(on)
		)

	def sale(self, *items, **changes):
		"""An unsaved sale of the till: one line per item given as (item, person or None, rate)."""
		lines = [
			{"item_code": item, "qty": 1, "rate": rate, **({"sales_person": person} if person else {})}
			for item, person, rate in items
		]
		return frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": self.fx.company,
				"customer": self.fx.customer,
				"currency": self.fx.currency,
				"selling_price_list": self.fx.price_list,
				"posting_date": frappe.utils.nowdate(),
				"pos_profile": self.fx.profile,
				"items": lines,
				**changes,
			}
		)

	def ask(self, sale, team=None):
		invoices._apply_pos_sales_team(sale, team, self.fx.profile)

	def assertRefused(self, sale, team=None):
		with self.assertRaises(frappe.ValidationError) as caught:
			self.ask(sale, team)
		self.assertIn(REQUIRED, str(caught.exception))

	# Without the hook, the rule is what it was

	def test_without_a_hook_a_product_asks_for_its_person_like_any_line(self):
		ANSWERS.clear()
		with patch("frappe.get_hooks", return_value=[]):
			self.assertRefused(self.sale((self.product, None, 30)))

	def test_a_hook_with_no_answer_leaves_the_line_a_service(self):
		self.the_site_says({self.product: None})

		self.assertEqual(item_kind(self.product), None)
		self.assertRefused(self.sale((self.product, None, 30)))

	def test_a_hook_that_fails_leaves_the_line_asking_and_is_logged(self):
		self.the_site_says({self.product: RuntimeError("the site's hook is broken")})

		with patch("frappe.log_error") as logged:
			self.assertRefused(self.sale((self.product, None, 30)))

		self.assertTrue(logged.called)
		self.assertEqual(logged.call_args.args[0], "The item kind hook failed")

	# The setting is off (the default): only services ask

	def test_the_setting_is_off_by_default(self):
		self.assertEqual(
			frappe.db.get_value(
				"POS Settings", {"pos_profile": self.fx.profile}, "track_product_sales_by_person"
			),
			0,
		)

	def test_a_product_alone_asks_for_no_person_when_products_are_not_followed(self):
		sale = self.sale((self.product, None, 30))

		self.ask(sale)

		self.assertEqual([row.sales_person for row in sale.sales_team], [])

	def test_a_service_still_asks_when_products_are_not_followed(self):
		self.assertRefused(self.sale((self.service, None, 60)))

	def test_a_service_with_its_person_and_a_product_with_none_pass(self):
		sale = self.sale((self.service, self.sonia, 60), (self.product, None, 30))

		self.ask(sale)

		self.assertEqual({row.sales_person for row in sale.sales_team}, {self.sonia})

	def test_a_service_without_a_person_is_refused_even_next_to_a_product_with_one(self):
		self.assertRefused(self.sale((self.service, None, 60), (self.product, self.luc, 30)))

	def test_a_person_chosen_for_the_sale_covers_a_service_and_a_product(self):
		sale = self.sale((self.service, None, 60), (self.product, None, 30))

		self.ask(sale, [{"sales_person": self.luc, "allocated_percentage": 100}])

		self.assertEqual({row.sales_person for row in sale.sales_team}, {self.luc})

	# The setting is on: a product asks like a service

	def test_a_product_asks_for_its_person_when_products_are_followed(self):
		self.follow_products(True)

		self.assertRefused(self.sale((self.product, None, 30)))

	def test_a_product_with_its_person_passes_when_products_are_followed(self):
		self.follow_products(True)
		sale = self.sale((self.product, self.luc, 30))

		self.ask(sale)

		self.assertEqual({row.sales_person for row in sale.sales_team}, {self.luc})

	# What the till and the server agree on

	def test_a_line_worth_nothing_asks_for_no_person(self):
		self.follow_products(True)
		sale = self.sale((self.service, self.luc, 60), (self.product, None, 0))

		self.ask(sale)

		self.assertEqual({row.sales_person for row in sale.sales_team}, {self.luc})

	def test_a_sale_played_back_from_the_offline_queue_is_never_refused(self):
		self.follow_products(True)
		sale = self.sale((self.service, None, 60), (self.product, None, 30))
		sale.flags.pos_offline_sync = True

		self.ask(sale)

	# What the till is told about its lines

	def test_the_cashier_is_told_the_kind_of_each_line_of_the_cart(self):
		self.the_site_says({self.service: "service", self.product: "product"})
		frappe.set_user(TILL)

		kinds = item_kinds(self.fx.profile, json.dumps([self.service, self.product, "_Test SB Nobody"]))

		self.assertEqual(kinds, {self.service: "service", self.product: "product", "_Test SB Nobody": ""})

	def test_a_site_without_the_hook_tells_the_till_nothing_about_the_kind(self):
		frappe.set_user(TILL)
		with patch("frappe.get_hooks", return_value=[]):
			kinds = item_kinds(self.fx.profile, [self.product])

		self.assertEqual(kinds, {self.product: ""})

	def test_the_till_reads_the_setting_with_the_others(self):
		self.follow_products(True)
		frappe.set_user(TILL)
		from pos_next.api.pos_profile import get_pos_settings

		self.assertEqual(get_pos_settings(self.fx.profile)["track_product_sales_by_person"], 1)

	def test_an_account_that_is_not_of_the_till_cannot_ask(self):
		for user in (PORTAL, OTHER_TILL, "Guest"):
			with self.subTest(user=user):
				frappe.set_user(user)
				with self.assertRaises(frappe.PermissionError):
					item_kinds(self.fx.profile, [self.product])

	def test_a_name_that_is_not_a_list_of_texts_is_refused(self):
		frappe.set_user(TILL)
		for sent in ({"a": 1}, [["x"]], [1], "not json"):
			with self.subTest(sent=sent):
				with self.assertRaises((frappe.PermissionError, ValueError)):
					item_kinds(self.fx.profile, sent)
