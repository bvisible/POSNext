# //// Neoffice — added file (no upstream equivalent). QR self-ordering at the table and web
# //// takeaway; upstream POSNext is a retail POS with no guest-facing surface at all. A Guest
# //// Order Token tied to a POS opening lets an anonymous phone browse the menu, order, tip and
# //// pay without an account, while the very same invoice stays live in the cashier's POS —
# //// hence the realtime rooms, the TIP items preserved across POS update/submit, the
# //// duplicate-payment guards and the Occupied → Paid → Cleaning table states
# //// (3939a848 2026-03-28 "feat: QR self-ordering and takeaway web ordering", followed by
# //// ~45 fixes to 2026-04-02; 11a08f54 2026-06-01 moved the Wallee calls onto the unified
# //// payments driver layer).
# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import json
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, flt

from pos_next.restaurant import guest_account, permissions, portions, scope, service_families, tickets
from pos_next.restaurant.mode import require_neoresto
from pos_next.restaurant.settings import get_restaurant_settings_for_profile
from pos_next.restaurant.text import plain_text


# ==========================================
# Internal helpers
# ==========================================


@contextmanager
def _as_the_system():
	"""What a guest's order writes, written as the system, and the caller given back afterwards."""
	# A guest is the `Guest` user (or any browser session that opened the QR link): no role, no right on any account. Saving a Sales Invoice reads the
	# customer's receivable account, and ERPNext refuses that read (`account_perm_check`) to a user who may not read accounts, whatever
	# `ignore_permissions` says on the document: « User don't have permissions to select/read this account », a red PermissionError under « Send Order »
	# (Daniel's test, 01.11). The guest endpoints are public and the token is their only gate, so the writes the order needs are made as the system,
	# exactly as far as they go, and the user is given back even when they fail.
	user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		yield
	finally:
		frappe.set_user(user)


def _get_token_doc(token):
	"""Fetch Guest Order Token by token value. Throws if not found."""
	name = frappe.db.get_value("Guest Order Token", {"token": token}, "name")
	if not name:
		frappe.throw(_("Invalid or unknown token."), frappe.AuthenticationError)
	return frappe.get_doc("Guest Order Token", name)


def _require_valid_token(token):
	"""Return the token doc if valid, throw AuthenticationError otherwise."""
	token_doc = _get_token_doc(token)
	if not token_doc.is_valid():
		frappe.throw(_("This session has expired or is no longer active."), frappe.AuthenticationError)
	return token_doc


def _get_restaurant_settings(pos_profile=None):
	"""Return the settings of the restaurant a guest session belongs to: the one of its POS Profile.

	A session without a till (a web takeaway order that has not picked one) belongs to the default restaurant: that
	is the rule of `restaurant_for_profile(None)`, which this relies on.
	"""
	return get_restaurant_settings_for_profile(pos_profile)


def _get_active_pos_opening(pos_profile):
	"""Return the name of the current open POS Opening Entry for a profile."""
	result = frappe.db.get_value(
		"POS Opening Entry",
		{"pos_profile": pos_profile, "status": "Open", "docstatus": 1},
		"name",
		order_by="creation desc",
	)
	return result


def _get_or_create_invoice(token_doc):
	"""Return the existing draft invoice for this token's table, or None if missing."""
	if token_doc.invoice:
		if frappe.db.exists("Sales Invoice", {"name": token_doc.invoice, "docstatus": 0}):
			return frappe.get_doc("Sales Invoice", token_doc.invoice)
		# Invoice was submitted or cancelled — clear the link via DB (avoids TimestampMismatchError)
		frappe.db.set_value("Guest Order Token", token_doc.name, "invoice", None)
		token_doc.invoice = None

	if token_doc.mode == "restaurant" and token_doc.table:
		# Look for an existing draft on the table
		existing = frappe.db.get_value(
			"Sales Invoice",
			{"docstatus": 0, "restaurant_table": token_doc.table},
			"name",
			order_by="creation desc",
		)
		if existing:
			# Link token to invoice via DB (avoids TimestampMismatchError)
			frappe.db.set_value("Guest Order Token", token_doc.name, "invoice", existing)
			token_doc.invoice = existing
			return frappe.get_doc("Sales Invoice", existing)

	return None


# //// Neoffice — the customer behind a guest's phone (NeoResto lot 1, Daniel, 02.11.2026): see pos_next.restaurant.guest_account.
def _account_of(token_doc, invoice_doc=None):
	"""What the page reads of the customer of its session (the table's draft order decides when the till put a customer on it), or None."""
	if invoice_doc is None:
		invoice_doc = _get_or_create_invoice(token_doc)
	elif invoice_doc.docstatus != 0:
		invoice_doc = None
	return guest_account.describe(token_doc, invoice_doc)


def _account_is_required(settings):
	return (settings.guest_account_mode or "Not Proposed") == "Mandatory"


def _require_accounts_proposed(token_doc):
	"""A restaurant that does not propose an account has no sign-in: nothing is mailed, nothing is made."""
	mode = _get_restaurant_settings(token_doc.pos_profile).guest_account_mode or "Not Proposed"
	if mode == "Not Proposed":
		frappe.throw(_("Accounts are not proposed here."), frappe.PermissionError)


def _get_timeslot_cards(settings):
	"""Find restaurant cards active for the current time slot (Opening Hours logic)."""
	import calendar
	from frappe.utils import nowtime, get_time, nowdate, getdate

	if not settings.opening_hours:
		return []

	today_name = calendar.day_name[getdate(nowdate()).weekday()]
	now = get_time(nowtime())

	matching_cards = []
	for row in settings.opening_hours:
		if row.day_of_week != today_name:
			continue
		ft_str = row.from_time
		tt_str = row.to_time
		if not ft_str or not tt_str:
			continue

		ft = get_time(str(ft_str))
		tt = get_time(str(tt_str))

		in_slot = False
		if ft <= tt:
			in_slot = ft <= now <= tt
		else:
			in_slot = now >= ft or now <= tt

		if in_slot and row.restaurant_card:
			if row.restaurant_card not in matching_cards:
				matching_cards.append(row.restaurant_card)

	return matching_cards


def _get_guest_menu_card(settings):
	"""Return the Restaurant Card to use as guest menu."""
	if settings.guest_menu:
		return settings.guest_menu
	# Fall back to a card of this restaurant flagged as is_guest_menu
	names = frappe.get_all(
		"Restaurant Card",
		filters={"is_guest_menu": 1, "is_active": 1},
		or_filters=scope.restaurant_or_filters(settings.get("name")),
		pluck="name",
		limit=1,
	)
	return names[0] if names else None


def _tile_colors_on(pos_profile):
	"""Whether the till of `pos_profile` lets the tiles of its card take a colour (POS Settings.tile_colors, on by default and where the till has no row or the site is not migrated yet)."""
	if not pos_profile or not frappe.db.has_column("POS Settings", "tile_colors"):
		return True
	value = frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, "tile_colors")
	return value is None or bool(cint(value))


def _sub_category_field():
	"""The `is_subcategory` column of the card rows, as a list to spread into a field list: empty until the migration has made it."""
	return ["is_subcategory"] if frappe.db.has_column("Restaurant Card Item", "is_subcategory") else []


def _build_menu_from_card(card_name, warehouse=None, colors=None):
	"""Build menu structure (categories + items) from a Restaurant Card. `colors` maps an Item Group to its colour (`service_families.group_colors`): each dish carries
	its group's as `service_color`, for the guest's page to tint it."""
	colors = colors or {}
	card = frappe.get_doc("Restaurant Card", card_name)
	card_items = frappe.get_all(
		"Restaurant Card Item",
		filters={"parent": card_name},
		fields=["item_type", "label", "item", "price", "sort_order", "disabled", *_sub_category_field()],
		order_by="sort_order asc, idx asc",
	)

	categories = []
	current_category = {"label": "", "menu_items": []}
	counted_items = []
	# //// Neoffice — the heading a sub-category stands under (a second level, product owner, 03.11.2026): the last category that is not a sub-category
	top_label = ""

	for ci in card_items:
		if ci.get("disabled"):
			continue

		if ci.item_type == "Category":
			if current_category["menu_items"] or current_category["label"]:
				categories.append(current_category)
			if cint(ci.get("is_subcategory")) and top_label:
				current_category = {"label": ci.label or "", "parent": top_label, "menu_items": []}
			else:
				top_label = ci.label or ""
				current_category = {"label": top_label, "menu_items": []}
			continue

		if ci.item_type != "Item" or not ci.item:
			continue

		item_doc = frappe.get_cached_doc("Item", ci.item)
		price = ci.price or item_doc.get("standard_rate") or 0

		raw_desc = item_doc.get("description") or ""
		clean_desc = plain_text(raw_desc)

		item_data = {
			"item_code": ci.item,
			"item_name": ci.label or item_doc.item_name,
			"description": clean_desc,
			"price": float(price),
			"image": item_doc.get("image") or "",
			"product_options": _get_item_product_options(ci.item),
			# //// Neoffice — the colour of the dish's item group, as the till's tiles and the waiter's phone show it (product owner, 03.11.2026: « la même chose pour la page du client »)
			"service_color": colors.get(item_doc.get("item_group"), ""),
		}

		# Add stock info for stock items
		if item_doc.get("is_stock_item"):
			item_data["is_stock_item"] = True
			stock_qty = 0
			if warehouse:
				stock_qty = frappe.db.get_value(
					"Bin", {"item_code": ci.item, "warehouse": warehouse}, "actual_qty"
				) or 0
			else:
				stock_qty = frappe.db.sql(
					"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code=%s",
					ci.item,
				)[0][0] or 0
			item_data["actual_qty"] = float(stock_qty)

		current_category["menu_items"].append(item_data)
		counted_items.append(item_data)

	if current_category["menu_items"]:
		categories.append(current_category)

	# //// Neoffice — the portions the kitchen made of a product (NeoResto lot 1, Daniel, 02.11): a counted dish says how many are left, and the guest page shows "sold out" at zero
	left = portions.state([dish["item_code"] for dish in counted_items])
	for dish in counted_items:
		if dish["item_code"] in left and left[dish["item_code"]]["left"] is not None:
			dish["portions_left"] = left[dish["item_code"]]["left"]

	# Drop empty categories
	categories = [c for c in categories if c["menu_items"]]

	return {
		"card": {
			"card_name": card.card_name,
			"description": card.description or "",
			"image": card.image or "",
		},
		"categories": categories,
	}


# //// Neoffice — the portions the kitchen made of a product (NeoResto lot 1, Daniel, 02.11.2026): the table's order, which the guest sends from a page that may be minutes old.
def _refuse_what_is_sold_out(items):
	"""Refuse an order that asks for more of a counted dish than the kitchen has portions left (the whole order, so that nothing is half taken)."""
	asked = {}
	for item in items:
		code = item.get("item_code")
		if code:
			asked[code] = asked.get(code, 0) + flt(item.get("qty", 1))
	for code, state in portions.state(list(asked)).items():
		if state["left"] is not None and asked[code] > state["left"]:
			frappe.throw(_("{0} is sold out").format(frappe.db.get_value("Item", code, "item_name") or code))


def _get_item_product_options(item_code):
	"""Return product option groups applicable to an item."""
	item_group = frappe.db.get_value("Item", item_code, "item_group")
	direct = frappe.get_all(
		"Product Option Group Item",
		filters={"item": item_code, "parenttype": "Product Option Group"},
		pluck="parent",
	)
	group_based = frappe.get_all(
		"Product Option Group Item Group",
		filters={"item_group": item_group, "parenttype": "Product Option Group"},
		pluck="parent",
	)
	group_names = list(set(direct + group_based))
	if not group_names:
		return []

	groups = frappe.get_all(
		"Product Option Group",
		filters={"name": ("in", group_names)},
		fields=["name", "group_name", "selection_type", "required"],
	)
	result = []
	for g in groups:
		options = frappe.get_all(
			"Product Option",
			filters={"parent": g.name},
			fields=["option_name", "price_adjustment"],
			order_by="idx asc",
		)
		result.append({
			"group_name": g.group_name,
			"selection_type": g.selection_type,
			"required": bool(g.required),
			"options": [
				{
					"option_name": o.option_name,
					"price_adjustment": float(o.price_adjustment or 0),
				}
				for o in options
			],
		})
	return result


def _apply_pricing_rules_to_items(invoice_doc, items):
	"""Apply pricing rules server-side so the guest sees discounted prices.

	The POS frontend calculates discounts dynamically via apply_offers() on every
	load, but those discounts are NOT persisted in the draft invoice. The guest
	reads from the draft and therefore sees undiscounted prices. This helper
	calls the same pricing engine to enrich items with discount info.
	"""
	if not items or not invoice_doc.pos_profile:
		return items

	# Only apply to draft invoices (submitted invoices have final prices)
	if invoice_doc.docstatus == 1:
		return items

	# Guest user has no permission to read Pricing Rules — elevate temporarily
	original_ignore = frappe.flags.ignore_permissions
	frappe.flags.ignore_permissions = True

	try:
		from pos_next.api.invoices import apply_offers

		# Build a minimal invoice payload matching what the POS frontend sends
		invoice_data = {
			"doctype": "Sales Invoice",
			"name": invoice_doc.name,
			"pos_profile": invoice_doc.pos_profile,
			"customer": invoice_doc.customer,
			"currency": invoice_doc.currency,
			"posting_date": str(invoice_doc.posting_date or invoice_doc.creation),
			"is_pos": 1,
			"items": [
				{
					"item_code": item.item_code,
					"item_name": item.item_name,
					"qty": flt(item.qty),
					# rate in the draft = catalogue price (discounts not persisted)
					"price_list_rate": flt(item.rate),
					"rate": flt(item.rate),
					"discount_percentage": 0,
					"discount_amount": 0,
				}
				for item in items
			],
		}

		result = apply_offers(invoice_data)
		if not result or not result.get("items"):
			return items

		result_items = result["items"]

		# Enrich original items with discount info from pricing engine
		for i, item in enumerate(items):
			if i >= len(result_items):
				break
			ri = result_items[i]
			discount_pct = flt(ri.get("discount_percentage") or 0)
			if discount_pct > 0:
				original_rate = flt(item.rate)
				discounted_rate = round(original_rate * (1 - discount_pct / 100), 2)
				item["price_list_rate"] = original_rate
				item["discount_percentage"] = discount_pct
				item["rate"] = discounted_rate
				item["amount"] = round(discounted_rate * flt(item.qty), 2)
			else:
				item["price_list_rate"] = flt(item.rate)
				item["discount_percentage"] = 0

	except Exception as e:
		# Non-blocking: if pricing rules fail, guest still sees undiscounted prices
		frappe.log_error("Guest pricing rules failed", str(e))
	finally:
		frappe.flags.ignore_permissions = original_ignore

	return items


def _apply_pricing_rules_to_menu(pos_profile, categories, customer=None):
	"""Annotate menu items with discount info from pricing rules.

	Calls apply_offers with the POS profile's default customer so the guest
	menu shows discounted prices and discount badges before ordering.
	//// Neoffice — with the customer the guest signed in as (or the till put on the table) when there is one: the rules of that customer's group apply (Daniel, 02.11.2026).
	"""
	# Collect all menu items across categories
	all_items = []
	item_refs = []  # (cat_index, item_index) for mapping back
	for ci, cat in enumerate(categories):
		for ii, item in enumerate(cat.get("menu_items") or []):
			all_items.append(item)
			item_refs.append((ci, ii))

	if not all_items:
		return

	original_ignore = frappe.flags.ignore_permissions
	frappe.flags.ignore_permissions = True
	try:
		from pos_next.api.invoices import apply_offers

		profile = frappe.get_cached_doc("POS Profile", pos_profile)
		customer = customer or profile.customer or frappe.db.get_single_value("Selling Settings", "customer") or "Guest"

		invoice_data = {
			"doctype": "Sales Invoice",
			"pos_profile": pos_profile,
			"customer": customer,
			"currency": profile.currency or frappe.defaults.get_global_default("currency"),
			"is_pos": 1,
			"items": [
				{
					"item_code": item.get("item_code"),
					"item_name": item.get("item_name"),
					"qty": 1,
					"price_list_rate": float(item.get("price") or 0),
					"rate": float(item.get("price") or 0),
					"discount_percentage": 0,
					"discount_amount": 0,
				}
				for item in all_items
			],
		}

		result = apply_offers(invoice_data)
		if not result or not result.get("items"):
			return

		result_items = result["items"]
		for i, (ci, ii) in enumerate(item_refs):
			if i >= len(result_items):
				break
			ri = result_items[i]
			discount_pct = flt(ri.get("discount_percentage") or 0)
			if discount_pct > 0:
				original_price = float(categories[ci]["menu_items"][ii].get("price") or 0)
				discounted_price = round(original_price * (1 - discount_pct / 100), 2)
				categories[ci]["menu_items"][ii]["discount_percentage"] = discount_pct
				categories[ci]["menu_items"][ii]["discounted_price"] = discounted_price
	except Exception as e:
		frappe.log_error("Guest menu pricing rules failed", str(e))
	finally:
		frappe.flags.ignore_permissions = original_ignore


def _broadcast_order_update(table_name, event_type, data):
	"""Publish a realtime event to all clients watching a table."""
	payload = {"event": event_type, "table": table_name}
	payload.update(data)
	frappe.publish_realtime(
		"guest_order_update",
		payload,
		room=f"guest_table_{table_name}",
	)


# //// Neoffice — added (no upstream equivalent): a realtime event reaches every till of the site, and with several
# //// restaurants on one site a till only knows the tables of its own. The event names the restaurant of the table
# //// it is about (NeoResto lot 1, task 2), and a till ignores the alerts of another restaurant (restaurant store).
def _publish_to_the_tills(event, table_name, payload):
	"""Tell every till of the site about a guest event on a table, saying which restaurant that table is in."""
	restaurant = scope.restaurant_of_record("Restaurant Table", table_name)
	frappe.publish_realtime(event, {"restaurant": restaurant, **payload})


# //// Neoffice — added (no upstream equivalent): the lines of a guest's order in the alert the tills get (NeoResto lot 1, Daniel, 01.11: « regarde comment la caisse
# //// sommelier reçoit l'info »). The waiter's till shows « Table 2 — le client commande : 3 x Verre de vin » and never reads the table to name the lines, so the alert carries
# //// them. The till names three lines and counts the rest; five are sent so that the count and the names are never out of step, and `count` is how many there really are.
MAX_ALERT_LINES = 5


def _lines_of_this_order(rows):
	"""The lines a guest's order added, as the tills name them: `([{item_name, qty}], count)`, `count` all of the lines and the names the first `MAX_ALERT_LINES`.

	The names are read from the items in one query. An item that is gone is named by its code. A whole quantity is a whole number.
	"""
	if not rows:
		return [], 0
	names = {
		item.name: item.item_name
		for item in frappe.get_all(
			"Item",
			filters={"name": ["in", list({row.item_code for row in rows})]},
			fields=["name", "item_name"],
		)
	}
	lines = []
	for row in rows[:MAX_ALERT_LINES]:
		qty = flt(row.qty)
		lines.append(
			{
				"item_name": names.get(row.item_code) or row.item_code,
				"qty": int(qty) if qty == int(qty) else qty,
			}
		)
	return lines, len(rows)


# ==========================================
# Public guest API endpoints
# ==========================================


@frappe.whitelist(allow_guest=True)
def validate_token(token):
	"""
	Validate a guest token and return table + settings info.
	Used on guest app mount to check session validity.
	Not behind the guard of NeoResto (mode.require_neoresto): the page a payment sends the diner back to calls it
	first, and the payment must be recordable whatever the flag says.
	"""
	token_doc = _require_valid_token(token)
	settings = _get_restaurant_settings(token_doc.pos_profile)

	table_info = None
	if token_doc.table:
		table_info = frappe.db.get_value(
			"Restaurant Table",
			token_doc.table,
			["name", "table_name", "area", "capacity", "status"],
			as_dict=True,
		)
		if table_info:
			# The guest page shows the label of the room, never its name
			area_name = frappe.db.get_value("Restaurant Area", table_info.area, "area_name")
			table_info["area_name"] = area_name or table_info.area

	# Get currency from POS Profile
	currency = None
	company = None
	if token_doc.pos_profile:
		profile_data = frappe.db.get_value(
			"POS Profile", token_doc.pos_profile, ["currency", "company"], as_dict=True
		)
		currency = profile_data.currency if profile_data else None
		company = profile_data.company if profile_data else None
	if not currency:
		currency = frappe.defaults.get_global_default("currency") or "CHF"
	if not company:
		company = frappe.defaults.get_defaults().get("company")

	# Get company logo
	company_logo = ""
	if company:
		company_logo = frappe.db.get_value("Company", company, "company_logo") or ""

	return {
		"valid": True,
		"mode": token_doc.mode,
		"table": table_info,
		"pos_profile": token_doc.pos_profile,
		"currency": currency,
		"company_logo": company_logo,
		# The display name of the restaurant of the session (the token's till, else the default restaurant): the guest
		# page names its tab with it, and a company may run several restaurants
		"restaurant_name": settings.get("restaurant_name") or "",
		"qr_order_validation": settings.qr_order_validation or "Direct to Kitchen",
		"guest_account_mode": settings.guest_account_mode or "Not Proposed",
		# The loyalty programme is a setting of the till the session belongs to (a POS Settings row per POS Profile)
		"has_loyalty_program": bool(
			scope.till_settings(token_doc.pos_profile, ["enable_loyalty_program"]).enable_loyalty_program
		),
		# //// Neoffice — who the session is (the customer the till put on the table, or the one a guest signed in as): None for nobody
		"account": _account_of(token_doc),
	}


@frappe.whitelist(allow_guest=True)
def get_guest_menu(token):
	"""
	Return the guest menu (categories + items) for a valid token.
	Uses time-slot based card selection (same as Opening Hours), falling back to
	settings.guest_menu or the card flagged as_guest_menu.
	Not behind the guard of NeoResto (mode.require_neoresto): the page a payment sends the diner back to calls it
	right after validate_token, before it can mount the checkout that records the payment.
	"""
	token_doc = _require_valid_token(token)
	settings = _get_restaurant_settings(token_doc.pos_profile)

	# Resolve warehouse from POS Profile for stock display
	warehouse = None
	if token_doc.pos_profile:
		warehouse = frappe.db.get_value("POS Profile", token_doc.pos_profile, "warehouse")

	# Try time-slot based card selection first
	card_names = _get_timeslot_cards(settings)
	if not card_names:
		# Fall back to configured guest menu or flagged card
		fallback = _get_guest_menu_card(settings)
		if fallback:
			card_names = [fallback]

	if not card_names:
		frappe.throw(_("No guest menu is configured. Please contact staff."))

	# //// Neoffice — the families' colours, unless the till of this table switched the colours of its tiles off
	colors = service_families.group_colors() if _tile_colors_on(token_doc.pos_profile) else {}

	# Build menu from all matching cards (merge if multiple)
	all_categories = []
	for card_name in card_names:
		result = _build_menu_from_card(card_name, warehouse=warehouse, colors=colors)
		all_categories.extend(result.get("categories", []))

	# Apply pricing rules to menu items so guest sees discounts before ordering
	if token_doc.pos_profile:
		# //// Neoffice — priced for the customer of the session when it has one
		account = _account_of(token_doc)
		_apply_pricing_rules_to_menu(
			token_doc.pos_profile, all_categories, customer=account["customer"] if account else None
		)

	return {
		"card": {"card_name": ", ".join(card_names), "description": "", "image": ""},
		"categories": all_categories,
	}


@frappe.whitelist(allow_guest=True)
def submit_guest_order(token, items):
	"""
	Add items to the invoice linked to this guest token.
	Creates a new draft invoice if none exists yet.
	Respects the qr_order_validation setting (direct or server-approval).
	"""
	# A new order starts something: nothing of the restaurant shows where the site does not run NeoResto (NeoResto lot 1,
	# task 4). What a payment's return goes through has no guard (see validate_token).
	require_neoresto()

	token_doc = _require_valid_token(token)

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("No items provided."))

	settings = _get_restaurant_settings(token_doc.pos_profile)
	validation_mode = settings.qr_order_validation or "Direct to Kitchen"

	# //// Neoffice — a dish the kitchen has no portion of left is refused, whatever the guest's page still shows (NeoResto lot 1, Daniel, 02.11.2026); before anything is created
	_refuse_what_is_sold_out(items)

	invoice_doc = _get_or_create_invoice(token_doc)
	is_new_invoice = not invoice_doc

	# //// Neoffice — a restaurant that requires an account takes no order from a session nobody is identified in (the till's customer on the table counts as identified)
	customer_of_the_table, _source = guest_account.customer_of(token_doc, invoice_doc)
	if _account_is_required(settings) and not customer_of_the_table:
		frappe.throw(_("Please sign in to order."))

	if is_new_invoice:
		# Create a new draft invoice
		if not token_doc.pos_profile:
			frappe.throw(_("No POS Profile linked to this session."))

		pos_profile_doc = frappe.get_cached_doc("POS Profile", token_doc.pos_profile)
		invoice_data = {
			"doctype": "Sales Invoice",
			"is_pos": 1,
			"pos_profile": token_doc.pos_profile,
			"company": pos_profile_doc.company,
			"currency": pos_profile_doc.currency or frappe.defaults.get_global_default("currency"),
			# //// Neoffice — the customer the guest signed in as, else the till's default customer
			"customer": customer_of_the_table
			or pos_profile_doc.customer
			or frappe.db.get_single_value("Selling Settings", "customer")
			or "Guest",
			"items": [],
		}
		if token_doc.table:
			invoice_data["restaurant_table"] = token_doc.table

		invoice_doc = frappe.get_doc(invoice_data)

	# Append incoming items (before insert for new invoices to avoid validation errors)
	has_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	has_kds_batch = frappe.db.has_column("Sales Invoice Item", "kds_batch")

	# Determine next batch number
	next_batch = 1
	if has_kds_batch and not is_new_invoice:
		existing_batches = [flt(row.get("kds_batch") or 0) for row in invoice_doc.items]
		next_batch = int(max(existing_batches, default=0)) + 1

	import json as _json

	# //// Neoffice — the lines THIS order adds (the ones above, already on the invoice, are not news to the tills): see _lines_of_this_order.
	added_rows = []

	for item in items:
		item_code = item.get("item_code")
		if not item_code:
			continue

		modifiers = item.get("modifiers")
		mod_str = _json.dumps(modifiers) if modifiers and not isinstance(modifiers, str) else (modifiers or "")
		# //// Neoffice — every line of a send is a line of the order: the page sends the NEW lines only and empties its cart after each send, so
		# //// a drink ordered again in a second round (or twice in one send) is a new line. The first version skipped a line whose item and
		# //// modifiers were already on the invoice, which dropped a second round without a word and answered success (found by the floor-alerts
		# //// agent, 01.11).

		qty = flt(item.get("qty", 1))
		rate = flt(item.get("rate") or item.get("price") or 0)
		if not rate:
			rate = flt(frappe.db.get_value("Item", item_code, "standard_rate") or 0)

		row = invoice_doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"rate": rate,
		})
		# //// Neoffice — kept for the alert to the tills (added_rows above).
		added_rows.append(row)

		if has_kds:
			if validation_mode == "Direct to Kitchen":
				row.kds_status = "Pending"
			else:
				row.kds_status = "Waiting"

		if has_kds_batch:
			row.kds_batch = next_batch

		if frappe.db.has_column("Sales Invoice Item", "posa_special_instructions"):
			row.posa_special_instructions = item.get("special_instructions") or ""

		if frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers"):
			if mod_str:
				row.posa_item_modifiers = mod_str

	invoice_doc.flags.ignore_permissions = True
	with _as_the_system():
		if is_new_invoice:
			invoice_doc.insert()
			# A guest's order of a table is an order like the waiter's: it takes its ticket number at its first save
			# (NeoResto lot 1, task 38b), so that the kitchen reads a number and never the draft's invoice number
			tickets.give_ticket_number(invoice_doc.name)
			# Link invoice to token
			token_doc.invoice = invoice_doc.name
			token_doc.flags.ignore_version = True
			token_doc.save(ignore_permissions=True)
		else:
			invoice_doc.flags.ignore_version = True
			invoice_doc.save()

	# //// Neoffice — a guest order that goes straight to the kitchen is a send like the till's: tell the
	# //// kitchen-send listeners (cloudprnt prints each station's ticket; maintenance#1935).
	if has_kds and validation_mode == "Direct to Kitchen":
		from pos_next.api.kitchen_events import kitchen_send

		kitchen_send(invoice_doc.name, next_batch)

	if token_doc.table:
		event_type = "order_submitted" if validation_mode == "Direct to Kitchen" else "order_pending_approval"
		_broadcast_order_update(token_doc.table, event_type, {
			"invoice": invoice_doc.name,
			"items_count": len(items),
			"validation_mode": validation_mode,
		})

		# Notify all POS clients (global, not room-scoped); they ignore the tables of another restaurant
		# //// Neoffice — the alerts name the lines of this order (`items`, `count`) and say whether the waiter must validate them (`validation_mode`), so that the
		# //// till tells the waiter with the words of the order without reading the table (NeoResto lot 1, Daniel, 01.11). Keys are only added: the keys the alerts
		# //// always had are unchanged for the submitted one; the pending one carried the guest's raw lines as `items` (no listener has ever read them), which are now the named lines.
		lines, count = _lines_of_this_order(added_rows)
		_publish_to_the_tills("guest_order_submitted", token_doc.table, {
			"table": token_doc.table,
			"invoice": invoice_doc.name,
			"items_count": len(items),
			"items": lines,
			"count": count,
			"validation_mode": validation_mode,
		})
		frappe.publish_realtime("table_update")

		if validation_mode == "Server Approval":
			_publish_to_the_tills("guest_order_pending", token_doc.table, {
				"table": token_doc.table,
				"invoice": invoice_doc.name,
				"items": lines,
				"count": count,
				"validation_mode": validation_mode,
			})

	return {
		"invoice": invoice_doc.name,
		"grand_total": flt(invoice_doc.grand_total),
		"status": "pending_approval" if validation_mode == "Server Approval" else "sent_to_kitchen",
	}


@frappe.whitelist(allow_guest=True)
def get_order_status(token):
	"""
	Return current items and totals for the guest session.
	Also finds submitted invoices (after guest payment).
	"""
	token_doc = _require_valid_token(token)
	invoice_doc = _get_or_create_invoice(token_doc)

	# If no draft found, check for a recently submitted invoice for this table
	if not invoice_doc and token_doc.table:
		submitted = frappe.db.get_value(
			"Sales Invoice",
			{"docstatus": 1, "restaurant_table": token_doc.table},
			"name",
			order_by="modified desc",
		)
		if submitted:
			invoice_doc = frappe.get_doc("Sales Invoice", submitted)

	if not invoice_doc:
		return {"invoice": None, "items": [], "grand_total": 0, "net_total": 0, "account": _account_of(token_doc)}

	item_fields = ["item_code", "item_name", "qty", "rate", "amount"]
	if frappe.db.has_column("Sales Invoice Item", "kds_status"):
		item_fields.append("kds_status")
	if frappe.db.has_column("Sales Invoice Item", "kds_batch"):
		item_fields.append("kds_batch")
	if frappe.db.has_column("Sales Invoice Item", "posa_special_instructions"):
		item_fields.append("posa_special_instructions")
	# An offered row (« Offert », NeoResto lot 1, task 24): the guest's page reads it as such
	from pos_next.offered import FIELD as OFFERED
	from pos_next.offered import offered_label

	if frappe.db.has_column("Sales Invoice Item", OFFERED):
		item_fields.append(OFFERED)

	all_items = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": invoice_doc.name},
		fields=item_fields,
	)

	# Get tip item code to exclude from order items display
	settings = _get_restaurant_settings(token_doc.pos_profile)
	tip_item_code = getattr(settings, "tip_item", None) or settings.get("tip_item") if settings else None

	# Separate order items from tip items
	order_items = []
	tip_total = 0
	for item in all_items:
		if tip_item_code and item.item_code == tip_item_code:
			tip_total += flt(item.amount)
		else:
			order_items.append(item)

	# Apply pricing rules so guest sees discounted prices
	order_items = _apply_pricing_rules_to_items(invoice_doc, order_items)
	# « Offert » in the guest's language (the request's): the till's translations are not open to a guest
	for item in order_items:
		if item.get(OFFERED):
			item["offered_label"] = offered_label()

	# Calculate total discount from pricing rules and subtract from invoice grand_total
	# (taxes may be included in item rates, so we can't just sum items + taxes)
	invoice_grand_total = flt(invoice_doc.grand_total) - tip_total
	discount_total = 0
	for item in order_items:
		plr = flt(item.get("price_list_rate") or 0)
		rate = flt(item.get("rate") or 0)
		if plr > rate:
			discount_total += (plr - rate) * flt(item.get("qty") or 1)
	order_grand_total = invoice_grand_total - round(discount_total, 2)
	tax_amount = flt(invoice_doc.total_taxes_and_charges) if hasattr(invoice_doc, "total_taxes_and_charges") else 0

	# paid_amount for the guest excludes tips (tips are voluntary extras, not shared debt)
	paid_amount = flt(invoice_doc.paid_amount) if hasattr(invoice_doc, "paid_amount") else 0
	paid_order_amount = paid_amount - tip_total

	return {
		"invoice": invoice_doc.name,
		"items": order_items,
		"grand_total": order_grand_total,
		"net_total": flt(invoice_doc.net_total),
		"paid_amount": paid_order_amount,
		"tip_total": tip_total,
		"total_taxes_and_charges": tax_amount,
		"company": invoice_doc.company or "",
		"posting_date": str(invoice_doc.posting_date or invoice_doc.creation),
		# //// Neoffice — who the session is: the customer of the table's order (see _account_of)
		"account": _account_of(token_doc, invoice_doc),
	}


# //// Neoffice — the sign-in of the QR page (NeoResto lot 1, Daniel, 02.11.2026): a code mailed to an address proves it, the customer of
# //// the address is the customer of the table, a new customer is made after the proof. See pos_next.restaurant.guest_account.
@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_guest_code(token, email):
	"""Mail a sign-in code to `email` for this session. The answer is the same whether the address belongs to a customer or not."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	with _as_the_system():
		return guest_account.request_code(token_doc, email)


def _signed_in(token_doc, customer):
	"""Bind `customer` to the session and the table's draft order; what the page reads of them."""
	with _as_the_system():
		invoice_doc = _get_or_create_invoice(token_doc)
		guest_account.bind(token_doc, customer, invoice_doc)
	if token_doc.table:
		# The waiter's till reads it as an alert and refreshes the order of the table
		_publish_to_the_tills("guest_signed_in", token_doc.table, {"table": token_doc.table, "customer": customer})
	return {"status": "signed_in", "account": _account_of(token_doc)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def confirm_guest_code(token, email, code):
	"""Prove `email` with the code that was mailed to it: the customer of that address is signed in, or, when the address belongs to nobody,
	{"status": "needs_registration"} and the name is asked for (`register_guest_account`)."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	email = guest_account.clean_email(email)
	guest_account.check_code(token_doc, email, code)
	customer = guest_account.customer_by_email(email)
	if customer:
		return _signed_in(token_doc, customer)
	guest_account.keep_the_proof(token_doc, email)
	return {"status": "needs_registration"}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def register_guest_account(token, email, customer_name, mobile_no=None):
	"""Make the customer of an address this session proved, the way the till makes one, and sign them in."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	with _as_the_system():
		customer = guest_account.register(token_doc, email, customer_name, mobile_no)
	return _signed_in(token_doc, customer)


@frappe.whitelist(allow_guest=True)
def get_guest_receipt_pdf(token):
	"""Generate and return a receipt PDF for a guest token's invoice."""
	# Accept both Active and Expired tokens (guest may re-download receipt)
	token_doc = _get_token_doc(token)
	if not token_doc.invoice:
		frappe.throw(_("No invoice found for this session."))

	invoice_name = token_doc.invoice
	if not frappe.db.exists("Sales Invoice", invoice_name):
		frappe.throw(_("Invoice not found."))

	# Get print format from POS Profile (same as POS receipt printing)
	print_format = None
	if token_doc.pos_profile:
		print_format = frappe.db.get_value("POS Profile", token_doc.pos_profile, "print_format")
	if not print_format:
		print_format = "Neopos Receipt"

	from frappe.utils.pdf import get_pdf

	# Bypass print permissions — guest is authenticated via token, not via Frappe session
	frappe.flags.ignore_permissions = True
	frappe.flags.ignore_print_permissions = True
	try:
		try:
			html = frappe.get_print("Sales Invoice", invoice_name, print_format)
		except Exception:
			html = frappe.get_print("Sales Invoice", invoice_name)
		pdf = get_pdf(html)
	finally:
		frappe.flags.ignore_print_permissions = False
		frappe.flags.ignore_permissions = False

	frappe.local.response.filename = f"receipt-{invoice_name}.pdf"
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"


def _resolve_wallee_provider(required=True):
	"""Return the Wallee Payment Provider name (first enabled, latest modified).

	After the wallee_integration → payments merger (ADR-005), Wallee flows go
	through the unified ``payments`` driver layer. Mirrors the webshop's
	``_resolve_wallee_provider_name`` ordering — ``modified desc``, NOT
	``mode desc`` (which would alphabetically pick a *test* provider before a
	*live* one). When ``required`` and none is found, raises.
	"""
	name = frappe.db.get_value(
		"Payment Provider",
		{"driver_class": ["like", "payments.drivers.wallee.%"], "enabled": 1},
		"name",
		order_by="modified desc",
	)
	if not name and required:
		frappe.throw(_("No enabled Wallee Payment Provider configured on this instance."))
	return name


@frappe.whitelist(allow_guest=True)
def create_guest_payment(token, amount, payment_items=None, tip=0, success_url=None, failed_url=None):
	"""
	Create a Wallee transaction for a guest payment.
	Supports tip amount and redirect URLs for Wallee payment page.
	Returns the Wallee payment URL for redirect.

	Post-merger: goes through ``payments.api.intent.create_intent`` on the
	``wallee_web`` channel (hosted payment page) — see ADR-005.
	"""
	# A new order starts something: nothing of the restaurant shows where the site does not run NeoResto (NeoResto lot 1,
	# task 4). What a payment's return goes through has no guard (see validate_token).
	require_neoresto()

	token_doc = _require_valid_token(token)
	invoice_doc = _get_or_create_invoice(token_doc)

	if not invoice_doc:
		frappe.throw(_("No active order found for this session."))

	amount = flt(amount)
	tip = flt(tip)
	if amount <= 0:
		frappe.throw(_("Payment amount must be greater than zero."))

	currency = invoice_doc.currency or frappe.defaults.get_global_default("currency")

	try:
		# Resolve the Wallee provider (post-merger unified driver layer).
		wallee_provider = _resolve_wallee_provider(required=True)

		# Unique payment counter for split payments (prevents Wallee duplicate rejection)
		existing_payment_count = frappe.db.count("Sales Invoice Payment", {"parent": invoice_doc.name})
		payment_num = existing_payment_count + 1

		# Build line items: order amount + optional tip
		line_items = [
			{
				"name": _("Order {0}").format(invoice_doc.name),
				"quantity": 1,
				"amount_including_tax": round(float(amount - tip), 2),
				"type": "PRODUCT",
				"unique_id": f"{invoice_doc.name}-p{payment_num}",
			}
		]
		if tip > 0:
			line_items.append({
				"name": _("Tip"),
				"quantity": 1,
				"amount_including_tax": round(float(tip), 2),
				"type": "FEE",
				"unique_id": f"{invoice_doc.name}-tip-p{payment_num}",
			})

		# Call the unified driver layer. The wallee_web driver creates the
		# Wallee transaction and returns the hosted payment page URL in
		# next_action_payload.url. Amount is in minor units (rappen for CHF),
		# same convention as Stripe/Wallee terminal.
		from payments.api import intent as intent_api

		amount_minor = int(round(amount * 100))
		intent = intent_api.create_intent(
			provider=wallee_provider,
			channel="wallee_web",
			amount=amount_minor,
			currency=currency,
			reference_doctype="Sales Invoice",
			reference_name=invoice_doc.name,
			metadata={
				"line_items": line_items,
				"token": token,
				"tip": tip,
				"success_url": success_url or None,
				"failed_url": failed_url or None,
			},
		)

		if intent.get("status") in ("failed", "canceled"):
			raise RuntimeError(
				intent.get("error_message") or _("Wallee transaction creation failed")
			)

		# Map the unified Payment Intent response back to the legacy shape the
		# guest checkout frontend expects (transaction_id, payment_url, state).
		payment_url = (intent.get("next_action_payload") or {}).get("url")
		if not payment_url:
			raise RuntimeError(f"create_intent returned no redirect URL: {intent}")
		result = {
			"transaction_id": intent.get("provider_intent_id"),
			"intent_name": intent.get("intent_name"),
			"payment_url": payment_url,
			"state": (intent.get("status") or "").upper(),
		}
	except frappe.ValidationError:
		# _resolve_wallee_provider / create_intent surfaced a user-facing error.
		raise
	except Exception as e:
		import traceback
		frappe.log_error("Guest payment creation failed",
			f"Amount: {amount}, Tip: {tip}, Invoice: {invoice_doc.name}\n"
			f"Error: {str(e)}\n{traceback.format_exc()}")
		frappe.throw(_("Failed to initiate payment. Please try again or contact staff."))

	# Store pending payment info in the transaction result for later confirmation
	# Do NOT record payment or change table status yet — Wallee hasn't confirmed
	result["_pending"] = {
		"invoice": invoice_doc.name,
		"amount": amount,
		"tip": tip,
		"table": token_doc.table,
	}

	if token_doc.table:
		_broadcast_order_update(token_doc.table, "payment_initiated", {
			"invoice": invoice_doc.name,
			"amount": amount,
			"paid_amount": flt(invoice_doc.paid_amount),
			"grand_total": flt(invoice_doc.grand_total),
		})

	return result


@frappe.whitelist(allow_guest=True)
def confirm_guest_payment(token, amount, tip=0):
	"""
	Confirm a guest payment after Wallee redirect success.
	Records the payment via Frappe ORM (same as POS).
	If fully paid, submits the invoice (creates GL entries).
	"""
	token_doc = _require_valid_token(token)
	invoice_doc = _get_or_create_invoice(token_doc)

	if not invoice_doc:
		frappe.throw(_("No active order found for this session."))

	amount = flt(amount)
	tip = flt(tip)
	order_payment = flt(amount) - flt(tip)

	try:
		# Get mode of payment from the per-provider Wallee Settings record.
		# After the wallee_integration → payments merger (ADR-005) the
		# Wallee Settings singleton became a per-provider DocType (it now
		# carries a `provider` link), so we look it up by provider instead of
		# get_single_value.
		wallee_provider = _resolve_wallee_provider(required=False)
		wallee_mop = None
		if wallee_provider:
			wallee_mop = frappe.db.get_value(
				"Wallee Settings", {"provider": wallee_provider}, "pos_mode_of_payment"
			)
		if not wallee_mop:
			# The name of the card Mode of Payment record our (French-language) instances carry: a record
			# name to look up, not a text to translate
			wallee_mop = "Carte de crédit"

		# Prevent duplicate confirmation: check if a Restaurant Tip or payment
		# with the same exact amount was recorded in the last 60 seconds
		# (catches double-fire from frontend redirect)
		recent_dup = frappe.db.sql("""
			SELECT name FROM `tabRestaurant Tip`
			WHERE sales_invoice=%s AND amount=%s
			AND TIMESTAMPDIFF(SECOND, creation, NOW()) < 60
		""", (invoice_doc.name, flt(amount)))
		if not recent_dup:
			# Also check payment rows for the exact order_payment amount
			recent_dup = frappe.db.sql("""
				SELECT name FROM `tabSales Invoice Payment`
				WHERE parent=%s AND mode_of_payment=%s AND ABS(amount - %s) < 0.01
			""", (invoice_doc.name, wallee_mop, flt(amount)))
		if recent_dup:
			current_paid = flt(invoice_doc.paid_amount)
			return {"status": "already_confirmed", "paid_amount": current_paid, "grand_total": flt(invoice_doc.grand_total)}

		# Fallback: also check if payment would exceed total
		current_paid = flt(invoice_doc.paid_amount)
		grand_total = flt(invoice_doc.grand_total)
		if grand_total > 0 and current_paid + order_payment > grand_total * 1.01:
			return {"status": "already_paid", "paid_amount": current_paid, "grand_total": grand_total}

		# Reload full invoice via ORM (not stale cached version)
		invoice_doc = frappe.get_doc("Sales Invoice", invoice_doc.name)

		# Add TIP item to invoice if tip > 0
		if flt(tip) > 0:
			settings = _get_restaurant_settings(token_doc.pos_profile)
			tip_item_code = getattr(settings, "tip_item", None) or settings.get("tip_item")
			tip_account = getattr(settings, "tip_account", None) or settings.get("tip_account")
			if tip_item_code:
				# Cumulate with existing TIP item if present (e.g. previous partial payment had a tip)
				existing_tip = None
				for item in invoice_doc.items:
					if item.item_code == tip_item_code:
						existing_tip = item
						break
				if existing_tip:
					existing_tip.rate = flt(existing_tip.rate) + flt(tip)
				else:
					invoice_doc.append("items", {
						"item_code": tip_item_code,
						"item_name": _("Tip"),
						"qty": 1,
						"rate": flt(tip),
						"income_account": tip_account or None,
						"cost_center": invoice_doc.cost_center,
						"description": _("Gratuity", context="Restaurant tip line"),
					})
				# Recalculate totals with tip item
				invoice_doc.run_method("calculate_taxes_and_totals")

		# Payment amount = order + tip (full Wallee charge)
		total_payment = flt(amount)

		# Find existing payment row with same mode_of_payment, or create one
		existing_row = None
		for row in invoice_doc.payments:
			if row.mode_of_payment == wallee_mop:
				existing_row = row
				break

		if existing_row:
			existing_row.amount = flt(existing_row.amount) + total_payment
		else:
			invoice_doc.append("payments", {
				"mode_of_payment": wallee_mop,
				"amount": total_payment,
			})

		# Remove zero-amount payment rows (e.g. the default cash mode of payment at 0.00)
		invoice_doc.payments = [p for p in invoice_doc.payments if flt(p.amount) > 0]

		# Recalculate paid_amount
		new_paid = sum(flt(p.amount) for p in invoice_doc.payments)
		invoice_doc.paid_amount = new_paid

		# Set payment accounts (same as POS submit flow)
		from pos_next.api.invoices import _set_payment_accounts
		_set_payment_accounts(invoice_doc.payments, invoice_doc.company)

		fully_paid = new_paid >= grand_total and grand_total > 0

		if fully_paid:
			# Submit the invoice (creates GL entries, Payment Entry, etc.)
			invoice_doc.ignore_pricing_rule = 1
			invoice_doc.flags.ignore_pricing_rule = True
			invoice_doc.flags.ignore_permissions = True
			invoice_doc.flags.ignore_version = True
			frappe.flags.ignore_account_permission = True
			with _as_the_system():
				invoice_doc.save()
				invoice_doc.submit()

			# Table → Paid (guest payment — cashier sees it and decides next step)
			if token_doc.table and frappe.db.exists("Restaurant Table", token_doc.table):
				frappe.db.set_value("Restaurant Table", token_doc.table, "status", "Paid")
			frappe.publish_realtime("table_update")
		else:
			# Partial payment — just save the draft
			invoice_doc.flags.ignore_permissions = True
			invoice_doc.flags.ignore_version = True
			with _as_the_system():
				invoice_doc.save()

		frappe.db.commit()

		# Create Restaurant Tip record (always create if guest sends a tip)
		if flt(tip) > 0 and frappe.db.exists("DocType", "Restaurant Tip"):
			try:
				frappe.get_doc({
					"doctype": "Restaurant Tip",
					"restaurant": _get_restaurant_settings(token_doc.pos_profile).get("name"),
					"tip_date": frappe.utils.today(),
					"sales_invoice": invoice_doc.name,
					"restaurant_table": token_doc.table,
					"server": invoice_doc.owner or "Administrator",
					"amount": flt(tip),
					"payment_method": wallee_mop,
					"status": "Collected",
				}).insert(ignore_permissions=True)
				frappe.db.commit()
			except Exception as tip_err:
				frappe.log_error("Guest tip record failed", str(tip_err))

		if token_doc.table:
			_publish_to_the_tills("guest_payment_received", token_doc.table, {
				"table": token_doc.table,
				"invoice": invoice_doc.name,
				"paid_amount": new_paid,
				"grand_total": grand_total,
				"submitted": fully_paid,
			})

		return {"status": "success", "paid_amount": new_paid, "grand_total": grand_total, "submitted": fully_paid}

	except Exception as e:
		import traceback
		frappe.log_error(
			"Guest payment confirmation failed",
			f"Invoice: {invoice_doc.name}, Amount: {amount}\n"
			f"Error: {str(e)}\n{traceback.format_exc()}"
		)
		return {"status": "error"}


# ==========================================
# Authenticated endpoints (server-side)
# ==========================================


def guest_link(token):
	"""The address a table's QR code opens: the site's address and the guest page of `token`. The one place that writes it: the
	QR dialog shows it (`create_table_token`) and the QR ticket prints it (`table_qr_ticket`), and the two must be the same."""
	return f"{frappe.utils.get_url()}/pos/guest/{token}"


@frappe.whitelist()
def create_table_token(table, pos_profile):
	"""
	Return the Guest Order Token of a restaurant table: the one it already has, else a new one.
	Called by the server POS when the QR button of a table is pressed.
	A table that already has an active token gets THAT token again. A new one would expire the code
	already placed on the table (shown on a tablet, printed, stuck under a glass), and every phone
	that scanned it would be told that its session is over.
	A press shows the table's live code, so whoever presses is checked first, by the rule of the floor read (`get_tables`):
	whoever the till shows the floor to may press QR for a table of that till's restaurant, no wider and no narrower. That is
	a desk account that may read the restaurant of the till the call names (`permissions.require_floor_access`: the roles that
	read a Restaurant, and the per-restaurant User Permissions, which keep a user of restaurant B from the live code of
	restaurant A whatever till he names), on a site that runs NeoResto, for a table that is on the floor of that till. Not
	asked on top: an assignment to the till, a right on the table, the right to create a Guest Order Token (the code is made
	with the authority of that check).
	Returns the token value and the guest URL.
	"""
	# Where the site does not run NeoResto nothing of the restaurant shows: no code is made for a guest to use
	require_neoresto()
	# A name is a string: a dict from a JSON body would be read as filters by the lookups below
	if not (isinstance(table, str) and table and isinstance(pos_profile, str) and pos_profile):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	# The rule of the floor read, the one function both ask, for the restaurant of the till named: a visitor and a portal
	# account are refused, and so is a desk user kept to another restaurant
	restaurant = scope.current_restaurant(pos_profile)
	permissions.require_floor_access(restaurant)

	if not frappe.db.exists("Restaurant Table", table):
		frappe.throw(_("Table {0} not found.").format(table))

	# The table is on the floor of the restaurant the till belongs to, never another's
	if scope.restaurant_of_record("Restaurant Table", table) != restaurant:
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	# The code the table already has: its newest active token that can still be used (is_valid: not past
	# its time, its POS opening still open). An active token that cannot be used any more is expired, as it
	# always was; a usable one is never touched, not even when the table has several.
	token_doc = None
	active_tokens = frappe.get_all(
		"Guest Order Token",
		filters={"table": table, "status": "Active"},
		order_by="creation desc",
		pluck="name",
	)
	for t_name in active_tokens:
		try:
			t_doc = frappe.get_doc("Guest Order Token", t_name)
			if t_doc.is_valid():
				if token_doc is None:
					token_doc = t_doc
				continue
			t_doc.expire()
		except (frappe.ValidationError, frappe.DoesNotExistError) as e:
			# Force expire via DB if ORM refuses (e.g. validation errors on old tokens): a token that cannot be
			# read or checked is not a code that works. A database error is NOT caught, a deadlock or a timeout
			# included: InnoDB rolls the transaction back when it picks this request as the victim, and going on
			# would commit what is left of it
			frappe.db.set_value("Guest Order Token", t_name, "status", "Expired")
			frappe.log_error("Token expire fallback", f"Token {t_name}: {str(e)}")

	# //// Neoffice — a code made by a till that no longer belongs to this restaurant (the shop's till of before the restaurant had its own) finds no restaurant, so no guest menu:
	# //// its page read « Invalid or expired » on a phone (product owner, 03.11.2026, the QR of a table made on 12.10 and printed since). The code is the one placed on the
	# //// table, so it stays; its till becomes the one that asks. A till of the same restaurant keeps its code as it was.
	if token_doc is not None and scope.current_restaurant(token_doc.pos_profile) != restaurant:
		frappe.db.set_value(
			"Guest Order Token",
			token_doc.name,
			{"pos_profile": pos_profile, "pos_opening": _get_active_pos_opening(pos_profile)},
		)
		token_doc.reload()

	if token_doc is None:
		# Find the current open POS opening
		pos_opening = _get_active_pos_opening(pos_profile)

		# Compute expires_at from settings
		settings = _get_restaurant_settings(pos_profile)
		expires_at = None
		if settings.token_expiry_mode == "Timed":
			days = settings.token_expiry_days or 7
			expires_at = frappe.utils.add_days(now_datetime(), days)

		token_doc = frappe.get_doc({
			"doctype": "Guest Order Token",
			"mode": "restaurant",
			"table": table,
			"pos_profile": pos_profile,
			"pos_opening": pos_opening,
			"expires_at": expires_at,
		})
		token_doc.flags.ignore_permissions = True
		token_doc.flags.ignore_validate = True
		token_doc.insert()

	# Mark table as Occupied when QR is generated (guests are seated)
	current_status = frappe.db.get_value("Restaurant Table", table, "status")
	if current_status == "Empty":
		frappe.db.set_value("Restaurant Table", table, "status", "Occupied")
		frappe.publish_realtime("table_update")
		# //// Neoffice — the overview of the restaurant's space counts the tables with guests (neoffice-maintenance#2163)
		from pos_next.restaurant.figures import figures_changed

		figures_changed()

	guest_url = guest_link(token_doc.token)

	return {
		"token": token_doc.token,
		"url": guest_url,
		"name": token_doc.name,
	}


# ==========================================
# Takeaway-specific endpoints
# ==========================================


@frappe.whitelist(allow_guest=True, methods=["POST"])
def create_takeaway_token():
	"""
	Create a Guest Order Token for a takeaway web order (no table binding).
	Called when a visitor starts a takeaway order.
	Rate-limited: max 10 tokens per IP per hour.
	Not behind the guard of NeoResto (mode.require_neoresto): the takeaway page asks for its token on every mount, the
	return from a payment included. The restaurant's own web-takeaway setting closes it.
	"""
	# Rate limiting: max 10 takeaway tokens per IP per hour
	client_ip = frappe.local.request_ip
	one_hour_ago = frappe.utils.add_to_date(now_datetime(), hours=-1)
	recent_count = frappe.db.count(
		"Guest Order Token",
		{"mode": "takeaway", "creation": (">=", one_hour_ago), "owner": "Guest"}
	)
	if recent_count >= 50:
		frappe.throw(_("Too many requests. Please try again later."), frappe.RateLimitExceededError)

	settings = _get_restaurant_settings()
	if not settings.enable_web_takeaway:
		frappe.throw(_("Takeaway web ordering is not enabled."))

	# Compute expires_at from settings
	expires_at = None
	if settings.token_expiry_mode == "Timed":
		days = settings.token_expiry_days or 7
		expires_at = frappe.utils.add_days(now_datetime(), days)

	token_doc = frappe.get_doc({
		"doctype": "Guest Order Token",
		"mode": "takeaway",
		"expires_at": expires_at,
	})
	token_doc.flags.ignore_permissions = True
	token_doc.insert()

	return {
		"token": token_doc.token,
		"name": token_doc.name,
		# The restaurant a takeaway session belongs to is the default one (it has no till)
		"restaurant_name": settings.get("restaurant_name") or "",
	}


@frappe.whitelist(allow_guest=True)
def submit_takeaway_order(token, items, customer=None):
	"""
	Finalize a takeaway order after payment.
	Creates a POS Invoice flagged as takeaway.
	Payment must be completed before this endpoint will finalize the order.
	Not behind the guard of NeoResto (mode.require_neoresto): it finishes an order that a payment already paid.
	"""
	token_doc = _require_valid_token(token)

	if token_doc.mode != "takeaway":
		frappe.throw(_("This endpoint is only valid for takeaway sessions."))

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("No items provided."))

	# Takeaway orders require a valid customer
	customer_name = customer or frappe.session.user
	if not customer_name or customer_name == "Guest":
		frappe.throw(_("A customer account is required for takeaway orders."))
	# Validate that the customer exists in ERPNext
	if not frappe.db.exists("Customer", customer_name):
		frappe.throw(_("Customer {0} not found.").format(customer_name))

	# Enforce payment before order finalization.
	# Post-merger: a succeeded Payment Intent (reference = this invoice)
	# replaces the now-dropped legacy Wallee Transaction DocType.
	has_payment = frappe.db.exists(
		"Payment Intent",
		{
			"reference_doctype": "Sales Invoice",
			"reference_name": token_doc.invoice,
			"status": "succeeded",
		},
	) if token_doc.invoice else False
	if not has_payment:
		frappe.throw(_("Payment must be completed before placing a takeaway order."))

	settings = _get_restaurant_settings(token_doc.pos_profile)
	card_name = settings.takeaway_menu or _get_guest_menu_card(settings)
	if not card_name:
		frappe.throw(_("No takeaway menu is configured."))

	# Determine POS profile — use first available if not linked to token
	pos_profile = token_doc.pos_profile
	if not pos_profile:
		available = frappe.get_all("POS Profile", filters={"disabled": 0}, limit=1, pluck="name")
		if available:
			pos_profile = available[0]

	if not pos_profile:
		frappe.throw(_("No POS Profile is available for takeaway orders."))

	pos_profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)

	invoice_data = {
		"doctype": "Sales Invoice",
		"is_pos": 1,
		"pos_profile": pos_profile,
		"company": pos_profile_doc.company,
		"currency": pos_profile_doc.currency or frappe.defaults.get_global_default("currency"),
		"customer": customer_name,
		"items": [],
	}

	# Set takeaway flag if it exists
	if frappe.db.has_column("Sales Invoice", "is_takeaway"):
		invoice_data["is_takeaway"] = 1

	invoice_doc = frappe.get_doc(invoice_data)

	has_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	for item in items:
		item_code = item.get("item_code")
		if not item_code:
			continue
		qty = flt(item.get("qty", 1))
		rate = flt(item.get("rate") or item.get("price") or 0)
		if not rate:
			rate = flt(frappe.db.get_value("Item", item_code, "standard_rate") or 0)

		row = invoice_doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"rate": rate,
		})
		if has_kds:
			row.kds_status = "Pending"

	invoice_doc.flags.ignore_permissions = True
	with _as_the_system():
		invoice_doc.insert()
		# A web takeaway order takes its ticket number like the till's (NeoResto lot 1, task 38b)
		tickets.give_ticket_number(invoice_doc.name)

		token_doc.invoice = invoice_doc.name
		token_doc.flags.ignore_version = True
		token_doc.save(ignore_permissions=True)

	# Notify POS of new takeaway web order, in the restaurant whose settings priced it
	frappe.publish_realtime("takeaway_web_order", {
		"restaurant": settings.get("name"),
		"invoice": invoice_doc.name,
		"customer": customer_name,
		"grand_total": flt(invoice_doc.grand_total),
	})

	return {
		"invoice": invoice_doc.name,
		"grand_total": flt(invoice_doc.grand_total),
		"status": "created",
	}
