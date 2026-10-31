# //// Neoffice — added file (no upstream equivalent).
"""Money in and out of a till's drawer (« Entrées/Sorties de caisse »), NeoRestau lot 1, task 15.

Every movement is booked exactly as its Journal Entry Template declares it (Credit: the counterparty is
debited and the totalization credited; Debit: the reverse), its drawer direction is what happens to the
till's cash account, and a template that does not move that account is refused. The till's list of
operations is a control the server checks on every write; the shift's cashier or a till manager records;
the VAT is split by the desk's journal-entry logic unless the cashier says « without VAT »; a movement is
cancelled at the till while the shift is open (a manager's PIN when a rule asks for one); the closing and
its print list the movements; an offline resend is booked once; the receipt's photo is attached with
upstream's checks.

The test builds its own accounts, mode of payment, till, templates and shift, and rolls everything back.
neoffice_theme's template structure (totalization / counterparty rows, credit_or_debit) and its VAT logic
exist only where the theme is installed: there the real templates are read; on a site without it (a
fresh CI site) the template reader is given the same definitions, and the tests that need the desk's VAT
logic are skipped. Where the theme is installed they never skip: its VAT logic failing to load fails them.

Two tests reach the database through a second connection, as a concurrent request would: what it commits
is committed for real (the suite's commit is a no-op on the test's own connection only), and they remove it.
"""

import json
import os
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, time, timedelta
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, get_system_timezone, getdate, now_datetime
from werkzeug.datastructures import FileStorage

from pos_next import cash_movement
from pos_next.api import authorization, cash_entry, shifts
from pos_next.authorization import grants
from pos_next.authorization import pin as pin_store
from pos_next.authorization.actions.cash_movement import ACTION_VOID_CASH_MOVEMENT, void_context
from pos_next.pos_next.doctype.pos_closing_shift import pos_closing_shift
from pos_next.pos_next.report.neopos_register import neopos_register
from pos_next.pos_next.report.payments_and_cash_control_report import payments_and_cash_control_report
from pos_next.tests.test_till_writes_need_the_till import _company, _user

PREFIX = "_PNXT cashmove"
CASHIER = "cashmove-cashier@yopmail.com"
OTHER_CASHIER = "cashmove-other-cashier@yopmail.com"
MANAGER = "cashmove-manager@yopmail.com"
DESK = "cashmove-desk@yopmail.com"
PORTAL = "cashmove-portal@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
MANAGER_ROLE = "Nexus POS Manager"
PROFILE = f"{PREFIX} till"
MODE = f"{PREFIX} Cash"
PIN = "8317"

# The fixture's link fields, made here when a site never imported the fixture.
JE_FIELDS = (
	"posa_cash_movement_section",
	"posa_cash_movement",
	"posa_cash_movement_shift",
	"posa_cash_movement_closing",
	"posa_cash_entry_template",
	"posa_cash_movement_column_break",
	"posa_cash_movement_account",
	"posa_cash_movement_no_vat",
	"posa_cash_movement_note",
	"posa_cash_movement_offline_id",
)
PROFILE_FIELDS = ("posa_cash_mode_of_payment", "posa_cash_entry_templates", "posa_cash_movement_out_limit")


def _fixture_fields():
	"""The Custom Fields the feature reads, from the app's fixture, for a site that lacks them. The schema
	change commits, so it runs before any write of the test."""
	with open(frappe.get_app_path("pos_next", "fixtures", "custom_field.json"), encoding="utf-8") as fixture:
		rows = json.load(fixture)
	wanted = {("Journal Entry", name) for name in JE_FIELDS} | {
		("POS Profile", name) for name in PROFILE_FIELDS
	}
	skipped = {"doctype", "name", "dt", "modified", "owner", "creation", "modified_by", "docstatus", "idx"}
	for row in rows:
		if (row.get("dt"), row.get("fieldname")) not in wanted:
			continue
		if frappe.db.exists("Custom Field", {"dt": row["dt"], "fieldname": row["fieldname"]}):
			continue
		create_custom_field(
			row["dt"],
			{key: value for key, value in row.items() if key not in skipped and value is not None},
			is_system_generated=False,
		)


def _rehearsing_without_theme():
	"""The fleet's CI site has no neoffice_theme (it installs frappe, erpnext, payments and pos_next only). Run
	the module with POS_NEXT_TEST_WITHOUT_THEME=1 on a site that has the theme to rehearse that case: the
	theme's template structure is not used, and its VAT logic is hidden behind the guard's own test (no
	`App Customization` doctype)."""
	return bool(os.environ.get("POS_NEXT_TEST_WITHOUT_THEME"))


def _theme_templates():
	"""Whether the site has neoffice_theme's Journal Entry Template structure."""
	if _rehearsing_without_theme():
		return False
	return bool(
		frappe.db.exists("DocType", "Accounting Entry Totalization")
		and frappe.db.exists("DocType", "Accounting Entry Counterparty")
		and frappe.db.has_column("Journal Entry Template", "credit_or_debit")
	)


def _epoch_ms(moment):
	"""A naive datetime of the site's time zone as the till sends it: milliseconds since the epoch."""
	return int(moment.replace(tzinfo=ZoneInfo(get_system_timezone())).timestamp() * 1000)


@contextmanager
def _as(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


@contextmanager
def _without_the_theme():
	"""The site as the guard sees it without neoffice_theme: no `App Customization` doctype."""
	real_exists = frappe.db.exists

	def exists(*args, **kwargs):
		if args[:2] == ("DocType", "App Customization"):
			return None
		return real_exists(*args, **kwargs)

	with patch.object(frappe.local.db, "exists", side_effect=exists):
		yield


class CashMovementFixture(FrappeTestCase):
	"""What every test of the module starts from: nothing it writes outlives it, and on a site without the
	theme's template structure the template reader is given the definitions the test declares."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_fixture_fields()

	def _isolate(self):
		frappe.set_user("Administrator")
		# Nothing may outlive the test: the code under test commits nothing, and the real rollback, bound
		# before the patches start, runs last.
		self.addCleanup(frappe.db.rollback)
		real_rollback = frappe.db.rollback
		for patcher in (
			patch.object(frappe.local.db, "commit"),
			patch.object(
				frappe.local.db,
				"rollback",
				side_effect=lambda *a, **kw: real_rollback(*a, **kw) if (a or kw.get("save_point")) else None,
			),
		):
			patcher.start()
			self.addCleanup(patcher.stop)
		self.definitions = {}
		if not _theme_templates():
			real_definition = cash_movement.template_definition
			patcher = patch.object(
				cash_movement,
				"template_definition",
				side_effect=lambda name: self.definitions.get(name) or real_definition(name),
			)
			patcher.start()
			self.addCleanup(patcher.stop)
		if _rehearsing_without_theme():
			hidden = _without_the_theme()
			hidden.__enter__()
			self.addCleanup(hidden.__exit__, None, None, None)
		self.files = []
		self.addCleanup(self._delete_files)
		self.cached_accounts = []
		self.addCleanup(self._forget_accounts)

	# --- fixture --------------------------------------------------------------------------------------

	def _forget_accounts(self):
		for name in self.cached_accounts:
			frappe.clear_document_cache("Account", name)

	def _delete_files(self):
		frappe.set_user("Administrator")
		for name in self.files:
			if frappe.db.exists("File", name):
				frappe.delete_doc("File", name, ignore_permissions=True, force=True)

	def _group(self, root_type):
		return frappe.db.get_value(
			"Account",
			{"company": self.company, "is_group": 1, "root_type": root_type},
			"name",
			order_by="lft asc",
		)

	def _account(self, label, root_type, account_type="", **extra):
		name = f"{PREFIX} {label} - {self.abbr}"
		if not frappe.db.exists("Account", name):
			frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": f"{PREFIX} {label}",
					"parent_account": self._group(root_type),
					"company": self.company,
					"account_type": account_type,
					"account_currency": self.currency,
					"is_group": 0,
					**extra,
				}
			).insert(ignore_permissions=True)
		self.cached_accounts.append(name)
		return name

	def _template(
		self,
		label,
		totalization,
		counterparty,
		credit_or_debit,
		disable_calculation=0,
		voucher_type=None,
		more_counterparties=(),
	):
		title = f"{PREFIX} {label}"
		counterparties = [counterparty, *more_counterparties]
		doc = {
			"doctype": "Journal Entry Template",
			"template_title": title,
			"company": self.company,
			"voucher_type": voucher_type or "Journal Entry",
			"naming_series": "ACC-JV-.YYYY.-",
			"accounts": [{"account": totalization}, *({"account": account} for account in counterparties)],
		}
		if _theme_templates():
			doc.update(
				{
					"credit_or_debit": credit_or_debit,
					"disable_calculation": disable_calculation,
					"accounting_entry_totalization": [{"account": totalization}],
					"accounting_entry_counterparty": [{"account": account} for account in counterparties],
				}
			)
		if frappe.db.exists("Journal Entry Template", title):
			frappe.delete_doc("Journal Entry Template", title, ignore_permissions=True, force=True)
		frappe.get_doc(doc).insert(ignore_permissions=True)
		self.definitions[title] = frappe._dict(
			name=title,
			title=title,
			company=self.company,
			voucher_type=voucher_type or "Journal Entry",
			totalization=totalization,
			counterparty=counterparty,
			counterparty_count=len(dict.fromkeys(counterparties)),
			credit_or_debit=credit_or_debit,
			disable_calculation=disable_calculation,
		)
		return title

	def _plain_template(self, label, *accounts):
		"""A plain ERPNext template: two accounts, no direction."""
		title = f"{PREFIX} {label}"
		if frappe.db.exists("Journal Entry Template", title):
			frappe.delete_doc("Journal Entry Template", title, ignore_permissions=True, force=True)
		frappe.get_doc(
			{
				"doctype": "Journal Entry Template",
				"template_title": title,
				"company": self.company,
				"voucher_type": "Journal Entry",
				"naming_series": "ACC-JV-.YYYY.-",
				"accounts": [{"account": account} for account in accounts],
			}
		).insert(ignore_permissions=True)
		return title

	def _use_company(self, company):
		"""The company the account and template helpers build for."""
		self.company = company
		self.abbr = frappe.get_cached_value("Company", company, "abbr")
		self.currency = frappe.get_cached_value("Company", company, "default_currency")


class TestTillCashMovements(CashMovementFixture):
	def setUp(self):
		self._isolate()
		_user(CASHIER, [CASHIER_ROLE], "System User")
		_user(OTHER_CASHIER, [CASHIER_ROLE], "System User")
		_user(MANAGER, [MANAGER_ROLE], "System User")
		_user(DESK, ["Blogger"], "System User")
		_user(PORTAL, ["Customer", CASHIER_ROLE, MANAGER_ROLE], "Website User")
		self._build()

	def _build(self):
		self.company = _company()
		self.abbr = frappe.get_cached_value("Company", self.company, "abbr")
		self.currency = frappe.get_cached_value("Company", self.company, "default_currency")
		self.cost_center = frappe.get_cached_value(
			"Company", self.company, "cost_center"
		) or frappe.db.get_value("Cost Center", {"company": self.company, "is_group": 0}, "name")
		self.cash = self._account("Till Cash", "Asset", "Cash")
		self.safe = self._account("Safe", "Asset", "Cash")
		self.bank = self._account("Bank", "Asset", "Bank")
		self.transit = self._account("Transit", "Asset")
		self.debtors = self._account("Debtors", "Asset", "Receivable")
		self.supplies = self._account("Supplies", "Expense")
		self.bank_fees = self._account("Bank Fees", "Expense")
		self.income = self._account("Other Income", "Income")
		self.input_vat = self._account("Input VAT", "Asset", "Tax")
		self.goods = self._account("Goods", "Expense")
		if frappe.db.has_column("Account", "taxable_account"):
			tax_template = f"{PREFIX} VAT 8.1 - {self.abbr}"
			if not frappe.db.exists("Item Tax Template", tax_template):
				frappe.get_doc(
					{
						"doctype": "Item Tax Template",
						"title": f"{PREFIX} VAT 8.1",
						"company": self.company,
						"taxes": [{"tax_type": self.input_vat, "tax_rate": 8.1}],
					}
				).insert(ignore_permissions=True)
			frappe.db.set_value("Account", self.goods, "taxable_account", tax_template)
			frappe.clear_document_cache("Account", self.goods)

		if frappe.db.exists("Mode of Payment", MODE):
			frappe.delete_doc("Mode of Payment", MODE, ignore_permissions=True, force=True)
		frappe.get_doc(
			{
				"doctype": "Mode of Payment",
				"mode_of_payment": MODE,
				"type": "Cash",
				"enabled": 1,
				"accounts": [{"company": self.company, "default_account": self.cash}],
			}
		).insert(ignore_permissions=True)

		self.supplier = self._template("Supplier payment", self.cash, self.supplies, "Credit")
		self.pay_in = self._template("Pay-in", self.bank, self.cash, "Credit")
		self.other_income = self._template("Other income", self.cash, self.income, "Debit")
		self.fees = self._template("Bank fees", self.bank, self.bank_fees, "Credit")
		self.safe_drop = self._template("Safe drop", self.safe, self.transit, "Credit")
		self.goods_purchase = self._template("Goods purchase", self.cash, self.goods, "Credit")
		self.withdrawal = self._template("Withdrawal", self.cash, self.transit, "Credit")
		self.on_account = self._template("On account", self.cash, self.debtors, "Credit")

		if frappe.db.exists("POS Profile", PROFILE):
			frappe.delete_doc("POS Profile", PROFILE, ignore_permissions=True, force=True)
		frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": PROFILE,
				"company": self.company,
				"currency": self.currency,
				"warehouse": frappe.db.get_value(
					"Warehouse", {"company": self.company, "is_group": 0, "disabled": 0}, "name"
				),
				"selling_price_list": frappe.db.get_value(
					"Price List", {"selling": 1, "enabled": 1, "currency": self.currency}, "name"
				),
				"cost_center": self.cost_center,
				"write_off_account": self.supplies,
				"write_off_cost_center": self.cost_center,
				"write_off_limit": 1,
				"posa_cash_mode_of_payment": MODE,
				"payments": [{"mode_of_payment": MODE, "default": 1}],
				"applicable_for_users": [{"user": CASHIER}, {"user": OTHER_CASHIER}, {"user": PORTAL}],
				"posa_cash_entry_templates": [
					{"journal_entry_template": name}
					for name in (
						self.supplier,
						self.pay_in,
						self.other_income,
						self.fees,
						self.safe_drop,
						self.goods_purchase,
						self.on_account,
					)
				],
			}
		).insert(ignore_permissions=True)
		with _as(CASHIER):
			opened = shifts.create_opening_shift(
				PROFILE, self.company, json.dumps([{"mode_of_payment": MODE, "opening_amount": 50}])
			)
		self.shift = opened["pos_opening_shift"]["name"]

	# --- helpers --------------------------------------------------------------------------------------

	def _record(self, template, amount, user=CASHIER, **kwargs):
		with _as(user):
			return cash_entry.create_cash_entry(self.shift, template, amount, **kwargs)

	def _rows(self, journal_entry):
		"""{account: (debit, credit)} of a Journal Entry."""
		rows = {}
		for row in frappe.get_all(
			"Journal Entry Account",
			filters={"parent": journal_entry, "parenttype": "Journal Entry"},
			fields=["account", "debit_in_account_currency", "credit_in_account_currency"],
		):
			debit, credit = rows.get(row.account, (0, 0))
			rows[row.account] = (
				flt(debit + row.debit_in_account_currency, 2),
				flt(credit + row.credit_in_account_currency, 2),
			)
		return rows

	def _refused(self, user, call, exc=frappe.PermissionError):
		with _as(user), self.assertRaises(exc):
			call()

	def _set_list(self, *templates):
		profile = frappe.get_doc("POS Profile", PROFILE)
		profile.set("posa_cash_entry_templates", [{"journal_entry_template": name} for name in templates])
		profile.save(ignore_permissions=True)

	def _close(self, withdrawal=0):
		"""Close the shift as the till does: the closing data, then the submit of that payload."""
		with _as(CASHIER):
			data = shifts.get_closing_shift_data(self.shift)
			for row in data["payment_reconciliation"]:
				row["closing_amount"] = row["expected_amount"]
			data["cash_withdrawal_amount"] = withdrawal
			payload = {
				key: value
				for key, value in data.items()
				if key in frappe.get_meta("POS Closing Shift").get_valid_columns()
				or key
				in ("payment_reconciliation", "taxes", "pos_transactions", "pos_payments", "cash_movements")
			}
			payload["doctype"] = "POS Closing Shift"
			payload.pop("name", None)
			payload["pos_transactions"] = []
			name = pos_closing_shift.submit_closing_shift(json.dumps(payload, default=str))
		return data, name

	# --- booked as declared (defect D1) -----------------------------------------------------------------

	def test_a_supplier_payment_takes_cash_out_as_its_template_declares(self):
		result = self._record(self.supplier, 30)
		self.assertEqual(result["direction"], "out")
		self.assertEqual(self._rows(result["name"]), {self.supplies: (30, 0), self.cash: (0, 30)})
		entry = frappe.db.get_value(
			"Journal Entry",
			result["name"],
			[
				"docstatus",
				"posa_cash_movement",
				"posa_cash_movement_shift",
				"posa_cash_entry_template",
				"posa_cash_movement_account",
			],
			as_dict=True,
		)
		self.assertEqual(
			entry,
			{
				"docstatus": 1,
				"posa_cash_movement": "Out",
				"posa_cash_movement_shift": self.shift,
				"posa_cash_entry_template": self.supplier,
				"posa_cash_movement_account": self.cash,
			},
		)

	def test_a_pay_in_puts_cash_in_as_its_template_declares(self):
		# Bank → cash, Credit: the counterparty (the till's cash) is debited. The old writer guessed « in »
		# from the bank on the totalization side, then credited the cash: the ledger went 2X wrong.
		result = self._record(self.pay_in, 200)
		self.assertEqual(result["direction"], "in")
		self.assertEqual(self._rows(result["name"]), {self.cash: (200, 0), self.bank: (0, 200)})
		self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "posa_cash_movement"), "In")

	def test_an_income_template_takes_cash_in_as_its_template_declares(self):
		# Cash → income, Debit: the totalization (the till's cash) is debited and the income credited.
		result = self._record(self.other_income, 12.5)
		self.assertEqual(result["direction"], "in")
		self.assertEqual(self._rows(result["name"]), {self.cash: (12.5, 0), self.income: (0, 12.5)})

	def test_a_template_that_does_not_move_the_tills_cash_is_refused(self):
		# Bank fees (bank → expense) and a drop from another cash account than the till's: no drawer.
		for template in (self.fees, self.safe_drop):
			with _as(CASHIER), self.assertRaises(frappe.ValidationError):
				cash_entry.create_cash_entry(self.shift, template, 10)
		self.assertFalse(frappe.db.exists("Journal Entry", {"posa_cash_movement_shift": self.shift}))
		with _as(CASHIER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		unusable = {row["name"]: row["reason"] for row in data["unusable"]}
		self.assertIn(self.fees, unusable)
		self.assertIn(self.safe_drop, unusable)
		self.assertIn(self.cash, unusable[self.fees])

	def test_a_template_on_a_party_account_is_refused(self):
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, self.on_account, 10)

	def test_a_plain_template_declares_no_direction_and_is_refused(self):
		plain = self._plain_template("Plain", self.cash, self.supplies)
		self._set_list(plain)
		with _as(CASHIER):
			self.assertEqual(cash_entry.get_cash_entry_templates(self.company, PROFILE), [])
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		self.assertEqual([row["name"] for row in data["unusable"]], [plain])
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, plain, 10)

	def test_a_template_with_one_counterparty_per_vat_rate_is_not_used_at_the_till(self):
		# The desk's two-rate template (one counterparty at 8.1 %, one at 2.6 %): the till types one amount and
		# would book it all on the first account.
		two_rates = self._template(
			"Two rates", self.cash, self.supplies, "Credit", more_counterparties=(self.goods,)
		)
		self._set_list(two_rates, self.supplier)
		with _as(CASHIER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		self.assertEqual([row["name"] for row in data["templates"]], [self.supplier])
		self.assertIn(two_rates, {row["name"]: row["reason"] for row in data["unusable"]})
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, two_rates, 10)

	def test_the_tills_cost_centre_goes_on_the_profit_and_loss_rows_only(self):
		# As the desk books a template: the till's cost centre on the expense; the cash and bank rows get the
		# row's default, the company's cost centre.
		till_centre = f"{PREFIX} till - {self.abbr}"
		if not frappe.db.exists("Cost Center", till_centre):
			frappe.get_doc(
				{
					"doctype": "Cost Center",
					"cost_center_name": f"{PREFIX} till",
					"company": self.company,
					"is_group": 0,
					"parent_cost_center": frappe.db.get_value(
						"Cost Center", {"company": self.company, "is_group": 1}, "name", order_by="lft asc"
					),
				}
			).insert(ignore_permissions=True)
		frappe.db.set_value("POS Profile", PROFILE, "cost_center", till_centre)
		company_centre = frappe.get_cached_value("Company", self.company, "cost_center")
		self.assertNotEqual(company_centre, till_centre)

		def centres(name):
			return {
				row.account: row.cost_center or None
				for row in frappe.get_all(
					"Journal Entry Account", filters={"parent": name}, fields=["account", "cost_center"]
				)
			}

		self.assertEqual(
			centres(self._record(self.supplier, 30)["name"]),
			{self.supplies: till_centre, self.cash: company_centre},
		)
		self.assertEqual(
			centres(self._record(self.pay_in, 200)["name"]),
			{self.cash: company_centre, self.bank: company_centre},
		)

	def test_the_screen_gets_the_direction_from_the_server(self):
		with _as(CASHIER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
			listed = cash_entry.get_cash_entry_templates(self.company, PROFILE)
		directions = {row["name"]: row["direction"] for row in data["templates"]}
		self.assertEqual(directions[self.supplier], "out")
		self.assertEqual(directions[self.pay_in], "in")
		self.assertEqual(directions[self.other_income], "in")
		self.assertEqual({row["name"]: row["direction"] for row in listed}, directions)
		self.assertEqual({row["name"]: row["account"] for row in listed}[self.pay_in], self.bank)
		self.assertIsNone(data["remaining"])
		self.assertTrue(data["shift_open"])

	# --- the till's list is a control (defect D2) ------------------------------------------------------

	def test_an_operation_off_the_tills_list_is_refused(self):
		self._set_list(self.supplier)
		with _as(CASHIER):
			self.assertEqual(
				[row["name"] for row in cash_entry.get_cash_entry_templates(self.company, PROFILE)],
				[self.supplier],
			)
		self._refused(CASHIER, lambda: cash_entry.create_cash_entry(self.shift, self.pay_in, 10))

	def test_an_empty_list_means_no_movement(self):
		self._set_list()
		with _as(CASHIER):
			self.assertEqual(cash_entry.get_cash_entry_templates(self.company, PROFILE), [])
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		self.assertEqual(data["templates"], [])
		self.assertEqual(data["unusable"], [])
		self._refused(CASHIER, lambda: cash_entry.create_cash_entry(self.shift, self.supplier, 10))

	# --- who records (defect D3) -------------------------------------------------------------------------

	def test_the_shifts_cashier_or_a_till_manager_records(self):
		record = lambda: cash_entry.create_cash_entry(self.shift, self.supplier, 5)  # noqa: E731
		for user in (OTHER_CASHIER, DESK, PORTAL, "Guest"):
			self._refused(user, record)
		self.assertEqual(self._record(self.supplier, 5, user=MANAGER)["direction"], "out")
		self.assertEqual(self._record(self.supplier, 5, user=CASHIER)["direction"], "out")
		for user in (OTHER_CASHIER, DESK, PORTAL, "Guest"):
			self._refused(user, lambda: cash_entry.get_cash_movement_dialog_data(self.shift))
			self._refused(user, lambda: cash_entry.get_cash_entries(self.shift))

	def test_a_closed_shift_takes_no_movement(self):
		self._close()
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, self.supplier, 5)

	# --- VAT: the desk's logic, and « without VAT » -----------------------------------------------------

	def _vat_company(self):
		"""The desk's VAT logic on the test company. Skipped only where neoffice_theme is absent (a fresh CI
		site); where it is installed, its logic must load: a failure fails the test (VatEngineUnavailable)."""
		if _rehearsing_without_theme() or not cash_movement._theme_installed():
			self.skipTest("neoffice_theme's journal-entry VAT logic is not installed here")
		self.assertTrue(cash_movement._desk_vat_logic())
		self.assertTrue(
			frappe.db.has_column("Account", "taxable_account"),
			"neoffice_theme is installed but Account has no taxable_account field",
		)
		if not frappe.db.exists("Neoffice Company Settings", self.company):
			# The record neoffice_wizard keeps per company, here without its controller (rolled back).
			settings = frappe.new_doc("Neoffice Company Settings")
			settings.update({"name": self.company, "company": self.company, "company_name": self.company})
			settings.db_insert()
		frappe.db.set_value(
			"Neoffice Company Settings", self.company, {"is_vat_company": 1, "vat_accounting_method": ""}
		)

	def test_the_vat_of_a_purchase_is_split_by_the_desks_logic(self):
		self._vat_company()
		result = self._record(self.goods_purchase, 108.10)
		self.assertEqual(
			self._rows(result["name"]),
			{self.goods: (100.0, 0), self.input_vat: (8.1, 0), self.cash: (0, 108.10)},
		)
		with _as(CASHIER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		vat = {row["name"]: row["vat_applies"] for row in data["templates"]}
		self.assertTrue(vat[self.goods_purchase])
		self.assertFalse(vat[self.pay_in])
		self.assertTrue(
			{row["name"]: row["no_vat_allowed"] for row in data["templates"]}[self.goods_purchase]
		)
		# The drawer moved by the whole amount, VAT included.
		self.assertEqual(cash_movement.movement(result["name"]).amount, 108.10)

	def test_without_vat_the_whole_amount_is_booked(self):
		self._vat_company()
		result = self._record(self.goods_purchase, 108.10, no_vat=1)
		self.assertEqual(self._rows(result["name"]), {self.goods: (108.10, 0), self.cash: (0, 108.10)})
		self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "posa_cash_movement_no_vat"), 1)

	def test_without_vat_is_never_offered_on_an_income_whose_vat_is_owed(self):
		# Cash → income at 8.1 % (a Debit template): the VAT is owed to the State, the cashier cannot waive it.
		self._vat_company()
		taxed_income = self._account("Taxed Income", "Income")
		frappe.db.set_value(
			"Account",
			taxed_income,
			"taxable_account",
			frappe.get_cached_value("Account", self.goods, "taxable_account"),
		)
		frappe.clear_document_cache("Account", taxed_income)
		sale = self._template("Taxed income", self.cash, taxed_income, "Debit")
		self._set_list(sale)
		with _as(CASHIER):
			[row] = cash_entry.get_cash_movement_dialog_data(self.shift)["templates"]
		self.assertEqual((row["vat_applies"], row["no_vat_allowed"]), (True, False))
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, sale, 108.10, no_vat=1)
		result = self._record(sale, 108.10)
		self.assertEqual(
			self._rows(result["name"]),
			{self.cash: (108.10, 0), taxed_income: (0, 100.0), self.input_vat: (0, 8.1)},
		)

	def test_without_vat_is_refused_where_the_operation_has_no_vat_or_is_an_income(self):
		# A pay-in moves no VAT; an income's VAT is owed; a supply account names no VAT rate. On every site.
		for template in (self.pay_in, self.other_income, self.supplier):
			with _as(CASHIER), self.assertRaises(frappe.ValidationError):
				cash_entry.create_cash_entry(self.shift, template, 10, no_vat=1)
		self.assertFalse(frappe.db.exists("Journal Entry", {"posa_cash_movement_shift": self.shift}))
		with _as(CASHIER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		allowed = {row["name"]: row["no_vat_allowed"] for row in data["templates"]}
		self.assertEqual(
			[allowed[name] for name in (self.pay_in, self.other_income, self.supplier)], [False, False, False]
		)

	def test_when_the_desks_vat_logic_cannot_load_a_taxed_movement_is_refused_and_logged(self):
		# The theme is installed but its VAT module does not import (renamed, broken): booking gross would drop
		# the VAT without a word. The movement on an account that names a VAT rate is refused, the dialog says
		# why, an Error Log is written (deferred: the refusal rolls the request back), and a movement on an
		# account without VAT still books.
		self._vat_company()
		frappe.flags.pop(cash_movement.VAT_ENGINE_LOGGED_FLAG, None)
		self.addCleanup(frappe.flags.pop, cash_movement.VAT_ENGINE_LOGGED_FLAG, None)
		self.assertLessEqual(len(cash_movement.VAT_ENGINE_ERROR_TITLE), 140)
		with (
			patch.dict(sys.modules, {"neoffice_theme.vat_utils": None}),
			patch.object(frappe, "log_error", wraps=frappe.log_error) as logged,
		):
			for no_vat in (0, 1):
				with _as(CASHIER), self.assertRaises(cash_movement.VatEngineUnavailable):
					cash_entry.create_cash_entry(self.shift, self.goods_purchase, 108.10, no_vat=no_vat)
			with _as(CASHIER):
				data = cash_entry.get_cash_movement_dialog_data(self.shift)
			untaxed = self._record(self.supplier, 30)
		self.assertNotIn(self.goods_purchase, [row["name"] for row in data["templates"]])
		self.assertIn(self.goods_purchase, {row["name"]: row["reason"] for row in data["unusable"]})
		self.assertFalse(
			frappe.db.exists(
				"Journal Entry",
				{"posa_cash_movement_shift": self.shift, "posa_cash_entry_template": self.goods_purchase},
			)
		)
		self.assertEqual(self._rows(untaxed["name"]), {self.supplies: (30, 0), self.cash: (0, 30)})
		# Logged once for the request, title first, deferred so the refusal's rollback does not take it away.
		from frappe.deferred_insert import save_to_db

		[call] = [c for c in logged.call_args_list if c.args[:1] == (cash_movement.VAT_ENGINE_ERROR_TITLE,)]
		self.assertIn("neoffice_theme.vat_utils", call.args[1])
		self.assertTrue(call.kwargs.get("defer_insert"))
		save_to_db()
		self.assertTrue(frappe.db.exists("Error Log", {"method": cash_movement.VAT_ENGINE_ERROR_TITLE}))

	def test_a_template_that_turns_the_calculation_off_books_the_whole_amount(self):
		self._vat_company()
		untaxed = self._template("Goods untaxed", self.cash, self.goods, "Credit", disable_calculation=1)
		self._set_list(untaxed)
		result = self._record(untaxed, 54.05)
		self.assertEqual(self._rows(result["name"]), {self.goods: (54.05, 0), self.cash: (0, 54.05)})

	def test_without_the_desks_vat_logic_the_whole_amount_is_booked(self):
		with patch.object(cash_movement, "_desk_vat_logic", return_value=None):
			result = self._record(self.goods_purchase, 108.10)
		self.assertEqual(self._rows(result["name"]), {self.goods: (108.10, 0), self.cash: (0, 108.10)})

	# --- a site without neoffice_theme (the fleet's CI) -------------------------------------------------

	def test_without_neoffice_theme_a_movement_books_the_whole_amount(self):
		# The CI site has no `App Customization` doctype: the guard hands back no VAT logic, nothing of the
		# theme is imported, and the movement books gross, whatever rate its account carries.
		with _without_the_theme():
			self.assertIsNone(cash_movement._desk_vat_logic())
			with _as(CASHIER):
				data = cash_entry.get_cash_movement_dialog_data(self.shift)
			result = self._record(self.goods_purchase, 108.10)
		self.assertFalse({row["name"]: row["vat_applies"] for row in data["templates"]}[self.goods_purchase])
		self.assertEqual(self._rows(result["name"]), {self.goods: (108.10, 0), self.cash: (0, 108.10)})

	def test_the_tests_that_need_the_theme_skip_with_a_reason_without_it(self):
		with _without_the_theme(), self.assertRaises(unittest.SkipTest) as skipped:
			self._vat_company()
		self.assertIn("neoffice_theme", str(skipped.exception))

	# --- the day it is booked on -----------------------------------------------------------------------

	def test_a_movement_in_the_small_hours_stays_on_the_shifts_day(self):
		evening = datetime(2026, 10, 29, 18, 0)
		self.assertEqual(
			cash_movement.business_day(evening, datetime(2026, 10, 30, 1, 30)), getdate("2026-10-29")
		)
		self.assertEqual(
			cash_movement.business_day(evening, datetime(2026, 10, 30, 10, 0)), getdate("2026-10-30")
		)
		# A shift left open for days books on the day the money moved, never back on its opening day.
		self.assertEqual(
			cash_movement.business_day(datetime(2026, 7, 1, 8, 0), datetime(2026, 10, 30, 10, 0)),
			getdate("2026-10-30"),
		)

	def test_an_offline_movement_is_booked_on_the_day_the_money_moved_not_the_day_it_synced(self):
		# Recorded offline at 23:00 two days ago, on a shift opened that morning, sent by the queue today: the
		# day the money moved is the VAT period it belongs to.
		opened = datetime.combine(add_days(getdate(), -2), time(8, 0))
		frappe.db.set_value("POS Opening Shift", self.shift, "period_start_date", opened)
		late = opened.replace(hour=23)
		result = self._record(self.supplier, 30, offline_id="pos_cash_test-day", moved_at=_epoch_ms(late))
		posting_date = lambda name: getdate(frappe.db.get_value("Journal Entry", name, "posting_date"))  # noqa: E731
		self.assertEqual(posting_date(result["name"]), getdate(late))
		# A device clock behind the shift's start books on its start; one ahead of the server, or a value
		# that is not a time, books now.
		early = self._record(self.supplier, 5, moved_at=_epoch_ms(opened - timedelta(days=30)))
		self.assertEqual(posting_date(early["name"]), getdate(opened))
		today = cash_movement.business_day(opened, now_datetime())
		for moment in (_epoch_ms(now_datetime() + timedelta(days=30)), "soon", None):
			self.assertEqual(posting_date(self._record(self.supplier, 1, moved_at=moment)["name"]), today)

	# --- cancel at the till ------------------------------------------------------------------------------

	def test_its_author_cancels_a_movement_while_the_shift_is_open(self):
		result = self._record(self.supplier, 30)
		with _as(CASHIER):
			self.assertEqual(cash_entry.get_cash_entries(self.shift)[0]["can_cancel"], True)
			cash_entry.cancel_cash_entry(result["name"])
			self.assertEqual(cash_entry.get_cash_entries(self.shift), [])
		self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "docstatus"), 2)

	def test_a_manager_cancels_a_cashiers_movement_and_not_the_reverse(self):
		by_cashier = self._record(self.supplier, 30)
		by_manager = self._record(self.supplier, 20, user=MANAGER)
		self._refused(CASHIER, lambda: cash_entry.cancel_cash_entry(by_manager["name"]))
		for user in (OTHER_CASHIER, DESK, PORTAL, "Guest"):
			self._refused(user, lambda: cash_entry.cancel_cash_entry(by_cashier["name"]))
		with _as(MANAGER):
			cash_entry.cancel_cash_entry(by_cashier["name"])
		self.assertEqual(frappe.db.get_value("Journal Entry", by_cashier["name"], "docstatus"), 2)

	def test_a_movement_of_a_closed_shift_is_not_cancelled_at_the_till(self):
		result = self._record(self.supplier, 30)
		self._close()
		with _as(MANAGER), self.assertRaises(frappe.ValidationError):
			cash_entry.cancel_cash_entry(result["name"])
		self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "docstatus"), 1)

	def test_the_void_asks_a_managers_pin_when_a_rule_says_so(self):
		result = self._record(self.supplier, 30)
		frappe.get_doc(
			{
				"doctype": "POS Authorization Rule",
				"action": ACTION_VOID_CASH_MOVEMENT,
				"enabled": 1,
				"approvers": [{"approver_type": "Role", "role": MANAGER_ROLE}],
			}
		).insert(ignore_permissions=True)
		pin_store.set_pin(MANAGER, PIN)
		with patch("pos_next.authorization.log.record"):
			with _as(CASHIER), self.assertRaises(frappe.ValidationError):
				cash_entry.cancel_cash_entry(result["name"])
			self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "docstatus"), 1)
			with _as(CASHIER):
				self.assertTrue(
					authorization.get_authorization_policy(PROFILE).get(ACTION_VOID_CASH_MOVEMENT)
				)
				# The till and the amount the grant binds are read from the movement, whatever the client says.
				grant = authorization.request_grant(
					ACTION_VOID_CASH_MOVEMENT,
					MANAGER,
					PIN,
					json.dumps({"journal_entry": result["name"], "amount": 1}),
				)
				self.assertTrue(grant["authorized"], grant)
				cash_entry.cancel_cash_entry(result["name"], grant["grant_token"])
		self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "docstatus"), 2)
		self.assertEqual(void_context(result["name"], frappe._dict(pos_profile=PROFILE))["amount"], 30)

	# --- the per-shift cap on money out ----------------------------------------------------------------

	def test_the_cap_refuses_a_cash_out_beyond_it(self):
		frappe.db.set_value("POS Profile", PROFILE, "posa_cash_movement_out_limit", 100)
		self._record(self.supplier, 60)
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, self.supplier, 50)
		# Money in is not capped, nor counted against the cap.
		self._record(self.pay_in, 500)
		self._record(self.supplier, 40)
		with _as(CASHIER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
		self.assertEqual((data["out_limit"], data["out_total"], data["remaining"]), (100, 100, 0))

	# --- the shift's lock gives a fresh view of the ledger ------------------------------------------------

	def _committed_elsewhere(self, amount):
		"""A movement out of the shift that ANOTHER request books and commits while this one runs (after its
		first reads fixed its REPEATABLE READ snapshot, before it takes the shift's lock): written through a
		second connection, whose commit is real, as raw rows (the entry's tags and its row on the till's cash
		account: what the readers read). Removed once this test's transaction is rolled back, as its locking
		reads hold those rows until then."""
		from frappe.database import get_db

		conf = frappe.conf
		other = get_db(
			host=conf.db_host,
			port=conf.db_port,
			user=conf.db_name,
			password=conf.db_password,
			cur_db_name=conf.db_name,
			socket=conf.db_socket,
		)
		other.connect()
		name = f"{PREFIX} elsewhere {frappe.generate_hash(length=8)}"

		def remove():
			type(frappe.local.db).rollback(frappe.local.db)
			other.sql("delete from `tabJournal Entry Account` where parent = %s", name)
			other.sql("delete from `tabJournal Entry` where name = %s", name)
			other.sql("commit")
			other.close()

		self.addCleanup(remove)
		other.sql(
			"""insert into `tabJournal Entry` (name, docstatus, company, posting_date, voucher_type,
			posa_cash_movement, posa_cash_movement_shift, posa_cash_movement_account, posa_cash_entry_template,
			owner, modified_by, creation, modified)
			values (%s, 1, %s, curdate(), 'Journal Entry', 'Out', %s, %s, %s, 'Administrator', 'Administrator',
			now(6), now(6))""",
			(name, self.company, self.shift, self.cash, self.supplier),
		)
		other.sql(
			"""insert into `tabJournal Entry Account` (name, parent, parenttype, parentfield, idx, account,
			debit_in_account_currency, credit_in_account_currency, owner, modified_by, creation, modified)
			values (%s, %s, 'Journal Entry', 'accounts', 1, %s, 0, %s, 'Administrator', 'Administrator',
			now(6), now(6))""",
			(f"{name}-1", name, self.cash, amount),
		)
		other.sql("commit")
		return name

	def test_the_cap_counts_a_movement_committed_while_this_one_waited_for_the_lock(self):
		# Cap 100. The offline queue's 60 out is booked by another request after this one began and before it
		# took the shift's lock: the cashier's 50 out must be refused, or 110 would leave the drawer.
		frappe.db.set_value("POS Profile", PROFILE, "posa_cash_movement_out_limit", 100)
		with _as(CASHIER):
			cash_entry.get_cash_movement_dialog_data(self.shift)
		elsewhere = self._committed_elsewhere(60)
		with _as(CASHIER), self.assertRaises(frappe.ValidationError) as refused:
			cash_entry.create_cash_entry(self.shift, self.supplier, 50)
		self.assertIn("60", str(refused.exception))
		self.assertEqual(frappe.db.count("Journal Entry", {"posa_cash_movement_shift": self.shift}), 0)
		# Why a locking read: here a plain read still keeps the snapshot, a locking read sees the commit.
		self.assertEqual(cash_movement.shift_movements(self.shift), [])
		self.assertEqual(
			[row.journal_entry for row in cash_movement.shift_movements(self.shift, lock=True)], [elsewhere]
		)
		# What the cap still allows is taken.
		self.assertEqual(self._record(self.supplier, 40)["direction"], "out")

	def test_a_closing_is_refused_when_a_movement_was_committed_while_it_waited_for_the_lock(self):
		# The closing's data was read (its expected cash), then another request booked a movement and committed
		# it before the closing took the shift's lock. Closing now would leave that movement booked against the
		# shift and out of its figures (the old code stored an empty list): refused, opened again it counts it.
		with _as(CASHIER):
			shifts.get_closing_shift_data(self.shift)
		elsewhere = self._committed_elsewhere(25)
		with self.assertRaises(frappe.ValidationError) as refused:
			self._close()
		self.assertIn("while this shift was being closed", str(refused.exception))
		self.assertEqual(frappe.db.get_value("POS Opening Shift", self.shift, "status"), "Open")
		self.assertFalse(frappe.db.exists("POS Closing Shift", {"pos_opening_shift": self.shift}))
		# What the closing read under the lock: the ledger as committed now.
		self.assertEqual(
			[row["journal_entry"] for row in cash_movement.closing_rows(self.shift, lock=True)], [elsewhere]
		)

	# --- offline: the queued id is booked once ---------------------------------------------------------

	def test_a_queued_movement_is_booked_once(self):
		first = self._record(self.supplier, 30, offline_id="pos_cash_test-1")
		again = self._record(self.supplier, 30, offline_id="pos_cash_test-1")
		self.assertEqual(again["name"], first["name"])
		self.assertTrue(again["duplicate_prevented"])
		self.assertEqual(
			frappe.db.count("Journal Entry", {"posa_cash_movement_offline_id": "pos_cash_test-1"}), 1
		)
		self.assertEqual(len(cash_movement.shift_movements(self.shift)), 1)

	def test_a_refused_offline_movement_is_set_aside_with_a_trace_on_its_shift(self):
		# The tablet was offline; meanwhile the shift was closed elsewhere. The queue's movement is refused, and
		# the till sets it aside with a reason: the money that moved stays traceable on its shift.
		booked = self._record(self.supplier, 10, offline_id="pos_cash_test-booked")
		self._close()
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.create_cash_entry(self.shift, self.supplier, 30, offline_id="pos_cash_test-refused")
		refused = {
			"pos_opening_shift": self.shift,
			"offline_id": "pos_cash_test-refused",
			"template_title": self.supplier,
			"direction": "out",
			"amount": 30,
			"remark": "Wine merchant",
			"refusal": "Shift is not open",
			"recorded_by": CASHIER,
			"moved_at": _epoch_ms(now_datetime()),
		}
		with _as(CASHIER), self.assertRaises(frappe.ValidationError):
			cash_entry.set_aside_refused_cash_movement(reason="  ", **refused)
		for user in (OTHER_CASHIER, DESK, PORTAL, "Guest"):
			self._refused(user, lambda: cash_entry.set_aside_refused_cash_movement(reason="Lost", **refused))
		with _as(CASHIER):
			first = cash_entry.set_aside_refused_cash_movement(reason="Paid back to the supplier", **refused)
			again = cash_entry.set_aside_refused_cash_movement(reason="Paid back to the supplier", **refused)
			# The movement the server did book under its id is never set aside.
			self.assertEqual(
				cash_entry.set_aside_refused_cash_movement(
					reason="Duplicate", **{**refused, "offline_id": "pos_cash_test-booked"}
				),
				{"booked": booked["name"]},
			)
		self.assertEqual((again["comment"], again["already_recorded"]), (first["comment"], True))
		comment = frappe.db.get_value(
			"Comment", first["comment"], ["reference_doctype", "reference_name", "content"], as_dict=True
		)
		self.assertEqual(
			(comment.reference_doctype, comment.reference_name), ("POS Opening Shift", self.shift)
		)
		for part in (
			self.supplier,
			"30",
			"Wine merchant",
			"Shift is not open",
			"Paid back to the supplier",
			"pos_cash_test-refused",
			CASHIER,
		):
			self.assertIn(part, comment.content)
		# A till manager sets aside any cashier's movement; the dialog tells the till who reads it.
		with _as(MANAGER):
			data = cash_entry.get_cash_movement_dialog_data(self.shift)
			cash_entry.set_aside_refused_cash_movement(
				reason="Checked with the cashier", **{**refused, "offline_id": "pos_cash_test-other"}
			)
		self.assertEqual((data["user"], data["is_till_manager"]), (MANAGER, True))

	def test_a_cancelled_queued_movement_is_not_booked_again(self):
		first = self._record(self.supplier, 30, offline_id="pos_cash_test-2")
		with _as(CASHIER):
			cash_entry.cancel_cash_entry(first["name"])
		again = self._record(self.supplier, 30, offline_id="pos_cash_test-2")
		self.assertEqual((again["name"], again["cancelled"]), (first["name"], True))
		self.assertEqual(
			frappe.db.count("Journal Entry", {"posa_cash_movement_offline_id": "pos_cash_test-2"}), 1
		)

	# --- the closing and its print ----------------------------------------------------------------------

	def test_the_closing_counts_stores_and_prints_the_movements(self):
		self._record(self.supplier, 30, remark="Wine merchant")
		self._record(self.pay_in, 200)
		data, closing = self._close()
		expected = {
			row["mode_of_payment"]: flt(row["expected_amount"]) for row in data["payment_reconciliation"]
		}
		self.assertEqual(expected[MODE], 50 + 200 - 30)
		self.assertEqual((flt(data["cash_in_total"]), flt(data["cash_out_total"])), (200, 30))
		stored = frappe.get_all(
			"POS Closing Shift Cash Movement",
			filters={"parent": closing, "parenttype": "POS Closing Shift"},
			fields=["direction", "operation", "amount", "note"],
			order_by="idx asc",
		)
		self.assertEqual(
			[(row.direction, row.operation, flt(row.amount), row.note or "") for row in stored],
			[("Out", self.supplier, 30, "Wine merchant"), ("In", self.pay_in, 200, "")],
		)
		# The record holds what the last migrate imported: on a site shared by several branches, another
		# branch's version of the print. The test prints with the template this app ships (rolled back).
		with open(
			frappe.get_app_path(
				"pos_next", "pos_next", "print_format", "pos_next_eod_report", "pos_next_eod_report.json"
			),
			encoding="utf-8",
		) as shipped:
			frappe.db.set_value("Print Format", "POS Next EOD Report", "html", json.load(shipped)["html"])
		html = frappe.get_print("POS Closing Shift", closing, print_format="POS Next EOD Report")
		self.assertIn(self.supplier, html)
		self.assertIn("Wine merchant", html)
		self.assertIn("-30.00", html)
		self.assertIn("+200.00", html)

	def test_the_withdrawal_is_booked_as_its_template_declares(self):
		settings = frappe.db.get_value("POS Settings", {"pos_profile": PROFILE}) or (
			frappe.get_doc({"doctype": "POS Settings", "pos_profile": PROFILE})
			.insert(ignore_permissions=True)
			.name
		)
		frappe.db.set_value(
			"POS Settings", settings, {"enabled": 1, "closing_withdrawal_template": self.withdrawal}
		)
		_data, closing = self._close(withdrawal=40)
		entry = frappe.db.get_value(
			"Journal Entry",
			{"posa_cash_movement_closing": closing, "docstatus": 1},
			["name", "posa_cash_movement_shift"],
			as_dict=True,
		)
		self.assertEqual(self._rows(entry.name), {self.transit: (40, 0), self.cash: (0, 40)})
		self.assertFalse(entry.posa_cash_movement_shift)
		# Not a movement of the shift: the closing's expected cash never counts its own withdrawal.
		self.assertEqual(cash_movement.shift_movements(self.shift), [])
		closing_doc = frappe.get_doc("POS Closing Shift", closing)
		closing_doc.flags.ignore_permissions = True
		closing_doc.cancel()
		self.assertEqual(frappe.db.get_value("Journal Entry", entry.name, "docstatus"), 2)

	def test_a_withdrawal_template_that_puts_money_in_is_not_offered(self):
		settings = frappe.db.get_value("POS Settings", {"pos_profile": PROFILE}) or (
			frappe.get_doc({"doctype": "POS Settings", "pos_profile": PROFILE})
			.insert(ignore_permissions=True)
			.name
		)
		frappe.db.set_value(
			"POS Settings", settings, {"enabled": 1, "closing_withdrawal_template": self.pay_in}
		)
		with _as(CASHIER):
			data = shifts.get_closing_shift_data(self.shift)
		self.assertEqual(data["closing_withdrawal_template"], "")
		self.assertTrue(data["closing_withdrawal_problem"])
		with self.assertRaises(frappe.ValidationError):
			self._close(withdrawal=40)

	# --- the receipt's photo ----------------------------------------------------------------------------

	@contextmanager
	def _upload(self, filename, content):
		saved = getattr(frappe.local, "request", None)
		frappe.local.request = SimpleNamespace(
			files={
				"file": FileStorage(stream=BytesIO(content), filename=filename, content_type="image/jpeg")
			},
			headers={},
			host="localhost",
			scheme="http",
		)
		try:
			yield
		finally:
			frappe.local.request = saved

	def test_the_receipts_photo_is_attached_once_with_upstreams_checks(self):
		result = self._record(self.supplier, 30)
		with _as(CASHIER):
			with self._upload("receipt.jpg", b"\xff\xd8\xff photo"):
				first = cash_entry.attach_cash_entry_file(result["name"])
			self.files.append(first["name"])
			with self._upload("receipt.jpg", b"\xff\xd8\xff photo"):
				again = cash_entry.attach_cash_entry_file(result["name"])
			self.assertEqual((again["name"], again["already_attached"]), (first["name"], True))
			with self._upload("receipt.exe", b"MZ"), self.assertRaises(frappe.ValidationError):
				cash_entry.attach_cash_entry_file(result["name"])
			with patch("frappe.core.api.file.get_max_file_size", return_value=4):
				with self._upload("big.jpg", b"0123456789"), self.assertRaises(frappe.ValidationError):
					cash_entry.attach_cash_entry_file(result["name"])
		self.assertEqual(
			frappe.db.count(
				"File", {"attached_to_doctype": "Journal Entry", "attached_to_name": result["name"]}
			),
			1,
		)
		for user in (OTHER_CASHIER, DESK, PORTAL, "Guest"):
			with self._upload("receipt2.jpg", b"\xff\xd8\xff other"):
				self._refused(user, lambda: cash_entry.attach_cash_entry_file(result["name"]))

	# --- the reports read the link fields ---------------------------------------------------------------

	def test_the_cash_control_report_and_the_register_read_the_movements(self):
		self._record(self.supplier, 30)
		self._record(self.pay_in, 200)
		totals = payments_and_cash_control_report._get_cash_in_out([{"pos_opening_shift": self.shift}])
		self.assertEqual(totals[self.shift], {"in": 200, "out": 30})
		rows = neopos_register.get_cash_in_out(
			frappe._dict(
				from_date="2000-01-01", to_date="2100-01-01", company=self.company, pos_profile=PROFILE
			),
			None,
		)
		self.assertEqual(sorted(flt(row["paid_amount"]) for row in rows), [-30, 200])

	def test_the_register_waits_for_the_migrate_that_makes_its_fields(self):
		# Between a pull and the migrate, the Journal Entry has none of the movement's fields: the register
		# shows the rest of the till's activity instead of failing on an unknown column.
		self._record(self.supplier, 30)
		real_has_column = frappe.db.has_column

		def has_column(doctype, column):
			if doctype == "Journal Entry" and column.startswith("posa_cash"):
				return False
			return real_has_column(doctype, column)

		with patch.object(frappe.local.db, "has_column", side_effect=has_column):
			rows = neopos_register.get_cash_in_out(
				frappe._dict(
					from_date="2000-01-01", to_date="2100-01-01", company=self.company, pos_profile=PROFILE
				),
				None,
			)
		self.assertEqual(rows, [])

	# --- the entries written before are tagged from their remark ----------------------------------------

	def test_the_patch_tags_the_entries_written_before(self):
		from pos_next.patches.neorestau import tag_the_tills_cash_movements

		def legacy(remark, debit_account, credit_account, amount):
			entry = frappe.get_doc(
				{
					"doctype": "Journal Entry",
					"company": self.company,
					"posting_date": frappe.utils.today(),
					"user_remark": remark,
					"accounts": [
						{
							"account": debit_account,
							"debit_in_account_currency": amount,
							"cost_center": self.cost_center,
						},
						{
							"account": credit_account,
							"credit_in_account_currency": amount,
							"cost_center": self.cost_center,
						},
					],
				}
			)
			entry.insert(ignore_permissions=True)
			entry.submit()
			return entry.name

		out = legacy(f"POS Cash Entry|{self.shift}|out|{self.supplier}|Wine", self.supplies, self.cash, 30)
		# The old writer booked a pay-in backwards and called it « in »: the ledger says what happened.
		backwards = legacy(f"POS Cash Entry|{self.shift}|in|{self.pay_in}|", self.bank, self.cash, 200)
		no_drawer = legacy(f"POS Cash Entry|{self.shift}|in|{self.fees}|", self.bank_fees, self.bank, 5)
		tag_the_tills_cash_movements.execute()
		tags = {
			name: frappe.db.get_value(
				"Journal Entry",
				name,
				[
					"posa_cash_movement",
					"posa_cash_movement_shift",
					"posa_cash_entry_template",
					"posa_cash_movement_note",
				],
				as_dict=True,
			)
			for name in (out, backwards, no_drawer)
		}
		self.assertEqual(
			tags[out],
			{
				"posa_cash_movement": "Out",
				"posa_cash_movement_shift": self.shift,
				"posa_cash_entry_template": self.supplier,
				"posa_cash_movement_note": "Wine",
			},
		)
		self.assertEqual(tags[backwards].posa_cash_movement, "Out")
		self.assertFalse(tags[no_drawer].posa_cash_movement)
		self.assertEqual(tags[no_drawer].posa_cash_movement_shift, self.shift)
		self.assertEqual(
			[
				(row.journal_entry, row.direction, row.amount)
				for row in cash_movement.shift_movements(self.shift)
			],
			[(out, "Out", 30), (backwards, "Out", 200)],
		)


NO_ACCOUNT_MODE = f"{PREFIX} Cash without account"


def _the_patch():
	from pos_next.patches.neorestau import keep_the_tills_cash_operations

	return keep_the_tills_cash_operations


class TestTheTillsKeepTheirOperations(CashMovementFixture):
	"""Before the till's list became a control, an empty list offered every operation of the till's company.
	The patch keep_the_tills_cash_operations fills each empty list once with what the till offered, less what
	the new rule refuses for that till (an operation that does not move the till's cash account, or whose
	direction cannot be read), and says on the till what it kept and what it left out. A list that is not
	empty is never touched, and a second run changes nothing. The test builds two companies of its own, so
	that no operation of the site's real companies is counted."""

	def setUp(self):
		self._isolate()
		self.company_a = self._new_company("A")
		self.company_b = self._new_company("B")
		self.cash_a, self.valid_a, self.refused_a = self._operations(self.company_a, "A")
		self.cash_b, self.valid_b, self.refused_b = self._operations(self.company_b, "B")
		for mode, accounts in (
			(MODE, [(self.company_a, self.cash_a), (self.company_b, self.cash_b)]),
			(NO_ACCOUNT_MODE, []),
		):
			if frappe.db.exists("Mode of Payment", mode):
				frappe.delete_doc("Mode of Payment", mode, ignore_permissions=True, force=True)
			frappe.get_doc(
				{
					"doctype": "Mode of Payment",
					"mode_of_payment": mode,
					"type": "Cash",
					"enabled": 1,
					"accounts": [
						{"company": company, "default_account": account} for company, account in accounts
					],
				}
			).insert(ignore_permissions=True)
		self.empty_a = self._till("A empty", self.company_a, MODE)
		self.listed_a = self._till("A listed", self.company_a, MODE, [self.refused_a[0]])
		self.empty_b = self._till("B empty", self.company_b, MODE)
		self.without_cash_account = self._till("A without cash account", self.company_a, NO_ACCOUNT_MODE)

	def _new_company(self, letter):
		"""A company of the test's own, with the root accounts the helpers build under and nothing else: no
		chart, and none of the shared records ERPNext edits when it makes one (it saves the « Cash » mode of
		payment, which a site may refuse for reasons of its own)."""
		name = f"{PREFIX} company {letter}"
		if not frappe.db.exists("Company", name):
			with patch.dict(frappe.local.flags, {"ignore_chart_of_accounts": True}):
				frappe.get_doc(
					{
						"doctype": "Company",
						"company_name": name,
						"abbr": f"_PCM{letter}",
						"default_currency": "CHF",
						"country": "Switzerland",
					}
				).insert(ignore_permissions=True)
			for root_type in ("Asset", "Liability", "Income", "Expense"):
				# A root has no parent: ERPNext's own chart importer inserts it with ignore_mandatory.
				root = frappe.get_doc(
					{
						"doctype": "Account",
						"account_name": f"{PREFIX} {root_type}",
						"company": name,
						"is_group": 1,
						"root_type": root_type,
						"report_type": "Balance Sheet"
						if root_type in ("Asset", "Liability")
						else "Profit and Loss",
						"account_currency": "CHF",
					}
				)
				root.flags.ignore_mandatory = True
				root.insert(ignore_permissions=True)
		self.addCleanup(frappe.clear_document_cache, "Company", name)
		return name

	def _operations(self, company, letter):
		"""(the till's cash account, the operations it can book, those it cannot) of one company."""
		self._use_company(company)
		cash = self._account("Till Cash", "Asset", "Cash")
		safe = self._account("Safe", "Asset", "Cash")
		bank = self._account("Bank", "Asset", "Bank")
		transit = self._account("Transit", "Asset")
		supplies = self._account("Supplies", "Expense")
		fees = self._account("Bank Fees", "Expense")
		income = self._account("Other Income", "Income")
		valid = [
			self._template(f"{letter} Supplier payment", cash, supplies, "Credit"),
			self._template(f"{letter} Pay-in", bank, cash, "Credit"),
			self._template(f"{letter} Other income", cash, income, "Debit"),
		]
		refused = [
			self._template(f"{letter} Bank fees", bank, fees, "Credit"),
			self._template(f"{letter} Safe drop", safe, transit, "Credit"),
			self._plain_template(f"{letter} Plain", cash, supplies),
		]
		return cash, sorted(valid), refused

	def _till(self, label, company, mode, operations=()):
		name = f"{PREFIX} {label}"
		if frappe.db.exists("POS Profile", name):
			frappe.delete_doc("POS Profile", name, ignore_permissions=True, force=True)
		profile = frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": name,
				"company": company,
				"currency": "CHF",
				"posa_cash_mode_of_payment": mode,
				"posa_cash_entry_templates": [
					{"journal_entry_template": operation} for operation in operations
				],
			}
		)
		# Only what the patch reads matters here: the till's company, its cash mode and its list.
		profile.flags.ignore_validate = True
		profile.flags.ignore_mandatory = True
		profile.insert(ignore_permissions=True)
		return name

	def _list(self, profile):
		return frappe.get_all(
			"POS Cash Entry Template",
			filters={
				"parent": profile,
				"parenttype": "POS Profile",
				"parentfield": "posa_cash_entry_templates",
			},
			pluck="journal_entry_template",
			order_by="idx asc",
		)

	def _notes(self, profile):
		return frappe.get_all(
			"Comment",
			filters={
				"reference_doctype": "POS Profile",
				"reference_name": profile,
				"subject": _the_patch().MARK,
			},
			pluck="content",
		)

	def test_an_empty_list_gets_the_companys_operations_the_till_can_book(self):
		_the_patch().execute()
		self.assertEqual(self._list(self.empty_a), self.valid_a)
		[note] = self._notes(self.empty_a)
		for operation in self.valid_a + self.refused_a:
			self.assertIn(operation, note)
		# Why the bank fees and the safe drop are left out: they do not move the till's cash account.
		self.assertIn(self.cash_a, note)

	def test_a_list_that_is_not_empty_is_untouched(self):
		_the_patch().execute()
		self.assertEqual(self._list(self.listed_a), [self.refused_a[0]])
		self.assertEqual(self._notes(self.listed_a), [])

	def test_a_second_run_changes_nothing(self):
		tills = (self.empty_a, self.listed_a, self.empty_b, self.without_cash_account)
		_the_patch().execute()
		first = {till: (self._list(till), self._notes(till)) for till in tills}
		_the_patch().execute()
		self.assertEqual({till: (self._list(till), self._notes(till)) for till in tills}, first)
		# A till whose cash mode has no account keeps an empty list, said once.
		self.assertEqual(self._list(self.without_cash_account), [])
		self.assertEqual(len(self._notes(self.without_cash_account)), 1)

	def test_a_till_of_another_company_gets_its_own_companys_operations_only(self):
		_the_patch().execute()
		self.assertEqual(self._list(self.empty_b), self.valid_b)
		self.assertFalse(set(self._list(self.empty_b)) & set(self.valid_a + self.refused_a))

	def test_a_till_whose_company_has_no_operation_is_left_alone_and_silent(self):
		company_c = self._new_company("C")
		empty_c = self._till("C empty", company_c, MODE)
		_the_patch().execute()
		self.assertEqual((self._list(empty_c), self._notes(empty_c)), ([], []))

	def test_a_till_that_fails_is_rolled_back_to_its_savepoint_and_logged_and_the_others_go_on(self):
		# The failure comes after the till's rows were written: its savepoint takes them back, no half list
		# is left without the Comment that explains it, the error is logged, and the next till is sorted out.
		patch_module = _the_patch()
		real_say = patch_module._say

		def say(pos_profile, kept, left_out):
			if pos_profile == self.empty_a:
				raise RuntimeError("the Comment could not be written")
			return real_say(pos_profile, kept, left_out)

		with patch.object(patch_module, "_say", side_effect=say):
			patch_module.execute()
		self.assertEqual((self._list(self.empty_a), self._notes(self.empty_a)), ([], []))
		self.assertEqual(self._list(self.empty_b), self.valid_b)
		self.assertTrue(
			frappe.db.exists(
				"Error Log", {"method": f"Cash operations of the till {self.empty_a} not kept"[:140]}
			)
		)
