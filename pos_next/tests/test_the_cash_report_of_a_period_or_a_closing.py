# //// Neoffice — added file (no upstream equivalent).
"""The cash report: the register of a period or of one closing, printed on A4 paper in landscape.

The register is the till journal (sales, invoices collected at the counter, the drawer's cash in and out). Two things were missing:
a sheet a bookkeeper can file (date, document, customer, till, cashier, total, and how it was paid, grouped by payment method, with
what each method collected first), and a way to ask for it by closing (the closing lists what it counted). Both are pinned here.

The layout (`cash_report.build_html`) is a pure function of the entries it is given, so it is tested on stand-in lines, without a
database: the groups and their order, the subtotals that never add a document paid with two methods twice, the columns, the tags
of a return or of the drawer's movements, the cash control of a closing. The register is then tested through the database with the
takeaway till's fixture: the invoices a closing counted are the only ones listed, whatever the dates say, a closing that counted
nothing lists nothing, a user kept to another company reads nothing, and the web method that prints the sheet asks for the right to
read the report. The PDF engine is replaced by a recorder (the sheet is looked at on osiris); nothing here commits.
"""

import json
import re
import unittest
from unittest.mock import patch

import frappe
from frappe import _
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, today
from frappe.utils.data import get_number_format_info

from pos_next.api import invoices
from pos_next.pos_next.report import user_permission_scope
from pos_next.pos_next.report.neopos_register import cash_report, neopos_register
from pos_next.tests.test_takeaway_tax_category import TILL, TakeawayTill
from pos_next.tests.test_till_writes_need_the_till import _user

CLOSING = "_Test POSA-CS-CASH-REPORT"
MANAGER = "cashreport-manager@yopmail.com"
OUTSIDER = "cashreport-outsider@yopmail.com"


def entry(reference, mode, paid, total=None, **more):
	"""A line of the register as `neopos_register.get_entries` gives it."""
	return frappe._dict(
		{
			"posting_date": "2026-11-02",
			"sales_invoice": reference,
			"customer": "Walk-in",
			"pos_profile": "Till 1",
			"owner": "Administrator",
			"mode_of_payment": mode,
			"grand_total": paid if total is None else total,
			"paid_amount": paid,
			"transaction_type": _("POS Sale"),
			"is_return": 0,
			**more,
		}
	)


def rows(html, css):
	"""The cells of every row of the given class, as text."""
	found = []
	for row in re.findall(rf'<tr class="{css}">(.*?)</tr>', html, flags=re.S):
		found.append(
			[
				re.sub(r"<[^>]+>", "", cell).strip()
				for cell in re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
			]
		)
	return found


def detail_of(html):
	return html.split(_("Detail"), 1)[1]


def headers_of(detail):
	"""The column titles of the first table of the html."""
	return re.findall(r"<th(?:\s[^>]*)?>(.*?)</th>", detail.split("</thead>", 1)[0], flags=re.S)


class Closing(frappe._dict):
	"""A closing as far as the register reads it: a dict that answers like a document and notes the right asked of it."""

	def check_permission(self, permtype="read"):
		self.checked = permtype


class TestTheLayout(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.entries = [
			entry("INV-1", "Cash", 50, 80),
			entry("INV-1", "Card", 30, 80),
			entry("INV-2", "Cash", 20),
			entry("INV-3", "Cash", 30),
			entry("INV-4", "Twint", 25),
		]

	def build(self, entries=None, field="mode_of_payment", **more):
		entries = self.entries if entries is None else entries
		return cash_report.build_html(entries, entries, field, currency="CHF", **more)

	def test_the_groups_come_the_most_collected_first(self):
		detail = detail_of(self.build())

		# Cash collected 100, Card 30, Twint 25: the order the summary above lists them in
		self.assertLess(detail.index("Cash"), detail.index("Card"))
		self.assertLess(detail.index("Card"), detail.index("Twint"))

	def test_a_document_paid_with_two_methods_is_one_operation_and_its_total_is_not_added_twice(self):
		html = self.build()

		subtotals = {cells[0]: cells[1:] for cells in rows(html, "cr-sub")}
		grand = rows(html, "cr-grand")[0]

		# The sheet is grouped by method: the subtotal adds what each method collected, and leaves the documents' totals out
		self.assertEqual(subtotals[f"{_('Subtotal')} Cash"], ["", cash_report.money(100)])
		self.assertEqual(subtotals[f"{_('Subtotal')} Card"], ["", cash_report.money(30)])
		self.assertEqual(grand[-1], cash_report.money(155))
		# Four documents, one of them paid with two methods
		self.assertEqual(cash_report.operations(self.entries), 4)

	def test_a_sheet_grouped_by_method_leaves_the_method_column_out(self):
		detail = detail_of(self.build())

		headers = headers_of(detail)

		self.assertEqual(
			headers,
			[
				_("Posting Date"),
				_("Reference"),
				_("Customer"),
				_("POS Profile"),
				_("Cashier"),
				_("Grand Total"),
				_("Paid Amount"),
			],
		)

	def test_a_sheet_grouped_by_another_field_shows_the_method_and_adds_the_totals(self):
		entries = [
			entry("INV-1", "Cash", 10, owner="a@yopmail.com"),
			entry("INV-2", "Card", 20, owner="a@yopmail.com"),
		]
		html = cash_report.build_html(entries, entries, "owner", currency="CHF")

		headers = headers_of(detail_of(html))

		self.assertIn(_("Payment Method"), headers)
		self.assertNotIn(_("Cashier"), headers)
		self.assertEqual(
			rows(detail_of(html), "cr-sub")[0][-2:], [cash_report.money(30), cash_report.money(30)]
		)

	def test_the_summary_comes_first_with_each_methods_share(self):
		html = self.build()

		summary = html.split(_("Detail"), 1)[0]

		self.assertIn(cash_report.money(155), summary)
		self.assertIn(_("By payment method"), summary)
		# Cash is 100 of 155: 64.5 %
		self.assertIn("64.5", summary)

	def test_a_return_and_the_drawers_movements_carry_their_tag(self):
		entries = [
			entry("INV-1", "Cash", 40),
			entry("INV-2", "Cash", -15, is_return=1),
			entry("JV-1", "Cash", 100, transaction_type=_("Cash In")),
		]

		html = self.build(entries)

		self.assertIn(f'<span class="cr-tag">{_("Return")}</span>', html)
		self.assertIn(f'<span class="cr-tag">{_("Cash In")}</span>', html)
		# A plain sale carries none, and a negative figure is marked
		self.assertNotIn(f'<span class="cr-tag">{_("POS Sale")}</span>', html)
		self.assertIn('class="cr-negative"', html)
		self.assertIn(_("Returns"), html)

	def test_a_closing_adds_the_cash_control_of_its_drawer(self):
		closing = frappe._dict(
			name=CLOSING,
			payment_reconciliation=[
				frappe._dict(
					mode_of_payment="Cash",
					opening_amount=100,
					expected_amount=300,
					closing_amount=295,
					difference=-5,
				),
				frappe._dict(
					mode_of_payment="Card",
					opening_amount=0,
					expected_amount=50,
					closing_amount=50,
					difference=0,
				),
			],
		)

		html = self.build(closing=closing)

		self.assertIn(_("Cash control"), html)
		self.assertIn(_("Cash difference"), html)
		control = html.split(_("Cash control"), 1)[1].split(_("Detail"), 1)[0]
		self.assertIn(cash_report.money(295), control)
		self.assertEqual(rows(control, "cr-sub")[0][-1], cash_report.money(-5))
		# A period has no drawer to control
		self.assertNotIn(_("Cash control"), self.build())

	def test_a_period_with_nothing_says_so(self):
		html = self.build([])

		self.assertIn(_("Nothing was recorded."), html)
		self.assertEqual(cash_report.operations([]), 0)

	def test_the_subtitle_names_the_period_and_the_filters_the_sheet_is_narrowed_by(self):
		filters = frappe._dict(
			from_date="2026-10-01", to_date="2026-10-31", pos_profile="Till 1", mode_of_payment="Cash"
		)

		subtitle = cash_report.subtitle_of(filters)

		for part in ("01-10-2026", "31-10-2026", "Till 1", "Cash", _("Printed on")):
			self.assertIn(part, subtitle)

	def test_a_whole_figure_keeps_its_two_decimals(self):
		# Frappe writes a Float without its decimals when they are zero (16 for 16.00): a column of money must not
		decimal = get_number_format_info(frappe.db.get_default("number_format") or "#,###.##")[0]

		for value in (16, -12, 0, 1733.5):
			with self.subTest(value=value):
				self.assertEqual(len(cash_report.money(value).split(decimal)[-1]), 2)

	def test_the_subtitle_of_a_closing_names_its_till_its_cashier_and_the_currency(self):
		closing = Closing(name=CLOSING, pos_profile="Till 1", user="a-cashier@yopmail.com")
		filters = frappe._dict(from_date="2026-11-02", to_date="2026-11-02")

		subtitle = cash_report.subtitle_of(filters, closing, "CHF")

		for part in (
			CLOSING,
			"Till 1",
			"a-cashier@yopmail.com",
			"02-11-2026",
			_("Amounts in {0}").format("CHF"),
		):
			self.assertIn(part, subtitle)

	def test_the_sheet_is_A4_in_landscape_with_its_page_number(self):
		with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF") as pdf:
			cash_report.render_pdf("<p>body</p>", "A Company", _("Cash report"), "a subtitle")

		html, options = pdf.call_args.args
		self.assertEqual((options["orientation"], options["page-size"]), ("Landscape", "A4"))
		self.assertIn("[page]", options["footer-right"])
		for part in ("A Company", _("Cash report"), "a subtitle", "<p>body</p>"):
			self.assertIn(part, html)


class TestTheRegisterOfAClosing(TakeawayTill, FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(MANAGER, ["Accounts Manager"], "System User")
		# Reads sales invoices, but is none of the report's roles: only the report's own right stops this one
		_user(OUTSIDER, ["Accounts User"], "System User")

	def submitted(self):
		"""A sale of the till paid in cash and submitted as its cashier does; its name."""
		sale = self.sale([self.food])
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			invoices.submit_invoice(invoice=json.dumps({**sale, "name": draft["name"]}), data="{}")
		finally:
			frappe.set_user("Administrator")
		return draft["name"]

	def closing(self, sales=(), payments=(), **more):
		fields = {
			"name": CLOSING,
			"company": self.fx.company,
			"pos_opening_shift": "",
			"posting_date": today(),
			"period_start_date": None,
			"period_end_date": None,
			"pos_transactions": [frappe._dict(sales_invoice=name, posting_date=today()) for name in sales],
			"pos_payments": [frappe._dict(payment_entry=name, posting_date=today()) for name in payments],
			"payment_reconciliation": [],
		}
		return Closing(**{**fields, **more})

	def of(self, closing):
		"""Make `frappe.get_doc` hand the stand-in closing back, and everything else as it is."""
		real = frappe.get_doc

		def get_doc(*args, **kwargs):
			if args and args[0] == "POS Closing Shift":
				return closing
			return real(*args, **kwargs)

		return patch.object(frappe, "get_doc", side_effect=get_doc)

	def register(self, **filters):
		return frappe._dict(
			company=self.fx.company, from_date=today(), to_date=today(), pos_closing_shift=CLOSING, **filters
		)

	def listed(self, filters, group_by_field=""):
		return sorted(
			entry["sales_invoice"] for entry in neopos_register.get_entries(filters, group_by_field)
		)

	def test_a_closing_lists_only_the_invoices_it_counted(self):
		counted, other = self.submitted(), self.submitted()
		filters = self.register()

		with self.of(self.closing(sales=[counted])):
			neopos_register.apply_closing(filters)
			found = self.listed(filters)

		self.assertEqual(found, [counted])
		self.assertNotIn(other, found)

	def test_without_a_closing_the_dates_decide_as_ever(self):
		first, second = self.submitted(), self.submitted()
		filters = frappe._dict(company=self.fx.company, from_date=today(), to_date=today())

		self.assertTrue({first, second} <= set(self.listed(filters)))

	def test_a_closing_that_counted_nothing_lists_nothing(self):
		self.submitted()
		filters = self.register()

		with self.of(self.closing()):
			neopos_register.apply_closing(filters)
			found = self.listed(filters)

		self.assertEqual(found, [])
		self.assertEqual(filters.closing_sales_invoices, neopos_register.NO_DOCUMENT)

	def test_a_closing_brings_its_own_company_and_dates_and_is_read_with_the_right_to_read_it(self):
		closing = self.closing(
			sales=["A"],
			payments=["P"],
			period_start_date="2026-11-02 22:00:00",
			period_end_date="2026-11-03 02:00:00",
		)
		filters = frappe._dict(
			company="Another", from_date="2000-01-01", to_date="2000-01-02", pos_closing_shift=CLOSING
		)

		with self.of(closing):
			neopos_register.apply_closing(filters)

		self.assertEqual(filters.company, self.fx.company)
		# A night shift that ends the next day loses nothing: the dates run from its start to its end, and the day it posted
		self.assertEqual(str(filters.from_date), "2026-11-02")
		self.assertEqual(
			filters.to_date, max(frappe.utils.getdate(today()), frappe.utils.getdate("2026-11-03"))
		)
		self.assertEqual(filters.closing_payment_entries, ("P",))
		self.assertEqual(closing.checked, "read")

	def test_a_user_kept_to_another_company_reads_nothing_of_the_register(self):
		invoice = self.submitted()
		filters = self.register()
		filters.pop("pos_closing_shift")

		def permitted(company):
			return lambda doctype: [company] if doctype == "Company" else []

		with patch.object(
			user_permission_scope, "get_permitted_documents", side_effect=permitted("Another Co")
		):
			kept_out = self.listed(frappe._dict(filters))
		with patch.object(
			user_permission_scope, "get_permitted_documents", side_effect=permitted(self.fx.company)
		):
			let_in = self.listed(frappe._dict(filters))

		self.assertNotIn(invoice, kept_out)
		self.assertIn(invoice, let_in)

	def test_the_register_on_screen_groups_as_it_did(self):
		invoice = self.submitted()
		filters = frappe._dict(
			company=self.fx.company, from_date=today(), to_date=today(), group_by="Payment Method"
		)

		_columns, data = neopos_register.execute(filters)

		subtotals = [row for row in data if row.get("bold")]
		self.assertTrue(subtotals)
		self.assertIn(invoice, [row.get("sales_invoice") for row in data])

	def export(self, user, **filters):
		frappe.set_user(user)
		try:
			with patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-sheet") as pdf:
				neopos_register.export_cash_report_pdf(json.dumps(filters))
		finally:
			frappe.set_user("Administrator")
		return pdf

	def test_the_sheet_of_a_closing_is_printed_for_who_may_read_the_report(self):
		counted = self.submitted()

		with self.of(self.closing(sales=[counted])):
			pdf = self.export(MANAGER, pos_closing_shift=CLOSING)

		html, options = pdf.call_args.args
		self.assertIn(counted, html)
		self.assertIn(CLOSING, html)
		self.assertEqual(options["orientation"], "Landscape")
		self.assertEqual(frappe.local.response.type, "pdf")
		self.assertEqual(frappe.local.response.filecontent, b"%PDF-sheet")
		self.assertTrue(frappe.local.response.filename.endswith(".pdf"))

	def test_the_sheet_of_a_period_names_its_dates(self):
		self.submitted()

		pdf = self.export(MANAGER, company=self.fx.company, from_date=today(), to_date=today())

		self.assertIn(frappe.utils.formatdate(today()), pdf.call_args.args[0])

	def test_someone_who_may_not_read_the_report_gets_no_sheet(self):
		self.submitted()

		with self.assertRaises(frappe.PermissionError):
			self.export(OUTSIDER, company=self.fx.company, from_date=today(), to_date=today())

	def test_a_period_needs_its_company_and_dates(self):
		with self.assertRaises(frappe.ValidationError):
			self.export(MANAGER, from_date=today(), to_date=today())

	def test_the_amounts_of_the_sheet_are_the_registers(self):
		invoice = self.submitted()
		total = flt(frappe.db.get_value("Sales Invoice", invoice, "base_grand_total"))

		pdf = self.export(MANAGER, company=self.fx.company, from_date=today(), to_date=today())

		self.assertIn(cash_report.money(total), pdf.call_args.args[0])


if __name__ == "__main__":
	unittest.main()
