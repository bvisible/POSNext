# //// Neoffice — added file (no upstream equivalent). The tips of a restaurant by server (NeoResto lot 1, product owner, 04.11.2026:
# //// « tout ce qui est rapport » of the point of sale had to be in NeoResto, and the one report only a restaurant needs was still missing, the
# //// one the design note asked for on 28.10: the tips to hand out at the end of a day or a week, by employee and by period, cash, TWINT and card
# //// apart). It reads the tips the till wrote (Restaurant Tip) through `get_list`, so a reader sees what the doctype lets him see.
# //// A shop till's tips (a salon, 09.11.2026) are counted by the PERSON they are for (the sales person of the sale), or as the common
# //// pot; a restaurant's stay counted by the user who rang them up, as before.
import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

# A cancelled tip was given back to the guest: it is nobody's
CANCELLED = "Cancelled"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "server", "label": _("Server"), "fieldtype": "Link", "options": "User", "width": 200},
		{"fieldname": "server_name", "label": _("Name"), "fieldtype": "Data", "width": 180},
		{
			"fieldname": "sales_person",
			"label": _("Sales Person"),
			"fieldtype": "Link",
			"options": "Sales Person",
			"width": 160,
		},
		{"fieldname": "payment_method", "label": _("Payment Method"), "fieldtype": "Data", "width": 140},
		{"fieldname": "tips", "label": _("Tips"), "fieldtype": "Int", "width": 80},
		# Taken and not yet handed out, then handed out: what is left to distribute, and what was
		{"fieldname": "collected", "label": _("Collected"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "distributed", "label": _("Distributed"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "total", "label": _("Total"), "fieldtype": "Currency", "width": 120},
	]


def get_data(filters):
	from_date = filters.get("from_date") or str(getdate(nowdate()).replace(day=1))
	query = {
		"status": filters.get("status") or ["!=", CANCELLED],
		"tip_date": ["between", [from_date, filters.get("to_date") or nowdate()]],
	}
	if filters.get("restaurant"):
		query["restaurant"] = filters.restaurant
	if filters.get("pos_profile"):
		query["pos_profile"] = filters.pos_profile

	rows = {}
	for tip in frappe.get_list(
		"Restaurant Tip",
		filters=query,
		fields=["server", "sales_person", "common_pot", "payment_method", "status", "amount"],
		limit_page_length=0,
	):
		row = rows.setdefault(
			(tip.server or "", tip.sales_person or "", cint(tip.common_pot), tip.payment_method or ""),
			{
				"server": tip.server,
				"sales_person": tip.sales_person,
				"common_pot": cint(tip.common_pot),
				"payment_method": tip.payment_method,
				"tips": 0,
				"collected": 0.0,
				"distributed": 0.0,
			},
		)
		row["tips"] += 1
		row["distributed" if tip.status == "Distributed" else "collected"] += flt(tip.amount)

	names = _names_of({row["server"] for row in rows.values() if row["server"]})
	people = _sales_person_names_of({row["sales_person"] for row in rows.values() if row["sales_person"]})
	for row in rows.values():
		common_pot = row.pop("common_pot")  # not a column: every key of a line is one
		# The person a tip is for, else the user who rang it up, else the common pot
		row["server_name"] = (
			people.get(row["sales_person"])
			or names.get(row["server"])
			or row["server"]
			or (_("Common pot") if common_pot else _("No server"))
		)
		row["total"] = row["collected"] + row["distributed"]
	return sorted(
		rows.values(), key=lambda row: ((row["server_name"] or "").lower(), row["payment_method"] or "")
	)


def _sales_person_names_of(sales_persons):
	"""The names of the people the tips are for."""
	if not sales_persons:
		return {}
	return dict(
		frappe.get_all(
			"Sales Person",
			filters={"name": ["in", list(sales_persons)]},
			fields=["name", "sales_person_name"],
			as_list=True,
		)
	)


def _names_of(users):
	"""The full names of the servers, for the readers who are shown a list of them rather than their addresses."""
	if not users:
		return {}
	return dict(
		frappe.get_all(
			"User", filters={"name": ["in", list(users)]}, fields=["name", "full_name"], as_list=True
		)
	)
