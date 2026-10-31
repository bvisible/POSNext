# //// Neoffice — added file (no upstream equivalent). The restaurant module's backend, because
# //// upstream POSNext is a retail POS with no table service: floor plan (areas, tables, walls,
# //// doors, background image), table state and its binding to the draft invoice, restaurant
# //// cards / menus with time-based availability, product option groups (modifiers),
# //// preparation stations with the KDS and runner workflow, takeaway, and tips
# //// (458d81a9 2026-03-20 "feat: remove BrainWise branding, add restaurant mode, and code
# //// formatting" — the same commit that removed upstream's `BrainWise Branding` doctype, its
# //// API and its monitor tasks — then ~90 commits to 2026-04-24; c26ac28b 2026-04-24 stops
# //// item creation in the root item group).
import math

import frappe
from frappe import _
from frappe.utils import flt

from pos_next.restaurant import devices, permissions, scope
from pos_next.restaurant import settings as restaurant_config
from pos_next.restaurant.text import plain_text


def get_station_for_item(item_code):
	"""Look up which preparation station an item belongs to."""
	result = frappe.db.get_value(
		"Preparation Station Item",
		{"item": item_code, "parenttype": "Preparation Station"},
		["parent"],
	)
	return result or None


def on_invoice_update(doc, method):
	"""Update table status based on invoice status."""
	if doc.get("restaurant_table"):
		if doc.docstatus == 0:
			frappe.db.set_value("Restaurant Table", doc.restaurant_table, "status", "Occupied")
		elif doc.docstatus == 1:
			frappe.db.set_value("Restaurant Table", doc.restaurant_table, "status", "Cleaning")
		elif doc.docstatus == 2:
			frappe.db.set_value("Restaurant Table", doc.restaurant_table, "status", "Empty")


@frappe.whitelist()
def get_tables(restaurant=None):
	"""Fetch the restaurant's areas, tables, floor plan stations, and active order summaries.

	The restaurant is the one named, else the till's own. Every row says which restaurant it is of, and each
	table the label of its room (`area_name`) beside the room's name.
	"""
	# //// Neoffice — it is called from the till, tips panel and runner screen, run by desk accounts, so a
	# //// desk account is required (cash_entry.require_system_user).
	from pos_next.api.cash_entry import require_system_user

	# Or the kitchen's or the runner's tablet, its own restaurant only (pos_next.restaurant.devices)
	device = devices.screen_device(devices.KITCHEN, devices.RUNNER)
	if device:
		restaurant, _station = devices.cut_to_device(device, restaurant)
	else:
		require_system_user()
	restaurant = restaurant or scope.current_restaurant()
	of_the_restaurant = scope.restaurant_or_filters(restaurant)
	areas = scope.stamp(
		frappe.get_all(
			"Restaurant Area",
			or_filters=of_the_restaurant,
			fields=["name", "area_name", "description", "sort_order", "floor_plan_walls", "floor_plan_bg"],
			order_by="sort_order asc, area_name asc",
		),
		restaurant,
	)
	tables = scope.stamp(
		frappe.get_all(
			"Restaurant Table",
			or_filters=of_the_restaurant,
			fields=["name", "table_name", "area", "capacity", "status", "pos_x", "pos_y", "width", "height", "shape"],
		),
		restaurant,
	)
	area_labels = {area.name: area.area_name for area in areas}
	for table in tables:
		table["area_name"] = area_labels.get(table.area) or table.area

	# Fetch stations that should appear on floor plan
	stations = []
	if frappe.db.has_column("Preparation Station", "show_on_floor_plan"):
		stations = scope.stamp(
			frappe.get_all(
				"Preparation Station",
				filters={"is_active": 1, "show_on_floor_plan": 1},
				or_filters=of_the_restaurant,
				fields=["name", "station_name", "station_type", "color", "area", "pos_x", "pos_y", "width", "height"],
			),
			restaurant,
		)

	# Fetch active order summaries for occupied tables
	occupied_names = [t.name for t in tables if t.status == "Occupied"]
	order_map = {}
	if occupied_names:
		orders = frappe.get_all(
			"Sales Invoice",
			filters={"docstatus": 0, "restaurant_table": ["in", occupied_names]},
			fields=["name", "restaurant_table", "owner", "creation", "kds_status"],
			order_by="modified desc"
		)
		for order in orders:
			tbl = order.restaurant_table
			if tbl in order_map:
				continue
			item_count = frappe.db.count("Sales Invoice Item", {"parent": order.name})
			# Get user initials from full name
			full_name = frappe.db.get_value("User", order.owner, "full_name") or order.owner
			initials = "".join([p[0].upper() for p in full_name.split() if p][:2])
			order_map[tbl] = {
				"item_count": item_count,
				"opened_at": str(order.creation),
				"opened_by": initials,
				"kds_status": order.kds_status or "Pending",
			}

	# Auto-fix orphaned "Occupied" tables with no active draft
	orphaned = [t.name for t in tables if t.status == "Occupied" and t.name not in order_map]
	if orphaned:
		for tname in orphaned:
			frappe.db.set_value("Restaurant Table", tname, "status", "Empty")
		# Refresh table statuses after fix
		for table in tables:
			if table.name in orphaned:
				table["status"] = "Empty"

	for table in tables:
		table["order_summary"] = order_map.get(table.name)

	# Count items waiting to be sent to kitchen per table
	has_item_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	if has_item_kds:
		waiting_counts = frappe.db.sql("""
			SELECT si.restaurant_table, COUNT(*) as waiting_count
			FROM `tabSales Invoice Item` sii
			JOIN `tabSales Invoice` si ON sii.parent = si.name
			WHERE si.docstatus = 0
				AND si.restaurant_table IS NOT NULL
				AND sii.kds_status = 'Waiting'
			GROUP BY si.restaurant_table
		""", as_dict=True)
		waiting_map = {r.restaurant_table: r.waiting_count for r in waiting_counts}
		for table in tables:
			table["waiting_items_count"] = waiting_map.get(table["name"], 0)

	return {"areas": areas, "tables": tables, "stations": stations}

@frappe.whitelist()
def update_table_status(table_name, status):
	"""Update the status of a specific table."""
	# A table's status is the service's: whoever may write a table (a cashier) sets it, from a desk account. It is the
	# right the till is told of (`set_table_status`), so that the till and the server cannot drift apart
	permissions.require_right("set_table_status")

	if not frappe.db.exists("Restaurant Table", table_name):
		frappe.throw(_("Table {0} not found").format(table_name))

	frappe.db.set_value("Restaurant Table", table_name, "status", status)

	# Expire guest order tokens when table is set to Empty
	if status == "Empty":
		from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
		GuestOrderToken.expire_tokens_for_table(table_name)

	frappe.publish_realtime("table_update")
	return {"status": "success"}

@frappe.whitelist()
def get_table_payment_summary(table_name):
	"""Get payment summary for a Paid/Cleaning table (for the server dialog)."""
	# //// Neoffice — its caller is the till (POSSale), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# Priority 1: draft invoice linked directly to the table
	invoice = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": ("in", (0, 1)), "restaurant_table": table_name},
		fields=["name", "grand_total", "paid_amount", "creation"],
		order_by="creation desc",
		limit=1,
	)
	# Priority 2: invoice from guest token (table link on invoice may be NULL)
	if not invoice:
		token_invoice = frappe.db.get_value(
			"Guest Order Token",
			{"table": table_name, "status": ("in", ("Active", "Expired"))},
			"invoice",
			order_by="creation desc",
		)
		if token_invoice and frappe.db.exists("Sales Invoice", token_invoice):
			invoice = [frappe.db.get_value("Sales Invoice", token_invoice,
				["name", "grand_total", "paid_amount", "creation"], as_dict=True)]
	if not invoice:
		return {"invoice": None, "payments": [], "items": [], "grand_total": 0, "paid_amount": 0}

	inv = invoice[0]
	payments = frappe.get_all(
		"Sales Invoice Payment",
		filters={"parent": inv.name},
		fields=["mode_of_payment", "amount", "creation"],
		order_by="idx asc",
	)
	items = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": inv.name},
		fields=["item_name", "qty", "amount"],
	)
	tips = frappe.get_all(
		"Restaurant Tip",
		filters={"sales_invoice": inv.name},
		fields=["amount", "payment_method"],
	)
	tip_total = sum(flt(t.amount) for t in tips)

	return {
		"invoice": inv.name,
		"grand_total": flt(inv.grand_total),
		"paid_amount": flt(inv.paid_amount),
		"payments": payments,
		"items": items,
		"tip_total": tip_total,
		"payment_count": len(payments),
	}


@frappe.whitelist()
def mark_table_available(table_name):
	"""Mark a Cleaning table as Empty and expire its guest tokens."""
	permissions.require_right("set_table_status")

	if not frappe.db.exists("Restaurant Table", table_name):
		frappe.throw(_("Table {0} not found").format(table_name))

	current_status = frappe.db.get_value("Restaurant Table", table_name, "status")
	if current_status not in ("Cleaning", "Paid"):
		# The table is named to the waiter by its label, never by its name
		label = frappe.db.get_value("Restaurant Table", table_name, "table_name") or table_name
		frappe.throw(_("Table {0} is not in Paid or Cleaning status").format(label))

	_put_table_back(table_name)

	frappe.publish_realtime("table_update")
	return {"status": "success"}


def _put_table_back(table_name):
	"""Put a table that has been cleaned back to Empty, ready for the next guests.

	What the floor plan does for one table (`mark_table_available`) and for a whole room (`free_cleaning_tables`): the
	status goes back to Empty, the guest order tokens of the table expire, and the draft invoices that still name it are
	unlinked so that the next order starts fresh. Whoever calls it has checked who may, and tells the other tills.
	"""
	frappe.db.set_value("Restaurant Table", table_name, "status", "Empty")

	# Expire guest order tokens
	from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
	GuestOrderToken.expire_tokens_for_table(table_name)

	# Unlink draft invoices from this table so next order starts fresh
	draft_invoices = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0, "restaurant_table": table_name},
		pluck="name",
	)
	for inv_name in draft_invoices:
		frappe.db.set_value("Sales Invoice", inv_name, "restaurant_table", None, update_modified=False)


@frappe.whitelist()
def free_cleaning_tables(area, restaurant=None):
	"""Free every table of a room that is being cleaned: Cleaning goes back to Empty, in one call for the whole room.

	The « Free the tables being cleaned » item of the floor plan's menu (product owner, 30.10.2026): once the room has been
	cleaned the waiter frees its tables at once, without opening each of them and without a confirmation. Each table is put
	back as `mark_table_available` puts one back; the room's other tables, and every table of another room, are left as they
	are. Answers how many tables were freed and which, so that the till shows them free without asking again.

	The room must be one of the restaurant named, else of the till's own: a room of another restaurant is refused.
	"""
	# The rule of a table's own status change (`update_table_status`, `mark_table_available`), and the right the till shows
	# this item by: whoever may set the status of a table, a cashier included, from a desk account
	permissions.require_right("set_table_status")

	restaurant = restaurant or scope.current_restaurant()
	permissions.require_restaurant(restaurant)
	# A room is named by its name: anything else (a dict from a JSON body, which frappe.db.exists would read as filters)
	# is no room
	if not isinstance(area, str) or not area or not frappe.db.exists("Restaurant Area", area):
		frappe.throw(_("Area not found"))
	if scope.restaurant_of_record("Restaurant Area", area) != restaurant:
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	freed = []
	for table_name in frappe.get_all(
		"Restaurant Table",
		filters={"area": area, "status": "Cleaning"},
		pluck="name",
		order_by="table_name asc",
	):
		# Another till may have seated the table since it was listed: it is freed only if it is still being cleaned
		if frappe.db.get_value("Restaurant Table", table_name, "status", for_update=True) != "Cleaning":
			continue
		_put_table_back(table_name)
		freed.append(table_name)

	if freed:
		frappe.publish_realtime("table_update")
	return {"status": "success", "freed": len(freed), "tables": freed}


@frappe.whitelist()
def reset_all_tables(restaurant=None):
	"""Reset the restaurant's occupied tables to Empty and clear their draft invoices.

	The restaurant is the one named, else the till's own; the other restaurants' tables and orders stay as they are.
	"""
	# It empties the whole floor and unlinks its orders: the floor plan's right, more than a table's status
	permissions.require_right("manage_floor")
	permissions.require("Restaurant Table", "write")

	restaurant = restaurant or scope.current_restaurant()
	tables = frappe.get_all("Restaurant Table", or_filters=scope.restaurant_or_filters(restaurant), pluck="name")
	if tables:
		# Clear restaurant_table and kds_status on the draft invoices linked to the restaurant's tables
		frappe.db.sql("""
			UPDATE `tabSales Invoice`
			SET restaurant_table = NULL, kds_status = NULL
			WHERE docstatus = 0 AND restaurant_table IN %(tables)s
		""", {"tables": tuple(tables)})

		# Reset the restaurant's occupied tables to Empty
		frappe.db.sql(
			"UPDATE `tabRestaurant Table` SET status='Empty' WHERE status='Occupied' AND name IN %(tables)s",
			{"tables": tuple(tables)},
		)
	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("table_update")
	return {"status": "success"}

# The statuses a dish goes through, in the order it goes through them
_KDS_RANK = {"Pending": 0, "Preparing": 1, "Ready": 2, "Delivered": 3}


def _order_status_of(dish_statuses):
	"""The status an order shows when its dishes are at these statuses.

	Delivered when every dish is. Ready when every dish is Ready or Delivered (a dish held back, Waiting, is not
	ready, so the order is not either). Preparing as soon as a dish has been begun. Pending otherwise: a second
	round whose first dishes are delivered and whose new dishes are only sent is Pending.
	"""
	statuses = [status or "" for status in dish_statuses]
	if statuses and all(status == "Delivered" for status in statuses):
		return "Delivered"
	if statuses and all(status in ("Ready", "Delivered") for status in statuses):
		return "Ready"
	if any(status in ("Preparing", "Ready") for status in statuses):
		return "Preparing"
	return "Pending"


def _advance_dishes(invoice_name, status, station=None):
	"""Move the dishes of an invoice (those of one station, when it is named) up to a status, never backward.

	A dish held back (Waiting) is not the cook's to advance: it is left as it is.
	"""
	new_rank = _KDS_RANK.get(status, 0)
	filters = {"parent": invoice_name}
	if station:
		filters["preparation_station"] = station
	for dish in frappe.get_all("Sales Invoice Item", filters=filters, fields=["name", "kds_status"]):
		current_rank = _KDS_RANK.get(dish.kds_status, 0)
		# Skip Waiting items, only advance items forward, never backward
		if dish.kds_status not in ["", "Waiting"] and current_rank < new_rank:
			frappe.db.set_value("Sales Invoice Item", dish.name, "kds_status", status, update_modified=False)


@frappe.whitelist()
def update_kds_status(invoice_name, status, station=None):
	"""Update the KDS status of a sales invoice and of its dishes.

	Without a station, the order takes the status and so does every dish that is not already further along, as
	it always did. With a station (the kitchen screen is opened on one: a tablet at the bar, or the station
	chosen on the screen), only the dishes of that station move, and the order's own status follows its dishes:
	Ready only when every dish is Ready, Delivered when every dish is Delivered, Preparing as soon as one has
	been begun. An order is cooked at several stations: the Bar's "Ready" must not tell the runner that the
	Kitchen's plates are.

	The kitchen's tablet sets one of the kitchen's states (devices.KDS_STATES) on an open order of its restaurant
	(pos_next.restaurant.devices); on a tablet of one station, as on a kitchen screen filtered by station, the order's
	buttons act on the whole order.
	"""
	device = devices.screen_device(devices.KITCHEN)
	if device:
		devices.require_order_of_device(device, invoice_name)
		devices.require_kds_state(status)
	elif not frappe.has_permission("Sales Invoice", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Sales Invoice", invoice_name):
		frappe.throw(_("Invoice {0} not found").format(invoice_name))

	if station and not frappe.db.exists("Preparation Station", station):
		frappe.throw(_("Station {0} not found").format(station))

	has_dish_status = frappe.db.has_column("Sales Invoice Item", "kds_status")
	if station and has_dish_status:
		_advance_dishes(invoice_name, status, station)
		dish_statuses = frappe.get_all(
			"Sales Invoice Item", filters={"parent": invoice_name}, pluck="kds_status"
		)
		frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", _order_status_of(dish_statuses))
	else:
		frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", status)
		# Also update all items that are not already in a later status
		if has_dish_status:
			_advance_dishes(invoice_name, status)

	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("table_update")
	return {"status": "success"}

@frappe.whitelist()
def broadcast_cfd_update(payload):
	"""Broadcasts CFD payload to all clients using Frappe Realtime."""
	# //// Neoffice — nothing in the app calls it; it is one of the till's endpoints, so only the till's users
	# //// pass (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	if isinstance(payload, str):
		import json
		payload = json.loads(payload)
	frappe.publish_realtime("cfd_update", payload)
	return {"status": "success"}

@frappe.whitelist()
def get_preparation_stations(restaurant=None, station=None):
	"""Fetch the active preparation stations of the restaurant (the till's own unless one is named).

	A kitchen screen opened on a station alone (a bookmark made before a site could hold several restaurants) names
	that station: the restaurant is then the station's, as for `get_kds_orders`.
	"""
	# Whoever reads the stations from a desk account (a cashier, a manager), and the restaurant they belong to
	# (per-restaurant user permissions); or the kitchen's tablet, its own restaurant and station only
	# (pos_next.restaurant.devices)
	device = devices.screen_device(devices.KITCHEN)
	if device:
		restaurant, station = devices.cut_to_device(device, restaurant, station)
	else:
		permissions.require("Preparation Station", "read")
	if not restaurant and station:
		restaurant = scope.restaurant_of_record("Preparation Station", station)
	restaurant = restaurant or scope.current_restaurant()
	if not device:
		permissions.require_restaurant(restaurant)
	filters = {"is_active": 1}
	if device and device.station:
		filters["name"] = device.station
	return scope.stamp(
		frappe.get_all(
			"Preparation Station",
			filters=filters,
			or_filters=scope.restaurant_or_filters(restaurant),
			fields=["name", "station_name", "station_type", "color"],
			order_by="station_name",
		),
		restaurant,
	)

@frappe.whitelist()
def get_station_items_map(restaurant=None):
	"""Return a mapping of item_code -> station and item_group -> station for the restaurant's active stations."""
	# The till's service read: whoever reads the stations, from a desk account
	permissions.require("Preparation Station", "read")
	restaurant = restaurant or scope.current_restaurant()
	stations = frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
		or_filters=scope.restaurant_or_filters(restaurant),
		fields=["name", "station_name", "color"]
	)
	items_map = {}
	groups_map = {}

	for station in stations:
		station_info = {
			"station": station.name,
			"station_name": station.station_name,
			"color": station.color
		}

		# Individual items mapping
		items = frappe.get_all(
			"Preparation Station Item",
			filters={"parent": station.name},
			fields=["item"]
		)
		for item in items:
			item_ref = item.item
			items_map[item_ref] = station_info
			item_data = frappe.db.get_value("Item", item_ref, ["name", "item_code", "item_name"], as_dict=True)
			if not item_data:
				item_data = frappe.db.get_value("Item", {"item_name": item_ref}, ["name", "item_code", "item_name"], as_dict=True)
			if item_data:
				items_map[item_data.name] = station_info
				if item_data.item_code:
					items_map[item_data.item_code] = station_info
				if item_data.item_name:
					items_map[item_data.item_name] = station_info

		# Item groups mapping (first station wins if duplicate group)
		groups = frappe.get_all(
			"Preparation Station Item Group",
			filters={"parent": station.name},
			fields=["item_group"]
		)
		for group in groups:
			if group.item_group not in groups_map:
				groups_map[group.item_group] = station_info

	return {"items": items_map, "groups": groups_map}


@frappe.whitelist()
def get_table_order(table_name):
	"""Get the active invoice for a specific table (draft or recently submitted)."""
	# //// Neoffice — its caller is the till (POSSale, useInvoice), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# First try draft
	orders = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 0,
			"restaurant_table": table_name,
		},
		fields=["name", "customer", "restaurant_table", "kds_status", "grand_total", "paid_amount"],
		order_by="modified desc",
		limit=1
	)

	# If no draft, check for recently submitted (e.g. after guest payment)
	if not orders:
		orders = frappe.get_all(
			"Sales Invoice",
			filters={
				"docstatus": 1,
				"restaurant_table": table_name,
			},
			fields=["name", "customer", "restaurant_table", "kds_status", "grand_total", "paid_amount"],
			order_by="modified desc",
			limit=1
		)

	if not orders:
		return None

	order = orders[0]

	# Fetch items
	item_fields = ["item_code", "item_name", "qty", "rate", "amount", "uom", "image"]
	if frappe.db.has_column("Sales Invoice Item", "posa_special_instructions"):
		item_fields.append("posa_special_instructions")
	if frappe.db.has_column("Sales Invoice Item", "preparation_station"):
		item_fields.append("preparation_station")
	if frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers"):
		item_fields.append("posa_item_modifiers")
	if frappe.db.has_column("Sales Invoice Item", "kds_status"):
		item_fields.append("kds_status")

	all_items = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": order.name},
		fields=item_fields
	)

	# Exclude TIP items from order display (the tip item of the till's restaurant)
	tip_item_code = restaurant_config.get_restaurant_settings().get("tip_item")
	tip_total = 0
	order_items = []
	for item in all_items:
		if tip_item_code and item.item_code == tip_item_code:
			tip_total += flt(item.amount)
		else:
			order_items.append(item)
	order["items"] = order_items
	order["tip_total"] = tip_total
	# Tip is a voluntary extra — never counted as payment toward the order
	order["paid_amount"] = flt(order.get("paid_amount", 0)) - tip_total

	# Enrich items with image from Item master
	item_codes = list({i.item_code for i in order["items"] if i.get("item_code")})
	if item_codes:
		images = {r.name: r.image for r in frappe.get_all(
			"Item", filters={"name": ["in", item_codes]}, fields=["name", "image"]
		)}
		for item in order["items"]:
			item["image"] = images.get(item.item_code) or ""

	return order

@frappe.whitelist()
def get_kds_orders(station=None, restaurant=None):
	"""Fetch the pending and preparing orders of one restaurant for the KDS.

	The restaurant is the one named, else the one of the station asked for (a kitchen screen opened on a station has
	no till of its own), else the till's. Each order says the label of its table (`table_display_name`) and
	the room of that table (`area`, "" for a takeaway order), and each line the label of its station
	(`station_name`).
	"""
	# //// Neoffice — it is called from the kitchen display and floor plan, run by desk accounts, so a desk
	# //// account is required (cash_entry.require_system_user).
	from pos_next.api.cash_entry import require_system_user

	# Or the kitchen's tablet: the orders of its restaurant, at its station (pos_next.restaurant.devices)
	device = devices.screen_device(devices.KITCHEN)
	if device:
		restaurant, station = devices.cut_to_device(device, restaurant, station)
	else:
		require_system_user()
	if not restaurant and station:
		restaurant = scope.restaurant_of_record("Preparation Station", station)
	restaurant = restaurant or scope.current_restaurant()
	# Only fetch submitted invoices or drafts depending on how POS Next saves KDS orders.
	# Assuming here we fetch draft invoices that have a table and are not delivered.
	# We remove the database-level filter on restaurant_table to prevent MariaDB NULL issues
	# We also remove the kds_status filter from SQL because if the user did not run bench migrate,
	# the column might be completely missing and throw an error, or if it was added but has no default
	# value it might fail. We handle the filtering safely in Python.
	raw_orders = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 0, # Drafts
		},
		fields=["name", "customer", "restaurant_table", "kds_status", "creation", "modified",
				"is_takeaway", "takeaway_number", "pos_profile"]
	)

	# Filter purely in Python - include orders with table OR takeaway orders, of this restaurant
	orders = [o for o in raw_orders if o.get("restaurant_table") or o.get("is_takeaway")]
	orders = scope.keep_orders_of(orders, restaurant)
	table_names = {o.get("restaurant_table") for o in orders if o.get("restaurant_table")}
	tables = {}
	if table_names:
		tables = {
			table.name: table
			for table in frappe.get_all(
				"Restaurant Table",
				filters={"name": ["in", list(table_names)]},
				fields=["name", "table_name", "area"],
			)
		}
	for order in orders:
		table = tables.get(order.get("restaurant_table")) or {}
		order["table_display_name"] = table.get("table_name") or order.get("restaurant_table")
		# The room of the table (the link, as the runner's orders carry it in `area`): the kitchen screen
		# filters its tickets by room as the runner does. A takeaway order sits at no table, so it is of no
		# room (""), and the screen shows it under "all rooms" only.
		order["area"] = table.get("area") or ""

	# Fallback safety: Check if the custom field actually exists in the DB to prevent 500 errors
	# if the user hasn't run `bench migrate` yet.
	has_instructions_field = frappe.db.has_column("Sales Invoice Item", "posa_special_instructions")
	has_kds_status_field = frappe.db.has_column("Sales Invoice Item", "kds_status")
	item_fields = ["item_code", "item_name", "qty", "description", "preparation_station"]

	if has_instructions_field:
		item_fields.append("posa_special_instructions")

	if has_kds_status_field:
		item_fields.append("kds_status")

	if frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers"):
		item_fields.append("posa_item_modifiers")

	if frappe.db.has_column("Sales Invoice Item", "kds_batch"):
		item_fields.append("kds_batch")

	# Build station maps for resolving items without explicit preparation_station
	_station_map = {}
	_group_station_map = {}
	_all_stations = frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
		or_filters=scope.restaurant_or_filters(restaurant),
		fields=["name", "station_name", "color"],
	)
	_station_labels = {_st.name: _st.station_name for _st in _all_stations}
	for _st in _all_stations:
		_st_items = frappe.get_all("Preparation Station Item", filters={"parent": _st.name}, fields=["item"])
		for _si in _st_items:
			_station_map[_si.item] = _st.name
		_st_groups = frappe.get_all("Preparation Station Item Group", filters={"parent": _st.name}, fields=["item_group"])
		for _sg in _st_groups:
			if _sg.item_group not in _group_station_map:
				_group_station_map[_sg.item_group] = _st.name

	for order in orders:
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order.name},
			fields=item_fields
		)

		# Resolve and persist preparation_station for items that don't have one
		for item in items:
			if not item.get("preparation_station"):
				resolved_station = None
				if item.item_code in _station_map:
					resolved_station = _station_map[item.item_code]
				else:
					item_group = frappe.db.get_value("Item", item.item_code, "item_group")
					if item_group and item_group in _group_station_map:
						resolved_station = _group_station_map[item_group]
				if resolved_station:
					item["preparation_station"] = resolved_station
					# Persist to DB so counts and filters work everywhere
					frappe.db.set_value("Sales Invoice Item", item.name, "preparation_station", resolved_station, update_modified=False)

		# The label of each line's station, beside its name
		_unknown = {i.get("preparation_station") for i in items} - set(_station_labels) - {None, ""}
		_station_labels.update(scope.labels_of("Preparation Station", "station_name", _unknown))
		for item in items:
			if item.get("preparation_station"):
				item["station_name"] = _station_labels.get(item.preparation_station) or item.preparation_station

		# Filter by station if specified
		if station:
			items = [i for i in items if i.get("preparation_station") == station]

		order["items"] = items

	# Remove orders with no items after station filtering
	if station:
		orders = [o for o in orders if o.get("items")]

	# Remove orders where ALL items are Delivered (nothing left to prepare)
	# Also remove orders where ALL items are Waiting (no active items yet)
	if has_kds_status_field:
		filtered = []
		for order in orders:
			items = order.get("items", [])
			has_active = any(i.get("kds_status") not in ["Delivered", "Waiting", ""] for i in items)
			if has_active or not items:
				filtered.append(order)
			# Mark complete if all items are Ready or Delivered
			all_ready = all(i.get("kds_status") in ["Ready", "Delivered"] for i in items)
			if all_ready and items:
				order["order_complete"] = True
		orders = filtered

	return orders


@frappe.whitelist()
def get_tips(from_date=None, to_date=None, server=None, table=None, restaurant=None):
	"""Fetch the Restaurant Tip records of one restaurant (the till's own unless one is named), with optional filters."""
	# //// Neoffice — its caller is the till (TipsPanel), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may read the tips (the till's `view_tips`)
	permissions.require_right("view_tips")
	restaurant = restaurant or scope.current_restaurant()
	permissions.require_restaurant(restaurant)
	filters = {}
	if from_date:
		filters["tip_date"] = (">=", from_date)
	if to_date:
		if "tip_date" in filters:
			filters["tip_date"] = ("between", [from_date, to_date])
		else:
			filters["tip_date"] = ("<=", to_date)
	if server:
		filters["server"] = server
	if table:
		filters["restaurant_table"] = table

	tips = frappe.get_all(
		"Restaurant Tip",
		filters=filters,
		or_filters=scope.restaurant_or_filters(restaurant),
		fields=["name", "tip_date", "sales_invoice", "restaurant_table",
				"server", "amount", "payment_method", "status", "creation"],
		order_by="creation desc",
		limit=200,
	)
	scope.stamp(tips, restaurant)

	# Enrich with server full names and table display names
	for tip in tips:
		if tip.server:
			tip["server_name"] = frappe.db.get_value("User", tip.server, "full_name") or tip.server
		if tip.restaurant_table:
			tip["table_name"] = frappe.db.get_value("Restaurant Table", tip.restaurant_table, "table_name") or tip.restaurant_table

	total = sum(flt(t.amount) for t in tips)

	return {"tips": tips, "total": total, "count": len(tips)}


@frappe.whitelist()
def update_item_kds_status(invoice_name, item_code, status):
	"""Update the KDS status of a specific item in a sales invoice.

	The kitchen's tablet sets one of the kitchen's states (devices.KDS_STATES) on an open order of its restaurant, and a
	tablet of one station on the lines of its station only (pos_next.restaurant.devices).
	"""
	device = devices.screen_device(devices.KITCHEN)
	if device:
		devices.require_order_of_device(device, invoice_name)
		devices.require_kds_state(status)
	elif not frappe.has_permission("Sales Invoice", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	filters = {"parent": invoice_name, "item_code": item_code}
	if device and device.station:
		filters["preparation_station"] = device.station
	items = frappe.get_all(
		"Sales Invoice Item",
		filters=filters,
		fields=["name"]
	)
	if device and not items:
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	for item in items:
		frappe.db.set_value("Sales Invoice Item", item.name, "kds_status", status)

	# Check if all items are ready/delivered — update parent status
	all_items = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": invoice_name},
		fields=["kds_status"]
	)
	all_ready = all(i.get("kds_status") in ["Ready", "Delivered"] for i in all_items)
	if all_ready:
		frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", "Ready")

	frappe.publish_realtime("kds_update")
	return {"status": "success"}

@frappe.whitelist()
def save_table_positions(positions):
	"""Save table positions from the floor plan editor."""
	import json

	# Moving tables is laying out the floor: a cashier writes a table's status, never its place
	permissions.require_right("manage_floor")
	permissions.require("Restaurant Table", "write")
	if isinstance(positions, str):
		positions = json.loads(positions)

	if not isinstance(positions, list):
		frappe.throw(_("Invalid positions data"))

	for pos in positions:
		table_name = pos.get("name")
		if not table_name or not frappe.db.exists("Restaurant Table", table_name):
			continue
		frappe.db.set_value("Restaurant Table", table_name, {
			"pos_x": int(pos.get("pos_x") or 0),
			"pos_y": int(pos.get("pos_y") or 0),
			"width": int(pos.get("width") or 100),
			"height": int(pos.get("height") or 100),
		})

	frappe.db.commit()
	return {"status": "success"}

@frappe.whitelist()
def save_station_positions(positions):
	"""Save station positions from the floor plan editor."""
	import json

	permissions.require("Preparation Station", "write")
	if isinstance(positions, str):
		positions = json.loads(positions)

	if not isinstance(positions, list):
		frappe.throw(_("Invalid positions data"))

	for pos in positions:
		station_name = pos.get("name")
		if not station_name or not frappe.db.exists("Preparation Station", station_name):
			continue
		frappe.db.set_value("Preparation Station", station_name, {
			"pos_x": int(pos.get("pos_x") or 0),
			"pos_y": int(pos.get("pos_y") or 0),
			"width": int(pos.get("width") or 120),
			"height": int(pos.get("height") or 60),
		})

	frappe.db.commit()
	return {"status": "success"}

@frappe.whitelist()
def save_floor_plan_walls(area, walls_data):
	"""Save floor plan wall/door/window data for a restaurant area."""
	import json

	permissions.require("Restaurant Area", "write", area)
	if not frappe.db.exists("Restaurant Area", area):
		frappe.throw(_("Area not found"))
	if isinstance(walls_data, str):
		walls_data = json.loads(walls_data)
	frappe.db.set_value("Restaurant Area", area, "floor_plan_walls", json.dumps(walls_data))
	frappe.db.commit()
	return {"status": "success"}

@frappe.whitelist()
def save_floor_plan_bg(area, file_url=None):
	"""Save or clear the floor plan background image for a restaurant area."""
	permissions.require("Restaurant Area", "write", area)
	if not frappe.db.exists("Restaurant Area", area):
		frappe.throw(_("Area not found"))
	frappe.db.set_value("Restaurant Area", area, "floor_plan_bg", file_url or "")
	frappe.db.commit()
	return {"status": "success"}

def _seats(capacity):
	"""The seats of a table as a whole number of at least 1; anything else is refused.

	A table used to take what it was given: a number of seats below 1 was stored, and one that was no number at all
	became 0 (`cint`) or failed on a bare `int()`.
	"""
	seats = None
	# A boolean is a number to Python and not to the person who typed it
	if not isinstance(capacity, bool):
		try:
			seats = float(capacity)
		except (TypeError, ValueError, OverflowError):
			pass
	if seats is None or not math.isfinite(seats) or seats < 1 or seats != int(seats):
		frappe.throw(_("Capacity must be a whole number of at least 1"))
	return int(seats)


@frappe.whitelist()
def create_table(table_name, area, capacity=4, shape="Square", pos_x=0, pos_y=0):
	"""Create a new restaurant table, in the restaurant of its room."""
	permissions.require("Restaurant Table", "create")

	doc = frappe.get_doc({
		"doctype": "Restaurant Table",
		"table_name": table_name,
		"area": area,
		"capacity": _seats(capacity),
		"shape": shape,
		"pos_x": int(pos_x),
		"pos_y": int(pos_y),
		"width": 100,
		"height": 100,
		"status": "Empty"
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def update_table(name, table_name=None, capacity=None, shape=None):
	"""Edit a restaurant table in place: its label, its seats or its shape. What is not passed stays as it is.

	The table is the same record afterwards (the orders, the reservations and the guest tokens link to it by name), and
	its label only has to be unique within its restaurant: the doctype checks it, as it does on every save. Answers the
	table as the floor plan reads it.
	"""
	# Laying out the floor is for whoever may manage it: a cashier writes a table's status, never its label or its seats
	permissions.require_right("manage_floor")
	permissions.require("Restaurant Table", "write", name)
	if not frappe.db.exists("Restaurant Table", name):
		frappe.throw(_("Table {0} not found").format(name))

	doc = frappe.get_doc("Restaurant Table", name)
	if table_name is not None:
		doc.table_name = table_name
	# The dialog's empty field arrives as an empty string: no number is no change
	if capacity not in (None, ""):
		doc.capacity = _seats(capacity)
	if shape:
		doc.shape = shape
	doc.save()
	return {
		"name": doc.name,
		"table_name": doc.table_name,
		"area": doc.area,
		"area_name": frappe.db.get_value("Restaurant Area", doc.area, "area_name") or doc.area,
		"restaurant": doc.restaurant,
		"capacity": doc.capacity,
		"status": doc.status,
		"pos_x": doc.pos_x,
		"pos_y": doc.pos_y,
		"width": doc.width,
		"height": doc.height,
		"shape": doc.shape,
	}


@frappe.whitelist()
def delete_table(name):
	"""Delete a restaurant table if it has no active orders."""
	# //// Neoffice — its caller is the till (FloorPlanEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may delete a table (the floor plan's managers, not a cashier), deleted as that user
	permissions.require("Restaurant Table", "delete", name)
	table = frappe.get_doc("Restaurant Table", name)
	if table.status == "Occupied":
		frappe.throw(_("Cannot delete an occupied table. Clear the order first."))
	frappe.delete_doc("Restaurant Table", name)
	return {"status": "success"}


@frappe.whitelist()
def create_station(station_name, station_type="Kitchen", color="#F97316", area=None, pos_x=0, pos_y=0, restaurant=None):
	"""Create a new preparation station, in the restaurant named, else the one of its room, else the till's."""
	permissions.require("Preparation Station", "create")

	if not restaurant and area:
		restaurant = scope.restaurant_of_record("Restaurant Area", area)
	doc = frappe.get_doc({
		"doctype": "Preparation Station",
		"restaurant": restaurant or scope.current_restaurant(),
		"station_name": station_name,
		"station_type": station_type,
		"color": color,
		"is_active": 1,
		"show_on_floor_plan": 1,
		"area": area,
		"pos_x": int(pos_x),
		"pos_y": int(pos_y),
		"width": 120,
		"height": 60,
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def get_station_details(name):
	"""Get full preparation station details including items and item groups."""
	permissions.require("Preparation Station", "read", name)
	doc = frappe.get_doc("Preparation Station", name)
	return {
		"name": doc.name,
		"station_name": doc.station_name,
		"station_type": doc.station_type,
		"color": doc.color,
		"is_active": doc.is_active,
		"workflow": doc.workflow or "",
		"use_runner": doc.use_runner,
		"items": [
			{
				"item": r.item,
				"item_name": r.item_name,
				"prep_time": r.prep_time or 0,
				"priority": r.priority or "Normal",
				# The workflow the dish has of its own, set in the desk (none: it follows its station's). The till
				# sends the rows back as it got them, so the workflow has to travel with them
				"workflow": r.workflow or "",
			}
			for r in doc.get("items", [])
		],
		"item_groups": [
			{"item_group": r.item_group, "prep_time": r.prep_time or 0, "priority": r.priority or "Normal"}
			for r in doc.get("item_groups", [])
		],
	}


@frappe.whitelist()
def update_station(name, station_name=None, station_type=None, color=None, workflow=None,
                   is_active=None, use_runner=None, items=None, item_groups=None):
	"""Update an existing preparation station."""
	# //// Neoffice — its caller is the till (FloorPlanEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may write a station (not a cashier), saved as that user
	permissions.require("Preparation Station", "write", name)
	import json
	from frappe.utils import cint

	doc = frappe.get_doc("Preparation Station", name)
	if station_name is not None:
		doc.station_name = station_name
	if station_type is not None:
		doc.station_type = station_type
	if color is not None:
		doc.color = color
	if workflow is not None and hasattr(doc, "workflow"):
		doc.workflow = workflow or None
	if is_active is not None:
		doc.is_active = cint(is_active)
	if use_runner is not None and hasattr(doc, "use_runner"):
		doc.use_runner = cint(use_runner)

	# Update items child table
	if items is not None:
		if isinstance(items, str):
			items = json.loads(items)
		# The rows are written again, so each dish's own workflow is carried over: the one its row names (an empty
		# one clears it), else the one the dish has now (a caller that does not know about workflows leaves them)
		workflows = {existing.item: existing.workflow for existing in doc.get("items", [])}
		doc.items = []
		for row in items:
			item_workflow = row["workflow"] if "workflow" in row else workflows.get(row.get("item"))
			doc.append("items", {
				"item": row.get("item"),
				"prep_time": cint(row.get("prep_time", 0)),
				"priority": row.get("priority", "Normal"),
				"workflow": item_workflow or None,
			})

	# Update item_groups child table
	if item_groups is not None:
		if isinstance(item_groups, str):
			item_groups = json.loads(item_groups)
		doc.item_groups = []
		for row in item_groups:
			doc.append("item_groups", {
				"item_group": row.get("item_group"),
				"prep_time": cint(row.get("prep_time", 0)),
				"priority": row.get("priority", "Normal"),
			})

	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def delete_station(name):
	"""Delete a preparation station."""
	# //// Neoffice — its caller is the till (FloorPlanEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may delete a station (not a cashier), deleted as that user
	permissions.require("Preparation Station", "delete", name)
	frappe.delete_doc("Preparation Station", name)
	return {"status": "success"}


@frappe.whitelist()
def open_table(table_name, pos_profile, customer=None):
	"""Open a table by creating a draft Sales Invoice linked to it.
	Returns the existing draft if one already exists for this table.
	"""
	# The till named is one the caller works at (lot 0's rule for a till's endpoint), and he makes invoices there
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	if not frappe.has_permission("Sales Invoice", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Restaurant Table", table_name):
		frappe.throw(_("Table {0} not found").format(table_name))

	# Check for existing draft first
	existing = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0, "restaurant_table": table_name},
		fields=["name", "customer", "kds_status", "paid_amount"],
		order_by="modified desc",
		limit=1
	)
	if existing:
		# Draft already exists — return it
		order = existing[0]
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order.name},
			fields=["item_code", "item_name", "qty", "rate", "uom",
				"posa_special_instructions", "preparation_station",
				"posa_item_modifiers", "kds_status"]
		)

		# Exclude TIP items (same filter as get_table_order), the tip item being the profile's restaurant's
		tip_item_code = restaurant_config.get_restaurant_settings_for_profile(pos_profile).get("tip_item")
		tip_total = 0
		order_items = []
		for item in items:
			if tip_item_code and item.item_code == tip_item_code:
				tip_total += flt(item.rate) * flt(item.qty)
			else:
				order_items.append(item)

		# Enrich with images
		for item in order_items:
			item["image"] = frappe.db.get_value("Item", item.item_code, "image") or ""

		return {
			"name": order.name,
			"items": order_items,
			"customer": order.customer,
			"kds_status": order.kds_status,
			"paid_amount": flt(order.paid_amount) - tip_total,
			"tip_total": tip_total,
			"is_new": False,
		}

	# No existing draft — return empty result, the draft will be created when the cashier first validates the order
	# Table is NOT marked Occupied until an invoice exists (prevents orphaned tables)
	return {
		"name": None,
		"items": [],
		"customer": None,
		"kds_status": None,
		"is_new": True,
	}


@frappe.whitelist()
def save_product_option_group(name, group_name=None, selection_type=None, required=None, options=None, applicable_items=None, applicable_item_groups=None):
	"""Save a product option group."""
	# //// Neoffice — its caller is the till (ProductOptionsEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	import json

	doctype, option_dt, item_dt = _resolve_option_doctypes()
	# And whoever may write an option group (not a cashier), saved as that user
	permissions.require(doctype, "write", name)
	if isinstance(options, str):
		options = json.loads(options)
	if isinstance(applicable_items, str):
		applicable_items = json.loads(applicable_items)
	if isinstance(applicable_item_groups, str):
		applicable_item_groups = json.loads(applicable_item_groups)

	doc = frappe.get_doc(doctype, name)
	if group_name is not None:
		doc.group_name = group_name
	if selection_type is not None:
		doc.selection_type = selection_type
	if required is not None:
		doc.required = int(required)
	if options is not None:
		doc.options = []
		for o in options:
			if o.get("option_name"):
				doc.append("options", {
					"option_name": o["option_name"],
					"price_adjustment": o.get("price_adjustment") or 0,
					"quantity_value": o.get("quantity_value") or 0,
					"is_default": o.get("is_default") or 0,
				})
	if applicable_items is not None and hasattr(doc, "applicable_items"):
		doc.applicable_items = []
		for item_code in applicable_items:
			doc.append("applicable_items", {"item": item_code})
	if applicable_item_groups is not None and hasattr(doc, "applicable_item_groups"):
		doc.applicable_item_groups = []
		for ig in applicable_item_groups:
			doc.append("applicable_item_groups", {"item_group": ig})
	doc.save()
	return {"status": "success"}


@frappe.whitelist()
def create_product_option_group(group_name):
	"""Create a new product option group."""
	# //// Neoffice — its caller is the till (ProductOptionsEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	doctype = _resolve_option_doctypes()[0]
	# And whoever may create an option group (not a cashier), made as that user
	permissions.require(doctype, "create")
	doc = frappe.get_doc({
		"doctype": doctype,
		"group_name": group_name,
		"selection_type": "Single",
		"required": 0,
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def delete_product_option_group(name):
	"""Delete a product option group."""
	# //// Neoffice — its caller is the till (ProductOptionsEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	doctype = _resolve_option_doctypes()[0]
	# And whoever may delete an option group (not a cashier), deleted as that user
	permissions.require(doctype, "delete", name)
	frappe.delete_doc(doctype, name)
	return {"status": "success"}


@frappe.whitelist()
def search_items_for_options(query=""):
	"""Search items by name or code for product option group assignment."""
	# The option groups editor's: whoever manages the option groups (it lists every item of the catalogue)
	permissions.require_right("manage_options")
	if not query or len(query) < 2:
		return []
	q = f"%{query}%"
	return frappe.db.sql("""
		SELECT name, item_name
		FROM `tabItem`
		WHERE (item_name LIKE %(q)s OR name LIKE %(q)s)
		ORDER BY item_name ASC
		LIMIT 10
	""", {"q": q}, as_dict=True)


def _resolve_option_doctypes():
	"""Detect whether to use new (Product Option) or old (Item Modifier) DocType names."""
	try:
		frappe.get_all("Product Option Group", limit=0)
		return "Product Option Group", "Product Option", "Product Option Group Item"
	except Exception:
		return "Item Modifier Group", "Item Modifier Option", "Item Modifier Group Item"


@frappe.whitelist()
def get_product_options(item_code):
	"""Get all product option groups applicable to an item."""
	doctype, option_dt, item_dt = _resolve_option_doctypes()
	permissions.require(doctype, "read")
	item_group_dt = "Product Option Group Item Group"

	fields = ["name", "group_name", "selection_type", "required", "max_selections"]
	if frappe.db.has_column(doctype, "apply_to_all_items"):
		fields.append("apply_to_all_items")

	all_groups = frappe.get_all(doctype, fields=fields)

	result = []
	for group in all_groups:
		applicable = group.get("apply_to_all_items")
		if not applicable:
			# Check by item group
			if frappe.db.exists("DocType", item_group_dt):
				item_group = frappe.db.get_value("Item", item_code, "item_group")
				if item_group:
					applicable = frappe.db.exists(item_group_dt, {"parent": group.name, "item_group": item_group})
			# Check by individual item
			if not applicable:
				applicable = frappe.db.exists(item_dt, {"parent": group.name, "item": item_code})

		if applicable:
			options = frappe.get_all(
				option_dt,
				filters={"parent": group.name},
				fields=["option_name", "price_adjustment", "is_default"],
				order_by="idx"
			)
			group["options"] = options
			result.append(group)

	return result

# Backward compatibility
get_item_modifiers = get_product_options

@frappe.whitelist()
def get_all_product_option_groups():
	"""Get all product option groups with their options and applicable items for frontend caching."""
	doctype, option_dt, item_dt = _resolve_option_doctypes()
	permissions.require(doctype, "read")

	fields = ["name", "group_name", "selection_type", "required", "max_selections"]
	if frappe.db.has_column(doctype, "apply_to_all_items"):
		fields.append("apply_to_all_items")

	groups = frappe.get_all(doctype, fields=fields)

	for group in groups:
		option_fields = ["option_name", "price_adjustment", "is_default"]
		if frappe.db.has_column(option_dt, "quantity_value"):
			option_fields.append("quantity_value")
		group["options"] = frappe.get_all(
			option_dt,
			filters={"parent": group.name},
			fields=option_fields,
			order_by="idx"
		)
		if not group.get("apply_to_all_items"):
			group["applicable_items"] = [
				r.item for r in frappe.get_all(
					item_dt, filters={"parent": group.name}, fields=["item"]
				)
			]
		else:
			group["applicable_items"] = []

		# Fetch applicable item groups
		group["applicable_item_groups"] = []
		if frappe.db.exists("DocType", "Product Option Group Item Group"):
			group["applicable_item_groups"] = [
				r.item_group for r in frappe.get_all(
					"Product Option Group Item Group",
					filters={"parent": group.name},
					fields=["item_group"]
				)
			]

	return groups

# Backward compatibility
get_all_modifier_groups = get_all_product_option_groups


@frappe.whitelist()
def reorder_areas(order):
	"""Update area sort order."""
	import json
	permissions.require("Restaurant Area", "write")
	if isinstance(order, str):
		order = json.loads(order)

	for idx, area_name in enumerate(order):
		if frappe.db.exists("Restaurant Area", area_name):
			frappe.db.set_value("Restaurant Area", area_name, "sort_order", idx)

	frappe.db.commit()
	return {"status": "success"}

@frappe.whitelist()
def create_area(area_name, restaurant=None):
	"""Create a new restaurant area, in the restaurant named (the till's own by default)."""
	permissions.require("Restaurant Area", "create")
	doc = frappe.get_doc({
		"doctype": "Restaurant Area",
		"restaurant": restaurant or scope.current_restaurant(),
		"area_name": area_name,
	})
	doc.insert()
	return doc.as_dict()

@frappe.whitelist()
def rename_area(name, new_name):
	"""Rename a restaurant area: change its label. Its name stays what it is, which is what the records link to."""
	permissions.require("Restaurant Area", "write", name)
	doc = frappe.get_doc("Restaurant Area", name)
	doc.area_name = new_name
	doc.save()
	return {"status": "success"}

@frappe.whitelist()
def delete_area(name):
	"""Delete a restaurant area (only if no tables/stations assigned)."""
	permissions.require("Restaurant Area", "delete", name)

	tables_count = frappe.db.count("Restaurant Table", {"area": name})
	if tables_count > 0:
		frappe.throw(_("Cannot delete area with {0} tables assigned").format(tables_count))

	frappe.delete_doc("Restaurant Area", name)
	return {"status": "success"}


@frappe.whitelist()
def get_restaurant_cards(restaurant=None, selectable_only=0):
	"""The cards of one restaurant (the till's own unless one is named), as the card editor and the settings lists them.

	Every card of the restaurant, the inactive ones and the permanent card included. With `selectable_only`, the
	active cards that are not the permanent one: what a menu or a takeaway lane can be set to. A card that names no
	restaurant is the default restaurant's, like everywhere else (`scope.restaurant_or_filters`).
	"""
	from frappe.utils import cint

	# Whoever reads the cards (a cashier, a manager), from a desk account
	permissions.require("Restaurant Card", "read")
	restaurant = restaurant or scope.current_restaurant()
	return scope.stamp(
		frappe.get_list(
			"Restaurant Card",
			filters={"is_active": 1, "is_permanent": 0} if cint(selectable_only) else {},
			or_filters=scope.restaurant_or_filters(restaurant),
			fields=["name", "card_name", "is_active", "is_permanent"],
			order_by="is_active desc, card_name asc",
			limit_page_length=0,
		),
		restaurant,
	)


# The length of the card name field, which is also the name of the card
CARD_NAME_LENGTH = 140


def _free_card_name(base, restaurant):
	"""The first free name for a new card of a restaurant: `base`, else `base - <restaurant>`, else that and a number.

	A card is named by its card name, which is unique on the whole site: what one restaurant took is not free for
	another.
	"""
	label = frappe.db.get_value("Restaurant", restaurant, "restaurant_name") if restaurant else None
	stems = [base] + ([f"{base} - {label}"] if label else [])
	for stem in stems:
		if not frappe.db.exists("Restaurant Card", stem[:CARD_NAME_LENGTH]):
			return stem[:CARD_NAME_LENGTH]
	number = 2
	while True:
		suffix = f" {number}"
		name = stems[-1][: CARD_NAME_LENGTH - len(suffix)] + suffix
		if not frappe.db.exists("Restaurant Card", name):
			return name
		number += 1


@frappe.whitelist()
def get_or_create_permanent_card(restaurant=None):
	"""The card of the permanent items of a restaurant (the till's own unless one is named), made when it has none.

	Every restaurant has its own, and its name is free: "Permanent items", else "Permanent items - <restaurant>"
	when another restaurant already took the first (see `_free_card_name`). Asked again, it answers the same card.
	Whoever reads the cards gets it; only whoever may create a card makes it.
	"""
	permissions.require("Restaurant Card", "read")
	restaurant = restaurant or scope.current_restaurant()
	existing = frappe.get_all(
		"Restaurant Card",
		filters={"is_permanent": 1},
		or_filters=scope.restaurant_or_filters(restaurant),
		pluck="name",
		order_by="creation asc",
		limit=1,
	)
	if existing:
		return {"name": existing[0], "created": False}
	# Inserted as the user: whoever may not create a card cannot make this one either
	permissions.require("Restaurant Card", "create")
	doc = frappe.get_doc(
		{
			"doctype": "Restaurant Card",
			"restaurant": restaurant,
			"card_name": _free_card_name(_("Permanent items"), restaurant),
			"is_active": 1,
			"is_permanent": 1,
		}
	)
	doc.insert()
	return {"name": doc.name, "created": True}


@frappe.whitelist()
def get_active_cards(restaurant=None):
	"""Fetch the active cards of one restaurant, filtered by date and current time slot assignment.
	The restaurant is the one named, else the till's own: its cards, and its opening hours.
	A card the opening hours assign to a time slot is shown during its slots only; a card they assign to no
	slot is shown at every hour (its dates still apply).
	Permanent cards bypass all date/time filters and appear at the end."""
	from frappe.utils import today

	permissions.require("Restaurant Card", "read")
	restaurant = restaurant or scope.current_restaurant()
	cards = scope.stamp(
		frappe.get_all(
			"Restaurant Card",
			filters={"is_active": 1},
			or_filters=scope.restaurant_or_filters(restaurant),
			fields=["name", "card_name", "description", "image", "available_from", "available_to", "is_permanent"]
		),
		restaurant,
	)

	current_date = today()

	# Get cards assigned to current time slot via opening hours
	slot_cards = _get_current_slot_cards(restaurant)
	# Until 20.10.2026 the slot filter applied to every card as soon as one slot named a card: a card the schedule
	# names nowhere (every card just created in the card editor) never showed at the till (maintenance#1754).
	scheduled_cards = _get_scheduled_cards(restaurant) if slot_cards is not None else set()

	result_normal = []
	result_permanent = []

	for card in cards:
		is_permanent = card.get("is_permanent")

		# Permanent cards bypass all date/time filters
		if not is_permanent:
			# Date filtering
			if card.get("available_from") and str(card.available_from) > current_date:
				continue
			if card.get("available_to") and str(card.available_to) < current_date:
				continue
			# Time slot filtering, for a card the schedule names
			if slot_cards is not None and card.name in scheduled_cards and card.name not in slot_cards:
				continue

		items = frappe.get_all(
			"Restaurant Card Item",
			filters={"parent": card.name},
			fields=["item_type", "label", "item", "menu", "price", "sort_order", "disabled"],
			order_by="sort_order asc, idx asc"
		)

		for ci in items:
			if ci.item_type == "Item" and ci.item:
				item_data = frappe.db.get_value("Item", ci.item,
					["item_name", "image", "custom_color", "item_group", "standard_rate", "is_stock_item"], as_dict=True)
				if item_data:
					ci["item_name"] = item_data.item_name
					ci["image"] = item_data.image
					ci["custom_color"] = item_data.custom_color
					ci["item_group"] = item_data.item_group
					ci["default_price"] = item_data.standard_rate or 0
					ci["is_stock_item"] = item_data.is_stock_item
			elif ci.item_type == "Menu" and ci.menu:
				menu_data = frappe.db.get_value("Restaurant Menu", ci.menu,
					["menu_name", "price", "image"], as_dict=True)
				if menu_data:
					ci["menu_name"] = menu_data.menu_name
					ci["image"] = menu_data.image
					ci["default_price"] = menu_data.price or 0

		# Filter out disabled items
		items = [ci for ci in items if not ci.get("disabled")]
		card["items"] = items

		if is_permanent:
			result_permanent.append(card)
		else:
			result_normal.append(card)

	# Permanent cards at the end
	return result_normal + result_permanent


@frappe.whitelist()
def get_active_menus(restaurant=None):
	"""Fetch the active menus of one restaurant (the till's own unless one is named) with their courses."""
	import json
	from frappe.utils import today

	permissions.require("Restaurant Menu", "read")
	restaurant = restaurant or scope.current_restaurant()
	filters = {"is_active": 1}
	menus = scope.stamp(
		frappe.get_all(
			"Restaurant Menu",
			filters=filters,
			or_filters=scope.restaurant_or_filters(restaurant),
			fields=["name", "menu_name", "price", "description", "image", "available_from", "available_to"]
		),
		restaurant,
	)

	current_date = today()
	result = []
	for menu in menus:
		# Check date range if set
		if menu.get("available_from") and str(menu.available_from) > current_date:
			continue
		if menu.get("available_to") and str(menu.available_to) < current_date:
			continue

		# Fetch courses
		courses = frappe.get_all(
			"Restaurant Menu Course",
			filters={"parent": menu.name},
			fields=["course_name", "item", "item_name", "sort_order"],
			order_by="sort_order, idx"
		)

		# Group by course_name
		grouped = {}
		for course in courses:
			cn = course.get("course_name")
			if cn not in grouped:
				grouped[cn] = {"course_name": cn, "sort_order": course.get("sort_order", 0), "items": []}
			grouped[cn]["items"].append({
				"item": course.get("item"),
				"item_name": course.get("item_name")
			})

		menu["courses"] = sorted(grouped.values(), key=lambda x: x["sort_order"])
		result.append(menu)

	return result


@frappe.whitelist()
def get_restaurant_settings(restaurant=None):
	"""Return a restaurant's opening hours, current status and settings (the till's restaurant by default).

	The answer holds what the till's screens read, and nothing else: the settings dialog (hours, tips, QR and
	takeaway ordering), the restaurant store's flags, the card editor (hours) and the reservation dialog (default
	duration and channels). Whatever only the server uses — the reminder and no-show rules, online booking, the
	restaurant's e-mail — stays out. It answers whoever reads the restaurant from a desk account (a cashier, a manager),
	and only for a restaurant he may read: a portal account is refused, and per-restaurant user permissions apply. The
	runner's tablet reads whether its restaurant's runner step is on, and nothing else (pos_next.restaurant.devices).
	"""
	device = devices.screen_device(devices.RUNNER)
	if device:
		restaurant, _station = devices.cut_to_device(device, restaurant)
		return devices.screen_settings(restaurant)
	permissions.require("Restaurant", "read")
	settings = restaurant_config.get_restaurant_settings(restaurant)
	if not settings:
		# No restaurant yet: nothing is set up, the restaurant features stay off
		return {"opening_hours": [], "is_open": True, "current_slot": None}
	permissions.require_restaurant(settings.name)

	hours = []
	for row in settings.opening_hours or []:
		hours.append({
			"day_of_week": row.day_of_week,
			"from_time": _format_time(row.from_time),
			"to_time": _format_time(row.to_time),
			"label": row.label,
			"restaurant_card": row.restaurant_card,
		})

	is_open, current_slot = _check_restaurant_open(hours)

	# Takeaway is a setting of the till (one POS Settings row per POS Profile), not of the restaurant: read the row of
	# the user's open till (maintenance#1981: get_single_value read a stray row of tabSingles, whatever the till says)
	till = scope.till_settings(scope.current_profile(), ["enable_takeaway", "takeaway_card"])

	return {
		# Which restaurant the settings on screen are: a save goes back to the same one (restaurant store)
		"restaurant": settings.name,
		"opening_hours": hours,
		"is_open": is_open,
		"current_slot": current_slot,
		"enable_runner": bool(settings.enable_runner),
		"enable_takeaway": bool(till.enable_takeaway),
		"takeaway_card": till.takeaway_card or None,
		"enable_tips": bool(settings.enable_tips),
		"auto_detect_tip": bool(settings.auto_detect_tip),
		"tip_item": settings.tip_item,
		"tip_account": settings.tip_account,
		"enable_qr_ordering": bool(settings.enable_qr_ordering),
		"guest_menu": settings.guest_menu,
		# The entry that prints the QR of the public menu shows only where the restaurant switched it on
		"enable_public_menu": bool(settings.enable_public_menu),
		"qr_order_validation": settings.qr_order_validation or "Direct to Kitchen",
		"guest_account_mode": settings.guest_account_mode or "Not Proposed",
		"token_expiry_mode": settings.token_expiry_mode or "On Table Close",
		"token_expiry_days": settings.token_expiry_days,
		"enable_web_takeaway": bool(settings.enable_web_takeaway),
		"takeaway_menu": settings.takeaway_menu,
		# The reservation dialog reads these two
		"default_reservation_duration": settings.default_reservation_duration,
		"reservation_channels": settings.reservation_channels,
	}


def _restaurant_to_save(restaurant=None):
	"""The Restaurant a settings save applies to: the one named, else the till's own.

	A site that saves its first restaurant settings from the till has no restaurant yet: it gets the default one, made
	as the user who saves, who must be allowed to create a restaurant. A site that has restaurants and none the save
	can name (the user's till is not a restaurant till, or every restaurant is disabled) gets no new one: a second
	restaurant named after the company would collide with the first, and settings belong to a restaurant chosen on
	purpose.
	"""
	name = restaurant or restaurant_config.get_restaurant_settings().get("name")
	if not name:
		if frappe.db.count("Restaurant"):
			frappe.throw(
				_(
					"These settings belong to a restaurant, and none is named: open the till of a restaurant, or name"
					" the restaurant of this till in its POS Settings"
				)
			)
		permissions.require("Restaurant", "create")
		name = restaurant_config.create_default_restaurant(ignore_permissions=False)
	if not name:
		frappe.throw(_("No restaurant is set up yet"))
	return frappe.get_doc("Restaurant", name)


def _save_settings(settings, restaurant, allowed):
	"""Write the fields `settings` names (among `allowed`) onto a restaurant and save it, as the user."""
	import json

	# The restaurant's settings are its managers' (the till's `manage_settings`), not a cashier's
	permissions.require("Restaurant", "write", restaurant)

	if isinstance(settings, str):
		settings = json.loads(settings)

	unknown = [field for field in settings if field not in allowed]
	if unknown:
		frappe.throw(_("Unknown restaurant setting: {0}").format(", ".join(unknown)))

	doc = _restaurant_to_save(restaurant)
	for field, value in settings.items():
		if field != "opening_hours":
			doc.set(field, value)
			continue
		doc.set("opening_hours", [])
		for row in value or []:
			doc.append("opening_hours", {
				"day_of_week": row.get("day_of_week"),
				"from_time": row.get("from_time"),
				"to_time": row.get("to_time"),
				"label": row.get("label"),
				"restaurant_card": row.get("restaurant_card"),
			})

	doc.save()
	return doc


@frappe.whitelist()
def save_restaurant_settings(settings, restaurant=None):
	"""Save a restaurant's settings from the POS frontend (the till's restaurant by default).

	`settings` maps field names to values, the opening hours being a list of rows; only the fields it names change.
	"""
	_save_settings(
		settings,
		restaurant,
		(*restaurant_config.SETTINGS_FIELDS, *restaurant_config.RESTAURANT_ONLY_SETTINGS, "opening_hours"),
	)
	return {"status": "success"}


@frappe.whitelist()
def save_tip_settings(settings, restaurant=None):
	"""Save a restaurant's tip settings and auto-create its TIP item/account if needed.

	`settings` carries `enable_tips` and/or `auto_detect_tip`.
	"""
	doc = _save_settings(settings, restaurant, ("enable_tips", "auto_detect_tip"))

	return {
		"status": "success",
		"tip_item": doc.tip_item,
		"tip_account": doc.tip_account,
	}


@frappe.whitelist()
def get_restaurant_status(restaurant=None):
	"""Lightweight endpoint returning restaurant open/closed status and card availability."""
	permissions.require("Restaurant", "read")

	# Get opening hours
	settings = restaurant_config.get_restaurant_settings(restaurant)
	hours = [
		{
			"day_of_week": r.day_of_week,
			"from_time": str(r.from_time) if r.from_time else None,
			"to_time": str(r.to_time) if r.to_time else None,
			"label": r.label,
		}
		for r in settings.opening_hours or []
	]

	# No restaurant, or no hours defined: the restaurant is considered always open, no warnings
	if not hours:
		return {"is_open": True, "current_slot": None, "has_active_cards": True, "warning": None}

	is_open, current_slot = _check_restaurant_open(hours)

	if not is_open:
		return {"is_open": False, "current_slot": None, "has_active_cards": False, "warning": None}

	# Check if there are active cards for the current time
	active_cards = get_active_cards(settings.name)
	has_active_cards = len(active_cards) > 0

	warning = None
	if not has_active_cards:
		slot_label = current_slot or ""
		warning = _("No active card for the current time slot{0}").format(
			" ({0})".format(slot_label) if slot_label else ""
		)

	return {
		"is_open": is_open,
		"current_slot": current_slot,
		"has_active_cards": has_active_cards,
		"warning": warning,
	}


def _format_time(val):
	"""Format a Frappe time value (timedelta or string) to HH:MM for HTML input compatibility."""
	if not val:
		return None
	import datetime
	if isinstance(val, datetime.timedelta):
		total_seconds = int(val.total_seconds())
		hours = total_seconds // 3600
		minutes = (total_seconds % 3600) // 60
		return f"{hours:02d}:{minutes:02d}"
	# String: ensure HH:MM format
	s = str(val)
	parts = s.split(":")
	if len(parts) >= 2:
		return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
	return s


def _get_scheduled_cards(restaurant=None):
	"""Names of the cards the restaurant's opening hours assign to at least one time slot."""
	settings = restaurant_config.get_restaurant_settings(restaurant)
	return {
		slot.restaurant_card
		for slot in settings.opening_hours or []
		if getattr(slot, "restaurant_card", None)
	}


def _get_current_slot_cards(restaurant=None):
	"""Return set of card names assigned to the current time slot, or None if no slots have cards."""
	import calendar
	from frappe.utils import nowtime, get_time, nowdate, getdate

	settings = restaurant_config.get_restaurant_settings(restaurant)

	if not settings.opening_hours:
		return None

	today_name = calendar.day_name[getdate(nowdate()).weekday()]
	now = get_time(nowtime())

	# Check if any slot has a card assigned at all
	any_card_assigned = any(h.restaurant_card for h in settings.opening_hours if hasattr(h, "restaurant_card"))
	if not any_card_assigned:
		return None  # No cards assigned to any slot = no time filtering

	# Find matching slots for current day + time
	matched_cards = set()
	for slot in settings.opening_hours:
		if slot.day_of_week != today_name:
			continue
		if not slot.from_time or not slot.to_time:
			continue

		ft = get_time(str(slot.from_time))
		tt = get_time(str(slot.to_time))
		in_range = False
		if ft <= tt:
			in_range = ft <= now <= tt
		else:
			in_range = now >= ft or now <= tt

		if in_range and getattr(slot, "restaurant_card", None):
			matched_cards.add(slot.restaurant_card)

	return matched_cards if matched_cards else set()


def _check_restaurant_open(hours):
	"""Check if the restaurant is currently open based on opening hours.
	Returns (is_open: bool, current_slot_label: str or None).
	"""
	import calendar
	from frappe.utils import nowtime, get_time, nowdate, getdate

	if not hours:
		return True, None

	today_name = calendar.day_name[getdate(nowdate()).weekday()]
	now = get_time(nowtime())

	day_slots = [h for h in hours if h.get("day_of_week") == today_name]

	if not day_slots:
		# No hours defined for today = closed
		return False, None

	for slot in day_slots:
		ft_str = slot.get("from_time")
		tt_str = slot.get("to_time")
		if not ft_str or not tt_str:
			continue

		ft = get_time(ft_str)
		tt = get_time(tt_str)

		if ft <= tt:
			# Normal range
			if ft <= now <= tt:
				return True, slot.get("label")
		else:
			# Midnight-spanning range
			if now >= ft or now <= tt:
				return True, slot.get("label")

	return False, None


# ─── Preparation Workflow System ─────────────────────────────────────────────

# Default workflow steps used when no Preparation Workflow is configured
DEFAULT_WORKFLOW_STEPS = [
	{"step_name": "Pending", "color": "#EAB308", "allow_edit": 1},
	{"step_name": "Preparing", "color": "#3B82F6", "allow_edit": 0},
	{"step_name": "Ready", "color": "#22C55E", "allow_edit": 0},
]


def _resolve_workflow(station_name=None, item_code=None):
	"""Resolve the applicable workflow steps for a station/item combination.

	Priority:
	1. Product-level workflow (via Preparation Workflow applicable_items)
	2. Per-item workflow override on Preparation Station Item
	3. Station-level workflow on Preparation Station
	4. Default Preparation Workflow (is_default=1)
	5. Hardcoded DEFAULT_WORKFLOW_STEPS constant
	"""
	# 1. Check if item has a workflow assigned via Preparation Workflow applicable_items
	if item_code and frappe.db.exists("DocType", "Preparation Workflow Item"):
		wf_with_item = frappe.db.sql("""
			SELECT parent FROM `tabPreparation Workflow Item`
			WHERE item = %s LIMIT 1
		""", item_code, as_dict=True)
		if wf_with_item:
			return _get_workflow_steps(wf_with_item[0].parent)

	if station_name:
		try:
			station = frappe.get_cached_doc("Preparation Station", station_name)
		except Exception:
			return DEFAULT_WORKFLOW_STEPS

		# Check per-item override
		if item_code and station.items:
			for item_row in station.items:
				if item_row.item == item_code and getattr(item_row, "workflow", None):
					return _get_workflow_steps(item_row.workflow)

		# Station-level workflow
		if getattr(station, "workflow", None):
			return _get_workflow_steps(station.workflow)

	# Default workflow
	default_wf = frappe.db.get_value("Preparation Workflow", {"is_default": 1}, "name")
	if default_wf:
		return _get_workflow_steps(default_wf)

	return DEFAULT_WORKFLOW_STEPS


def _get_workflow_steps(workflow_name):
	"""Fetch ordered steps from a Preparation Workflow document."""
	steps = frappe.get_all(
		"Preparation Workflow Step",
		filters={"parent": workflow_name, "parenttype": "Preparation Workflow"},
		fields=["step_name", "color", "allow_edit"],
		order_by="idx asc"
	)
	return steps or DEFAULT_WORKFLOW_STEPS


@frappe.whitelist()
def get_preparation_workflows():
	"""Fetch all preparation workflows with their steps for the editor."""
	permissions.require("Preparation Workflow", "read")
	workflows = frappe.get_all(
		"Preparation Workflow",
		fields=["name", "workflow_name", "is_default"],
		order_by="is_default desc, workflow_name asc"
	)
	for wf in workflows:
		wf["steps"] = frappe.get_all(
			"Preparation Workflow Step",
			filters={"parent": wf.name, "parenttype": "Preparation Workflow"},
			fields=["step_name", "color", "allow_edit"],
			order_by="idx asc"
		)
		wf["applicable_items"] = []
		if frappe.db.exists("DocType", "Preparation Workflow Item"):
			wf["applicable_items"] = [
				r.item for r in frappe.get_all(
					"Preparation Workflow Item",
					filters={"parent": wf.name},
					fields=["item"]
				)
			]
	return workflows


@frappe.whitelist()
def save_preparation_workflow(name, workflow_name=None, steps=None, is_default=None, applicable_items=None):
	"""Save a preparation workflow and its steps."""
	# //// Neoffice — its caller is the till (WorkflowEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may write a workflow (not a cashier), saved as that user
	permissions.require("Preparation Workflow", "write", name)
	import json
	if isinstance(steps, str):
		steps = json.loads(steps)
	if isinstance(applicable_items, str):
		applicable_items = json.loads(applicable_items)

	doc = frappe.get_doc("Preparation Workflow", name)
	if workflow_name:
		doc.workflow_name = workflow_name
	if is_default is not None:
		if int(is_default):
			# Unset other defaults
			frappe.db.sql("UPDATE `tabPreparation Workflow` SET is_default=0 WHERE name != %s", name)
		doc.is_default = int(is_default)
	if steps is not None:
		doc.steps = []
		for i, s in enumerate(steps):
			if s.get("step_name"):
				doc.append("steps", {
					"step_name": s["step_name"],
					"color": s.get("color") or "#6B7280",
					"allow_edit": 1 if i == 0 else 0,
				})
	if applicable_items is not None and hasattr(doc, "applicable_items"):
		doc.applicable_items = []
		for item_code in applicable_items:
			doc.append("applicable_items", {"item": item_code})
	doc.save()
	return {"status": "success"}


@frappe.whitelist()
def create_preparation_workflow(workflow_name, steps=None):
	"""Create a new preparation workflow."""
	# //// Neoffice — its caller is the till (WorkflowEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may create a workflow (not a cashier), made as that user
	permissions.require("Preparation Workflow", "create")
	import json
	if isinstance(steps, str):
		steps = json.loads(steps)
	if not steps:
		steps = [
			{"step_name": "Pending", "color": "#EAB308", "allow_edit": 1},
			{"step_name": "Preparing", "color": "#3B82F6", "allow_edit": 0},
			{"step_name": "Ready", "color": "#22C55E", "allow_edit": 0},
		]
	doc = frappe.get_doc({
		"doctype": "Preparation Workflow",
		"workflow_name": workflow_name,
		"steps": [{"step_name": s["step_name"], "color": s.get("color", "#6B7280"), "allow_edit": s.get("allow_edit", 0)} for s in steps]
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def delete_preparation_workflow(name):
	"""Delete a preparation workflow."""
	# //// Neoffice — its caller is the till (WorkflowEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may delete a workflow (not a cashier), deleted as that user
	permissions.require("Preparation Workflow", "delete", name)
	frappe.delete_doc("Preparation Workflow", name)
	return {"status": "success"}


@frappe.whitelist()
def get_station_workflows(restaurant=None):
	"""Fetch the active stations of the restaurant (the till's own unless one is named) with their resolved workflow steps."""
	# Whoever reads the stations from a desk account (a cashier, a manager; a kitchen tablet runs on a desk account
	# that holds a till role), and the restaurant they belong to (per-restaurant user permissions)
	permissions.require("Preparation Station", "read")
	restaurant = restaurant or scope.current_restaurant()
	permissions.require_restaurant(restaurant)
	stations = scope.stamp(
		frappe.get_all(
			"Preparation Station",
			filters={"is_active": 1},
			or_filters=scope.restaurant_or_filters(restaurant),
			fields=["name", "station_name", "color"],
			order_by="station_name",
		),
		restaurant,
	)

	# Safely check for workflow field
	has_workflow = frappe.db.has_column("Preparation Station", "workflow")

	for station in stations:
		if has_workflow:
			station["workflow"] = frappe.db.get_value("Preparation Station", station.name, "workflow")
		station["steps"] = _resolve_workflow(station_name=station.name)

		# Fetch per-item workflow overrides
		item_fields = ["item", "item_name"]
		if frappe.db.has_column("Preparation Station Item", "workflow"):
			item_fields.append("workflow")
		station["items"] = frappe.get_all(
			"Preparation Station Item",
			filters={"parent": station.name},
			fields=item_fields
		)

	return {
		"stations": stations,
		"default_steps": DEFAULT_WORKFLOW_STEPS
	}


@frappe.whitelist()
def get_next_step(station_name, current_step, item_code=None):
	"""Get the next workflow step for a given station/item and current step."""
	permissions.require("Preparation Workflow", "read")
	steps = _resolve_workflow(station_name, item_code)
	step_names = [s["step_name"] for s in steps]

	if current_step not in step_names:
		return steps[0] if steps else None

	current_idx = step_names.index(current_step)
	if current_idx + 1 < len(step_names):
		return steps[current_idx + 1]

	# At last step -> next is Delivered
	return {"step_name": "Delivered", "color": "#6B7280", "allow_edit": 0}


@frappe.whitelist()
def get_runner_orders(area=None, restaurant=None):
	"""Fetch orders with items ready for pickup (at last workflow step, not yet Delivered).

	Args:
		area: Optional area name to filter tables by area.
		restaurant: The restaurant whose orders are wanted (the till's own by default).
	Each order says the label of its table (`table_display_name`) and each line the label of its station
	(`station_name`).
	"""
	# //// Neoffice — it is called from the runner screen and floor plan, run by desk accounts, so a desk
	# //// account is required (cash_entry.require_system_user).
	from pos_next.api.cash_entry import require_system_user

	# Or the runner's tablet: the orders of its restaurant (pos_next.restaurant.devices)
	device = devices.screen_device(devices.RUNNER)
	if device:
		restaurant, _station = devices.cut_to_device(device, restaurant)
	else:
		require_system_user()
	restaurant = restaurant or scope.current_restaurant()
	raw_orders = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0},
		fields=["name", "customer", "restaurant_table", "kds_status", "creation", "modified"]
	)

	orders = scope.keep_orders_of([o for o in raw_orders if o.get("restaurant_table")], restaurant)

	# Filter by area if specified
	if area:
		area_tables = set(frappe.get_all("Restaurant Table",
			filters={"area": area}, pluck="name"))
		orders = [o for o in orders if o.restaurant_table in area_tables]

	item_fields = ["name", "item_code", "item_name", "qty", "description"]
	has_instructions = frappe.db.has_column("Sales Invoice Item", "posa_special_instructions")
	has_item_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	has_prep_station = frappe.db.has_column("Sales Invoice Item", "preparation_station")
	has_modifiers = frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers")

	if has_instructions:
		item_fields.append("posa_special_instructions")
	if has_item_kds:
		item_fields.append("kds_status")
	if has_prep_station:
		item_fields.append("preparation_station")
	if has_modifiers:
		item_fields.append("posa_item_modifiers")

	# Build station map for enrichment (individual items + item groups)
	station_map = {}
	group_station_map = {}
	all_stations = frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
		or_filters=scope.restaurant_or_filters(restaurant),
		fields=["name", "station_name", "color"],
	)
	station_labels = {st.name: st.station_name for st in all_stations}
	for st in all_stations:
		station_info = {"station_name": st.station_name, "station_color": st.color, "station_id": st.name}
		st_items = frappe.get_all("Preparation Station Item", filters={"parent": st.name}, fields=["item"])
		for si in st_items:
			station_map[si.item] = station_info
		st_groups = frappe.get_all("Preparation Station Item Group", filters={"parent": st.name}, fields=["item_group"])
		for sg in st_groups:
			if sg.item_group not in group_station_map:
				group_station_map[sg.item_group] = station_info

	workflow_cache = {}

	result = []
	for order in orders:
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order.name},
			fields=item_fields
		)

		ready_items = []
		for item in items:
			item_status = item.get("kds_status", "")
			if not item_status or item_status == "Delivered":
				continue

			# Resolve station (individual item > item group fallback)
			station_id = item.get("preparation_station") or ""
			if not station_id and item.item_code in station_map:
				station_id = station_map[item.item_code]["station_id"]
			if not station_id:
				item_group = frappe.db.get_value("Item", item.item_code, "item_group")
				if item_group and item_group in group_station_map:
					station_id = group_station_map[item_group]["station_id"]
			# Persist resolved station to DB
			if station_id and not item.get("preparation_station"):
				frappe.db.set_value("Sales Invoice Item", item.name, "preparation_station", station_id, update_modified=False)

			# Check if item is at last workflow step
			cache_key = f"{station_id}:{item.item_code}"
			if cache_key not in workflow_cache:
				workflow_cache[cache_key] = _resolve_workflow(station_id or None, item.item_code)
			steps = workflow_cache[cache_key]
			last_step = steps[-1]["step_name"] if steps else "Ready"

			if item_status == last_step or item_status == "Ready":
				# Enrich with station info
				if item.item_code in station_map:
					item["station_color"] = station_map[item.item_code]["station_color"]
					if not item.get("preparation_station"):
						item["preparation_station"] = station_map[item.item_code]["station_id"]
				elif station_id:
					try:
						station_doc = frappe.get_cached_doc("Preparation Station", station_id)
						item["station_color"] = station_doc.color
					except Exception:
						item["station_color"] = "#6B7280"
				else:
					item["station_color"] = "#6B7280"

				# The label of the station beside its name (a station of another restaurant is looked up once)
				shown_station = item.get("preparation_station") or station_id
				if shown_station:
					if shown_station not in station_labels:
						station_labels[shown_station] = (
							frappe.db.get_value("Preparation Station", shown_station, "station_name") or shown_station
						)
					item["station_name"] = station_labels[shown_station]

				ready_items.append(item)

		if ready_items:
			table_info = {}
			try:
				table_info = frappe.db.get_value(
					"Restaurant Table", order.restaurant_table,
					["table_name", "area"], as_dict=True
				) or {}
			except Exception:
				pass

			order["items"] = ready_items
			order["table_display_name"] = table_info.get("table_name") or order.restaurant_table
			order["area"] = table_info.get("area") or ""
			result.append(order)

	return result


@frappe.whitelist()
def mark_items_delivered(invoice_name, item_names=None):
	"""Mark specific items (or all ready items) as Delivered (the runner's tablet: on an open order of its restaurant)."""
	import json

	device = devices.screen_device(devices.RUNNER)
	if device:
		devices.require_order_of_device(device, invoice_name)
	else:
		permissions.require("Sales Invoice", "write")

	if not frappe.db.exists("Sales Invoice", invoice_name):
		frappe.throw(_("Invoice {0} not found").format(invoice_name))

	has_item_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	if not has_item_kds:
		frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", "Delivered")
		frappe.publish_realtime("kds_update")
		return {"status": "success"}

	if item_names:
		if isinstance(item_names, str):
			item_names = json.loads(item_names)
		# Only lines of the invoice named: a line of another order is not delivered from this one
		of_the_invoice = set(
			frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": invoice_name, "parenttype": "Sales Invoice", "name": ["in", list(item_names)]},
				pluck="name",
			)
		)
		if set(item_names) - of_the_invoice:
			frappe.throw(_("Some lines are not lines of invoice {0}").format(invoice_name))
		for row_name in item_names:
			frappe.db.set_value("Sales Invoice Item", row_name, "kds_status", "Delivered")
	else:
		frappe.db.sql("""
			UPDATE `tabSales Invoice Item`
			SET kds_status = 'Delivered'
			WHERE parent = %s AND IFNULL(kds_status, '') != 'Delivered'
		""", invoice_name)

	# Sync order-level status
	all_items = frappe.get_all("Sales Invoice Item", filters={"parent": invoice_name}, fields=["kds_status"])
	statuses = [i.kds_status for i in all_items if i.kds_status]
	if statuses and all(s == "Delivered" for s in statuses):
		frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", "Delivered")

	frappe.publish_realtime("kds_update")
	return {"status": "success"}


@frappe.whitelist()
def get_takeaway_orders(restaurant=None):
	"""Fetch the active takeaway orders of one restaurant (draft invoices with is_takeaway=1).

	An order is the restaurant's of the till that took it; the till's own restaurant is the default."""
	# //// Neoffice — it is called from the takeaway screen and till, run by desk accounts, so a desk account
	# //// is required (cash_entry.require_system_user).
	from pos_next.api.cash_entry import require_system_user

	require_system_user()
	raw_orders = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 0,
			"is_pos": 1,
			"is_takeaway": 1,
		},
		fields=["name", "customer_name", "grand_total", "kds_status",
				"takeaway_number", "creation", "modified", "pos_profile"],
		order_by="creation asc",
	)

	result = []
	for order in scope.keep_orders_of(raw_orders, restaurant or scope.current_restaurant()):
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order.name},
			fields=["item_code", "item_name", "qty", "rate", "amount",
					"kds_status", "preparation_station"],
		)
		order["items"] = items
		result.append(order)

	return result


@frappe.whitelist()
def get_next_takeaway_number():
	"""Generate the next takeaway number for today (T-001, T-002...)."""
	from frappe.utils import today

	# It counts the day's sales invoices: whoever reads them (every cashier), from a desk account
	permissions.require("Sales Invoice", "read")
	current_date = today()
	count = frappe.db.count("Sales Invoice", filters={
		"is_takeaway": 1,
		"creation": [">=", f"{current_date} 00:00:00"],
	})
	return f"T-{(count + 1):03d}"


@frappe.whitelist()
def update_takeaway_status(invoice_name, status):
	"""Update the KDS status of a takeaway order."""
	# //// Neoffice — it is called from the takeaway screen, run by desk accounts, so a desk account is
	# //// required (cash_entry.require_system_user). It sets one of the statuses the kds_status field offers,
	# //// on a takeaway order still in draft: the orders get_takeaway_orders lists.
	from pos_next.api.cash_entry import require_system_user

	require_system_user()
	# A service gesture: whoever reads the preparation stations (a cashier, a manager), not any desk account
	permissions.require("Preparation Station", "read")
	statuses = (frappe.get_meta("Sales Invoice").get_options("kds_status") or "").split("\n")
	if not status or status not in statuses:
		frappe.throw(_("Invalid status: {0}").format(status))
	order = isinstance(invoice_name, str) and frappe.db.get_value(
		"Sales Invoice", invoice_name, ["docstatus", "is_pos", "is_takeaway"], as_dict=True
	)
	if not order:
		frappe.throw(_("Sales Invoice {0} not found").format(invoice_name), frappe.DoesNotExistError)
	if order.docstatus != 0 or not order.is_pos or not order.is_takeaway:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", status)
	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("takeaway_update")
	return {"status": "success"}


@frappe.whitelist()
def create_item(
	item_name,
	item_group,
	stock_uom,
	item_code=None,
	is_stock_item=0,
	standard_selling_rate=0,
	standard_buying_rate=0,
	opening_stock=0,
	warehouse=None,
	pos_profile=None,
	image=None,
	color=None,
	option_groups=None,
	description=None,
):
	"""Create a new Item from the POS Card Editor with prices and optional stock."""
	from frappe.utils import cint, flt
	import json

	if not frappe.has_permission("Item", "create"):
		frappe.throw(_("You don't have permission to create items"), frappe.PermissionError)
	# Linking the new item to option groups writes them: the restaurant's right, checked before anything is made
	if option_groups:
		permissions.require("Product Option Group", "write")

	if not item_name or not item_group or not stock_uom:
		frappe.throw(_("Item Name, Item Group, and Unit of Measure are required"))

	# Prevent item creation in root group (no company defaults possible)
	parent = frappe.db.get_value("Item Group", item_group, "parent_item_group")
	if not parent or parent == "":
		frappe.throw(_("Cannot create items in the root group '{0}'. Please select a child group.").format(item_group))

	if not item_code:
		item_code = item_name

	# Get POS Profile data for defaults
	profile = None
	if pos_profile:
		profile = frappe.get_cached_doc("POS Profile", pos_profile)

	# Create Item doc
	item_doc = frappe.get_doc({
		"doctype": "Item",
		"item_code": item_code,
		"item_name": item_name,
		"item_group": item_group,
		"stock_uom": stock_uom,
		"is_stock_item": cint(is_stock_item),
		"image": image or None,
		"custom_color": color or None,
		"description": description or None,
	})

	# Add item defaults from POS Profile
	if profile:
		item_doc.append("item_defaults", {
			"company": profile.company,
			"default_warehouse": warehouse or profile.warehouse,
		})

	try:
		item_doc.insert()
	except frappe.DuplicateEntryError:
		frappe.throw(_("An item with code '{0}' already exists").format(item_code))

	# Create selling Item Price
	if flt(standard_selling_rate) and profile and profile.selling_price_list:
		try:
			frappe.get_doc({
				"doctype": "Item Price",
				"item_code": item_doc.name,
				"price_list": profile.selling_price_list,
				"price_list_rate": flt(standard_selling_rate),
			}).insert(ignore_permissions=True)
		except Exception:
			frappe.log_error("Item Price creation failed", frappe.get_traceback())

	# Create buying Item Price
	if flt(standard_buying_rate):
		buying_price_list = frappe.db.get_single_value("Buying Settings", "buying_price_list")
		if buying_price_list and frappe.db.exists("Price List", buying_price_list):
			try:
				frappe.get_doc({
					"doctype": "Item Price",
					"item_code": item_doc.name,
					"price_list": buying_price_list,
					"price_list_rate": flt(standard_buying_rate),
					"buying": 1,
				}).insert(ignore_permissions=True, ignore_if_duplicate=True)
			except Exception:
				frappe.log_error("Buying Price creation failed", frappe.get_traceback())

	# Create opening stock entry
	if cint(is_stock_item) and flt(opening_stock) > 0:
		target_warehouse = warehouse
		if not target_warehouse and profile:
			target_warehouse = profile.warehouse
		if target_warehouse:
			company = profile.company if profile else frappe.defaults.get_global_default("company")
			try:
				stock_entry = frappe.get_doc({
					"doctype": "Stock Entry",
					"stock_entry_type": "Material Receipt",
					"company": company,
					"items": [{
						"item_code": item_doc.name,
						"qty": flt(opening_stock),
						"t_warehouse": target_warehouse,
						"basic_rate": flt(standard_buying_rate) or flt(standard_selling_rate),
					}],
				})
				stock_entry.insert()
				stock_entry.submit()
			except Exception:
				frappe.log_error("Opening stock entry failed", frappe.get_traceback())

	# Link item to selected Product Option Groups
	if option_groups:
		groups = json.loads(option_groups) if isinstance(option_groups, str) else option_groups
		for group_name in groups:
			if frappe.db.exists("Product Option Group", group_name):
				group_doc = frappe.get_doc("Product Option Group", group_name)
				group_doc.append("applicable_items", {
					"item": item_doc.name,
					"item_name": item_doc.item_name,
				})
				group_doc.save()

	return {
		"name": item_doc.name,
		"item_name": item_doc.item_name,
		"item_code": item_doc.item_code,
		"standard_rate": flt(standard_selling_rate),
		"item_group": item_doc.item_group,
		"stock_uom": item_doc.stock_uom,
		"image": item_doc.image,
		"custom_color": item_doc.custom_color,
	}


@frappe.whitelist()
def get_item_creation_defaults(pos_profile=None):
	"""Get default values for the Create Item dialog."""
	# The dialog creates an item: whoever may create one in the ERP (the till's `create_items`)
	permissions.require_right("create_items")
	# Item Groups (all, including parent groups)
	item_groups = frappe.get_all(
		"Item Group",
		fields=["name"],
		order_by="name asc",
		limit_page_length=0,
	)

	# UOMs
	uoms = frappe.get_all(
		"UOM",
		fields=["name"],
		order_by="name asc",
		limit_page_length=0,
	)

	# Defaults from Stock Settings
	default_uom = frappe.db.get_single_value("Stock Settings", "stock_uom") or "Nos"
	default_item_group = frappe.db.get_single_value("Stock Settings", "item_group") or ""

	# Default warehouse from POS Profile
	default_warehouse = ""
	warehouses = []
	if pos_profile:
		profile = frappe.get_cached_doc("POS Profile", pos_profile)
		default_warehouse = profile.warehouse or ""
		company = profile.company
		warehouses = frappe.get_all(
			"Warehouse",
			filters={"company": company, "is_group": 0},
			fields=["name"],
			order_by="name asc",
			limit_page_length=0,
		)

	return {
		"item_groups": [g.name for g in item_groups],
		"uoms": [u.name for u in uoms],
		"default_uom": default_uom,
		"default_item_group": default_item_group,
		"default_warehouse": default_warehouse,
		"warehouses": [w.name for w in warehouses],
		"has_image_search": bool(frappe.conf.get("pexels_api_key")),
	}


@frappe.whitelist()
def search_food_images(query, per_page=15, page=1):
	"""Search for food images via Pexels API. API key stored in site_config."""
	import requests

	# The card editor's (it spends the site's key with the provider): whoever manages the cards
	permissions.require_right("manage_cards")
	api_key = frappe.conf.get("pexels_api_key")
	if not api_key:
		frappe.throw(_("Pexels API key not configured"))

	try:
		response = requests.get(
			"https://api.pexels.com/v1/search",
			params={
				"query": query,
				"per_page": min(int(per_page), 30),
				"page": int(page),
			},
			headers={"Authorization": api_key},
			timeout=10,
		)
		response.raise_for_status()
	except Exception as e:
		frappe.log_error("Pexels API error", str(e))
		frappe.throw(_("Failed to search images"))

	data = response.json()
	photos = [
		{
			"id": photo["id"],
			"url": photo["src"]["medium"],
			"thumb": photo["src"]["tiny"],
			"photographer": photo["photographer"],
		}
		for photo in data.get("photos", [])
	]
	total = data.get("total_results", 0)
	current_page = int(page)
	return {
		"photos": photos,
		"has_more": current_page * int(per_page) < total,
		"page": current_page,
	}


# //// Neoffice — the images search_food_images offers are photos on Pexels, served from these hosts.
# //// download_food_image fetches only an https address on one of them, follows a redirect only to
# //// another such address, and keeps only a raster image no larger than FOOD_IMAGE_MAX_BYTES.
FOOD_IMAGE_HOSTS = ("images.pexels.com",)
FOOD_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
FOOD_IMAGE_MAX_BYTES = 5 * 1024 * 1024
FOOD_IMAGE_MAX_REDIRECTS = 3
FOOD_IMAGE_TIMEOUT = (5, 10)  # seconds: connect, then each read


def _food_image_url_allowed(url):
	from urllib.parse import urlsplit

	try:
		parts = urlsplit(url) if isinstance(url, str) else None
		port = parts.port if parts else None
	except ValueError:
		return False
	return bool(
		parts
		and parts.scheme == "https"
		and (parts.hostname or "").lower() in FOOD_IMAGE_HOSTS
		and port in (None, 443)
		and not parts.username
		and not parts.password
	)


def _fetch_food_image(url):
	"""The body and file extension of an image from the image search's provider; refused otherwise."""
	from urllib.parse import urljoin

	import requests

	response = None
	try:
		for _hop in range(FOOD_IMAGE_MAX_REDIRECTS + 1):
			if not _food_image_url_allowed(url):
				frappe.throw(_("Images can only be downloaded from the image search"))
			response = requests.get(
				url,
				timeout=FOOD_IMAGE_TIMEOUT,
				stream=True,
				allow_redirects=False,
				headers={"Accept": ", ".join(FOOD_IMAGE_TYPES)},
			)
			if not response.is_redirect:
				break
			url = urljoin(url, response.headers.get("Location") or "")
			response.close()
		else:
			frappe.throw(_("Failed to download image"))

		response.raise_for_status()
		content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
		extension = FOOD_IMAGE_TYPES.get(content_type)
		if not extension:
			frappe.throw(_("The address does not point to an image"))
		too_large = _("The image is larger than {0} MB").format(FOOD_IMAGE_MAX_BYTES // (1024 * 1024))
		declared = response.headers.get("Content-Length") or ""
		if declared.isdigit() and int(declared) > FOOD_IMAGE_MAX_BYTES:
			frappe.throw(too_large)
		body = bytearray()
		for chunk in response.iter_content(64 * 1024):
			body.extend(chunk)
			if len(body) > FOOD_IMAGE_MAX_BYTES:
				frappe.throw(too_large)
		return bytes(body), extension
	except requests.RequestException as e:
		frappe.log_error("Image download failed", str(e))
		frappe.throw(_("Failed to download image"))
	finally:
		if response is not None:
			response.close()


@frappe.whitelist()
def download_food_image(image_url, item_name):
	"""Download an external image and save it as a Frappe File."""
	# //// Neoffice — its caller is the till (ImageSearchDialog), so only the till's users pass
	# //// (cash_entry.require_till_user); the image comes from the image search's provider only
	# //// (_fetch_food_image).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever manages the cards (the till's `manage_cards`), before anything is fetched; the file is the user's
	permissions.require_right("manage_cards")
	content, extension = _fetch_food_image(image_url)

	filename = f"{frappe.scrub(item_name)}.{extension}"
	file_doc = frappe.get_doc({
		"doctype": "File",
		"file_name": filename,
		"content": content,
		"is_private": 0,
	})
	file_doc.save()
	return file_doc.file_url


@frappe.whitelist()
def duplicate_card(card_name):
	"""Duplicate a restaurant card with all its items."""
	# //// Neoffice — its caller is the till (CardEditor), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may read the card and create one (not a cashier); the copy is made as that user
	permissions.require("Restaurant Card", "read", card_name)
	permissions.require("Restaurant Card", "create")
	original = frappe.get_doc("Restaurant Card", card_name)
	new_doc = frappe.copy_doc(original)
	new_doc.card_name = f"{original.card_name} (Copy)"
	new_doc.is_active = 0
	new_doc.insert()
	return new_doc.as_dict()


@frappe.whitelist()
def get_card_items_stock(card_name):
	"""Get stock quantities for stock-managed items in a card, grouped by warehouse."""
	# The card editor's: whoever manages the cards (it answers stock in every warehouse)
	permissions.require_right("manage_cards")
	permissions.require("Restaurant Card", "read", card_name)
	card = frappe.get_doc("Restaurant Card", card_name)
	result = {}
	for item in card.items:
		if item.item_type != "Item" or not item.item:
			continue
		is_stock_item = frappe.db.get_value("Item", item.item, "is_stock_item")
		if not is_stock_item:
			continue
		bins = frappe.get_all(
			"Bin",
			filters={"item_code": item.item},
			fields=["warehouse", "actual_qty"]
		)
		result[item.item] = [{"warehouse": b.warehouse, "qty": b.actual_qty} for b in bins]
	return result


# ─── Item Edit Panel APIs ────────────────────────────────────────────────────


@frappe.whitelist()
def get_item_edit_data(item_code, pos_profile=None):
	"""Fetch all data needed for the item edit panel in CardEditor."""
	from frappe.utils import flt

	from pos_next.api.cash_entry import require_till_user

	# The card editor's: whoever manages the cards and reads the item, at the till whose price list it answers
	require_till_user(pos_profile)
	permissions.require_right("manage_cards")
	permissions.require("Item", "read", item_code)
	item = frappe.get_doc("Item", item_code)

	# Get price from price list
	price_list_rate = 0
	if pos_profile:
		profile = frappe.get_cached_doc("POS Profile", pos_profile)
		if profile.selling_price_list:
			price_list_rate = frappe.db.get_value(
				"Item Price",
				{"item_code": item_code, "price_list": profile.selling_price_list},
				"price_list_rate"
			) or 0

	# Get stock bins
	stock = []
	if item.is_stock_item:
		bins = frappe.get_all(
			"Bin",
			filters={"item_code": item_code},
			fields=["warehouse", "actual_qty"]
		)
		stock = [{"warehouse": b.warehouse, "qty": b.actual_qty} for b in bins]

	# Get badges
	badges = []
	spice_level = 0
	if hasattr(item, "custom_item_badges"):
		for row in item.custom_item_badges:
			try:
				badge_doc = frappe.get_cached_doc("Menu Badge", row.menu_badge)
				badges.append({
					"menu_badge": row.menu_badge,
					"badge_name": badge_doc.badge_name,
					"badge_type": badge_doc.badge_type,
					"icon": badge_doc.icon,
					"color": badge_doc.color,
				})
			except Exception:
				pass
	spice_level = int(item.get("custom_spice_level") or 0)

	# Get option groups linked to this item
	linked_groups = []
	all_groups = frappe.get_all(
		"Product Option Group",
		fields=["name", "group_name", "selection_type", "required"]
	)
	for g in all_groups:
		applicable_items = frappe.get_all(
			"Product Option Group Item",
			filters={"parent": g.name, "item": item_code},
			fields=["name"]
		)
		if applicable_items:
			linked_groups.append(g.name)

	# Strip HTML from description
	raw_desc = item.get("description") or ""
	clean_desc = plain_text(raw_desc)

	# Check if has image search (stored in site_config.json)
	has_image_search = bool(frappe.conf.get("pexels_api_key"))

	return {
		"item_code": item.name,
		"item_name": item.item_name,
		"description": clean_desc,
		"image": item.image or "",
		"custom_color": item.custom_color or "",
		"is_stock_item": item.is_stock_item,
		"standard_rate": flt(item.standard_rate),
		"price_list_rate": flt(price_list_rate),
		"stock": stock,
		"badges": badges,
		"spice_level": spice_level,
		"linked_option_groups": linked_groups,
		"all_option_groups": [{"name": g.name, "group_name": g.group_name, "selection_type": g.selection_type, "required": g.required} for g in all_groups],
		"has_image_search": has_image_search,
	}


@frappe.whitelist()
def update_item_details(item_code, description=None, image=None, color=None, option_groups=None, badges=None, spice_level=None):
	"""Update an item from the card editor: only what is given changes.

	The item sheet (description, image, colour) is the ERP's Item: it is saved as the user, so whoever may not edit
	items in the ERP does not edit them from the till either. The badges and spice level are the card's data, the
	option groups the restaurant's (`manage_options`). Until 30.10.2026 the spice level defaulted to 0, so that every
	call that did not name it reset the dish to "not spicy".
	"""
	# //// Neoffice — its caller is the till (ItemEditPanel), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever manages the cards (the till's `manage_cards`); each other right is checked before anything is written
	permissions.require_right("manage_cards")
	sheet_changes = description is not None or image is not None or color is not None
	if sheet_changes:
		permissions.require("Item", "write", item_code)
	if option_groups is not None:
		permissions.require("Product Option Group", "write")
	import json

	item = frappe.get_doc("Item", item_code)

	if description is not None:
		item.description = description
	if image is not None:
		item.image = image
	if color is not None:
		item.custom_color = color

	if sheet_changes:
		_set_badges(item, badges, spice_level)
		item.save()
	elif badges is not None or spice_level is not None:
		_save_badges(item, badges, spice_level)

	# Update option groups
	if option_groups is not None:
		if isinstance(option_groups, str):
			option_groups = json.loads(option_groups)
		# Remove item from all groups first
		all_groups = frappe.get_all("Product Option Group", fields=["name"])
		for g in all_groups:
			group_doc = frappe.get_doc("Product Option Group", g.name)
			updated = False
			new_items = []
			for ai in group_doc.applicable_items:
				if ai.item != item_code:
					new_items.append(ai)
				else:
					updated = True
			if updated:
				group_doc.applicable_items = new_items
				group_doc.save()

		# Add item to selected groups
		for group_name in (option_groups or []):
			if frappe.db.exists("Product Option Group", group_name):
				group_doc = frappe.get_doc("Product Option Group", group_name)
				group_doc.append("applicable_items", {
					"item": item_code,
					"item_name": item.item_name,
				})
				group_doc.save()

	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def update_item_price(item_code, price, scope="local", card_name=None, pos_profile=None):
	"""Update item price locally (card only) or globally (price list + optionally all cards).

	scope = "local": Only update Restaurant Card Item.price for the given card
	scope = "global": Update Item Price + Item.standard_rate + sync ALL cards
	scope = "global_only": Update Item Price + Item.standard_rate only (no card sync)
	"""
	# //// Neoffice — its caller is the till (ItemEditPanel), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user(pos_profile)
	# And whoever manages the cards (the till's `manage_cards`), whatever the scope
	permissions.require_right("manage_cards")
	from frappe.utils import flt

	price = flt(price)

	if scope == "local" and card_name:
		permissions.require("Restaurant Card", "write", card_name)
		card = frappe.get_doc("Restaurant Card", card_name)
		for ci in card.items:
			if ci.item == item_code and ci.item_type == "Item":
				ci.price = price
		card.save()
		frappe.db.commit()
		return {"status": "ok", "scope": "local"}

	elif scope in ("global", "global_only"):
		# The item and the till's price list are the ERP's: their own rights, all checked before anything is written
		permissions.require("Item", "write", item_code)
		price_list = existing = None
		if pos_profile:
			price_list = frappe.get_cached_doc("POS Profile", pos_profile).selling_price_list
		if price_list:
			existing = frappe.db.get_value(
				"Item Price", {"item_code": item_code, "price_list": price_list}, "name"
			)
			permissions.require("Item Price", "write" if existing else "create", existing)

		# Update Item.standard_rate
		frappe.db.set_value("Item", item_code, "standard_rate", price)

		# Update Item Price in selling price list
		if price_list:
			if existing:
				frappe.db.set_value("Item Price", existing, "price_list_rate", price)
			else:
				frappe.get_doc({
					"doctype": "Item Price",
					"item_code": item_code,
					"price_list": price_list,
					"price_list_rate": price,
				}).insert()

		cards_updated = 0
		if scope == "global":
			# Sync price in all cards that have this item with a local override
			cards_with_item = frappe.get_all(
				"Restaurant Card Item",
				filters={"item": item_code, "item_type": "Item", "price": [">", 0]},
				fields=["parent", "name"]
			)
			for ci in cards_with_item:
				frappe.db.set_value("Restaurant Card Item", ci.name, "price", price)
			cards_updated = len(cards_with_item)

		frappe.db.commit()
		return {"status": "ok", "scope": scope, "cards_updated": cards_updated}

	return {"status": "error", "message": "Invalid scope or missing card_name"}


@frappe.whitelist()
def update_item_active(item_code, disabled=0, scope="local", card_name=None):
	"""Enable or disable an item on one card or all cards.

	scope = "local": Only toggle disabled on the given card
	scope = "all": Toggle disabled on ALL cards that have this item
	"""
	# //// Neoffice — its caller is the till (ItemEditPanel), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever manages the cards (the till's `manage_cards`), whatever the scope; a card is saved as that user
	permissions.require_right("manage_cards")
	from frappe.utils import cint

	disabled = cint(disabled)

	if scope == "local" and card_name:
		permissions.require("Restaurant Card", "write", card_name)
		card = frappe.get_doc("Restaurant Card", card_name)
		for ci in card.items:
			if ci.item == item_code and ci.item_type == "Item":
				ci.disabled = disabled
		card.save()
		frappe.db.commit()
		return {"status": "ok", "scope": "local"}

	elif scope == "all":
		# Toggle on all cards
		all_card_items = frappe.get_all(
			"Restaurant Card Item",
			filters={"item": item_code, "item_type": "Item"},
			fields=["parent", "name"]
		)
		for ci in all_card_items:
			frappe.db.set_value("Restaurant Card Item", ci.name, "disabled", disabled)
		frappe.db.commit()
		return {"status": "ok", "scope": "all", "cards_updated": len(all_card_items)}

	return {"status": "error", "message": "Invalid scope or missing card_name"}


@frappe.whitelist()
def get_card_items_extra(card_name):
	"""Return description + badges for all items in a card (for list display)."""
	permissions.require("Restaurant Card", "read", card_name)
	card = frappe.get_doc("Restaurant Card", card_name)
	result = {}

	for ci in card.items:
		if ci.item_type != "Item" or not ci.item:
			continue

		try:
			item_doc = frappe.get_cached_doc("Item", ci.item)
		except Exception:
			continue

		# Clean description
		raw_desc = item_doc.get("description") or ""
		clean_desc = plain_text(raw_desc)

		# Get badges
		badges = []
		if hasattr(item_doc, "custom_item_badges"):
			for row in item_doc.custom_item_badges:
				try:
					badge_doc = frappe.get_cached_doc("Menu Badge", row.menu_badge)
					badges.append({
						"badge_name": badge_doc.badge_name,
						"color": badge_doc.color,
						"icon": badge_doc.icon,
					})
				except Exception:
					pass

		result[ci.item] = {
			"description": clean_desc,
			"badges": badges,
			"spice_level": int(item_doc.get("custom_spice_level") or 0),
		}

	return result


# ─── Menu Badges & Allergens ─────────────────────────────────────────────────


@frappe.whitelist()
def get_menu_badges():
	"""Return all active Menu Badges."""
	permissions.require("Menu Badge", "read")
	return frappe.get_all(
		"Menu Badge",
		filters={"is_active": 1},
		fields=["name", "badge_name", "badge_type", "icon", "color", "description"],
		order_by="badge_type asc, badge_name asc",
	)


@frappe.whitelist()
def get_item_badges(item_code):
	"""Return badges and spice level for a specific item."""
	permissions.require("Menu Badge", "read")
	permissions.require("Item", "read", item_code)
	item = frappe.get_doc("Item", item_code)
	badges = []
	if hasattr(item, "custom_item_badges"):
		for row in item.custom_item_badges:
			badge_doc = frappe.get_cached_doc("Menu Badge", row.menu_badge)
			badges.append({
				"menu_badge": row.menu_badge,
				"badge_name": badge_doc.badge_name,
				"badge_type": badge_doc.badge_type,
				"icon": badge_doc.icon,
				"color": badge_doc.color,
			})
	return {"badges": badges, "spice_level": int(item.get("custom_spice_level") or 0)}


@frappe.whitelist()
def update_item_badges(item_code, badges=None, spice_level=0):
	"""Update badges and spice level for an item. Called from POS CardEditor."""
	# //// Neoffice — its caller is the till (useBadges), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever manages the cards (the till's `manage_cards`): the badges and the spice level of a dish are what its
	# card prints, the card's data, not the item sheet (_save_badges)
	permissions.require_right("manage_cards")
	_save_badges(frappe.get_doc("Item", item_code), badges, spice_level or 0)
	frappe.db.commit()
	return {"status": "ok"}


def _set_badges(item, badges=None, spice_level=None):
	"""Put the badges and spice level given (None: unchanged) on an item document."""
	import json

	from frappe.utils import cint

	if badges is not None:
		if isinstance(badges, str):
			badges = json.loads(badges)
		if hasattr(item, "custom_item_badges"):
			item.custom_item_badges = []
		for badge_name in badges or []:
			item.append("custom_item_badges", {"menu_badge": badge_name})
	if spice_level is not None:
		item.custom_spice_level = max(0, min(3, cint(spice_level)))


def _save_badges(item, badges=None, spice_level=None):
	"""Save the badges and spice level of a dish, and nothing else of its item.

	They are the card's data (what the printed card and the guest's menu show), managed with the cards: whoever manages
	the cards sets them without the ERP's right on the item sheet. The item is loaded as it is stored and only these two
	fields change, so saving it without the user's Item rights writes nothing else.
	"""
	_set_badges(item, badges, spice_level)
	item.flags.ignore_permissions = True
	item.save()


@frappe.whitelist()
def get_card_items_with_badges(card_name):
	"""Return card items enriched with badge info for menu preview/PDF."""
	permissions.require("Restaurant Card", "read", card_name)
	card = frappe.get_doc("Restaurant Card", card_name)
	categories = []
	current_category = {"label": "", "menu_items": []}

	for card_item in card.items:
		if card_item.get("disabled"):
			continue

		if card_item.item_type == "Category":
			if current_category["menu_items"] or current_category["label"]:
				categories.append(current_category)
			current_category = {"label": card_item.label or "", "menu_items": []}
			continue

		if card_item.item_type != "Item" or not card_item.item:
			continue

		item_doc = frappe.get_cached_doc("Item", card_item.item)
		badges = []
		if hasattr(item_doc, "custom_item_badges"):
			for row in item_doc.custom_item_badges:
				try:
					badge_doc = frappe.get_cached_doc("Menu Badge", row.menu_badge)
					# Encode PNG as base64 data URI for reliable rendering in PDF
					icon_data_uri = ""
					if badge_doc.icon:
						png_name = badge_doc.icon.replace(".svg", ".png")
						png_path = frappe.get_app_path("pos_next", "public", "icons", "badges", "png", png_name)
						try:
							import base64
							with open(png_path, "rb") as f:
								b64 = base64.b64encode(f.read()).decode("ascii")
								icon_data_uri = f"data:image/png;base64,{b64}"
						except FileNotFoundError:
							pass
					badges.append({
						"badge_name": badge_doc.badge_name,
						"badge_type": badge_doc.badge_type,
						"icon": badge_doc.icon,
						"color": badge_doc.color,
						"icon_uri": icon_data_uri,
					})
				except Exception:
					pass

		price = card_item.price or item_doc.get("standard_rate") or 0
		price_text = card_item.get("custom_price_text") or ""

		# Strip HTML tags from description
		raw_desc = item_doc.get("description") or ""
		clean_desc = plain_text(raw_desc)

		item_data = {
			"item_code": card_item.item,
			"item_name": card_item.label or item_doc.item_name,
			"description": clean_desc,
			"price": float(price),
			"price_text": price_text,
			"image": item_doc.get("image") or "",
			"badges": badges,
			"spice_level": int(item_doc.get("custom_spice_level") or 0),
			"product_options": [],
		}

		options = _get_item_product_options(card_item.item)
		if options:
			item_data["product_options"] = options

		current_category["menu_items"].append(item_data)

	if current_category["menu_items"]:
		categories.append(current_category)

	# Filter out empty categories (all items disabled)
	categories = [c for c in categories if c["menu_items"]]

	return {
		"card": {
			"card_name": card.card_name,
			"description": card.description or "",
			"image": card.image or "",
		},
		"categories": categories,
	}


def _get_item_product_options(item_code):
	"""Get product option groups applicable to an item."""
	group_names = _get_applicable_option_groups(item_code)
	if not group_names:
		return []

	groups = frappe.get_all(
		"Product Option Group",
		filters={"name": ("in", group_names)},
		fields=["name", "group_name", "selection_type"],
	)
	result = []
	for g in groups:
		options = frappe.get_all(
			"Product Option",
			filters={"parent": g.name},
			fields=["option_name", "price_adjustment"],
			order_by="idx asc",
		)
		opt_texts = [
			o.option_name + (f" (+{o.price_adjustment})" if o.price_adjustment else "")
			for o in options
		]
		result.append({"group_name": g.group_name, "options": opt_texts})
	return result


def _get_applicable_option_groups(item_code):
	"""Return list of Product Option Group names applicable to an item."""
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
	return list(set(direct + group_based))
