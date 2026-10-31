# //// Neoffice — added file (no upstream equivalent).
"""« Offert » at the till (NeoRestau lot 1, task 24).

The cashier offers some or all of a line's quantity. The offered part is a row of its own of the same item, flagged by a
field of ours (`posa_is_offered`, never ERPNext's `is_free_item`, which a pricing rule may strip): it keeps its list
price at a 100 % discount, so the invoice says what was offered and charges nothing for it, no VAT on it, while its
stock goes out like any unit sold. Who may offer: whoever may change a discount at that till (its POS Settings,
checked by the server whatever the till shows), and, where a rule of the authorization gate asks for it (off by
default), a manager's PIN for « Offer an item ».

The test builds everything it needs on a fresh CI site (no patch, no after_migrate runs there): its own company with its
books open, a stock item and a service item with their prices, a VAT at 8.1 % included in the price, a till of its own
and its settings, the field itself. Nothing commits: frappe.db.commit is a no-op for the class (update_invoice commits
the kitchen fields) and the whole class is rolled back by FrappeTestCase, each test to its savepoint. The field's
column, when the site does not have it yet, is made first: a column added commits (MariaDB DDL), so it is made before
anything else of the class exists.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, getdate, nowdate

from pos_next.api import authorization, guest_ordering, invoices, restaurant, shifts
from pos_next.authorization import pin as pin_store
from pos_next.offered import ensure_offered_field
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.tests.test_till_writes_need_the_till import _user

COMPANY = "_Test Offered Company"
ABBR = "_TOFC"
TILL_USER = "offered-till@yopmail.com"
MANAGER = "offered-manager@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
APPROVER_ROLE = "_Test Offered Approver"
PROFILE = "_Test Offered Till"
PRICE_LIST = "_Test Offered Selling"
TIRAMISU = "_Test Offered Tiramisu"
ESPRESSO = "_Test Offered Espresso"
CUSTOMER = "_Test Offered Guest"
RESTAURANT = "_Test Offered Restaurant"
ACTION = "Offer an item"
OFFERED = "posa_is_offered"
PIN = "4826"
SAVEPOINT = "offered_items_test"
# The tiramisu, VAT 8.1 % included (10.00 + 0.81), valued 3.00 in stock; the espresso, a service
PRICE = 10.81
ESPRESSO_PRICE = 4.2
VALUATION = 3.0


def _fresh(doctype, name):
	"""Take away what a run cut short may have left under a name of the test."""
	if name and frappe.db.exists(doctype, name):
		frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)


def _company():
	"""A company of the test's own, in CHF, perpetual inventory on: its chart, warehouses and cost centre are ERPNext's."""
	if not frappe.db.exists("Company", COMPANY):
		frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": COMPANY,
				"abbr": ABBR,
				"default_currency": "CHF",
				"country": "Switzerland",
				"create_chart_of_accounts_based_on": "Standard Template",
				"chart_of_accounts": "Standard",
				"enable_perpetual_inventory": 1,
			}
		).insert(ignore_permissions=True)
	_open_books(COMPANY)
	return COMPANY


def _open_books(company):
	"""The company's books open today: a fiscal year that names its companies takes it in, else one is made for it."""
	from erpnext.accounts.utils import FiscalYearError, get_fiscal_year

	try:
		get_fiscal_year(nowdate(), company=company, verbose=0)
		return
	except FiscalYearError:
		pass
	today = getdate(nowdate())
	covering = frappe.get_all(
		"Fiscal Year",
		filters={"disabled": 0, "year_start_date": ("<=", today), "year_end_date": (">=", today)},
		pluck="name",
	)
	for name in covering:
		year = frappe.get_doc("Fiscal Year", name)
		if year.companies:
			year.append("companies", {"company": company})
			year.save(ignore_permissions=True)
			frappe.cache().delete_value("fiscal_years")
			return
	frappe.cache().delete_value("fiscal_years")
	frappe.get_doc(
		{
			"doctype": "Fiscal Year",
			"year": f"_Test Offered {today.year}",
			"year_start_date": f"{today.year}-01-01",
			"year_end_date": f"{today.year}-12-31",
			"companies": [{"company": company}],
		}
	).insert(ignore_permissions=True)
	frappe.cache().delete_value("fiscal_years")


def _account(company, **filters):
	return frappe.db.get_value("Account", {"company": company, "is_group": 0, **filters}, "name")


def _item(code, company, warehouse, is_stock_item):
	_fresh("Item", code)
	return (
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": code,
				"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft"),
				"stock_uom": "Nos"
				if frappe.db.exists("UOM", "Nos")
				else frappe.db.get_value("UOM", {}, "name"),
				"is_stock_item": is_stock_item,
				"is_sales_item": 1,
				"valuation_rate": VALUATION if is_stock_item else 0,
				"item_defaults": [{"company": company, "default_warehouse": warehouse}],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _dish_key(row):
	"""What a kitchen line is, whatever the till named it (the key a kitchen-ticket printer counts by)."""
	return "|".join(
		(
			row.get("preparation_station") or "",
			row.item_code,
			row.uom or "",
			row.get("posa_item_modifiers") or "",
			row.get("posa_special_instructions") or "",
		)
	)


class OfferedTill:
	"""The company, its till, VAT and items, made once for the class; a test works inside a savepoint."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# First: the field's column, when it has to be added, commits what came before (nothing of the class yet)
		ensure_offered_field()
		cls.addClassCleanup(frappe.set_user, "Administrator")
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		cls.addClassCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		# A refusal of the authorization gate logs itself after the next full rollback, and commits: the class's own
		# rollback must not write it to the site
		cls.addClassCleanup(frappe.db.after_rollback.reset)

		if not frappe.db.exists("Role", APPROVER_ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": APPROVER_ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		_user(TILL_USER, [CASHIER_ROLE], "System User")
		_user(MANAGER, [APPROVER_ROLE], "System User")
		pin_store.set_pin(MANAGER, PIN)

		cls.company = _company()
		company = cls.company
		cls.warehouse = frappe.db.get_value(
			"Warehouse", {"company": company, "is_group": 0, "warehouse_name": "Stores"}, "name"
		) or frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
		cls.cost_center = frappe.get_cached_value("Company", company, "cost_center")
		cls.cash_account = frappe.get_cached_value("Company", company, "default_cash_account") or _account(
			company, account_type="Cash"
		)
		cls.mode = cls._cash_mode()

		_fresh("Price List", PRICE_LIST)
		frappe.get_doc(
			{
				"doctype": "Price List",
				"price_list_name": PRICE_LIST,
				"currency": "CHF",
				"selling": 1,
				"enabled": 1,
			}
		).insert(ignore_permissions=True)
		cls.tiramisu = _item(TIRAMISU, company, cls.warehouse, is_stock_item=1)
		cls.espresso = _item(ESPRESSO, company, cls.warehouse, is_stock_item=0)
		for item, rate in ((cls.tiramisu, PRICE), (cls.espresso, ESPRESSO_PRICE)):
			frappe.get_doc(
				{
					"doctype": "Item Price",
					"item_code": item,
					"price_list": PRICE_LIST,
					"price_list_rate": rate,
				}
			).insert(ignore_permissions=True)
		# Twenty tiramisus in the till's warehouse, at 3.00 each
		receipt = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": "Material Receipt",
				"company": company,
				"items": [
					{
						"item_code": cls.tiramisu,
						"qty": 20,
						"t_warehouse": cls.warehouse,
						"basic_rate": VALUATION,
						"conversion_factor": 1,
						"cost_center": cls.cost_center,
					}
				],
			}
		)
		receipt.insert(ignore_permissions=True)
		receipt.submit()

		_fresh("Customer", CUSTOMER)
		cls.customer = (
			frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": CUSTOMER,
					"customer_type": "Individual",
					"customer_group": invoices._leaf_customer_group(),
					"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name")
					or "All Territories",
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

		# The VAT, 8.1 % included in the price, on an account of the test's own
		tax_group = frappe.db.get_value(
			"Account", {"company": company, "is_group": 1, "account_type": "Tax"}, "name"
		) or frappe.db.get_value(
			"Account", {"company": company, "is_group": 1, "root_type": "Liability"}, "name"
		)
		_fresh("Account", f"_Test Offered VAT 8.1 - {ABBR}")
		cls.vat_account = (
			frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": "_Test Offered VAT 8.1",
					"parent_account": tax_group,
					"company": company,
					"account_type": "Tax",
					"tax_rate": 8.1,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		_fresh("Sales Taxes and Charges Template", f"_Test Offered VAT - {ABBR}")
		taxes = frappe.get_doc(
			{
				"doctype": "Sales Taxes and Charges Template",
				"title": "_Test Offered VAT",
				"company": company,
				"taxes": [
					{
						"charge_type": "On Net Total",
						"account_head": cls.vat_account,
						"description": "VAT 8.1 %",
						"rate": 8.1,
						"included_in_print_rate": 1,
						"cost_center": cls.cost_center,
					}
				],
			}
		).insert(ignore_permissions=True)

		_fresh("POS Profile", PROFILE)
		write_off = _account(company, root_type="Expense")
		frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": PROFILE,
				"company": company,
				"currency": "CHF",
				"warehouse": cls.warehouse,
				"selling_price_list": PRICE_LIST,
				"customer": cls.customer,
				"cost_center": cls.cost_center,
				"write_off_account": write_off,
				"write_off_cost_center": cls.cost_center,
				"write_off_limit": 1,
				"disable_rounded_total": 1,
				"taxes_and_charges": taxes.name,
				"payments": [{"mode_of_payment": cls.mode, "default": 1}],
				"applicable_for_users": [{"user": TILL_USER}],
			}
		).insert(ignore_permissions=True)
		cls.make_till_settings()

	@classmethod
	def _cash_mode(cls):
		"""Cash, wired to the company's cash account (ERPNext does it when the company is made; made sure here)."""
		if not frappe.db.exists("Mode of Payment", "Cash"):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "Cash", "type": "Cash"}).insert(
				ignore_permissions=True
			)
		mode = frappe.get_doc("Mode of Payment", "Cash")
		mode.enabled = 1
		row = next((r for r in mode.accounts if r.company == cls.company), None) or mode.append(
			"accounts", {"company": cls.company}
		)
		row.default_account = cls.cash_account
		mode.save(ignore_permissions=True)
		return mode.name

	@classmethod
	def make_till_settings(cls, **values):
		"""The till's POS Settings (one row): discounts allowed, prices including the VAT."""
		for name in frappe.get_all("POS Settings", filters={"pos_profile": PROFILE}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": PROFILE,
				"enabled": 1,
				"tax_inclusive": 1,
				"allow_user_to_edit_item_discount": 1,
				**values,
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True).name

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		# The gate's refusals wait for a full rollback to log themselves (log.record, survive_rollback): dropped
		self.addCleanup(frappe.db.after_rollback.reset)

	# -- what the till sends ---------------------------------------------------------------------------------------

	@staticmethod
	def line(item, qty, rate, offered=False, **extra):
		"""A line as the till sends it (useInvoice.formatItemsForSubmission): an offered one at rate 0, its list
		price kept, 100 % off, flagged."""
		if offered:
			row = {
				"rate": 0,
				"discount_percentage": 100,
				"discount_amount": flt(qty * rate, 2),
				OFFERED: 1,
			}
		else:
			row = {"rate": rate, "discount_percentage": 0, "discount_amount": 0, OFFERED: 0}
		return {
			"item_code": item,
			"qty": qty,
			"price_list_rate": rate,
			"uom": "Nos",
			"conversion_factor": 1,
			**row,
			**extra,
		}

	def sale(self, lines, **changes):
		"""A cash sale of the till, paid in full: the amount is what the lines charge (the price includes the VAT)."""
		total = flt(sum(flt(line["rate"]) * flt(line["qty"]) for line in lines), 2)
		sale = {
			"doctype": "Sales Invoice",
			"is_pos": 1,
			"pos_profile": PROFILE,
			"company": self.company,
			"currency": "CHF",
			"customer": self.customer,
			"selling_price_list": PRICE_LIST,
			"items": lines,
			"payments": [{"mode_of_payment": self.mode, "amount": total}],
		}
		sale.update(changes)
		return sale

	def as_till(self, method, *args, **kwargs):
		frappe.set_user(TILL_USER)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def draft(self, lines, **changes):
		"""The sale saved as the till saves a draft or a table (update_invoice), read back."""
		saved = self.as_till(invoices.update_invoice, json.dumps(self.sale(lines, **changes)))
		return frappe.get_doc("Sales Invoice", saved["name"])

	def pay(self, lines, token=None, **changes):
		"""The sale paid as the till pays it: its draft (update_invoice), then submit_invoice, read back."""
		sale = self.sale(lines, **changes)
		saved = self.as_till(invoices.update_invoice, json.dumps(sale))
		paid = {**sale, "name": saved["name"]}
		if token:
			paid["authorization_token"] = token
		self.as_till(invoices.submit_invoice, invoice=json.dumps(paid), data="{}")
		return frappe.get_doc("Sales Invoice", saved["name"])

	def two_paid_one_offered(self):
		return [self.line(self.tiramisu, 2, PRICE), self.line(self.tiramisu, 1, PRICE, offered=True)]

	def offered_row(self, inv):
		rows = [row for row in inv.items if row.get(OFFERED)]
		self.assertEqual(len(rows), 1, "the invoice should hold one offered row")
		return rows[0]


class TestAnOfferedRowOnTheInvoice(OfferedTill, FrappeTestCase):
	def test_the_field_is_made_by_the_install_path(self):
		ensure_offered_field()
		field = frappe.get_meta("Sales Invoice Item").get_field(OFFERED)
		self.assertIsNotNone(field)
		self.assertEqual((field.fieldtype, field.read_only), ("Check", 1))
		self.assertTrue(frappe.db.has_column("Sales Invoice Item", OFFERED))
		self.assertEqual(
			frappe.db.count("Custom Field", {"dt": "Sales Invoice Item", "fieldname": OFFERED}), 1
		)

	def test_an_invoice_with_an_offered_row_submits_with_its_totals_vat_gl_and_stock(self):
		stock_before = flt(
			frappe.db.get_value(
				"Bin", {"item_code": self.tiramisu, "warehouse": self.warehouse}, "actual_qty"
			)
		)
		inv = self.pay(self.two_paid_one_offered())
		self.assertEqual(inv.docstatus, 1)
		offered = self.offered_row(inv)
		paid = next(row for row in inv.items if not row.get(OFFERED))
		# The offered row keeps its list price, 100 % off, and charges nothing
		self.assertEqual(
			(offered.qty, offered.price_list_rate, offered.discount_percentage, offered.rate, offered.amount),
			(1, PRICE, 100, 0, 0),
		)
		self.assertFalse(offered.is_free_item)
		self.assertEqual((paid.qty, paid.rate, paid.amount), (2, PRICE, 21.62))
		# The totals and the VAT are the paid part's only: 21.62 holds 20.00 and 1.62 of VAT
		self.assertEqual((inv.grand_total, inv.net_total, inv.total_taxes_and_charges), (21.62, 20.0, 1.62))
		self.assertEqual(inv.outstanding_amount, 0)
		# The ledger: the cash taken, the income and VAT of the paid part, the cost of all three tiramisus
		gl = {}
		for entry in frappe.get_all(
			"GL Entry",
			filters={"voucher_no": inv.name, "is_cancelled": 0},
			fields=["account", "debit", "credit"],
		):
			gl[entry.account] = flt(gl.get(entry.account, 0) + entry.debit - entry.credit, 2)
		self.assertEqual(gl.get(self.cash_account), 21.62)
		self.assertEqual(gl.get(paid.income_account), -20.0)
		self.assertEqual(gl.get(self.vat_account), -1.62)
		self.assertEqual(gl.get(paid.expense_account), 9.0)
		self.assertEqual(sum(gl.values()), 0)
		# The stock: the offered tiramisu went out like the two sold
		moved = frappe.get_all(
			"Stock Ledger Entry",
			filters={"voucher_no": inv.name, "is_cancelled": 0},
			fields=["actual_qty", "stock_value_difference"],
		)
		self.assertEqual(sum(flt(m.actual_qty) for m in moved), -3)
		self.assertEqual(flt(sum(flt(m.stock_value_difference) for m in moved), 2), -9.0)
		stock_after = flt(
			frappe.db.get_value(
				"Bin", {"item_code": self.tiramisu, "warehouse": self.warehouse}, "actual_qty"
			)
		)
		self.assertEqual(stock_before - stock_after, 3)

	def test_a_whole_line_offered_charges_nothing(self):
		lines = [
			self.line(self.espresso, 2, ESPRESSO_PRICE, offered=True),
			self.line(self.tiramisu, 1, PRICE),
		]
		inv = self.pay(lines)
		self.assertEqual(inv.docstatus, 1)
		self.assertEqual(self.offered_row(inv).item_code, self.espresso)
		self.assertEqual(inv.grand_total, PRICE)

	def test_an_offered_row_is_kept_at_zero_whatever_the_payload_says(self):
		# A tampered row: flagged offered, at 50 %: the server puts it back at 100 %
		lines = [
			self.line(self.tiramisu, 2, PRICE),
			self.line(self.tiramisu, 1, PRICE, offered=True, discount_percentage=50, rate=5.4),
		]
		inv = self.draft(lines)
		offered = self.offered_row(inv)
		self.assertEqual((offered.discount_percentage, offered.rate, offered.amount), (100, 0, 0))
		self.assertEqual(inv.grand_total, 21.62)

	def test_a_free_row_of_a_promotion_cannot_be_flagged_offered(self):
		lines = [
			self.line(self.tiramisu, 1, PRICE),
			self.line(self.tiramisu, 1, PRICE, offered=True, is_free_item=1),
		]
		with self.assertRaises(frappe.ValidationError) as refused:
			self.draft(lines)
		self.assertIn("cannot be offered", str(refused.exception))


class TestERPNextKeepsTheOfferedRow(OfferedTill, FrappeTestCase):
	def pricing_rule(self, **values):
		return frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": values.pop("title", "_Test Offered 10 %"),
				"apply_on": "Item Code",
				"items": [{"item_code": self.tiramisu}],
				"selling": 1,
				"company": self.company,
				"currency": "CHF",
				**values,
			}
		).insert(ignore_permissions=True)

	def test_pricing_rules_do_not_remove_the_offered_row(self):
		self.pricing_rule(
			price_or_product_discount="Price", rate_or_discount="Discount Percentage", discount_percentage=10
		)
		gift = self.pricing_rule(
			title="_Test Offered buy one get one",
			price_or_product_discount="Product",
			same_item=1,
			min_qty=1,
			free_qty=1,
		)
		# The till's own path (pricing rules ignored, as the till priced the lines): the offered row stays, at zero
		inv = self.pay(self.two_paid_one_offered())
		offered = self.offered_row(inv)
		self.assertEqual((offered.qty, offered.discount_percentage, offered.amount), (1, 100, 0))
		self.assertEqual(inv.grand_total, 21.62)
		# The desk saving the till's draft with a price rule on: the rule prices the paid line, never the offered one
		frappe.db.set_value("Pricing Rule", gift.name, "disable", 1)
		draft = self.draft(self.two_paid_one_offered())
		draft.ignore_pricing_rule = 0
		draft.flags.ignore_permissions = True
		draft.save()
		offered = self.offered_row(draft)
		self.assertEqual(
			(offered.qty, offered.discount_percentage, offered.rate, offered.amount), (1, 100, 0, 0)
		)
		paid = next(row for row in draft.items if not row.get(OFFERED))
		self.assertEqual(paid.discount_percentage, 10)
		# Paid what the rule now asks, and submitted with the rule still on: the offered row is still there, at zero
		draft.payments[0].amount = draft.grand_total
		draft.save()
		draft.submit()
		draft.reload()
		offered = self.offered_row(draft)
		self.assertEqual((offered.discount_percentage, offered.amount), (100, 0))
		self.assertEqual(draft.docstatus, 1)

	def test_an_items_max_discount_caps_the_discounts_not_the_offer(self):
		frappe.db.set_value("Item", self.tiramisu, "max_discount", 10)
		frappe.clear_document_cache("Item", self.tiramisu)
		self.assertEqual(self.pay(self.two_paid_one_offered()).docstatus, 1)
		# A discount above it is refused as ERPNext refuses it
		with self.assertRaises(frappe.ValidationError) as refused:
			self.pay([self.line(self.tiramisu, 1, PRICE, rate=8.65, discount_percentage=20)])
		self.assertIn("Maximum discount", str(refused.exception))

	def test_an_offered_row_beside_its_paid_row_where_an_item_may_not_be_entered_twice(self):
		frappe.db.set_single_value("Selling Settings", "allow_multiple_items", 0)
		frappe.db.value_cache = {}
		self.assertEqual(self.pay(self.two_paid_one_offered()).docstatus, 1)
		# Two paid rows of the item are still refused, as ERPNext refuses them
		with self.assertRaises(frappe.ValidationError) as refused:
			self.pay([self.line(self.tiramisu, 1, PRICE), self.line(self.tiramisu, 1, PRICE)])
		self.assertIn("multiple times", str(refused.exception))

	def test_an_offered_row_where_a_sale_below_cost_is_refused(self):
		frappe.db.set_single_value("Selling Settings", "validate_selling_price", 1)
		frappe.db.set_value("Item", self.tiramisu, "last_purchase_rate", VALUATION)
		frappe.clear_document_cache("Item", self.tiramisu)
		frappe.db.value_cache = {}
		self.assertEqual(self.pay(self.two_paid_one_offered()).docstatus, 1)
		# A paid row sold below its cost is still refused, as ERPNext refuses it
		with self.assertRaises(frappe.ValidationError) as refused:
			self.pay([self.line(self.tiramisu, 1, PRICE, rate=1.62, discount_percentage=85)])
		self.assertIn("Selling", str(refused.exception))


class TestWhoMayOffer(OfferedTill, FrappeTestCase):
	def test_a_till_that_does_not_allow_discounts_cannot_save_nor_submit_an_offered_row(self):
		self.make_till_settings(allow_user_to_edit_item_discount=0)
		with self.assertRaises(frappe.PermissionError):
			self.pay(self.two_paid_one_offered())
		with self.assertRaises(frappe.PermissionError):
			self.draft(self.two_paid_one_offered())
		# Its sales without an offered row go through
		self.assertEqual(self.pay([self.line(self.tiramisu, 3, PRICE)]).docstatus, 1)

	def test_a_till_without_settings_of_its_own_allows_discounts_as_the_till_reads_it(self):
		for name in frappe.get_all("POS Settings", filters={"pos_profile": PROFILE}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		self.assertEqual(self.pay(self.two_paid_one_offered()).docstatus, 1)

	def test_the_right_is_checked_on_the_document_whatever_path_saves_it(self):
		# Not only the till's endpoints: the table's draft saved again at the desk, once the till lost the right
		draft = self.draft(self.two_paid_one_offered())
		self.make_till_settings(allow_user_to_edit_item_discount=0)
		draft.flags.ignore_permissions = True
		with self.assertRaises(frappe.PermissionError):
			draft.save()

	def test_the_opt_in_pin(self):
		# No rule: nobody's PIN is asked
		self.assertEqual(self.pay(self.two_paid_one_offered()).docstatus, 1)
		self.assertNotIn(ACTION, self.as_till(authorization.get_authorization_policy, PROFILE))

		# A rule for the till: refused without a manager's grant
		frappe.get_doc(
			{
				"doctype": "POS Authorization Rule",
				"action": ACTION,
				"enabled": 1,
				"pos_profile": PROFILE,
				"allow_self_approval": 0,
				"approvers": [{"approver_type": "Role", "role": APPROVER_ROLE}],
			}
		).insert(ignore_permissions=True)
		self.assertTrue(self.as_till(authorization.get_authorization_policy, PROFILE).get(ACTION))
		with self.assertRaises(frappe.ValidationError) as refused:
			self.pay(self.two_paid_one_offered())
		self.assertIn("requires authorization", str(refused.exception))

		# A grant for less than the value offered is refused
		low = self.grant(amount=5)
		with self.assertRaises(frappe.ValidationError):
			self.pay(self.two_paid_one_offered(), token=low)

		# A grant covering it lets the sale through and names the approver
		token = self.grant(amount=PRICE)
		inv = self.pay(self.two_paid_one_offered(), token=token)
		self.assertEqual(inv.docstatus, 1)
		if frappe.get_meta("Sales Invoice").has_field("custom_authorized_by"):
			self.assertEqual(inv.custom_authorized_by, MANAGER)

		# A grant is spent on its sale: another sale cannot use it
		with self.assertRaises(frappe.ValidationError):
			self.pay(self.two_paid_one_offered(), token=token)

		# A sale without an offered row needs no grant
		self.assertEqual(self.pay([self.line(self.tiramisu, 1, PRICE)]).docstatus, 1)

	def grant(self, amount):
		answer = self.as_till(
			authorization.request_grant,
			ACTION,
			MANAGER,
			PIN,
			context=json.dumps({"pos_profile": PROFILE, "amount": amount}),
		)
		self.assertTrue(answer.get("authorized"), answer.get("message"))
		return answer["grant_token"]

	def test_the_action_is_registered_and_offered_to_the_rules(self):
		from pos_next.authorization import registry

		action = registry.get(ACTION)
		self.assertIsNotNone(action)
		self.assertEqual(action.doctype, "Sales Invoice")
		# The rule's Select offers it, as the doctype ships it and as the migrated site reads it
		path = frappe.get_app_path(
			"pos_next",
			"pos_next_auth_gate",
			"doctype",
			"pos_authorization_rule",
			"pos_authorization_rule.json",
		)
		with open(path) as source:
			shipped = next(f for f in json.load(source)["fields"] if f["fieldname"] == "action")
		self.assertIn(ACTION, shipped["options"].split("\n"))
		options = frappe.get_meta("POS Authorization Rule").get_field("action").options.split("\n")
		self.assertIn(ACTION, options)


class TestTheKitchenAndTheTable(OfferedTill, FrappeTestCase):
	def test_an_offer_on_a_dish_already_sent_makes_no_new_kitchen_ticket(self):
		sent = {"kds_status": "Pending", "preparation_station": ""}
		with patch("pos_next.api.kitchen_events.kitchen_send") as kitchen:
			draft = self.draft([self.line(self.tiramisu, 3, PRICE, **sent)])
			before = self.at_the_kitchen(draft.name)
			batches = {row.name: row.get("kds_batch") for row in draft.items}
			split = self.draft(
				[
					self.line(self.tiramisu, 2, PRICE, **sent),
					self.line(self.tiramisu, 1, PRICE, offered=True, **sent),
				],
				name=draft.name,
			)
		self.assertEqual(split.name, draft.name)
		# The kitchen sees the same dish in the same quantity: a printer counting what it printed prints nothing more
		self.assertEqual(self.at_the_kitchen(draft.name), before)
		self.assertEqual({row.kds_status for row in split.items}, {"Pending"})
		# No row got a send number of its own
		sends_before = {int(batch or 0) for batch in batches.values()}
		self.assertEqual({int(row.get("kds_batch") or 0) for row in split.items} - sends_before, set())
		self.assertTrue(kitchen.called)

	def test_an_offer_made_before_the_dish_is_sent_goes_to_the_kitchen_with_it(self):
		held = {"kds_status": "Waiting", "preparation_station": ""}
		sent = {"kds_status": "Pending", "preparation_station": ""}
		with patch("pos_next.api.kitchen_events.kitchen_send") as kitchen:
			draft = self.draft(
				[
					self.line(self.tiramisu, 2, PRICE, **held),
					self.line(self.tiramisu, 1, PRICE, offered=True, **held),
				]
			)
			self.assertEqual(self.at_the_kitchen(draft.name), {})
			# The till sends the dish: its paid line and its offered row, both Pending (SendToKitchenDialog)
			sent_now = self.draft(
				[
					self.line(self.tiramisu, 2, PRICE, **sent),
					self.line(self.tiramisu, 1, PRICE, offered=True, **sent),
				],
				name=draft.name,
			)
		# The kitchen makes the three, the offered one with the two paid, in one send
		self.assertEqual(self.at_the_kitchen(draft.name), {_dish_key(sent_now.items[0]): 3})
		self.assertEqual(
			{(row.get(OFFERED), row.kds_status) for row in sent_now.items}, {(0, "Pending"), (1, "Pending")}
		)
		self.assertEqual(len({int(row.get("kds_batch") or 0) for row in sent_now.items}), 1)
		self.assertTrue(kitchen.called)

	def at_the_kitchen(self, invoice):
		totals = {}
		for row in frappe.get_doc("Sales Invoice", invoice).items:
			if (row.get("kds_status") or "") not in ("", "Waiting"):
				key = _dish_key(row)
				totals[key] = flt(totals.get(key, 0) + flt(row.qty))
		return totals

	def test_the_tables_draft_and_the_guests_page_carry_the_offer(self):
		with patch.object(Restaurant, "_ensure_tip_account"), patch.object(Restaurant, "_ensure_tip_item"):
			_fresh("Restaurant", RESTAURANT)
			place = frappe.get_doc(
				{"doctype": "Restaurant", "restaurant_name": RESTAURANT, "company": self.company}
			).insert(ignore_permissions=True)
		self.make_till_settings(enable_restaurant_mode=1, restaurant=place.name)
		area = frappe.get_doc(
			{"doctype": "Restaurant Area", "area_name": "_Test Offered Room", "restaurant": place.name}
		).insert(ignore_permissions=True)
		table = frappe.get_doc(
			{
				"doctype": "Restaurant Table",
				"table_name": "_Test Offered T2",
				"area": area.name,
				"restaurant": place.name,
			}
		).insert(ignore_permissions=True)
		token = (
			frappe.get_doc(
				{
					"doctype": "Guest Order Token",
					"mode": "restaurant",
					"table": table.name,
					"pos_profile": PROFILE,
				}
			)
			.insert(ignore_permissions=True)
			.token
		)
		with patch.dict(frappe.conf, {"neorestau_active": 1}):
			self.draft(self.two_paid_one_offered(), restaurant_table=table.name)
			# The till opening the table, and reloading it after a guest's order
			for answer in (
				self.as_till(restaurant.open_table, table.name, PROFILE),
				self.as_till(restaurant.get_table_order, table.name),
			):
				rows = [
					(row.qty, row.get(OFFERED), flt(row.get("price_list_rate"))) for row in answer["items"]
				]
				self.assertIn((1, 1, PRICE), rows)
				self.assertIn((2, 0, PRICE), rows)
			# The guest's page: « Offert », in the guest's language, read only
			frappe.set_user("Guest")
			try:
				status = guest_ordering.get_order_status(token)
			finally:
				frappe.set_user("Administrator")
		offered = [row for row in status["items"] if row.get(OFFERED)]
		self.assertEqual(len(offered), 1)
		self.assertEqual(offered[0]["offered_label"], frappe._("Offered", context="Given for free"))
		self.assertEqual(flt(status["grand_total"]), 21.62)


class TestTheClosingCountsTheOffered(OfferedTill, FrappeTestCase):
	def test_the_closing_and_the_end_of_day_print_count_the_offered_units_and_their_value(self):
		opened = self.as_till(
			shifts.create_opening_shift,
			PROFILE,
			self.company,
			json.dumps([{"mode_of_payment": self.mode, "opening_amount": 0}]),
		)
		shift = opened["pos_opening_shift"]["name"]
		first = self.pay(self.two_paid_one_offered(), posa_pos_opening_shift=shift)
		second = self.pay(
			[self.line(self.espresso, 2, ESPRESSO_PRICE, offered=True), self.line(self.tiramisu, 1, PRICE)],
			posa_pos_opening_shift=shift,
		)
		# An invoice without an offer does not count
		self.pay([self.line(self.tiramisu, 1, PRICE)], posa_pos_opening_shift=shift)

		closing = self.as_till(shifts.get_closing_shift_data, shift)
		self.assertEqual(closing["offered_count"], 3)
		self.assertEqual(flt(closing["offered_value"], 2), 19.21)

		from pos_next.offered import get_offered_line

		doc = frappe.get_doc(
			{
				"doctype": "POS Closing Shift",
				"company": self.company,
				"pos_profile": PROFILE,
				"pos_transactions": [{"sales_invoice": first.name}, {"sales_invoice": second.name}],
			}
		)
		line = get_offered_line(doc)
		self.assertIn("3", line)
		self.assertIn("19.21", line)
		# The end-of-day print shows it
		html = frappe.render_template(self.print_format_html("pos_next_eod_report"), {"doc": doc})
		self.assertIn(line, html)
		# A closing without an offer prints no such line
		self.assertEqual(
			get_offered_line(frappe.get_doc({"doctype": "POS Closing Shift", "pos_transactions": []})), ""
		)

	@staticmethod
	def print_format_html(folder):
		path = frappe.get_app_path("pos_next", "pos_next", "print_format", folder, f"{folder}.json")
		with open(path) as source:
			return json.load(source)["html"]


class TestTheReceipt(OfferedTill, FrappeTestCase):
	def test_the_receipt_prints_offered_under_the_offered_line(self):
		inv = self.pay(self.two_paid_one_offered())
		path = frappe.get_app_path("pos_next", "fixtures", "print_format.json")
		with open(path) as source:
			receipt = next(fmt for fmt in json.load(source) if fmt["name"] == "Neopos Receipt")
		html = frappe.render_template(receipt["html"], {"doc": inv})
		sections = html.split('<div class="item-section">')[1:]
		self.assertEqual(len(sections), 2)
		offered_index = next(i for i, row in enumerate(inv.items) if row.get(OFFERED))
		offered, paid = sections[offered_index], sections[1 - offered_index]
		word = frappe._("Offered", context="Given for free")
		self.assertIn(word, offered)
		self.assertIn("0.00", offered)
		self.assertNotIn("Discount", offered)
		self.assertNotIn(word, paid)
		self.assertIn("21.62", paid)
