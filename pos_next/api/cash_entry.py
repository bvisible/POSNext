# //// Neoffice — added file (no upstream equivalent). Upstream POSNext has no cash in / cash
# //// out: a till float taken out or a change fund put in had to be booked by hand in the ERP,
# //// so the shift closing never matched the drawer. Movements are posted as submitted Journal
# //// Entries built from Journal Entry Templates, following the erpnextswiss template
# //// structure (totalization / counterparty accounts) and restricted to the templates the
# //// POS Profile allows (6c598630 2026-03-28 "feat: cash in/out from POS using Journal Entry
# //// Templates"; 9cb47184, ee6587a0, 2e2ef1a0, 82b2493a the same day).
# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, today


# //// Neoffice — added function (no upstream equivalent). Whoever may work at the named till: a desk
# //// account assigned to the POS Profile, or reading sales invoices as every cashier does, or a till
# //// manager (TILL_MANAGER_ROLES), who works at any till. The till's money endpoints (cash in/out,
# //// customer credit) and its read endpoints (settings, payment methods, taxes, approvers...) use
# //// it; those whose POS Profile may be blank pass profile_optional=True: without a profile only
# //// the desk-account half applies, and their blank-profile answer is unchanged.
def require_till_access(pos_profile, profile_optional=False):
	from pos_next.api.partial_payments import _has_pos_profile_access

	require_system_user()
	if profile_optional and not pos_profile:
		return
	if not pos_profile:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if is_till_manager():
		return
	if not _has_pos_profile_access(pos_profile):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added function (no upstream equivalent). Whether the session user is a desk account:
# //// the one rule every gate of the till and of the restaurant reads (require_system_user,
# //// is_till_manager, pos_next.restaurant.permissions). A visitor or a portal account (Website User) is
# //// not, whatever roles it was given. Administrator is a desk account by construction (frappe fixes
# //// its user_type), so it is answered without a lookup.
def is_desk_account():
	user = frappe.session.user
	if user == "Administrator":
		return True
	return user != "Guest" and frappe.get_cached_value("User", user, "user_type") == "System User"


# //// Neoffice — added function (no upstream equivalent). The desk-account half of
# //// require_till_access, for the till's endpoints that name no POS Profile: a visitor or a portal
# //// account (Website User) is refused (is_desk_account).
def require_system_user():
	if not is_desk_account():
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added (no upstream equivalent). The roles that run every till, not just the ones
# //// they are assigned to: the fork's till manager, the customer's own administrator (Admin; System
# //// Manager is held by our Administrator alone, so an admin capability is never gated on it alone)
# //// and System Manager. The one list of them: a new manager role is added here.
TILL_MANAGER_ROLES = ("Nexus POS Manager", "Admin", "System Manager")


# //// Neoffice — added function (no upstream equivalent). A desk account holding one of
# //// TILL_MANAGER_ROLES. A portal account is never a till manager, whatever roles it was given.
def is_till_manager():
	user = frappe.session.user
	if user == "Administrator":
		return True
	if not is_desk_account():
		return False
	return bool(set(TILL_MANAGER_ROLES).intersection(frappe.get_roles(user)))


# //// Neoffice — added function (no upstream equivalent). An endpoint that reads across every till
# //// (every gift card with its balance, for instance) answers a till manager only.
def require_till_manager():
	if not is_till_manager():
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added function (no upstream equivalent). The till's endpoints that may name no POS
# //// Profile: with one named, whoever may work at that till (require_till_access); with none, a
# //// desk account that works at some till (assigned to a POS Profile, reading sales invoices as
# //// every cashier does, or a till manager). A visitor, a portal account and a desk account with
# //// no till are refused.
def require_till_user(pos_profile=None):
	if pos_profile:
		require_till_access(pos_profile)
		return
	require_system_user()
	user = frappe.session.user
	if user == "Administrator" or is_till_manager():
		return
	if not (
		frappe.db.exists("POS Profile User", {"user": user}) or frappe.has_permission("Sales Invoice", "read")
	):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added function (no upstream equivalent). A till endpoint that names a document (an
# //// invoice, a shift): whoever may work at the document's till, its pos_profile; a document with no
# //// till asks for a till user. The desk-account check runs before the name is looked up, so a
# //// portal account cannot learn which documents exist.
def require_document_till(doctype, name):
	require_system_user()
	pos_profile = None
	if name and isinstance(name, str):
		pos_profile = frappe.db.get_value(doctype, name, "pos_profile")
	require_till_user(pos_profile)


@frappe.whitelist()
def get_cash_entry_templates(company, pos_profile=None):
	"""Fetch Journal Entry Templates available for cash in/out operations."""
	# //// Neoffice — the till's own endpoint: it reads the company's templates and accounts, so only the
	# //// till's users may call it (require_till_user).
	require_till_user(pos_profile)
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
	# //// Neoffice — only an account that may work at this shift's till (require_till_access).
	require_till_access(shift.pos_profile)
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
	# //// Neoffice — a shift's entries follow the shift's rule (its cashier at a till they may use, or a
	# //// till manager), as its closing data does (require_shift_access).
	from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import require_shift_access

	require_shift_access(pos_opening_shift)
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
