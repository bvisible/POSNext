import frappe
from frappe import _


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
def get_tables():
	"""Fetch all restaurant areas, tables, floor plan stations, and active order summaries."""
	areas = frappe.get_all("Restaurant Area", fields=["name", "area_name", "description", "sort_order"], order_by="sort_order asc, area_name asc")
	tables = frappe.get_all("Restaurant Table", fields=["name", "table_name", "area", "capacity", "status", "pos_x", "pos_y", "width", "height", "shape"])

	# Fetch stations that should appear on floor plan
	stations = []
	if frappe.db.has_column("Preparation Station", "show_on_floor_plan"):
		stations = frappe.get_all("Preparation Station",
			filters={"is_active": 1, "show_on_floor_plan": 1},
			fields=["name", "station_name", "station_type", "color", "area", "pos_x", "pos_y", "width", "height"]
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

	for table in tables:
		table["order_summary"] = order_map.get(table.name)

	return {"areas": areas, "tables": tables, "stations": stations}

@frappe.whitelist()
def update_table_status(table_name, status):
	"""Update the status of a specific table."""
	if not frappe.has_permission("Restaurant Table", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Restaurant Table", table_name):
		frappe.throw(_("Table {0} not found").format(table_name))

	frappe.db.set_value("Restaurant Table", table_name, "status", status)
	return {"status": "success"}

@frappe.whitelist()
def reset_all_tables():
	"""Reset all occupied tables to Empty and clear associated draft invoices."""
	if not frappe.has_permission("Restaurant Table", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	# Clear restaurant_table and kds_status on all draft invoices linked to tables
	frappe.db.sql("""
		UPDATE `tabSales Invoice`
		SET restaurant_table = NULL, kds_status = NULL
		WHERE docstatus = 0 AND restaurant_table IS NOT NULL
	""")

	# Reset all occupied tables to Empty
	frappe.db.sql("UPDATE `tabRestaurant Table` SET status='Empty' WHERE status='Occupied'")
	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	return {"status": "success"}

@frappe.whitelist()
def update_kds_status(invoice_name, status):
	"""Update the KDS status of a sales invoice."""
	if not frappe.has_permission("Sales Invoice", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Sales Invoice", invoice_name):
		frappe.throw(_("Invoice {0} not found").format(invoice_name))

	frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", status)
	frappe.publish_realtime("kds_update")
	return {"status": "success"}

@frappe.whitelist()
def broadcast_cfd_update(payload):
	"""Broadcasts CFD payload to all clients using Frappe Realtime."""
	if isinstance(payload, str):
		import json
		payload = json.loads(payload)
	frappe.publish_realtime("cfd_update", payload)
	return {"status": "success"}

@frappe.whitelist()
def get_preparation_stations():
	"""Fetch all active preparation stations."""
	return frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
		fields=["name", "station_name", "station_type", "color"],
		order_by="station_name"
	)

@frappe.whitelist()
def get_station_items_map():
	"""Return a mapping of item_code -> station_name for all active stations."""
	stations = frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
		fields=["name", "station_name", "color"]
	)
	result = {}
	for station in stations:
		items = frappe.get_all(
			"Preparation Station Item",
			filters={"parent": station.name},
			fields=["item"]
		)
		for item in items:
			result[item.item] = {
				"station": station.name,
				"station_name": station.station_name,
				"color": station.color
			}
	return result


@frappe.whitelist()
def get_table_order(table_name):
	"""Get the active draft invoice for a specific table."""
	orders = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 0,
			"restaurant_table": table_name,
		},
		fields=["name", "customer", "restaurant_table", "kds_status", "grand_total"],
		order_by="modified desc",
		limit=1
	)

	if not orders:
		return None

	order = orders[0]

	# Fetch items
	item_fields = ["item_code", "item_name", "qty", "rate", "amount", "uom"]
	if frappe.db.has_column("Sales Invoice Item", "posa_special_instructions"):
		item_fields.append("posa_special_instructions")
	if frappe.db.has_column("Sales Invoice Item", "preparation_station"):
		item_fields.append("preparation_station")
	if frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers"):
		item_fields.append("posa_item_modifiers")

	order["items"] = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": order.name},
		fields=item_fields
	)

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
def get_kds_orders(station=None):
	"""Fetch all pending and preparing orders for the KDS."""
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
		fields=["name", "customer", "restaurant_table", "kds_status", "creation", "modified"]
	)

	# Filter purely in Python
	valid_statuses = ["Pending", "Preparing", "Ready"]
	orders = [o for o in raw_orders if o.get("restaurant_table") and o.get("kds_status") in valid_statuses]

	# Fallback safety: Check if the custom field actually exists in the DB to prevent 500 errors
	# if the user hasn't run `bench migrate` yet.
	has_instructions_field = frappe.db.has_column("Sales Invoice Item", "posa_special_instructions")
	has_kds_status_field = frappe.db.has_column("Sales Invoice Item", "kds_status")
	item_fields = ["item_code", "item_name", "qty", "description", "preparation_station"]

	if has_instructions_field:
		item_fields.append("posa_special_instructions")

	if has_kds_status_field:
		item_fields.append("kds_status")

	for order in orders:
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order.name},
			fields=item_fields
		)

		# Filter by station if specified
		if station:
			items = [i for i in items if i.get("preparation_station") == station]

		order["items"] = items

	# Check if all items in an order are ready or delivered
	for order in orders:
		if has_kds_status_field:
			all_ready = all(i.get("kds_status") in ["Ready", "Delivered"] for i in order.get("items", []))
			if all_ready and order.get("items"):
				order["order_complete"] = True

	return orders


@frappe.whitelist()
def update_item_kds_status(invoice_name, item_code, status):
	"""Update the KDS status of a specific item in a sales invoice."""
	if not frappe.has_permission("Sales Invoice", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	items = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": invoice_name, "item_code": item_code},
		fields=["name"]
	)

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
	if isinstance(positions, str):
		positions = json.loads(positions)

	if not isinstance(positions, list):
		frappe.throw(_("Invalid positions data"))

	if not frappe.has_permission("Restaurant Table", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

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
	if isinstance(positions, str):
		positions = json.loads(positions)

	if not isinstance(positions, list):
		frappe.throw(_("Invalid positions data"))

	if not frappe.has_permission("Preparation Station", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

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
def create_table(table_name, area, capacity=4, shape="Square", pos_x=0, pos_y=0):
	"""Create a new restaurant table."""
	if not frappe.has_permission("Restaurant Table", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	doc = frappe.get_doc({
		"doctype": "Restaurant Table",
		"table_name": table_name,
		"area": area,
		"capacity": int(capacity),
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
def get_item_modifiers(item_code):
	"""Get all modifier groups applicable to an item."""
	# Find groups where item is in applicable_items OR apply_to_all_items is checked
	all_groups = frappe.get_all(
		"Item Modifier Group",
		fields=["name", "group_name", "selection_type", "required", "max_selections", "apply_to_all_items"]
	)

	result = []
	for group in all_groups:
		applicable = group.get("apply_to_all_items")
		if not applicable:
			# Check if item is in the applicable_items child table
			applicable = frappe.db.exists(
				"Item Modifier Group Item",
				{"parent": group.name, "item": item_code}
			)

		if applicable:
			# Fetch options for this group
			options = frappe.get_all(
				"Item Modifier Option",
				filters={"parent": group.name},
				fields=["option_name", "price_adjustment", "is_default"],
				order_by="idx"
			)
			group["options"] = options
			result.append(group)

	return result

@frappe.whitelist()
def get_all_modifier_groups():
	"""Get all modifier groups with their options and applicable items for frontend caching."""
	groups = frappe.get_all(
		"Item Modifier Group",
		fields=["name", "group_name", "selection_type", "required", "max_selections", "apply_to_all_items"]
	)

	for group in groups:
		group["options"] = frappe.get_all(
			"Item Modifier Option",
			filters={"parent": group.name},
			fields=["option_name", "price_adjustment", "is_default"],
			order_by="idx"
		)
		if not group.get("apply_to_all_items"):
			group["applicable_items"] = [
				r.item for r in frappe.get_all(
					"Item Modifier Group Item",
					filters={"parent": group.name},
					fields=["item"]
				)
			]
		else:
			group["applicable_items"] = []

	return groups


@frappe.whitelist()
def reorder_areas(order):
	"""Update area sort order."""
	import json
	if isinstance(order, str):
		order = json.loads(order)

	if not frappe.has_permission("Restaurant Area", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	for idx, area_name in enumerate(order):
		if frappe.db.exists("Restaurant Area", area_name):
			frappe.db.set_value("Restaurant Area", area_name, "sort_order", idx)

	frappe.db.commit()
	return {"status": "success"}

@frappe.whitelist()
def create_area(area_name):
	"""Create a new restaurant area."""
	if not frappe.has_permission("Restaurant Area", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	doc = frappe.get_doc({"doctype": "Restaurant Area", "area_name": area_name})
	doc.insert()
	return doc.as_dict()

@frappe.whitelist()
def rename_area(name, new_name):
	"""Rename a restaurant area."""
	if not frappe.has_permission("Restaurant Area", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	frappe.rename_doc("Restaurant Area", name, new_name)
	return {"status": "success"}

@frappe.whitelist()
def delete_area(name):
	"""Delete a restaurant area (only if no tables/stations assigned)."""
	if not frappe.has_permission("Restaurant Area", "delete"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	tables_count = frappe.db.count("Restaurant Table", {"area": name})
	if tables_count > 0:
		frappe.throw(_("Cannot delete area with {0} tables assigned").format(tables_count))

	frappe.delete_doc("Restaurant Area", name)
	return {"status": "success"}


@frappe.whitelist()
def get_active_cards():
	"""Fetch active restaurant cards with enriched item data."""
	from frappe.utils import today

	cards = frappe.get_all(
		"Restaurant Card",
		filters={"is_active": 1},
		fields=["name", "card_name", "description", "image", "available_from", "available_to"]
	)

	current_date = today()
	result = []
	for card in cards:
		if card.get("available_from") and str(card.available_from) > current_date:
			continue
		if card.get("available_to") and str(card.available_to) < current_date:
			continue

		items = frappe.get_all(
			"Restaurant Card Item",
			filters={"parent": card.name},
			fields=["item_type", "label", "item", "menu", "price", "sort_order"],
			order_by="sort_order asc, idx asc"
		)

		for ci in items:
			if ci.item_type == "Item" and ci.item:
				item_data = frappe.db.get_value("Item", ci.item,
					["item_name", "image", "standard_rate"], as_dict=True)
				if item_data:
					ci["item_name"] = item_data.item_name
					ci["image"] = item_data.image
					ci["default_price"] = item_data.standard_rate or 0
			elif ci.item_type == "Menu" and ci.menu:
				menu_data = frappe.db.get_value("Restaurant Menu", ci.menu,
					["menu_name", "price", "image"], as_dict=True)
				if menu_data:
					ci["menu_name"] = menu_data.menu_name
					ci["image"] = menu_data.image
					ci["default_price"] = menu_data.price or 0

		card["items"] = items
		result.append(card)

	return result


@frappe.whitelist()
def get_active_menus():
	"""Fetch all active restaurant menus with their courses."""
	import json
	from frappe.utils import today

	filters = {"is_active": 1}
	menus = frappe.get_all(
		"Restaurant Menu",
		filters=filters,
		fields=["name", "menu_name", "price", "description", "image", "available_from", "available_to"]
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
