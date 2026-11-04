# //// Neoffice — added file (no upstream equivalent). The shopping list of a restaurant (NeoResto purchases, lot B). Study:
# //// Obsidian `Neoffice/NeoResto/14-…` and `18-…`.
"""What the owner of a restaurant is going to buy: a list of lines to tick, grouped by supplier, with an estimate.

A line is an ARTICLE of the restaurant's purchases in one of its packagings at one supplier, or a FREE line (a text and a
quantity: something bought once, that is not an article). The list is the owner's own table: nothing here is a purchase order
or an invoice, and nothing keeps a stock. The packaging, the supplier and the price of an article line come from the ERP's
own fiches, through the catalogue (`supply_catalogue`): the supplier is the usual one, or the one the owner picks the day
he buys, and the price is the last price paid there, else the catalogue price, else none.

How a line is gone through depends on how the restaurant orders from that supplier (its `order_mode`): by e-mail or by phone
it is « To order », then « Ordered »; on site (the default) it is « To buy », then « Bought ». A line can also be put aside:
« Not needed », « Already in stock » (a state of the line, never a quantity), « Not found ».

Rights are the doctype's own (`permissions.require`), and the article, packaging and price are read under the user's rights.
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from pos_next.restaurant import permissions, supply_catalogue

DOCTYPE = "Restaurant Shopping List"
LINE_STATES = ("To order", "Ordered", "To buy", "Bought", "Not needed", "Already in stock", "Not found")
# A line that is bought or put aside is closed: asking for the article again is a new line, not more of that one
CLOSED_STATES = ("Bought", "Not needed", "Already in stock")
# Lines that are no longer to be bought: they are in no count and in no estimate
OUT_OF_COUNT = ("Not needed", "Already in stock")
ORDERED_STATES = ("To order", "Ordered")
ORDER_MODES = ("Email", "Phone", "On site")
NO_SUPPLIER = ""


def order_mode_of(supplier: str | None) -> str:
	"""How the restaurant orders from a supplier; on site where the supplier says nothing, or there is none."""
	mode = frappe.db.get_value("Supplier", supplier, "order_mode") if supplier else None
	return mode if mode in ORDER_MODES else "On site"


def starting_state(supplier: str | None) -> str:
	"""The state a line starts in: to order where the supplier is ordered from, else to buy."""
	return "To order" if order_mode_of(supplier) in ("Email", "Phone") else "To buy"


def validate_list(doc) -> None:
	"""A line is an article or a text, holds something, and the list works out what it is worth and how many lines it rests on."""
	counted = priced = 0
	total = 0.0
	for line in doc.lines:
		if not line.item and not (line.free_text or "").strip():
			frappe.throw(_("Row {0}: name an article or write what to buy.").format(line.idx))
		if flt(line.qty) <= 0:
			frappe.throw(_("Row {0}: the quantity must be more than zero.").format(line.idx))
		if line.line_state in OUT_OF_COUNT:
			continue
		counted += 1
		if flt(line.estimated_rate) > 0:
			priced += 1
			total += flt(line.qty) * flt(line.estimated_rate)
	doc.counted_lines = counted
	doc.priced_lines = priced
	doc.estimated_total = total


def new_list(company: str | None = None, cost_center: str | None = None, list_date: str | None = None) -> str:
	"""Start a list, for a company and, where it has several restaurants, the cost center of this one; answers its name."""
	permissions.require(DOCTYPE, "create")
	company = (
		company
		or frappe.defaults.get_user_default("Company")
		or frappe.db.get_single_value("Global Defaults", "default_company")
	)
	if not company:
		frappe.throw(_("Say which company the list is for."))
	doc = frappe.get_doc(
		{
			"doctype": DOCTYPE,
			"company": company,
			"cost_center": cost_center or None,
			"list_date": list_date or nowdate(),
			"status": "Draft",
		}
	)
	doc.insert()
	return doc.name


def _list(name: str):
	permissions.require(DOCTYPE, "write", name)
	if not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("The list {0} does not exist.").format(name), frappe.DoesNotExistError)
	return frappe.get_doc(DOCTYPE, name)


def _row(doc, row_name: str):
	row = next((r for r in doc.lines if r.name == row_name), None)
	if not row:
		frappe.throw(_("That line is no longer on the list."), frappe.DoesNotExistError)
	return row


def _pick_pack(item: str, packs: list[dict], supplier: str | None, uom: str | None):
	"""The packaging a line starts with: the one asked for, else the usual supplier's, else the first one; None where the
	article has no packaging yet (it is then counted in its own unit)."""
	candidates = [
		p for p in packs if (not supplier or p["supplier"] == supplier) and (not uom or p["uom"] == uom)
	]
	if not candidates:
		if uom and not frappe.db.exists(
			"UOM Conversion Detail", {"parent": item, "parenttype": "Item", "uom": uom}
		):
			frappe.throw(_("{0} is not a unit of the article {1}.").format(uom, item))
		return None
	return next((p for p in candidates if p["usual"]), candidates[0])


def add_article_line(
	list_name: str,
	item: str,
	qty=1,
	supplier: str | None = None,
	uom: str | None = None,
	origin: str = "Manual",
) -> str:
	"""Put an article on the list, in a packaging and at a supplier; answers the line's name.

	Neither given: the usual supplier's first packaging. The same article, packaging and supplier already on the list (and not
	closed: bought, or put aside) takes the quantity instead of a second line.
	"""
	doc = _list(list_name)
	packs = supply_catalogue.item_packs(item)
	if not frappe.db.exists("Item", item):
		frappe.throw(_("The article {0} does not exist.").format(item), frappe.DoesNotExistError)
	pack = _pick_pack(item, packs, supplier, uom)
	supplier = supplier or (pack["supplier"] if pack else None)
	uom = uom or (pack["uom"] if pack else frappe.db.get_value("Item", item, "stock_uom"))
	same = next(
		(
			r
			for r in doc.lines
			if r.item == item
			and r.uom == uom
			and (r.supplier or None) == (supplier or None)
			and r.line_state not in CLOSED_STATES
		),
		None,
	)
	if same:
		same.qty = flt(same.qty) + flt(qty)
		line = same
	else:
		line = doc.append(
			"lines",
			{
				"item": item,
				"qty": flt(qty),
				"uom": uom,
				"supplier": supplier,
				"line_state": starting_state(supplier),
				"estimated_rate": (pack or {}).get("price"),
				"origin": origin,
			},
		)
	doc.save()
	return line.name if line.name else doc.lines[-1].name


def add_article_lines(list_name: str, lines: list[dict]) -> int:
	"""Put several articles on the list at once, as its picker sends them; answers how many went on.

	Each line is {item, qty} and, when the owner chose them, {supplier, uom}: it goes on as add_article_line puts it, so the
	usual supplier's packaging stands where none is given and an article already on the list takes the quantity. Every
	article is looked for before the first is written, so that one that does not exist leaves the list as it was.
	"""
	_list(list_name)
	for line in lines:
		if not frappe.db.exists("Item", line.get("item")):
			frappe.throw(
				_("The article {0} does not exist.").format(line.get("item")), frappe.DoesNotExistError
			)
	for line in lines:
		add_article_line(
			list_name,
			line["item"],
			line.get("qty") or 1,
			line.get("supplier") or None,
			line.get("uom") or None,
			# //// Neoffice — a line made from a dish says so (lot R6); a line without an origin stays « Manual »
			origin=line.get("origin") if line.get("origin") in ("Dish", "Stores round") else "Manual",
		)
	return len(lines)


def add_free_line(
	list_name: str, text: str, qty=1, unit_text: str | None = None, supplier: str | None = None
) -> str:
	"""Put on the list something that is not an article: a text, a quantity and, if known, a supplier."""
	doc = _list(list_name)
	text = (text or "").strip()
	if not text:
		frappe.throw(_("Write what to buy."))
	doc.append(
		"lines",
		{
			"free_text": text,
			"qty": flt(qty),
			"unit_text": (unit_text or "").strip() or None,
			"supplier": supplier or None,
			"line_state": starting_state(supplier),
			"origin": "Manual",
		},
	)
	doc.save()
	return doc.lines[-1].name


def change_supplier(list_name: str, row_name: str, supplier: str | None) -> None:
	"""Buy a line elsewhere: its supplier changes, and with it the packaging and the price where that supplier sells the
	article (else the packaging is kept and no price is known)."""
	doc = _list(list_name)
	line = _row(doc, row_name)
	supplier = supplier or None
	if line.item:
		packs = supply_catalogue.item_packs(line.item)
		mine = [p for p in packs if p["supplier"] == supplier] if supplier else []
		pack = next((p for p in mine if p["uom"] == line.uom), None) or (mine[0] if mine else None)
		if pack:
			line.uom = pack["uom"]
		line.estimated_rate = (pack or {}).get("price")
	line.supplier = supplier
	if line.line_state in ("To order", "To buy"):
		line.line_state = starting_state(supplier)
	doc.save()


def set_state(list_name: str, row_name: str, state: str, taken_qty=None, paid_rate=None) -> None:
	"""Tick a line: Bought, Ordered, or put aside (Not needed, Already in stock, Not found). The quantity taken and the price
	paid are optional."""
	if state not in LINE_STATES:
		frappe.throw(_("{0} is not a state of a line.").format(state))
	doc = _list(list_name)
	line = _row(doc, row_name)
	line.line_state = state
	if taken_qty is not None and str(taken_qty) != "":
		line.taken_qty = flt(taken_qty)
	if paid_rate is not None and str(paid_rate) != "":
		line.paid_rate = flt(paid_rate)
	doc.save()


def set_quantity(list_name: str, row_name: str, qty) -> None:
	doc = _list(list_name)
	_row(doc, row_name).qty = flt(qty)
	doc.save()


def remove_line(list_name: str, row_name: str) -> None:
	doc = _list(list_name)
	line = _row(doc, row_name)
	doc.remove(line)
	doc.save()


def round_answer(list_name: str, item: str, answer: str) -> str:
	"""One answer of the stores round (« I order that, I have this, that one is fine »): `order` puts the article on the list, in
	its usual packaging; `enough` notes that it was looked at and is in stock (a state of the line, never a quantity), and puts
	aside what was already asked for. Answers the line's name."""
	if answer not in ("order", "enough"):
		frappe.throw(_("{0} is not an answer of the stores round.").format(answer))
	if answer == "order":
		return add_article_line(list_name, item, 1, origin="Stores round")
	doc = _list(list_name)
	asked = [row for row in doc.lines if row.item == item and row.line_state not in ("Bought",)]
	if not asked:
		row = add_article_line(list_name, item, 1, origin="Stores round")
		set_state(list_name, row, "Already in stock")
		return row
	for row in asked:
		row.line_state = "Already in stock"
	doc.save()
	return asked[0].name


def grouped(list_name: str) -> dict:
	"""The list as the screen and the paper show it: one block per supplier (those without one last), each with how it is
	ordered from, its lines and what they are worth, and the list's own estimate with the number of lines it rests on."""
	permissions.require(DOCTYPE, "read", list_name)
	doc = frappe.get_doc(DOCTYPE, list_name)
	suppliers = sorted({line.supplier for line in doc.lines if line.supplier})
	blocks = []
	for supplier in [*suppliers, NO_SUPPLIER]:
		lines = [line for line in doc.lines if (line.supplier or NO_SUPPLIER) == supplier]
		if not lines:
			continue
		counted = [line for line in lines if line.line_state not in OUT_OF_COUNT]
		priced = [line for line in counted if flt(line.estimated_rate) > 0]
		details = (
			frappe.db.get_value(
				"Supplier", supplier, ["order_mode", "usual_delivery", "order_email"], as_dict=True
			)
			if supplier
			else None
		)
		blocks.append(
			{
				"supplier": supplier or None,
				"mode": order_mode_of(supplier),
				"delivery": details.usual_delivery if details else None,
				"order_email": details.order_email if details else None,
				"lines": [_line_dict(line) for line in lines],
				"counted": len(counted),
				"priced": len(priced),
				"subtotal": sum(flt(line.qty) * flt(line.estimated_rate) for line in priced),
			}
		)
	return {
		"name": doc.name,
		"list_date": str(doc.list_date),
		"status": doc.status,
		"company": doc.company,
		"cost_center": doc.cost_center,
		"estimated_total": flt(doc.estimated_total),
		"priced_lines": doc.priced_lines,
		"counted_lines": doc.counted_lines,
		"blocks": blocks,
	}


def _line_dict(line) -> dict:
	return {
		"name": line.name,
		"item": line.item,
		"label": line.item_name or line.free_text,
		"free": not line.item,
		"qty": flt(line.qty),
		"uom": line.uom,
		"unit_text": line.unit_text,
		"state": line.line_state,
		"rate": flt(line.estimated_rate) or None,
		"taken_qty": flt(line.taken_qty) or None,
		"paid_rate": flt(line.paid_rate) or None,
		"origin": line.origin,
	}
