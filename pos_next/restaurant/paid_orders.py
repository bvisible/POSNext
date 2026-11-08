# //// Neoffice — added file (no upstream equivalent). A bill settled while a dish of it is still at the kitchen (ticket
# //// neoffice-maintenance#2163, the restaurant film of 02.11.2026): the kitchen's and the runner's screens read the
# //// drafts only, so paying the table made its ticket vanish from the kitchen with the plate still on the stove, and the
# //// runner never saw it come up. A paid order now stays an order of the kitchen and of the pass until its dishes are
# //// delivered, for the hours of a service.
# ////
# //// And so does its TABLE (product owner, 08.11.2026: « quand on encaisse une table qui n'est pas encore livrée, le paiement vide la table »): a table
# //// whose bill is settled while dishes or drinks are still to serve stays Occupied, and goes to Cleaning when the last one is delivered.
"""A paid order whose dishes are not all delivered stays on the kitchen's and the runner's screens, and keeps its table."""

import frappe
from frappe.utils import add_to_date, get_datetime, now_datetime

from pos_next.restaurant import notes as notes_module

# The kitchen's states of a dish sent and not delivered yet (restaurant._KDS_LIVE)
AT_THE_KITCHEN = ("Pending", "Preparing", "Ready")
# How long after its payment (its last write) a paid order may still be the kitchen's: a service, not a day. An order paid
# before this rule, whose dishes nobody could deliver once its ticket had vanished, does not come back on the screens.
SERVICE_HOURS = 12


def since():
	"""The oldest moment a paid order may have been written and still be the kitchen's."""
	return add_to_date(now_datetime(), hours=-SERVICE_HOURS)


def is_paid_order_of_the_kitchen(order) -> bool:
	"""Whether a submitted order may still be worked on by the kitchen's and the pass's screens: paid within the hours
	of a service. `order` carries `docstatus` and `modified`; whether it is at a table or to take away is the caller's.

	A delivery taken back (the undo of the screens) is a move of such an order too, so that the last dish of a paid
	table can be put back at the pass as a draft's can."""
	if not order or order.get("docstatus") != 1 or not order.get("modified"):
		return False
	return get_datetime(order.get("modified")) >= since()


def paid_orders_at_the_kitchen(fields):
	"""The paid orders, at a table or to take away, written within the hours of a service, that still have a dish
	at the kitchen (sent and not delivered), with `fields`. Empty on a site whose lines have no kitchen status yet."""
	if not frappe.db.has_column("Sales Invoice Item", "kds_status"):
		return []
	names = frappe.db.sql_list(
		"""
		select distinct si.name
		from `tabSales Invoice` si
		join `tabSales Invoice Item` sii on sii.parent = si.name and sii.parenttype = 'Sales Invoice'
		where si.docstatus = 1
			and si.modified >= %(since)s
			and (ifnull(si.restaurant_table, '') != '' or si.is_takeaway = 1)
			and sii.kds_status in %(at_the_kitchen)s
		""",
		{"since": since(), "at_the_kitchen": AT_THE_KITCHEN},
	)
	if not names:
		return []
	return frappe.get_all("Sales Invoice", filters={"name": ["in", names]}, fields=fields)


def lines_to_serve_by_order(tables):
	"""`{paid order: how many of its lines are still at the kitchen}` for the paid orders of `tables`, written within the hours of a service.

	The same lines the kitchen's and the pass's screens still show (`AT_THE_KITCHEN`), so that a table is kept for a dish somebody can deliver
	and for none that nobody can. Empty on a site whose lines have no kitchen status yet.
	"""
	tables = [table for table in tables if table]
	if not tables or not frappe.db.has_column("Sales Invoice Item", "kds_status"):
		return {}
	rows = frappe.db.sql(
		"""
		select si.name, count(*)
		from `tabSales Invoice` si
		join `tabSales Invoice Item` sii on sii.parent = si.name and sii.parenttype = 'Sales Invoice'
		where si.docstatus = 1
			and si.modified >= %(since)s
			and si.restaurant_table in %(tables)s
			and sii.kds_status in %(at_the_kitchen)s
		group by si.name
		""",
		{"since": since(), "tables": tuple(tables), "at_the_kitchen": AT_THE_KITCHEN},
	)
	return {name: count for name, count in rows}


def dishes_left_to_serve(table) -> int:
	"""How many lines of the paid orders of one table are still to serve (sent to the kitchen or the bar and not delivered)."""
	return sum(lines_to_serve_by_order([table]).values())


def status_after_payment(table, leaving=None) -> str:
	"""The status a table takes when one of its notes has just been paid (`leaving`).

	Occupied while another note is open, or while a dish or a drink of the paid notes is still to serve: the party is still there, the kitchen and
	the pass still work for the table, and a waiter who finds it « to clean » would clear it under their plates. Cleaning otherwise, as it always was.
	"""
	if notes_module.another_note_is_open(table, leaving) or dishes_left_to_serve(table):
		return "Occupied"
	return "Cleaning"


def release_when_served(invoice_name) -> bool:
	"""A table that kept its seat for dishes to serve goes to Cleaning once the last of them is delivered (and no note is open). True when it did.

	Called after a dish has moved on the kitchen's and the pass's screens. It touches an Occupied table only, and only one with no open note
	and nothing left to serve: a table with a party seated, a Cleaning or Empty table are left as they are.
	"""
	order = frappe.db.get_value("Sales Invoice", invoice_name, ["docstatus", "restaurant_table"], as_dict=True)
	if not order or order.docstatus != 1 or not order.restaurant_table:
		return False
	table = order.restaurant_table
	if not frappe.db.exists("Restaurant Table", table):
		return False
	if frappe.db.get_value("Restaurant Table", table, "status", for_update=True) != "Occupied":
		return False
	if notes_module.another_note_is_open(table) or dishes_left_to_serve(table):
		return False
	frappe.db.set_value("Restaurant Table", table, "status", "Cleaning")
	frappe.publish_realtime("table_update")
	return True
