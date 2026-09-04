#//// Neoffice — added file (no upstream equivalent). The till journal a Swiss cashier is actually
#//// asked for: POS sales, invoices collected at the counter (Payment Entries) and cash in/out
#//// (Journal Entries) in ONE register, grouped by profile / cashier / payment method / customer /
#//// transaction type with subtotals. ERPNext's legacy POS Register only knows POS sales, so a
#//// shift that collected an open invoice or moved cash out of the drawer never balanced (0a45914d,
#//// 2026-04-12 "add Neopos Register report"; collections, cash in/out and the Transaction Type
#//// filter: b7fc0516, same day). "Neopos" is the product name after the BrainWise rebrand
#//// (458d81a9).
# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	if not filters:
		return [], []

	validate_filters(filters)

	group_by_field = get_group_by_field(filters.get("group_by"))
	txn_type = filters.get("transaction_type", "")

	all_entries = []

	# 1. POS Sales (Sales Invoices with is_pos=1)
	if not txn_type or txn_type == "POS Sales":
		all_entries.extend(get_pos_entries(filters, group_by_field))

	# 2. Invoice Collections (Payment Entries from POS)
	if not txn_type or txn_type == "Invoice Collection":
		all_entries.extend(get_invoice_collections(filters, group_by_field))

	# 3. Cash In/Out (Journal Entries from POS)
	if not txn_type or txn_type == "Cash In/Out":
		all_entries.extend(get_cash_in_out(filters, group_by_field))

	# Concat mode of payments for entries that don't have it yet
	if group_by_field != "mode_of_payment":
		concat_mode_of_payments(all_entries)

	columns = get_columns(filters)

	# Return flat list if no grouping
	if not group_by_field:
		return columns, all_entries

	# Handle grouping
	invoice_map = {}
	grouped_data = []
	for d in all_entries:
		key = d.get(group_by_field, _("Unknown"))
		invoice_map.setdefault(key, []).append(d)

	for key in invoice_map:
		invoices = invoice_map[key]
		grouped_data += invoices
		add_subtotal_row(grouped_data, invoices, group_by_field, key)

	# Move group-by column to first position
	column_index = next(
		(index for (index, d) in enumerate(columns) if d["fieldname"] == group_by_field), None
	)
	if column_index is not None:
		columns.insert(0, columns.pop(column_index))

	return columns, grouped_data


# ============================================================
# Data fetchers
# ============================================================

def get_pos_entries(filters, group_by_field):
	"""Fetch POS Sales Invoices with optional payment method breakdown."""
	conditions = get_conditions(filters)
	order_by = "si.posting_date"
	select_mop_field = ""
	from_payment = ""
	group_by_mop_condition = ""

	if group_by_field == "mode_of_payment":
		select_mop_field = (
			", sip.mode_of_payment"
			", sip.base_amount - IF(sip.type = 'Cash', si.change_amount, 0) as paid_amount"
		)
		from_payment = ", `tabSales Invoice Payment` sip"
		group_by_mop_condition = (
			"sip.parent = si.name AND "
			"IFNULL(sip.base_amount - IF(sip.type = 'Cash', si.change_amount, 0), 0) != 0 AND"
		)
		order_by += ", sip.mode_of_payment"
	elif group_by_field and group_by_field in ("pos_profile", "customer", "owner"):
		order_by += ", si.{0}".format(
			"owner" if group_by_field == "owner" else group_by_field
		)
		select_mop_field = ", si.base_paid_amount - si.change_amount as paid_amount"
	elif group_by_field:
		select_mop_field = ", si.base_paid_amount - si.change_amount as paid_amount"

	entries = frappe.db.sql(
		"""
		SELECT
			si.posting_date,
			si.name as sales_invoice,
			si.pos_profile,
			si.company,
			si.owner,
			si.customer,
			si.is_return,
			si.base_grand_total as grand_total
			{select_mop_field}
		FROM
			`tabSales Invoice` si
			{from_payment}
		WHERE
			si.docstatus = 1
			AND si.is_pos = 1
			AND {group_by_mop_condition}
			{conditions}
		ORDER BY
			{order_by}
		""".format(
			select_mop_field=select_mop_field,
			from_payment=from_payment,
			group_by_mop_condition=group_by_mop_condition,
			conditions=conditions,
			order_by=order_by,
		),
		filters,
		as_dict=1,
	)

	for e in entries:
		e["transaction_type"] = _("POS Sale")

	return entries


def get_invoice_collections(filters, group_by_field):
	"""Fetch Payment Entries made from POS for existing invoices."""
	conditions = ["pe.docstatus = 1"]
	conditions.append("pe.posting_date >= %(from_date)s")
	conditions.append("pe.posting_date <= %(to_date)s")
	conditions.append("pe.company = %(company)s")
	conditions.append("(pe.reference_no LIKE 'POS-%%' OR pe.reference_no LIKE 'POSA-%%')")

	if filters.get("cashier"):
		conditions.append("pe.owner = %(cashier)s")

	if filters.get("customer"):
		conditions.append("pe.party = %(customer)s")

	if filters.get("mode_of_payment"):
		conditions.append("pe.mode_of_payment = %(mode_of_payment)s")

	if filters.get("pos_profile"):
		conditions.append("""
			EXISTS(
				SELECT 1 FROM `tabPOS Payment Entry Reference` pper
				JOIN `tabPOS Closing Shift` pcs ON pcs.name = pper.parent
				WHERE pper.payment_entry = pe.name
				AND pcs.pos_profile = %(pos_profile)s
			)
		""")

	where = " AND ".join(conditions)

	entries = frappe.db.sql(
		"""
		SELECT
			pe.posting_date,
			pe.name as reference,
			pe.party as customer,
			pe.paid_amount as grand_total,
			pe.paid_amount as paid_amount,
			pe.mode_of_payment,
			pe.company,
			pe.owner
		FROM
			`tabPayment Entry` pe
		WHERE
			{where}
		ORDER BY
			pe.posting_date
		""".format(where=where),
		filters,
		as_dict=1,
	)

	for e in entries:
		e["transaction_type"] = _("Invoice Collection")
		e["sales_invoice"] = e.pop("reference", "")
		e["is_return"] = 0
		# Try to get pos_profile from POS Payment Entry Reference
		shift = frappe.db.get_value(
			"POS Payment Entry Reference",
			{"payment_entry": e["sales_invoice"]},
			"parent"
		)
		if shift:
			e["pos_profile"] = frappe.db.get_value("POS Closing Shift", shift, "pos_profile") or ""
		else:
			e["pos_profile"] = ""

	return entries


def get_cash_in_out(filters, group_by_field):
	"""Fetch Cash In/Out Journal Entries from POS.

	Format: user_remark = 'POS Cash Entry|{opening_shift}|{in/out}|{template}|{label}'
	"""
	conditions = ["je.docstatus = 1"]
	conditions.append("je.posting_date >= %(from_date)s")
	conditions.append("je.posting_date <= %(to_date)s")
	conditions.append("je.company = %(company)s")
	conditions.append("je.user_remark LIKE 'POS Cash Entry|%%'")

	if filters.get("cashier"):
		conditions.append("je.owner = %(cashier)s")

	where = " AND ".join(conditions)

	entries = frappe.db.sql(
		"""
		SELECT
			je.posting_date,
			je.name as reference,
			je.total_debit as amount,
			je.user_remark,
			je.company,
			je.owner
		FROM
			`tabJournal Entry` je
		WHERE
			{where}
		ORDER BY
			je.posting_date
		""".format(where=where),
		filters,
		as_dict=1,
	)

	# Cache for cash mode of payment per POS profile
	cash_mode_cache = {}

	result = []
	for e in entries:
		parts = (e.get("user_remark") or "").split("|")
		if len(parts) < 4:
			continue

		shift_name = parts[1]
		direction = parts[2]
		template = parts[3] if len(parts) > 3 else ""
		label = parts[4] if len(parts) > 4 else template

		amount = flt(e["amount"])
		if direction == "out":
			amount = -amount

		pos_profile = ""
		if shift_name:
			pos_profile = frappe.db.get_value("POS Opening Shift", shift_name, "pos_profile") or ""

		if filters.get("pos_profile") and pos_profile != filters["pos_profile"]:
			continue

		if direction == "in":
			txn_type = _("Cash In")
		else:
			txn_type = _("Cash Out")

		description = label if label and label != template else template

		# Get the actual cash mode of payment name for this POS profile
		if pos_profile not in cash_mode_cache:
			from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import _get_cash_mode_of_payment
			cash_mode_cache[pos_profile] = _get_cash_mode_of_payment(pos_profile)
		cash_mode = cash_mode_cache.get(pos_profile, _("Cash"))

		result.append({
			"posting_date": e["posting_date"],
			"sales_invoice": e["reference"],
			"customer": description,
			"pos_profile": pos_profile,
			"company": e["company"],
			"owner": e["owner"],
			"is_return": 0,
			"grand_total": amount,
			"paid_amount": amount,
			"mode_of_payment": cash_mode,
			"transaction_type": txn_type,
		})

	return result


# ============================================================
# Helpers
# ============================================================

def concat_mode_of_payments(pos_entries):
	"""Add a comma-separated list of payment methods to entries that need it."""
	if not pos_entries:
		return

	invoice_names = []
	for d in pos_entries:
		if d.get("transaction_type") == _("POS Sale") and d.get("sales_invoice") and not d.get("mode_of_payment"):
			invoice_names.append(d["sales_invoice"])

	if not invoice_names:
		return

	payments = frappe.db.sql(
		"""
		SELECT parent, mode_of_payment
		FROM `tabSales Invoice Payment`
		WHERE parent IN %s
		ORDER BY parent, idx
		""",
		[invoice_names],
		as_dict=1,
	)

	mop_map = {}
	for p in payments:
		mop_map.setdefault(p.parent, []).append(p.mode_of_payment)

	for entry in pos_entries:
		if entry.get("transaction_type") == _("POS Sale") and not entry.get("mode_of_payment"):
			methods = mop_map.get(entry.get("sales_invoice"), [])
			entry["mode_of_payment"] = ", ".join(methods) if methods else ""


def add_subtotal_row(data, group_invoices, group_by_field, group_by_value):
	"""Add a bold subtotal row after each group."""
	grand_total = sum(flt(d.get("grand_total", 0)) for d in group_invoices)
	paid_amount = sum(flt(d.get("paid_amount", 0)) for d in group_invoices)
	data.append(
		{
			group_by_field: group_by_value,
			"grand_total": grand_total,
			"paid_amount": paid_amount,
			"bold": 1,
		}
	)
	data.append({})


def validate_filters(filters):
	if not filters.get("company"):
		frappe.throw(_("{0} is mandatory").format(_("Company")))

	if not filters.get("from_date") and not filters.get("to_date"):
		frappe.throw(
			_("{0} and {1} are mandatory").format(
				frappe.bold(_("From Date")), frappe.bold(_("To Date"))
			)
		)

	if filters.get("from_date") and filters.get("to_date"):
		if filters.from_date > filters.to_date:
			frappe.throw(_("From Date must be before To Date"))


def get_conditions(filters):
	conditions = (
		"si.company = %(company)s"
		" AND si.posting_date >= %(from_date)s"
		" AND si.posting_date <= %(to_date)s"
	)

	if filters.get("pos_profile"):
		conditions += " AND si.pos_profile = %(pos_profile)s"

	if filters.get("cashier"):
		conditions += " AND si.owner = %(cashier)s"

	if filters.get("customer"):
		conditions += " AND si.customer = %(customer)s"

	if filters.get("is_return"):
		conditions += " AND si.is_return = 1"

	if filters.get("mode_of_payment"):
		conditions += """
			AND EXISTS(
				SELECT 1 FROM `tabSales Invoice Payment` _sip
				WHERE _sip.parent = si.name
				AND IFNULL(_sip.mode_of_payment, '') = %(mode_of_payment)s
			)"""

	return conditions


def get_group_by_field(group_by):
	mapping = {
		"POS Profile": "pos_profile",
		"Cashier": "owner",
		"Customer": "customer",
		"Payment Method": "mode_of_payment",
		"Transaction Type": "transaction_type",
	}
	return mapping.get(group_by, "")


def get_columns(filters):
	return [
		{
			"label": _("Posting Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 90,
		},
		{
			"label": _("Type"),
			"fieldname": "transaction_type",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"label": _("Reference"),
			"fieldname": "sales_invoice",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Data",
			"width": 140,
		},
		{
			"label": _("POS Profile"),
			"fieldname": "pos_profile",
			"fieldtype": "Link",
			"options": "POS Profile",
			"width": 140,
		},
		{
			"label": _("Cashier"),
			"fieldname": "owner",
			"fieldtype": "Link",
			"options": "User",
			"width": 140,
		},
		{
			"label": _("Grand Total"),
			"fieldname": "grand_total",
			"fieldtype": "Currency",
			"options": "Company:company:default_currency",
			"width": 120,
		},
		{
			"label": _("Paid Amount"),
			"fieldname": "paid_amount",
			"fieldtype": "Currency",
			"options": "Company:company:default_currency",
			"width": 120,
		},
		{
			"label": _("Payment Method"),
			"fieldname": "mode_of_payment",
			"fieldtype": "Data",
			"width": 140,
		},
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 120,
		},
	]
