# //// Neoffice — added file (no upstream equivalent). The printed sheets of the Payments and Cash Control report: one line per
# //// closing of a period (what each drawer should have held, what was counted, the difference), and the cash report of ONE
# //// closing when the report is filtered on one. The report has 29 columns and no print: a bookkeeper asked where a closing is
# //// printed from, and found the report. Both sheets are laid out by neopos_register.cash_report, in the accounting profile of
# //// the Oslo documents, upright on A4.
# Copyright (c) 2026, Neoffice and contributors
# For license information, please see license.txt

"""The cash control sheet of the closings of a period, and the cash report of one closing, from the Payments and Cash Control report.

`build_html` is a pure function of the rows the report gives (`get_data`), so the layout is tested without a database. The sheet
has the figures that matter first (how many closings, what was expected, what was counted, the difference), then what each payment
method expected and counted over the period, then one line per closing with its status. A closing the report is filtered on is
printed as the register's cash report of that closing (`neopos_register.render_sheet`), the sheet a closing form prints too.

Each web method asks for the rights it needs: the report's own, and the right to read a closing.
"""

import frappe
from frappe import _
from frappe.utils import flt, formatdate, get_fullname

from pos_next.pos_next.report.neopos_register import cash_report
from pos_next.pos_next.report.payments_and_cash_control_report import (
	payments_and_cash_control_report as report,
)

REPORT = "Payments and Cash Control Report"


def _asked_rights():
	"""The report's own right and the right to read the closings it lists."""
	if not frappe.get_cached_doc("Report", REPORT).is_permitted():
		frappe.throw(_("You are not permitted to access this resource."), frappe.PermissionError)
	frappe.has_permission("POS Closing Shift", "read", throw=True)


def method_totals(rows, methods):
	"""What each payment method expected and counted over the closings: [{method, expected, counted, difference}]."""
	totals = []
	for method in methods:
		safe = method.lower().replace(" ", "_")
		expected = sum(flt(row.get(f"{safe}_expected")) for row in rows)
		counted = sum(flt(row.get(f"{safe}_closing")) for row in rows)
		totals.append(
			{"method": method, "expected": expected, "counted": counted, "difference": counted - expected}
		)
	return totals


def _signed(value):
	"""A difference: marked in red when there is one."""
	negative = ' class="cr-negative"' if round(flt(value), 2) else ""
	return f"<span{negative}>{cash_report.money(value)}</span>"


def build_html(rows, methods, currency):
	"""The body of the sheet: the figures, what each method held, then one line per closing."""
	esc = frappe.utils.escape_html
	expected = sum(flt(row.get("total_expected")) for row in rows)
	counted = sum(flt(row.get("total_closing")) for row in rows)
	difference = sum(flt(row.get("total_difference")) for row in rows)
	operations = sum(int(row.get("total_transactions") or 0) for row in rows)

	kpis = [
		cash_report.kpi_card(_("Closings"), str(len(rows)), f"{operations} {_('Operations')}"),
		cash_report.kpi_card(_("Expected"), f"{cash_report.money(expected)} {currency}"),
		cash_report.kpi_card(_("Counted"), f"{cash_report.money(counted)} {currency}"),
		cash_report.kpi_card(
			_("Difference"),
			f"{cash_report.money(difference)} {currency}",
			_("Balanced") if not round(difference, 2) else _("To check"),
			negative=bool(round(difference, 2)),
		),
	]
	html = '<table class="cr-kpis"><tr>' + "".join(kpis) + "</tr></table>"
	if not rows:
		return html + f'<div class="cr-empty">{esc(_("Nothing was recorded."))}</div>'

	html += f'<div class="cr-section">{esc(_("By {0}").format(_("Payment Method").lower()))}</div>'
	html += (
		'<table><colgroup><col style="width:40%"><col style="width:20%"><col style="width:20%">'
		'<col style="width:20%"></colgroup>'
		f'<thead><tr><th>{esc(_("Payment Method"))}</th><th class="text-right">{esc(_("Expected"))}</th>'
		f'<th class="text-right">{esc(_("Counted"))}</th><th class="text-right">{esc(_("Difference"))}</th>'
		"</tr></thead><tbody>"
	)
	for total in method_totals(rows, methods):
		html += (
			f"<tr><td>{esc(total['method'])}</td>"
			f'<td class="text-right">{cash_report.money(total["expected"])}</td>'
			f'<td class="text-right">{cash_report.money(total["counted"])}</td>'
			f'<td class="text-right">{_signed(total["difference"])}</td></tr>'
		)
	html += (
		f'<tr class="cr-sub"><td>{esc(_("Total"))}</td>'
		f'<td class="text-right">{cash_report.money(expected)}</td>'
		f'<td class="text-right">{cash_report.money(counted)}</td>'
		f'<td class="text-right">{_signed(difference)}</td></tr></tbody></table>'
	)

	columns = [
		(_("Closing"), 22, False),
		(_("Date"), 10, False),
		(_("POS Profile"), 14, False),
		(_("Cashier"), 14, False),
		(_("Operations"), 8, True),
		(_("Expected"), 11, True),
		(_("Counted"), 11, True),
		(_("Difference"), 10, True),
		(_("Status"), 11, False),
	]
	width = sum(column[1] for column in columns)
	html += f'<div class="cr-section">{esc(_("Detail"))}</div><table><colgroup>'
	html += "".join(f'<col style="width:{column[1] * 100 / width:.2f}%">' for column in columns)
	html += "</colgroup><thead><tr>"
	html += "".join(
		f'<th class="{"text-right" if column[2] else ""}">{esc(column[0])}</th>' for column in columns
	)
	html += "</tr></thead><tbody>"
	for row in rows:
		html += (
			f'<tr><td class="ellipsis">{esc(row.get("shift"))}</td>'
			f'<td class="no-wrap">{esc(formatdate(row.get("posting_date")) if row.get("posting_date") else "")}</td>'
			f'<td class="ellipsis">{esc(row.get("pos_profile"))}</td>'
			f'<td class="ellipsis">{esc(get_fullname(row.get("cashier")) or row.get("cashier") or "")}</td>'
			f'<td class="text-right">{int(row.get("total_transactions") or 0)}</td>'
			f'<td class="text-right">{cash_report.money(row.get("total_expected"))}</td>'
			f'<td class="text-right">{cash_report.money(row.get("total_closing"))}</td>'
			f'<td class="text-right">{_signed(row.get("total_difference"))}</td>'
			f'<td class="ellipsis">{esc(row.get("status"))}</td></tr>'
		)
	html += (
		f'<tr class="cr-grand"><td colspan="4">{esc(_("Total"))}</td>'
		f'<td class="text-right">{operations}</td>'
		f'<td class="text-right">{cash_report.money(expected)}</td>'
		f'<td class="text-right">{cash_report.money(counted)}</td>'
		f'<td class="text-right">{_signed(difference)}</td><td></td></tr></tbody></table>'
	)
	return html


def subtitle_of(filters, rows, currency):
	"""The line under the title: the period, the filters it is narrowed by, the currency, the day it was printed."""
	days = [row.get("posting_date") for row in rows if row.get("posting_date")]
	start = filters.get("from_date") or (min(days) if days else None)
	end = filters.get("to_date") or (max(days) if days else None)
	parts = []
	if start or end:
		parts.append(f"{_('Period')}: {formatdate(start)}{cash_report.RANGE}{formatdate(end)}")
	if filters.get("pos_profile"):
		parts.append(f"{_('POS Profile')}: {filters['pos_profile']}")
	if filters.get("cashier"):
		parts.append(f"{_('Cashier')}: {get_fullname(filters['cashier']) or filters['cashier']}")
	if filters.get("mode_of_payment"):
		parts.append(f"{_('Payment Method')}: {filters['mode_of_payment']}")
	if currency:
		parts.append(_("Amounts in {0}").format(currency))
	parts.append(f"{_('Printed on')} {formatdate(frappe.utils.today())}")
	return " · ".join(parts)


@frappe.whitelist()
def export_closings_pdf(filters):
	"""The closings of a period as a cash control sheet on A4 paper (shown in the browser): one line per closing."""
	_asked_rights()

	filters = frappe._dict(frappe.parse_json(filters) or {})
	rows, methods = report.get_data(filters)
	names = [row.get("shift") for row in rows]
	companies = (
		frappe.get_all("POS Closing Shift", filters={"name": ["in", names]}, pluck="company", distinct=True)
		if names
		else []
	)
	company = frappe.get_cached_doc("Company", companies[0]) if companies else None
	currency = (company.default_currency if company else "") or ""
	owner = ", ".join(sorted(set(companies)))

	pdf = cash_report.render_pdf(
		build_html(rows, methods, currency),
		owner,
		_("Cash control"),
		subtitle_of(filters, rows, currency),
	)
	start = filters.get("from_date") or "all"
	end = filters.get("to_date") or "all"
	cash_report.respond(pdf, f"cash_control_{frappe.scrub(f'{start}_{end}')}.pdf")


@frappe.whitelist()
def export_closing_pdf(closing):
	"""The cash report of ONE closing (the register narrowed to what it counted, with its cash control), as the sheet the
	closing form prints: for whoever may read the Payments and Cash Control report and that closing."""
	from pos_next.pos_next.report.neopos_register import neopos_register

	_asked_rights()
	frappe.has_permission("POS Closing Shift", "read", closing, throw=True)

	cash_report.respond(*neopos_register.render_sheet(frappe._dict(pos_closing_shift=closing)))
