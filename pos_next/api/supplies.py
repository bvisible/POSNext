# //// Neoffice — added file (no upstream equivalent). What the Achats screen of NeoResto asks of the server about the supplies
# //// of a restaurant (purchases, lot A). The rule itself, and the rights it asks, are pos_next/restaurant/supplies.py.
"""The Achats screen's calls about the supplies of a restaurant."""

import frappe

from pos_next.restaurant import supplies, supply_catalogue


@frappe.whitelist()
def create_supply_item(item_name, item_group, stock_uom):
	"""Make an article that is bought and never sold; answers its code."""
	supply_catalogue.require_purchases()
	return supplies.create_supply_item(item_name, item_group, stock_uom)


@frappe.whitelist()
def add_supply_pack(
	item, supplier, pack_name, content, price=None, supplier_part_no=None, make_usual=0, company=None
):
	"""Write a packaging of an article, who sells it and its price, in the ERP's own fiches (see supplies.add_supply_pack)."""
	supply_catalogue.require_purchases()
	return supplies.add_supply_pack(
		item, supplier, pack_name, content, price, supplier_part_no, make_usual, company
	)


@frappe.whitelist()
def get_supply_catalogue(search=None, supplier=None, item_group=None, scope=None):
	"""The restaurant's regular purchases, with their packagings, suppliers and prices (see supply_catalogue.catalogue)."""
	supply_catalogue.require_purchases()
	return supply_catalogue.catalogue(search, supplier, item_group, scope)
