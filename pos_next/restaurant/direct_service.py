# //// Neoffice — added file (no upstream equivalent). The direct service of a table (the product owner, 08.11.2026: « un bar, une table, un comptoir doit pouvoir encaisser sans la gestion de
# //// table, encaissement direct style je veux un café, le serveur tape et encaisse direct […] à la fin de la transaction on revient directement sur cette table pour taper le ticket suivant »).
"""A table of direct service: a bar, a counter, a window where the ticket is typed and paid in one go.

Such a table is a table of the floor like any other (the waiter taps it, types the order, the kitchen's and the bar's screens see its lines, the receipt is
printed), with three differences, all of them about SEATING:

- it is never seated: saving or paying a ticket does not make it Occupied, Paid or Cleaning, it stays as it is (Empty), so nobody has to free it between two tickets;
- once a ticket is paid the till comes back to the same table with an empty ticket, to type the next one;
- it is not a table to book: the reservations never offer it.

The flag lives on the table, in the Check `direct_service`. A site that has not run `bench migrate` since it came has no such column: nothing is direct there.
"""

import frappe

FIELD = "direct_service"


def has_column() -> bool:
	"""Whether the site has the Check on its tables (the code can be updated before the site is migrated)."""
	return bool(frappe.db.has_column("Restaurant Table", FIELD))


def fields() -> list[str]:
	"""The field to read with a table to know whether it is direct (none on a site not migrated yet)."""
	return [FIELD] if has_column() else []


def is_direct(table) -> bool:
	"""Whether the table, named, is a table of direct service."""
	if not table or not has_column():
		return False
	return bool(frappe.db.get_value("Restaurant Table", table, FIELD))


def not_direct() -> dict:
	"""The filter that leaves the tables of direct service out (nothing to filter on a site not migrated yet)."""
	return {FIELD: 0} if has_column() else {}
