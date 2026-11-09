# //// Neoffice — added file (no upstream equivalent).
"""A sale names its sales person on each line, from the cashier's till to the return (NeoSalon, step 1, lot G1.4; product owner, 09.11.2026).

The rules of the lines are pinned one by one in `test_a_service_asks_for_its_person_and_a_product_only_if_the_till_follows_products`; this
suite plays the sale itself, as the real cashier of the till (the role « POSNext Cashier », not an administrator), through the endpoints the
till calls — the save (`update_invoice`) and the payment (`submit_invoice`) — with the option on:

- a person on each line, and the commission of each line goes to the person of the line, at that person's rate;
- a service with no person is refused, a product alone with none is not (the tick of the products off), and is when the tick is on;
- a person chosen for the whole sale covers the lines that have none;
- a sale played back from the offline queue is never refused and keeps the people it names;
- the return of such a sale gives back the commission of the person of each line.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
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
	TILL,
	_sale,
	_till_fixture,
	_user,
)

SHELF = "_Test SB Shelf"
SHAMPOO = "_Test SB Shampoo"
HOOK = "pos_next_item_kind"
THE_HOOK = (
	"pos_next.tests.test_a_sale_names_its_person_on_each_line_from_the_till_to_the_return.what_the_site_says"
)
ANSWERS = {}
REQUIRED = "Sales Person is required"
OFFLINE_ID = "salon-g1-offline-sale"


def what_the_site_says(item_code):
	return ANSWERS.get(item_code)


class TestASaleNamesItsPersonOnEachLineFromTheTillToTheReturn(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		# update_invoice commits (restaurant fields): a no-op here keeps the test inside the transaction tearDown rolls back
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_forget_the_people_of_the_suite()
		self.addCleanup(_forget_the_people_of_the_suite)
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		# The people first, the setting after (while a till asks for a sales person, saving an employee makes the sales person)
		luc_employee = an_employee("TestSPLuc", self.fx.company, user_id=TILL)
		sonia_employee = an_employee("TestSPSonia", self.fx.company)
		self.luc = a_sales_person(LUC, luc_employee, self.fx.company, commission_rate=10)
		self.sonia = a_sales_person(SONIA, sonia_employee, self.fx.company, commission_rate=15)
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Single"
		)
		shelf = frappe.db.exists("Item Group", SHELF) or a_group(SHELF, the_root())
		self.service = self.fx.item
		self.product = frappe.db.exists("Item", SHAMPOO) or an_item(SHAMPOO, shelf, self.fx.company)
		ANSWERS.clear()
		ANSWERS.update({self.service: "service", self.product: "product"})
		self.addCleanup(ANSWERS.clear)
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return [THE_HOOK] if hook == HOOK else real(hook, *args, **kwargs)

		hooks = patch("frappe.get_hooks", side_effect=get_hooks)
		hooks.start()
		self.addCleanup(hooks.stop)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		# update_invoice sets it for the rest of the request and never resets it
		frappe.flags.ignore_account_permission = self.account_flag

	def follow_products(self, on):
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "track_product_sales_by_person", int(on)
		)

	def line(self, item, rate, person=None):
		return {
			"item_code": item,
			"qty": 1,
			"rate": rate,
			"price_list_rate": rate,
			**({"sales_person": person} if person else {}),
		}

	def sale(self, *lines, **changes):
		total = sum(line["rate"] * line["qty"] for line in lines)
		return _sale(
			self.fx,
			items=list(lines),
			payments=[{"mode_of_payment": self.fx.mode, "amount": total}],
			**changes,
		)

	def pay(self, sale, team=None):
		"""The cashier saves the sale, then pays it: the two calls of the till."""
		frappe.set_user(TILL)
		draft = invoices.update_invoice(json.dumps({**sale, "sales_team": team or []}))
		done = invoices.submit_invoice(
			invoice=json.dumps({**sale, "name": draft["name"]}), data=json.dumps({"sales_team": team or []})
		)
		frappe.set_user("Administrator")
		return done["name"]

	def team_of(self, invoice):
		return {row.sales_person: row for row in frappe.get_doc("Sales Invoice", invoice).get("sales_team")}

	# A person on each line

	def test_each_line_names_its_person_and_the_commission_goes_to_the_person_of_the_line(self):
		sale = self.sale(self.line(self.service, 60, self.sonia), self.line(self.product, 30, self.luc))

		invoice = self.pay(sale)
		team = self.team_of(invoice)

		self.assertEqual(set(team), {self.sonia, self.luc})
		self.assertEqual(float(team[self.sonia].commission_rate), 15)
		self.assertEqual(float(team[self.luc].commission_rate), 10)
		self.assertAlmostEqual(float(team[self.sonia].incentives), 9.0, places=2)
		self.assertAlmostEqual(float(team[self.luc].incentives), 3.0, places=2)
		items = frappe.get_all(
			"Sales Invoice Item", filters={"parent": invoice}, fields=["item_code", "sales_person"]
		)
		self.assertEqual(
			{row.item_code: row.sales_person for row in items},
			{self.service: self.sonia, self.product: self.luc},
		)

	# What is refused, what is not

	def test_a_service_without_a_person_is_refused(self):
		sale = self.sale(self.line(self.service, 60))
		frappe.set_user(TILL)

		with self.assertRaises(frappe.ValidationError) as caught:
			invoices.submit_invoice(invoice=json.dumps(sale), data="{}")

		self.assertIn(REQUIRED, str(caught.exception))

	def test_a_product_alone_passes_without_a_person_while_products_are_not_followed(self):
		sale = self.sale(self.line(self.product, 30))

		invoice = self.pay(sale)

		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)
		self.assertEqual(self.team_of(invoice), {})

	def test_a_product_alone_is_refused_without_a_person_when_products_are_followed(self):
		self.follow_products(True)
		sale = self.sale(self.line(self.product, 30))
		frappe.set_user(TILL)

		with self.assertRaises(frappe.ValidationError) as caught:
			invoices.submit_invoice(invoice=json.dumps(sale), data="{}")

		self.assertIn(REQUIRED, str(caught.exception))

	def test_a_person_chosen_for_the_whole_sale_covers_the_lines_that_have_none(self):
		sale = self.sale(self.line(self.service, 60), self.line(self.product, 30))

		team = self.team_of(self.pay(sale, [{"sales_person": self.luc, "allocated_percentage": 100}]))

		self.assertEqual(set(team), {self.luc})

	def test_a_line_with_a_person_next_to_one_with_none_is_covered_by_the_person_of_the_sale(self):
		sale = self.sale(self.line(self.service, 60, self.sonia), self.line(self.product, 30))

		team = self.team_of(self.pay(sale, [{"sales_person": self.luc, "allocated_percentage": 100}]))

		self.assertEqual(set(team), {self.sonia, self.luc})

	# A sale played back from the offline queue

	def test_a_sale_played_back_from_the_offline_queue_is_never_refused_and_keeps_its_people(self):
		self.follow_products(True)
		frappe.set_user(TILL)
		without = {
			"invoice": self.sale(self.line(self.service, 60), offline_id=OFFLINE_ID),
			"data": {"sales_team": []},
		}
		named = {
			"invoice": self.sale(self.line(self.service, 60, self.sonia), offline_id=OFFLINE_ID + "-2"),
			"data": {"sales_team": []},
		}

		synced = invoices.submit_invoice(data=json.dumps(without))
		synced_named = invoices.submit_invoice(data=json.dumps(named))

		self.assertEqual((synced["status"], synced_named["status"]), (1, 1))
		self.assertEqual(self.team_of(synced["name"]), {})
		self.assertEqual(set(self.team_of(synced_named["name"])), {self.sonia})

	# The return

	def test_the_return_of_a_sale_gives_back_the_commission_of_the_person_of_each_line(self):
		sale = self.sale(self.line(self.service, 60, self.sonia), self.line(self.product, 30, self.luc))
		original = self.pay(sale)
		rows = frappe.get_all(
			"Sales Invoice Item", filters={"parent": original}, fields=["name", "item_code", "rate"]
		)
		giving_back = _sale(
			self.fx,
			is_return=1,
			return_against=original,
			items=[
				{
					"item_code": row.item_code,
					"qty": -1,
					"rate": row.rate,
					"price_list_rate": row.rate,
					"sales_invoice_item": row.name,
				}
				for row in rows
			],
			payments=[{"mode_of_payment": self.fx.mode, "amount": -90}],
		)

		returned = self.pay(giving_back)

		team = self.team_of(returned)
		self.assertEqual(set(team), {self.sonia, self.luc})
		self.assertAlmostEqual(float(team[self.sonia].incentives), -9.0, places=2)
		self.assertAlmostEqual(float(team[self.luc].incentives), -3.0, places=2)
