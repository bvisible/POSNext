# //// Neoffice — added file (no upstream equivalent). NeoResto, the restaurant's business application, declared to
# //// neoffice_theme the way NeoAuto (the garage) declares itself (NeoResto lot 1, task 6): the restaurant module of the
# //// till had no place at the desk, and a restaurant is run from the desk as much as from the till. The theme is not a
# //// dependency of this app: its modules are imported inside the functions that only the theme calls, and a site without
# //// it (a fresh CI site) is left as it is.
"""NeoResto, the restaurant's business application, declared to neoffice_theme.

No app of its own: what a restaurant does already lives in this one - the floor and its tables, the cards and menus, the
options of a dish, the preparation stations, the reservations, the tips - and in the ERP it sits on (the items, the sales).
NeoResto is the view of it made for a restaurant, at the top of the menu:

- declared to the theme through `neoffice_business_apps` (`business_apps`): the cockpit puts it with the applications of
  their own, right below "My space", where the site switches it on (`neoresto_active: 1` in the site configuration, the
  very flag the till reads: off by default), and hides it elsewhere. Whoever holds the point of sale (`FOLLOWS`) holds it;
- its tabs (`tabs`, through `neoffice_workspace_tabs`): the lists above, the items and the sales taken from the spaces that
  already declare them (never written twice: a change there is a change here), the settings, and an overview whose main
  button opens the restaurant door of the till;
- its overview figures (`overview_figures`), counted for the restaurant the reader works for and only as he may read them;
- its menu entry, a virtual App Customization `neoresto` listing its page, and that page (`setup`), made at migrate where
  the site runs NeoResto, or by the provisioning of a restaurant client.
"""

import json
from contextlib import contextmanager
from functools import cache

import frappe
from frappe import _

from pos_next.restaurant import supply_catalogue
from pos_next.restaurant.door import restaurants_of_the_restaurant_tills
from pos_next.restaurant.mode import neoresto_active
from pos_next.restaurant.scope import current_restaurant, restaurant_or_filters
from pos_next.restaurant.settings import default_restaurant

# The application, its page and its space, as the theme names them. The page's NAME is its link, `/app/resto`, short like the other modules' (`/app/retail`, `/app/fitness`);
# its TITLE is what the menu and the page say (Daniel, 02.11.2026: « le lien du workspace /resto et pas /neoresto »),
# Resto beside Auto, Chantier and Sport: NeoResto is the name outside, on its own site (02.11, « la partie resto »).
APP = "neoresto"
SPACE = WORKSPACE = "Resto"
TITLE = "Resto"
# The page NeoResto follows: whoever holds it holds NeoResto (the theme's access_model.with_declared)
FOLLOWS = "Retail"
# Among the applications of their own: NeoAuto stands at 48, Construction at 50, Fitness at 55
SORT_ORDER = 49
# The icon of the menu entry when the point of sale's own cannot be read: the wrench of the theme's application icons
LOGO = "Activites"
# The module of the page: this app's
MODULE = "POS Next"

# A table with its guests: seated, or paid at the table (a QR payment) and not yet cleared by the cashier
OCCUPIED = [["status", "in", ["Occupied", "Paid"]]]
# The report of the tips by server, a standard report of this app (pos_next/report/tips_by_server)
TIPS_REPORT = "Tips by Server"
# A booking whose guests have not come: waiting for the restaurant's answer, or confirmed and not seated yet
TO_COME = [["status", "in", ["Pending", "Confirmed"]]]
# What a till sold: submitted POS invoices, the returns apart (the theme's own reading of "sold" at the point of sale)
SOLD = [["is_pos", "=", 1], ["docstatus", "=", 1], ["is_return", "=", 0]]
# A till session open now
OPEN_SESSION = [["docstatus", "=", 1], ["status", "=", "Open"]]


def active():
	"""The site's switch: off unless `neoresto_active` says 1, the flag the till reads too (mode.neoresto_active)."""
	return neoresto_active()


def business_apps():
	"""neoffice_theme's `neoffice_business_apps` hook (workspace_guard.declared_business_apps): whoever holds the point of
	sale, given or through their roles, holds NeoResto too (access_model.with_declared)."""
	return [
		{
			"name": APP,
			"title": TITLE,
			"workspaces": [WORKSPACE],
			"follows": FOLLOWS,
			# //// Neoffice — one door (NeoResto lot 1, product owner, 04.11.2026: « quand le module est activé, on n'affiche pas le
			# //// point de vente de l'autre côté, on n'en a qu'un seul »): the tills, sessions, closings, reports and offers of the
			# //// point of sale are tabs of this space, so the menu of a site that runs NeoResto leaves the point of sale out
			# //// (the theme's workspace_guard.spaces_replaced_by_business_apps; the company or a reader can show it again).
			"replaces": [FOLLOWS],
			# Simple mode's "My space": what a restaurant's desk does most
			"gestures": ["invoice", "payment", "search"],
			"active_by_default": 0,
		}
	]


# ─────────────────────────── the tabs ───────────────────────────


def tabs():
	"""{space: [tab, ...]}, or nothing while the site does not run NeoResto."""
	if not active():
		return {}
	from neoffice_theme.workspace_spaces import operations, retail

	items = _borrowed(operations.tabs(), "items")
	sales = _borrowed(retail.tabs(), "invoices")
	space = [overview_tab(), _ours(floor_tab()), _ours(cards_tab()), _ours(recipes_tab())]
	# //// Neoffice — the purchases of the restaurant (NeoResto purchases, lot A): the Achats page, once the site shows them. The
	# //// tab ships dark: where `neoresto_purchases_active` is off, the space is the one it was.
	if supply_catalogue.purchases_active():
		space.append(_ours(purchases_tab()))
		space.append(_ours(shopping_tab()))
	if items:
		# Simple mode keeps the floor, the cards, the reservations and the sales of a restaurant's day: the items are one
		# "Show all" away
		space.append(_ours(items, essential=False))
	space += [
		_ours(options_tab()),
		_ours(stations_tab()),
		_ours(reservations_tab()),
		_ours(tips_tab()),
	]
	if sales:
		# The point of sale's own invoices tab, under the restaurant's word for it
		space.append(_ours(sales, key="sales", label=_("Sales"), essential=True))
	# //// Neoffice — the till's back office, in the restaurant's own space (NeoResto lot 1, product owner, 04.11.2026: the point of
	# //// sale space had its sessions, closings, reports and offers and NeoResto had none of them; « tout ce que fait le restaurateur se
	# //// centralise dans NeoResto »). Borrowed from the point of sale, never written twice: a change there is a change here, and a
	# //// restaurant keeps one closing, one set of reports and one page of the manual. Each tab is shown to whoever may read what it lists.
	space += _the_tills_back_office(retail.tabs())
	space.append(settings_tab())
	return {SPACE: space}


# The tabs of the point of sale's space that a restaurant's desk shows too, in the order it shows them: the tills' sessions
# and closings, the reports, then the coupons and promotions
BORROWED_FROM_THE_TILL = ("sessions", "closings", "reports", "coupons", "promotions")


def _the_tills_back_office(retail_tabs):
	"""The tabs the point of sale's space declares for the till's own documents, as NeoResto shows them (none of them where the
	theme does not declare it): the reports tab keeps the point of sale's reports and adds the restaurant's own."""
	found = []
	for key in BORROWED_FROM_THE_TILL:
		tab = _borrowed(retail_tabs, key)
		if not tab:
			continue
		if key == "reports":
			tab = dict(tab, groups=[*(tab.get("groups") or []), restaurant_reports()])
		found.append(_ours(tab))
	return found


def restaurant_reports():
	"""The reports of the restaurant itself, which the point of sale has no use for."""
	return {"label": _("Restaurant"), "reports": [TIPS_REPORT]}


def _ours(tab, **changes):
	"""A tab as NeoResto shows it: given with its page (the access model's bundle), whatever space declared it. The
	tab is copied, never changed: the theme's own is as it was."""
	bundle = tab.get("bundle") or []
	bundle = [bundle] if isinstance(bundle, str) else list(bundle)
	return dict(tab, bundle=[WORKSPACE, *(b for b in bundle if b != WORKSPACE)], **changes)


def _borrowed(tabs, key):
	"""The tab of a space of the theme that has this key, or None where the theme does not declare it."""
	return next((tab for tab in tabs if tab["key"] == key), None)


def overview_tab():
	"""The space's first tab: its page, the figures of the service, and the main button, which opens the restaurant door of
	the till (get_pos_profiles(mode="restaurant")): the tills of the restaurant, not the counter's."""
	from neoffice_theme.workspace_spaces.common import overview

	return _ours(
		overview([WORKSPACE], [WORKSPACE]),
		essential=True,
		figures=overview_figures,
		action={
			"label": _("Open the restaurant till"),
			"route": "/pos?mode=restaurant",
			"requires": ["POS Opening Shift", "POS Profile"],
		},
	)


def floor_tab():
	"""The tables, by state: what the dining room is doing now."""
	return {
		"key": "floor",
		"label": _("Floor and tables"),
		"archetype": "document",
		"essential": True,
		"doctype": "Restaurant Table",
		"views": table_views,
	}


def cards_tab():
	"""The cards (what is sold, at what price, when), with the menus one click away."""
	return {
		"key": "cards",
		"label": _("Cards and menus"),
		"archetype": "document",
		"essential": True,
		"doctype": "Restaurant Card",
		"views": active_views,
		"view_link": {
			"label": _("Menus"),
			"route": "/app/restaurant-menu",
			"doctype": "Restaurant Menu",
		},
	}


def recipes_tab():
	"""The recipes of the restaurant: its own and those it added from the free library. Like every tab of this space, it is there only where the
	site runs NeoResto (tabs() answers nothing elsewhere)."""
	return {
		"key": "recipes",
		"label": _("Recipes"),
		"archetype": "document",
		"essential": True,
		"doctype": "Restaurant Recipe",
		"views": recipe_views,
	}


def purchases_tab():
	"""The purchases of the restaurant: the articles it buys regularly, who sells them, in which packaging, at what price."""
	from neoffice_theme.workspace_spaces.common import LINK

	return {
		"key": "purchases",
		"label": _("Purchases"),
		"archetype": LINK,
		"essential": True,
		"route": "/app/neoresto-purchases",
		"requires": ["Item"],
		"page": "neoresto-purchases",
	}


def shopping_tab():
	"""The shopping list of the restaurant: what it is going to buy, by supplier, with an estimate."""
	from neoffice_theme.workspace_spaces.common import LINK

	return {
		"key": "shopping",
		"label": _("Shopping list"),
		"archetype": LINK,
		"essential": True,
		"route": "/app/neoresto-shopping",
		"requires": ["Restaurant Shopping List"],
		"page": "neoresto-shopping",
	}


def options_tab():
	"""The option groups of a dish (cooking, sides, extras)."""
	return {
		"key": "options",
		"label": _("Options"),
		"archetype": "document",
		"doctype": "Product Option Group",
		"views": all_views,
	}


def stations_tab():
	"""Where a dish is prepared: the kitchen, the bar."""
	return {
		"key": "stations",
		"label": _("Preparation stations"),
		"archetype": "document",
		"doctype": "Preparation Station",
		"views": active_views,
	}


def reservations_tab():
	return {
		"key": "reservations",
		"label": _("Reservations"),
		"archetype": "document",
		"essential": True,
		"doctype": "Restaurant Reservation",
		"views": reservation_views,
	}


def tips_tab():
	return {
		"key": "tips",
		"label": _("Tips"),
		"archetype": "document",
		"doctype": "Restaurant Tip",
		"views": tip_views,
	}


def settings_tab():
	"""What a restaurant sets up: the restaurants themselves, their tills, the preparation."""
	from neoffice_theme.workspace_spaces.common import settings

	return _ours(
		settings(
			[
				{"label": _("Restaurants"), "items": ["Restaurant"]},
				{"label": _("Tills"), "items": ["POS Settings", "POS Profile"]},
				{
					"label": _("Preparation"),
					"items": ["Preparation Workflow", "Menu Badge", "Menu Design Template"],
				},
			]
		)
	)


# ─────────────────────────── the views ───────────────────────────


def table_views(today):
	"""The tables free, with their guests, to clean; "All" keeps the one of another state (a table held for a booking)."""
	return [
		{"key": "free", "label": _("Free", context="Table state"), "filters": [["status", "=", "Empty"]]},
		{"key": "occupied", "label": _("Occupied", context="Table state"), "filters": OCCUPIED},
		{
			"key": "cleaning",
			"label": _("Cleaning", context="Table state"),
			"filters": [["status", "=", "Cleaning"]],
		},
		{"key": "all", "label": _("All"), "filters": []},
	]


def reservation_views(today):
	"""Today's bookings (the cancelled ones apart, and the online ones their guest never confirmed, which expired: they
	were never the restaurant's, task 18), those to come, and those who did not show up."""
	return [
		{
			"key": "today",
			"label": _("Today"),
			"filters": [["reservation_date", "=", today], ["status", "not in", ["Cancelled", "Expired"]]],
		},
		{
			"key": "upcoming",
			"label": _("Upcoming"),
			"filters": [["reservation_date", ">", today], *TO_COME],
		},
		{"key": "no_show", "label": _("No-shows"), "filters": [["status", "=", "No Show"]]},
	]


def tip_views(today):
	"""The tips kept for the staff, and those handed out."""
	return [
		{"key": "collected", "label": _("Collected"), "filters": [["status", "=", "Collected"]]},
		{"key": "distributed", "label": _("Distributed"), "filters": [["status", "=", "Distributed"]]},
	]


def recipe_views(today):
	"""The recipes read and approved, those a person has still to read, and those that are not complete."""
	return [
		{"key": "validated", "label": _("Validated"), "filters": [["status", "=", "Validated"]]},
		{"key": "to_review", "label": _("To review"), "filters": [["status", "=", "To review"]]},
		{"key": "draft", "label": _("Draft"), "filters": [["status", "=", "Draft"]]},
		{"key": "all", "label": _("All"), "filters": []},
	]


def active_views(today):
	"""A card or a station in use, or not."""
	return [
		{"key": "active", "label": _("Active"), "filters": [["is_active", "=", 1]]},
		{"key": "inactive", "label": _("Inactive"), "filters": [["is_active", "=", 0]]},
	]


def all_views(today):
	"""A list with no state to tell its records apart by."""
	return [{"key": "all", "label": _("All"), "filters": []}]


# ─────────────────────────── the overview ───────────────────────────


def overview_figures(today):
	"""What the dining room and the tills hold now: the tables with guests, what the restaurant tills took today, the
	bookings still to come today, the sessions open at those tills.

	Counted for the restaurant the reader works for, as the lists the till reads are (scope.restaurant_or_filters): the one
	of his open restaurant till (scope.current_restaurant), else the default restaurant, since the desk is not a till - a
	manager whose open shift is on the shop's counter till still reads his restaurant, not a blank overview. A table or a
	booking is counted where it belongs, a sale or a session where its till is a restaurant till of that restaurant
	(restaurant_tills). Each figure is there only for a reader of its documents, and counts what he may read
	(neoffice_theme.permitted); what a figure needs is worked out when it is drawn, once, and for no other (a reader of the
	tables alone costs no look at the tills)."""
	from neoffice_theme import permitted
	from neoffice_theme.workspace_spaces.common import company_currency, counted, money

	@cache
	def restaurant():
		return current_restaurant() or default_restaurant()

	@cache
	def of_the_restaurant():
		return restaurant_or_filters(restaurant())

	@cache
	def tills():
		return restaurant_tills(restaurant())

	figures = []
	if permitted.readable("Restaurant Table"):
		occupied = permitted.count("Restaurant Table", OCCUPIED, or_filters=of_the_restaurant())
		figures.append({"value": counted(occupied), "label": _("tables occupied")})
	if permitted.readable("Sales Invoice"):
		day = [*SOLD, ["posting_date", "=", today], ["pos_profile", "in", tills()]]
		taken, tickets = (
			(permitted.total("Sales Invoice", "base_grand_total", day), permitted.count("Sales Invoice", day))
			if tills()
			else (0, 0)
		)
		figures.append(
			{
				"value": money(taken),
				"label": _("{0} · taken today").format(company_currency()),
				"context": _("{0} tickets").format(counted(tickets)),
			}
		)
	if permitted.readable("Restaurant Reservation"):
		coming = permitted.count(
			"Restaurant Reservation",
			[["reservation_date", "=", today], *TO_COME],
			or_filters=of_the_restaurant(),
		)
		figures.append({"value": counted(coming), "label": _("reservations still to come today")})
	if permitted.readable("POS Opening Shift"):
		sessions = (
			permitted.count("POS Opening Shift", [*OPEN_SESSION, ["pos_profile", "in", tills()]])
			if tills()
			else 0
		)
		figures.append({"value": counted(sessions), "label": _("sessions open")})
	return figures


def restaurant_tills(restaurant):
	"""The tills (POS Profiles) that work for `restaurant` as restaurant tills, by name.

	Which tills are restaurant tills is the door's answer (door.restaurants_of_the_restaurant_tills, task 5: the tick of a
	till's own settings, the restaurant it names, the site running NeoResto, over the one row that counts), asked for
	every till of the site and kept for this restaurant. A disabled till counts: what it took today is still today's
	takings."""
	if not restaurant:
		return []
	owners = restaurants_of_the_restaurant_tills(frappe.get_all("POS Profile", pluck="name"))
	return sorted(till for till, owner in owners.items() if owner == restaurant)


# ─────────────────────────── the menu entry ───────────────────────────


def setup():
	"""after_migrate, and the provisioning of a restaurant client (`bench execute pos_next.restaurant.neoresto.setup`,
	right after the site's configuration gets `neoresto_active: 1`, with no migrate): the page of NeoResto and its
	menu entry, where the site runs it and the theme is there.

	Made once, and only made: its administrators may rename, reorder or hide the entry afterwards, and switching NeoResto
	off hides it (the theme) without deleting anything. It works in a process of its own - no request, no migrate flag -
	and leaves what is already there as it is, so that it can be called as often as wanted."""
	if not active() or not frappe.db.exists("DocType", "App Customization"):
		return
	# The page first: the menu entry lists it, and the theme's workspace cleanup keeps the pages the entries list
	_make_the_page()
	if frappe.db.exists("App Customization", APP):
		return
	frappe.get_doc(
		{
			"doctype": "App Customization",
			"app_name": APP,
			"app_title": TITLE,
			"app_logo": _logo(),
			"is_virtual": 1,
			"is_installed_app": 0,
			"enabled": 1,
			"interface_mode": "Tous",
			"sort_order": SORT_ORDER,
			"workspaces": [{"workspace_name": WORKSPACE, "sort_order": 0, "hidden": 0}],
		}
	).insert(ignore_permissions=True)


def _make_the_page():
	"""The page of NeoResto, public and empty (the theme draws its overview), if the site has none."""
	if frappe.db.exists("Workspace", WORKSPACE):
		return
	page = frappe.get_doc(
		{
			"doctype": "Workspace",
			"label": WORKSPACE,
			"title": TITLE,
			"module": MODULE,
			"public": 1,
			"content": "[]",
		}
	)
	with _never_exported():
		page.insert(ignore_permissions=True)


# The cards of the page, as the Sport page has its own (« Tout le module » of the overview): a title, then its buttons, each
# (label, link type, target). Every word is one the catalogue already translates. « Settings » is
# the title the theme files under the folded settings card; « Purchases » is written only where the site shows the purchases.
PURCHASES_CARD = "Purchases"
PAGE_CARDS = (
	(
		"Service",
		(
			("Floor and tables", "DocType", "Restaurant Table"),
			("Reservations", "DocType", "Restaurant Reservation"),
			("Preparation stations", "DocType", "Preparation Station"),
			("Tips", "DocType", "Restaurant Tip"),
		),
	),
	(
		"Cards and menus",
		(
			("Cards", "DocType", "Restaurant Card"),
			("Menus", "DocType", "Restaurant Menu"),
			("Options", "DocType", "Product Option Group"),
			("Items", "DocType", "Item"),
		),
	),
	(
		PURCHASES_CARD,
		(
			("What we buy", "Page", "neoresto-purchases"),
			("Shopping list", "Page", "neoresto-shopping"),
			("Suppliers", "DocType", "Supplier"),
			("Purchase Invoices", "DocType", "Purchase Invoice"),
		),
	),
	(
		"Settings",
		(
			("Restaurants", "DocType", "Restaurant"),
			("Tills", "DocType", "POS Profile"),
			("POS Settings", "DocType", "POS Settings"),
			("Preparation Workflow", "DocType", "Preparation Workflow"),
			("Menu Badge", "DocType", "Menu Badge"),
			("Menu Design Template", "DocType", "Menu Design Template"),
		),
	),
)
# What the first version of this page (03.11) wrote instead: a shortcut to each purchases screen. They would say the Purchases
# card twice, as tiles of its first card: taken away.
FIRST_VERSION_SHORTCUTS = (("Purchases", "neoresto-purchases"), ("Shopping list", "neoresto-shopping"))


def sync_page_cards():
	"""Write on the page of NeoResto the cards of buttons of PAGE_CARDS, and take the Purchases card away where the site does
	not show the purchases (`neoresto_purchases_active`, supply_catalogue.purchases_active).

	The theme draws a card when the page's link rows AND its content both name it, so both are written. A card is written
	once: one that is there is never written again, even changed (an administrator may take a button off, or add one);
	only the Purchases card follows the flag. Whatever else is on the page is left as it is. Run at every migrate
	after `setup` (install.make_neoresto_menu_entry), and by hand (`bench execute pos_next.restaurant.neoresto.sync_page_cards`)
	right after a site's configuration switches the purchases on; called again it changes nothing, and opens no document."""
	if not frappe.db.exists("Workspace", WORKSPACE):
		return
	purchases = supply_catalogue.purchases_active()
	present = {
		row.label
		for row in frappe.get_all(
			"Workspace Link",
			filters={"parent": WORKSPACE, "parenttype": "Workspace", "type": "Card Break"},
			fields=["label"],
		)
	}
	old_shortcuts = frappe.get_all(
		"Workspace Shortcut",
		filters={
			"parent": WORKSPACE,
			"parenttype": "Workspace",
			"type": "Page",
			"link_to": ["in", [target for _label, target in FIRST_VERSION_SHORTCUTS]],
		},
		fields=["label"],
	)
	to_write = [
		title
		for title, _rows in PAGE_CARDS
		if title not in present and (purchases or title != PURCHASES_CARD)
	]
	to_drop = [PURCHASES_CARD] if PURCHASES_CARD in present and not purchases else []
	if not (to_write or to_drop or old_shortcuts):
		return

	page = frappe.get_doc("Workspace", WORKSPACE)
	blocks = json.loads(page.content or "[]")
	for row in [
		r for r in page.shortcuts if (r.label, r.link_to) in FIRST_VERSION_SHORTCUTS and r.type == "Page"
	]:
		blocks = [
			b
			for b in blocks
			if not (b.get("type") == "shortcut" and b["data"].get("shortcut_name") == row.label)
		]
		page.remove(row)
	for title in to_drop:
		doomed, inside = [], False
		for row in page.links:
			inside = (row.label == title) if row.type == "Card Break" else inside
			if inside:
				doomed.append(row)
		for row in doomed:
			page.remove(row)
		blocks = [b for b in blocks if not (b.get("type") == "card" and b["data"].get("card_name") == title)]
	for title, buttons in PAGE_CARDS:
		if title not in to_write:
			continue
		page.append("links", {"type": "Card Break", "label": title, "link_count": len(buttons)})
		for label, link_type, target in buttons:
			page.append("links", {"type": "Link", "label": label, "link_type": link_type, "link_to": target})
		blocks.append(
			{"id": frappe.generate_hash(length=10), "type": "card", "data": {"card_name": title, "col": 4}}
		)
	page.content = json.dumps(blocks)
	with _never_exported():
		page.save(ignore_permissions=True)


def after_migrate():
	"""Write the cards of NeoResto's page after every migrate where the site runs NeoResto and has the theme, and never fail the
	migrate for them: an exception in this hook would roll the whole migrate back and stop a fleet update. A savepoint undoes
	what a failed attempt half made, and an Error Log row says why; the next migrate tries again."""
	if not active() or not frappe.db.exists("DocType", "App Customization"):
		return
	save_point = "neoresto_page_cards"
	frappe.db.savepoint(save_point)
	try:
		sync_page_cards()
	except Exception:
		frappe.db.rollback(save_point=save_point)
		frappe.log_error("POS Next: NeoResto page cards", frappe.get_traceback())


@contextmanager
def _never_exported():
	"""Save a page of a module without Frappe writing it into the app's files.

	On a developer site, Workspace.on_update exports a public workspace that has a module into its app (a JSON file under
	apps/pos_next, which makes the next `git pull` of the app refuse), unless the save is one of the system's: install,
	uninstall, patch, test, fixtures or migrate (workspace.disable_saving_as_public). The migrate sets one; `bench
	execute`, which the provisioning of a restaurant client uses with no migrate, sets none, and a new instance has
	developer mode on until it is set up (a development instance always has). The page is what an app's fixtures are:
	made by the system, and never to be exported back. "In fixtures" is the narrowest of the six flags: only workspaces,
	doctypes and web forms read it, and no other document of this save does. It is given back as it was, whatever
	happens."""
	before = frappe.flags.in_fixtures
	frappe.flags.in_fixtures = True
	try:
		yield
	finally:
		frappe.flags.in_fixtures = before


def _logo():
	"""The icon of the menu entry: the point of sale's own (the first enabled App Customization that lists the page NeoResto
	follows and has an icon), else the default one."""
	entries = frappe.get_all(
		"App Customization Workspace",
		filters={"workspace_name": FOLLOWS, "parenttype": "App Customization"},
		pluck="parent",
	)
	if entries:
		logos = frappe.get_all(
			"App Customization",
			filters={"name": ["in", entries], "enabled": 1, "app_logo": ["is", "set"]},
			pluck="app_logo",
			order_by="sort_order asc",
			limit=1,
		)
		if logos:
			return logos[0]
	return LOGO
