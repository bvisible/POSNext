# //// Neoffice — added file (no upstream equivalent). The options of the dishes (the cooking of a steak, the side of a fish) set with
# //// the owner by talking, the way the card is (NeoResto, « Nora au restaurant », lot R1). Study: Obsidian `Neoffice/NeoResto/22-…`.
"""The option groups of the dishes of a restaurant, proposed from what a cook knows and written once the owner said yes.

The till asks a waiter for the cooking of a steak and the side of a fish when the dish carries an option group for it (`Product Option
Group`, applied to an item group or to single items). Setting them one dish at a time is a day of work; Nora does it in a sentence:
« les viandes, il faut une cuisson et un accompagnement ». Two moves, never one:

- `propose` WRITES NOTHING. For the families or the dishes named (or every dish family when none is named) it answers which option
  groups the till should carry, on which families and dishes, which exist already and what they lack, and what it left alone and why (a
  chicken has no cooking to ask). What a cook knows is cuisine_knowledge.py.
- `apply` writes what the owner confirmed: the groups that do not exist, and the families and dishes that an existing group does not
  cover yet. All or none.

What it never does: change the options of a group that exists (the owner's wording stays), give an option a price, or take a family or
a dish out of a group. It is a management act, switched on per site with the card (`card_plan.SITE_FLAG`), and whoever may not
manage the options may neither propose nor apply.
"""

import frappe
from frappe import _

from pos_next.restaurant import card_plan, cuisine_knowledge, permissions, spoken_list
from pos_next.restaurant.cuisine_knowledge import COOKING, GROUPS, SIDE

DOCTYPE = "Product Option Group"
# What a word must be to name a family or a dish: as close as for an article (spoken_list._score)
MOST_TARGETS = 20
# The dishes listed back, at most, when a family is long
LISTED = 12


def _manage() -> None:
	card_plan.require_active()
	permissions.require_right("manage_options")


def _targets(targets) -> list[str]:
	"""The words naming what to set (« viandes », « entrecôte »); none means every family of dishes."""
	if targets in (None, ""):
		return []
	if not isinstance(targets, list):
		frappe.throw(_("Name the families or the dishes to set, as a list."))
	if len(targets) > MOST_TARGETS:
		frappe.throw(_("At most {0} families or dishes at a time.").format(MOST_TARGETS))
	words = []
	for target in targets:
		text = str(target.get("text") if isinstance(target, dict) else target or "").strip()
		if text:
			words.append(text)
	return words


def _has(doctype: str, field: str) -> bool:
	return frappe.get_meta(doctype).has_field(field)


def _all_groups() -> list[dict]:
	fields = ["name", "parent_item_group", "is_group"]
	if _has("Item Group", "service_family"):
		fields.append("service_family")
	return frappe.get_all("Item Group", fields=fields, limit_page_length=0)


def _dishes_of(group: str) -> list[dict]:
	"""The dishes sold directly in a family: the till matches an option group to the family an item is in, not to its ancestors."""
	filters = {"item_group": group, "disabled": 0}
	if _has("Item", "is_sales_item"):
		filters["is_sales_item"] = 1
	return frappe.get_all(
		"Item", filters=filters, fields=["name", "item_name", "item_group"], limit_page_length=0
	)


def _descendants(group: str, groups: list[dict]) -> list[str]:
	found = [group]
	for row in groups:
		if row["parent_item_group"] == group:
			found.extend(_descendants(row["name"], groups))
	return found


def _closest(text: str, names: list[str]) -> list[str]:
	"""The names a few words fit best, the nearest first (several when they tie), none when none fits."""
	wanted = spoken_list._words(text)
	scored = [(spoken_list._score(wanted, spoken_list._words(name), []), name) for name in names]
	scored = [pair for pair in scored if pair[0] >= spoken_list.CONFIDENT]
	if not scored:
		return []
	best = max(score for score, _name in scored)
	return [
		name for score, name in sorted(scored, key=lambda pair: -pair[0]) if score >= best - spoken_list.TIE
	]


def _dish_families(groups: list[dict]) -> list[str]:
	"""The families that hold dishes: those the service family says are Main courses, else none (a site that has not set them)."""
	return [row["name"] for row in groups if row.get("service_family") == "Main"]


def _resolve(words: list[str]):
	"""(families, dishes, unknown): the item groups and the single dishes the words name, and the words that name nothing."""
	groups = _all_groups()
	names = [row["name"] for row in groups]
	families, dishes, unknown = [], [], []
	if not words:
		for name in _dish_families(groups):
			families.extend(_descendants(name, groups))
		return list(dict.fromkeys(families)), [], []
	pool = [
		item
		for family in dict.fromkeys(f for name in _dish_families(groups) for f in _descendants(name, groups))
		for item in _dishes_of(family)
	]
	for text in words:
		by_group = _closest(text, names)
		if len(by_group) == 1:
			families.extend(_descendants(by_group[0], groups))
			continue
		by_item = _closest(text, [item["item_name"] for item in pool])
		found = [item for item in pool if item["item_name"] in by_item]
		if found:
			dishes.extend(found)
		else:
			unknown.append(text)
	seen = set()
	unique_dishes = [d for d in dishes if not (d["name"] in seen or seen.add(d["name"]))]
	return list(dict.fromkeys(families)), unique_dishes, unknown


def existing_group(kind: dict):
	"""The option group of the restaurant that is this kind, under whatever name it has, with what it already covers; None if none."""
	for row in frappe.get_all(DOCTYPE, fields=["name", "group_name"], limit_page_length=0):
		if cuisine_knowledge.is_known_as(kind, row["group_name"]):
			doc = frappe.get_doc(DOCTYPE, row["name"])
			return {
				"name": doc.name,
				"item_groups": {r.item_group for r in doc.get("applicable_item_groups") or []},
				"items": {r.item for r in doc.get("applicable_items") or []},
			}
	return None


def _line(kind: dict, families: list[str], dishes: list[dict]) -> dict | None:
	"""One option group of the answer: what it is, what is to be added to it, or None when there is nothing to add or to say."""
	found = existing_group(kind)
	covered_groups = found["item_groups"] if found else set()
	covered_items = found["items"] if found else set()
	add_groups = [name for name in families if name not in covered_groups]
	add_items = [
		{"item": d["name"], "item_name": d["item_name"]}
		for d in dishes
		if d["name"] not in covered_items
		and d["item_group"] not in covered_groups
		and d["item_group"] not in add_groups
	]
	if not families and not dishes:
		return None
	status = "new" if not found else ("extend" if add_groups or add_items else "present")
	return {
		"kind": kind["key"],
		"group": found["name"] if found else kind["group_name"],
		"status": status,
		"selection_type": kind["selection_type"],
		"required": kind["required"],
		"options": list(kind["options"]),
		"add_item_groups": add_groups if status != "present" else [],
		"add_items": add_items if status != "present" else [],
	}


def propose(targets=None) -> dict:
	"""What the till should carry for the dishes named (every dish family when none is), and nothing written.

	Answers {lines, left_alone, unknown, counts}. `lines` are the option groups (kind, group, status new / extend / present, options,
	what to add to the group); `left_alone` the dishes whose cooking is not asked, and why."""
	_manage()
	families, dishes, unknown = _resolve(_targets(targets))
	cooking_dishes, side_families, side_dishes, left_alone = [], [], [], []
	for family in families:
		listed = _dishes_of(family)
		if cuisine_knowledge.family_has_a_side(family):
			side_families.append(family)
		for dish in listed:
			if cuisine_knowledge.is_cooked_to_order(dish["item_name"]):
				cooking_dishes.append(dish)
			elif len(left_alone) < LISTED and cuisine_knowledge.family_has_a_side(family):
				left_alone.append(
					{"item_name": dish["item_name"], "why": "served cooked through: no cooking to ask"}
				)
	for dish in dishes:
		if cuisine_knowledge.is_cooked_to_order(dish["item_name"]):
			cooking_dishes.append(dish)
		else:
			left_alone.append(
				{"item_name": dish["item_name"], "why": "served cooked through: no cooking to ask"}
			)
		if cuisine_knowledge.family_has_a_side(dish["item_group"]):
			side_dishes.append(dish)
	cooking_dishes = list({d["name"]: d for d in cooking_dishes}.values())
	lines = [
		line
		for line in (_line(COOKING, [], cooking_dishes), _line(SIDE, side_families, side_dishes))
		if line is not None
	]
	counts = {
		status: sum(1 for line in lines if line["status"] == status)
		for status in ("new", "extend", "present")
	}
	return {"lines": lines, "left_alone": left_alone, "unknown": unknown, "counts": counts}


def _check(line: dict) -> dict:
	"""A line of the proposal, checked before anything is written."""
	kind = GROUPS.get(line.get("kind"))
	if not kind:
		frappe.throw(_("{0} is not an option group Nora knows.").format(line.get("kind") or "-"))
	groups = [str(g) for g in line.get("add_item_groups") or []]
	items = [i.get("item") if isinstance(i, dict) else i for i in line.get("add_items") or []]
	for group in groups:
		if not frappe.db.exists("Item Group", group):
			frappe.throw(_("The family {0} does not exist.").format(group), frappe.DoesNotExistError)
	for item in items:
		if not frappe.db.exists("Item", item):
			frappe.throw(_("The article {0} does not exist.").format(item), frappe.DoesNotExistError)
	return {"kind": kind, "groups": groups, "items": items}


def apply(lines: list) -> dict:
	"""Write what the owner confirmed: the option groups that do not exist, and what an existing one does not cover yet. All or none.

	Each line is a `line` of the proposal. The state of the site is read again here (a group made meanwhile is extended, not made twice).
	Answers {created, extended, item_groups, items}."""
	_manage()
	lines = [line for line in lines or [] if line and line.get("status") != "present"]
	if not lines:
		frappe.throw(_("Nothing to set."))
	checked = [_check(line) for line in lines]
	created, extended, groups_added, items_added = [], [], 0, 0
	for item in checked:
		kind, groups, items = item["kind"], item["groups"], item["items"]
		found = existing_group(kind)
		if found:
			doc = frappe.get_doc(DOCTYPE, found["name"])
			new_groups = [g for g in groups if g not in found["item_groups"]]
			new_items = [i for i in items if i not in found["items"]]
			for group in new_groups:
				doc.append("applicable_item_groups", {"item_group": group})
			for code in new_items:
				doc.append(
					"applicable_items",
					{"item": code, "item_name": frappe.db.get_value("Item", code, "item_name")},
				)
			if new_groups or new_items:
				doc.save()
				extended.append(doc.name)
			groups_added += len(new_groups)
			items_added += len(new_items)
			continue
		doc = frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"group_name": kind["group_name"],
				"selection_type": kind["selection_type"],
				"required": kind["required"],
				"options": [
					{"option_name": name, "price_adjustment": 0, "is_default": 0} for name in kind["options"]
				],
				"applicable_item_groups": [{"item_group": g} for g in groups],
				"applicable_items": [
					{"item": code, "item_name": frappe.db.get_value("Item", code, "item_name")}
					for code in items
				],
			}
		).insert()
		created.append(doc.name)
		groups_added += len(groups)
		items_added += len(items)
	return {"created": created, "extended": extended, "item_groups": groups_added, "items": items_added}
