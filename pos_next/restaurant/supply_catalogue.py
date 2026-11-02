# //// Neoffice — added file (no upstream equivalent). The purchase catalogue of a restaurant, as the Achats screen reads it
# //// (NeoResto, purchases, lot A). Study: Obsidian `Neoffice/NeoResto/14-…` and `18-…`.
"""The articles a restaurant buys, with who sells them, in which packaging and at what price.

Nothing here is stored: it is read from the ERP's own fiches, in a handful of queries however many articles there are.
- the articles are the Items ticked « Restaurant Supply » (the owner's regular purchases), not disabled;
- a packaging is a row of the item's table of suppliers (`supply_uom`), worth `conversion_factor` of the item's stock unit;
- its price is the LAST PRICE PAID at that supplier (the last submitted purchase invoice line of that unit), else the
  catalogue price (the buying Item Price of that supplier and unit), else none: an owner who never types a price still
  has a catalogue, and an estimate that says on how many lines it rests (the Achats screen's total).
"""

import frappe
from frappe import _
from frappe.utils import cint, flt
from frappe.utils.nestedset import get_descendants_of

from pos_next.restaurant import permissions
from pos_next.restaurant.mode import neoresto_active

# The site flag that shows the Achats screen: in site_config.json, off unless the site switches it on, as `neoresto_active`
# is (NeoResto itself must run too). The screen ships dark: nothing of the purchases shows where the flag is off.
SITE_FLAG = "neoresto_purchases_active"


def purchases_active() -> bool:
	"""Whether the site shows the purchases of the restaurant: NeoResto runs and `neoresto_purchases_active` says 1."""
	return neoresto_active() and cint(frappe.conf.get(SITE_FLAG, 0)) == 1


def require_purchases() -> None:
	"""Refuse, with a short message, a call of the Achats screen where the site does not show the purchases."""
	if not purchases_active():
		frappe.throw(_("Purchases are not available"), frappe.PermissionError)


# What the screen may ask for: every article, what is sold as it is bought (« on the menu »), or what is only bought
SCOPES = {"menu": 1, "supplies": 0}
LIMIT = 300


def catalogue(search=None, supplier=None, item_group=None, scope=None, limit=LIMIT) -> dict:
	"""The restaurant's articles for the Achats screen: `rows`, the `families` and the `suppliers` to filter by, and `total`.

	`search` matches the name or the code; `supplier` keeps the articles that supplier sells; `item_group` keeps a family and
	the families under it; `scope` is `menu` (sold as bought), `supplies` (bought, never sold) or nothing (all).
	"""
	permissions.require("Item", "read")
	base = {"is_restaurant_supply": 1, "disabled": 0}
	filters = dict(base)
	if scope in SCOPES:
		filters["is_sales_item"] = SCOPES[scope]
	if item_group:
		filters["item_group"] = ["in", [item_group, *get_descendants_of("Item Group", item_group)]]
	if supplier:
		sold = frappe.get_all(
			"Item Supplier", filters={"parenttype": "Item", "supplier": supplier}, pluck="parent"
		)
		filters["name"] = ["in", sold or [""]]
	search = (search or "").strip()
	or_filters = [["item_name", "like", f"%{search}%"], ["name", "like", f"%{search}%"]] if search else None
	items = frappe.get_list(
		"Item",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "item_name", "item_group", "stock_uom", "is_sales_item", "supply_place"],
		order_by="item_name asc",
		limit_page_length=min(int(limit or LIMIT), 1000),
	)
	rows = _with_packs(items)
	return {
		"rows": rows,
		"total": len(rows),
		"families": _facets("Item", "item_group", base),
		"suppliers": _supplier_facets(base),
	}


def item_packs(item: str) -> list[dict]:
	"""The packagings of ONE article, as the catalogue shows them: who sells it, in which unit, at what price (the shopping
	list reads them to pick a packaging and a supplier for a line)."""
	permissions.require("Item", "read", item)
	row = frappe.get_all(
		"Item",
		filters={"name": item},
		fields=["name", "item_name", "item_group", "stock_uom", "is_sales_item", "supply_place"],
	)
	return _with_packs(row)[0]["packs"] if row else []


def _facets(doctype, field, filters):
	return [
		{"name": row[field], "count": row.n}
		for row in frappe.get_all(
			doctype,
			filters=filters,
			fields=[field, "count(name) as n"],
			group_by=field,
			order_by=f"{field} asc",
		)
		if row[field]
	]


def _supplier_facets(base):
	names = frappe.get_all("Item", filters=base, pluck="name")
	if not names:
		return []
	rows = frappe.get_all(
		"Item Supplier",
		filters={"parenttype": "Item", "parent": ["in", names]},
		fields=["supplier", "count(distinct parent) as n"],
		group_by="supplier",
		order_by="supplier asc",
	)
	return [{"name": row.supplier, "count": row.n} for row in rows]


def _with_packs(items) -> list[dict]:
	if not items:
		return []
	codes = [item.name for item in items]
	suppliers = frappe.get_all(
		"Item Supplier",
		filters={"parenttype": "Item", "parent": ["in", codes]},
		fields=["parent", "supplier", "supply_uom", "supplier_part_no"],
		order_by="parent asc, idx asc",
	)
	factors = {
		(row.parent, row.uom): flt(row.conversion_factor)
		for row in frappe.get_all(
			"UOM Conversion Detail",
			filters={"parenttype": "Item", "parent": ["in", codes]},
			fields=["parent", "uom", "conversion_factor"],
		)
	}
	catalogue_prices = {
		(row.item_code, row.supplier, row.uom): flt(row.price_list_rate)
		for row in frappe.get_all(
			"Item Price",
			filters={"item_code": ["in", codes], "buying": 1, "supplier": ["is", "set"]},
			fields=["item_code", "supplier", "uom", "price_list_rate"],
			order_by="valid_from asc, creation asc",
		)
	}
	paid = _last_paid(codes)
	usual = {
		row.parent: row.default_supplier
		for row in frappe.get_all(
			"Item Default",
			filters={"parenttype": "Item", "parent": ["in", codes], "default_supplier": ["is", "set"]},
			fields=["parent", "default_supplier"],
			order_by="idx desc",
		)
	}
	packs = {code: [] for code in codes}
	for row in suppliers:
		content = factors.get((row.parent, row.supply_uom)) if row.supply_uom else None
		last = paid.get((row.parent, row.supplier, row.supply_uom))
		catalogue_price = catalogue_prices.get((row.parent, row.supplier, row.supply_uom))
		price, source = (
			(last["rate"], "invoice")
			if last
			else (catalogue_price, "catalogue")
			if catalogue_price is not None
			else (None, None)
		)
		packs[row.parent].append(
			{
				"supplier": row.supplier,
				"uom": row.supply_uom,
				"content": content,
				"part_no": row.supplier_part_no,
				"price": price,
				"price_source": source,
				"paid_on": str(last["date"]) if last else None,
				"unit_price": round(price / content, 4) if price is not None and content else None,
				"usual": usual.get(row.parent) == row.supplier,
			}
		)
	return [
		{
			"item": item.name,
			"item_name": item.item_name,
			"item_group": item.item_group,
			"stock_uom": item.stock_uom,
			"sold": bool(item.is_sales_item),
			"place": item.supply_place,
			"packs": packs[item.name],
		}
		for item in items
	]


def _last_paid(codes) -> dict:
	"""{(item, supplier, unit): {rate, date}} from the last submitted purchase invoice line of each, in the company's money."""
	found = {}
	rows = frappe.db.sql(
		"""select line.item_code, invoice.supplier, line.uom, line.base_rate as rate, invoice.posting_date as date
		from `tabPurchase Invoice Item` line
		join `tabPurchase Invoice` invoice on invoice.name = line.parent
		where invoice.docstatus = 1 and invoice.is_return = 0 and line.item_code in %(codes)s
		order by invoice.posting_date desc, invoice.creation desc""",
		{"codes": tuple(codes)},
		as_dict=True,
	)
	for row in rows:
		found.setdefault((row.item_code, row.supplier, row.uom), {"rate": flt(row.rate), "date": row.date})
	return found
