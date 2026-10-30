# //// Neoffice — added file (no upstream equivalent). Whether a site used the restaurant (NeoRestau lot 1, task 4, fix
# //// round 1): the one criterion shared by the two patches that act only on a site that did, the one that makes the
# //// default restaurant out of the single `Restaurant Settings` and the one that switches NeoRestau on.
"""Whether a site ever used the restaurant module."""

import frappe

SINGLE = "Restaurant Settings"

# What only a person makes when the restaurant is used: a room, a table, a card, a station, a booking, a tip. A migrate
# writes none of them, on any site.
RECORDS_OF_USE = (
	"Restaurant Area",
	"Restaurant Table",
	"Restaurant Card",
	"Preparation Station",
	"Restaurant Reservation",
	"Restaurant Tip",
)


def site_used_the_restaurant() -> bool:
	"""Whether somebody used the restaurant on this site.

	True when a POS Settings row has the tick of restaurant mode (enabled or not: a till that was switched off may be
	switched on again), when a room, a table, a card, a station, a reservation or a tip exists, when opening hours were
	set, or when an order names a table (the proof a site leaves when it served tables through the till and ticked
	nothing: restaurant mode was a switch of the till's header, which ticked no row).

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
	# The one query that may read a big table, last. A site without the column (a custom field of the restaurant) holds
	# no order on a table.
	if frappe.db.has_column("Sales Invoice", "restaurant_table"):
		return bool(frappe.db.exists("Sales Invoice", {"restaurant_table": ["is", "set"]}))
	return False
