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
	if not frappe.has_permission("Restaurant Table", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Restaurant Table", table_name):
		frappe.throw(_("Table {0} not found").format(table_name))

	frappe.db.set_value("Restaurant Table", table_name, "status", status)
	frappe.publish_realtime("table_update")
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
	frappe.publish_realtime("table_update")
	return {"status": "success"}

@frappe.whitelist()
def update_kds_status(invoice_name, status):
	"""Update the KDS status of a sales invoice and all its items."""
	if not frappe.has_permission("Sales Invoice", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Sales Invoice", invoice_name):
		frappe.throw(_("Invoice {0} not found").format(invoice_name))

	frappe.db.set_value("Sales Invoice", invoice_name, "kds_status", status)

	# Also update all items that are not already in a later status
	if frappe.db.has_column("Sales Invoice Item", "kds_status"):
		status_order = {"Pending": 0, "Preparing": 1, "Ready": 2, "Delivered": 3}
		new_rank = status_order.get(status, 0)
		items = frappe.get_all("Sales Invoice Item",
			filters={"parent": invoice_name},
			fields=["name", "kds_status"])
		for item in items:
			current_rank = status_order.get(item.kds_status, 0)
			# Skip Waiting items, only advance items forward, never backward
			if item.kds_status not in ["", "Waiting"] and current_rank < new_rank:
				frappe.db.set_value("Sales Invoice Item", item.name, "kds_status", status, update_modified=False)

	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("table_update")
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
	"""Return a mapping of item_code -> station and item_group -> station for all active stations."""
	stations = frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
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
		fields=["name", "customer", "restaurant_table", "kds_status", "creation", "modified",
				"is_takeaway", "takeaway_number"]
	)

	# Filter purely in Python - include orders with table OR takeaway orders
	orders = [o for o in raw_orders if o.get("restaurant_table") or o.get("is_takeaway")]

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

	# Build station maps for resolving items without explicit preparation_station
	_station_map = {}
	_group_station_map = {}
	_all_stations = frappe.get_all("Preparation Station", filters={"is_active": 1}, fields=["name", "station_name", "color"])
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
		# Fallback: first active station if no match found
		_default_station = _all_stations[0].name if _all_stations else None
		for item in items:
			if not item.get("preparation_station"):
				resolved_station = None
				if item.item_code in _station_map:
					resolved_station = _station_map[item.item_code]
				else:
					item_group = frappe.db.get_value("Item", item.item_code, "item_group")
					if item_group and item_group in _group_station_map:
						resolved_station = _group_station_map[item_group]
				# Fallback to first station if no match
				if not resolved_station:
					resolved_station = _default_station
				if resolved_station:
					item["preparation_station"] = resolved_station
					# Persist to DB so counts and filters work everywhere
					frappe.db.set_value("Sales Invoice Item", item.name, "preparation_station", resolved_station, update_modified=False)

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
def create_station(station_name, station_type="Kitchen", color="#F97316", area=None, pos_x=0, pos_y=0):
	"""Create a new preparation station."""
	if not frappe.has_permission("Preparation Station", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	doc = frappe.get_doc({
		"doctype": "Preparation Station",
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
			{"item": r.item, "item_name": r.item_name, "prep_time": r.prep_time or 0, "priority": r.priority or "Normal"}
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
		doc.items = []
		for row in items:
			doc.append("items", {
				"item": row.get("item"),
				"prep_time": cint(row.get("prep_time", 0)),
				"priority": row.get("priority", "Normal"),
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

	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def delete_station(name):
	"""Delete a preparation station."""
	frappe.delete_doc("Preparation Station", name, ignore_permissions=True)
	return {"status": "success"}


@frappe.whitelist()
def open_table(table_name, pos_profile, customer=None):
	"""Open a table by creating a draft Sales Invoice linked to it.
	Returns the existing draft if one already exists for this table.
	"""
	if not frappe.has_permission("Sales Invoice", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Restaurant Table", table_name):
		frappe.throw(_("Table {0} not found").format(table_name))

	# Check for existing draft first
	existing = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0, "restaurant_table": table_name},
		fields=["name"],
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
		# Enrich with images
		for item in items:
			item["image"] = frappe.db.get_value("Item", item.item_code, "image") or ""

		return {
			"name": order.name,
			"items": items,
			"customer": frappe.db.get_value("Sales Invoice", order.name, "customer"),
			"kds_status": frappe.db.get_value("Sales Invoice", order.name, "kds_status"),
			"is_new": False,
		}

	# No existing draft — return empty result, draft will be created at first "Valider"
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
	import json
	if isinstance(options, str):
		options = json.loads(options)
	if isinstance(applicable_items, str):
		applicable_items = json.loads(applicable_items)
	if isinstance(applicable_item_groups, str):
		applicable_item_groups = json.loads(applicable_item_groups)

	doctype, option_dt, item_dt = _resolve_option_doctypes()
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
	doc.save(ignore_permissions=True)
	return {"status": "success"}


@frappe.whitelist()
def create_product_option_group(group_name):
	"""Create a new product option group."""
	doctype = _resolve_option_doctypes()[0]
	doc = frappe.get_doc({
		"doctype": doctype,
		"group_name": group_name,
		"selection_type": "Single",
		"required": 0,
	})
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def delete_product_option_group(name):
	"""Delete a product option group."""
	doctype = _resolve_option_doctypes()[0]
	frappe.delete_doc(doctype, name, ignore_permissions=True)
	return {"status": "success"}


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

	fields = ["name", "group_name", "selection_type", "required", "max_selections"]
	if frappe.db.has_column(doctype, "apply_to_all_items"):
		fields.append("apply_to_all_items")

	groups = frappe.get_all(doctype, fields=fields)

	for group in groups:
		group["options"] = frappe.get_all(
			option_dt,
			filters={"parent": group.name},
			fields=["option_name", "price_adjustment", "is_default"],
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
	"""Fetch active restaurant cards filtered by date and current time slot assignment."""
	from frappe.utils import today

	cards = frappe.get_all(
		"Restaurant Card",
		filters={"is_active": 1},
		fields=["name", "card_name", "description", "image", "available_from", "available_to"]
	)

	current_date = today()

	# Get cards assigned to current time slot via opening hours
	slot_cards = _get_current_slot_cards()

	result = []
	for card in cards:
		# Date filtering
		if card.get("available_from") and str(card.available_from) > current_date:
			continue
		if card.get("available_to") and str(card.available_to) < current_date:
			continue

		# Time slot filtering: if slots have cards assigned, only show those cards
		if slot_cards is not None and card.name not in slot_cards:
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
					["item_name", "image", "custom_color", "item_group", "standard_rate"], as_dict=True)
				if item_data:
					ci["item_name"] = item_data.item_name
					ci["image"] = item_data.image
					ci["custom_color"] = item_data.custom_color
					ci["item_group"] = item_data.item_group
					ci["default_price"] = item_data.standard_rate or 0
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
		result.append(card)

	return result


@frappe.whitelist()
def duplicate_card(card_name):
	"""Duplicate a restaurant card with all its items."""
	original = frappe.get_doc("Restaurant Card", card_name)
	new_doc = frappe.copy_doc(original)
	new_doc.card_name = f"{original.card_name} (Copy)"
	new_doc.is_active = 0
	new_doc.insert(ignore_permissions=True)
	return new_doc.as_dict()


@frappe.whitelist()
def get_card_items_stock(card_name):
	"""Get stock quantities for stock-managed items in a card, grouped by warehouse."""
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


@frappe.whitelist()
def get_restaurant_settings():
	"""Return restaurant opening hours and current status."""
	from frappe.utils import nowtime, get_time, nowdate, getdate

	try:
		settings = frappe.get_single("Restaurant Settings")
	except Exception:
		return {"opening_hours": [], "is_open": True, "current_slot": None}

	hours = []
	for row in settings.opening_hours:
		hours.append({
			"day_of_week": row.day_of_week,
			"from_time": _format_time(row.from_time),
			"to_time": _format_time(row.to_time),
			"label": row.label,
			"restaurant_card": row.restaurant_card if hasattr(row, "restaurant_card") else None,
		})

	is_open, current_slot = _check_restaurant_open(hours)

	return {
		"opening_hours": hours,
		"is_open": is_open,
		"current_slot": current_slot,
		"enable_runner": bool(settings.enable_runner) if hasattr(settings, "enable_runner") else True,
		"enable_takeaway": bool(frappe.db.get_single_value("POS Settings", "enable_takeaway") or 0),
		"takeaway_card": frappe.db.get_single_value("POS Settings", "takeaway_card") or None,
		"enable_tips": bool(settings.enable_tips) if hasattr(settings, "enable_tips") else False,
		"auto_detect_tip": bool(settings.auto_detect_tip) if hasattr(settings, "auto_detect_tip") else True,
		"tip_item": settings.tip_item if hasattr(settings, "tip_item") else None,
		"tip_account": settings.tip_account if hasattr(settings, "tip_account") else None,
	}


@frappe.whitelist()
def save_restaurant_settings(opening_hours):
	"""Save restaurant opening hours from the POS frontend."""
	import json

	if not frappe.has_permission("Restaurant Settings", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if isinstance(opening_hours, str):
		opening_hours = json.loads(opening_hours)

	settings = frappe.get_single("Restaurant Settings")
	settings.opening_hours = []

	for row in opening_hours:
		settings.append("opening_hours", {
			"day_of_week": row.get("day_of_week"),
			"from_time": row.get("from_time"),
			"to_time": row.get("to_time"),
			"label": row.get("label"),
			"restaurant_card": row.get("restaurant_card"),
		})

	settings.save()
	return {"status": "success"}


@frappe.whitelist()
def save_tip_settings(enable_tips=0, auto_detect_tip=1):
	"""Save tip-related settings and auto-create TIP item/account if needed."""
	if not frappe.has_permission("Restaurant Settings", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	settings = frappe.get_single("Restaurant Settings")
	settings.enable_tips = int(enable_tips)
	settings.auto_detect_tip = int(auto_detect_tip)
	settings.save()

	return {
		"status": "success",
		"tip_item": settings.tip_item,
		"tip_account": settings.tip_account,
	}


@frappe.whitelist()
def get_restaurant_status():
	"""Lightweight endpoint returning restaurant open/closed status and card availability."""

	# Get opening hours
	try:
		settings = frappe.get_single("Restaurant Settings")
		hours = [
			{
				"day_of_week": r.day_of_week,
				"from_time": str(r.from_time) if r.from_time else None,
				"to_time": str(r.to_time) if r.to_time else None,
				"label": r.label,
			}
			for r in settings.opening_hours
		]
	except Exception:
		# No settings configured = always open, no warnings
		return {"is_open": True, "current_slot": None, "has_active_cards": True, "warning": None}

	# If no hours defined, restaurant is considered always open
	if not hours:
		return {"is_open": True, "current_slot": None, "has_active_cards": True, "warning": None}

	is_open, current_slot = _check_restaurant_open(hours)

	if not is_open:
		return {"is_open": False, "current_slot": None, "has_active_cards": False, "warning": None}

	# Check if there are active cards for the current time
	active_cards = get_active_cards()
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


def _get_current_slot_cards():
	"""Return set of card names assigned to the current time slot, or None if no slots have cards."""
	import calendar
	from frappe.utils import nowtime, get_time, nowdate, getdate

	try:
		settings = frappe.get_single("Restaurant Settings")
	except Exception:
		return None

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
	doc.save(ignore_permissions=True)
	return {"status": "success"}


@frappe.whitelist()
def create_preparation_workflow(workflow_name, steps=None):
	"""Create a new preparation workflow."""
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
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def delete_preparation_workflow(name):
	"""Delete a preparation workflow."""
	frappe.delete_doc("Preparation Workflow", name, ignore_permissions=True)
	return {"status": "success"}


@frappe.whitelist()
def get_station_workflows():
	"""Fetch all active stations with their resolved workflow steps."""
	stations = frappe.get_all(
		"Preparation Station",
		filters={"is_active": 1},
		fields=["name", "station_name", "color"]
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
def get_runner_orders(area=None):
	"""Fetch orders with items ready for pickup (at last workflow step, not yet Delivered).

	Args:
		area: Optional area name to filter tables by area.
	"""
	raw_orders = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0},
		fields=["name", "customer", "restaurant_table", "kds_status", "creation", "modified"]
	)

	orders = [o for o in raw_orders if o.get("restaurant_table")]

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
	all_stations = frappe.get_all("Preparation Station", filters={"is_active": 1}, fields=["name", "station_name", "color"])
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
	"""Mark specific items (or all ready items) as Delivered."""
	import json

	if not frappe.has_permission("Sales Invoice", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

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
def get_takeaway_orders():
	"""Fetch active takeaway orders (draft invoices with is_takeaway=1)."""
	raw_orders = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 0,
			"is_pos": 1,
			"is_takeaway": 1,
		},
		fields=["name", "customer_name", "grand_total", "kds_status",
				"takeaway_number", "creation", "modified"],
		order_by="creation asc",
	)

	result = []
	for order in raw_orders:
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

	current_date = today()
	count = frappe.db.count("Sales Invoice", filters={
		"is_takeaway": 1,
		"creation": [">=", f"{current_date} 00:00:00"],
	})
	return f"T-{(count + 1):03d}"


@frappe.whitelist()
def update_takeaway_status(invoice_name, status):
	"""Update the KDS status of a takeaway order."""
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
):
	"""Create a new Item from the POS Card Editor with prices and optional stock."""
	from frappe.utils import cint, flt
	import json

	if not frappe.has_permission("Item", "create"):
		frappe.throw(_("You don't have permission to create items"), frappe.PermissionError)

	if not item_name or not item_group or not stock_uom:
		frappe.throw(_("Item Name, Item Group, and Unit of Measure are required"))

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
				group_doc.save(ignore_permissions=True)

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


@frappe.whitelist()
def download_food_image(image_url, item_name):
	"""Download an external image and save it as a Frappe File."""
	import requests

	try:
		response = requests.get(image_url, timeout=15)
		response.raise_for_status()
	except Exception as e:
		frappe.log_error("Image download failed", str(e))
		frappe.throw(_("Failed to download image"))

	filename = f"{frappe.scrub(item_name)}.jpg"
	file_doc = frappe.get_doc({
		"doctype": "File",
		"file_name": filename,
		"content": response.content,
		"is_private": 0,
	})
	file_doc.save(ignore_permissions=True)
	return file_doc.file_url


@frappe.whitelist()
def duplicate_card(card_name):
	"""Duplicate a restaurant card with all its items."""
	original = frappe.get_doc("Restaurant Card", card_name)
	new_doc = frappe.copy_doc(original)
	new_doc.card_name = f"{original.card_name} (Copy)"
	new_doc.is_active = 0
	new_doc.insert(ignore_permissions=True)
	return new_doc.as_dict()


@frappe.whitelist()
def get_card_items_stock(card_name):
	"""Get stock quantities for stock-managed items in a card, grouped by warehouse."""
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


# ─── Menu Badges & Allergens ─────────────────────────────────────────────────


@frappe.whitelist()
def get_menu_badges():
	"""Return all active Menu Badges."""
	return frappe.get_all(
		"Menu Badge",
		filters={"is_active": 1},
		fields=["name", "badge_name", "badge_type", "icon", "color", "description"],
		order_by="badge_type asc, badge_name asc",
	)


@frappe.whitelist()
def get_item_badges(item_code):
	"""Return badges and spice level for a specific item."""
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
	import json

	if isinstance(badges, str):
		badges = json.loads(badges)
	spice_level = int(spice_level or 0)

	item = frappe.get_doc("Item", item_code)
	if hasattr(item, "custom_item_badges"):
		item.custom_item_badges = []

	for badge_name in (badges or []):
		item.append("custom_item_badges", {"menu_badge": badge_name})

	item.custom_spice_level = max(0, min(3, spice_level))
	item.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def get_card_items_with_badges(card_name):
	"""Return card items enriched with badge info for menu preview/PDF."""
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
					badges.append({
						"badge_name": badge_doc.badge_name,
						"badge_type": badge_doc.badge_type,
						"icon": badge_doc.icon,
						"color": badge_doc.color,
					})
				except Exception:
					pass

		price = card_item.price or item_doc.get("standard_rate") or 0
		price_text = card_item.get("custom_price_text") or ""

		# Strip HTML tags from description
		raw_desc = item_doc.get("description") or ""
		clean_desc = frappe.utils.strip_html_tags(raw_desc).strip() if raw_desc else ""

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
