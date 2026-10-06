# -*- coding: utf-8 -*-
# //// Neoffice — added file (no upstream equivalent). Upstream can only print the end-of-day
# //// report. Here the report is also kept as a PDF attached to the POS Closing Shift, and can
# //// be sent by e-mail, so it can be found and forwarded without a printer
# //// (neoffice-maintenance#1235).
import frappe
from frappe import _
from frappe.utils import validate_email_address

EOD_PRINT_FORMAT = "POS Next EOD Report"


def _file_name(closing_shift):
	return f"{closing_shift}-end-of-day-report.pdf"


def _require_closing_shift_access(closing_shift):
	"""Same gate as the till's money endpoints: a desk account that may work at this till."""
	from pos_next.api.cash_entry import require_till_access

	pos_profile = frappe.db.get_value("POS Closing Shift", closing_shift, "pos_profile")
	if pos_profile is None and not frappe.db.exists("POS Closing Shift", closing_shift):
		frappe.throw(_("Closing shift not found"), frappe.DoesNotExistError)
	require_till_access(pos_profile)


def _parse_recipients(recipients):
	if isinstance(recipients, str):
		recipients = [r.strip() for r in recipients.replace(";", ",").replace("\n", ",").split(",") if r.strip()]
	return [validate_email_address(r, throw=True) for r in recipients or []]


def _send(closing_shift, recipients, message=None):
	"""Send the report through Frappe's Communication, so it shows on the shift's timeline."""
	company = frappe.db.get_value("POS Closing Shift", closing_shift, "company") or ""
	from frappe.core.doctype.communication.email import make

	# A cashier may lack e-mail rights on the document; the callers gate access themselves.
	previous = frappe.flags.ignore_permissions
	frappe.flags.ignore_permissions = True
	try:
		make(
			doctype="POS Closing Shift",
			name=closing_shift,
			subject=_("End-of-day report {0} - {1}").format(closing_shift, company),
			content=message or _("Please find the end-of-day report attached."),
			recipients=",".join(recipients),
			send_email=True,
			attachments=[
				{
					"print_format_attachment": 1,
					"doctype": "POS Closing Shift",
					"name": closing_shift,
					"print_format": EOD_PRINT_FORMAT,
					"html": None,
					"lang": frappe.local.lang,
				}
			],
		)
	finally:
		frappe.flags.ignore_permissions = previous


def _configured_recipients(pos_profile):
	"""(recipients, automatic) from the POS Settings of the profile."""
	row = frappe.db.get_value(
		"POS Settings",
		{"pos_profile": pos_profile},
		["eod_email_recipients", "eod_email_auto"],
		as_dict=True,
	)
	if not row:
		return [], False
	try:
		recipients = _parse_recipients(row.eod_email_recipients or "")
	except Exception:
		recipients = []
	return recipients, bool(row.eod_email_auto)


def after_close(closing_shift):
	"""Background job: attach the PDF, then send it when the profile asks for it.

	A failure never reaches the cashier: the shift is already closed, and the report can
	still be printed or sent by hand.
	"""
	attach_pdf(closing_shift)
	try:
		pos_profile = frappe.db.get_value("POS Closing Shift", closing_shift, "pos_profile")
		recipients, automatic = _configured_recipients(pos_profile)
		if automatic and recipients:
			_send(closing_shift, recipients)
	except Exception:
		frappe.log_error(
			f"EOD e-mail not sent for {closing_shift}"[:140],
			frappe.get_traceback(),
		)


def attach_pdf(closing_shift):
	"""Render the end-of-day report and attach it, privately, to its POS Closing Shift.

	Idempotent: it can be re-run by hand.
	"""
	try:
		if frappe.db.exists(
			"File",
			{
				"attached_to_doctype": "POS Closing Shift",
				"attached_to_name": closing_shift,
				"file_name": _file_name(closing_shift),
			},
		):
			return
		pdf = frappe.get_print(
			"POS Closing Shift",
			closing_shift,
			print_format=EOD_PRINT_FORMAT,
			as_pdf=True,
			no_letterhead=1,
		)
		frappe.get_doc(
			{
				"doctype": "File",
				"file_name": _file_name(closing_shift),
				"attached_to_doctype": "POS Closing Shift",
				"attached_to_name": closing_shift,
				"is_private": 1,
				"content": pdf,
			}
		).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(
			f"EOD PDF not attached to {closing_shift}"[:140],
			frappe.get_traceback(),
		)


def enqueue_after_close(doc, method=None):
	"""doc_events hook: do the PDF and the e-mail in the background so closing stays fast."""
	frappe.enqueue(
		"pos_next.api.eod_report.after_close",
		closing_shift=doc.name,
		queue="short",
		enqueue_after_commit=True,
	)


@frappe.whitelist()
def get_eod_email_defaults(closing_shift=None):
	"""Recipients pre-filled in the e-mail form: the profile's configured list, else the
	signed-in user's own address."""
	configured = []
	if closing_shift:
		_require_closing_shift_access(closing_shift)
		pos_profile = frappe.db.get_value("POS Closing Shift", closing_shift, "pos_profile")
		configured, _automatic = _configured_recipients(pos_profile)
	own = frappe.db.get_value("User", frappe.session.user, "email") or ""
	return {"recipients": ", ".join(configured) or own}


@frappe.whitelist()
def send_eod_email(closing_shift, recipients, message=None):
	"""E-mail the end-of-day report (PDF) of a closing shift."""
	if not closing_shift or not recipients:
		frappe.throw(_("Closing shift and recipients are required"))
	_require_closing_shift_access(closing_shift)
	recipients = _parse_recipients(recipients)
	if not recipients:
		frappe.throw(_("Closing shift and recipients are required"))
	_send(closing_shift, recipients, message)
	return {"success": True, "recipients": recipients}
