# //// Neoffice — added file (no upstream equivalent). A bill settled while a dish of it is still at the kitchen (ticket
# //// neoffice-maintenance#2163, the restaurant film of 02.11.2026): the kitchen's and the runner's screens read the
# //// drafts only, so paying the table made its ticket vanish from the kitchen with the plate still on the stove, and the
# //// runner never saw it come up. A paid order now stays an order of the kitchen and of the pass until its dishes are
# //// delivered, for the hours of a service.
"""A paid order whose dishes are not all delivered stays on the kitchen's and the runner's screens."""

import frappe
from frappe.utils import add_to_date, get_datetime, now_datetime

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
