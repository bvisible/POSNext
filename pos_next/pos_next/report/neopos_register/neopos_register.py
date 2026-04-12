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

	pos_entries = get_pos_entries(filters, group_by_field)

	# When not grouped by payment method, concatenate payment methods for display
	if group_by_field != "mode_of_payment":
		concat_mode_of_payments(pos_entries)

	columns = get_columns(filters)

	# Return flat list if no grouping
	if not group_by_field:
		return columns, pos_entries

	# Handle grouping
	invoice_map = {}
	grouped_data = []
	for d in pos_entries:
		invoice_map.setdefault(d[group_by_field], []).append(d)

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
	elif group_by_field:
		order_by += ", si.{0}".format(
			"owner" if group_by_field == "owner" else group_by_field
		)
		select_mop_field = ", si.base_paid_amount - si.change_amount as paid_amount"

	return frappe.db.sql(
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


def concat_mode_of_payments(pos_entries):
	"""Add a comma-separated list of payment methods to each entry."""
	if not pos_entries:
		return

	invoice_names = list({d.sales_invoice for d in pos_entries})
	if not invoice_names:
		return

	# Fetch payment methods for all invoices in one query
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
		methods = mop_map.get(entry.sales_invoice, [])
		entry.mode_of_payment = ", ".join(methods) if methods else ""


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

	if filters.get("pos_profile") and filters.get("group_by") == "POS Profile":
		frappe.throw(_("Can not filter based on POS Profile, if grouped by POS Profile"))

	if filters.get("customer") and filters.get("group_by") == "Customer":
		frappe.throw(_("Can not filter based on Customer, if grouped by Customer"))

	if filters.get("cashier") and filters.get("group_by") == "Cashier":
		frappe.throw(_("Can not filter based on Cashier, if grouped by Cashier"))

	if filters.get("mode_of_payment") and filters.get("group_by") == "Payment Method":
		frappe.throw(_("Can not filter based on Payment Method, if grouped by Payment Method"))


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
			"label": _("Sales Invoice"),
			"fieldname": "sales_invoice",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 140,
		},
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 120,
		},
		{
			"label": _("POS Profile"),
			"fieldname": "pos_profile",
			"fieldtype": "Link",
			"options": "POS Profile",
			"width": 160,
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
			"width": 150,
		},
		{
			"label": _("Is Return"),
			"fieldname": "is_return",
			"fieldtype": "Data",
			"width": 80,
		},
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 120,
		},
	]
