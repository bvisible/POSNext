# //// Neoffice — added file (no upstream equivalent). « Offert » (NeoResto lot 1, task 24): the cashier offers some or
# //// all of a line's quantity. The offered part is a row of its own, flagged by a field of ours (`posa_is_offered`, never
# //// ERPNext's is_free_item, which a pricing rule may strip): it keeps its list price at a 100 % discount, so the invoice
# //// says what was offered and charges nothing for it, no VAT on it, while its stock goes out like any unit sold.
"""Offered rows of a till's invoices: their field, their rules, and what the closing counts of them.

Who may offer is checked here, on the document, whatever path saves it (the till's endpoints, an offline sale synced, the
desk): whoever may change a discount at the till, its POS Settings' `allow_user_to_edit_item_discount` read as the till
reads it (its enabled row, else the defaults). A manager's PIN, where a rule of the authorization gate asks for one, is
the gate's (pos_next.authorization.actions.offered_item, enforced before submit).
"""

from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cint, flt, fmt_money

FIELD = "posa_is_offered"
ITEM_DOCTYPE = "Sales Invoice Item"
# The context of the word the till and the tickets print: the bare msgid « Offered » is another app's « Proposée »
CONTEXT = "Given for free"
# The till's right to change a discount, and its value where the till has no settings of its own (DEFAULT_POS_SETTINGS)
RIGHT = "allow_user_to_edit_item_discount"


def ensure_offered_field():
	"""The custom field that flags an offered row, made by the install path (after_install, after_migrate) and by the
	tests themselves (a fresh CI site runs neither patches nor after_migrate). Idempotent."""
	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

	if frappe.db.exists("Custom Field", {"dt": ITEM_DOCTYPE, "fieldname": FIELD}) and frappe.db.has_column(
		ITEM_DOCTYPE, FIELD
	):
		return
	create_custom_fields(
		{
			ITEM_DOCTYPE: [
				{
					"fieldname": FIELD,
					"fieldtype": "Check",
					"label": "Offered",
					"insert_after": "discount_amount",
					"read_only": 1,
					"print_hide": 1,
					"description": "Given for free at the till: the line keeps its list price at a 100 % discount.",
				}
			]
		}
	)


def is_offered(row) -> bool:
	"""Whether an invoice row (a document or a dict) is an offered row."""
	return cint(row.get(FIELD) if hasattr(row, "get") else getattr(row, FIELD, 0)) == 1


def offered_rows(doc) -> list:
	"""The offered rows of an invoice (a document or a dict)."""
	return [row for row in (doc.get("items") or []) if is_offered(row)]


def offered_value(rows) -> float:
	"""What offered rows are worth at list price, in the invoice's currency: what a manager approves."""
	return flt(sum(flt(row.get("qty")) * flt(row.get("price_list_rate")) for row in rows), 2)


def till_allows_offers(pos_profile) -> bool:
	"""Whether a till lets its cashiers change a discount: its enabled POS Settings row says so, else the defaults the
	till itself falls back on (pos_next.api.constants.DEFAULT_POS_SETTINGS)."""
	from pos_next.api.constants import DEFAULT_POS_SETTINGS

	value = None
	if pos_profile:
		value = frappe.db.get_value("POS Settings", {"pos_profile": pos_profile, "enabled": 1}, RIGHT)
	if value is None:
		value = DEFAULT_POS_SETTINGS.get(RIGHT, 0)
	return bool(cint(value))


def _is_pos(doc) -> bool:
	return bool(doc.get("is_pos") or doc.get("pos_profile"))


def validate_offered_rows(doc, method=None):
	"""Sales Invoice `validate` (doc_events): an offered row stays a row offered, whatever saved it.

	It is never a promotion's free row; it is kept at 100 % (a pricing rule applied on a desk save may have priced it:
	its discount goes back to 100 % and the totals are computed again); and on a till's sale it is refused where the till
	does not let its cashiers change a discount.
	"""
	rows = offered_rows(doc)
	if not rows:
		return
	if _is_pos(doc) and not doc.get("is_return") and not till_allows_offers(doc.get("pos_profile")):
		frappe.throw(
			_("This till does not let its cashiers change a discount: a line cannot be offered there."),
			frappe.PermissionError,
		)
	changed = False
	for row in rows:
		if cint(row.get("is_free_item")):
			frappe.throw(_("Row {0}: a free item of a promotion cannot be offered.").format(row.idx))
		if flt(row.discount_percentage) != 100 or row.get("pricing_rules"):
			row.discount_percentage = 100
			row.pricing_rules = ""
			changed = True
	if changed:
		doc.calculate_taxes_and_totals()


@contextmanager
def without_offered_rows(doc):
	"""The document with its offered rows set aside for the length of an ERPNext check that concerns the rows sold
	(pos_next.overrides.sales_invoice): its own list of rows is put back as it was, whatever the check does."""
	rows = doc.get("items") or []
	kept = [row for row in rows if not is_offered(row)]
	if len(kept) == len(rows):
		yield
		return
	doc.items = kept
	try:
		yield
	finally:
		doc.items = rows


def offered_summary(invoices) -> dict:
	"""What the submitted invoices of a shift offered: the units and their value at list price, in the company's
	currency (a return of an offered row counts back). `invoices` are invoice dicts or documents with their items."""
	count = 0.0
	value = 0.0
	for invoice in invoices or []:
		if cint(invoice.get("docstatus")) != 1:
			continue
		rate = flt(invoice.get("conversion_rate")) or 1
		for row in offered_rows(invoice):
			qty = flt(row.get("qty"))
			count += qty
			value += qty * flt(row.get("base_price_list_rate") or flt(row.get("price_list_rate")) * rate)
	return {"offered_count": flt(count, 4), "offered_value": flt(value, 2)}


def _closing_invoices(doc) -> list[str]:
	return [
		row.get("sales_invoice") for row in (doc.get("pos_transactions") or []) if row.get("sales_invoice")
	]


def _count_text(count) -> str:
	return str(int(count)) if flt(count) == int(flt(count)) else f"{flt(count):g}"


def get_offered_line(doc) -> str:
	"""The end-of-day print's line « Offerts : n articles, valeur CHF x » for a POS Closing Shift (Jinja method), or ""
	when nothing was offered during the shift."""
	if isinstance(doc, str):
		doc = frappe.get_doc("POS Closing Shift", doc)
	names = _closing_invoices(doc)
	if not names or not frappe.db.has_column(ITEM_DOCTYPE, FIELD):
		return ""
	# Two reads for the whole shift: its offered rows, then the invoices that hold them
	rows = frappe.get_all(
		ITEM_DOCTYPE,
		filters={"parent": ["in", names], "parenttype": "Sales Invoice", FIELD: 1},
		fields=["parent", "qty", "price_list_rate", "base_price_list_rate", FIELD],
	)
	if not rows:
		return ""
	invoices = {
		invoice.name: {**invoice, "items": []}
		for invoice in frappe.get_all(
			"Sales Invoice",
			filters={"name": ["in", list({row.parent for row in rows})]},
			fields=["name", "docstatus", "conversion_rate"],
		)
	}
	for row in rows:
		if row.parent in invoices:
			invoices[row.parent]["items"].append(row)
	summary = offered_summary(invoices.values())
	count = summary["offered_count"]
	if not count:
		return ""
	currency = (
		frappe.get_cached_value("Company", doc.get("company"), "default_currency")
		if doc.get("company")
		else None
	)
	value = fmt_money(summary["offered_value"], currency=currency)
	if count == 1:
		return _("Offered: {0} item, value {1}").format(_count_text(count), value)
	return _("Offered: {0} items, value {1}").format(_count_text(count), value)


def offered_label() -> str:
	"""« Offert » in the language of the request: the word a guest's page shows (its translations are not the till's)."""
	return _("Offered", context=CONTEXT)
