# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, today


@frappe.whitelist()
def get_cash_entry_templates(company, pos_profile=None):
	"""Fetch Journal Entry Templates available for cash in/out operations."""
	# Check if POS Profile has specific templates configured
	allowed_templates = []
	if pos_profile:
		allowed_templates = frappe.get_all(
			"POS Cash Entry Template",
			filters={"parent": pos_profile, "parenttype": "POS Profile"},
			pluck="journal_entry_template",
		)

	filters = {"company": company}
	if allowed_templates:
		filters["name"] = ["in", allowed_templates]

	templates = frappe.get_all(
		"Journal Entry Template",
		filters=filters,
		fields=["name", "template_title", "voucher_type"],
	)

	for t in templates:
		# Get totalization accounts (source side, typically cash)
		t["totalization"] = frappe.get_all(
			"Accounting Entry Totalization",
			filters={"parent": t["name"]},
			fields=["account"],
			order_by="idx asc",
		)
		# Get counterparty accounts (destination side)
		t["counterparty"] = frappe.get_all(
			"Accounting Entry Counterparty",
			filters={"parent": t["name"]},
			fields=["account"],
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
	company = shift.company
	cost_center = frappe.get_cached_value("Company", company, "cost_center")

	# Get POS cash account
	cash_mode = _get_cash_mode(shift.pos_profile)
	cash_account = _get_cash_account(cash_mode, company)

	# Determine accounts from template structure
	# totalization = source account (typically cash), counterparty = destination
	totalization_accounts = template.get("accounting_entry_totalization", [])
	counterparty_accounts = template.get("accounting_entry_counterparty", [])

	if totalization_accounts and counterparty_accounts:
		# Custom template structure (ERPNext Swiss)
		source_account = totalization_accounts[0].account
		dest_account = counterparty_accounts[0].account
	elif template.accounts:
		# Standard template structure (fallback)
		source_account = cash_account
		dest_account = template.accounts[0].account
	else:
		frappe.throw(_("Template has no accounts configured"))

	# Determine direction: if source is the cash account, money leaves → Cash Out
	# If destination is the cash account, money enters → Cash In
	is_cash_out = _is_cash_account(source_account, cash_account)
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

	# Debit the destination, credit the source (for Cash Out)
	# For Cash In, reverse: debit source, credit destination
	jv.append("accounts", {
		"account": dest_account,
		"debit_in_account_currency": amount if is_cash_out else 0,
		"credit_in_account_currency": 0 if is_cash_out else amount,
		"cost_center": cost_center,
	})

	jv.append("accounts", {
		"account": source_account,
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
		"account": dest_account if is_cash_out else source_account,
	}


def _is_cash_account(account, pos_cash_account):
	"""Check if an account is a cash-type account or matches the POS cash account."""
	if account == pos_cash_account:
		return True
	account_type = frappe.get_cached_value("Account", account, "account_type")
	return account_type == "Cash"


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
