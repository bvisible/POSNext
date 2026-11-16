# //// Neoffice — added file (no upstream equivalent). A sale a guest paid on his phone (a table paid from its QR code, a
# //// web takeaway order, a phone's cart in the shop) enters the shift open at its till and that shift's closing, on a
# //// line « Paid online » the cashier does not count (maintenance#2485; product owner, 16.11.2026). The closing reads only
# //// the sales of its shift (`posa_pos_opening_shift`), and a guest's paid order was submitted with none: a table of
# //// 177.45 paid from its QR code was in no closing and no end-of-day report.
"""The sales paid online: the shift they enter, and what the closing says of them.

A guest's payment is the one rule the till already keeps across its own saves (invoices._guest_payments_to_keep): a
Payment Intent of the invoice that the provider settled (or later refunded) and that carries a guest session's token. Its
payment row on the sale is booked under the provider's id. At the closing such a row is money the drawer never saw and the
card terminal never took: it is counted apart, never in the expected amount the cashier counts against.

The shift of a sale paid online is chosen as ERPNext's own till chooses a sale's session, by its till: the sale keeps the
shift it was saved at while that shift is open; else it takes the shift open at its till (the one of whoever opened the
order, else the latest opened); else one open at another till of the same restaurant. With no till of the restaurant open
the sale is submitted without a shift (its accounting is whole: the shift is only the till's count) and a comment on the
sale says that no closing holds it.
"""

import frappe
from frappe import _
from frappe.utils import flt

SALES_INVOICE = "Sales Invoice"
OPENING_SHIFT = "POS Opening Shift"


# ------------------------------------------------------------------------------------------------------------ the payments
def guest_settled_references(invoice_names) -> dict[str, set[str]]:
	"""{invoice: the references its guests' settled payments are booked under (the provider's id, else the intent's name)}
	for several invoices in one read; an invoice without any has no entry."""
	names = [name for name in (invoice_names or []) if name]
	if not names or not frappe.db.table_exists("Payment Intent"):
		return {}
	references: dict[str, set[str]] = {}
	for intent in frappe.get_all(
		"Payment Intent",
		filters={
			"reference_doctype": SALES_INVOICE,
			"reference_name": ["in", names],
			"status": ["in", ["succeeded", "refunded"]],
		},
		fields=["name", "reference_name", "provider_intent_id", "metadata_json"],
	):
		metadata = frappe.parse_json(intent.metadata_json or "{}") or {}
		if metadata.get("token"):
			references.setdefault(intent.reference_name, set()).add(intent.provider_intent_id or intent.name)
	return references


def is_paid_online(payment_row, references) -> bool:
	"""Whether a payment row of a sale is a guest's payment: booked under one of the references of its guests' payments."""
	reference = payment_row.get("reference_no") if hasattr(payment_row, "get") else None
	return bool(reference) and reference in (references or ())


# ------------------------------------------------------------------------------------------------------------ the shift
def _open(filters, company):
	return frappe.get_all(
		OPENING_SHIFT,
		filters={**filters, "company": company, "docstatus": 1, "status": "Open"},
		fields=["name", "user"],
		order_by="period_start_date desc, creation desc",
	)


def _tills_of_the_restaurant(pos_profile) -> list[str]:
	"""The other tills of the restaurant of this till (their enabled POS Settings name it); none for a till of no restaurant."""
	from pos_next.restaurant.settings import restaurant_for_profile

	if not pos_profile:
		return []
	restaurant = restaurant_for_profile(pos_profile)
	if not restaurant:
		return []
	return [
		name
		for name in frappe.get_all(
			"POS Settings", filters={"enabled": 1, "restaurant": restaurant}, pluck="pos_profile"
		)
		if name and name != pos_profile
	]


def shift_for(invoice_doc) -> str | None:
	"""The shift a sale paid online enters (see the module's text), or None when no till of its restaurant has one open."""
	company = invoice_doc.get("company")
	current = invoice_doc.get("posa_pos_opening_shift")
	if current and _open({"name": current}, company):
		return current
	pos_profile = invoice_doc.get("pos_profile")
	if pos_profile:
		shifts = _open({"pos_profile": pos_profile}, company)
		if shifts:
			owner = invoice_doc.get("owner")
			return next((shift.name for shift in shifts if shift.user == owner), shifts[0].name)
	others = _tills_of_the_restaurant(pos_profile)
	if others:
		shifts = _open({"pos_profile": ["in", others]}, company)
		if shifts:
			return shifts[0].name
	return None


def enter_the_open_shift(invoice_doc) -> str | None:
	"""Put a sale paid online in its shift before it is submitted (`shift_for`); the shift, or None when there is none to
	enter (the sale keeps what it had)."""
	shift = shift_for(invoice_doc)
	if shift:
		invoice_doc.posa_pos_opening_shift = shift
	return shift


def say_it_is_in_no_closing(invoice_name):
	"""A comment on a sale paid online that no shift could take: no closing will count it."""
	frappe.get_doc(SALES_INVOICE, invoice_name).add_comment(
		"Comment",
		_(
			"Paid online while no till of its restaurant had a shift open: this sale is in no closing and no end-of-day"
			" report."
		),
	)


# ------------------------------------------------------------------------------------------------------------ the closing
def summary(invoices, references=None) -> dict:
	"""What the submitted sales of a closing were paid online: {"paid_online": [{mode_of_payment, amount, count}],
	"paid_online_total", "paid_online_count"} in the company's currency. `invoices` are invoice dicts or documents with
	their payments; `references` the guests' references of each (read here when not given)."""
	invoices = [invoice for invoice in (invoices or []) if invoice.get("docstatus") == 1]
	if references is None:
		references = guest_settled_references([invoice.get("name") for invoice in invoices])
	by_mode: dict[str, dict] = {}
	sales = set()
	for invoice in invoices:
		online = references.get(invoice.get("name"))
		if not online:
			continue
		rate = flt(invoice.get("conversion_rate")) or 1
		for row in invoice.get("payments") or []:
			if not is_paid_online(row, online):
				continue
			amount = flt(row.get("base_amount")) or flt(row.get("amount")) * rate
			entry = by_mode.setdefault(row.get("mode_of_payment"), {"amount": 0.0, "sales": set()})
			entry["amount"] += amount
			entry["sales"].add(invoice.get("name"))
			sales.add(invoice.get("name"))
	rows = [
		{"mode_of_payment": mode, "amount": flt(entry["amount"], 2), "count": len(entry["sales"])}
		for mode, entry in sorted(by_mode.items(), key=lambda item: -item[1]["amount"])
	]
	return {
		"paid_online": rows,
		"paid_online_total": flt(sum(row["amount"] for row in rows), 2),
		"paid_online_count": len(sales),
	}


def get_paid_online(doc):
	"""The end-of-day print's line of the sales paid online for a POS Closing Shift (Jinja method): {"label", "amount"},
	or None when the shift has none."""
	if isinstance(doc, str):
		doc = frappe.get_doc("POS Closing Shift", doc)
	names = [
		row.get("sales_invoice") for row in (doc.get("pos_transactions") or []) if row.get("sales_invoice")
	]
	references = guest_settled_references(names)
	if not references:
		return None
	invoices = [frappe.get_doc(SALES_INVOICE, name) for name in references]
	found = summary(invoices, references)
	if not found["paid_online_count"]:
		return None
	return {"label": _("Paid online, not counted"), "amount": found["paid_online_total"]}
