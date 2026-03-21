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
	"""Fetch all restaurant areas and tables."""
	areas = frappe.get_all("Restaurant Area", fields=["name", "area_name", "description"])
	tables = frappe.get_all("Restaurant Table", fields=["name", "table_name", "area", "capacity", "status"])
	return {
		"areas": areas,
		"tables": tables
	}

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
