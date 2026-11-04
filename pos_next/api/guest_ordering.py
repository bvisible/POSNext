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
from frappe.rate_limiter import rate_limit
from frappe.utils import add_to_date, cint, flt, now_datetime
from frappe.utils.synchronization import filelock

from pos_next.restaurant import guest_account, permissions, portions, scope, service_families, tickets
from pos_next.restaurant.mode import require_neoresto
from pos_next.restaurant.settings import get_restaurant_settings_for_profile
from pos_next.restaurant.text import plain_text

# A takeaway session is kept for the tab (the page asks again only when its session is gone): a visitor starts one or two
# an hour; the room left above that is for the visitors who share an address (a mobile network, a shop's Wi-Fi)
TAKEAWAY_SESSIONS_PER_VISITOR = 20


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
	# //// Neoffice — the whole session is given back, not only its user: `set_user` also replaces the session's id with the user's name and empties
	# //// its data, which is nothing to lose for a guest but is the open session of a customer whose sign-in mail link brought them back to the page
	# //// (`claim_signed_in_account`): its id and its CSRF token must be what the next call of the page finds (NeoResto lot 1, 03.11.2026).
	user, sid, data = frappe.session.user, frappe.session.sid, frappe.session.data
	frappe.set_user("Administrator")
	try:
		yield
	finally:
		frappe.set_user(user)
		frappe.session.sid = sid
		frappe.session.data = data


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


# //// Neoffice — the restaurant's switch closes the order on the server, not only the till's QR button: a code printed or stuck on a table outlives
# //// the switch, and every phone that scanned it could still send orders to the kitchen.
def _require_ordering_open(token_doc, settings):
	"""Refuse a new order where the restaurant of the session takes none from a phone: QR ordering for a table, web takeaway for a takeaway
	session. Only the order is closed: the menu still shows, and a payment and its return go through."""
	if token_doc.mode == "takeaway":
		if not settings.get("enable_web_takeaway"):
			frappe.throw(_("Takeaway web ordering is not enabled."))
	elif not settings.get("enable_qr_ordering"):
		frappe.throw(_("Ordering from the table's QR code is not enabled here."))


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
		# //// Neoffice — a web takeaway order that was settled keeps its link: the page that comes back from the payment asks for it, and the first call that
		# //// found it submitted used to forget it (the server settles a paid order now, before the page is back; neoffice-maintenance#2132).
		if token_doc.mode == "takeaway" and frappe.db.exists("Sales Invoice", {"name": token_doc.invoice, "docstatus": 1}):
			return None
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


def _account_mode(token_doc):
	"""What the page is told about accounts: "Not Proposed", "Optional" or "Mandatory". A web takeaway order always needs one (the kitchen
	has nobody to call otherwise); a table follows its restaurant. Where the engine cannot mail a code (no engine, its switch off, no
	outgoing mail) nothing is proposed or required: a diner is never locked out of a table by a mail that cannot go."""
	if not guest_account.is_available():
		return "Not Proposed"
	if token_doc.mode == "takeaway":
		return "Mandatory"
	return _get_restaurant_settings(token_doc.pos_profile).guest_account_mode or "Not Proposed"


def _account_is_required(token_doc):
	return _account_mode(token_doc) == "Mandatory"


def _require_accounts_proposed(token_doc):
	"""A restaurant that does not propose an account has no sign-in: nothing is mailed, nothing is made."""
	if _account_mode(token_doc) == "Not Proposed":
		frappe.throw(_("Accounts are not proposed here."), frappe.PermissionError)


def _get_timeslot_cards(settings):
	"""Find restaurant cards active for the current time slot (Opening Hours logic)."""
	import calendar

	from frappe.utils import get_time, getdate, nowdate, nowtime

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
			# //// Neoffice — whether the dish is in stock, never how many: the menu is a public page, and the quantity in the warehouse is the
			# //// business's figure, not the guest's (the page only greys a dish out at zero, GuestMenuView.isOutOfStock)
			item_data["in_stock"] = flt(stock_qty) > 0

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


# //// Neoffice — the till's offers (Pricing Rules, promotional schemes) on what a guest is shown and pays (maintenance#2077). `apply_offers` is the
# //// till's calculation and refused the guest (« Guest has no access to Sales Invoice »), whatever `ignore_permissions` said: no discount ever showed on
# //// the QR page, and every menu wrote two rows to the Error Log. It is a calculation over lines the server built (the card's dishes, the draft's rows),
# //// so it runs as the system. A guest's draft keeps the card's prices, because the till reloads a table taking each line's `rate` as its catalogue
# //// price and applies its offers on it (composables/useInvoice.js, replaceAllItems): a discounted rate there was discounted twice. The discount is
# //// shown, and written on the lines only when the guest's phone pays the whole order (_write_the_offers).
def _sells_with_offers():
	"""Whether the site has an offer a till could apply: most have none, and their menu is not priced again for nothing."""
	return bool(
		frappe.db.exists("Pricing Rule", {"disable": 0, "selling": 1, "coupon_code_based": 0})
	)


def _offers_on(pos_profile, customer, lines, posting_date=None):
	"""The till's offers on `lines` ([{item_code, item_name, qty, price}]), in their order: None for a line without one, else
	{"rate": the unit price after the offer, "discount_percentage", "pricing_rules"}. Never raises: a failure is logged and gives no discount.
	A rule that sets a rate (`Rate`) is said as the percentage it takes off the line's price, the form the line and the page carry."""
	if not lines or not pos_profile or not _sells_with_offers():
		return [None] * len(lines)
	queued = _messages_queued()
	try:
		from pos_next.api.invoices import apply_offers

		profile = frappe.get_cached_doc("POS Profile", pos_profile)
		invoice_data = {
			"doctype": "Sales Invoice",
			"pos_profile": pos_profile,
			"customer": customer
			or profile.customer
			or frappe.db.get_single_value("Selling Settings", "customer")
			or "Guest",
			"currency": profile.currency or frappe.defaults.get_global_default("currency"),
			"is_pos": 1,
			"items": [
				{
					"item_code": line["item_code"],
					"item_name": line.get("item_name"),
					"qty": flt(line.get("qty") or 1),
					"price_list_rate": flt(line["price"]),
					"rate": flt(line["price"]),
					"discount_percentage": 0,
					"discount_amount": 0,
				}
				for line in lines
			],
		}
		if posting_date:
			invoice_data["posting_date"] = str(posting_date)
		with _as_the_system():
			result = apply_offers(invoice_data)
	except Exception as e:
		_forget_messages_after(queued)
		frappe.log_error("Guest offers failed", str(e))
		return [None] * len(lines)

	priced = (result or {}).get("items") or []
	offers = []
	for index, line in enumerate(lines):
		offer = None
		row = priced[index] if index < len(priced) else {}
		price = flt(line["price"])
		percentage = flt(row.get("discount_percentage"))
		rate = flt(flt(row.get("price_list_rate") or price) * (1 - percentage / 100), 2)
		if price > 0 and rate < price:
			offer = {
				"rate": rate,
				"discount_percentage": flt((1 - rate / price) * 100, 4),
				"pricing_rules": row.get("pricing_rules") or "",
			}
		offers.append(offer)
	return offers


def _tip_item(token_doc):
	"""The item a tip is a line of, in the restaurant of the session (None where tips are not set up)."""
	settings = _get_restaurant_settings(token_doc.pos_profile)
	return (settings.get("tip_item") if settings else None) or None


def _write_the_offers(invoice_doc, tip_item=None):
	"""Write the till's offers on the lines of a draft the guest pays, and work its totals out again: what the guest's page shows as the order's
	total, and what the phone charges. The lines are the draft's priced ones, the tip apart, that the till has not discounted itself (a line the till
	discounted, or an offered one, is the till's word). In memory: the caller saves, or does not. Returns the draft."""
	rows = [
		row
		for row in invoice_doc.items
		if row.item_code != tip_item and flt(row.rate) > 0 and not flt(row.discount_percentage)
	]
	offers = _offers_on(
		invoice_doc.pos_profile,
		invoice_doc.customer,
		[{"item_code": r.item_code, "item_name": r.item_name, "qty": r.qty, "price": r.rate} for r in rows],
		invoice_doc.posting_date,
	)
	for row, offer in zip(rows, offers, strict=True):
		if offer:
			row.price_list_rate = flt(row.rate)
			row.discount_percentage = offer["discount_percentage"]
			row.discount_amount = flt(row.rate) - offer["rate"]
			row.rate = offer["rate"]
			row.pricing_rules = offer["pricing_rules"]
	with _as_the_system():
		invoice_doc.run_method("calculate_taxes_and_totals")
	return invoice_doc


def _still_owed(invoice_doc, tip_item):
	"""What the guest's order still owes, the till's offers taken off: the total of the order as the page shows it, less what was paid for it. A
	tip is on both sides (its line is in the total, its money in what was paid), so it owes nothing. Worked out on a copy: the draft is not touched."""
	if invoice_doc.docstatus != 0:
		return 0
	priced = _write_the_offers(frappe.get_doc("Sales Invoice", invoice_doc.name), tip_item)
	return flt(flt(priced.grand_total) - flt(priced.paid_amount), 2)


def _without_repricing(invoice_doc):
	"""Have the next save of the draft keep its lines' prices and discounts as they are written, like the till's (pos_next.api.invoices)."""
	from pos_next.api.invoices import _patch_set_missing_item_details

	invoice_doc.ignore_pricing_rule = 1
	invoice_doc.flags.ignore_pricing_rule = True
	_patch_set_missing_item_details(invoice_doc)


# //// Neoffice — a pricing attempt that fails as the guest leaves its messages in the answer (« Guest has no access to Sales Invoice », « Error
# //// applying offers: »), although the failure is caught. The page shows the first message of an answer (stores/guestOrder.js, serverMessage): an
# //// order refused after its lines were priced by the menu read as a permission error (maintenance#2198). What the failed attempt queued is taken back.
def _messages_queued():
	return len(getattr(frappe.local, "message_log", None) or [])


def _forget_messages_after(count):
	"""Drop the messages queued for the answer after the first `count`."""
	messages = getattr(frappe.local, "message_log", None)
	if isinstance(messages, list):
		del messages[count:]


def _apply_pricing_rules_to_menu(pos_profile, categories, customer=None):
	"""Annotate the menu's dishes with the till's offers: `discount_percentage` and `discounted_price`, which the page shows next to the price.
	//// Neoffice — for the customer the guest signed in as (or the till put on the table) when there is one: the rules of that customer's group apply (Daniel, 02.11.2026).
	The dishes are priced in one call, one of each: a rule on a quantity bought together may show here on a dish one serving of which does not
	get it. What the guest pays is the order's own lines, priced with their quantities (get_order_status, _write_the_offers).
	"""
	dishes = [dish for category in categories for dish in category.get("menu_items") or []]
	offers = _offers_on(
		pos_profile,
		customer,
		[{"item_code": d.get("item_code"), "item_name": d.get("item_name"), "qty": 1, "price": d.get("price") or 0} for d in dishes],
	)
	for dish, offer in zip(dishes, offers, strict=True):
		if offer:
			# The page shows it as it is (« -10% »): rounded, the line keeps the exact one
			dish["discount_percentage"] = flt(offer["discount_percentage"], 1)
			dish["discounted_price"] = offer["rate"]


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
		# //// Neoffice — what the page may offer: a takeaway order needs an account, and where no code can be mailed nothing is offered (_account_mode)
		"guest_account_mode": _account_mode(token_doc),
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
	card_names, all_categories = _guest_menu_categories(token_doc, settings)

	return {
		"card": {"card_name": ", ".join(card_names), "description": "", "image": ""},
		"categories": all_categories,
	}


# //// Neoffice — the menu of a token, built once for the page that shows it (get_guest_menu) and for the order that prices its lines by it
# //// (submit_guest_order, maintenance#2198)
def _guest_menu_categories(token_doc, settings, offers=True):
	"""(card names, categories) of the menu the page of `token_doc` is served: its cards, its families' colours, its customer's prices, and
	with `offers` the till's offers on each dish (an order prices its lines by the card alone, see _rate_on_the_menu)."""
	# Resolve warehouse from POS Profile for stock display
	warehouse = None
	if token_doc.pos_profile:
		warehouse = frappe.db.get_value("POS Profile", token_doc.pos_profile, "warehouse")

	# //// Neoffice — a web takeaway session is served the card the restaurant gives its takeaway (`takeaway_menu`), not the card of its tables (#2132)
	if token_doc.mode == "takeaway" and settings.get("takeaway_menu"):
		card_names = [settings.get("takeaway_menu")]
	else:
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
	if offers and token_doc.pos_profile:
		# //// Neoffice — priced for the customer of the session when it has one
		account = _account_of(token_doc)
		_apply_pricing_rules_to_menu(
			token_doc.pos_profile, all_categories, customer=account["customer"] if account else None
		)

	return card_names, all_categories


# //// Neoffice — the price of a guest's line is the menu's, read on the server, never the one the page sends (maintenance#2198). The page computes
# //// it in the browser (the dish's price, or its discounted price, plus the price of its options) and the server wrote it as sent: whoever held
# //// the token of a table could order a dish at 0.05, and pay that much (#1973). The line takes the card's price, the offer is not on it: the
# //// till applies its offers on a table's lines when it reloads them, and a discounted line would be discounted twice (maintenance#2077).
def _dishes_of(categories):
	"""{item_code: dish} of a menu, each dish as it first shows (the page lists the dishes in that order)."""
	dishes = {}
	for category in categories:
		for dish in category.get("menu_items") or []:
			dishes.setdefault(dish["item_code"], dish)
	return dishes


def _rate_on_the_menu(item, dishes):
	"""The rate of a guest's line as the card prices it: the dish's price plus the price of each option the line names (the page adds the offer
	to it, stores/guestOrder.js, addToCart; the draft does not). A dish the menu does not offer, or an option the dish does not have, is refused."""
	code = item.get("item_code")
	dish = dishes.get(code)
	if not dish:
		frappe.throw(_("{0} is not on the menu").format(frappe.db.get_value("Item", code, "item_name") or code))
	rate = flt(dish.get("price"))
	offered = {
		(group.get("group_name"), option.get("option_name")): flt(option.get("price_adjustment"))
		for group in dish.get("product_options") or []
		for option in group.get("options") or []
	}
	modifiers = item.get("modifiers") or []
	if isinstance(modifiers, str):
		modifiers = frappe.parse_json(modifiers) if modifiers.strip() else []
	if not isinstance(modifiers, list):
		frappe.throw(_("{0}: an option is no longer offered, please reload the menu").format(dish["item_name"]))
	for modifier in modifiers:
		chosen = (
			(modifier.get("group_name") or modifier.get("group"), modifier.get("option_name") or modifier.get("option"))
			if isinstance(modifier, dict)
			else None
		)
		if chosen not in offered:
			frappe.throw(_("{0}: an option is no longer offered, please reload the menu").format(dish["item_name"]))
		rate += offered[chosen]
	return rate


def _quantity_of(item):
	"""The quantity of a guest's line: a whole number of dishes, at least one (a line of -2 would take two dishes off the bill, 0.01 would sell one
	for a hundredth of its price)."""
	qty = flt(item.get("qty", 1))
	if qty < 1 or qty != int(qty):
		frappe.throw(_("Please choose a whole number of dishes"))
	return qty


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
	_require_ordering_open(token_doc, settings)
	validation_mode = settings.qr_order_validation or "Direct to Kitchen"
	# //// Neoffice — a web takeaway order is paid before the kitchen starts it: its lines wait (held, like a dish the waiter keeps back) until the payment is
	# //// proven, then `_release_paid_takeaway` sends them (neoffice-maintenance#2132)
	held_until_paid = token_doc.mode == "takeaway"

	# //// Neoffice — a dish the kitchen has no portion of left is refused, whatever the guest's page still shows (NeoResto lot 1, Daniel, 02.11.2026); before anything is created
	_refuse_what_is_sold_out(items)
	# //// Neoffice — every line priced by the menu the page is served, before anything is created (maintenance#2198)
	_cards, menu = _guest_menu_categories(token_doc, settings, offers=False)
	dishes = _dishes_of(menu)
	rates = {index: _rate_on_the_menu(item, dishes) for index, item in enumerate(items) if item.get("item_code")}
	quantities = {index: _quantity_of(items[index]) for index in rates}

	invoice_doc = _get_or_create_invoice(token_doc)
	is_new_invoice = not invoice_doc

	# //// Neoffice — a restaurant that requires an account takes no order from a session nobody is identified in (the till's customer on the table counts as identified)
	customer_of_the_table, _source = guest_account.customer_of(token_doc, invoice_doc)
	if _account_is_required(token_doc) and not customer_of_the_table:
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
		# //// Neoffice — a takeaway order is flagged as one before its first save: it takes the takeaway tax category and its ticket number then (#2132)
		if token_doc.mode == "takeaway" and frappe.db.has_column("Sales Invoice", "is_takeaway"):
			invoice_data["is_takeaway"] = 1

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

	for index, item in enumerate(items):
		item_code = item.get("item_code")
		if not item_code:
			continue

		modifiers = item.get("modifiers")
		mod_str = _json.dumps(modifiers) if modifiers and not isinstance(modifiers, str) else (modifiers or "")
		# //// Neoffice — every line of a send is a line of the order: the page sends the NEW lines only and empties its cart after each send, so
		# //// a drink ordered again in a second round (or twice in one send) is a new line. The first version skipped a line whose item and
		# //// modifiers were already on the invoice, which dropped a second round without a word and answered success (found by the floor-alerts
		# //// agent, 01.11).

		# //// Neoffice — the menu's price, never the page's `rate`, for a whole number of dishes (maintenance#2198)
		qty = quantities[index]
		rate = rates[index]

		row = invoice_doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"rate": rate,
		})
		# //// Neoffice — kept for the alert to the tills (added_rows above).
		added_rows.append(row)

		if has_kds:
			if validation_mode == "Direct to Kitchen" and not held_until_paid:
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
	# //// Neoffice — saved as the till saves a table's order (pos_next.api.invoices): ERPNext does not price the lines again by its Pricing Rules (it
	# //// would take the price list's price, not the card's, and the till would then apply its offers on top), and a discount the till wrote on its
	# //// own lines is kept (maintenance#2077)
	_without_repricing(invoice_doc)
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
	if has_kds and validation_mode == "Direct to Kitchen" and not held_until_paid:
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
		"status": "awaiting_payment"
		if held_until_paid
		else ("pending_approval" if validation_mode == "Server Approval" else "sent_to_kitchen"),
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

	item_fields = ["name", "item_code", "item_name", "qty", "rate", "amount"]
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
		order_by="idx asc",
	)

	# Get tip item code to exclude from order items display
	tip_item_code = _tip_item(token_doc)

	# //// Neoffice — the order as the guest pays it: a draft with the till's offers written on its lines, in memory (the draft keeps the card's
	# //// prices, maintenance#2077); a submitted invoice is what was paid. Its total is the one the phone charges (_still_owed).
	priced = _write_the_offers(frappe.get_doc("Sales Invoice", invoice_doc.name), tip_item_code) if invoice_doc.docstatus == 0 else invoice_doc
	priced_rows = {row.name: row for row in priced.items}

	# Separate order items from tip items
	order_items = []
	tip_total = 0
	for item in all_items:
		if tip_item_code and item.item_code == tip_item_code:
			tip_total += flt(item.amount)
			continue
		row = priced_rows.get(item.name)
		item["price_list_rate"] = flt(item.rate)
		item["discount_percentage"] = 0
		if row is not None and flt(row.rate) < flt(item.rate):
			item["discount_percentage"] = flt(row.discount_percentage, 1)
			item["rate"] = flt(row.rate)
			item["amount"] = flt(row.amount)
		item.pop("name", None)
		order_items.append(item)

	# « Offert » in the guest's language (the request's): the till's translations are not open to a guest
	for item in order_items:
		if item.get(OFFERED):
			item["offered_label"] = offered_label()

	order_grand_total = flt(priced.grand_total) - tip_total
	tax_amount = flt(priced.total_taxes_and_charges)

	# paid_amount for the guest excludes tips (tips are voluntary extras, not shared debt)
	paid_amount = flt(invoice_doc.paid_amount) if hasattr(invoice_doc, "paid_amount") else 0
	paid_order_amount = paid_amount - tip_total

	return {
		"invoice": invoice_doc.name,
		"items": order_items,
		"grand_total": order_grand_total,
		"net_total": flt(priced.net_total),
		"paid_amount": paid_order_amount,
		"tip_total": tip_total,
		"total_taxes_and_charges": tax_amount,
		"company": invoice_doc.company or "",
		"posting_date": str(invoice_doc.posting_date or invoice_doc.creation),
		# //// Neoffice — who the session is: the customer of the table's order (see _account_of)
		"account": _account_of(token_doc, invoice_doc),
	}


# //// Neoffice — the sign-in of the QR page and of the takeaway page (NeoResto lot 1, Daniel, 02.11.2026; moved onto the frappe fork's engine on 03.11.2026,
# //// neoffice-maintenance#2192): `frappe.passwordless` mails a code and a link to an address and proves it, and the account that comes out of it is a real
# //// one (a Website User, its Customer and its Contact) whose customer is the customer of the table. See pos_next.restaurant.guest_account.
def _guest_page_path(token_doc):
	"""Where the link of the sign-in mail brings the person back to: their table's page, or the takeaway page."""
	return "/pos/order" if token_doc.mode == "takeaway" else f"/pos/guest/{token_doc.token}"


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_guest_code(token, email):
	"""Mail a sign-in code and a link to `email` for this session. The answer is the same whether the address belongs to a customer or not."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	return guest_account.request_code(token_doc, email, _guest_page_path(token_doc))


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
	"""Prove `email` with the code that was mailed to it. An address that has an account is signed in by the engine and its customer is the
	customer of the table; an address that has none, but whose customer the shop or the till already knows, gets its account opened here with
	nothing more to ask; any other is {"status": "needs_registration", "proof"}: the name is asked for and `register_guest_account` ends it."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	address = guest_account.clean_email(email)
	answer = guest_account.check_code(address, code)

	if answer.get("status") == "signed_in":
		user = answer["user"]
		if not guest_account.website_user(user):
			frappe.throw(_("This account cannot be used to order here."), frappe.PermissionError)
		with _as_the_system():
			customer = guest_account.customer_of_user(user, token_doc.pos_profile)
		return _signed_in(token_doc, customer)

	# `address` is the one the code just proved, and the proof was minted for it
	if guest_account.customer_by_email(address):
		guest_account.address_of_proof(answer["proof"])
		with _as_the_system():
			_user, customer = guest_account.open_account(address, None, None, token_doc.pos_profile)
		return _signed_in(token_doc, customer)
	return {"status": "needs_registration", "proof": answer["proof"]}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def register_guest_account(token, proof, customer_name, mobile_no=None):
	"""Open the account of the address a code proved (`proof`, single use: the browser never names the address), sign them in, and make
	their customer the customer of the table."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	name = guest_account.clean_name(customer_name)
	if not name:  # before the proof is spent: a missing name is for the person to fix, with the same code
		frappe.throw(_("Please enter your name."))
	address = guest_account.address_of_proof(proof)
	with _as_the_system():
		_user, customer = guest_account.open_account(address, name, mobile_no, token_doc.pos_profile)
	return _signed_in(token_doc, customer)


# //// Neoffice — the link of the sign-in mail brings the guest back to the page they started from (NeoResto lot 1, Daniel, 03.11.2026: « on commence par lire le QR
# //// que le serveur nous donne et de là on se connecte, comme ça on a la table pour rattacher le compte »). The mail's link signs a customer in on the phone
# //// (the engine's `sign_in_with_link`, in the browser that asked for the code) and redirects to `_guest_page_path`, the table's page. The page asks for
# //// everything else without any session (`credentials: "omit"`), so these two calls are the only ones that carry it: one asks whose session it is, so that
# //// the page can offer « Continue as … », one links that account to the table once the guest has pressed the button. Nothing is linked silently: the
# //// browser may hold the session of somebody who signed in at the shop on a shared phone, and a link to a table is nobody's proof of anything.
@frappe.whitelist(allow_guest=True)
def signed_in_account(token):
	"""The customer's account the browser is signed in with, as `{"account": {"user", "full_name"}}`, or `{"account": None}` for a guest, a member of
	the staff or a disabled account. Nothing but the name of the caller's own account is told."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	return {"account": guest_account.website_user(frappe.session.user)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def claim_signed_in_account(token):
	"""Make the customer of the account this browser is signed in with the customer of the table. A customer's session only; one customer per
	table, never taken over (`guest_account.bind`)."""
	require_neoresto()
	token_doc = _require_valid_token(token)
	_require_accounts_proposed(token_doc)
	user = frappe.session.user
	if not guest_account.website_user(user):
		frappe.throw(_("Sign in to link your account to this table."), frappe.PermissionError)
	with _as_the_system():
		customer = guest_account.customer_of_user(user, token_doc.pos_profile)
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
	# //// Neoffice — what the order still owes, the till's offers taken off as the page shows them (maintenance#2077)
	owed = _still_owed(invoice_doc, _tip_item(token_doc))
	# //// Neoffice — a takeaway order is paid whole, for what the server says it still owes (no split, no tip: the page cannot choose to pay less; #2132)
	if token_doc.mode == "takeaway":
		tip = 0
		amount = owed
	if amount <= 0:
		frappe.throw(_("Payment amount must be greater than zero."))
	# //// Neoffice — a table pays the part of the order it wants, and a tip on top: never a negative tip, never more for the order than it still owes
	# //// (maintenance#1973; what is booked is what the provider settles, but an amount the order cannot take is not sent to be charged)
	if tip < 0 or tip >= amount:
		frappe.throw(_("The tip cannot be negative, nor the whole payment."))
	if flt(amount - tip, 2) > owed + 0.01:
		frappe.throw(_("This payment is more than the order still owes."))

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
				# //// Neoffice — the mode of payment the `payments` app books the settled money under on the order (reconcile_payment_intent)
				"mode_of_payment": _wallee_mode_of_payment(),
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
			f"Error: {e!s}\n{traceback.format_exc()}")
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


def _wallee_mode_of_payment():
	"""The Mode of Payment a guest's card payment is booked under: the one of the enabled Wallee provider's settings."""
	# After the wallee_integration → payments merger (ADR-005) the Wallee Settings singleton became a per-provider DocType (it now carries a
	# `provider` link), so it is looked up by provider instead of get_single_value.
	wallee_provider = _resolve_wallee_provider(required=False)
	wallee_mop = None
	if wallee_provider:
		wallee_mop = frappe.db.get_value("Wallee Settings", {"provider": wallee_provider}, "pos_mode_of_payment")
	# The name of the card Mode of Payment record our (French-language) instances carry: a record name to look up, not a text to translate
	return wallee_mop or "Carte de crédit"


@frappe.whitelist(allow_guest=True)
def confirm_guest_payment(token, amount=None, tip=0):
	"""
	Record on a table's order the payments the provider settled for it, when the guest comes back from the payment page; submit the order once
	it is paid.
	//// Neoffice — the provider's word, never the page's (maintenance#1973): the page sends the amount and the tip it says it paid, and the order was
	//// booked, submitted and its table marked paid on that word, without asking the provider whether anything was charged. `amount` and `tip` are
	//// ignored now: each Payment Intent of the order that the provider settled is booked once, for what it settled (_book_the_payment), and the
	//// answer is {"status": "awaiting_payment"} while the payment the guest came back from is not settled yet (the page asks again for a minute).
	"""
	token_doc = _require_valid_token(token)
	# //// Neoffice — the order may have been settled while the page was away (the server settles a paid web takeaway order itself; neoffice-maintenance#2132):
	# //// the page that comes back is told so, with the number to show at pickup, not "No active order".
	if token_doc.mode == "takeaway" and token_doc.invoice:
		settled = _already_settled_takeaway_order(token_doc.invoice)
		if settled:
			return settled
	invoice_doc = _get_or_create_invoice(token_doc)

	if not invoice_doc:
		frappe.throw(_("No active order found for this session."))

	# //// Neoffice — a web takeaway order is settled by what the payment provider confirmed, never by what the page says it paid (neoffice-maintenance#2132)
	if token_doc.mode == "takeaway":
		return _settle_takeaway_order(invoice_doc)

	tip_item = _tip_item(token_doc)
	intents = _intents_of(invoice_doc.name)
	for intent in intents:
		if intent.status == "succeeded":
			_book_the_payment(token_doc, invoice_doc.name, intent, tip_item)
	frappe.db.commit()

	# The payment the guest came back from is the order's newest: until the provider settles it, nothing is said paid
	if not intents or intents[-1].status in ("requires_action", "processing"):
		return {"status": "awaiting_payment"}
	if intents[-1].status != "succeeded":
		return {"status": "failed"}

	invoice_doc = frappe.get_doc("Sales Invoice", invoice_doc.name)
	submitted = False
	if flt(invoice_doc.grand_total) > 0 and _still_owed(invoice_doc, tip_item) <= 0:
		_submit_the_paid_order(invoice_doc, tip_item)
		submitted = True
		# Table → Paid (guest payment — cashier sees it and decides next step)
		if token_doc.table and frappe.db.exists("Restaurant Table", token_doc.table):
			frappe.db.set_value("Restaurant Table", token_doc.table, "status", "Paid")
		frappe.db.commit()
		frappe.publish_realtime("table_update")

	invoice_doc = frappe.get_doc("Sales Invoice", invoice_doc.name)
	if token_doc.table:
		_publish_to_the_tills("guest_payment_received", token_doc.table, {
			"table": token_doc.table,
			"invoice": invoice_doc.name,
			"paid_amount": flt(invoice_doc.paid_amount),
			"grand_total": flt(invoice_doc.grand_total),
			"submitted": submitted,
		})

	return {
		"status": "success",
		"paid_amount": flt(invoice_doc.paid_amount),
		"grand_total": flt(invoice_doc.grand_total),
		"submitted": submitted,
	}


def _intents_of(invoice_name):
	"""The Payment Intents of an order, oldest first."""
	if not frappe.db.table_exists("Payment Intent"):
		return []
	return frappe.get_all(
		"Payment Intent",
		filters={"reference_doctype": "Sales Invoice", "reference_name": invoice_name},
		fields=["name", "status", "amount", "metadata_json"],
		order_by="creation asc",
	)


def _book_the_payment(token_doc, invoice_name, intent, tip_item):
	"""Book on a table's draft one Payment Intent the provider settled, once: its tip (a line of the tip item and a Restaurant Tip that names the
	intent), then its money (the payment row the `payments` app writes, with the provider's reference: it never writes it twice). The tip is the
	one the intent was created with, never more than the intent settled. A second call books nothing."""
	# One booking of an intent at a time: the page asking again, or a second tab, waits here for the first to commit
	frappe.db.sql("SELECT name FROM `tabPayment Intent` WHERE name=%s FOR UPDATE", intent.name)
	metadata = frappe.parse_json(intent.metadata_json or "{}") or {}
	tip = min(max(flt(metadata.get("tip")), 0), flt(intent.amount) / 100)
	with _as_the_system():
		if tip > 0 and not frappe.db.exists("Restaurant Tip", {"payment_intent": intent.name}):
			invoice_doc = frappe.get_doc("Sales Invoice", invoice_name)
			if tip_item:
				# Cumulate with existing TIP item if present (e.g. previous partial payment had a tip)
				existing_tip = next((row for row in invoice_doc.items if row.item_code == tip_item), None)
				if existing_tip:
					existing_tip.rate = flt(existing_tip.rate) + tip
				else:
					settings = _get_restaurant_settings(token_doc.pos_profile)
					invoice_doc.append("items", {
						"item_code": tip_item,
						"item_name": _("Tip"),
						"qty": 1,
						"rate": tip,
						"income_account": settings.get("tip_account") or None,
						"cost_center": invoice_doc.cost_center,
						"description": _("Gratuity", context="Restaurant tip line"),
					})
				_without_repricing(invoice_doc)
				invoice_doc.flags.ignore_permissions = True
				invoice_doc.flags.ignore_version = True
				invoice_doc.save()
			if frappe.db.exists("DocType", "Restaurant Tip"):
				frappe.get_doc({
					"doctype": "Restaurant Tip",
					"restaurant": _get_restaurant_settings(token_doc.pos_profile).get("name"),
					"tip_date": frappe.utils.today(),
					"sales_invoice": invoice_name,
					"restaurant_table": token_doc.table,
					"server": invoice_doc.owner or "Administrator",
					"amount": tip,
					"payment_method": metadata.get("mode_of_payment") or _wallee_mode_of_payment(),
					"payment_intent": intent.name,
					"status": "Collected",
				}).insert(ignore_permissions=True)

		from payments.api.reconciliation import reconcile_payment_intent

		reconcile_payment_intent(intent.name)


def _submit_the_paid_order(invoice_doc, tip_item):
	"""Submit a guest's order the provider settled in full: the till's offers the page showed written on its lines (maintenance#2077), no payment row
	at zero (the till's default cash row), the payment accounts set as the till sets them."""
	from pos_next.api.invoices import _set_payment_accounts

	with _as_the_system():
		invoice_doc = _write_the_offers(frappe.get_doc("Sales Invoice", invoice_doc.name), tip_item)
		invoice_doc.payments = [p for p in invoice_doc.payments if flt(p.amount) > 0]
		_set_payment_accounts(invoice_doc.payments, invoice_doc.company)
		_without_repricing(invoice_doc)
		invoice_doc.flags.ignore_permissions = True
		invoice_doc.flags.ignore_version = True
		frappe.flags.ignore_account_permission = True
		invoice_doc.save()
		invoice_doc.submit()
	return invoice_doc


# //// Neoffice — the payment of a web takeaway order, and what follows it (neoffice-maintenance#2132).
def _succeeded_intents(invoice_name):
	"""The Payment Intents of the order that the payment provider settled (the `payments` app writes `succeeded` on the provider's word)."""
	if not frappe.db.table_exists("Payment Intent"):
		return []
	return frappe.get_all(
		"Payment Intent",
		filters={"reference_doctype": "Sales Invoice", "reference_name": invoice_name, "status": "succeeded"},
		fields=["name", "amount"],
	)


def _provider_confirmed(invoice_doc):
	"""Whether the provider has settled the whole order: the intents that succeeded hold at least its total, the till's offers taken off as the page
	showed them (they are in minor units)."""
	owed = _write_the_offers(frappe.get_doc("Sales Invoice", invoice_doc.name)).grand_total
	return sum(cint(intent.amount) for intent in _succeeded_intents(invoice_doc.name)) >= round(flt(owed) * 100) > 0


def _already_settled_takeaway_order(invoice_name):
	"""The answer of `confirm_guest_payment` for a web takeaway order that is already submitted and paid (settled by the page's earlier call, or by the server
	while the page was away), or None. Releasing again sends nothing twice: a line already sent is not touched."""
	order = frappe.db.get_value("Sales Invoice", invoice_name, ["docstatus", "paid_amount", "grand_total"], as_dict=True)
	if not order or order.docstatus != 1 or flt(order.paid_amount) < flt(order.grand_total):
		return None
	return {
		"status": "success",
		"paid_amount": flt(order.paid_amount),
		"grand_total": flt(order.grand_total),
		"submitted": True,
		"ticket": _release_paid_takeaway(invoice_name),
	}


def _settle_takeaway_order(invoice_doc):
	"""One settlement of an order at a time: the customer's page asks for it and so does the background job the provider's confirmation starts
	(neoffice-maintenance#2132, 04.11). The second to arrive waits, sees an order already submitted and released, and does nothing twice. The wait
	ends the transaction first: InnoDB reads what it read before the wait, and a stale draft would be submitted a second time."""
	if not _provider_confirmed(invoice_doc):
		return {"status": "awaiting_payment"}
	with filelock(f"settle_takeaway_order_{invoice_doc.name}", timeout=60):
		frappe.db.commit()
		return _settle_the_takeaway_order(frappe.get_doc("Sales Invoice", invoice_doc.name))


def _settle_the_takeaway_order(invoice_doc):
	"""What `confirm_guest_payment` is for a web takeaway order. The page's word is not a payment: the order is paid when the provider settled its
	total, whatever amount the page says. Then the `payments` app's own reconciliation puts the money on the invoice (it does it by itself when the
	intent succeeds; asked again it does nothing twice), the invoice is submitted, and its held lines go to the kitchen. Until then the answer is
	{"status": "awaiting_payment"} and the page asks again."""
	if not _provider_confirmed(invoice_doc):
		return {"status": "awaiting_payment"}

	from payments.api.reconciliation import reconcile_payment_intent

	with _as_the_system():
		for intent in _succeeded_intents(invoice_doc.name):
			reconcile_payment_intent(intent.name)
		invoice_doc = frappe.get_doc("Sales Invoice", invoice_doc.name)
		if invoice_doc.docstatus == 0:
			# //// Neoffice — the order as it was paid: the till's offers the page showed written on its lines (maintenance#2077)
			_write_the_offers(invoice_doc)
			if flt(invoice_doc.paid_amount) < flt(invoice_doc.grand_total):
				frappe.throw(_("The payment of this order is not recorded yet. Please try again."))
			from pos_next.api.invoices import _set_payment_accounts

			_set_payment_accounts(invoice_doc.payments, invoice_doc.company)
			_without_repricing(invoice_doc)
			invoice_doc.flags.ignore_permissions = True
			invoice_doc.flags.ignore_version = True
			frappe.flags.ignore_account_permission = True
			invoice_doc.save()
			invoice_doc.submit()
	frappe.db.commit()

	ticket = _release_paid_takeaway(invoice_doc.name)
	return {
		"status": "success",
		"paid_amount": flt(invoice_doc.paid_amount),
		"grand_total": flt(invoice_doc.grand_total),
		"submitted": True,
		"ticket": ticket,
	}


def _release_paid_takeaway(invoice_name):
	"""Send a paid takeaway order to the kitchen: its held lines become Pending, once, and the kitchen-send listeners are told (cloudprnt prints the
	tickets). A line already sent is not touched, so a second call does nothing. The number the customer shows at pickup, or None."""
	if frappe.db.has_column("Sales Invoice Item", "kds_status"):
		held = frappe.get_all(
			"Sales Invoice Item", filters={"parent": invoice_name, "kds_status": "Waiting"}, fields=["name", "kds_batch"]
		)
		for row in held:
			frappe.db.set_value("Sales Invoice Item", row.name, "kds_status", "Pending", update_modified=False)
		if held:
			frappe.db.commit()
			from pos_next.api.kitchen_events import kitchen_send

			for batch in sorted({cint(row.kds_batch) or 1 for row in held}):
				kitchen_send(invoice_name, batch)
			frappe.publish_realtime("kds_update")
	return frappe.db.get_value("Sales Invoice", invoice_name, "posa_ticket_no") or None


# //// Neoffice — a paid web takeaway order is settled by the server when the provider says so, not only when the customer's page comes back (neoffice-maintenance#2132,
# //// 04.11.2026). Played for real on osiris: the customer paid on the provider's page, the money was booked on the invoice by the `payments` app, and the
# //// order stayed a draft with its lines held, so the kitchen never heard of it, because the page that asks for the settlement (`confirm_guest_payment`) had
# //// not come back (another browser, a closed tab, a phone that lost its session on the way back from the bank's page). A customer who paid must be served.
def _is_a_held_web_takeaway(invoice_name):
	"""A web takeaway order not yet settled: a draft that a takeaway session made. The till's own takeaway sales are not this: nobody is waiting for
	a page to come back for them."""
	return (
		frappe.db.get_value("Sales Invoice", invoice_name, "docstatus") == 0
		and frappe.db.exists("Guest Order Token", {"invoice": invoice_name, "mode": "takeaway"})
	)


def settle_takeaway_on_payment(doc, method=None):
	"""`Payment Intent` on_update: the provider just settled a payment of a web takeaway order (its webhook, or the poll that backs the webhook up), so the
	order is settled in the background, whoever opens the page afterwards. Queued after the commit: the settlement submits an invoice and prints
	tickets, which is not for the transaction of an intent's update."""
	if doc.status != "succeeded" or doc.reference_doctype != "Sales Invoice" or not doc.reference_name:
		return
	if not _is_a_held_web_takeaway(doc.reference_name):
		return
	frappe.enqueue(
		"pos_next.api.guest_ordering.settle_paid_takeaway_order",
		queue="short",
		enqueue_after_commit=True,
		invoice=doc.reference_name,
	)


def settle_paid_takeaway_order(invoice):
	"""The background half of `confirm_guest_payment` for a web takeaway order: what the page asks for, asked by the server. An order the provider has not
	settled in full is left as it is, and one already settled (by the page, or by an earlier run) is not touched. A failure is logged and never raised: the
	next run of `settle_paid_takeaway_orders` tries again."""
	if not _is_a_held_web_takeaway(invoice):
		return
	try:
		_settle_takeaway_order(frappe.get_doc("Sales Invoice", invoice))
	except Exception:
		frappe.db.rollback()
		frappe.log_error("A paid takeaway order could not be settled", f"{invoice}\n{frappe.get_traceback()}")


def settle_paid_takeaway_orders():
	"""Every five minutes: the web takeaway orders the provider has paid and nobody settled (the job was lost to a restart, or the intent was settled by
	a path that fires no event). Two days back, twenty at a time: an order older than that is the restaurant's to look at."""
	if not frappe.db.table_exists("Payment Intent"):
		return
	names = frappe.db.sql_list(
		"""
		select i.name
		from `tabSales Invoice` i
		where i.docstatus = 0
			and i.creation > %s
			and exists (select 1 from `tabGuest Order Token` t where t.invoice = i.name and t.mode = 'takeaway')
			and exists (select 1 from `tabPayment Intent` p where p.reference_doctype = 'Sales Invoice'
				and p.reference_name = i.name and p.status = 'succeeded')
		order by i.creation
		limit 20
		""",
		(add_to_date(now_datetime(), days=-2),),
	)
	for name in names:
		settle_paid_takeaway_order(name)


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
			frappe.log_error("Token expire fallback", f"Token {t_name}: {e!s}")

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


# //// Neoffice — a web takeaway order is rung up on a till of its restaurant (neoffice-maintenance#2132): the oldest enabled one that names the restaurant,
# //// else the first enabled POS Profile (what `submit_takeaway_order` always did).
def _takeaway_pos_profile(restaurant):
	profile = None
	if restaurant:
		profile = frappe.db.get_value(
			"POS Settings", {"enabled": 1, "restaurant": restaurant}, "pos_profile", order_by="creation asc"
		)
	return profile or next(
		iter(frappe.get_all("POS Profile", filters={"disabled": 0}, order_by="creation asc", limit=1, pluck="name")), None
	)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=TAKEAWAY_SESSIONS_PER_VISITOR, seconds=60 * 60)
def create_takeaway_token():
	"""
	Create a Guest Order Token for a takeaway web order (no table binding).
	Called when a visitor starts a takeaway order.
	Rate-limited per visitor (IP): TAKEAWAY_SESSIONS_PER_VISITOR an hour. The count used to be the whole site's (50 an
	hour for every visitor together): one visitor could close takeaway ordering for all (neoffice-maintenance#2220).
	Not behind the guard of NeoResto (mode.require_neoresto): the takeaway page asks for its token on every mount, the
	return from a payment included. The restaurant's own web-takeaway setting closes it.
	"""
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
		# //// Neoffice — the till the order is rung up on: an order needs a POS Profile before it can exist, and a takeaway session had none (#2132)
		"pos_profile": _takeaway_pos_profile(settings.get("name")),
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

	# //// Neoffice — the lines priced by the takeaway card, read on the server, never by the page's `rate` (maintenance#2198); the card's price, the
	# //// till's offers are not written on them (maintenance#2077, see _rate_on_the_menu)
	takeaway_menu = _build_menu_from_card(card_name)["categories"]
	dishes = _dishes_of(takeaway_menu)

	has_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	for item in items:
		item_code = item.get("item_code")
		if not item_code:
			continue
		qty = _quantity_of(item)
		rate = _rate_on_the_menu(item, dishes)

		row = invoice_doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"rate": rate,
		})
		if has_kds:
			row.kds_status = "Pending"

	invoice_doc.flags.ignore_permissions = True
	_without_repricing(invoice_doc)
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
