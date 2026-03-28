# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, today


@frappe.whitelist()
def get_cash_entry_templates(company):
	"""Fetch Journal Entry Templates available for cash in/out operations."""
	templates = frappe.get_all(
		"Journal Entry Template",
		filters={"company": company},
		fields=["name", "template_title", "voucher_type"],
	)

	for t in templates:
		t["accounts"] = frappe.get_all(
			"Journal Entry Template Detail",
			filters={"parent": t["name"]},
			fields=["account", "debit", "credit"],
			order_by="idx asc",
		)

	return templates


@frappe.whitelist()
def create_cash_entry(pos_opening_shift, template_name, amount, remark=None):
	"""Create a Journal Entry for a cash in/out operation from the POS."""
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero"))

	# Validate shift is open
	shift = frappe.get_doc("POS Opening Shift", pos_opening_shift)
	if shift.status != "Open" or shift.pos_closing_shift:
		frappe.throw(_("Shift is not open"))

	# Get template
	template = frappe.get_doc("Journal Entry Template", template_name)
	template_accounts = template.accounts
	if not template_accounts:
		frappe.throw(_("Template has no accounts"))

	# Get POS cash account
	company = shift.company
	cash_mode = _get_cash_mode(shift.pos_profile)
	cash_account = _get_cash_account(cash_mode, company)

	cost_center = frappe.get_cached_value("Company", company, "cost_center")

	# Determine direction from template first account row
	template_row = template_accounts[0]
	is_cash_out = flt(template_row.debit) > 0
	direction = "out" if is_cash_out else "in"

	# Sanitize remark (remove pipe chars)
	if remark:
		remark = remark.replace("|", " ")

	# Build structured user_remark for shift tracking
	template_label = template.template_title or template.name
	user_remark = f"POS Cash Entry|{pos_opening_shift}|{direction}|{template_label}"
	if remark:
		user_remark += f"|{remark}"

	# Build Journal Entry
	jv = frappe.get_doc({
		"doctype": "Journal Entry",
		"voucher_type": template.voucher_type or "Journal Entry",
		"posting_date": today(),
		"company": company,
		"user_remark": user_remark,
	})

	# Template account row (counterpart)
	jv.append("accounts", {
		"account": template_row.account,
		"debit_in_account_currency": amount if is_cash_out else 0,
		"credit_in_account_currency": 0 if is_cash_out else amount,
		"cost_center": cost_center,
	})

	# Cash account row
	jv.append("accounts", {
		"account": cash_account,
		"debit_in_account_currency": 0 if is_cash_out else amount,
		"credit_in_account_currency": amount if is_cash_out else 0,
		"cost_center": cost_center,
	})

	jv.flags.ignore_permissions = True
	jv.save()
	jv.submit()

	return {
		"name": jv.name,
		"direction": direction,
		"amount": amount,
		"template": template_label,
		"account": template_row.account,
	}


@frappe.whitelist()
def get_cash_entries(pos_opening_shift):
	"""Get all cash in/out entries for a shift."""
	entries = frappe.get_all(
		"Journal Entry",
		filters={
			"docstatus": 1,
			"user_remark": ["like", f"POS Cash Entry|{pos_opening_shift}|%"],
		},
		fields=["name", "posting_date", "total_debit", "user_remark", "creation"],
		order_by="creation asc",
	)

	result = []
	for e in entries:
		parts = (e.user_remark or "").split("|")
		direction = parts[2] if len(parts) > 2 else "unknown"
		template = parts[3] if len(parts) > 3 else ""
		note = parts[4] if len(parts) > 4 else ""

		result.append({
			"name": e.name,
			"posting_date": str(e.posting_date),
			"amount": flt(e.total_debit),
			"direction": direction,
			"template": template,
			"note": note,
			"creation": str(e.creation),
		})

	return result


def _get_cash_mode(pos_profile):
	"""Get cash mode of payment for a POS profile."""
	from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import (
		_get_cash_mode_of_payment,
	)
	return _get_cash_mode_of_payment(pos_profile)


def _get_cash_account(mode_of_payment, company):
	"""Get cash GL account for the mode of payment."""
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import (
		get_bank_cash_account,
	)

	account_info = get_bank_cash_account(mode_of_payment, company)
	if account_info and account_info.get("account"):
		return account_info["account"]

	# Fallback to company default cash account
	account = frappe.get_cached_value("Company", company, "default_cash_account")
	if account:
		return account

	frappe.throw(
		_("Could not determine cash account for {0}").format(mode_of_payment)
	)
