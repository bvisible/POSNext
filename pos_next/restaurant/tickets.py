# //// Neoffice — added file (no upstream equivalent). The ticket number of a restaurant order (NeoResto lot 1, task 38b,
# //// rulings 122 and 124). A draft Sales Invoice takes its FA number at its first save, in an order nobody chose, with a
# //// gap for each draft deleted; the kitchen, the runner and the provisional ticket must not show it. The restaurant gives
# //// the order a TICKET number instead, at that first save, counted per restaurant and per business day.
"""The ticket number of an order of a table or of a takeaway order.

- WHO gets one: a Sales Invoice draft that sits at a table, or that is a takeaway order of a restaurant till. A plain sale at
  the counter never does, nor does anything a till that is no restaurant's rings up. It is given once, at the order's first
  save; every later save of the order keeps it.
- HOW it is counted: by the restaurant, in a counter row per counting period (`Restaurant Ticket Counter`): the business
  day (default), or never reset, or the till's shift (the restaurant's `ticket_number_reset`). A restaurant closes after
  midnight, so a business day runs from `business_day_start` (default 05:00) to the same time the next morning, on the
  SITE's clock (`frappe.utils.now_datetime`, the time zone the site's `modified` is written in), never the server's.
- ATOMIC: the counter row is locked (`SELECT … FOR UPDATE`) and incremented in the transaction of the order that takes the
  number, and the lock is let go at that transaction's commit. Two orders at the same instant never share a number: the
  second waits for the first. An order that is rolled back gives its number back (the increment is rolled back with it).
  An order that is DELETED afterwards does not: the counter only goes up, so a number is not given again within its day.
- WRITTEN: the screens write the number with the restaurant's `ticket_number_digits` (0007), told with it as
  `ticket_digits`; `format_ticket_no` is the same rule for the server's own prints.

The order's name (FA-…) is kept for the calls the screens make; it is never what a restaurant screen reads aloud.
"""

from datetime import time, timedelta

import frappe
from frappe.utils import cint, get_datetime, get_time, now, now_datetime

from pos_next.restaurant import scope
from pos_next.restaurant.settings import restaurant_for_profile

COUNTER = "Restaurant Ticket Counter"
RESET_DAY = "Business day"
RESET_NEVER = "Never"
RESET_SHIFT = "Each shift"
RESETS = (RESET_DAY, RESET_NEVER, RESET_SHIFT)
DEFAULT_DIGITS = 4
DEFAULT_DAY_START = time(5, 0)


def has_ticket_column() -> bool:
	"""Whether the site has the Sales Invoice fields of the tickets (the code can be updated before the site is migrated)."""
	return bool(frappe.db.has_column("Sales Invoice", "posa_ticket_no"))


def order_fields() -> list[str]:
	"""The Sales Invoice field to read with an order to know its ticket number (none on a site not migrated yet)."""
	return ["posa_ticket_no"] if has_ticket_column() else []


def ticket_settings(restaurant: str | None) -> frappe._dict:
	"""The ticket settings of a restaurant: `digits`, `reset` and `day_start` (a `datetime.time`), the defaults for what it
	left empty or does not have yet (a restaurant saved before the fields existed, a site not migrated)."""
	row = {}
	if restaurant:
		try:
			row = (
				frappe.db.get_value(
					"Restaurant",
					restaurant,
					["ticket_number_digits", "ticket_number_reset", "business_day_start"],
					as_dict=True,
				)
				or {}
			)
		except Exception as error:
			if not frappe.db.is_missing_column(error):
				raise
	digits = cint(row.get("ticket_number_digits"))
	reset = row.get("ticket_number_reset")
	start = row.get("business_day_start")
	return frappe._dict(
		digits=digits if 1 <= digits <= 9 else DEFAULT_DIGITS,
		reset=reset if reset in RESETS else RESET_DAY,
		# Midnight is a start like any other: only a field left empty takes the default
		day_start=DEFAULT_DAY_START if start in (None, "") else get_time(start),
	)


def business_day_of(moment, day_start: time = DEFAULT_DAY_START):
	"""The business day a moment (the site's time) belongs to: the day before when it is earlier than the day's start."""
	moment = get_datetime(moment)
	day = moment.date()
	return day - timedelta(days=1) if moment.time() < day_start else day


def counter_key(restaurant: str, period: str) -> str:
	"""The name of the counter row of a restaurant for a counting period (an ISO date, "never", or "shift:<name>")."""
	return f"{restaurant}::{period}"


def shift_of(order) -> str | None:
	"""The shift an order was taken in (its till's opening shift), None for an order saved with none (a guest's)."""
	return order.get("posa_pos_opening_shift") or None


def next_number(restaurant: str, key: str, day) -> int:
	"""Take the next number of a counter: the one thing that decides two orders at once.

	The row is made if the period has none (a duplicate is a no-op that takes the row's exclusive lock, which a plain
	insert-then-select would take as a shared one first: several first orders of a day would then deadlock on each other's
	upgrade), locked with `SELECT … FOR UPDATE`, and incremented. The lock is kept until the caller's transaction ends:
	until then another order asking for the same counter waits, and gets the next number after it.
	"""
	stamp = now()
	user = frappe.session.user
	frappe.db.sql(
		f"""
		INSERT INTO `tab{COUNTER}`
			(name, creation, modified, modified_by, owner, docstatus, idx, counter_key, restaurant, business_day, last_number)
		VALUES (%(key)s, %(stamp)s, %(stamp)s, %(user)s, %(user)s, 0, 0, %(key)s, %(restaurant)s, %(day)s, 0)
		ON DUPLICATE KEY UPDATE name = name
		""",
		{"key": key, "stamp": stamp, "user": user, "restaurant": restaurant, "day": day},
	)
	last = frappe.db.sql(f"SELECT last_number FROM `tab{COUNTER}` WHERE name = %s FOR UPDATE", (key,))[0][0]
	number = cint(last) + 1
	frappe.db.sql(
		f"UPDATE `tab{COUNTER}` SET last_number = %s, modified = %s, modified_by = %s WHERE name = %s",
		(number, stamp, user, key),
	)
	return number


def restaurant_of_order(order) -> str | None:
	"""The restaurant an order is counted in: the one of its table; for a takeaway order the one of the till that took it.
	None for anything else, and for a takeaway order of a till that is no restaurant's."""
	if order.get("restaurant_table"):
		return scope.restaurant_of_record("Restaurant Table", order.restaurant_table)
	if cint(order.get("is_takeaway")):
		return restaurant_for_profile(order.get("pos_profile"))
	return None


def give_ticket_number(invoice: str) -> int | None:
	"""Give a restaurant order its ticket number if it has none, and return the number it has (None: not a restaurant order).

	Called once the draft is saved and its table or takeaway flag is written, inside the transaction of that save: the number
	is rolled back with the order. It never touches a submitted invoice.
	"""
	if not has_ticket_column():
		return None
	order = frappe.db.get_value(
		"Sales Invoice",
		invoice,
		["docstatus", "restaurant_table", "is_takeaway", "pos_profile", "posa_ticket_no", "posa_pos_opening_shift"],
		as_dict=True,
	)
	if not order or order.docstatus != 0:
		return None
	if cint(order.posa_ticket_no):
		return cint(order.posa_ticket_no)
	restaurant = restaurant_of_order(order)
	if not restaurant:
		return None

	settings = ticket_settings(restaurant)
	day = business_day_of(now_datetime(), settings.day_start)
	period = day.isoformat()
	if settings.reset == RESET_NEVER:
		period = "never"
	elif settings.reset == RESET_SHIFT and shift_of(order):
		period = f"shift:{shift_of(order)}"
	number = next_number(restaurant, counter_key(restaurant, period), day)
	frappe.db.set_value(
		"Sales Invoice", invoice, {"posa_ticket_no": number, "posa_ticket_day": day}, update_modified=False
	)
	return number


def format_ticket_no(number, digits=DEFAULT_DIGITS) -> str:
	"""A ticket number as it is written: zero-padded to the restaurant's digits, never cut (12345 stays 12345); "" for none."""
	number = cint(number)
	if not number:
		return ""
	return str(number).zfill(cint(digits) or DEFAULT_DIGITS)


def told(number, digits) -> dict:
	"""What a screen is told of an order's ticket: the number (None when it has none) and the digits to write it with."""
	return {"ticket_no": cint(number) or None, "ticket_digits": cint(digits) or DEFAULT_DIGITS}


def stamp(rows: list, restaurant: str | None) -> list:
	"""Tell each order row of a list (a dict with a `name`) its ticket number and digits, one read for the whole list.

	The name stays in the row: it is what the screens' calls are made with. The number is what they read aloud.
	"""
	digits = ticket_settings(restaurant).digits
	numbers = {}
	names = [row.get("name") for row in rows if row.get("name")]
	if names and has_ticket_column():
		numbers = dict(
			frappe.get_all(
				"Sales Invoice", filters={"name": ["in", names]}, fields=["name", "posa_ticket_no"], as_list=True
			)
		)
	for row in rows:
		row.update(told(numbers.get(row.get("name")), digits))
	return rows
