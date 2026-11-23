# //// Neoffice — added file (no upstream equivalent). A return takes back the invoice-level discount its sale spent, in
# //// proportion to the lines it takes back. The till's return dialog builds its credit note line by line and sent no
# //// discount, so a sale of 21.62 paid 20.00 (a gift card, or any discount of 1.62) was returned for 21.62 in cash while the
# //// card was credited its 1.62 again. ERPNext's own return copies the discount (`make_return_doc`); the till's did not.
"""The share of its sale's discount a return carries.

A sale that took a discount on the invoice (a gift card spent as a discount, an additional discount of the till) was paid
`goods - discount`. Its return must give back the same: the lines it takes back, less their share of the discount. The share is
worked out ONE way, here, for the dialog (what the cashier is shown to refund, `invoice_discount_per_unit` on each line) and for
the invoice (what the credit note carries, `carry_the_discount_of_the_returned_sale`):

- the discount still to give back is the sale's, less what its earlier returns already carried;
- it is spread over the lines still to give back, in proportion to their amounts;
- the return that takes everything left back takes all of what is left of the discount, to the cent.
"""

import frappe
from frappe.utils import cint, flt


def _key_of_line(line_name, item_code):
	return line_name or item_code


def _state(return_against: str):
	"""What a return of `return_against` has to give back: the sale's discount still to return, the amount of the lines still
	to return, and each sold line's price per unit and how many units are still to return. None when the sale had no discount."""
	sale = frappe.db.get_value(
		"Sales Invoice", return_against, ["discount_amount", "apply_discount_on"], as_dict=True
	)
	if not sale or not flt(sale.discount_amount):
		return None
	sold = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": return_against, "parenttype": "Sales Invoice"},
		fields=["name", "item_code", "qty", "amount"],
		order_by="idx asc",
	)
	lines = {line.name: line for line in sold if flt(line.qty)}
	first_of_item = {}
	for line in lines.values():
		first_of_item.setdefault(line.item_code, line.name)

	returned = frappe.db.sql(
		"""
		select coalesce(it.sales_invoice_item, it.item_code) as k, sum(abs(it.qty)) as units
		from `tabSales Invoice Item` it
		join `tabSales Invoice` si on si.name = it.parent
		where si.return_against = %s and si.docstatus = 1 and si.is_return = 1
		group by coalesce(it.sales_invoice_item, it.item_code)
		""",
		(return_against,),
		as_dict=True,
	)
	units_back = {}
	for row in returned:
		name = row.k if row.k in lines else first_of_item.get(row.k)
		if name:
			units_back[name] = units_back.get(name, 0) + flt(row.units)

	already_discount = flt(
		frappe.db.sql(
			"select coalesce(sum(abs(discount_amount)), 0) from `tabSales Invoice` "
			"where return_against = %s and docstatus = 1 and is_return = 1",
			(return_against,),
		)[0][0]
	)
	per_unit, to_return, remaining_amount = {}, {}, 0.0
	for name, line in lines.items():
		per_unit[name] = flt(line.amount) / flt(line.qty)
		to_return[name] = max(flt(line.qty) - units_back.get(name, 0), 0)
		remaining_amount += per_unit[name] * to_return[name]
	return {
		"remaining_discount": max(flt(sale.discount_amount) - already_discount, 0),
		"apply_discount_on": sale.apply_discount_on,
		"remaining_amount": remaining_amount,
		"per_unit": per_unit,
		"to_return": to_return,
		"first_of_item": first_of_item,
	}


def _resolve(state, line_name, item_code):
	if line_name in state["per_unit"]:
		return line_name
	return state["first_of_item"].get(item_code)


def discount_of_the_lines(return_against: str, lines: list[dict]):
	"""The discount a return takes back with `lines` ({sales_invoice_item, item_code, qty}), as (amount, apply_discount_on),
	or None when the sale carried none. The amount is positive: the credit note stores it negative."""
	state = _state(return_against)
	if not state or state["remaining_amount"] <= 0 or state["remaining_discount"] <= 0:
		return None
	taken = 0.0
	for line in lines:
		name = _resolve(state, line.get("sales_invoice_item"), line.get("item_code"))
		if name:
			taken += state["per_unit"][name] * min(abs(flt(line.get("qty"))), state["to_return"][name])
	share = min(taken / state["remaining_amount"], 1.0)
	precision = cint(frappe.get_cached_value("System Settings", None, "currency_precision")) or 2
	return flt(state["remaining_discount"] * share, precision), state["apply_discount_on"]


def carry_the_discount_of_the_returned_sale(doc) -> None:
	"""A credit note of the till takes the share of its sale's discount that its lines carry (see the module's text). The server
	is the only writer of it: a discount the till sent (an old till, a dialog that does not know) is replaced, since a return that
	named none, or less, would refund more than the sale cost. A sale that had no discount leaves its return as it comes."""
	if doc.doctype != "Sales Invoice" or not cint(doc.get("is_return")) or not doc.get("return_against"):
		return
	found = discount_of_the_lines(
		doc.return_against,
		[
			{"sales_invoice_item": row.get("sales_invoice_item"), "item_code": row.get("item_code"), "qty": row.get("qty")}
			for row in doc.get("items") or []
		],
	)
	if not found or not found[0]:
		return
	amount, apply_on = found
	doc.apply_discount_on = apply_on
	doc.additional_discount_percentage = 0
	doc.discount_amount = -amount


def attach_the_discount_per_unit(return_dict: dict) -> dict:
	"""Give each line the till will offer to return the part of the sale's discount it carries (`invoice_discount_per_unit`,
	0 when the sale had none), so that the dialog shows the cashier the refund the credit note will really make. Works on the
	dict `prepare_return_invoice` answers; each line is spread by the same rule the credit note's invoice applies."""
	items = return_dict.get("items") or []
	state = _state(return_dict.get("return_against")) if return_dict.get("return_against") else None
	for item in items:
		item["invoice_discount_per_unit"] = 0
	if not state or state["remaining_amount"] <= 0 or state["remaining_discount"] <= 0:
		return return_dict
	precision = cint(frappe.get_cached_value("System Settings", None, "currency_precision")) or 2
	rate = state["remaining_discount"] / state["remaining_amount"]
	for item in items:
		name = _resolve(state, item.get("sales_invoice_item") or item.get("name"), item.get("item_code"))
		if name:
			item["invoice_discount_per_unit"] = flt(state["per_unit"][name] * rate, max(precision, 6))
	return_dict["invoice_discount_to_return"] = flt(state["remaining_discount"], precision)
	return return_dict
