# //// Neoffice — added file (no upstream equivalent). Upstream POSNext shows a table order's lines on the
# //// kitchen screens only. Apps that print kitchen tickets (cloudprnt: one ticket per preparation station on
# //// its own printer) listen to the moment lines go to the kitchen through the hook pos_next_kitchen_send,
# //// declared in their own hooks.py; POSNext names the moment and the send, nothing more (maintenance#1935).
# Copyright (c) 2026, POS Next and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from pos_next.restaurant import devices, permissions, scope

HOOK = "pos_next_kitchen_send"
#: print a COPY of a ticket: listener(invoice, station=None, whole_order=False, mark_copy=True) answers
#: {"tickets": [{station, job_token, printer, printer_online, ...}], "no_printer": [stations], "valid_minutes", "duplicate"}
HOOK_REPRINT = "pos_next_kitchen_reprint"
#: where a copy stands: listener(job, invoice) answers {"status", "printer_online", "reason"}, or nothing for a job it does not know
HOOK_REPRINT_STATUS = "pos_next_kitchen_reprint_status"
#: the stations some printer prints for: listener() answers a list of station names
HOOK_PRINTERS = "pos_next_kitchen_printers"


def kitchen_send(invoice, batch):
	"""A save of table order `invoice` has lines at the kitchen (send `batch` when the till numbered it): call
	every listener of HOOK with (invoice, batch). It is called at every such save, so a listener acts once per
	line itself. A listener's failure is logged and never stops the order."""
	if not invoice or not batch:
		return
	for method in frappe.get_hooks(HOOK):
		try:
			frappe.get_attr(method)(invoice, int(batch))
		except Exception:
			frappe.log_error(f"POS Next: kitchen-send listener {method} failed", frappe.get_traceback())


def _listeners(hook):
	return [frappe.get_attr(method) for method in frappe.get_hooks(hook)]


def _flag(value, default):
	"""A setting of the screen as a bool, whatever form it came in (true, 1, "1", "true"); `default` when it came as nothing."""
	if value is None or value == "":
		return default
	if isinstance(value, str):
		return value.strip().lower() in ("1", "true", "yes", "on")
	return bool(value)


def _refuse():
	frappe.throw(_("Not permitted"), frappe.PermissionError)


def _open_to(screen, invoice=None, station=None, restaurant=None, needs=("Sales Invoice", "write")):
	"""Who may use the screen's print button: the (restaurant, station) the call is for.

	A paired tablet of that screen (the kitchen's or the runner's), on an open order of its restaurant, cut to its restaurant
	and to its station when it has one (pos_next.restaurant.devices); a desk account that holds the right `needs` otherwise,
	on an open order too. The screen is the kitchen's or the runner's, nothing else. A refusal says nothing of whether the
	invoice exists.
	"""
	if screen not in devices.SCREENS:
		frappe.throw(_("This is not a screen of the restaurant."))
	device = devices.screen_device(screen)
	if device:
		if invoice is not None:
			devices.require_order_of_device(device, invoice)
		return devices.cut_to_device(device, restaurant, station)
	permissions.require(*needs)
	if invoice is not None:
		order = (
			frappe.db.get_value(
				"Sales Invoice", invoice, ["docstatus", "restaurant_table", "is_takeaway"], as_dict=True
			)
			if isinstance(invoice, str) and invoice
			else None
		)
		if not order or order.docstatus != 0 or not (order.restaurant_table or order.is_takeaway):
			_refuse()
	if station and not (isinstance(station, str) and frappe.db.exists("Preparation Station", station)):
		frappe.throw(_("Station {0} not found").format(station))
	return restaurant, station or None


# A tap prints on a printer: POST only, so that a link opened on a tablet (a top-level GET carries its cookie) prints nothing.
@frappe.whitelist(methods=["POST"])
def print_kitchen_copy(invoice, screen=devices.KITCHEN, station=None, whole_order=0, mark_copy=1):
	"""The printer button of a ticket (the kitchen's card, the runner's card): print a COPY of it, by the server, on the
	printer of the station the screen is opened on.

	`station`: the station the screen is opened on; none, the screen shows them all (each station with a printer then prints
	its own lines). `whole_order`: the whole order and not this station's lines. `mark_copy`: COPY and the time at the head of
	the paper, so that nobody cooks twice. Both are the screen's settings; their defaults are the settings'.

	Answers {"printed": whether something is on its way, "tickets": [{station, job_token, printer, printer_online}] to follow
	with `kitchen_copy_status`, "no_printer": the stations that have none (the screen hides their button), "valid_minutes":
	how long a printer that is off has to come back, "duplicate": the same copy was just asked for, this is that one}.
	A copy changes nothing on the order and is no send: what the next send prints is not changed.
	"""
	_restaurant, station = _open_to(screen, invoice, station)
	whole_order, mark_copy = _flag(whole_order, False), _flag(mark_copy, True)
	tickets, no_printer, valid_minutes, duplicate = [], [], 0, False
	listeners = _listeners(HOOK_REPRINT)
	for listener in listeners:
		# A listener that fails is a copy that did not come out: the screen is told, it is not swallowed as a send's is
		answer = listener(invoice, station=station, whole_order=whole_order, mark_copy=mark_copy) or {}
		tickets += answer.get("tickets") or []
		no_printer += answer.get("no_printer") or []
		valid_minutes = max(valid_minutes, int(answer.get("valid_minutes") or 0))
		duplicate = duplicate or bool(answer.get("duplicate"))
	if not listeners:
		# No app prints: no station has a printer
		no_printer = [station or ""]
	printing = {ticket.get("station") for ticket in tickets}
	return {
		"printed": bool(tickets),
		"tickets": tickets,
		"no_printer": sorted(set(no_printer) - printing),
		"valid_minutes": valid_minutes,
		"duplicate": duplicate,
	}


@frappe.whitelist()
def kitchen_copy_status(invoice, job, screen=devices.KITCHEN):
	"""Where the copy `job` of order `invoice` stands, for the screen that asked for it: {"status": Pending, Fetched, Printed,
	Failed or Expired, "printer_online", "reason"}. A job no listener knows does not exist."""
	_open_to(screen, invoice)
	if isinstance(job, str) and job:
		for listener in _listeners(HOOK_REPRINT_STATUS):
			answer = listener(job, invoice)
			if answer:
				return answer
	frappe.throw(_("Print job not found"), frappe.DoesNotExistError)


@frappe.whitelist()
def kitchen_copy_stations(screen=devices.KITCHEN, restaurant=None, station=None):
	"""The preparation stations of the restaurant that have a printer: {"stations": [names]}. The screen draws the print
	button of a ticket only for these. A tablet of one station is told about its own alone; no printing app, no station."""
	restaurant, station = _open_to(screen, None, station, restaurant, needs=("Preparation Station", "read"))
	restaurant = restaurant or scope.current_restaurant()
	if not devices.screen_device(screen):
		permissions.require_restaurant(restaurant)
	printing = set()
	for listener in _listeners(HOOK_PRINTERS):
		try:
			printing.update(listener() or [])
		except Exception:
			# The printers cannot be read: no button, and the screen goes on
			frappe.log_error("POS Next: kitchen-printers listener failed", frappe.get_traceback())
	filters = {"is_active": 1}
	if station:
		filters["name"] = station
	of_the_restaurant = frappe.get_all(
		"Preparation Station",
		filters=filters,
		or_filters=scope.restaurant_or_filters(restaurant),
		pluck="name",
	)
	return {"stations": sorted(printing.intersection(of_the_restaurant))}
