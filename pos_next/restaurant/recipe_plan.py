# //// Neoffice — added file (no upstream equivalent). The recipes of a restaurant written with its owner by talking, the way the menus and the
# //// options are (NeoResto, « Nora au restaurant », lot R3). Study: Obsidian `Neoffice/NeoResto/22-…` and `29-…`.
"""A recipe — « le risotto aux champignons, pour quatre : 320 g de riz, un litre de bouillon... » — written once the owner said yes.

Two moves, never one:

- `propose` WRITES NOTHING. For each recipe said it answers what it understood: the recipe is new or exists (and what would change in it),
  each ingredient with what is still open about it (no quantity: « to complete »; a unit to convert), whether the steps are there, the
  status the recipe would have, and the dish of the card it would be linked to when the owner named one.
- `apply` writes what the owner confirmed: all of it, or none.

What it never does: invent a quantity, a step, a number of portions or a source nobody gave (a recipe with no portions, or no ingredient,
waits and the owner is asked), overwrite a recipe that exists (it completes it: the ingredients said are added or changed, the others stay;
steps are replaced only when the owner gave steps), turn a recipe into « Validated » while a quantity is missing, or link a dish to a recipe
unless the owner named the dish. It is a management act, switched on per site with the card (`card_plan.SITE_FLAG`), kept to whoever
may write recipes, and refused where the site does not run NeoResto.
"""

import math

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next.restaurant import card_plan, cuisine_knowledge, menu_plan, permissions, recipes

DOCTYPE = recipes.DOCTYPE
MOST_RECIPES = 5
MOST_INGREDIENTS = 60
MOST_STEPS = 60
NAME_LENGTH = recipes.NAME_LENGTH


def _manage(ptype: str = "write") -> None:
	recipes.require_neoresto()
	card_plan.require_active()
	permissions.require(DOCTYPE, ptype)


def _text(value, limit=NAME_LENGTH) -> str:
	return " ".join(str(value or "").split())[:limit]


def _qty(value, label):
	"""A quantity the way it was given: a number above zero, or None when nobody gave one. Nothing is guessed from a word."""
	if value in (None, "", False):
		return None
	if isinstance(value, str):
		value = value.strip().replace(",", ".")
	try:
		number = float(value)
	except (TypeError, ValueError):
		frappe.throw(_("{0}: a quantity is a number (250), not «{1}».").format(label, value))
	if not math.isfinite(number) or number < 0:
		frappe.throw(_("{0}: a quantity is a number above zero.").format(label))
	return number or None


def _whole(value, label, low, high):
	if value in (None, ""):
		return None
	try:
		number = int(float(value))
	except (TypeError, ValueError):
		frappe.throw(_("{0}: a whole number is expected.").format(label))
	if not low <= number <= high:
		frappe.throw(_("{0}: a number between {1} and {2}.").format(label, low, high))
	return number


def _read(recipes_said) -> list[dict]:
	"""The recipes said, cleaned and checked, or frappe.ValidationError saying what is wrong."""
	if not isinstance(recipes_said, list) or not recipes_said:
		frappe.throw(_("Say which recipe to write."))
	if len(recipes_said) > MOST_RECIPES:
		frappe.throw(_("At most {0} recipes at a time.").format(MOST_RECIPES))
	out = []
	for raw in recipes_said:
		if not isinstance(raw, dict):
			frappe.throw(_("A recipe is {name, portions, ingredients, steps}."))
		name = _text(raw.get("name"))
		if not name:
			frappe.throw(_("Name the recipe."))
		ingredients = raw.get("ingredients")
		if ingredients is not None and (
			not isinstance(ingredients, list) or len(ingredients) > MOST_INGREDIENTS
		):
			frappe.throw(_("{0}: the ingredients are a list of at most {1}.").format(name, MOST_INGREDIENTS))
		rows = []
		for entry in ingredients or []:
			if isinstance(entry, str):
				entry = {"name": entry}
			if not isinstance(entry, dict) or not _text(entry.get("name")):
				frappe.throw(_("{0}: an ingredient is {name, qty, unit}.").format(name))
			label = f"{name} / {_text(entry.get('name'))}"
			rows.append(
				{
					"name": _text(entry["name"]),
					"qty": _qty(entry.get("qty"), label),
					"unit": _text(entry.get("unit"), 60) or None,
					"without_quantity": bool(entry.get("without_quantity")),
					"remove": bool(entry.get("remove")),
				}
			)
		steps = raw.get("steps")
		if isinstance(steps, str):
			steps = [line for line in steps.splitlines() if line.strip()]
		if steps is not None:
			if not isinstance(steps, list) or len(steps) > MOST_STEPS:
				frappe.throw(_("{0}: the steps are a list of at most {1}.").format(name, MOST_STEPS))
			steps = [_text(s, 1000) for s in steps if _text(s, 1000)]
		out.append(
			{
				"name": name,
				"family": _text(raw.get("family")) or None,
				"subtitle": _text(raw.get("subtitle"), 300) or None,
				"portions": _whole(raw.get("portions"), name, 1, recipes.MOST_PORTIONS),
				"minutes": _whole(raw.get("minutes"), name, 0, 24 * 60),
				"vegetarian": None if raw.get("vegetarian") is None else bool(raw.get("vegetarian")),
				"ingredients": rows,
				"steps": steps,
				"tip": _text(raw.get("tip"), 500) or None,
				"allergens": _text(raw.get("allergens"), 500) or None,
				"source": _text(raw.get("source"), 200) or None,
				"dish": _text(raw.get("dish")) or None,
				"validate": bool(raw.get("validate")),
			}
		)
	return out


def _existing(name: str):
	"""The recipe that has this name (case and accents forgiven); None if none."""
	for row in frappe.get_all(DOCTYPE, fields=["name", "recipe_name"], limit_page_length=0):
		if cuisine_knowledge.fold(row["recipe_name"]) == cuisine_knowledge.fold(name):
			return frappe.get_doc(DOCTYPE, row["name"])
	return None


def _ingredient_state(qty, without_quantity, unit) -> dict:
	return {
		"state": "without_quantity" if without_quantity else "complete" if qty else "to_complete",
		"to_convert": bool(qty and recipes.is_foreign_unit(unit)),
	}


def _merged(held: list[dict], said: list[dict]) -> tuple[list[dict], list[dict]]:
	"""(the ingredients once written, how each one said changes them): rows said that are held are changed, those not held are added, those
	asked to go are taken out, the others stay. `held` and the answer are {name, qty, unit, without_quantity, item}."""
	rows = [dict(r) for r in held]
	changes = []
	for entry in said:
		key = cuisine_knowledge.fold(entry["name"])
		at = next((i for i, r in enumerate(rows) if cuisine_knowledge.fold(r["name"]) == key), None)
		if entry["remove"]:
			if at is not None:
				changes.append({"name": rows[at]["name"], "change": "remove"})
				rows.pop(at)
			continue
		new = {
			"name": entry["name"],
			"qty": entry["qty"],
			"unit": entry["unit"],
			"without_quantity": entry["without_quantity"] or False,
			"item": None,
			"shelf": None,
		}
		if at is None:
			rows.append(new)
			changes.append({"name": entry["name"], "change": "add"})
			continue
		old = rows[at]
		# The row keeps the name it has (« Crème »), whatever case the owner said it in
		new["name"], new["item"], new["shelf"] = old["name"], old.get("item"), old.get("shelf")
		# What the owner did not say about a row he named stays: only a quantity or a unit said changes it
		if entry["qty"] is None and not entry["without_quantity"]:
			new["qty"], new["without_quantity"] = old.get("qty"), old.get("without_quantity")
		if entry["unit"] is None:
			new["unit"] = old.get("unit")
		same = (new["qty"], new["unit"], bool(new["without_quantity"])) == (
			old.get("qty"),
			old.get("unit"),
			bool(old.get("without_quantity")),
		)
		rows[at] = new
		changes.append({"name": entry["name"], "change": "same" if same else "change"})
	return rows, changes


def _dish(said: str | None, recipe_name: str, pool: list[dict]) -> dict | None:
	"""The dish of the card the owner named, resolved like a dish of a menu is; None when he named none."""
	if not said:
		return None
	found = menu_plan._closest(said, pool)
	answer = {"said": said, "status": "unknown", "item": None, "item_name": None, "candidates": []}
	if len(found) == 1:
		item = found[0]
		linked = (
			frappe.db.get_value("Item", item["name"], recipes.ITEM_FIELD)
			if frappe.get_meta("Item").has_field(recipes.ITEM_FIELD)
			else None
		)
		answer.update(
			status="present"
			if linked and cuisine_knowledge.fold(linked) == cuisine_knowledge.fold(recipe_name)
			else "matched",
			item=item["name"],
			item_name=item["item_name"],
		)
	elif found:
		answer.update(
			status="ambiguous",
			candidates=[
				{"item": i["name"], "item_name": i["item_name"]} for i in found[: menu_plan.CANDIDATES]
			],
		)
	return answer


def _check(spec: dict, pool: list[dict]) -> dict:
	"""What one recipe said comes to: new or existing, its ingredients one by one, what it needs, the status it would have."""
	doc = _existing(spec["name"])
	held = (
		[
			{
				"name": r.ingredient_name,
				"qty": flt(r.qty) or None,
				"unit": r.unit or None,
				"without_quantity": bool(cint(r.to_taste)),
				"item": r.item or None,
				"shelf": r.shelf or None,
			}
			for r in doc.get("ingredients") or []
		]
		if doc
		else []
	)
	rows, changes = _merged(held, spec["ingredients"])
	steps = spec["steps"] if spec["steps"] is not None else (recipes.step_lines(doc) if doc else [])
	portions = spec["portions"] or (doc.base_portions if doc else None)
	needs = []
	if not doc:
		if not portions:
			needs.append("portions")
		if not rows:
			needs.append("ingredients")
	reading = []
	for row in rows:
		state = _ingredient_state(row["qty"], row["without_quantity"], row["unit"])
		change = next(
			(
				c["change"]
				for c in changes
				if cuisine_knowledge.fold(c["name"]) == cuisine_knowledge.fold(row["name"])
			),
			"same",
		)
		reading.append(
			{
				"name": row["name"],
				"qty": row["qty"],
				"unit": row["unit"],
				**state,
				"change": change if doc else "add",
			}
		)
	removed = [c["name"] for c in changes if c["change"] == "remove"]
	to_complete = [r["name"] for r in reading if r["state"] == "to_complete"]
	complete = bool(rows) and not to_complete and bool(steps)
	if doc:
		status_after = doc.status if complete or doc.status == "Draft" else "Draft"
		if spec["validate"]:
			if complete:
				status_after = "Validated"
			else:
				needs.append("a quantity for " + ", ".join(to_complete[:5]) if to_complete else "steps")
	else:
		status_after = "Validated" if complete else "Draft"
	changed = (
		not doc
		or any(c["change"] in ("add", "change", "remove") for c in changes)
		or (spec["steps"] is not None and spec["steps"] != recipes.step_lines(doc))
		or (spec["portions"] and spec["portions"] != doc.base_portions)
		or (spec["minutes"] is not None and spec["minutes"] != doc.total_minutes)
		or any(
			spec[k] and spec[k] != (doc.get(f) or None)
			for k, f in (
				("family", "family"),
				("subtitle", "subtitle"),
				("tip", "tip"),
				("allergens", "allergens"),
			)
		)
		or (status_after != doc.status)
	)
	dish = _dish(spec["dish"], spec["name"], pool)
	linking = bool(dish) and dish["status"] in ("matched", "ambiguous")
	line = {
		"name": spec["name"],
		"status": "new" if not doc else "exists" if (changed or linking) else "unchanged",
		"recipe": doc.name if doc else None,
		"spec": spec,
		"portions": portions,
		"minutes": spec["minutes"] if spec["minutes"] is not None else (doc.total_minutes if doc else None),
		"ingredients": reading,
		"removed": removed,
		"steps_count": len(steps),
		"steps_said": spec["steps"] is not None,
		"status_after": status_after,
		"to_complete": to_complete,
		"needs": needs,
		"dish": dish,
	}
	if doc:
		line["will_hold"] = {
			"recipe": doc.recipe_name,
			"portions": portions,
			"ingredients": [f"{r['name']} {r['qty'] or ''} {r['unit'] or ''}".strip() for r in reading],
			"steps": len(steps),
		}
	return line


def propose(recipes_said) -> dict:
	"""What the recipes the owner described mean, and nothing written."""
	_manage()
	specs = _read(recipes_said)
	pool = menu_plan._pool()
	lines = [_check(spec, pool) for spec in specs]
	return {
		"recipes": lines,
		"counts": {
			"new": sum(1 for line in lines if line["status"] == "new"),
			"updated": sum(1 for line in lines if line["status"] == "exists"),
			"unchanged": sum(1 for line in lines if line["status"] == "unchanged"),
			"to_complete": sum(len(line["to_complete"]) for line in lines),
		},
	}


def _write(line: dict, item: str | None) -> dict:
	spec = line["spec"]
	doc = _existing(spec["name"])
	created = doc is None
	held = (
		[
			{
				"name": r.ingredient_name,
				"qty": flt(r.qty) or None,
				"unit": r.unit or None,
				"without_quantity": bool(cint(r.to_taste)),
				"item": r.item or None,
				"shelf": r.shelf or None,
			}
			for r in doc.get("ingredients") or []
		]
		if doc
		else []
	)
	rows, _changes = _merged(held, spec["ingredients"])
	if created:
		doc = frappe.new_doc(DOCTYPE)
		doc.recipe_name = spec["name"]
		doc.source_kind = "Own"
		doc.culinary_status = "Not tested"
	for field, value in (
		("family", spec["family"]),
		("subtitle", spec["subtitle"]),
		("tip", spec["tip"]),
		("allergens", spec["allergens"]),
		("base_portions", spec["portions"]),
		("total_minutes", spec["minutes"]),
	):
		if value is not None:
			doc.set(field, value)
	if spec["vegetarian"] is not None:
		doc.vegetarian = 1 if spec["vegetarian"] else 0
	if spec["source"]:
		doc.source_title = spec["source"]
	if spec["steps"] is not None:
		doc.steps = "\n".join(spec["steps"])
	doc.set("ingredients", [])
	for row in rows:
		doc.append(
			"ingredients",
			{
				"ingredient_name": row["name"],
				"qty": row["qty"] or 0,
				"unit": row["unit"],
				"to_taste": 1 if row["without_quantity"] else 0,
				"item": row["item"],
				"shelf": row.get("shelf"),
			},
		)
	doc.status = line["status_after"]
	doc.save() if not created else doc.insert()
	linked = None
	if item:
		linked = recipes.set_dish_recipe(item, doc.name)
	return {
		"recipe": doc.name,
		"written": "created" if created else "updated",
		"status": doc.status,
		"dish": linked,
	}


def apply(lines) -> dict:
	"""Write what the owner confirmed: `lines` are the lines `propose` answered, each dish with an article settled (`dish.item`) where one is
	to be linked. All of it, or none. Every line is checked again against the restaurant as it is now."""
	_manage()
	if not isinstance(lines, list) or not lines:
		frappe.throw(_("Nothing to write."))
	if len(lines) > MOST_RECIPES:
		frappe.throw(_("At most {0} recipes at a time.").format(MOST_RECIPES))
	pool = menu_plan._pool()
	pool_names = {item["name"] for item in pool}
	checked = []
	for line in lines:
		if not isinstance(line, dict) or not isinstance(line.get("spec"), dict):
			frappe.throw(_("A recipe to write is a line `propose` answered."))
		fresh = _check(_read([line["spec"]])[0], pool)
		if fresh["needs"]:
			frappe.throw(
				_("«{0}» is not ready to be written: it needs {1}.").format(
					fresh["name"], ", ".join(fresh["needs"])
				)
			)
		wanted = (line.get("dish") or {}).get("item")
		if wanted and wanted not in pool_names:
			frappe.throw(_("«{0}» is not a dish the restaurant sells.").format(wanted))
		if (line.get("dish") or {}).get("status") == "ambiguous" and not wanted:
			frappe.throw(_("Which dish is «{0}»? Choose one first.").format(line["dish"]["said"]))
		checked.append((fresh, wanted))
	if any(f["status"] == "new" for f, _w in checked):
		permissions.require(DOCTYPE, "create")
	written = []
	for fresh, wanted in checked:
		if fresh["status"] == "unchanged" and not wanted:
			written.append(
				{
					"recipe": fresh["recipe"],
					"written": "unchanged",
					"status": fresh["status_after"],
					"dish": None,
				}
			)
			continue
		written.append(_write(fresh, wanted if (fresh["dish"] or {}).get("status") != "present" else None))
	return {"recipes": written}
