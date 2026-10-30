# //// Neoffice — added file (no upstream equivalent). Whether a site used the restaurant (NeoRestau lot 1, task 4, fix
# //// rounds 1 and 2): the one criterion shared by the three patches that act only on a site that did, the one that makes
# //// the default restaurant out of the single `Restaurant Settings`, the one that attaches what a site made before the
# //// restaurants to the default restaurant, and the one that switches NeoRestau on.
"""Whether a site ever used the restaurant module."""

import frappe

SINGLE = "Restaurant Settings"

# What only a person makes when the restaurant is used: a room, a table, a card, a menu, a station, a booking, a tip. A
# migrate writes none of them, on any site.
RECORDS_OF_USE = (
	"Restaurant Area",
	"Restaurant Table",
	"Restaurant Card",
	"Restaurant Menu",
	"Preparation Station",
	"Restaurant Reservation",
	"Restaurant Tip",
)


def site_used_the_restaurant() -> bool:
	"""Whether somebody used the restaurant on this site.

	True when a POS Settings row has the tick of restaurant mode (enabled or not: a till that was switched off may be
	switched on again), when a room, a table, a card, a menu, a station, a reservation or a tip exists, when opening
	hours were set, or when an order names a table (the proof a site leaves when it served tables through the till and
	ticked nothing: restaurant mode was a switch of the till's header, which ticked no row).

	Never the stored values of the single `Restaurant Settings`: a migrate writes its defaults on every site, those of a
	client that never used the module included, and a default cannot be told from a choice.
	"""
	if frappe.db.exists("POS Settings", {"enable_restaurant_mode": 1}):
		return True
	if any(frappe.get_all(doctype, pluck="name", limit=1) for doctype in RECORDS_OF_USE):
		return True
	# The hours hang on the single, or on the restaurant the first patch moved them to: the answer must not change on
	# the way, as the switch-on patch runs after that one
	if frappe.db.exists("Restaurant Opening Hours", {"parenttype": ["in", [SINGLE, "Restaurant"]]}):
		return True
	# The one query that may read a big table, last
	return an_order_names_a_table()


def an_order_names_a_table() -> bool:
	"""Whether a Sales Invoice names a table. A site without the column (a custom field of the restaurant) holds none.

	A function of its own so that a test can replace it: no index covers the column, and a test that wrote to the orders
	of a working site to make them say no would hold a lock on every one of them until its transaction ends.
	"""
	if not frappe.db.has_column("Sales Invoice", "restaurant_table"):
		return False
	return bool(frappe.db.exists("Sales Invoice", {"restaurant_table": ["is", "set"]}))
