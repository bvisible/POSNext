# //// Neoffice — added file (no upstream equivalent). The ingredients of a dish and « add the dish to the list » (NeoResto purchases,
# //// lot E). Study: Obsidian `Neoffice/NeoResto/14-…` § 5 and `18-…`.
"""A dish is an article the restaurant SELLS (lasagnes). The owner does not buy lasagnes: he buys pasta, a tomato sauce, minced beef.
A dish therefore carries a small list of the articles it needs (its ingredients), each with a quantity per portion that may be left empty.

This is a reminder, never a recipe: no stock is kept, nothing is taken off a stock when a dish is sold, and the ERP's bill of materials
(a manufacturing document) is not used. « Add the dish » puts the ingredients on the shopping list:
- with a quantity per portion, the list works out what the portions need and rounds UP to the packaging (4.8 kg: one 5 kg pack), and says so;
- without one, the ingredient goes on the list as one packaging, to be completed.
"""

import math

import frappe
from frappe import _
from frappe.utils import flt

from pos_next.restaurant import permissions, shopping, supply_catalogue

DISH_DOCTYPE = "Restaurant Dish Ingredient"


def dish_ingredients(dish: str) -> list[dict]:
	"""The ingredients of a dish: the article, its name, the quantity per portion (or none) and its unit."""
	permissions.require("Item", "read", dish)
	rows = frappe.get_all(
		DISH_DOCTYPE,
		filters={"parent": dish, "parenttype": "Item", "parentfield": "dish_ingredients"},
		fields=["item", "qty_per_portion"],
		order_by="idx asc",
	)
	names = {
		r.name: r
		for r in frappe.get_all(
			"Item",
			filters={"name": ["in", [r.item for r in rows] or [""]]},
			fields=["name", "item_name", "stock_uom"],
		)
	}
	return [
		{
			"item": r.item,
			"item_name": names[r.item].item_name if r.item in names else r.item,
			"qty_per_portion": flt(r.qty_per_portion) or None,
			"unit": names[r.item].stock_uom if r.item in names else None,
		}
		for r in rows
	]


def set_dish_ingredients(dish: str, ingredients: list[dict]) -> None:
	"""Replace the ingredients of a dish: `[{"item": ..., "qty_per_portion": ... or None}, ...]`."""
	permissions.require("Item", "write", dish)
	doc = frappe.get_doc("Item", dish)
	seen = set()
	doc.set("dish_ingredients", [])
	for row in ingredients or []:
		item = row.get("item")
		if not item or item in seen:
			continue
		if item == dish:
			frappe.throw(_("A dish cannot be its own ingredient."))
		seen.add(item)
		qty = row.get("qty_per_portion")
		doc.append(
			"dish_ingredients", {"item": item, "qty_per_portion": flt(qty) if qty not in (None, "") else None}
		)
	doc.save()


def add_dish_to_list(list_name: str, dish: str, portions=1) -> list[dict]:
	"""Put the ingredients of a dish on the list; answers, for each, what was put and how it was worked out."""
	portions = flt(portions)
	if portions <= 0:
		frappe.throw(_("A dish is made for at least one portion."))
	ingredients = dish_ingredients(dish)
	if not ingredients:
		frappe.throw(_("{0} has no ingredients yet.").format(dish))
	report = []
	for ing in ingredients:
		packs = supply_catalogue.item_packs(ing["item"])
		pack = next((p for p in packs if p["usual"]), packs[0] if packs else None)
		needed = flt(ing["qty_per_portion"]) * portions if ing["qty_per_portion"] else None
		if needed and pack and flt(pack["content"]) > 0:
			count = max(1, math.ceil(needed / flt(pack["content"])))
		else:
			count = 1
		shopping.add_article_line(list_name, ing["item"], count, None, None, origin="Dish")
		report.append(
			{
				"item": ing["item"],
				"item_name": ing["item_name"],
				"needed": needed,
				"unit": ing["unit"],
				"packs": count,
				"uom": pack["uom"] if pack else ing["unit"],
				"calculated": bool(needed and pack),
			}
		)
	return report
