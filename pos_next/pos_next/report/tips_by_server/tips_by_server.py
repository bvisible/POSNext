# //// Neoffice — added file (no upstream equivalent). The tips of a restaurant by server (NeoResto lot 1, product owner, 04.11.2026:
# //// « tout ce qui est rapport » of the point of sale had to be in NeoResto, and the one report only a restaurant needs was still missing, the
# //// one the design note asked for on 28.10: the tips to hand out at the end of a day or a week, by employee and by period, cash, TWINT and card
# //// apart). It reads the tips the till wrote (Restaurant Tip) through `get_list`, so a reader sees what the doctype lets him see.
import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

# A cancelled tip was given back to the guest: it is nobody's
CANCELLED = "Cancelled"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "server", "label": _("Server"), "fieldtype": "Link", "options": "User", "width": 200},
		{"fieldname": "server_name", "label": _("Name"), "fieldtype": "Data", "width": 180},
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

	rows = {}
	for tip in frappe.get_list(
		"Restaurant Tip",
		filters=query,
		fields=["server", "payment_method", "status", "amount"],
		limit_page_length=0,
	):
		row = rows.setdefault(
			(tip.server or "", tip.payment_method or ""),
			{
				"server": tip.server,
				"payment_method": tip.payment_method,
				"tips": 0,
				"collected": 0.0,
				"distributed": 0.0,
			},
		)
		row["tips"] += 1
		row["distributed" if tip.status == "Distributed" else "collected"] += flt(tip.amount)

	names = _names_of({row["server"] for row in rows.values() if row["server"]})
	for row in rows.values():
		row["server_name"] = names.get(row["server"]) or row["server"] or _("No server")
		row["total"] = row["collected"] + row["distributed"]
	return sorted(
		rows.values(), key=lambda row: ((row["server_name"] or "").lower(), row["payment_method"] or "")
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
