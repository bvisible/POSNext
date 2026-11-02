# //// Neoffice — added file (no upstream equivalent).
"""Which call of the next course a kitchen screen has taken up, for the other screens of the kitchen (NeoRestau lot 1, Daniel, 01.11).

A kitchen may have several tablets. When the next course of a table is ordered, its ticket blinks on each of them until a cook starts
its dishes (that is the dishes' status, which every screen reads) or says « to do » (the ticket's button): the second used to be the
tablet's own. The tablet now tells the server WHICH call it took up, and every reading of the orders carries it back (`call_seen`),
so that the screens that show the same thing stop blinking together.

A call is named by the screen: the order and the time of the send it was told of (`<order>|<ms>`), so that a later send of the same
table is another call and blinks again. It is taken up for a SCOPE: the station the screen shows, or all of them (""): a screen of
another station keeps blinking, its dishes are not taken up.

It is kept in the cache for the length of a service, not in the database: it is a gesture of the moment, with nothing to migrate,
nothing to keep, and a restarted cache costs the kitchen one more tap.
"""

import frappe
from frappe import _

PREFIX = "pos_next_kds_call_seen"
# A call is the business of a service: a long one is still over by the next day
LIFETIME = 12 * 60 * 60
# `<order name>|<milliseconds>`: far under it
MAX_CALL_LENGTH = 200


def _name(invoice, station):
	return f"{PREFIX}|{invoice}|{station or ''}"


def remember(invoice, station, call):
	"""The screen of `station` (none: of every station) took up `call` of `invoice`. The last call taken up is the one kept."""
	if not isinstance(call, str) or not call.strip() or len(call) > MAX_CALL_LENGTH:
		frappe.throw(_("This is not a call of the kitchen."))
	frappe.cache().set_value(_name(invoice, station), call, expires_in_sec=LIFETIME)


def stamp(orders, station):
	"""Say, on each order of a reading made for `station`, the call taken up for that scope (`call_seen`, "" for none)."""
	cache = frappe.cache()
	for order in orders:
		order["call_seen"] = cache.get_value(_name(order.get("name"), station), expires=True) or ""


def forget_all():
	"""Forget every call taken up (the suites: the cache is not undone by a rollback)."""
	frappe.cache().delete_keys(f"{PREFIX}|")
