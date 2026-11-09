# //// Neoffice — added file (no upstream equivalent). The printed cash report: what a till journal says,
# //// laid out for an A4 sheet in landscape, in the accounting profile of the Oslo documents (the font, the dense
# //// table and the header of erpnextswiss.report_pdf_utils, which the VAT report prints with too). It is made of the
# //// register's own entries (neopos_register.get_entries), so the sheet and the screen never disagree, for a period
# //// or for one closing.
# Copyright (c) 2026, Neoffice and contributors
# For license information, please see license.txt

"""The cash report: the register of a period or of one closing, printed.

The register has ten columns and groups on screen; a bookkeeper wants one line per operation with the date, the
document, the customer, the till, the cashier, the total and how it was paid, grouped by payment method, with the
figures that matter first: what was collected, by which method, and (for a closing) what the cash drawer says.

`build_html` is a pure function of the entries it is given (no query, no file), so the layout is tested without a
database; `render_pdf` only puts the accounting profile around it and asks Frappe for the PDF. The tables use no
flexbox and no grid: the PDF engine of the bench (wkhtmltopdf) does not know them.
"""

import frappe
from frappe import _
from frappe.utils import flt, fmt_money, formatdate, get_fullname

# The columns of the detail, in the order they print: (field, label, width in %, numeric). The column a sheet is
# grouped by is left out (its value is the heading of the group).
COLUMNS = (
	("posting_date", "Posting Date", 8, False),
	("sales_invoice", "Reference", 15, False),
	("customer", "Customer", 21, False),
	("pos_profile", "POS Profile", 13, False),
	("owner", "Cashier", 15, False),
	("mode_of_payment", "Payment Method", 12, False),
	("grand_total", "Grand Total", 8, True),
	("paid_amount", "Paid Amount", 8, True),
)

# Between the two dates of a period
RANGE = " \u2013 "

# What the sheet may be grouped by (the register's own group-by fields).
GROUP_FIELDS = ("mode_of_payment", "pos_profile", "owner", "customer", "transaction_type")

# The accounting profile's own stylesheet is erpnextswiss's; where that app is not installed (the CI of this app), a
# plain one with the same rules keeps the sheet readable.
FALLBACK_CSS = (
	"<style>*{font-family:Arial,'Liberation Sans',Helvetica,sans-serif !important}"
	"body{font-size:9px;color:#1a1a1a;margin:0;padding:0}"
	".print-format{margin:8mm 6mm 12mm 10mm}div.print-format{margin:0 !important;padding:0 !important}"
	".report-header{margin-bottom:10px;border-bottom:1px solid #ccc;padding-bottom:5px}"
	".report-header .company-name,.report-header .title{font-weight:bold;font-size:12px}"
	".report-header .subtitle{color:#555;margin-top:2px}"
	"table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}"
	"th{padding:2px 3px;text-align:left;font-weight:bold;background:#f0f0f0;border-bottom:1px solid #ccc}"
	"td{padding:1px 3px;vertical-align:top}.text-right{text-align:right}</style>"
)

SHEET_CSS = """<style>
.cr-kpis{width:100%;border-collapse:separate;border-spacing:8px 0;margin:6px -8px 4px;table-layout:fixed}
.cr-kpi{border:1px solid #d6d6d6;padding:6px 9px;background:#fafafa}
.cr-kpi-label{font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:#6b6b6b}
.cr-kpi-value{font-size:15px;font-weight:bold;margin-top:2px;white-space:nowrap}
.cr-kpi-note{font-size:7.5px;color:#6b6b6b;margin-top:1px}
.cr-negative{color:#a4312a}
.cr-section{font-size:10px;font-weight:bold;margin:13px 0 4px;padding-bottom:2px;border-bottom:1px solid #1a1a1a}
.cr-note{font-size:8px;color:#6b6b6b;margin:0 0 3px}
.cr-track{background:#ececec;height:6px;width:100%}
.cr-bar{background:#1a1a1a;height:6px}
.cr-group td{background:#e9e9e9 !important;font-weight:bold;border-top:1px solid #8a8a8a;padding-top:3px !important}
.cr-sub td{font-weight:bold;border-top:1px solid #1a1a1a;background:#fff !important}
.cr-grand td{font-weight:bold;font-size:10px;border-top:2px solid #1a1a1a;background:#fff !important}
.cr-tag{font-size:6.5px;color:#555;border:1px solid #b5b5b5;padding:0 3px;margin-left:4px;white-space:nowrap}
.cr-empty{color:#6b6b6b;padding:10px 0}
.cr-spacer td{border:0 !important;padding:3px !important;background:#fff !important}
tr{page-break-inside:avoid}
.cr-group{page-break-after:avoid}
</style>"""


def money(value):
	"""A figure the way the site writes numbers (the Swiss thousands separator), always two decimals, no symbol.

	Not `format_value` of a Float: it writes a whole figure without its decimals (16 for 16.00), and a column of money
	that changes its look from one line to the next cannot be added up by eye."""
	return fmt_money(flt(value), 2)


def _esc(value):
	return frappe.utils.escape_html(str(value if value is not None else ""))


def group_field(group_by_field):
	"""The field a sheet groups by: the payment method unless the register groups by another of its own fields."""
	return group_by_field if group_by_field in GROUP_FIELDS else "mode_of_payment"


def operations(entries):
	"""How many documents the entries come from (an invoice paid with two methods is one operation)."""
	return len({(entry.get("transaction_type"), entry.get("sales_invoice")) for entry in entries})


def summarize(entries, field):
	"""The entries per value of `field`: [{key, entries, paid, total}], the most collected first.

	`paid` adds what was paid on each line; `total` adds the documents' grand totals, which counts a document paid
	with two methods twice, so it is only ever shown where the sheet is not grouped by method."""
	groups = {}
	for entry in entries:
		key = entry.get(field) or _("Unknown")
		groups.setdefault(key, []).append(entry)
	summary = [
		{
			"key": key,
			"entries": rows,
			"paid": sum(flt(row.get("paid_amount")) for row in rows),
			"total": sum(flt(row.get("grand_total")) for row in rows),
		}
		for key, rows in groups.items()
	]
	summary.sort(key=lambda group: (-group["paid"], str(group["key"])))
	return summary


def _label_of(field, value):
	if field == "owner" and value:
		return get_fullname(value) or value
	return value


def _cell(entry, field):
	value = entry.get(field)
	if field == "posting_date":
		return _esc(formatdate(value)) if value else ""
	if field == "owner":
		return _esc(_label_of("owner", value))
	if field == "sales_invoice":
		tag = ""
		if entry.get("is_return"):
			tag = _("Return")
		elif entry.get("transaction_type") and entry["transaction_type"] != _("POS Sale"):
			tag = entry["transaction_type"]
		return _esc(value) + (f'<span class="cr-tag">{_esc(tag)}</span>' if tag else "")
	if field in ("grand_total", "paid_amount"):
		negative = ' class="cr-negative"' if flt(value) < 0 else ""
		return f"<span{negative}>{money(value)}</span>"
	return _esc(value)


def _kpi(label, value, note="", negative=False):
	css = " cr-negative" if negative else ""
	return (
		'<td class="cr-kpi">'
		f'<div class="cr-kpi-label">{_esc(label)}</div>'
		f'<div class="cr-kpi-value{css}">{_esc(value)}</div>'
		+ (f'<div class="cr-kpi-note">{_esc(note)}</div>' if note else "")
		+ "</td>"
	)


def summary_block(entries, currency, closing=None):
	"""The figures that come first: the KPIs, then what each payment method collected, with its share."""
	by_method = summarize(entries, "mode_of_payment")
	collected = sum(group["paid"] for group in by_method)
	returns = [entry for entry in entries if entry.get("is_return")]
	kpis = [
		_kpi(_("Collected"), f"{money(collected)} {currency}", negative=collected < 0),
		_kpi(_("Operations"), str(operations(entries)), _("{0} payment methods").format(len(by_method))),
	]
	if returns:
		kpis.append(
			_kpi(
				_("Returns"),
				f"{money(sum(flt(r.get('paid_amount')) for r in returns))} {currency}",
				_("{0} documents").format(operations(returns)),
				negative=True,
			)
		)
	if closing is not None:
		difference = sum(flt(row.difference) for row in closing.payment_reconciliation or [])
		kpis.append(
			_kpi(
				_("Cash difference"),
				f"{money(difference)} {currency}",
				_("Balanced") if not round(difference, 2) else _("To check"),
				negative=bool(round(difference, 2)),
			)
		)
	html = '<table class="cr-kpis"><tr>' + "".join(kpis) + "</tr></table>"

	html += f'<div class="cr-section">{_esc(_("By payment method"))}</div>'
	html += (
		'<table><colgroup><col style="width:34%"><col style="width:12%"><col style="width:16%">'
		'<col style="width:8%"><col style="width:30%"></colgroup>'
		f'<thead><tr><th>{_esc(_("Payment Method"))}</th><th class="text-right">{_esc(_("Operations"))}</th>'
		f'<th class="text-right">{_esc(_("Paid Amount"))}</th><th class="text-right">%</th><th></th></tr></thead><tbody>'
	)
	for group in by_method:
		share = (group["paid"] / collected * 100) if collected else 0
		bar = max(0, min(100, share))
		html += (
			f'<tr><td>{_esc(group["key"])}</td><td class="text-right">{operations(group["entries"])}</td>'
			f'<td class="text-right">{money(group["paid"])}</td><td class="text-right">{round(share, 1)}</td>'
			f'<td><div class="cr-track"><div class="cr-bar" style="width:{bar}%"></div></div></td></tr>'
		)
	html += (
		f'<tr class="cr-sub"><td>{_esc(_("Total"))}</td><td class="text-right">{operations(entries)}</td>'
		f'<td class="text-right">{money(collected)}</td><td></td><td></td></tr></tbody></table>'
	)
	return html


def reconciliation_block(closing, currency):
	"""What the drawer says, per payment method, for the closing the sheet is about."""
	rows = closing.payment_reconciliation or []
	if not rows:
		return ""
	html = f'<div class="cr-section">{_esc(_("Cash control"))}</div>'
	html += (
		'<table><colgroup><col style="width:34%"><col style="width:16.5%"><col style="width:16.5%">'
		'<col style="width:16.5%"><col style="width:16.5%"></colgroup>'
		f'<thead><tr><th>{_esc(_("Payment Method"))}</th><th class="text-right">{_esc(_("Opening"))}</th>'
		f'<th class="text-right">{_esc(_("Expected"))}</th><th class="text-right">{_esc(_("Counted"))}</th>'
		f'<th class="text-right">{_esc(_("Difference"))}</th></tr></thead><tbody>'
	)
	totals = [0, 0, 0, 0]
	for row in rows:
		figures = [
			flt(row.opening_amount),
			flt(row.expected_amount),
			flt(row.closing_amount),
			flt(row.difference),
		]
		totals = [total + figure for total, figure in zip(totals, figures, strict=True)]
		negative = ' class="cr-negative"' if round(figures[3], 2) else ""
		html += (
			f"<tr><td>{_esc(row.mode_of_payment)}</td>"
			f'<td class="text-right">{money(figures[0])}</td><td class="text-right">{money(figures[1])}</td>'
			f'<td class="text-right">{money(figures[2])}</td>'
			f'<td class="text-right"><span{negative}>{money(figures[3])}</span></td></tr>'
		)
	html += (
		f'<tr class="cr-sub"><td>{_esc(_("Total"))} ({_esc(currency)})</td>'
		+ "".join(f'<td class="text-right">{money(total)}</td>' for total in totals)
		+ "</tr></tbody></table>"
	)
	return html


def detail_block(entries, field):
	"""One line per operation, grouped by `field`, a subtotal under each group, the grand total at the end."""
	columns = [column for column in COLUMNS if column[0] != field]
	count = len(columns)
	html = f'<div class="cr-section">{_esc(_("Detail"))}</div>'
	if not entries:
		return html + f'<div class="cr-empty">{_esc(_("Nothing was recorded."))}</div>'
	width = sum(column[2] for column in columns)
	html += "<table><colgroup>"
	html += "".join(f'<col style="width:{column[2] * 100 / width:.2f}%">' for column in columns)
	html += "</colgroup><thead><tr>"
	html += "".join(
		f'<th class="{"text-right" if column[3] else ""}">{_esc(_(column[1]))}</th>' for column in columns
	)
	html += "</tr></thead><tbody>"
	# On a sheet grouped by method the documents' totals are not added: a document paid with two methods would count twice.
	adds_totals = field != "mode_of_payment"
	money_columns = [i for i, column in enumerate(columns) if column[3]]
	for group in summarize(entries, field):
		label = _label_of(field, group["key"])
		html += (
			f'<tr class="cr-group"><td colspan="{count}">{_esc(label)}'
			f' <span class="cr-note" style="font-weight:normal">— {operations(group["entries"])} '
			f'{_esc(_("Operations"))}</span></td></tr>'
		)
		for entry in sorted(
			group["entries"], key=lambda e: (str(e.get("posting_date")), str(e.get("sales_invoice")))
		):
			html += "<tr>"
			for column in columns:
				css = (
					"text-right" if column[3] else ("no-wrap" if column[0] == "posting_date" else "ellipsis")
				)
				html += f'<td class="{css}">{_cell(entry, column[0])}</td>'
			html += "</tr>"
		html += f'<tr class="cr-sub"><td colspan="{count - len(money_columns)}">{_esc(_("Subtotal"))} {_esc(label)}</td>'
		for i in money_columns:
			shown = columns[i][0] == "paid_amount" or adds_totals
			value = group["paid"] if columns[i][0] == "paid_amount" else group["total"]
			html += f'<td class="text-right">{money(value) if shown else ""}</td>'
		html += '</tr><tr class="cr-spacer"><td colspan="' + str(count) + '"></td></tr>'
	paid = sum(flt(entry.get("paid_amount")) for entry in entries)
	total = sum(flt(entry.get("grand_total")) for entry in entries)
	html += f'<tr class="cr-grand"><td colspan="{count - len(money_columns)}">{_esc(_("Total"))}</td>'
	for i in money_columns:
		if columns[i][0] == "paid_amount":
			html += f'<td class="text-right">{money(paid)}</td>'
		else:
			html += f'<td class="text-right">{money(total) if adds_totals else ""}</td>'
	html += "</tr></tbody></table>"
	return html


def build_html(entries, summary_entries, field, closing=None, currency=""):
	"""The body of the sheet: figures first, the drawer's control for a closing, then the detail."""
	return (
		summary_block(summary_entries, currency, closing)
		+ (reconciliation_block(closing, currency) if closing is not None else "")
		+ detail_block(entries, field)
	)


def subtitle_of(filters, closing=None, currency=""):
	"""The line under the title: the period or the closing, then the filters the sheet is narrowed by."""
	parts = []
	if closing is not None:
		parts.append(f"{_('Closing')} {closing.name}")
		if closing.get("pos_profile"):
			parts.append(closing.get("pos_profile"))
		if closing.get("user"):
			parts.append(get_fullname(closing.get("user")) or closing.get("user"))
		if filters.get("from_date"):
			parts.append(f"{formatdate(filters.get('from_date'))}{RANGE}{formatdate(filters.get('to_date'))}")
	else:
		parts.append(
			f"{_('Period')}: {formatdate(filters.get('from_date'))}{RANGE}{formatdate(filters.get('to_date'))}"
		)
	if filters.get("pos_profile"):
		parts.append(f"{_('POS Profile')}: {filters['pos_profile']}")
	if filters.get("cashier"):
		parts.append(f"{_('Cashier')}: {get_fullname(filters['cashier']) or filters['cashier']}")
	if filters.get("customer"):
		parts.append(f"{_('Customer')}: {filters['customer']}")
	if filters.get("mode_of_payment"):
		parts.append(f"{_('Payment Method')}: {filters['mode_of_payment']}")
	if filters.get("transaction_type"):
		parts.append(f"{_('Transaction Type')}: {_(filters['transaction_type'])}")
	if currency:
		parts.append(_("Amounts in {0}").format(currency))
	parts.append(f"{_('Printed on')} {formatdate(frappe.utils.today())}")
	return " · ".join(part for part in parts if part)


def stylesheet():
	"""The accounting profile's stylesheet (page margins included), the fallback where erpnextswiss is absent."""
	try:
		from erpnextswiss.erpnextswiss.report_pdf_utils import accounting_pdf_css

		return accounting_pdf_css(9, {"top": "8mm", "bottom": "12mm", "left": "10mm", "right": "6mm"})
	except ImportError:
		return FALLBACK_CSS


def render_pdf(body_html, company, title, subtitle):
	"""The sheet as PDF bytes: A4 in landscape, the page number in the footer."""
	from frappe.utils.pdf import get_pdf

	header = (
		'<div class="report-header">'
		f'<div class="company-name">{_esc(company)}</div><div class="title">{_esc(title)}</div>'
		f'<div class="subtitle">{_esc(subtitle)}</div></div>'
	)
	html = (
		'<!doctype html><html><head><meta charset="utf-8">'
		+ stylesheet()
		+ SHEET_CSS
		+ '</head><body><div class="print-format">'
		+ header
		+ body_html
		+ "</div></body></html>"
	)
	return get_pdf(
		html,
		{
			"orientation": "Landscape",
			"page-size": "A4",
			"encoding": "UTF-8",
			"no-outline": None,
			"footer-right": _("Page [page] / [topage]"),
			"footer-font-size": "7",
			"footer-spacing": "2",
		},
	)
