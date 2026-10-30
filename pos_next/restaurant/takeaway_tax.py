# //// Neoffice — added file (no upstream equivalent). A takeaway sale takes the takeaway tax category of the
# //// restaurant its till works for (NeoRestau lot 1, task 10). In Switzerland food to take away is taxed at 2.6 %
# //// instead of 8.1 % on site, and alcohol stays at 8.1 % even to take away: the rate is the item's, not the sale's.
# //// ERPNext's own mechanism carries that rule and is reused as it is, the one the desk invoices already use: a Tax
# //// Category on the invoice and, on the item or on its item group (which its items inherit, up the tree), an Item
# //// Tax row for that category; an item without one keeps its usual rate. The server is the reference: the invoice's
# //// taxes come from ERPNext's own lookup, made here once for the invoice and for what the till is told.
"""A takeaway sale takes its restaurant's takeaway tax category, item by item."""

import frappe
from frappe.utils import cint, cstr

from pos_next.restaurant.mode import effective_restaurant_mode
from pos_next.restaurant.settings import pos_settings_of


def takeaway_tax_category(pos_profile: str | None) -> str | None:
	"""The takeaway tax category of the restaurant a till works for; None when the till is not a restaurant till, or
	its restaurant names none.

	Only a till that works as a restaurant till has one (`effective_restaurant_mode` of its POS Settings: its tick,
	NeoRestau on the site and the restaurant it names): a counter till, or any till of a site where NeoRestau is off,
	sells at the usual rates, whatever its sales say about taking away. A sale with no till names no restaurant either:
	it never falls back on the default restaurant.
	"""
	if not pos_profile:
		return None
	try:
		till = pos_settings_of(pos_profile, ["enable_restaurant_mode", "restaurant"])
		if not till or not effective_restaurant_mode(till):
			return None
		return frappe.db.get_value("Restaurant", till.restaurant, "takeaway_tax_category") or None
	except Exception as error:
		# The code is updated and the site is not migrated yet: no restaurant names a category
		if frappe.db.is_missing_column(error):
			return None
		raise


def till_tax_category(pos_profile: str | None) -> str:
	"""The till's own tax category (its POS Profile's), the one an item's usual rate is read for; "" when it has none."""
	return cstr(frappe.get_cached_value("POS Profile", pos_profile, "tax_category")) if pos_profile else ""


def _item_group_taxes(item_group: str | None, chains: dict) -> list:
	"""The Item Tax rows of an item group and of each of its parents, the nearest first, as ERPNext walks them up.

	Kept in `chains` (one per item group): a lookup made for many items reads each item group once.
	"""
	if item_group not in chains:
		chain, group, seen = [], item_group, set()
		while group and group not in seen:
			seen.add(group)
			doc = frappe.get_cached_doc("Item Group", group)
			chain.append(doc.get("taxes") or [])
			group = doc.parent_item_group
		chains[item_group] = chain
	return chains[item_group]


def item_tax_template(
	args: dict, item_taxes, item_group: str | None, chains: dict | None = None
) -> str | None:
	"""The Item Tax Template ERPNext gives an item for `args["tax_category"]`: the first valid row for that category
	among the item's own Item Tax rows, then among its item group's and each parent's, the nearest first. It is ERPNext's
	choice (`erpnext.stock.get_item_details.get_item_tax_template`), row by row with ERPNext's own
	`_get_item_tax_template`, made without a template already chosen (which ERPNext would keep, whatever the category).

	`args` carries `company` and the `tax_category`, and the dates and net rate ERPNext reads for a row's validity.
	"""
	from erpnext.stock.get_item_details import _get_item_tax_template

	chains = {} if chains is None else chains
	for taxes in (item_taxes, *_item_group_taxes(item_group, chains)):
		if taxes:
			template = _get_item_tax_template(args, taxes)
			if template:
				return template
	return None


def takeaway_item_tax_template(
	args: dict,
	item_taxes,
	item_group: str | None,
	category: str,
	usual_category: str,
	chains: dict | None = None,
) -> str | None:
	"""The template of an item sold to take away: its row for the takeaway category, else its usual one (the till's own
	category): alcohol, which has no takeaway row, keeps its 8.1 %."""
	chains = {} if chains is None else chains
	return item_tax_template(
		{**args, "tax_category": category}, item_taxes, item_group, chains
	) or item_tax_template({**args, "tax_category": usual_category}, item_taxes, item_group, chains)


def apply_takeaway_tax_category(doc, method=None) -> None:
	"""`before_validate` of a Sales Invoice: a takeaway sale at a restaurant till takes the restaurant's takeaway tax
	category, and each of its items the template ERPNext's own lookup gives for it (see `takeaway_item_tax_template`),
	with the matching `item_tax_rate`; the validate that follows computes the taxes from them. An item without a
	takeaway row keeps its usual template.

	A sale on site, a sale outside a till, a return (it keeps the taxes of the sale it returns, as ERPNext's own
	validation does) and a till with no takeaway category are left exactly as they come.
	"""
	if not cint(doc.get("is_pos")) or not cint(doc.get("is_takeaway")) or cint(doc.get("is_return")):
		return
	category = takeaway_tax_category(doc.get("pos_profile"))
	if not category:
		return
	from erpnext.stock.get_item_details import get_item_tax_map

	doc.tax_category = category
	usual_category = till_tax_category(doc.get("pos_profile"))
	chains = {}
	for item in doc.get("items") or []:
		if not item.get("item_code"):
			continue
		master = frappe.get_cached_doc("Item", item.item_code)
		# What ERPNext's own validation reads for a row's validity (validate_item_tax_template)
		args = {
			"company": doc.company,
			"posting_date": doc.get("posting_date"),
			"transaction_date": doc.get("posting_date"),
			"net_rate": item.get("net_rate") or item.get("rate"),
			"base_net_rate": item.get("base_net_rate") or item.get("base_rate"),
		}
		template = takeaway_item_tax_template(
			args, master.get("taxes"), master.item_group, category, usual_category, chains
		)
		item.item_tax_template = template
		item.item_tax_rate = get_item_tax_map(doc.company, template, as_json=True)
