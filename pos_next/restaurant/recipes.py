# //// Neoffice — added file (no upstream equivalent). The recipes of a restaurant (NeoResto, « Nora au restaurant », lot R3). Study:
# //// Obsidian `Neoffice/NeoResto/22-…` and `29-…`.
"""A recipe is what a restaurant knows about making a dish: its ingredients with a quantity for a number of portions, its steps, its
allergens, and where it comes from.

It is a reminder written by a person (or read from a free library and kept as « to review »), never a bill of materials: nothing is
taken off a stock when a dish is sold, nothing is manufactured, and no cost is worked out here. The link to what the restaurant SELLS is
a field of the article sold (`Item.restaurant_recipe`): a dish has at most one recipe, a recipe may serve several dishes, and a dish with
none is a dish like any other. The link to what it BUYS is the `item` of an ingredient row.

Three rules hold everywhere:
- nothing is invented: a quantity nobody gave stays empty (« to complete »), unless the row is marked « without quantity » (salt, oil);
- the quantities of a source that is not metric (cup, ounce...) are kept as the source wrote them and marked « to convert »: they become
  metric when the ingredient is linked to an article and the person confirms the figure;
- where the site does not run NeoResto nothing of this shows: every call refuses (`require_neoresto`), the desk's field and tab are not
  there, and no recipe is ever made on its own.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next.restaurant import cuisine_knowledge, permissions
from pos_next.restaurant.mode import require_neoresto

DOCTYPE = "Restaurant Recipe"
INGREDIENT = "Restaurant Recipe Ingredient"
ITEM_FIELD = "restaurant_recipe"
STATUSES = ("Draft", "To review", "Validated")
NAME_LENGTH = 140
MOST_PORTIONS = 1000
MOST_RESULTS = 12

# Units a source writes that are not metric: kept as written, marked to be converted. A unit a source marks itself with « (source) »
# is one of them whatever it is (« TS (source) », « boîte de 15 oz »).
FOREIGN_UNITS = frozenset(
	{
		"cup",
		"cups",
		"oz",
		"ounce",
		"ounces",
		"lb",
		"lbs",
		"pound",
		"pounds",
		"quart",
		"quarts",
		"pint",
		"pints",
		"gallon",
		"stick",
		"inch",
		"inches",
		"in",
		"tbsp",
		"tsp",
		"t",
		"ts",
		"pouce",
		"pouces",
	}
)
SOURCE_MARK = "(source)"


def is_foreign_unit(unit) -> bool:
	"""Whether a unit is one a source wrote that is not metric (cup, ounce...), so its figure is to be converted."""
	text = " ".join(str(unit or "").split())
	if not text:
		return False
	if SOURCE_MARK in text.lower():
		return True
	words = cuisine_knowledge.fold(text).split()
	return bool(words) and any(word in FOREIGN_UNITS for word in words)


def _name(value) -> str:
	return " ".join(str(value or "").split())[:NAME_LENGTH]


def scale_qty(qty, base, target):
	"""A quantity for `target` portions when it is given for `base`: rounded the way a kitchen reads it (whole above 100, one decimal
	above 10, two below). An empty quantity stays empty."""
	if qty in (None, "") or not flt(qty):
		return None
	value = flt(qty) * flt(target) / (flt(base) or 1)
	if value >= 100:
		return float(round(value))
	if value >= 10:
		return round(value, 1)
	return round(value, 2)


def to_complete(row) -> bool:
	"""An ingredient row nobody gave a quantity for, and that is not marked « without quantity »: what the person still has to say."""
	return not flt(row.get("qty")) and not cint(row.get("to_taste"))


def validate(doc) -> None:
	"""The rules of a recipe document: a name, portions, rows that make sense, units to convert marked, and a status that is told the truth.

	A recipe is « Validated » only when every ingredient has a quantity (or is marked without one) and it has steps: a person who
	validates a recipe says it can be cooked from what is written.
	"""
	from pos_next.restaurant import scope

	doc.recipe_name = _name(doc.recipe_name)
	if not doc.recipe_name:
		frappe.throw(_("Name the recipe."))
	scope.attach_to_restaurant(doc)
	doc.base_portions = cint(doc.base_portions) or 4
	if not 1 <= doc.base_portions <= MOST_PORTIONS:
		frappe.throw(_("The portions are a number between 1 and {0}.").format(MOST_PORTIONS))
	doc.total_minutes = max(cint(doc.total_minutes), 0)
	if doc.status not in STATUSES:
		doc.status = "Draft"
	seen_names = set()
	for row in doc.get("ingredients") or []:
		row.ingredient_name = _name(row.ingredient_name)
		if not row.ingredient_name:
			frappe.throw(_("Row {0}: name the ingredient.").format(row.idx))
		if flt(row.qty) < 0:
			frappe.throw(_("Row {0}: the quantity cannot be negative.").format(row.idx))
		row.unit = " ".join(str(row.unit or "").split())[:60]
		if cint(row.to_taste):
			row.qty = 0
		row.unit_to_convert = 1 if flt(row.qty) and is_foreign_unit(row.unit) else 0
		key = cuisine_knowledge.fold(row.ingredient_name)
		if key in seen_names:
			frappe.msgprint(
				_("Row {0}: «{1}» is already in the list.").format(row.idx, row.ingredient_name),
				indicator="orange",
			)
		seen_names.add(key)
	if doc.status == "Validated":
		missing = [row.ingredient_name for row in doc.get("ingredients") or [] if to_complete(row)]
		if missing:
			frappe.throw(
				_("Validated needs a quantity for every ingredient (or «without quantity»): {0}.").format(
					", ".join(missing[:5])
				)
			)
		if not (doc.get("ingredients") and (doc.steps or "").strip()):
			frappe.throw(_("Validated needs ingredients and steps."))


def step_lines(doc_or_text) -> list[str]:
	text = doc_or_text if isinstance(doc_or_text, str) else (doc_or_text.steps or "")
	return [line.strip() for line in text.splitlines() if line.strip()]


def ingredient_rows(doc, portions=None) -> list[dict]:
	"""The ingredients of a recipe, for `portions` (the recipe's own when none), each saying what is still open about it."""
	base = cint(doc.base_portions) or 4
	target = cint(portions) or base
	out = []
	for row in doc.get("ingredients") or []:
		scaled = scale_qty(row.qty, base, target) if flt(row.qty) else None
		out.append(
			{
				"idx": row.idx,
				"name": row.ingredient_name,
				"qty": scaled,
				"unit": row.unit or None,
				"without_quantity": bool(cint(row.to_taste)),
				"to_complete": to_complete(row),
				"to_convert": bool(cint(row.unit_to_convert)),
				"shelf": row.shelf or None,
				"item": row.item or None,
				"item_name": row.item_name or None,
			}
		)
	return out


def dishes_of(recipe: str) -> list[dict]:
	"""The dishes the restaurant sells that follow this recipe."""
	if not frappe.get_meta("Item").has_field(ITEM_FIELD):
		return []
	return frappe.get_all(
		"Item",
		filters={ITEM_FIELD: recipe, "disabled": 0},
		fields=["name as item", "item_name"],
		limit_page_length=0,
	)


def sheet(name: str, portions=None) -> dict:
	"""A recipe as it is read, for `portions` if asked: ingredients with their quantities, the steps, where it comes from, what is open."""
	require_neoresto()
	permissions.require(DOCTYPE, "read", name)
	if not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("There is no recipe named «{0}».").format(name), frappe.DoesNotExistError)
	doc = frappe.get_doc(DOCTYPE, name)
	target = cint(portions) or doc.base_portions
	if not 1 <= target <= MOST_PORTIONS:
		frappe.throw(_("The portions are a number between 1 and {0}.").format(MOST_PORTIONS))
	rows = ingredient_rows(doc, target)
	return {
		"name": doc.name,
		"recipe": doc.recipe_name,
		"family": doc.family or None,
		"subtitle": doc.subtitle or None,
		"vegetarian": bool(cint(doc.vegetarian)),
		"status": doc.status,
		"cooked_and_tested": doc.culinary_status == "Tested",
		"base_portions": doc.base_portions,
		"portions": target,
		"scaled": target != doc.base_portions,
		"minutes": doc.total_minutes or None,
		"ingredients": rows,
		"steps": step_lines(doc),
		"tip": doc.tip or None,
		"allergens": doc.allergens or None,
		"source": {
			"origin": doc.source_kind,
			"title": doc.source_title or None,
			"author": doc.source_author or None,
			"url": doc.source_url or None,
			"license": doc.source_license or None,
			"revision": doc.source_revision or None,
		},
		"dishes": dishes_of(doc.name),
		"open": {
			"to_complete": [r["name"] for r in rows if r["to_complete"]],
			"to_convert": [r["name"] for r in rows if r["to_convert"]],
			"not_linked": [r["name"] for r in rows if not r["item"] and not r["without_quantity"]],
		},
		"note": _(
			"Only the quantities of the list change with the portions: the times and the temperatures in the steps do not."
		)
		if target != doc.base_portions
		else None,
	}


def _stem(word: str) -> str:
	word = cuisine_knowledge.fold(word).replace(" ", "")
	return word[:-1] if len(word) > 3 and word[-1] in "sx" else word


def _stems(text) -> list[str]:
	return [_stem(w) for w in cuisine_knowledge.fold(text).split() if len(w) > 1]


def search(query=None, family=None, ingredient=None, vegetarian=None, limit=MOST_RESULTS) -> dict:
	"""The recipes that fit: by words of the name, the family or the description (and the ingredients), by family, by an ingredient, vegetarian
	or not. Read only; the best fit first. Nothing matches by guessing: every word asked is in the recipe."""
	require_neoresto()
	permissions.require(DOCTYPE, "read")
	rows = frappe.get_list(
		DOCTYPE,
		fields=[
			"name",
			"recipe_name",
			"family",
			"subtitle",
			"vegetarian",
			"status",
			"base_portions",
			"total_minutes",
			"source_kind",
		],
		limit_page_length=0,
	)
	by_recipe: dict[str, list[str]] = {}
	if rows:
		for ing in frappe.get_all(
			INGREDIENT,
			filters={"parent": ["in", [r.name for r in rows]], "parenttype": DOCTYPE},
			fields=["parent", "ingredient_name"],
			limit_page_length=0,
		):
			by_recipe.setdefault(ing.parent, []).append(ing.ingredient_name)
	wanted = _stems(query)
	wanted_family = _stems(family)
	wanted_ingredient = _stems(ingredient)
	found = []
	for row in rows:
		if vegetarian is not None and bool(cint(row.vegetarian)) != bool(vegetarian):
			continue
		title = _stems(row.recipe_name)
		fam = _stems(row.family)
		sub = _stems(row.subtitle)
		ings = [s for name in by_recipe.get(row.name, []) for s in _stems(name)]
		if wanted_family and not all(w in fam for w in wanted_family):
			continue
		if wanted_ingredient and not all(w in ings for w in wanted_ingredient):
			continue
		score = 0
		ok = True
		for w in wanted:
			if w in title:
				score += 3
			elif w in fam:
				score += 2
			elif w in sub:
				score += 1
			elif w in ings:
				score += 1
			else:
				ok = False
				break
		if ok:
			found.append((score, row))
	found.sort(key=lambda pair: (-pair[0], pair[1].recipe_name.lower()))
	limit = max(1, min(cint(limit) or MOST_RESULTS, 50))
	shown = [
		{
			"name": row.name,
			"recipe": row.recipe_name,
			"family": row.family or None,
			"subtitle": row.subtitle or None,
			"vegetarian": bool(cint(row.vegetarian)),
			"status": row.status,
			"portions": row.base_portions,
			"minutes": row.total_minutes or None,
			"origin": row.source_kind,
		}
		for _score, row in found[:limit]
	]
	return {"count": len(found), "shown": len(shown), "recipes": shown}


def set_dish_recipe(dish: str, recipe: str | None) -> dict:
	"""Link a dish the restaurant sells to a recipe, or take the link away (`recipe` empty). The dish is an article sold; nothing else of
	it changes."""
	require_neoresto()
	permissions.require("Item", "write", dish)
	if not frappe.get_meta("Item").has_field(ITEM_FIELD):
		frappe.throw(_("Recipes are not set up on this site yet."))
	if not frappe.db.exists("Item", dish):
		frappe.throw(_("There is no article named «{0}».").format(dish), frappe.DoesNotExistError)
	if recipe:
		permissions.require(DOCTYPE, "read", recipe)
		if not frappe.db.exists(DOCTYPE, recipe):
			frappe.throw(_("There is no recipe named «{0}».").format(recipe), frappe.DoesNotExistError)
	doc = frappe.get_doc("Item", dish)
	if (doc.get(ITEM_FIELD) or None) == (recipe or None):
		return {"dish": dish, "recipe": recipe or None, "changed": False}
	doc.set(ITEM_FIELD, recipe or None)
	doc.save()
	return {"dish": dish, "recipe": recipe or None, "changed": True}


def _purchasable_pool() -> list[dict]:
	filters = {"disabled": 0}
	if frappe.get_meta("Item").has_field("is_purchase_item"):
		filters["is_purchase_item"] = 1
	return frappe.get_all(
		"Item", filters=filters, fields=["name", "item_name", "stock_uom"], limit_page_length=0
	)


def link_suggestions(recipe: str) -> dict:
	"""For each ingredient of a recipe: the article it is linked to, or the articles the restaurant buys that it could be (to be confirmed by
	the person, never applied)."""
	from pos_next.restaurant import menu_plan

	require_neoresto()
	permissions.require(DOCTYPE, "read", recipe)
	if not frappe.db.exists(DOCTYPE, recipe):
		frappe.throw(_("There is no recipe named «{0}».").format(recipe), frappe.DoesNotExistError)
	doc = frappe.get_doc(DOCTYPE, recipe)
	pool = _purchasable_pool()
	out = []
	for row in ingredient_rows(doc):
		entry = dict(row, suggestions=[])
		if not row["item"] and not row["without_quantity"]:
			entry["suggestions"] = [
				{"item": i["name"], "item_name": i["item_name"], "unit": i["stock_uom"]}
				for i in menu_plan._closest(row["name"], pool)[: menu_plan.CANDIDATES]
			]
		out.append(entry)
	linked = sum(1 for r in out if r["item"])
	return {"recipe": doc.name, "ingredients": out, "linked": linked, "total": len(out)}


def set_ingredient_links(recipe: str, links) -> dict:
	"""Link ingredients to articles, all or none: `links` is [{idx, item, qty, unit}] (`item` empty takes a link away). Where the ingredient's
	unit is one to convert, the person's figure in `qty` and `unit` replaces the source's: nothing is converted by guessing."""
	require_neoresto()
	permissions.require(DOCTYPE, "write", recipe)
	if not isinstance(links, list) or not links:
		frappe.throw(_("Say which ingredients to link."))
	doc = frappe.get_doc(DOCTYPE, recipe)
	rows = {row.idx: row for row in doc.get("ingredients") or []}
	changed = 0
	for link in links:
		if not isinstance(link, dict) or cint(link.get("idx")) not in rows:
			frappe.throw(_("An ingredient to link is {idx, item}."))
		row = rows[cint(link["idx"])]
		item = link.get("item") or None
		if item and not frappe.db.exists("Item", item):
			frappe.throw(_("There is no article named «{0}».").format(item), frappe.DoesNotExistError)
		if item:
			permissions.require("Item", "read", item)
		if row.unit_to_convert and item and not (flt(link.get("qty")) and (link.get("unit") or "").strip()):
			frappe.throw(
				_("«{0}» is written in {1}: give its quantity and its unit as the article is bought.").format(
					row.ingredient_name, row.unit
				)
			)
		if (row.item or None) != item:
			row.item = item
			changed += 1
		if item and flt(link.get("qty")) and (link.get("unit") or "").strip():
			row.qty = flt(link["qty"])
			row.unit = (link["unit"] or "").strip()
			changed += 1
	if changed:
		doc.save()
	return {"recipe": doc.name, "changed": bool(changed), "linked": sum(1 for r in doc.ingredients if r.item)}
