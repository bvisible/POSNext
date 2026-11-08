# //// Neoffice — added file (no upstream equivalent). The « Guests left? » question of a table that waits to be cleaned (NeoResto lot 1, the product owner, 08.11.2026:
# //// « le nettoyage arrive seul à la dernière livraison, que les clients soient partis ou non. Une pastille Partis ? »; note 63, § 5).
"""A table goes to Cleaning by itself: when the bill is paid with nothing left to serve, or when the last dish is delivered (`pos_next.restaurant.paid_orders`).
The system cannot know whether the guests have left: they may be at the digestif, or already gone. Cleaning keeps its meaning (« do not seat anyone here »); this
module adds the question.

- A table that has been in Cleaning for the minutes the restaurant sets (`Restaurant.ask_if_guests_left_minutes`, 30 by default, 0 for never) carries
  `guests_left_ask` on the floor plan and in the list of tables: the pastille « Guests left? », so that a table nobody freed is seen.
- The waiter answers at the table: « Available » when the guests have left and the table is ready, « Order again » when they stay for something more, and
  « Not left yet » (`keep_seated`) when they linger: the wait starts again, the pastille comes back after the same minutes and no sooner.

The time spent in Cleaning is read from the table's own `modified`: the status is written only by the moves of the table (payment, last delivery, the waiter), and
a table that stays in Cleaning is not written again, so the last write is the moment it began, or the moment the waiter said « not left yet ».
"""

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from pos_next.restaurant import open_orders

# The question is asked after half an hour unless the restaurant says otherwise; 0 switches it off
DEFAULT_MINUTES = 30
FIELD = "ask_if_guests_left_minutes"
CLEANING = "Cleaning"


def reminder_minutes(restaurant) -> int:
	"""The minutes after which a table in Cleaning is marked « Guests left? » (0: never). Off on a site not migrated yet."""
	if not restaurant or not frappe.db.has_column("Restaurant", FIELD):
		return 0
	value = frappe.db.get_value("Restaurant", restaurant, FIELD)
	return DEFAULT_MINUTES if value is None else max(0, cint(value))


def ask_if_left(minutes, status, minutes_in_cleaning, direct=False) -> bool:
	"""Whether a table is marked « Guests left? »: the question is on, the table waits to be cleaned, for at least `minutes`. A table of direct service is never seated."""
	return bool(minutes) and status == CLEANING and not direct and minutes_in_cleaning >= minutes


def stamp(tables, minutes) -> None:
	"""Puts `guests_left_ask` and `cleaning_minutes` on each table row read with its `modified`, and takes `modified` off the row (it is no part of the floor's answer)."""
	for table in tables:
		moment = table.pop("modified", None)
		in_cleaning = open_orders.idle_minutes(moment) if table.get("status") == CLEANING else 0
		table["cleaning_minutes"] = in_cleaning
		table["guests_left_ask"] = ask_if_left(
			minutes, table.get("status"), in_cleaning, bool(table.get("direct_service"))
		)


def keep_seated(table_name) -> None:
	"""The guests have not left: the table stays in Cleaning and the question starts its wait again. Refused for a table that is not waiting to be cleaned."""
	status = frappe.db.get_value("Restaurant Table", table_name, "status")
	if status != CLEANING:
		# The table is named to the waiter by its label, never by its name
		label = frappe.db.get_value("Restaurant Table", table_name, "table_name") or table_name
		frappe.throw(_("Table {0} is not waiting to be cleaned").format(label))
	frappe.db.set_value("Restaurant Table", table_name, "status", CLEANING, modified=now_datetime())
