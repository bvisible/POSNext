# -*- coding: utf-8 -*-
import frappe
from frappe import _


@frappe.whitelist()
def send_invoice_email(invoice_name, recipients, subject=None, message=None, print_format=None):
	"""Send a Sales Invoice by email with PDF attachment.

	Uses Frappe's Communication system so the email is tracked
	on the Sales Invoice timeline.
	"""
	if not invoice_name or not recipients:
		frappe.throw(_("Invoice name and recipients are required"))

	# Validate invoice exists and user has access
	if not frappe.has_permission("Sales Invoice", doc=invoice_name, ptype="email"):
		frappe.throw(_("You don't have permission to email this invoice"), frappe.PermissionError)

	# Resolve print format from POS Profile if not provided
	if not print_format:
		pos_profile = frappe.db.get_value("Sales Invoice", invoice_name, "pos_profile")
		if pos_profile:
			print_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")
		if not print_format:
			print_format = "Neopos Receipt"

	# Build default subject/message if not provided
	if not subject:
		company = frappe.db.get_value("Sales Invoice", invoice_name, "company")
		subject = _("Invoice {0} from {1}").format(invoice_name, company or "")

	if not message:
		message = _("Please find your invoice attached.")

	# Normalize recipients to comma-separated string
	if isinstance(recipients, list):
		recipients = ",".join(recipients)

	# Use Frappe's Communication email system
	from frappe.core.doctype.communication.email import make

	comm = make(
		doctype="Sales Invoice",
		name=invoice_name,
		subject=subject,
		content=message,
		recipients=recipients,
		send_email=True,
		print_format=print_format,
		print_letterhead=True,
	)

	return {
		"success": True,
		"communication": comm.get("name") if isinstance(comm, dict) else comm,
		"message": _("Email sent successfully to {0}").format(recipients),
	}


@frappe.whitelist()
def get_invoice_email_context(invoice_name):
	"""Get pre-filled email context for an invoice (recipient, subject, etc.)."""
	if not invoice_name:
		frappe.throw(_("Invoice name is required"))

	inv = frappe.db.get_value(
		"Sales Invoice",
		invoice_name,
		["customer", "customer_name", "company", "grand_total", "currency", "pos_profile"],
		as_dict=True,
	)
	if not inv:
		frappe.throw(_("Invoice not found"))

	# Get customer email
	customer_email = frappe.db.get_value("Customer", inv.customer, "email_id") or ""

	# Get print format from POS Profile
	print_format = ""
	if inv.pos_profile:
		print_format = frappe.db.get_value("POS Profile", inv.pos_profile, "print_format") or ""
	if not print_format:
		print_format = "Neopos Receipt"

	# Build default subject and message
	subject = _("Invoice {0} from {1}").format(invoice_name, inv.company or "")
	message = _("Dear {0},\n\nPlease find attached your invoice {1} for {2} {3}.\n\nThank you for your business.").format(
		inv.customer_name or inv.customer,
		invoice_name,
		inv.currency or "CHF",
		frappe.utils.fmt_money(inv.grand_total, currency=inv.currency),
	)

	return {
		"recipient": customer_email,
		"subject": subject,
		"message": message,
		"print_format": print_format,
		"customer_name": inv.customer_name or inv.customer,
	}
