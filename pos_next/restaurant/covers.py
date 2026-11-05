# //// Neoffice — added file (no upstream equivalent). The covers of a table (NeoResto lot 1): how many people are seated at
# //// a table, kept on the table's order, and how many portions of each service course the order holds, so that the till, the
# //// kitchen's screen, the pass and the printed kitchen ticket can all say « Mains 2/3 » (three people, two mains so far).
"""The covers of a restaurant order: the number of people seated, and the portions per course.

- The NUMBER lives on the table's draft Sales Invoice, in the hidden Custom Field `restaurant_covers` (an Int). It is written by the
  till's save (`invoices.update_invoice`, when the payload carries it) and by `restaurant.set_table_covers` (the waiter changing it
  from the table's header), never by a payment: a submitted invoice keeps the number it had. 0 or nothing stores 0 (an Int column is
  NOT NULL) and every read maps 0 back to `None`, so a table where nobody said how many are seated reads as `None`, never as 0.
- The PORTIONS per course (`family_counts`) are the sum of the quantities of the order's lines of each food course (`Starter`,
  `Main`, `Dessert`, see `service_families`). A drink follows no course, a line of no family cannot be set against the guests, and
  the restaurant's tip line is no dish: none of them counts. EVERY line of the order counts, the ones held back and the ones a
  station of the screen does not show alike: the count is the order's, not the screen's. A line has no cancelled status (a dish
  taken off is removed from the order and the kitchen is told by the void hook), so none is left out for that.

Both are told to the screens with one read for all the orders of a list, never one per order.
"""

import re

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next.restaurant import service_families
from pos_next.restaurant import settings as restaurant_config

# The Custom Field of Sales Invoice that holds the number of people
FIELD = "restaurant_covers"
# The most people a table can hold: the server refuses more (the till's stepper stops at the same number)
MAX_COVERS = 99
# The precision a quantity is added up with (a portion can be half a one), the kitchen's own
QTY_PRECISION = 3
# A whole number written as text, the only text a count is read from (no decimal, no exponent, no other script's digits)
_WHOLE_NUMBER = re.compile(r"[+-]?[0-9]{1,6}")


def has_covers_column() -> bool:
	"""Whether the site has the Custom Field of the covers (the code can be updated before the site is migrated)."""
	return bool(frappe.db.has_column("Sales Invoice", FIELD))


def order_fields() -> list[str]:
	"""The Sales Invoice field to read with an order to know its covers (none on a site not migrated yet)."""
	return [FIELD] if has_covers_column() else []


def asks_on_open(settings) -> int:
	"""Whether the till asks how many people are seated when a table is first opened: 1 or 0, on unless the restaurant switched it off.

	`settings` is a restaurant's settings; a restaurant that never chose, or a site not migrated yet (no such key), asks."""
	value = settings.get("ask_covers_on_open") if settings else None
	return 1 if value is None else cint(value)


def _whole_number(value) -> int | None:
	"""The whole number a value means: an int, a float with no fraction, or a whole number written as text; None for anything else."""
	if isinstance(value, bool):
		return None
	if isinstance(value, int):
		return value
	if isinstance(value, float):
		return int(value) if value.is_integer() else None
	if isinstance(value, str) and _WHOLE_NUMBER.fullmatch(value.strip()):
		return int(value.strip())
	return None


def clean_covers(value) -> int | None:
	"""The number of people a payload or a call means: a whole number from 1 to 99, or None for none.

	Nothing (None, an empty text) and 0 both mean none: no number is stored. Anything else that is not a whole number from 0 to 99
	(-1, 100, "abc", 2.5, a list, True) is refused with a translated ValidationError, so that a till's slip never stores a number
	the kitchen would print.
	"""
	if value is None or (isinstance(value, str) and not value.strip()):
		return None
	number = _whole_number(value)
	if number is None or not 0 <= number <= MAX_COVERS:
		frappe.throw(
			_("The number of people must be a whole number from 0 to {0}").format(MAX_COVERS),
			frappe.ValidationError,
		)
	return number or None


def read(names) -> dict[str, int | None]:
	"""The covers of each order named, in ONE read: `{order: covers}`, None for an order with none.

	An empty answer on a site that has not the field yet (the code is updated before `bench migrate`)."""
	names = [name for name in dict.fromkeys(names or []) if name]
	if not names or not has_covers_column():
		return {}
	rows = frappe.get_all(
		"Sales Invoice", filters={"name": ["in", names]}, fields=["name", FIELD], as_list=True
	)
	return {name: cint(covers) or None for name, covers in rows}


def stamp(rows: list) -> list:
	"""Tell each order row of a list (a dict with a `name`) its `covers`, an int or None, one read for the whole list."""
	covers = read(row.get("name") for row in rows)
	for row in rows:
		row["covers"] = covers.get(row.get("name"))
	return rows


def _tally(quantity) -> int | float:
	"""A quantity as the screens read it: a whole number when it is one (3, not 3.0)."""
	quantity = flt(quantity, QTY_PRECISION)
	return int(quantity) if quantity == int(quantity) else quantity


def family_counts(lines, tip_item: str | None = None) -> dict[str, int | float]:
	"""The portions an order holds of each food course: `{"Starter": 3, "Main": 2}`, only the courses that have lines.

	`lines` are the order's lines, each with its `item_code`, its `qty` and its `service_family` already given (the stored one, else
	its group's: see `service_families.stamp_lines`). A drink, a line of no family and the tip's line (`tip_item`) are not counted;
	neither is a line of no quantity.
	"""
	totals: dict[str, float] = {}
	for line in lines or []:
		if not line or (tip_item and line.get("item_code") == tip_item):
			continue
		family = line.get(service_families.FIELD)
		quantity = flt(line.get("qty"), QTY_PRECISION)
		if family in service_families.COURSES and quantity > 0:
			totals[family] = totals.get(family, 0) + quantity
	return {family: _tally(totals[family]) for family in service_families.COURSES if family in totals}


def tip_item_of(restaurant: str | None) -> str | None:
	"""The tip item of a restaurant (the line of the order that is no dish), None where it has none."""
	if not restaurant:
		return None
	return restaurant_config.get_restaurant_settings(restaurant).get("tip_item") or None


def stamp_family_counts(rows: list, tip_item: str | None = None, maps=None) -> list:
	"""Tell each order row of a list (a dict with a `name`) its `family_counts`: the portions of its whole order per course.

	The lines of ALL the orders are read together, and so are their families (one read of the items, one of the groups), whatever
	the number of orders: a list of forty tickets must not ask the database forty times. They are read as stored, so the count is not
	the screen's own list of lines (cut to a station, or to what is at the pass) and does not move when the screen changes its mind.

	`maps` are the group maps the call's own stamp of its lines already read (`service_families.stamp_lines` answers them): the group tree is read once per call.
	"""
	names = [row.get("name") for row in rows if row.get("name")]
	by_order: dict[str, list] = {}
	if names:
		fields = ["parent", "item_code", "qty"]
		if frappe.db.has_column("Sales Invoice Item", service_families.FIELD):
			fields.append(service_families.FIELD)
		lines = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": ["in", names], "parenttype": "Sales Invoice"},
			fields=fields,
		)
		service_families.stamp_lines(lines, maps)
		for line in lines:
			by_order.setdefault(line.parent, []).append(line)
	for row in rows:
		row["family_counts"] = family_counts(by_order.get(row.get("name"), []), tip_item)
	return rows
