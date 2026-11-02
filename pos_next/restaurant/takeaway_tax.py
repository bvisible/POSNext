# //// Neoffice — added file (no upstream equivalent). A takeaway sale takes the takeaway tax category of the
# //// restaurant its till works for (NeoResto lot 1, task 10). In Switzerland food to take away is taxed at 2.6 %
# //// instead of 8.1 % on site, and alcohol stays at 8.1 % even to take away: the rate is the item's, not the sale's.
# //// ERPNext's own mechanism carries that rule and is reused as it is, the one the desk invoices already use: a Tax
# //// Category on the invoice and, on the item or on its item group (which its items inherit, up the tree), an Item
# //// Tax row for that category; an item without one keeps its usual rate. The server is the reference: the invoice's
# //// taxes come from ERPNext's own lookup, made here once for the invoice and for what the till is told (task 11:
# //// each item the till loads carries its VAT map on site and to take away, attach_item_tax_rates). A return from the
# //// till credits the VAT the returned sale charged (copy_taxes_of_the_returned_sale).
"""A takeaway sale takes its restaurant's takeaway tax category, item by item."""

import frappe
from frappe.utils import cint, cstr, flt, nowdate

from pos_next.restaurant.mode import effective_restaurant_mode
from pos_next.restaurant.settings import pos_settings_of


def takeaway_tax_category(pos_profile: str | None) -> str | None:
	"""The takeaway tax category of the restaurant a till works for; None when the till is not a restaurant till, or
	its restaurant names none.

	Only a till that works as a restaurant till has one (`effective_restaurant_mode` of its POS Settings: its tick,
	NeoResto on the site and the restaurant it names): a counter till, or any till of a site where NeoResto is off,
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


def _has_net_rate_ranges() -> bool:
	"""Whether an Item Tax row of the site (an item's or an item group's) is valid only within a net rate range: its
	choice then depends on the price, which a memoised lookup must take into account."""
	return bool(frappe.db.exists("Item Tax", {"maximum_net_rate": [">", 0]}))


def item_tax_template(args: dict, item_taxes, item_group: str | None, memo: dict | None = None) -> str | None:
	"""The Item Tax Template ERPNext gives an item for `args["tax_category"]`: ERPNext's own public lookup
	(`erpnext.stock.get_item_details.get_item_tax_template`, whitelisted, the one its get_item_details makes): the first
	valid row for that category among the item's own Item Tax rows, then among its item group's and each parent's, the
	nearest first. It is made without a template already chosen, which ERPNext would keep whatever the category.

	`args` carries `company`, the `tax_category`, and the dates and net rate ERPNext reads for a row's validity. `memo`
	keeps each answer by what it depends on (the item's own rows, its item group, the category, the day, and the price
	where a range exists): a catalogue of thousands of items asks ERPNext once per kind of item, not once per item, and
	ERPNext reads the item group's ancestors on each call.
	"""
	from erpnext.stock.get_item_details import get_item_tax_template

	rows = list(item_taxes or [])
	if memo is None:
		memo = {}
	if "__ranges__" not in memo:
		memo["__ranges__"] = _has_net_rate_ranges()
	key = (
		tuple(
			(
				row.item_tax_template,
				cstr(row.tax_category),
				cstr(row.valid_from),
				flt(row.minimum_net_rate),
				flt(row.maximum_net_rate),
			)
			for row in rows
		),
		item_group,
		cstr(args.get("tax_category")),
		cstr(args.get("posting_date") or args.get("transaction_date")),
		flt(args.get("base_net_rate")) if memo["__ranges__"] else None,
	)
	if key not in memo:
		memo[key] = get_item_tax_template(dict(args), frappe._dict(taxes=rows, item_group=item_group))
	return memo[key]


def takeaway_item_tax_template(
	args: dict,
	item_taxes,
	item_group: str | None,
	category: str,
	usual_category: str,
	memo: dict | None = None,
) -> str | None:
	"""The template of an item sold to take away: its row for the takeaway category, on the item or inherited from its
	item group or a parent group, else its usual one (the till's own category): alcohol, which has no takeaway row,
	keeps its 8.1 %."""
	memo = {} if memo is None else memo
	return item_tax_template(
		{**args, "tax_category": category}, item_taxes, item_group, memo
	) or item_tax_template({**args, "tax_category": usual_category}, item_taxes, item_group, memo)


def apply_takeaway_tax_category(doc, method=None) -> None:
	"""`before_validate` of a Sales Invoice: a takeaway sale at a restaurant till takes the restaurant's takeaway tax
	category, and each of its items the template ERPNext's own lookup gives for it (see `takeaway_item_tax_template`),
	with the matching `item_tax_rate`; the validate that follows computes the taxes from them. An item without a
	takeaway row keeps its usual template.

	A return from the till credits the VAT the returned sale charged (`copy_taxes_of_the_returned_sale`). A sale on
	site, a sale outside a till and a till with no takeaway category are left exactly as they come.
	"""
	if not cint(doc.get("is_pos")):
		return
	if cint(doc.get("is_return")):
		copy_taxes_of_the_returned_sale(doc)
		return
	if not cint(doc.get("is_takeaway")):
		return
	category = takeaway_tax_category(doc.get("pos_profile"))
	if not category:
		return
	from erpnext.stock.get_item_details import get_item_tax_map

	doc.tax_category = category
	usual_category = till_tax_category(doc.get("pos_profile"))
	memo = {}
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
			args, master.get("taxes"), master.item_group, category, usual_category, memo
		)
		item.item_tax_template = template
		item.item_tax_rate = get_item_tax_map(doc.company, template, as_json=True)


def copy_taxes_of_the_returned_sale(doc) -> None:
	"""A return from the till credits the VAT its sale charged: it takes the sale's tax category, and each line the
	template of the line it returns (`sales_invoice_item`, else the sale's line of the same item), as ERPNext's own
	make_sales_return does. The till builds its return without either, so ERPNext looked each line up for the usual
	category: a pasta sold to take away (0.27 of VAT at 2.6 %) was credited at 8.1 %. Both are needed: the category
	alone would send the dessert, whose takeaway rate is its item group's, back to its own on-site row.

	A return made outside a till (ERPNext's own, which copies them) and a line that matches no line of the sale are
	left as they come.
	"""
	if not doc.get("return_against"):
		return
	from erpnext.stock.get_item_details import get_item_tax_map

	sale = frappe.db.get_value("Sales Invoice", doc.return_against, ["tax_category"], as_dict=True)
	if not sale:
		return
	sold_lines = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": doc.return_against, "parenttype": "Sales Invoice"},
		fields=["name", "item_code", "item_tax_template"],
		order_by="idx asc",
	)
	by_row = {line.name: line for line in sold_lines}
	by_item = {}
	for line in sold_lines:
		by_item.setdefault(line.item_code, line)
	doc.tax_category = sale.tax_category
	for item in doc.get("items") or []:
		sold = by_row.get(item.get("sales_invoice_item")) or by_item.get(item.get("item_code"))
		if not sold:
			continue
		item.item_tax_template = sold.item_tax_template
		item.item_tax_rate = get_item_tax_map(doc.company, sold.item_tax_template, as_json=True)


def _item_tax_rows(item_codes: list[str]) -> dict[str, list]:
	"""The Item Tax rows of each item, in their order, read in one query: {item_code: [row, ...]}."""
	if not item_codes:
		return {}
	rows = frappe.get_all(
		"Item Tax",
		filters={"parenttype": "Item", "parentfield": "taxes", "parent": ["in", item_codes]},
		fields=[
			"parent",
			"item_tax_template",
			"tax_category",
			"valid_from",
			"minimum_net_rate",
			"maximum_net_rate",
		],
		order_by="parent asc, idx asc",
	)
	by_item = {}
	for row in rows:
		by_item.setdefault(row.parent, []).append(row)
	return by_item


def attach_item_tax_rates(items: list[dict], pos_profile: str | None) -> list[dict]:
	"""Give each item the till loads its VAT rates, as its invoice will charge them (NeoResto lot 1, task 11).

	- `item_tax_rate`: the JSON map account -> rate of the template ERPNext's lookup gives the item for the till's own
	  tax category (`item_tax_template`), "{}" when it has none;
	- `takeaway_item_tax_rate`: the same for a takeaway order, the template of the restaurant's takeaway category, else
	  the usual one (`takeaway_item_tax_template`, what the invoice takes); None when the till has no takeaway rule.

	The till taxes each line with these maps, as ERPNext reads `item_tax_rate`, so that the screen, the receipt and the
	invoice agree. One query for the items' own rows, each item group read once: a catalogue of thousands of items
	costs the same few reads. Returns `items`, each given the two fields.
	"""
	if not items or not pos_profile:
		return items
	from erpnext.stock.get_item_details import get_item_tax_map

	company = frappe.get_cached_value("POS Profile", pos_profile, "company")
	usual_category = till_tax_category(pos_profile)
	category = takeaway_tax_category(pos_profile)
	own_rows = _item_tax_rows(list({item.get("item_code") for item in items if item.get("item_code")}))
	today = nowdate()
	memo, maps = {}, {}

	def tax_map(template):
		if template not in maps:
			maps[template] = get_item_tax_map(company, template, as_json=True)
		return maps[template]

	failed, first_error = [], None
	for item in items:
		code = item.get("item_code")
		if not code:
			continue
		try:
			group = item.get("item_group") or frappe.get_cached_value("Item", code, "item_group")
			taxes = own_rows.get(code, [])
			# What ERPNext reads for a row's validity: the day, and the price as the item's net rate
			args = {
				"company": company,
				"posting_date": today,
				"transaction_date": today,
				"base_net_rate": flt(item.get("rate") or item.get("price_list_rate")),
			}
			usual = item_tax_template({**args, "tax_category": usual_category}, taxes, group, memo)
			item["item_tax_rate"] = tax_map(usual)
			item["takeaway_item_tax_rate"] = (
				tax_map(item_tax_template({**args, "tax_category": category}, taxes, group, memo) or usual)
				if category
				else None
			)
			# The till the maps are for: the offline cache keeps them by till (POS utils/offline/vatMaps.js)
			item["vat_maps_pos_profile"] = pos_profile
		except Exception:
			# One item whose tax rows cannot be read never stops the till from loading its catalogue: it goes without
			# its maps, and the till taxes it at its own rows' rates, as before; the failure is logged
			item.pop("item_tax_rate", None)
			item.pop("takeaway_item_tax_rate", None)
			failed.append(code)
			first_error = first_error or frappe.get_traceback()
	_log_unreadable_items(pos_profile, failed, first_error)
	return items


def _log_unreadable_items(pos_profile: str, item_codes: list[str], error: str | None) -> None:
	"""One Error Log entry per item and per day for the items whose rates could not be read: the till loads its
	catalogue on every start and every search, and logging each call buried the log under the same entry."""
	today = nowdate()
	cache = frappe.cache()
	fresh = [
		code for code in item_codes if not cache.get_value(f"pos_next:item_vat_unreadable:{today}:{code}")
	]
	if not fresh:
		return
	for code in fresh:
		cache.set_value(f"pos_next:item_vat_unreadable:{today}:{code}", 1, expires_in_sec=24 * 60 * 60)
	frappe.log_error(
		"POS items loaded without their VAT rates",
		f"Till {pos_profile}, items {', '.join(fresh[:50])}:\n{error}",
	)
