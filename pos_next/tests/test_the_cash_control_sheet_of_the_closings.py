# //// Neoffice — added file (no upstream equivalent).
"""The print of the Payments and Cash Control report: one line per closing of a period, or the cash report of one closing.

A bookkeeper looking for where a closing is printed from found this report: 29 columns, one line per closing, no print. It now has
one button. Filtered on a closing it prints the cash report of that closing (the sheet its form prints too); otherwise a cash control
sheet with one line per closing of the period: how many closings, what the drawers should have held, what was counted, the
difference, what each payment method held, and each closing with its status.

The layout (`closings_sheet.build_html`) is a pure function of the report's rows, tested on stand-in rows without a database. The two
web methods are tested with real users: each asks for the right to read the report and the right to read a closing, and a user who
has only one of them is refused. The PDF engine and the report's query are replaced by recorders; nothing here commits.
"""

import json
import re
from unittest.mock import patch

import frappe
from frappe import _
from frappe.tests.utils import FrappeTestCase

from pos_next.pos_next.report.neopos_register import cash_report, neopos_register
from pos_next.pos_next.report.payments_and_cash_control_report import closings_sheet
from pos_next.tests.test_till_writes_need_the_till import _user

MANAGER = "cashcontrol-manager@yopmail.com"
ACCOUNTS = "cashcontrol-accounts@yopmail.com"
CASHIER = "cashcontrol-cashier@yopmail.com"


def row(shift, expected, counted, **more):
	"""A line of the report as `get_data` gives it: one closing with its totals and what each method held."""
	return frappe._dict(
		{
			"shift": shift,
			"posting_date": "2026-11-02",
			"pos_profile": "Till 1",
			"cashier": "a-cashier@yopmail.com",
			"total_transactions": 4,
			"total_expected": expected,
			"total_closing": counted,
			"total_difference": counted - expected,
			"status": "Balanced" if counted == expected else "Short",
			"cash_expected": expected,
			"cash_closing": counted,
			"credit_card_expected": 0,
			"credit_card_closing": 0,
			**more,
		}
	)


def cells(html, css):
	"""The cells of every row of the given class, as text."""
	return [
		[
			re.sub(r"<[^>]+>", "", cell).strip()
			for cell in re.findall(r"<td[^>]*>(.*?)</td>", found, flags=re.S)
		]
		for found in re.findall(rf'<tr class="{css}">(.*?)</tr>', html, flags=re.S)
	]


class TestTheLayout(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.rows = [
			row("POSA-CS-1", 300, 295),
			row("POSA-CS-2", 100, 100, credit_card_expected=50, credit_card_closing=50),
		]
		self.methods = ["Cash", "Credit Card"]

	def build(self, rows=None):
		return closings_sheet.build_html(self.rows if rows is None else rows, self.methods, "CHF")

	def test_the_method_totals_add_what_each_method_held_over_the_closings(self):
		totals = closings_sheet.method_totals(self.rows, self.methods)

		self.assertEqual(
			[(t["method"], t["expected"], t["counted"], t["difference"]) for t in totals],
			[("Cash", 400, 395, -5), ("Credit Card", 50, 50, 0)],
		)

	def test_the_figures_come_first_the_closings_the_expected_the_counted_and_the_difference(self):
		html = self.build()

		cards = html.split(_("By {0}").format(_("Payment Method").lower()), 1)[0]

		for figure in (cash_report.money(400), cash_report.money(395), cash_report.money(-5)):
			self.assertIn(figure, cards)
		self.assertIn(">2<", cards.replace(" ", ""))
		self.assertIn(_("To check"), cards)

	def test_a_period_with_no_difference_says_balanced(self):
		html = self.build([row("POSA-CS-1", 300, 300)])

		self.assertIn(_("Balanced"), html)
		self.assertNotIn(_("To check"), html)

	def test_each_closing_is_a_line_with_its_status_and_the_total_is_the_last(self):
		html = self.build()

		lines = cells(html.split(_("Detail"), 1)[1], "cr-grand")

		self.assertEqual(lines[0][0], _("Total"))
		self.assertEqual(
			lines[0][-4:-1], [cash_report.money(400), cash_report.money(395), cash_report.money(-5)]
		)
		detail = html.split(_("Detail"), 1)[1]
		self.assertIn("POSA-CS-1", detail)
		self.assertIn("POSA-CS-2", detail)
		self.assertIn("Balanced", detail)
		self.assertIn("Short", detail)

	def test_the_detail_has_nine_columns_that_fit_an_upright_sheet(self):
		detail = self.build().split(_("Detail"), 1)[1]

		headers = re.findall(r"<th(?:\s[^>]*)?>(.*?)</th>", detail.split("</thead>", 1)[0], flags=re.S)

		self.assertEqual(
			headers,
			[
				_("Closing"),
				_("Date"),
				_("POS Profile"),
				_("Cashier"),
				_("Operations"),
				_("Expected"),
				_("Counted"),
				_("Difference"),
				_("Status"),
			],
		)

	def test_a_difference_is_marked_and_whole_figures_keep_their_decimals(self):
		html = self.build()

		self.assertIn('class="cr-negative"', html)
		self.assertIn(cash_report.money(100), html)

	def test_a_period_with_no_closing_says_so(self):
		html = self.build([])

		self.assertIn(_("Nothing was recorded."), html)
		self.assertNotIn(_("Detail"), html)

	def test_the_subtitle_names_the_period_the_filters_and_the_currency(self):
		filters = frappe._dict(from_date="2026-10-10", to_date="2026-11-09", pos_profile="Till 1")

		subtitle = closings_sheet.subtitle_of(filters, [], "CHF")

		for part in (
			"10-10-2026",
			"09-11-2026",
			"Till 1",
			_("Amounts in {0}").format("CHF"),
			_("Printed on"),
		):
			self.assertIn(part, subtitle)

	def test_without_dates_the_period_is_the_one_the_closings_cover(self):
		subtitle = closings_sheet.subtitle_of(
			frappe._dict(),
			[row("A", 1, 1, posting_date="2026-11-01"), row("B", 1, 1, posting_date="2026-11-05")],
			"CHF",
		)

		self.assertIn("01-11-2026", subtitle)
		self.assertIn("05-11-2026", subtitle)


class TestTheWebMethods(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# The POS manager reads the report and the closings; Accounts Manager reads the report only; the cashier reads closings
		# only. The closings are read by the roles of the sites' own permission rows (POS roles, not the sales manager's).
		_user(MANAGER, ["Nexus POS Manager"], "System User")
		_user(ACCOUNTS, ["Accounts Manager"], "System User")
		_user(CASHIER, ["POSNext Cashier"], "System User")

	def export_closings(self, user, **filters):
		frappe.set_user(user)
		try:
			with (
				patch.object(
					closings_sheet.report, "get_data", return_value=([row("POSA-CS-1", 300, 295)], ["Cash"])
				),
				patch("frappe.utils.pdf.get_pdf", return_value=b"%PDF-control") as pdf,
			):
				closings_sheet.export_closings_pdf(json.dumps(filters))
		finally:
			frappe.set_user("Administrator")
		return pdf

	def test_the_closings_of_a_period_are_printed_for_who_may_read_the_report_and_the_closings(self):
		pdf = self.export_closings(MANAGER, from_date="2026-10-10", to_date="2026-11-09")

		html, options = pdf.call_args.args
		self.assertIn("POSA-CS-1", html)
		self.assertIn(_("Cash control"), html)
		self.assertEqual((options["orientation"], options["page-size"]), ("Portrait", "A4"))
		self.assertEqual(frappe.local.response.type, "pdf")
		self.assertEqual(frappe.local.response.filecontent, b"%PDF-control")
		self.assertTrue(frappe.local.response.filename.endswith(".pdf"))

	def test_who_reads_the_report_but_no_closing_gets_no_sheet(self):
		with self.assertRaises(frappe.PermissionError):
			self.export_closings(ACCOUNTS, from_date="2026-10-10", to_date="2026-11-09")

	def test_who_reads_the_closings_but_not_the_report_gets_no_sheet(self):
		with self.assertRaises(frappe.PermissionError):
			self.export_closings(CASHIER, from_date="2026-10-10", to_date="2026-11-09")

	def export_closing(self, user, closing="POSA-CS-1"):
		"""The sheet of a closing asked by `user`; what the register was asked to print, and the rights asked on the closing itself."""
		real = frappe.has_permission
		asked = []

		def has_permission(doctype=None, ptype="read", doc=None, **kwargs):
			if doc == closing:
				# The closing is not made here: its own right is only noted
				asked.append((doctype, ptype, doc))
				return True
			return real(doctype, ptype, doc, **kwargs)

		frappe.set_user(user)
		try:
			with (
				patch.object(
					neopos_register, "render_sheet", return_value=(b"%PDF-closing", "cash_report_x.pdf")
				) as sheet,
				patch.object(frappe, "has_permission", side_effect=has_permission),
			):
				closings_sheet.export_closing_pdf(closing)
		finally:
			frappe.set_user("Administrator")
		return sheet, asked

	def test_a_closing_prints_the_sheet_the_register_makes_of_it_and_its_own_right_is_asked(self):
		sheet, asked = self.export_closing(MANAGER)

		self.assertEqual(sheet.call_args.args[0].pos_closing_shift, "POSA-CS-1")
		self.assertEqual(asked, [("POS Closing Shift", "read", "POSA-CS-1")])
		self.assertEqual(frappe.local.response.filecontent, b"%PDF-closing")
		self.assertEqual(frappe.local.response.type, "pdf")

	def test_a_closing_is_refused_to_who_may_not_read_the_report(self):
		with self.assertRaises(frappe.PermissionError):
			self.export_closing(CASHIER)

	def test_a_closing_is_refused_to_who_may_read_the_report_but_no_closing(self):
		with self.assertRaises(frappe.PermissionError):
			self.export_closing(ACCOUNTS)
