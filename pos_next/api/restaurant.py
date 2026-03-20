import frappe
from frappe import _

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
	tables = frappe.get_all("Restaurant Table", fields=["name", "table_name", "area", "capacity", "status", "pos_x", "pos_y", "width", "height", "shape"])
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
def save_table_positions(positions):
	"""Save table positions from the floor plan editor."""
	import json
	if isinstance(positions, str):
		positions = json.loads(positions)

	if not frappe.has_permission("Restaurant Table", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	for pos in positions:
		if not frappe.db.exists("Restaurant Table", pos.get("name")):
			continue
		frappe.db.set_value("Restaurant Table", pos["name"], {
			"pos_x": int(pos.get("pos_x", 0)),
			"pos_y": int(pos.get("pos_y", 0)),
			"width": int(pos.get("width", 100)),
			"height": int(pos.get("height", 100)),
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
def get_kds_orders():
	"""Fetch all pending and preparing orders for the KDS."""
	raw_orders = frappe.get_all(
		"Sales Invoice",
		filters={
			"docstatus": 0,
		},
		fields=["name", "customer", "restaurant_table", "kds_status", "creation", "modified"]
	)

	# Filter in Python to avoid missing column issues before bench migrate
	valid_statuses = ["Pending", "Preparing", "Ready"]
	orders = [o for o in raw_orders if o.get("restaurant_table") and o.get("kds_status") in valid_statuses]

	has_instructions_field = frappe.db.has_column("Sales Invoice Item", "posa_special_instructions")
	item_fields = ["item_code", "item_name", "qty", "description"]

	if has_instructions_field:
		item_fields.append("posa_special_instructions")

	for order in orders:
		order["items"] = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order.name},
			fields=item_fields
		)

	return orders
