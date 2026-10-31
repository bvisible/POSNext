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
logic are skipped.
"""

import json
import os
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, getdate
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


def _desk_vat():
	return bool(cash_movement._desk_vat_logic()) and frappe.db.has_column("Account", "taxable_account")


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
		self, label, totalization, counterparty, credit_or_debit, disable_calculation=0, voucher_type=None
	):
		title = f"{PREFIX} {label}"
		doc = {
			"doctype": "Journal Entry Template",
			"template_title": title,
			"company": self.company,
			"voucher_type": voucher_type or "Journal Entry",
			"naming_series": "ACC-JV-.YYYY.-",
			"accounts": [{"account": totalization}, {"account": counterparty}],
		}
		if _theme_templates():
			doc.update(
				{
					"credit_or_debit": credit_or_debit,
					"disable_calculation": disable_calculation,
					"accounting_entry_totalization": [{"account": totalization}],
					"accounting_entry_counterparty": [{"account": counterparty}],
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
		if not _desk_vat():
			self.skipTest("neoffice_theme's journal-entry VAT logic is not installed here")
		if not frappe.db.exists("Neoffice Company Settings", self.company):
			self.skipTest("the test company has no Neoffice Company Settings")
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
		# The drawer moved by the whole amount, VAT included.
		self.assertEqual(cash_movement.movement(result["name"]).amount, 108.10)

	def test_without_vat_the_whole_amount_is_booked(self):
		self._vat_company()
		result = self._record(self.goods_purchase, 108.10, no_vat=1)
		self.assertEqual(self._rows(result["name"]), {self.goods: (108.10, 0), self.cash: (0, 108.10)})
		self.assertEqual(frappe.db.get_value("Journal Entry", result["name"], "posa_cash_movement_no_vat"), 1)

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

	def test_with_the_theme_doctypes_but_not_its_module_a_movement_books_the_whole_amount(self):
		# The doctypes are there but `neoffice_theme.vat_utils` cannot be imported: the same, not a crash.
		with patch.dict(sys.modules, {"neoffice_theme.vat_utils": None}):
			self.assertIsNone(cash_movement._desk_vat_logic())
			result = self._record(self.goods_purchase, 108.10)
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
