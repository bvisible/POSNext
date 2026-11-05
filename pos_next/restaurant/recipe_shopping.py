# //// Neoffice — added file (no upstream equivalent). From the dishes planned to the shopping list, and what a portion costs (NeoResto,
# //// « Nora au restaurant », lot R6). Study: Obsidian `Neoffice/NeoResto/22-…` § R6. The list, its packagings and the rule of
# //// « add a dish » are the purchases' (lots B and E, `shopping.py`, `dishes.py`, `supply_catalogue.py`): nothing of them is redone here.
"""« Mardi, quarante couverts: le gigot, la soupe de courge, la tarte aux pommes. » What does the restaurant have to buy, and what does a portion cost?

A dish planned is named (a recipe of the restaurant, a dish it sells that follows a recipe, or a dish with its own list of ingredients
- the aide-mémoire of the purchases' lot E) with a number of portions. Each ingredient that is tied to an article the restaurant buys, with
a quantity in a unit that can be counted in the article's own unit, is worked out for those portions, added up across the dishes, and
rounded UP to the packaging the list would pick (4.8 kg: one 5 kg pack), as « add a dish » does. An ingredient without an article goes
on as a free line written as the recipe says it; what cannot be worked out (no quantity, a quantity in cups not yet converted, a unit that
does not fit the article's) is said and left off: never a quantity of ours.

`plan` WRITES NOTHING: it answers lines in the shape of the spoken list (`pos_next.restaurant.spoken_list`), which the owner confirms and
the list writes (`spoken_list.add`). The same words give the cost of a portion from the last prices paid (or the catalogue's), and a selling
price ONLY when the owner gave the coefficient: a cost that is partial never suggests a price (it would be too low).

Where the site does not run NeoResto, or its purchases, nothing of this answers.
"""

import json
import math

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next.restaurant import cuisine_knowledge, dishes, permissions, recipes, shopping, supply_catalogue
from pos_next.restaurant.mode import require_neoresto

MOST_DISHES = 20
MOST_MARKUP = 20
# What a unit counts, as (family, size in the family's smallest unit): a recipe's « 150 g » is counted in an article kept in « Kg »
_MASS = {
	"mg": 0.001,
	"g": 1.0,
	"gr": 1.0,
	"gram": 1.0,
	"gramme": 1.0,
	"kg": 1000.0,
	"kilo": 1000.0,
	"kilogram": 1000.0,
	"kilogramme": 1000.0,
}
_VOLUME = {
	"ml": 1.0,
	"millilitre": 1.0,
	"cl": 10.0,
	"dl": 100.0,
	"l": 1000.0,
	"lt": 1000.0,
	"litre": 1000.0,
}
_COUNT = {"", "piece", "pc", "pce", "nos", "unit", "unite", "pcs"}


def _measure(unit) -> tuple[str, float] | None:
	"""(family, size) of a unit, or None for one that cannot be counted in another (a cup, a box, a bunch)."""
	word = cuisine_knowledge.fold(unit or "")
	if len(word) > 2 and word.endswith("s"):
		word = word[:-1]
	if word in _MASS:
		return ("mass", _MASS[word])
	if word in _VOLUME:
		return ("volume", _VOLUME[word])
	if word in _COUNT:
		return ("count", 1.0)
	return None


def _readable(slot) -> tuple[float, str | None]:
	"""A free line's quantity as it reads best: a mass or a volume (held in g or ml) in kg or l from a thousand up, else as the recipe wrote it."""
	if not slot.get("family"):
		return round(slot["qty"], 2), slot["unit"]
	big, small = ("kg", "g") if slot["family"] == "mass" else ("l", "ml")
	if slot["qty"] >= 1000:
		return round(slot["qty"] / 1000, 2), big
	return round(slot["qty"], 2), small


def to_stock_unit(qty, unit, stock_uom):
	"""`qty` of `unit`, counted in the article's own unit (its stock unit); None when the two cannot be counted one in the other."""
	have, want = _measure(unit), _measure(stock_uom)
	if not have or not want or have[0] != want[0]:
		return None
	return flt(qty) * have[1] / want[1]


def _read(said) -> list[dict]:
	if isinstance(said, str):
		try:
			said = json.loads(said)
		except ValueError:
			frappe.throw(_('Say the dishes as a list: [{"name": ..., "portions": ...}].'))
	if isinstance(said, dict):
		said = [said]
	if not isinstance(said, list) or not said:
		frappe.throw(_("Name at least one dish, with its number of portions."))
	if len(said) > MOST_DISHES:
		frappe.throw(_("At most {0} dishes at a time.").format(MOST_DISHES))
	out = []
	for row in said:
		if isinstance(row, str):
			row = {"name": row}
		name = " ".join(str((row or {}).get("name") or "").split())
		if not name:
			frappe.throw(_("A dish has no name."))
		portions = flt((row or {}).get("portions"))
		if not 0 < portions <= recipes.MOST_PORTIONS:
			frappe.throw(
				_("«{0}»: say the number of portions (between 1 and {1}).").format(
					name, recipes.MOST_PORTIONS
				)
			)
		out.append({"name": name, "portions": portions})
	return out


def candidates(said) -> list[dict]:
	"""What a dish named by the owner may be: a recipe of the restaurant, a dish it sells that follows a recipe (the recipe), or a dish with
	its own list of ingredients. An exact recipe name is the only candidate, then an exact dish name; otherwise every word asked must be in
	the name."""
	wanted = recipes._stems(said)
	if not wanted:
		return []
	folded = cuisine_knowledge.fold(said)
	found: dict[tuple, dict] = {}
	rows = frappe.get_all(recipes.DOCTYPE, fields=["name", "recipe_name"], limit_page_length=0)
	exact = [r for r in rows if cuisine_knowledge.fold(r.recipe_name) == folded]
	for r in exact or [r for r in rows if all(w in recipes._stems(r.recipe_name) for w in wanted)]:
		found[("recipe", r.name)] = {"kind": "recipe", "recipe": r.name, "title": r.recipe_name, "dish": None}
	if exact:
		return list(found.values())
	titles = {r.name: r.recipe_name for r in rows}
	exact_dishes = []
	if frappe.get_meta("Item").has_field(recipes.ITEM_FIELD):
		for item in frappe.get_all(
			"Item",
			filters={recipes.ITEM_FIELD: ["is", "set"], "disabled": 0},
			fields=["name", "item_name", recipes.ITEM_FIELD],
			limit_page_length=0,
		):
			if (
				all(w in recipes._stems(item.item_name) for w in wanted)
				and item[recipes.ITEM_FIELD] in titles
			):
				recipe = item[recipes.ITEM_FIELD]
				found.setdefault(
					("recipe", recipe),
					{"kind": "recipe", "recipe": recipe, "title": titles[recipe], "dish": item.item_name},
				)
				if cuisine_knowledge.fold(item.item_name) == folded:
					exact_dishes.append(found[("recipe", recipe)])
	own = set(
		frappe.get_all(
			dishes.DISH_DOCTYPE,
			filters={"parenttype": "Item", "parentfield": "dish_ingredients"},
			pluck="parent",
		)
	)
	if own:
		for item in frappe.get_all(
			"Item",
			filters={"name": ["in", list(own)], "disabled": 0},
			fields=["name", "item_name", recipes.ITEM_FIELD]
			if frappe.get_meta("Item").has_field(recipes.ITEM_FIELD)
			else ["name", "item_name"],
			limit_page_length=0,
		):
			if item.get(recipes.ITEM_FIELD) or not all(w in recipes._stems(item.item_name) for w in wanted):
				continue
			found[("dish", item.name)] = {
				"kind": "dish",
				"dish": item.name,
				"title": item.item_name,
				"recipe": None,
			}
			if cuisine_knowledge.fold(item.item_name) == folded:
				exact_dishes.append(found[("dish", item.name)])
	return exact_dishes[:1] if len(exact_dishes) == 1 else list(found.values())


def _usual_pack(packs):
	return next((p for p in packs if p["usual"]), packs[0] if packs else None)


def _priced_pack(packs):
	"""The pack whose price is read: the usual one's, else the first that has one."""
	usual = _usual_pack(packs)
	if usual and usual.get("unit_price") is not None:
		return usual
	return next((p for p in packs if p.get("unit_price") is not None), None)


def _rows_of(candidate, portions):
	"""The ingredients of a candidate for `portions`, each as {name, item, qty (in the unit said), unit, why} where `why` is what keeps its
	quantity from being worked out. Nothing is rounded here: a quantity is added up before it is rounded to a packaging."""
	if candidate["kind"] == "recipe":
		doc = frappe.get_doc(recipes.DOCTYPE, candidate["recipe"])
		base = cint(doc.base_portions) or 4
		rows = []
		for row in doc.get("ingredients") or []:
			if cint(row.to_taste):
				continue
			why = None
			qty = flt(row.qty) * flt(portions) / base if flt(row.qty) else None
			if qty is None:
				why = "to_complete"
			elif cint(row.unit_to_convert):
				why = "to_convert"
			rows.append(
				{
					"name": row.ingredient_name,
					"item": row.item or None,
					"qty": qty,
					"unit": row.unit or None,
					"why": why,
				}
			)
		return rows
	rows = []
	for ing in dishes.dish_ingredients(candidate["dish"]):
		rows.append(
			{
				"name": ing["item_name"],
				"item": ing["item"],
				"qty": flt(ing["qty_per_portion"]) * flt(portions) if ing["qty_per_portion"] else None,
				"unit": ing["unit"],
				"why": None if ing["qty_per_portion"] else "one_pack",
			}
		)
	return rows


def plan(said) -> dict:
	"""The shopping list the dishes planned come to, and nothing written: for each dish what it was taken for, and `lines` in the shape of the
	spoken list (`line` is what `spoken_list.add` writes). Answers `ok` only when every dish is one."""
	require_neoresto()
	supply_catalogue.require_purchases()
	permissions.require(shopping.DOCTYPE, "write")
	permissions.require(recipes.DOCTYPE, "read")
	asked = _read(said)
	report, needs, free, left_out = [], {}, {}, []
	for want in asked:
		found = candidates(want["name"])
		entry = {"said": want["name"], "portions": want["portions"], "status": "matched"}
		if len(found) > 1:
			entry.update(
				status="ambiguous", candidates=[{"title": c["title"], "kind": c["kind"]} for c in found[:5]]
			)
		elif not found:
			entry.update(status="unknown")
		if entry["status"] != "matched":
			report.append(entry)
			continue
		cand = found[0]
		entry.update(title=cand["title"], source="recipe" if cand["kind"] == "recipe" else "dish ingredients")
		report.append(entry)
		label = f"{cand['title']} \u00d7 {want['portions']:g}"
		for row in _rows_of(cand, want["portions"]):
			if row["why"] == "one_pack":
				needs.setdefault(row["item"], {"stock": None, "from": []})["from"].append(label)
			elif row["why"]:
				left_out.append({"dish": cand["title"], "ingredient": row["name"], "why": row["why"]})
			elif row["item"]:
				stock_uom = frappe.db.get_value("Item", row["item"], "stock_uom")
				counted = (
					row["qty"]
					if cand["kind"] == "dish"
					else to_stock_unit(row["qty"], row["unit"], stock_uom)
				)
				if counted is None:
					left_out.append(
						{
							"dish": cand["title"],
							"ingredient": row["name"],
							"why": "unit",
							"unit": row["unit"],
							"article_unit": stock_uom,
						}
					)
					continue
				slot = needs.setdefault(row["item"], {"stock": 0.0, "from": []})
				slot["stock"] = (slot["stock"] or 0.0) + counted
				slot["from"].append(label)
			else:
				# A mass or a volume is added in grams or millilitres whatever the recipe wrote (800 g and 1 kg of the same thing are
				# 1.8 kg), then said in kg or l from a thousand up: « 8000 g » for eight kilos of squash was hard to read on the list.
				measure = _measure(row["unit"])
				family = measure[0] if measure and measure[0] in ("mass", "volume") else None
				if family:
					slot = free.setdefault(
						(cuisine_knowledge.fold(row["name"]), family),
						{"name": row["name"], "unit": None, "family": family, "qty": 0.0, "from": []},
					)
					slot["qty"] += row["qty"] * measure[1]
				else:
					slot = free.setdefault(
						(cuisine_knowledge.fold(row["name"]), cuisine_knowledge.fold(row["unit"] or "")),
						{"name": row["name"], "unit": row["unit"], "family": None, "qty": 0.0, "from": []},
					)
					slot["qty"] += row["qty"]
				slot["from"].append(label)
	lines, total, partial = [], 0.0, False
	for item, slot in needs.items():
		name, stock_uom = frappe.db.get_value("Item", item, ["item_name", "stock_uom"])
		packs = supply_catalogue.item_packs(item)
		pack = _usual_pack(packs)
		counted = slot["stock"]
		by_pack = bool(counted and pack and flt(pack["content"]) > 0)
		if by_pack:
			# rounded UP to the packaging, as « add a dish » does
			count = max(1, math.ceil(counted / flt(pack["content"]) - 1e-9))
		elif counted and not pack:
			# no packaging known yet: the quantity itself, in the article's own unit
			count = round(counted, 3)
		else:
			# no quantity, or a packaging that does not say what it holds: one packaging, to be completed (as « add a dish » does)
			count = 1
		calculated = bool(counted) and (by_pack or not pack)
		price = pack["price"] if by_pack else None
		estimated = round(count * price, 2) if price is not None else None
		if estimated is None:
			partial = True
		else:
			total += estimated
		lines.append(
			{
				"text": name,
				"qty": count,
				"unit": pack["uom"] if pack else stock_uom,
				"status": "matched",
				"item": item,
				"item_name": name,
				"pack": {"supplier": pack["supplier"], "uom": pack["uom"], "price": pack["price"]}
				if pack
				else None,
				"candidates": [],
				"needed": round(counted, 3) if counted else None,
				"needed_unit": stock_uom,
				"calculated": calculated,
				"from": sorted(set(slot["from"])),
				"estimated": estimated,
				"line": {
					"item": item,
					"qty": count,
					"supplier": pack["supplier"] if by_pack else None,
					"uom": pack["uom"] if by_pack else None,
					"origin": "Dish",
				},
			}
		)
	for slot in free.values():
		qty, unit = _readable(slot)
		lines.append(
			{
				"text": slot["name"],
				"qty": qty,
				"unit": unit,
				"status": "unknown",
				"item": None,
				"item_name": None,
				"pack": None,
				"candidates": [],
				"from": sorted(set(slot["from"])),
				"line": {"free": True, "text": slot["name"], "qty": qty, "unit_text": unit},
			}
		)
	counts = {
		"matched": sum(1 for line in lines if line["status"] == "matched"),
		"ambiguous": 0,
		"unknown": sum(1 for line in lines if line["status"] == "unknown"),
	}
	return {
		"ok": all(d["status"] == "matched" for d in report),
		"dishes": report,
		"lines": lines,
		"counts": counts,
		"left_out": left_out,
		"estimated_total": round(total, 2) if lines else None,
		"estimated_partial": partial,
	}


def cost(said, portions=None, markup=None) -> dict:
	"""What a portion of a dish costs, from the last prices paid (the catalogue's price when none was paid), ingredient by ingredient; and
	a selling price ONLY when `markup` (a coefficient the owner gave) is: the cost multiplied, to the nearest 10 cents. A cost that is
	partial (an ingredient with no article, no quantity or no price) never suggests a price."""
	require_neoresto()
	permissions.require(recipes.DOCTYPE, "read")
	found = candidates(said)
	if not found:
		frappe.throw(_("There is no recipe or dish named «{0}».").format(said), frappe.DoesNotExistError)
	if len(found) > 1:
		frappe.throw(
			_("Several fit «{0}»: {1}. Say which one.").format(said, ", ".join(c["title"] for c in found[:5]))
		)
	cand = found[0]
	if cand["kind"] == "recipe":
		base = cint(frappe.db.get_value(recipes.DOCTYPE, cand["recipe"], "base_portions")) or 4
	else:
		base = 1
	target = flt(portions) or base
	if not 0 < target <= recipes.MOST_PORTIONS:
		frappe.throw(_("The portions are a number between 1 and {0}.").format(recipes.MOST_PORTIONS))
	if markup not in (None, ""):
		markup = flt(markup)
		if not 0 < markup <= MOST_MARKUP:
			frappe.throw(_("The coefficient is a number above 0 and up to {0}.").format(MOST_MARKUP))
	else:
		markup = None
	return cost_of(cand, target, markup)


def cost_of(cand: dict, target: float, markup: float | None = None) -> dict:
	"""What `target` portions of a dish already found cost: the reading of `cost`, shared with the analysis of the card."""
	rows, total, missing = [], 0.0, []
	for row in _rows_of(cand, target):
		entry = {
			"name": row["name"],
			# `qty` is for ALL the `portions` of the answer (200 g for four portions), `qty_per_portion` for one (50 g): a reader took
			# the first for a portion's (04.11)
			"qty": round(row["qty"], 3) if row["qty"] else None,
			"qty_per_portion": round(row["qty"] / target, 3) if row["qty"] else None,
			"unit": row["unit"],
		}
		if row["why"] and row["why"] != "one_pack":
			missing.append({"ingredient": row["name"], "why": row["why"]})
		elif not row["item"]:
			missing.append({"ingredient": row["name"], "why": "not_linked"})
		else:
			stock_uom = frappe.db.get_value("Item", row["item"], "stock_uom")
			counted = (
				row["qty"] if cand["kind"] == "dish" else to_stock_unit(row["qty"], row["unit"], stock_uom)
			)
			pack = _priced_pack(supply_catalogue.item_packs(row["item"]))
			if row["why"] == "one_pack" or counted is None:
				missing.append(
					{"ingredient": row["name"], "why": "unit" if counted is None else "to_complete"}
				)
			elif not pack:
				missing.append({"ingredient": row["name"], "why": "no_price"})
			else:
				amount = round(counted * pack["unit_price"], 4)
				total += amount
				entry.update(
					{
						"item_name": frappe.db.get_value("Item", row["item"], "item_name"),
						"unit_price": pack["unit_price"],
						"price_per": stock_uom,
						"price_source": pack["price_source"],
						"paid_on": pack["paid_on"],
						"cost": round(amount, 2),
					}
				)
		rows.append(entry)
	partial = bool(missing)
	per_portion = round(total / target, 2) if total else None
	answer = {
		"dish": cand["title"],
		"source": "recipe" if cand["kind"] == "recipe" else "dish ingredients",
		"portions": target,
		"ingredients": rows,
		"missing": missing,
		"partial": partial,
		"total": round(total, 2) if total else None,
		"per_portion": per_portion,
		"suggested_price": None,
	}
	if markup and per_portion and not partial:
		answer["suggested_price"] = round(round(per_portion * markup / 0.1) * 0.1, 2)
		answer["markup"] = markup
	elif markup:
		answer["markup_not_applied"] = _("The cost is partial: a price worked out from it would be too low.")
	return answer
