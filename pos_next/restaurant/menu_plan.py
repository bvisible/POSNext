# //// Neoffice — added file (no upstream equivalent). The menus (formulas at a fixed price) of a restaurant composed with its owner by
# //// talking, the way the card and the options are (NeoResto, « Nora au restaurant », lot R2). Study: Obsidian `Neoffice/NeoResto/22-…`.
"""A menu — « le menu du midi : plat du jour et café, 24 francs » — composed from what the owner says and written once he said yes.

A `Restaurant Menu` is a name, a price and its courses (« Entrée », « Plat », « Dessert »): each course holds one dish or several among
which the customer chooses. It is shown at the till through a row of type Menu on a card. Two moves, never one:

- `propose` WRITES NOTHING. For each menu said it answers what it understood: the menu is new or exists (and what would change), each dish
  said is an article the restaurant sells (matched), several it could be (ambiguous: the owner chooses), one to make in a family he named
  (to_create), or unknown; what is still missing (a price, never guessed); and where it would go on a card.
- `apply` writes what the owner confirmed: the dishes to make, the menu with its courses, its place on the card. All or none.

What it never does: give a menu a price nobody gave (a menu with no price waits), take away a course or a dish the owner did not name, put
a menu on a card that does not exist, or write a dish that is not in a family. It is a management act, switched on per site with the card
(`card_plan.SITE_FLAG`), and kept to whoever may write menus.
"""

import re

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next.restaurant import card_plan, cuisine_knowledge, permissions, spoken_list
from pos_next.restaurant.settings import default_restaurant

DOCTYPE = "Restaurant Menu"
CARD = "Restaurant Card"
MOST_MENUS = 5
MOST_COURSES = 8
MOST_CHOICES = 12
CANDIDATES = 4
NAME_LENGTH = 140
# The heading of a card under which its menus stand: the demo menu of a restaurant calls it « Menu du jour »; any heading with the word « menu »
HEADING_WORD = "menu"
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RESOLVED = ("matched", "present", "to_create", "remove")


def _manage() -> None:
	card_plan.require_active()
	permissions.require(DOCTYPE, "write")


def _name(value) -> str:
	return " ".join(str(value or "").split())[:NAME_LENGTH]


def _fold(value) -> str:
	return cuisine_knowledge.fold(value)


def _date(value, label):
	if value in (None, ""):
		return None
	text = str(value).strip()
	if not _DATE.match(text):
		frappe.throw(_("{0}: a date is written 2026-12-24.").format(label))
	return text


def _read(menus) -> list[dict]:
	"""The menus said, cleaned and checked, or frappe.ValidationError saying what is wrong."""
	if not isinstance(menus, list) or not menus:
		frappe.throw(_("Say which menu to compose."))
	if len(menus) > MOST_MENUS:
		frappe.throw(_("At most {0} menus at a time.").format(MOST_MENUS))
	out = []
	for raw in menus:
		if not isinstance(raw, dict):
			frappe.throw(_("A menu is {name, price, courses}."))
		name = _name(raw.get("name"))
		if not name:
			frappe.throw(_("Name the menu."))
		price = card_plan._price(raw.get("price"))
		if raw.get("price") not in (None, "") and (price is None or price <= 0):
			frappe.throw(_("The price of {0} is not a price: {1}.").format(name, raw.get("price")))
		courses = raw.get("courses") or []
		if not isinstance(courses, list) or len(courses) > MOST_COURSES:
			frappe.throw(_("A menu has at most {0} courses.").format(MOST_COURSES))
		cleaned = []
		for course in courses:
			if not isinstance(course, dict) or not _name(course.get("name")):
				frappe.throw(_("A course of {0} has a name (Entrée, Plat, Dessert…).").format(name))
			choices = course.get("choices") or []
			if not isinstance(choices, list) or len(choices) > MOST_CHOICES:
				frappe.throw(_("A course holds at most {0} dishes.").format(MOST_CHOICES))
			rows = []
			for choice in choices:
				entry = {"text": _name(choice.get("text") if isinstance(choice, dict) else choice)}
				if not entry["text"]:
					frappe.throw(_("A dish of the course {0} has no name.").format(_name(course.get("name"))))
				if isinstance(choice, dict):
					entry["family"] = _name(choice.get("family")) or None
					entry["remove"] = bool(choice.get("remove"))
				rows.append(entry)
			cleaned.append({"name": _name(course.get("name")), "choices": rows})
		out.append(
			{
				"name": name,
				"price": price,
				"description": str(raw.get("description") or "").strip()[:500] or None,
				"active": None if raw.get("active") in (None, "") else bool(raw.get("active")),
				"available_from": _date(raw.get("available_from"), name),
				"available_to": _date(raw.get("available_to"), name),
				"card": raw.get("card"),
				"courses": cleaned,
			}
		)
	return out


def _existing_menu(name: str):
	"""The menu of the restaurant that has this name (case and accents forgiven), with its courses; None if none."""
	for row in frappe.get_all(DOCTYPE, fields=["name", "menu_name"], limit_page_length=0):
		if _fold(row["menu_name"]) == _fold(name):
			doc = frappe.get_doc(DOCTYPE, row["name"])
			courses: dict[str, list[dict]] = {}
			for course in doc.get("courses") or []:
				courses.setdefault(course.course_name, []).append(
					{"item": course.item, "item_name": course.item_name}
				)
			return {
				"doc": doc,
				"name": doc.name,
				"price": flt(doc.price),
				"active": cint(doc.is_active),
				"courses": courses,
			}
	return None


def _pool() -> list[dict]:
	"""The articles the restaurant sells: what a dish said can be."""
	filters = {"disabled": 0}
	if frappe.get_meta("Item").has_field("is_sales_item"):
		filters["is_sales_item"] = 1
	return frappe.get_all(
		"Item", filters=filters, fields=["name", "item_name", "item_group"], limit_page_length=0
	)


def _closest(text: str, pool: list[dict]) -> list[dict]:
	"""The articles a few words fit best, the nearest first (several when they tie), none when none fits."""
	wanted = spoken_list._words(text)
	scored = [(spoken_list._score(wanted, spoken_list._words(item["item_name"]), []), item) for item in pool]
	scored = [pair for pair in scored if pair[0] >= spoken_list.CONFIDENT]
	if not scored:
		return []
	best = max(score for score, _item in scored)
	return [
		item for score, item in sorted(scored, key=lambda pair: -pair[0]) if score >= best - spoken_list.TIE
	]


def _choice(entry: dict, pool: list[dict], in_course: list[dict]) -> dict:
	"""One dish said, resolved against what the restaurant sells (or, to take it out, against what the course holds)."""
	said = entry["text"]
	answer = {
		"said": said,
		"status": "unknown",
		"item": None,
		"item_name": None,
		"candidates": [],
		"family": None,
	}
	if entry.get("remove"):
		kept = [{"name": c["item"], "item_name": c["item_name"]} for c in in_course]
		found = _closest(said, kept)
		if len(found) == 1:
			answer.update(status="remove", item=found[0]["name"], item_name=found[0]["item_name"])
		elif found:
			answer.update(
				status="ambiguous",
				candidates=[{"item": i["name"], "item_name": i["item_name"]} for i in found[:CANDIDATES]],
			)
		return answer
	found = _closest(said, pool)
	if len(found) == 1:
		item = found[0]
		held = any(c["item"] == item["name"] for c in in_course)
		answer.update(status="present" if held else "matched", item=item["name"], item_name=item["item_name"])
	elif found:
		answer.update(
			status="ambiguous",
			candidates=[{"item": i["name"], "item_name": i["item_name"]} for i in found[:CANDIDATES]],
		)
	elif entry.get("family") and frappe.db.exists("Item Group", entry["family"]):
		answer.update(status="to_create", item_name=said, family=entry["family"])
	return answer


def _card_placement(restaurant: str, wanted, menu_name: str) -> dict | None:
	"""Where the menu would go: the card named, else the restaurant's own; None when the owner asked for none."""
	if wanted in (None, "", False):
		return None
	name, exists = card_plan._card_of(restaurant, None if wanted is True else str(wanted))
	if not exists:
		return {"name": name, "exists": False, "placed": False, "will_place": False}
	placed = bool(
		frappe.db.exists("Restaurant Card Item", {"parent": name, "item_type": "Menu", "menu": menu_name})
	)
	return {"name": name, "exists": True, "placed": placed, "will_place": not placed}


def propose(menus) -> dict:
	"""What the menus said mean, and nothing written.

	Answers {menus, counts}: for each menu, `status` (new, extend or unchanged), the price asked and the one it has, its courses with each dish
	(matched, present, ambiguous, to_create, remove or unknown), what is still missing (`needs`), and where it would go on a card."""
	_manage()
	restaurant = default_restaurant()
	if not restaurant:
		frappe.throw(_("This site has no restaurant to compose a menu for."))
	pool = _pool()
	answered = []
	for menu in _read(menus):
		existing = _existing_menu(menu["name"])
		held = existing["courses"] if existing else {}
		courses, changed = [], False
		for course in menu["courses"]:
			key = next((c for c in held if _fold(c) == _fold(course["name"])), None)
			in_course = held.get(key, []) if key else []
			choices = [_choice(entry, pool, in_course) for entry in course["choices"]]
			changed = changed or any(c["status"] in ("matched", "to_create", "remove") for c in choices)
			courses.append(
				{"name": key or course["name"], "status": "existing" if key else "new", "choices": choices}
			)
		changed = changed or any(c["status"] == "new" for c in courses)
		price = menu["price"]
		price_changed = bool(existing) and price is not None and price != existing["price"]
		needs = [] if price or existing else ["price"]
		if not existing and not any(c["choices"] for c in courses):
			needs.append("courses")
		status = (
			"new"
			if not existing
			else (
				"extend"
				if changed or price_changed or menu["description"] or menu["active"] is not None
				else "unchanged"
			)
		)
		card = _card_placement(restaurant, menu["card"], existing["name"] if existing else menu["name"])
		if card and card["will_place"] and status == "unchanged":
			status = "extend"
		answered.append(
			{
				"name": existing["name"] if existing else menu["name"],
				"status": status,
				"price": price if price is not None else (existing["price"] if existing else None),
				"price_was": existing["price"] if existing else None,
				"description": menu["description"],
				"active": menu["active"],
				"available_from": menu["available_from"],
				"available_to": menu["available_to"],
				"restaurant": restaurant,
				"courses": courses,
				"needs": needs,
				"card": card,
			}
		)
	counts = {s: sum(1 for m in answered if m["status"] == s) for s in ("new", "extend", "unchanged")}
	counts["to_settle"] = sum(
		1
		for m in answered
		for c in m["courses"]
		for ch in c["choices"]
		if ch["status"] in ("ambiguous", "unknown")
	)
	return {"menus": answered, "counts": counts}


def _check(menu: dict) -> dict:
	"""A menu of the proposal, checked before anything is written; frappe.ValidationError says what is still to settle."""
	name = _name(menu.get("name"))
	if not name:
		frappe.throw(_("Name the menu."))
	existing = _existing_menu(name)
	price = card_plan._price(menu.get("price")) if menu.get("price") not in (None, "") else None
	if not existing and not price:
		frappe.throw(_("The menu {0} has no price yet: ask the owner.").format(name))
	if price is not None and price <= 0:
		frappe.throw(_("The price of {0} must be more than zero.").format(name))
	items_to_make = []
	for course in menu.get("courses") or []:
		for choice in course.get("choices") or []:
			status = choice.get("status")
			if status not in RESOLVED:
				frappe.throw(
					_("{0}: «{1}» is still to settle ({2}).").format(
						name, choice.get("said") or "-", status or "unknown"
					)
				)
			if status == "to_create":
				family = choice.get("family")
				if not family or not frappe.db.exists("Item Group", family):
					frappe.throw(
						_("The family {0} does not exist.").format(family or "-"), frappe.DoesNotExistError
					)
				items_to_make.append(choice)
			elif not frappe.db.exists("Item", choice.get("item")):
				frappe.throw(
					_("The article {0} does not exist.").format(choice.get("item") or "-"),
					frappe.DoesNotExistError,
				)
	return {"menu": menu, "name": name, "existing": existing, "price": price, "to_make": items_to_make}


def _make_item(choice: dict) -> str:
	"""A dish that is new: an article sold, in the family the owner named, with no price of its own (the menu has one)."""
	code = _name(choice["said"])
	if frappe.db.exists("Item", code):
		return code
	doc = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": code,
			"item_group": choice["family"],
			"stock_uom": card_plan._default_uom(),
			"is_stock_item": 0,
			"is_sales_item": 1,
			"is_purchase_item": 0,
			"description": code,
		}
	)
	# crm mirrors every new Item into a CRM Product unless told not to: a dish is no product of the CRM
	doc.flags.ignore_crm_sync = True
	doc.insert(ignore_permissions=True)
	return doc.name


def _courses_rows(checked: dict, made: dict) -> list[dict]:
	"""The courses of the menu as the document holds them: what it had, minus what was taken out, plus what was added."""
	existing = checked["existing"]
	courses: dict[str, list[str]] = {
		name: [c["item"] for c in rows] for name, rows in (existing["courses"] if existing else {}).items()
	}
	order = list(courses)
	for course in checked["menu"].get("courses") or []:
		key = next((c for c in courses if _fold(c) == _fold(course.get("name"))), None)
		if key is None:
			key = _name(course.get("name"))
			courses[key] = []
			order.append(key)
		for choice in course.get("choices") or []:
			code = (
				made.get(_name(choice.get("said"))) if choice["status"] == "to_create" else choice.get("item")
			)
			if choice["status"] == "remove":
				courses[key] = [i for i in courses[key] if i != code]
			elif code and code not in courses[key]:
				courses[key].append(code)
	rows = []
	for index, key in enumerate([c for c in order if courses[c]], start=1):
		for k, code in enumerate(courses[key]):
			rows.append(
				{
					"course_name": key,
					"item": code,
					"item_name": frappe.db.get_value("Item", code, "item_name"),
					"sort_order": index * 10 + k,
				}
			)
	return rows


def _write_menu(checked: dict, made: dict, restaurant: str) -> tuple[str, bool]:
	menu, existing = checked["menu"], checked["existing"]
	rows = _courses_rows(checked, made)
	if existing:
		doc = frappe.get_doc(DOCTYPE, existing["name"])
		if checked["price"]:
			doc.price = checked["price"]
	else:
		doc = frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"menu_name": checked["name"],
				"price": checked["price"],
				"is_active": 1,
				"restaurant": restaurant,
			}
		)
	if menu.get("description"):
		doc.description = menu["description"]
	if menu.get("active") is not None:
		doc.is_active = 1 if menu["active"] else 0
	if menu.get("available_from"):
		doc.available_from = menu["available_from"]
	if menu.get("available_to"):
		doc.available_to = menu["available_to"]
	doc.set("courses", rows)
	doc.flags.ignore_permissions = True
	doc.insert() if doc.is_new() else doc.save()
	return doc.name, existing is None


def _place_on_card(menu_name: str, card_name: str) -> bool:
	"""Put the menu on the card, under the heading of its menus (made when there is none); False when it is there already."""
	card = frappe.get_doc(CARD, card_name)
	sequence = sorted(card.get("items") or [], key=lambda row: (cint(row.sort_order), cint(row.idx)))
	if any(row.item_type == "Menu" and row.menu == menu_name for row in sequence):
		return False
	heading = next(
		(
			position
			for position, row in enumerate(sequence)
			if row.item_type == "Category"
			and not cint(row.is_subcategory)
			and HEADING_WORD in _fold(row.label).split()
		),
		None,
	)
	if heading is None:
		sequence.append(
			card.append(
				"items", {"item_type": "Category", "label": _("Menus"), "is_subcategory": 0, "disabled": 0}
			)
		)
		heading = len(sequence) - 1
	row = card.append("items", {"item_type": "Menu", "menu": menu_name, "is_subcategory": 0, "disabled": 0})
	sequence.insert(card_plan._family_end(sequence, heading), row)
	for position, line in enumerate(sequence, start=1):
		line.sort_order = position * 10
		line.idx = position
	card.items = sequence
	card.flags.ignore_permissions = True
	card.save()
	return True


def apply(menus: list) -> dict:
	"""Write what the owner confirmed: the dishes to make, the menus with their courses, their place on a card. All or none.

	Each menu is a `menu` of the proposal with every dish settled (matched, present, to_create or remove): an ambiguous or unknown one, a
	menu with no price, a family or an article that does not exist stop everything before the first write. Answers {menus}."""
	_manage()
	menus = [menu for menu in menus or [] if menu and menu.get("status") != "unchanged"]
	if not menus:
		frappe.throw(_("Nothing to compose."))
	checked = [_check(menu) for menu in menus]
	if any(item["existing"] is None for item in checked):
		permissions.require(DOCTYPE, "create")
	needs_items = any(item["to_make"] for item in checked)
	needs_card = any((item["menu"].get("card") or {}).get("will_place") for item in checked)
	if needs_items:
		permissions.require_right("create_items")
	if needs_card:
		permissions.require_right("manage_cards")
	restaurant = default_restaurant()
	if not restaurant:
		frappe.throw(_("This site has no restaurant to compose a menu for."))
	report = []
	for item in checked:
		made = {_name(c["said"]): _make_item(c) for c in item["to_make"]}
		name, created = _write_menu(item, made, restaurant)
		card = item["menu"].get("card") or {}
		placed = None
		if card.get("will_place") and card.get("exists") and _place_on_card(name, card["name"]):
			placed = card["name"]
		report.append(
			{"name": name, "created": created, "items_made": sorted(made.values()), "placed_on": placed}
		)
	return {"menus": report}
