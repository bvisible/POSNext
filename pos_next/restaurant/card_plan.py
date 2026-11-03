# //// Neoffice — added file (no upstream equivalent). The card of a restaurant built step by step from a plan, the way Nora
# //// builds it with the owner (NeoResto, « créer la carte avec Nora », Daniel, 03.11.2026). Design: Obsidian `Neoffice/NeoResto/20-…`.
"""The card of a restaurant, built one step at a time from a plan: proposed first, written only once the owner validated.

A step is a part of the card the owner talks about (the coffees, the cold drinks, the wines of a supplier, the dishes): families of
service, their sub-families and the articles in them, with a price when there is one. Nora turns the conversation into a plan and the
server does what a person at the card editor would do, in two moves and never one:

- `propose` WRITES NOTHING. It answers what it understood: what is new, what exists already, what has no price, what it could not
  use (a service family it does not know, a colour outside the palette, a station the restaurant has not got).
- `apply` writes what was validated, in one transaction, and answers a manifest of what it made. `undo` takes a step back with that
  manifest: what the step made goes, what was there before stays as it was.

What it never does: write twice (a family, an article, a card row that exists is reused), overwrite the settings of a family that
exists, move an article that exists to another family, give a dish a price nobody gave. A dish with no price is made and put on the
card **switched off** (`Restaurant Card Item.disabled`), so that nothing without a price reaches a customer; it appears as soon as a
later step gives it a price. The VAT is never chosen here: the families are made under the restaurant's root group, which carries it,
and every group below inherits it.

It is switched on per site (`neoresto_card_with_nora_active`, off unless the site sets it) and is a management act: whoever may not write
the cards of a restaurant may neither propose nor apply.
"""

import re
import unicodedata

import frappe
from frappe import _
from frappe.utils import cint, flt
from frappe.utils.nestedset import get_descendants_of, get_root_of

from pos_next.restaurant import permissions
from pos_next.restaurant.settings import default_restaurant

# The site flag that lets the card be built with Nora: in site_config.json, off unless the site switches it on
SITE_FLAG = "neoresto_card_with_nora_active"
# The group a restaurant's families are made under: it carries the VAT, the groups below inherit it
DEFAULT_ROOT = "Alimentation"
SERVICE_FAMILIES = ("Starter", "Main", "Dessert", "Drink")
# The colours of the card: a fixed palette (a family takes one, a sub-family may take another), never a free choice
PALETTE = {
	"brown": "#A07856",
	"blue": "#5B9BD5",
	"orange": "#E39A4A",
	"green": "#6BAF6B",
	"pink": "#D9779B",
	"red": "#C1372C",
	"yellow": "#D9B84A",
	"amber": "#E0980F",
	"terracotta": "#B5532B",
	"teal": "#4A9BB8",
}
# What a family of service takes as its colour when the plan names none
DEFAULT_COLOR = {"Starter": "green", "Main": "orange", "Dessert": "pink", "Drink": "blue"}
NAME_LENGTH = 140


def active() -> bool:
	"""Whether the site lets the card be built with Nora: its `neoresto_card_with_nora_active` flag says 1."""
	return cint(frappe.conf.get(SITE_FLAG, 0)) == 1


def require_active() -> None:
	"""Refuse, with a short message, a call where the site has not switched the feature on."""
	if not active():
		frappe.throw(_("Building the card with Nora is not available"), frappe.PermissionError)


# ─── Reading the plan ────────────────────────────────────────────────────────


def _name(value) -> str:
	return " ".join(str(value or "").split())[:NAME_LENGTH]


def _fold(text) -> str:
	"""Lower case, no accents, nothing but letters and digits: « Café  Crème » is « cafe creme »."""
	plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
	return "".join(ch if ch.isalnum() else " " for ch in plain).strip()


def _same(a, b) -> bool:
	return _fold(a) == _fold(b)


_PRICE = re.compile(r"^(?:(?:chf|fr\.?)\s*)?(\d+(?:\.\d+)?)(?:\s*(?:chf|fr\.?|\.-))?$", re.IGNORECASE)


def _price(value):
	"""A price the way a person writes it (« 4,20 », « 4.2 », « CHF 4.20 »), None when it is not one.

	Nothing is guessed: digits glued together (« 3.804.00 »), or a number with words around it (« 4.20 (3 cl) »), make no price: a wrong
	price on a till is worse than a button waiting for its price."""
	if value in (None, ""):
		return None
	if isinstance(value, int | float):
		return flt(value)
	found = _PRICE.match(str(value).strip().replace(",", ".").replace("'", ""))
	return flt(found.group(1)) if found else None


def _read(plan) -> list[dict]:
	"""The families of a plan, each with its sub-families and their articles; what names nothing is dropped."""
	families = []
	for family in (plan or {}).get("families") or []:
		subs = []
		# Articles written straight under the family are an unnamed sub-family: Nora writes « Glaces: vanille, chocolat » that way
		# (03.11, a summer card was refused four times for it)
		raw_subs = list(family.get("subs") or [])
		if family.get("items"):
			raw_subs.append({"name": None, "items": family["items"]})
		for sub in raw_subs:
			items, seen = [], set()
			for item in sub.get("items") or []:
				if isinstance(item, str):
					item = {"name": item}
				name = _name(item.get("name"))
				if not name or _fold(name) in seen:
					continue
				seen.add(_fold(name))
				items.append(
					{
						"name": name,
						"item_code": _name(item.get("item_code")) or None,
						"price": _price(item.get("price")),
						"description": (item.get("description") or "").strip() or None,
						"buy_price": _price(item.get("buy_price")),
						"supplier": _name(item.get("supplier")) or None,
					}
				)
			if items:
				subs.append(
					{"name": _name(sub.get("name")) or None, "color": sub.get("color"), "items": items}
				)
		if _name(family.get("name")) and subs:
			families.append(
				{
					"name": _name(family.get("name")),
					"service_family": family.get("service_family"),
					"station": _name(family.get("station")) or None,
					"color": family.get("color"),
					"subs": subs,
				}
			)
	if not families:
		frappe.throw(_("Nothing to propose: name at least one family with one article in it."))
	return families


# ─── Looking at what exists ──────────────────────────────────────────────────


def _group(name):
	"""The Item Group named so (case and accents forgiven by the database's collation), else None."""
	return frappe.db.get_value(
		"Item Group",
		{"name": name},
		["name", "parent_item_group", "is_group", "service_family", "service_color"],
		as_dict=True,
	)


def _station(restaurant, name):
	"""The Preparation Station of the restaurant named so."""
	if not name:
		return None
	for station in frappe.get_all(
		"Preparation Station", filters={"restaurant": restaurant}, fields=["name", "station_name"]
	):
		if _same(station.station_name, name):
			return station.name
	return None


def _station_holding(group):
	return frappe.db.get_value("Preparation Station Item Group", {"item_group": group}, "parent")


def _selling_price_list(restaurant):
	"""The price list of the restaurant's till, else the site's selling list: (name, currency)."""
	lists = []
	for pos_profile in frappe.get_all(
		"POS Settings", filters={"restaurant": restaurant, "enabled": 1}, pluck="pos_profile"
	):
		lists.append(frappe.db.get_value("POS Profile", pos_profile, "selling_price_list"))
	lists.append(frappe.db.get_single_value("Selling Settings", "selling_price_list"))
	lists.append(frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name"))
	for name in lists:
		row = name and frappe.db.get_value("Price List", {"name": name, "enabled": 1}, ["name", "currency"])
		if row:
			return row[0], row[1]
	frappe.throw(_("The site has no selling price list"))


def _card_of(restaurant, wanted):
	"""The card the step goes on: (name, exists). The one named, else the restaurant's guest menu, else its first card."""
	if wanted and frappe.db.exists("Restaurant Card", wanted):
		return frappe.db.get_value("Restaurant Card", wanted, "name"), True
	if wanted:
		return wanted, False
	guest = frappe.db.get_value("Restaurant", restaurant, "guest_menu")
	if guest and frappe.db.exists("Restaurant Card", guest):
		return guest, True
	first = frappe.get_all(
		"Restaurant Card",
		filters={"restaurant": restaurant, "is_permanent": 0},
		pluck="name",
		order_by="creation asc",
		limit=1,
	)
	if first:
		return first[0], True
	from pos_next.api.restaurant import _free_card_name

	return _free_card_name(_("Main card"), restaurant), False


def _item(name, item_code):
	"""The article a name (or a code Nora found) stands for, else None."""
	for key, value in (("name", item_code), ("name", name), ("item_name", name)):
		if value:
			row = frappe.db.get_value(
				"Item",
				{key: value},
				["name", "item_name", "item_group", "is_sales_item", "disabled"],
				as_dict=True,
			)
			if row:
				return row
	return None


def _has_price(item_code, price_list):
	return bool(
		frappe.db.exists("Item Price", {"item_code": item_code, "price_list": price_list, "selling": 1})
	)


def _resolve(plan) -> dict:
	"""What the plan means on this site, decided once for `propose` and for `apply`; writes nothing."""
	plan = plan or {}
	families = _read(plan)
	warnings = []
	restaurant = plan.get("restaurant") or default_restaurant()
	if not restaurant or not frappe.db.exists("Restaurant", restaurant):
		frappe.throw(_("The site has no restaurant to build the card for"))
	root = _root_group(plan.get("root"), warnings)
	root_tree = {root, *get_descendants_of("Item Group", root)}
	price_list, currency = _selling_price_list(restaurant)
	card, card_exists = _card_of(restaurant, _name(plan.get("card")))
	card_items = (
		frappe.get_all("Restaurant Card Item", filters={"parent": card}, fields=["item"])
		if card_exists
		else []
	)
	on_card = {row.item for row in card_items if row.item}
	counts = {
		"families": 0,
		"subfamilies": 0,
		"buttons": 0,
		"new_items": 0,
		"existing_items": 0,
		"without_price": 0,
	}
	resolved, in_plan = [], set()
	for family in families:
		counts["families"] += 1
		found = _group(family["name"])
		service_family = family["service_family"]
		if service_family:
			canonical = next(
				(f for f in SERVICE_FAMILIES if f.lower() == str(service_family).strip().lower()), None
			)
			if not canonical:
				warnings.append(
					_("Service family {0} of {1} is not known: left out.").format(
						service_family, family["name"]
					)
				)
			service_family = canonical
		color = _color(family["color"], family["name"], warnings)
		station = _station(restaurant, family["station"])
		if family["station"] and not station:
			warnings.append(
				_("The restaurant has no station {0}: {1} is not tied to one.").format(
					family["station"], family["name"]
				)
			)
		if found and found.name not in root_tree:
			warnings.append(
				_("{0} is outside the restaurant's groups: its VAT is its own.").format(found.name)
			)
		if found and (service_family or color) and (found.service_family or found.service_color):
			warnings.append(_("{0} already exists: its own settings are kept.").format(found.name))
		entry = {
			"name": found.name if found else family["name"],
			"status": "exists" if found else "new",
			"parent": found.parent_item_group if found else root,
			"service_family": found.service_family if found and found.service_family else service_family,
			"color": found.service_color if found and found.service_color else color,
			"station": family["station"],
			"station_found": bool(station) or not family["station"],
			"station_id": station,
			"subs": [],
		}
		for sub in family["subs"]:
			sub_found = _group(sub["name"]) if sub["name"] else None
			if sub["name"]:
				counts["subfamilies"] += 1
			sub_entry = {
				"name": (sub_found.name if sub_found else sub["name"]),
				"status": ("exists" if sub_found else "new") if sub["name"] else None,
				"color": sub_found.service_color
				if sub_found and sub_found.service_color
				else _color(sub["color"], sub["name"], warnings),
				"items": [],
			}
			for item in sub["items"]:
				if _fold(item["name"]) in in_plan:
					continue
				in_plan.add(_fold(item["name"]))
				found_item = _item(item["name"], item["item_code"])
				code = found_item.name if found_item else None
				needs_price = not (item["price"] and item["price"] > 0) and not (
					code and _has_price(code, price_list)
				)
				counts["buttons"] += 1
				counts["existing_items" if found_item else "new_items"] += 1
				counts["without_price"] += 1 if needs_price else 0
				if found_item and found_item.disabled:
					warnings.append(_("{0} is disabled: left as it is.").format(found_item.item_name))
				sub_entry["items"].append(
					{
						"name": found_item.item_name if found_item else item["name"],
						"status": "existing" if found_item else "new",
						"item_code": code,
						"price": item["price"] if item["price"] and item["price"] > 0 else None,
						"needs_price": needs_price,
						"on_card": bool(code and code in on_card),
						"description": item["description"],
						"buy_price": item["buy_price"],
						"supplier": item["supplier"],
					}
				)
			entry["subs"].append(sub_entry)
		resolved.append(entry)
	return {
		"step": _name(plan.get("step")) or None,
		"restaurant": restaurant,
		"root": root,
		"price_list": price_list,
		"currency": currency,
		"card": {"name": card, "exists": card_exists},
		"families": resolved,
		"counts": counts,
		"warnings": warnings,
	}


def _color(value, label, warnings):
	"""A colour of the palette (by its name or its value), else None with a word of warning."""
	if not value:
		return None
	text = str(value).strip().lower()
	if text in PALETTE:
		return PALETTE[text]
	for hexa in PALETTE.values():
		if text == hexa.lower():
			return hexa
	warnings.append(_("Colour {0} of {1} is not in the palette: left out.").format(value, label or ""))
	return None


def _root_group(wanted, warnings) -> str:
	"""The group the families go under: the one named, else the restaurant's own (`DEFAULT_ROOT`), else the root of the tree."""
	if wanted and _group(wanted):
		return _group(wanted).name
	if _group(DEFAULT_ROOT):
		return DEFAULT_ROOT
	warnings.append(
		_("No group of the restaurant carries the VAT: the families go under the root of the groups.")
	)
	return get_root_of("Item Group")


def _manage() -> None:
	require_active()
	permissions.require_right("manage_cards")


def propose(plan: dict) -> dict:
	"""What the plan means, and nothing written: see the module's words. Refused to whoever may not manage the cards."""
	_manage()
	return _resolve(plan)


def overview(restaurant: str | None = None, root: str | None = None) -> dict:
	"""What the restaurant has already, for the owner who comes back to a step: the families under the root with the buttons
	(articles sold) in each and in their sub-families, the cards of the restaurant with their buttons and how many are switched off,
	and the preparation stations by name. Writes nothing."""
	_manage()
	restaurant = restaurant or default_restaurant()
	if not restaurant or not frappe.db.exists("Restaurant", restaurant):
		frappe.throw(_("The site has no restaurant to build the card for"))
	root = _root_group(root, [])
	groups = frappe.get_all(
		"Item Group",
		filters={"parent_item_group": root},
		fields=["name", "service_family", "service_color"],
		order_by="lft asc",
	)
	families = []
	for family in groups:
		subs = frappe.get_all(
			"Item Group", filters={"parent_item_group": family.name}, pluck="name", order_by="lft asc"
		)
		counted = {
			row.item_group: row.n
			for row in frappe.get_all(
				"Item",
				filters={"item_group": ["in", [family.name, *subs]], "is_sales_item": 1, "disabled": 0},
				fields=["item_group", "count(name) as n"],
				group_by="item_group",
			)
		}
		families.append(
			{
				"name": family.name,
				"service_family": family.service_family,
				"color": family.service_color,
				"buttons": sum(counted.values()),
				"subs": [{"name": sub, "buttons": counted.get(sub, 0)} for sub in subs],
			}
		)
	cards = []
	for card in frappe.get_all(
		"Restaurant Card", filters={"restaurant": restaurant}, pluck="name", order_by="creation asc"
	):
		rows = frappe.get_all(
			"Restaurant Card Item", filters={"parent": card, "item_type": "Item"}, fields=["disabled"]
		)
		cards.append({"name": card, "buttons": len(rows), "hidden": sum(1 for row in rows if row.disabled)})
	stations = frappe.get_all(
		"Preparation Station",
		filters={"restaurant": restaurant},
		fields=["station_name as name", "station_type as type"],
		order_by="station_name asc",
	)
	return {
		"restaurant": restaurant,
		"root": root,
		"families": families,
		"cards": cards,
		"stations": stations,
	}


# ─── Writing a step ──────────────────────────────────────────────────────────


def _default_uom() -> str:
	return (
		frappe.db.get_single_value("Stock Settings", "stock_uom")
		or frappe.db.get_value("UOM", {"name": ["in", ["Unité", "Nos", "Unit"]]}, "name")
		or frappe.db.get_value("UOM", {}, "name")
	)


def _make_group(name, parent, is_group, service_family=None, color=None) -> str:
	values = {
		"doctype": "Item Group",
		"item_group_name": name,
		"parent_item_group": parent,
		"is_group": is_group,
	}
	if service_family and frappe.get_meta("Item Group").has_field("service_family"):
		values["service_family"] = service_family
	if color and frappe.get_meta("Item Group").has_field("service_color"):
		values["service_color"] = color
	return frappe.get_doc(values).insert(ignore_permissions=True).name


def _link_to_station(station, group, manifest) -> None:
	if not station or not group:
		return
	doc = frappe.get_doc("Preparation Station", station)
	if any(row.item_group == group for row in doc.item_groups):
		return
	doc.append("item_groups", {"item_group": group, "priority": "Normal"})
	doc.save(ignore_permissions=True)
	manifest["station_links"].append({"station": station, "item_group": group})


def apply(plan: dict) -> dict:
	"""Write what the plan means; answers the manifest of what it made (for `undo`) and, in each list, only what is new."""
	_manage()
	resolved = _resolve(plan)
	manifest = {
		"step": resolved["step"],
		"restaurant": resolved["restaurant"],
		"card": resolved["card"]["name"],
		"card_created": False,
		"guest_menu_set": False,
		"groups": [],
		"group_changes": [],
		"items": [],
		"item_changes": [],
		"prices": [],
		"station_links": [],
		"rows": [],
		"row_changes": [],
		"sort_before": {},
	}
	_check_rights(resolved)
	price_list, currency = resolved["price_list"], resolved["currency"]
	for family in resolved["families"]:
		holder = family["station_id"] or (
			_station_holding(family["name"]) if family["status"] == "exists" else None
		)
		if family["status"] == "new":
			has_subs = any(sub["name"] for sub in family["subs"])
			_make_group(
				family["name"],
				family["parent"],
				1 if has_subs else 0,
				family["service_family"],
				family["color"],
			)
			manifest["groups"].append(family["name"])
			_link_to_station(family["station_id"], family["name"], manifest)
		for sub in family["subs"]:
			if sub["name"] and sub["status"] == "new":
				_ensure_is_group(family["name"], manifest)
				_make_group(sub["name"], family["name"], 0, None, sub["color"])
				manifest["groups"].append(sub["name"])
				_link_to_station(holder, sub["name"], manifest)
			group = sub["name"] or family["name"]
			for item in sub["items"]:
				code = _write_item(item, group, family, resolved["restaurant"], manifest)
				item["item_code"] = code
				if item["price"] and not _has_price(code, price_list):
					price = frappe.get_doc(
						{
							"doctype": "Item Price",
							"item_code": code,
							"price_list": price_list,
							"price_list_rate": item["price"],
							"currency": currency,
							"selling": 1,
						}
					).insert(ignore_permissions=True)
					manifest["prices"].append(price.name)
	_write_card(resolved, manifest)
	return manifest


def _check_rights(resolved) -> None:
	"""Refuse, before anything is written, whoever lacks a right the step needs."""
	new_groups = any(
		f["status"] == "new" or any(s["name"] and s["status"] == "new" for s in f["subs"])
		for f in resolved["families"]
	)
	items = [i for f in resolved["families"] for s in f["subs"] for i in s["items"]]
	if new_groups:
		permissions.require("Item Group", "create")
	if any(i["status"] == "new" for i in items):
		permissions.require("Item", "create")
	if any(i["status"] == "existing" for i in items):
		permissions.require("Item", "write")
	if any(i["price"] for i in items):
		permissions.require("Item Price", "create")
	if any(f["station_id"] for f in resolved["families"]):
		permissions.require("Preparation Station", "write")
	if not resolved["card"]["exists"]:
		permissions.require("Restaurant Card", "create")


def _ensure_is_group(name, manifest) -> None:
	"""A family that gets a sub-family becomes a node of the tree (and says what it was, for `undo`)."""
	if frappe.db.get_value("Item Group", name, "is_group"):
		return
	group = frappe.get_doc("Item Group", name)
	group.is_group = 1
	group.save(ignore_permissions=True)
	manifest["group_changes"].append({"group": name, "was_group": 0})


def _write_item(item, group, family, restaurant, manifest) -> str:
	"""The article of a button: made when it is new, made a sales article when it was only bought; answers its code."""
	if item["status"] == "existing":
		code = item["item_code"]
		if not frappe.db.get_value("Item", code, "is_sales_item"):
			frappe.db.set_value("Item", code, "is_sales_item", 1)
			manifest["item_changes"].append({"item": code, "was_sales_item": 0})
		return code
	doc = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item["name"],
			"item_name": item["name"],
			"item_group": group,
			"stock_uom": _default_uom(),
			"is_stock_item": 0,
			"is_sales_item": 1,
			"is_purchase_item": 0,
			"description": item["description"] or item["name"],
		}
	)
	# crm mirrors every new Item into a CRM Product unless told not to: a dish is no product of the CRM
	doc.flags.ignore_crm_sync = True
	doc.insert(ignore_permissions=True)
	manifest["items"].append(doc.name)
	return doc.name


# ─── The card: headings and rows, in the order the till reads them ───────────


def _write_card(resolved, manifest) -> None:
	name, restaurant = resolved["card"]["name"], resolved["restaurant"]
	if resolved["card"]["exists"]:
		card = frappe.get_doc("Restaurant Card", name)
	else:
		card = frappe.get_doc(
			{"doctype": "Restaurant Card", "restaurant": restaurant, "card_name": name, "is_active": 1}
		)
		manifest["card_created"] = True
	if not frappe.db.get_value("Restaurant", restaurant, "guest_menu"):
		card.is_guest_menu = 1
		manifest["guest_menu_set"] = True
	sequence = sorted(card.get("items") or [], key=lambda row: (cint(row.sort_order), cint(row.idx)))
	manifest["sort_before"] = {row.name: cint(row.sort_order) for row in sequence if row.name}
	price_list = resolved["price_list"]
	added = []
	for family in resolved["families"]:
		heading = _find_heading(sequence, family["name"], 0)
		if heading is None:
			sequence.append(_row(card, {"item_type": "Category", "label": family["name"]}, added))
			heading = len(sequence) - 1
		for sub in family["subs"]:
			if sub["name"]:
				place = _sub_block(sequence, heading, sub["name"])
				if place is None:
					end = _family_end(sequence, heading)
					sequence.insert(
						end,
						_row(
							card, {"item_type": "Category", "label": sub["name"], "is_subcategory": 1}, added
						),
					)
					place = end
			else:
				place = None
			for item in sub["items"]:
				code = item["item_code"]
				priced = bool(item["price"]) or _has_price(code, price_list)
				existing = next(
					(row for row in sequence if row.item_type == "Item" and row.item == code), None
				)
				if existing is not None:
					if existing.disabled and priced:
						existing.disabled = 0
						manifest["row_changes"].append({"name": existing.name, "was_disabled": 1})
					continue
				row = _row(card, {"item_type": "Item", "item": code, "disabled": 0 if priced else 1}, added)
				sequence.insert(_insert_at(sequence, heading, place), row)
				heading = _find_heading(sequence, family["name"], 0)
				place = _sub_block(sequence, heading, sub["name"]) if sub["name"] else None
	for position, row in enumerate(sequence, start=1):
		row.sort_order = position * 10
		row.idx = position
	card.items = sequence
	card.flags.ignore_permissions = True
	if card.is_new():
		card.insert()
	else:
		card.save()
	card.reload()
	if manifest["guest_menu_set"]:
		frappe.db.set_value("Restaurant", restaurant, "guest_menu", card.name, update_modified=False)
	manifest["rows"] = [row.name for row in card.items if _is_added(row, added)]


def _row(card, values, added):
	"""A new row of the card, not yet in its place; remembered so that the manifest can name it after the save."""
	row = card.append("items", {"item_type": "Item", "is_subcategory": 0, "disabled": 0, **values})
	added.append(row)
	return row


def _is_added(row, added) -> bool:
	return any(
		other.item_type == row.item_type
		and (other.item or None) == (row.item or None)
		and (other.label or None) == (row.label or None)
		and cint(other.is_subcategory) == cint(row.is_subcategory)
		for other in added
	)


def _find_heading(sequence, label, is_subcategory):
	for position, row in enumerate(sequence):
		if (
			row.item_type == "Category"
			and cint(row.is_subcategory) == is_subcategory
			and _same(row.label, label)
		):
			return position
	return None


def _family_end(sequence, heading) -> int:
	"""The index just after the last row of a family: its block ends where the next family's heading begins."""
	for position in range(heading + 1, len(sequence)):
		row = sequence[position]
		if row.item_type == "Category" and not cint(row.is_subcategory):
			return position
	return len(sequence)


def _sub_block(sequence, heading, label):
	"""The index of the heading of a sub-family inside the block of its family, None when it has none yet."""
	end = _family_end(sequence, heading)
	for position in range(heading + 1, end):
		row = sequence[position]
		if row.item_type == "Category" and cint(row.is_subcategory) and _same(row.label, label):
			return position
	return None


def _insert_at(sequence, heading, sub_heading) -> int:
	"""Where a new dish goes: at the end of its sub-family, or, for the family's own, before its first sub-family."""
	end = _family_end(sequence, heading)
	if sub_heading is not None:
		for position in range(sub_heading + 1, end):
			row = sequence[position]
			if row.item_type == "Category":
				return position
		return end
	for position in range(heading + 1, end):
		row = sequence[position]
		if row.item_type == "Category" and cint(row.is_subcategory):
			return position
	return end


# ─── Taking a step back ──────────────────────────────────────────────────────


def undo(manifest: dict) -> dict:
	"""Take a step back: what it made goes, what was there before stays as it was. Answers what went and what had to stay.

	Refused, with nothing changed, once an article the step made is in an order: a dish that was sold is part of the books.
	"""
	_manage()
	manifest = manifest or {}
	made = manifest.get("items") or []
	if made and frappe.db.exists("Sales Invoice Item", {"item_code": ["in", made]}):
		frappe.throw(_("An article of this step is already in an order: the step cannot be taken back."))
	kept, removed = [], {"rows": 0, "items": 0, "groups": 0}
	card = manifest.get("card")
	if card and frappe.db.exists("Restaurant Card", card):
		doc = frappe.get_doc("Restaurant Card", card)
		gone = set(manifest.get("rows") or [])
		changed = {change["name"]: change for change in manifest.get("row_changes") or []}
		before = manifest.get("sort_before") or {}
		rows = [row for row in doc.items if row.name not in gone]
		removed["rows"] = len(doc.items) - len(rows)
		for row in rows:
			if row.name in changed:
				row.disabled = cint(changed[row.name]["was_disabled"])
		rows.sort(key=lambda row: (cint(before.get(row.name, row.sort_order)), cint(row.idx)))
		for position, row in enumerate(rows, start=1):
			row.sort_order = cint(before.get(row.name, position * 10))
			row.idx = position
		doc.items = rows
		doc.flags.ignore_permissions = True
		doc.save()
		if manifest.get("card_created") and not rows:
			if manifest.get("guest_menu_set"):
				frappe.db.set_value(
					"Restaurant", manifest.get("restaurant"), "guest_menu", None, update_modified=False
				)
			frappe.delete_doc("Restaurant Card", card, ignore_permissions=True, force=True)
		elif manifest.get("guest_menu_set") and not rows:
			frappe.db.set_value(
				"Restaurant", manifest.get("restaurant"), "guest_menu", None, update_modified=False
			)
	for price in manifest.get("prices") or []:
		if frappe.db.exists("Item Price", price):
			frappe.delete_doc("Item Price", price, ignore_permissions=True, force=True)
	for item in made:
		if frappe.db.exists("Item", item):
			try:
				frappe.delete_doc("Item", item, ignore_permissions=True)
				removed["items"] += 1
			except frappe.LinkExistsError:
				frappe.db.set_value("Item", item, "disabled", 1)
				kept.append(item)
	for change in manifest.get("item_changes") or []:
		if frappe.db.exists("Item", change["item"]) and not frappe.db.exists(
			"Sales Invoice Item", {"item_code": change["item"]}
		):
			frappe.db.set_value("Item", change["item"], "is_sales_item", cint(change["was_sales_item"]))
	for link in manifest.get("station_links") or []:
		if frappe.db.exists("Preparation Station", link["station"]):
			station = frappe.get_doc("Preparation Station", link["station"])
			station.set("item_groups", [r for r in station.item_groups if r.item_group != link["item_group"]])
			station.save(ignore_permissions=True)
	for group in reversed(manifest.get("groups") or []):
		if not frappe.db.exists("Item Group", group):
			continue
		try:
			frappe.delete_doc("Item Group", group, ignore_permissions=True)
			removed["groups"] += 1
		except (frappe.LinkExistsError, frappe.ValidationError):
			kept.append(group)
	for change in manifest.get("group_changes") or []:
		if frappe.db.exists("Item Group", change["group"]) and not frappe.db.exists(
			"Item Group", {"parent_item_group": change["group"]}
		):
			frappe.db.set_value("Item Group", change["group"], "is_group", cint(change["was_group"]))
	return {"removed": removed, "kept": kept}
