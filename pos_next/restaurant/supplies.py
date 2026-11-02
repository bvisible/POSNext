# //// Neoffice — added file (no upstream equivalent). The supplies a restaurant buys, written in the ERP's own fiches
# //// (NeoResto, purchases, lot A). Study: Obsidian `Neoffice/NeoResto/14-…` and `18-…`.
"""What the owner of a restaurant adds to an article to buy it.

A restaurant buys goods it never sells (a tomato sauce, pasta, salt) and goods it sells as they come (a bottled beer).
All of them are ERP Items. An article is the PRODUCT, not its supplier: the same salad can be bought from two suppliers,
each with its own packaging and its own price.

The ERP already has a place for each of these, so nothing is stored twice and no table is ours:
- a packaging ("Carton of 6") is a UNIT of the item, worth some of its stock unit (a table of units of the item);
- who sells the item is the item's table of SUPPLIERS (any number of rows; one per packaging a supplier sells, with its own
  reference): the row says which packaging, so that the link survives an owner who types no price;
- the price of a packaging at a supplier is a buying ITEM PRICE (item, unit, supplier, price list);
- the supplier the owner usually buys from is the item's DEFAULT SUPPLIER.

`add_supply_pack` writes those fiches in one gesture, as the session user: Frappe checks the ERP's own rights on each
document, and every right is asked BEFORE anything is written, so that a refusal leaves nothing behind. Nobody gets here
a right the ERP does not give (an account that only holds `Restaurant Manager` is refused; the customer's administrator,
who holds the item and purchase roles, is not).

`create_supply_item` makes an article that is bought and not sold: « sells » off (the ERP ticks it by default, and the till
lists what sells), no stock, no manufacturing.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next.restaurant import permissions


def _buying_price_list() -> str:
	"""The price list the buying prices are written in: the one of Buying Settings, else the first enabled buying one."""
	chosen = frappe.db.get_single_value("Buying Settings", "buying_price_list")
	if chosen and frappe.db.get_value("Price List", chosen, "enabled"):
		return chosen
	found = frappe.db.get_value("Price List", {"buying": 1, "enabled": 1}, "name", order_by="creation asc")
	if not found:
		frappe.throw(_("No buying price list is enabled, so the price of a packaging cannot be written."))
	return found


def create_supply_item(item_name: str, item_group: str, stock_uom: str) -> str:
	"""Make an article that is bought and never sold; answers its code.

	`stock_uom` is the unit the owner uses it in (a bottle, a kilogram, a piece): the packagings are counted in it.
	"""
	permissions.require("Item", "create")
	item_name = (item_name or "").strip()
	if not item_name:
		frappe.throw(_("Name the article."))
	if frappe.db.exists("Item", item_name) or frappe.db.exists("Item", {"item_name": item_name}):
		frappe.throw(_("The article {0} already exists.").format(item_name))
	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_name,
			"item_name": item_name,
			"item_group": item_group,
			"stock_uom": stock_uom,
			"is_stock_item": 0,
			"is_sales_item": 0,
			"is_purchase_item": 1,
			"include_item_in_manufacturing": 0,
			"is_restaurant_supply": 1,
		}
	)
	item.insert()
	return item.name


def add_supply_pack(
	item: str,
	supplier: str,
	pack_name: str,
	content,
	price=None,
	supplier_part_no: str | None = None,
	make_usual=0,
	company: str | None = None,
) -> dict:
	"""Write a packaging of an article, who sells it and, when given, the price: the three fiches of the ERP, at once.

	`content` is how many of the article's stock unit the packaging holds (6 for a « Carton of 6 » of bottles). `price` is
	the price of ONE packaging at that supplier and is optional: an owner who never types a price is never asked for it.
	`make_usual` also makes this supplier the article's default supplier for `company` (else the user's company).

	Played again with the same packaging, it writes nothing twice (the price is updated). The same packaging name with
	another content is refused: a name means one content on one article.
	"""
	pack_name = (pack_name or "").strip()
	content = flt(content)
	has_price = price is not None and str(price).strip() != ""
	price = flt(price) if has_price else None
	make_usual = cint(make_usual)

	# Every right first: a refusal writes nothing
	permissions.require("Item", "write", item)
	pack_is_new = bool(pack_name) and not frappe.db.exists("UOM", pack_name)
	if pack_is_new:
		permissions.require("UOM", "create")
	if has_price:
		permissions.require("Item Price", "write")
		permissions.require("Item Price", "create")
	if supplier:
		permissions.require("Supplier", "read", supplier)

	if not frappe.db.exists("Item", item):
		frappe.throw(_("The article {0} does not exist.").format(item), frappe.DoesNotExistError)
	if not supplier or not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("The supplier {0} does not exist.").format(supplier or ""), frappe.DoesNotExistError)
	if not pack_name:
		frappe.throw(_("Name the packaging."))
	if content <= 0:
		frappe.throw(_("A packaging holds at least one unit of the article."))
	if has_price and price < 0:
		frappe.throw(_("A price cannot be negative."))

	doc = frappe.get_doc("Item", item)
	if pack_name == doc.stock_uom:
		frappe.throw(
			_("{0} is the unit the article is counted in: name the packaging differently.").format(pack_name)
		)
	existing = [row for row in doc.uoms if row.uom == pack_name]
	if existing and flt(existing[0].conversion_factor) != content:
		frappe.throw(
			_("{0} already means {1} {2} on the article {3}: give this packaging another name.").format(
				pack_name, flt(existing[0].conversion_factor), doc.stock_uom, item
			)
		)

	if pack_is_new:
		frappe.get_doc({"doctype": "UOM", "uom_name": pack_name, "must_be_whole_number": 1}).insert()
		# A site's hooks may touch items when a unit is made: read the item again, so that its save sees what is there now
		doc.reload()
	if not existing:
		doc.append("uoms", {"uom": pack_name, "conversion_factor": content})

	# One row per packaging a supplier sells: it is what says WHICH packaging that supplier sells, price or none. A row of the
	# supplier that names no packaging yet (made by hand, or by an import) is taken over rather than doubled.
	sold_by = [row for row in doc.supplier_items if row.supplier == supplier]
	row = next((r for r in sold_by if r.supply_uom == pack_name), None) or next(
		(r for r in sold_by if not r.supply_uom), None
	)
	if row:
		row.supply_uom = pack_name
		if supplier_part_no and not row.supplier_part_no:
			row.supplier_part_no = supplier_part_no
	else:
		doc.append(
			"supplier_items",
			{"supplier": supplier, "supply_uom": pack_name, "supplier_part_no": supplier_part_no or None},
		)

	if make_usual:
		company = (
			company
			or frappe.defaults.get_user_default("Company")
			or frappe.db.get_single_value("Global Defaults", "default_company")
		)
		if not company:
			frappe.throw(_("Say which company the usual supplier is for."))
		row = next((r for r in doc.item_defaults if r.company == company), None)
		if row:
			row.default_supplier = supplier
		else:
			# The row names a warehouse of ITS company: left blank, a new row takes the user's default warehouse, which may
			# belong to another company of the site, and the item refuses it. No stock is kept: the warehouse is only valid.
			doc.append(
				"item_defaults",
				{
					"company": company,
					"default_supplier": supplier,
					"default_warehouse": frappe.db.get_value(
						"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
					),
				},
			)

	doc.save()

	price_list = None
	if has_price:
		price_list = _buying_price_list()
		filters = {
			"item_code": item,
			"uom": pack_name,
			"supplier": supplier,
			"price_list": price_list,
			"buying": 1,
		}
		name = frappe.db.get_value("Item Price", filters)
		if name:
			current = frappe.get_doc("Item Price", name)
			if flt(current.price_list_rate) != price:
				current.price_list_rate = price
				current.save()
		else:
			frappe.get_doc({"doctype": "Item Price", **filters, "price_list_rate": price}).insert()

	return {
		"item": item,
		"supplier": supplier,
		"uom": pack_name,
		"conversion_factor": content,
		"price_list": price_list,
		"price": price,
	}
