# //// Neoffice — added file (no upstream equivalent). The public menu of a restaurant (NeoRestau lot 1, task 17): one QR
# //// code on the tables, the same for all of them, opens `/pos/menu/<restaurant>`, a page that shows the restaurant's
# //// guest card to read and lets nobody order. Upstream POSNext is a retail till with no guest surface at all. The QR
# //// a waiter brings to a table (a token tied to the table's draft ticket, guest_ordering.py) stays as it is: this
# //// endpoint shares no code with it, so that nothing behind a token is ever opened up for the public.
"""A restaurant's menu for whoever scans the QR code on its tables: its guest card, read only.

The endpoint is open to anybody, so it is built the other way round from the till's: it reads the columns it serves and
no others, instead of loading a record and removing what must not leave. A dish says its name, description, price,
picture, spice level and badges; a section says its label. Nothing of stock, cost, an item's code, a warehouse or a
price list is ever read, so nothing of it can leave by mistake.

It publishes only where the restaurant switched it on (`Restaurant.enable_public_menu`) and the site runs NeoRestau, and
only a card that is the restaurant's own guest card, active and in its dates. Every refusal is the same sentence, so that
it does not tell whether a restaurant exists, runs NeoRestau or chose to publish.
"""

import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, cstr, flt, getdate, nowdate

from pos_next.restaurant import settings as restaurant_settings
from pos_next.restaurant.mode import neorestau_active
from pos_next.restaurant.text import plain_text

# How long a restaurant's built card is kept. A change of a price or a dish shows within this time; the switch of the
# option and of NeoRestau are read on every call, before the card is looked up, so they take effect at once.
CACHE_SECONDS = 60
CACHE_PREFIX = "pos_next:public_menu"
# What one address may ask per window. Every guest of a restaurant is behind the same public address (its Wi-Fi), so the
# budget is generous: it stops a script from hammering the site, not a dining room from opening its menu.
RATE_LIMIT = 120
RATE_WINDOW = 60

# What a guest's browser may be told to open: a public file of the site, one of its assets, an address on the web. Never
# a private file (it needs a session a guest does not have, and its path says what the site keeps), nor a path that climbs.
PUBLIC_FILE_PREFIXES = ("/files/", "/assets/", "https://", "http://")
# A badge's icon is the name of a file of the app's own icons; its colour a hex code or a colour name
BADGE_ICON = re.compile(r"[\w\-]+\.(?:svg|png)")
BADGE_COLOR = re.compile(r"#[0-9A-Fa-f]{3,8}|[A-Za-z]{1,20}")
MAX_SPICE_LEVEL = 3


def cache_key(restaurant: str) -> str:
	"""The key a restaurant's built card is kept under."""
	return f"{CACHE_PREFIX}:{restaurant}"


@frappe.whitelist(allow_guest=True, xss_safe=True, methods=["GET"])
@rate_limit(limit=lambda: RATE_LIMIT, seconds=RATE_WINDOW)
def get_public_menu(restaurant=None):
	"""A restaurant's guest card, read only, for the page its QR code opens (`/pos/menu/<restaurant>`).

	Open to guests, for reading, and limited per address (Frappe's rate limiter). `xss_safe`: Frappe escapes the text of a
	guest's arguments unless told they are safe, and an escaped name (`Café &amp; Bar`) finds no restaurant; this one is
	only ever looked up, never written into a page.

	The answer is `{restaurant: {name, logo}, currency, card: {name, description} | None, sections: [{label, items:
	[{name, description, price, price_text, image, spice_level, badges: [{name, type, icon, color}]}]}]}`. A restaurant
	that publishes no card (none chosen, or not active, not in its dates, or another restaurant's) answers `card: None` and
	no sections: the page says so politely. A restaurant that does not publish at all is refused, whatever the reason.
	"""
	published = _published(restaurant)
	if not published:
		frappe.throw(_("This menu is not available"), frappe.DoesNotExistError)

	key = cache_key(published.name)
	menu = frappe.cache().get_value(key, expires=True)
	if menu is None:
		menu = _build(published)
		frappe.cache().set_value(key, menu, expires_in_sec=CACHE_SECONDS)
	return menu


def _published(restaurant) -> frappe._dict | None:
	"""The restaurant's row when it publishes its menu, else None. Read on every call, never from the kept card."""
	if not neorestau_active() or not isinstance(restaurant, str) or not restaurant.strip():
		return None
	# A filter, not the bare name: the name of a doctype read as a name means its single in Frappe's `get_value`
	row = frappe.db.get_value(
		"Restaurant",
		{"name": restaurant.strip()},
		["name", "restaurant_name", "company", "logo", "enabled", "enable_public_menu", "guest_menu"],
		as_dict=True,
	)
	if not row or not cint(row.enabled) or not cint(row.enable_public_menu):
		return None
	return row


def _build(restaurant) -> dict:
	"""The answer for a restaurant that publishes its menu."""
	company = (
		frappe.db.get_value("Company", restaurant.company, ["default_currency", "company_logo"], as_dict=True)
		or frappe._dict()
	)
	card = _published_card(restaurant)
	return {
		"restaurant": {
			# The company's logo stands in for a restaurant that has none of its own, as on its printed menu
			"name": restaurant.restaurant_name or restaurant.name,
			"logo": _public_file(restaurant.logo) or _public_file(company.company_logo),
		},
		"currency": company.default_currency or "CHF",
		"card": {"name": card.card_name, "description": plain_text(card.description)} if card else None,
		"sections": _sections(card) if card else [],
	}


def _published_card(restaurant) -> frappe._dict | None:
	"""The restaurant's guest card when it is published: the restaurant's own, active, and in its dates (or permanent)."""
	if not restaurant.guest_menu:
		return None
	card = frappe.db.get_value(
		"Restaurant Card",
		{"name": restaurant.guest_menu},
		[
			"name",
			"card_name",
			"description",
			"restaurant",
			"is_active",
			"is_permanent",
			"available_from",
			"available_to",
		],
		as_dict=True,
	)
	if not card or not cint(card.is_active):
		return None
	# A card that names no restaurant belongs to the default one (see `scope`); any other card is somebody else's
	if restaurant_settings.restaurant_of(card) != restaurant.name:
		return None
	if not cint(card.is_permanent):
		today = getdate(nowdate())
		if card.available_from and getdate(card.available_from) > today:
			return None
		if card.available_to and getdate(card.available_to) < today:
			return None
	return card


def _sections(card) -> list[dict]:
	"""The card's rows as sections of dishes, in the order the card keeps them, as its menu for guests builds them.

	A category row opens a section; what comes before the first one is a section of no label. A section with no dish left
	is dropped, as a dish that cannot be sold is: disabled on the card, disabled as an item, not for sale, or internal
	(an item that exists only to be added by code, such as the tip).
	"""
	fields = ["item_type", "label", "item", "price", "disabled"]
	if frappe.get_meta("Restaurant Card Item").has_field("custom_price_text"):
		fields.append("custom_price_text")
	rows = frappe.get_all(
		"Restaurant Card Item",
		filters={"parent": card.name, "parenttype": "Restaurant Card", "parentfield": "items"},
		fields=fields,
		order_by="sort_order asc, idx asc",
	)
	codes = list(
		dict.fromkeys(
			row.item for row in rows if row.item_type == "Item" and row.item and not cint(row.disabled)
		)
	)
	items = _items(codes)
	badges = _badges(codes)

	sections = []
	section = {"label": "", "items": []}
	for row in rows:
		if cint(row.disabled):
			continue
		if row.item_type == "Category":
			if section["items"]:
				sections.append(section)
			section = {"label": cstr(row.label).strip(), "items": []}
		elif row.item_type == "Item" and row.item:
			item = items.get(row.item)
			if item and _is_for_sale(item):
				section["items"].append(_dish(row, item, badges.get(row.item, [])))
	if section["items"]:
		sections.append(section)
	return sections


def _items(codes: list[str]) -> dict[str, frappe._dict]:
	"""The columns of an item a dish is made of, for the items named, in one query: no stock, no cost, no code."""
	if not codes:
		return {}
	meta = frappe.get_meta("Item")
	fields = ["name", "item_name", "description", "image", "standard_rate", "disabled", "is_sales_item"]
	# Custom Fields the hub and this app add: an instance may not have them all
	fields += [field for field in ("is_internal_item", "custom_spice_level") if meta.has_field(field)]
	return {
		item.name: item for item in frappe.get_all("Item", filters={"name": ["in", codes]}, fields=fields)
	}


def _is_for_sale(item) -> bool:
	return (
		not cint(item.disabled) and bool(cint(item.is_sales_item)) and not cint(item.get("is_internal_item"))
	)


def _badges(codes: list[str]) -> dict[str, list[dict]]:
	"""The badges (allergens, diets, qualities) of each item named, in the order the item lists them."""
	if not codes or not frappe.get_meta("Item").has_field("custom_item_badges"):
		return {}
	links = frappe.get_all(
		"Item Badge",
		filters={"parent": ["in", codes], "parenttype": "Item", "parentfield": "custom_item_badges"},
		fields=["parent", "menu_badge"],
		order_by="idx asc",
	)
	if not links:
		return {}
	catalogue = {
		badge.name: badge
		for badge in frappe.get_all(
			"Menu Badge",
			filters={"name": ["in", list({link.menu_badge for link in links})]},
			fields=["name", "badge_name", "badge_type", "icon", "color"],
		)
	}
	# A badge is listed even when it was switched off in the catalogue since: hiding an allergen is the worse mistake
	badges = {}
	for link in links:
		badge = catalogue.get(link.menu_badge)
		if badge:
			badges.setdefault(link.parent, []).append(
				{
					"name": badge.badge_name,
					"type": badge.badge_type,
					"icon": badge.icon if BADGE_ICON.fullmatch(cstr(badge.icon)) else "",
					"color": badge.color if BADGE_COLOR.fullmatch(cstr(badge.color)) else "",
				}
			)
	return badges


def _dish(row, item, badges: list[dict]) -> dict:
	"""One dish as a guest reads it: the card's label and price win over the item's own."""
	name = cstr(row.label).strip() or cstr(item.item_name)
	description = plain_text(item.description)
	# An item with no description of its own often carries its name as one: a guest would read the name twice
	if description.casefold() in (name.casefold(), cstr(item.item_name).casefold()):
		description = ""
	return {
		"name": name,
		"description": description,
		"price": flt(flt(row.price) or flt(item.standard_rate), 2),
		# What the card says instead of a price (`Market price`); the page shows it only where there is no price
		"price_text": cstr(row.get("custom_price_text")).strip(),
		"image": _public_file(item.image),
		"spice_level": min(max(cint(item.get("custom_spice_level")), 0), MAX_SPICE_LEVEL),
		"badges": list(badges),
	}


def _public_file(url) -> str:
	"""The URL of a picture if a guest can open it, else an empty string."""
	url = cstr(url).strip()
	if url.startswith(PUBLIC_FILE_PREFIXES) and ".." not in url:
		return url
	return ""
