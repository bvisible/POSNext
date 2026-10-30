# //// Neoffice — added file (no upstream equivalent). The till's drawer movements and the closing's
# //// withdrawals were found again by their remark (« POS Cash Entry|<shift>|<in/out>|<template>|<note> »,
# //// « POS Cash Withdrawal|<closing>|<amount>|<template> »). Since NeoRestau lot 1 (task 15) they carry
# //// link fields of ours instead (posa_cash_movement*), which the closing and the reports read: this tags
# //// the entries written before, once, from their remark. The drawer's direction and the cash account are
# //// read from the entry's own rows on the till's cash account, not from the remark, whose direction the
# //// old writer guessed (defect D1); an entry that never moved that account keeps its shift, template and
# //// note for the record, and is counted nowhere.
import json

import frappe
from frappe.utils import cstr, flt

# The fields this patch writes. bench migrate imports the fixture that defines them after the patches,
# so on the migrate that brings them this patch makes them first, from that same fixture.
FIELDS = (
	"posa_cash_movement_section",
	"posa_cash_movement",
	"posa_cash_movement_shift",
	"posa_cash_movement_closing",
	"posa_cash_entry_template",
	"posa_cash_movement_column_break",
	"posa_cash_movement_account",
	"posa_cash_movement_no_vat",
	"posa_cash_movement_note",
	"posa_cash_movement_offline_id",
)


def execute():
	_make_the_fields()
	for row in frappe.db.sql(
		"""select name, company, user_remark from `tabJournal Entry`
		where user_remark like 'POS Cash Entry|%%' and ifnull(posa_cash_movement_shift, '') = ''""",
		as_dict=True,
	):
		_tag_movement(row)
	for row in frappe.db.sql(
		"""select name, company, user_remark from `tabJournal Entry`
		where user_remark like 'POS Cash Withdrawal|%%' and ifnull(posa_cash_movement_closing, '') = ''""",
		as_dict=True,
	):
		_tag_withdrawal(row)


def _make_the_fields():
	layout = ("posa_cash_movement_section", "posa_cash_movement_column_break")
	if all(
		frappe.db.has_column("Journal Entry", fieldname) for fieldname in FIELDS if fieldname not in layout
	):
		return
	from frappe.custom.doctype.custom_field.custom_field import create_custom_field

	with open(frappe.get_app_path("pos_next", "fixtures", "custom_field.json"), encoding="utf-8") as fixture:
		rows = [
			row
			for row in json.load(fixture)
			if row.get("dt") == "Journal Entry" and row.get("fieldname") in FIELDS
		]
	skipped = {"doctype", "name", "dt", "modified", "owner", "creation", "modified_by", "docstatus", "idx"}
	for row in rows:
		if frappe.db.exists("Custom Field", {"dt": "Journal Entry", "fieldname": row["fieldname"]}):
			continue
		create_custom_field(
			"Journal Entry",
			{key: value for key, value in row.items() if key not in skipped and value is not None},
			is_system_generated=False,
		)


def _drawer_delta(journal_entry, cash_account):
	"""What the entry did to the till's cash account: positive in, negative out, 0 when it never moved it."""
	if not cash_account:
		return 0
	total = frappe.db.sql(
		"""select sum(debit_in_account_currency - credit_in_account_currency)
		from `tabJournal Entry Account`
		where parent = %s and parenttype = 'Journal Entry' and account = %s""",
		(journal_entry, cash_account),
	)
	return flt(total[0][0]) if total else 0


def _cash_account(pos_profile, company):
	from pos_next import cash_movement

	try:
		return cash_movement.till_cash_account(pos_profile, company, required=False)
	except Exception:
		# A till whose cash mode is gone: the entry keeps its shift and template, and no account.
		return None


def _template(label, company):
	label = cstr(label).strip()
	if not label:
		return None
	if frappe.db.exists("Journal Entry Template", label):
		return label
	return frappe.db.get_value(
		"Journal Entry Template", {"template_title": label, "company": company}, "name"
	)


def _tag(journal_entry, values):
	frappe.db.set_value("Journal Entry", journal_entry, values, update_modified=False)


def _tag_movement(row):
	parts = cstr(row.user_remark).split("|")
	shift = parts[1] if len(parts) > 1 else None
	opening = shift and frappe.db.get_value(
		"POS Opening Shift", shift, ["name", "pos_profile", "company"], as_dict=True
	)
	if not opening:
		return
	cash_account = _cash_account(opening.pos_profile, opening.company)
	delta = _drawer_delta(row.name, cash_account)
	values = {
		"posa_cash_movement_shift": opening.name,
		"posa_cash_entry_template": _template(parts[3] if len(parts) > 3 else "", row.company),
		"posa_cash_movement_note": "|".join(parts[4:]).strip() or None,
	}
	if delta:
		values.update(
			{"posa_cash_movement": "In" if delta > 0 else "Out", "posa_cash_movement_account": cash_account}
		)
	_tag(row.name, values)


def _tag_withdrawal(row):
	parts = cstr(row.user_remark).split("|")
	closing_name = parts[1] if len(parts) > 1 else None
	closing = closing_name and frappe.db.get_value(
		"POS Closing Shift", closing_name, ["name", "pos_profile", "company"], as_dict=True
	)
	if not closing:
		return
	cash_account = _cash_account(closing.pos_profile, closing.company)
	delta = _drawer_delta(row.name, cash_account)
	values = {
		"posa_cash_movement_closing": closing.name,
		"posa_cash_entry_template": _template(parts[3] if len(parts) > 3 else "", row.company),
	}
	if delta:
		values.update(
			{"posa_cash_movement": "In" if delta > 0 else "Out", "posa_cash_movement_account": cash_account}
		)
	_tag(row.name, values)
