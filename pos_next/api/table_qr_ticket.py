# //// Neoffice — added file (no upstream equivalent). Upstream POSNext has no guest ordering, so no QR code of a table to
# //// print. The Print button of the QR dialog opened the browser's print window; a restaurant wants a paper out of the
# //// till's receipt printer. POS Next names the moment, checks who asks and works the link out from the guest token; an app
# //// that prints (cloudprnt) listens to the hook below, declared in its own hooks.py (NeoRestau lot 1, task 53).
"""Print the QR ticket of a table on the till's receipt printer.

The browser sends the guest TOKEN of the table's code and the till it works at, never a text or an address: the table and the
link are worked out here, from the token (`guest_ordering.guest_link`, the function the QR dialog's own link comes from), and
the app that prints is handed those. A token that does not exist, is not a table's, has expired or whose opening is closed,
and a table of another restaurant than the till's, print nothing.
"""

import frappe
from frappe import _

from pos_next.api.guest_ordering import guest_link
from pos_next.restaurant import permissions, scope
from pos_next.restaurant.settings import restaurant_for_profile

#: print the QR ticket of a table: listener(table, link, pos_profile) answers {"printed", "printer", "printer_online",
#: "job_token", "queue_position", "valid_minutes", "duplicate"}, or {"printed": False, "no_printer": True}
HOOK = "pos_next_table_qr_print"
#: What of a listener's answer reaches the till: the printer, where and how to follow the paper, never a text of the app's
ANSWER_KEYS = ("printer", "printer_online", "job_token", "queue_position", "valid_minutes", "duplicate")
#: The tickets one user may ask for in a minute (the button follows a ticket, which is not counted)
PRINTS_PER_MINUTE = 20
RATE_WINDOW_SECONDS = 60
RATE_KEY = "pos_next_table_qr_rate:"


def _listeners(hook):
	return [frappe.get_attr(method) for method in frappe.get_hooks(hook)]


# A tap prints on a printer: POST only, so that a link opened on a tablet (a top-level GET carries its cookie) prints nothing.
@frappe.whitelist(methods=["POST"])
def print_table_qr_ticket(token, pos_profile, table=None):
	"""The Print button of the QR dialog: put the QR ticket of the table whose guest code is `token` on the receipt printer
	of till `pos_profile`.

	`table`, when the dialog knows the table's record name, must be the token's table (the dialog of a table it did not make
	the code for prints nothing). Answers {"printed", "no_printer", "printer", "printer_online", "job_token", "queue_position",
	"valid_minutes", "duplicate"}: with `no_printer` the till has no printer that prints, and the dialog prints from the
	browser as before; with `printed` the paper is on its way and `job_token` follows it (`cloudprnt` `ticket_status`).
	The same table and link asked for again within a few seconds prints once (`duplicate`).

	Whoever may work at the till, and make the table's code, may ask: not a visitor, a portal account or a paired tablet.
	A refusal is a plain message the dialog shows.
	"""
	_require_the_till(pos_profile)
	table_of_the_token = _table_of(token, table)
	_require_the_tills_restaurant(pos_profile, table_of_the_token)
	_throttle()
	link = guest_link(token)
	listeners = _listeners(HOOK)
	for listener in listeners:
		# A listener that fails is a ticket that did not come out: the till is told, it is not swallowed
		reply = listener(table=table_of_the_token, link=link, pos_profile=pos_profile) or {}
		if reply.get("printed"):
			return {"printed": True, "no_printer": False, **{key: reply.get(key) for key in ANSWER_KEYS}}
	return {"printed": False, "no_printer": True}


def _require_the_till(pos_profile):
	"""Whoever works at the till `pos_profile` (a desk account on its user list, one that reads sales invoices as every cashier
	does, or a till manager), and may make the code of a table, as create_table_token asks."""
	from pos_next.api.cash_entry import require_system_user, require_till_access

	# A visitor or a portal account is refused before anything is looked up
	require_system_user()
	if (
		not isinstance(pos_profile, str)
		or not pos_profile.strip()
		or not frappe.db.exists("POS Profile", pos_profile)
	):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	require_till_access(pos_profile)
	if not frappe.has_permission("Guest Order Token", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _table_of(token, table):
	"""The record name of the table whose valid guest code is `token`: a text that is a table's token, still usable by a guest,
	and the table `table` when the dialog names it. One plain refusal for every way it can be wrong."""
	name = (
		frappe.db.get_value("Guest Order Token", {"token": token}, "name")
		if isinstance(token, str) and token
		else None
	)
	doc = frappe.get_doc("Guest Order Token", name) if name else None
	if (
		not doc
		or doc.mode != "restaurant"
		or not doc.table
		or not doc.is_valid()
		or (table is not None and table != doc.table)
	):
		frappe.throw(_("This QR code is no longer valid: make a new one"))
	return doc.table


def _require_the_tills_restaurant(pos_profile, table):
	"""A till prints the tables of its own restaurant only, and for whoever may read that restaurant."""
	restaurant = scope.restaurant_of_record("Restaurant Table", table)
	if restaurant != restaurant_for_profile(pos_profile):
		frappe.throw(_("This till does not serve this table"), frappe.PermissionError)
	permissions.require_restaurant(restaurant)


def _throttle():
	"""At most PRINTS_PER_MINUTE tickets per user per minute (RateLimitExceededError, which the till shows as a refusal). A count
	that kept no expiry (a worker killed between its two calls) is given one, so that nobody stays locked out."""
	cache = frappe.cache()
	key = cache.make_key(f"{RATE_KEY}{frappe.session.user}")
	count = cache.incrby(key, 1)
	if cache.ttl(key) < 0:
		cache.expire(key, RATE_WINDOW_SECONDS)
	if count > PRINTS_PER_MINUTE:
		frappe.throw(
			_("Too many tickets in a minute: wait a moment before printing another"),
			frappe.RateLimitExceededError,
		)
