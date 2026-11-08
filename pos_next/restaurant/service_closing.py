# //// Neoffice — added file (no upstream equivalent). Closing the service of a restaurant (NeoResto lot 1, the product owner, 08.11.2026: « théoriquement, quand on clôture le
# //// restaurant, toutes les tables sont fermées »; « si des gens traînent encore au bistrot, le restaurant n'est pas fermé »; solution C of the study of the open tables, note 57,
# //// § 3 and § 9, third slice). A shift is one person's till, the service is the restaurant's: this is the second.
"""The service of a restaurant closes on one question, « is the room empty? », and on nothing left open.

The study of the open tables (note 57, § 3) names what an open order can be when the service closes, and what follows from it:

| Case | Order                                                     | Here                                                                               |
|------|-----------------------------------------------------------|------------------------------------------------------------------------------------|
| R1   | paid, its table not freed                                 | its dishes still at the kitchen are marked delivered (the kitchen is closed), the table is freed |
| R2   | a draft with lines, none sent to the kitchen or the bar   | nothing was consumed: it is cancelled (one gesture for all, or one by one)         |
| R3   | sent, unpaid, and the guests are still there              | the service does not close: the answer to the question is « no »                   |
| R4/5 | sent, unpaid, the guests have gone                        | settled one by one, with a way and a reason (`pos_next.restaurant.settlement`)     |
| R7   | money already posted on it                                | cashed at its table: the service cannot close over it                              |
| R8   | a table opened and left, nothing on it                    | removed without a question                                                         |

The service closes ONLY when no order is left but the empty ones. It then frees every table, writes the record of the closing (who, when, what it did) and tells the
other tills. Nothing is closed halfway: a refusal leaves the floor as it was.

It is the restaurant manager's to close (the right of the floor plan), as the manual « reset » of the floor was: a waiter closes his own till, never the restaurant's.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, now_datetime

from pos_next.restaurant import covers as covers_module
from pos_next.restaurant import open_orders, paid_orders, permissions, scope, tickets

JOURNAL = "Restaurant Service Closing"
# The statuses of a table that the closing puts back to Empty: a table kept for a booking is not one
TABLE_STATUSES_TO_FREE = ("Occupied", "Paid", "Cleaning")
# When no earlier closing bounds them, the orders settled in the last day are the service's
DEFAULT_LOOK_BACK_HOURS = 24


def _restaurant_of(pos_profile, restaurant):
	"""The restaurant whose service is closed: the one named, else the till's own; refused to whoever is kept out of it or may not read it."""
	if not isinstance(restaurant, str | None):
		frappe.throw(_("Restaurant not found"))
	restaurant = restaurant or scope.current_restaurant(pos_profile)
	if not restaurant:
		frappe.throw(_("This till has no restaurant"))
	permissions.require_restaurant(restaurant)
	return restaurant


def require_closer(pos_profile, restaurant):
	"""Refuse whoever may not close the service: a user of the till who manages the floor of the restaurant. Answers the restaurant."""
	from pos_next.api.cash_entry import require_till_user

	require_till_user(pos_profile)
	permissions.require_right("manage_floor")
	return _restaurant_of(pos_profile, restaurant)


def _open_orders_of(pos_profile, restaurant) -> list[dict]:
	"""The open orders of the restaurant as the closing of a shift lists them, with their stage."""
	from pos_next.api import restaurant as restaurant_api

	return restaurant_api.get_open_orders(pos_profile, restaurant)["orders"]


def last_closing(restaurant) -> dict | None:
	"""The latest closing of the restaurant's service: `{name, closed_at, closed_by, service_day}`, or None."""
	if not restaurant:
		return None
	rows = frappe.get_all(
		JOURNAL,
		filters={"restaurant": restaurant},
		fields=["name", "closed_at", "closed_by", "service_day"],
		order_by="closed_at desc",
		limit_page_length=1,
	)
	return rows[0] if rows else None


def _tables_to_free(restaurant) -> list[str]:
	return frappe.get_all(
		"Restaurant Table",
		filters={"status": ["in", list(TABLE_STATUSES_TO_FREE)]},
		or_filters=scope.restaurant_or_filters(restaurant),
		pluck="name",
	)


def _paid_orders_at_the_kitchen(restaurant) -> list:
	"""The paid orders of the restaurant that still have a dish at the kitchen (written within the hours of a service)."""
	fields = ["name", "restaurant_table", "pos_profile"]
	if frappe.db.has_column("Sales Invoice", "is_takeaway"):
		fields.append("is_takeaway")
	return scope.keep_orders_of(paid_orders.paid_orders_at_the_kitchen(fields), restaurant)


def _dishes_at_the_kitchen(order_name) -> list:
	from pos_next.api import restaurant as restaurant_api

	return [
		dish
		for dish in frappe.get_all(
			"Sales Invoice Item", filters={"parent": order_name}, fields=restaurant_api._dish_fields()
		)
		if (dish.get("kds_status") or "") in paid_orders.AT_THE_KITCHEN
	]


def survey(pos_profile, restaurant) -> dict:
	"""What the closing of the service would meet, read and changed in nothing: the open orders with their stage, and what the closing would do by itself."""
	restaurant = require_closer(pos_profile, restaurant)
	orders = _open_orders_of(pos_profile, restaurant)
	empty = [order for order in orders if order["stage"] == open_orders.EMPTY]
	return {
		"restaurant": restaurant,
		"orders": orders,
		"empty_orders": len(empty),
		"tables_to_free": len(_tables_to_free(restaurant)),
		"dishes_to_deliver": sum(
			len(_dishes_at_the_kitchen(order.name)) for order in _paid_orders_at_the_kitchen(restaurant)
		),
		"last_closing": last_closing(restaurant),
	}


def _remove_empty_orders(names, tip_item) -> list[dict]:
	"""Delete the tables opened and left with nothing on them; what was removed, as `{order, table}`.

	Each is read again under a lock: a waiter may have ordered on it since the list was read, and then the whole closing is refused (a table with a dish is no
	empty table).
	"""
	from pos_next.restaurant import settlement

	removed = []
	for name in names:
		values = frappe.db.get_value(
			"Sales Invoice", name, ["docstatus", "paid_amount", "grand_total"], as_dict=True, for_update=True
		)
		if not values or values.docstatus != 0:
			continue
		doc = frappe.get_doc("Sales Invoice", name)
		label = settlement._label_of(doc)
		state = open_orders.line_states([name], tip_item).get(name) or {}
		if flt(values.paid_amount) > 0 or flt(values.grand_total) or state.get("lines"):
			frappe.throw(_("{0} has just been ordered on: the service cannot close yet").format(label))
		frappe.delete_doc("Sales Invoice", name, force=1, ignore_permissions=True)
		removed.append({"order": name, "table": label})
	return removed


def _deliver_paid_dishes(restaurant) -> int:
	"""Mark delivered the dishes of the tables already paid that are still at the kitchen: the kitchen is closed. How many lines were marked.

	Only PAID orders: an unpaid order's dishes tell whether anything was consumed, and the service never changes that.
	"""
	from pos_next.api import restaurant as restaurant_api

	marked = 0
	for order in _paid_orders_at_the_kitchen(restaurant):
		for dish in _dishes_at_the_kitchen(order.name):
			restaurant_api._write_dish(dish, "Delivered")
			marked += 1
		# The order follows its dishes, and its table, kept for them, goes to Cleaning
		restaurant_api._follow_the_dishes(order.name)
	return marked


def _free_tables(restaurant) -> list[str]:
	"""Put every table of the restaurant back to Empty (none holds an open order by now); the names of those freed."""
	from pos_next.api import restaurant as restaurant_api

	return [table for table in _tables_to_free(restaurant) if restaurant_api._put_table_back(table)]


def _settled_since(restaurant, since) -> dict:
	"""What was settled one by one in the service, by way: `{issue: {"count", "total"}}`, from the settlement journal."""
	from pos_next.restaurant import settlement

	rows = frappe.get_all(
		settlement.JOURNAL,
		filters={"restaurant": restaurant, "settled_at": [">", since]},
		fields=["issue", "count(name) as order_count", "sum(total) as total_settled"],
		group_by="issue",
	)
	return {row.issue: {"count": cint(row.order_count), "total": flt(row.total_settled)} for row in rows}


def close(pos_profile, restaurant, room_empty) -> dict:
	"""Close the service of the restaurant: answers what it did. Refused unless the room is empty and no order is left open.

	`room_empty` is the answer to the one question. The caller manages the floor of a restaurant he works for. Every order but the empty ones must have been
	settled already; the empty ones are removed, the paid tables' dishes are marked delivered, every table is freed and the closing is written down — all
	in one transaction, so that a refusal changes nothing.
	"""
	restaurant = require_closer(pos_profile, restaurant)
	if not cint(room_empty):
		frappe.throw(_("The service closes when the room is empty: say that it is"))

	orders = _open_orders_of(pos_profile, restaurant)
	left = [order for order in orders if order["stage"] != open_orders.EMPTY]
	if left:
		shown = ", ".join(order["label"] for order in left[:6]) + (" …" if len(left) > 6 else "")
		frappe.throw(_("Orders are still open: {0}. Settle them before closing the service.").format(shown))

	now = now_datetime()
	before = last_closing(restaurant)
	since = before.closed_at if before else add_to_date(now, hours=-DEFAULT_LOOK_BACK_HOURS)
	removed = _remove_empty_orders(
		[order["name"] for order in orders if order["stage"] == open_orders.EMPTY],
		covers_module.tip_item_of(restaurant),
	)
	delivered = _deliver_paid_dishes(restaurant)
	freed = _free_tables(restaurant)
	settled = _settled_since(restaurant, since)

	entry = frappe.get_doc(
		{
			"doctype": JOURNAL,
			"restaurant": restaurant,
			"pos_profile": pos_profile or scope.current_profile(),
			"service_day": tickets.business_day_of(now, tickets.ticket_settings(restaurant).day_start),
			"closed_at": now,
			"closed_by": frappe.session.user,
			"orders_settled": sum(way["count"] for way in settled.values()),
			"settled_total": sum(way["total"] for way in settled.values()),
			"empty_orders_removed": len(removed),
			"tables_freed": len(freed),
			"dishes_delivered": delivered,
			"details": json.dumps(
				{"settled": settled, "empty_orders_removed": removed, "tables_freed": freed},
				ensure_ascii=False,
			),
		}
	)
	entry.insert(ignore_permissions=True)
	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("table_update")
	return {
		"closing": entry.name,
		"service_day": str(entry.service_day),
		"orders_settled": entry.orders_settled,
		"settled_total": entry.settled_total,
		"empty_orders_removed": len(removed),
		"tables_freed": len(freed),
		"dishes_delivered": delivered,
	}
