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

Two ways in, one set of rules: `public_menu()` is the rules in process (the gate, the kept card, the build; None for a menu
that is not public), which the website's menu block calls; `get_public_menu()` is the endpoint, which wraps it for the 404
and the limit per address.

What the restaurant wrote (a dish, a section, its own badges) is shown as written. What this app seeds is not: the names of
the badges (`Tree Nuts`, `Sulfites`) are English data, and an allergen must read in the guest's language, so they are
translated when the card is built, in the language of the request, and a card is kept once per language.
"""

import copy
import posixpath
import re
from urllib.parse import quote, unquote, urlsplit

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
# The folders of the site a relative address may be in, and the one no address may be in, whoever's host it names
SITE_FOLDERS = ("/files/", "/assets/")
PRIVATE_FOLDER = "/private/"
# An address escaped more often than this is not one a restaurant typed
MAX_DECODINGS = 3
# What could close an attribute (quoted or not), open a tag or end a script block where an address is written: these are
# percent-encoded in the address that is served, so that it is safe in HTML, in a JSON-LD block or anywhere else
UNSAFE_IN_MARKUP = re.compile(r"[\"'`<>\s]")
# The context the seeded badges' names are translated in (`i18n_anchors.py` mentions each of them, for the translators)
BADGE_CONTEXT = "Menu Badge"
# A badge's icon is the name of a file of the app's own icons; its colour a hex code or a colour name
BADGE_ICON = re.compile(r"[\w\-]+\.(?:svg|png)")
BADGE_COLOR = re.compile(r"#[0-9A-Fa-f]{3,8}|[A-Za-z]{1,20}")
MAX_SPICE_LEVEL = 3


def cache_key(restaurant: str, lang: str | None = None) -> str:
	"""The key a restaurant's built card is kept under: one per language, the badges' names being read in the guest's."""
	return f"{CACHE_PREFIX}:{restaurant}:{lang or frappe.local.lang or 'en'}"


def public_menu(restaurant) -> dict | None:
	"""A restaurant's public menu, or None when it is not public: the rules, for whoever calls in process.

	The website's menu block calls this, the endpoint wraps it. The gate (the site runs NeoRestau, the restaurant exists,
	is enabled and switched its public menu on) is read on every call, before the kept card, so that it takes effect at
	once; the card itself is kept for a minute per restaurant and per language. The answer is `{restaurant: {name, logo},
	currency, card: {name, description} | None, sections: [{label, items: [{name, description, price, price_text, image,
	spice_level, badges: [{name, type, icon, color}]}]}]}`. A restaurant that publishes no card (none chosen, or not
	active, not in its dates, or another restaurant's) answers `card: None` and no sections: it is public, with nothing
	to show yet.

	The answer is the caller's own: a copy, so that what a caller does to it (a template that sorts, drops or fills in a
	dish) never reaches the kept card nor the next caller's answer. An address in it (`logo`, `image`) is safe to write
	into an attribute as it is, but a name or a description is text as the restaurant wrote it: escape it where it is
	written.
	"""
	published = _published(restaurant)
	if not published:
		return None

	lang = frappe.local.lang or "en"
	key = cache_key(published.name, lang)
	menu = frappe.cache().get_value(key, expires=True)
	if menu is None:
		menu = _build(published, lang)
		frappe.cache().set_value(key, menu, expires_in_sec=CACHE_SECONDS)
	return copy.deepcopy(menu)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=lambda: RATE_LIMIT, seconds=RATE_WINDOW)
def get_public_menu(restaurant=None):
	"""A restaurant's guest card, read only, for the page its QR code opens (`/pos/menu/<restaurant>`).

	Open to guests, for reading, and limited per address (Frappe's rate limiter). It answers what `public_menu()` does, and
	refuses with one sentence, a 404, whatever the reason the menu is not public.

	Frappe rewrites a guest's string argument only when it holds an HTML tag, and no restaurant can be named with `<` or
	`>`: a plain name (`Café & Bar`, `L'Auberge`) reaches this as it was typed, and nothing needs saying about it.
	"""
	menu = public_menu(restaurant)
	if menu is None:
		frappe.throw(_("This menu is not available"), frappe.DoesNotExistError)
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


def _build(restaurant, lang: str) -> dict:
	"""The answer for a restaurant that publishes its menu, its badges' names read in a language."""
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
		"sections": _sections(card, lang) if card else [],
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


def _sections(card, lang: str) -> list[dict]:
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
	badges = _badges(codes, lang)

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


def _badges(codes: list[str], lang: str) -> dict[str, list[dict]]:
	"""The badges (allergens, diets, qualities) of each item named, in the order the item lists them.

	A badge's name is read in the language asked for: the seeded ones are English data, and a name the catalogue does not
	know (a badge the restaurant made, in the language it writes in) is shown as it is.
	"""
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
					"name": _(badge.badge_name, lang=lang, context=BADGE_CONTEXT),
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
	"""The URL of a picture if a guest can open it, else an empty string.

	A public file of the site, one of its assets, or an address on the web; never a private file, and never a path that
	climbs out of the folder it starts in. A climb is looked for in the path as a browser and a server read it, not as it
	was typed: `%2e` is a dot, `%2f` a slash, `\\` is a slash, and an address escaped twice is read by a server that decodes
	twice.

	What is served is safe to write anywhere: a quote, an apostrophe, a backtick, an angle bracket and any whitespace are
	percent-encoded (`%` is left as it is, never encoded twice), because the desk never cleans an attached image's address
	and a template that writes it between quotes, or none, must not be broken out of. Frappe keeps file names with spaces
	and apostrophes, so these are not refused: the encoded address opens the same file.
	"""
	url = cstr(url).strip()
	if not url.startswith(PUBLIC_FILE_PREFIXES) or any(_not_in_an_address(char) for char in url):
		return ""
	try:
		path = urlsplit(url).path
	except ValueError:
		return ""
	for _decoding in range(MAX_DECODINGS + 1):
		if any(_not_in_an_address(char) for char in path) or ".." in path.split("/"):
			return ""
		decoded = unquote(path)
		if decoded == path:
			break
		path = decoded
	else:
		return ""
	# Once what the browser reads of it is folded, an address is not in the private folder (that of the site's own host
	# included), and a relative one stays in the folders it names. `normpath` keeps a leading `//` as it is (POSIX gives
	# it a meaning of its own), a server does not: the slashes are taken off first, so that `//private` and `/%2Fprivate`
	# (once decoded) are the private folder they are.
	folded = posixpath.normpath("/" + path.lstrip("/"))
	if folded.startswith(PRIVATE_FOLDER) or (url.startswith("/") and not folded.startswith(SITE_FOLDERS)):
		return ""
	return UNSAFE_IN_MARKUP.sub(lambda unsafe: quote(unsafe.group(), safe=""), url)


def _not_in_an_address(char: str) -> bool:
	"""A control character, or a backslash: a browser reads the second as a slash, and neither belongs in a file's address."""
	return char == "\\" or ord(char) < 32 or ord(char) == 127
