# //// Neoffice — added file (no upstream equivalent). The open orders of a restaurant, as the closing of a shift lists them and as the floor's « cash in? »
# //// reminder reads them (NeoResto lot 1, the product owner, 08.11.2026: « à la clôture, toutes les tables doivent être fermées […] s'il n'y a plus personne à table,
# //// le serveur a oublié de fermer la table »; solution C of the study of the open tables, note 57).
"""What the kitchen's states say of an open order: whether anything was consumed, whether everything is served, and since when nothing moved.

An open order is a draft Sales Invoice on a table, or a takeaway order. Two readers use these rules:

- the closing of a shift lists the open orders of the restaurant (`get_open_orders`), each with what it holds: its total, the money already posted on it, whether a dish was
  delivered (a consumed order is a debt to settle, never one to delete), and since when it has not moved;
- the floor plan marks a table « to cash in? » (`to_cash_in`) once everything on it is served and nothing has moved for the minutes the restaurant sets
  (`Restaurant.remind_to_cash_in_minutes`, 45 by default, 0 for never).

A line counts as SERVED when it is delivered, or when it left for a station that works on paper alone (no screen will ever mark it delivered: a paper-only station is
served once it is sent). A line that has not left (no status, or held back as Waiting) is not served. The tip line is no dish and is not counted.
"""

import frappe
from frappe.utils import cint, flt, get_datetime, now_datetime

# The states of a line that has left for the kitchen or the bar
SENT = ("Pending", "Preparing", "Ready", "Delivered")
# The reminder is on at 45 minutes unless the restaurant says otherwise; 0 switches it off
DEFAULT_REMINDER_MINUTES = 45
FIELD = "remind_to_cash_in_minutes"


def reminder_minutes(restaurant) -> int:
	"""The minutes after which a served, quiet table is marked « to cash in? » (0: never). Off on a site not migrated yet."""
	if not restaurant or not frappe.db.has_column("Restaurant", FIELD):
		return 0
	value = frappe.db.get_value("Restaurant", restaurant, FIELD)
	return DEFAULT_REMINDER_MINUTES if value is None else max(0, cint(value))


def paper_only_stations() -> set:
	"""The stations that work on paper alone: no screen marks their dishes delivered."""
	if not frappe.db.has_column("Preparation Station", "paper_only"):
		return set()
	return set(frappe.get_all("Preparation Station", filters={"paper_only": 1}, pluck="name"))


def line_states(orders, tip_item=None) -> dict:
	"""`{order: {"lines", "sent", "delivered", "consumed", "served", "last_line"}}` for the open orders named, in ONE read of their lines.

	An order with no line at all (a table opened empty) is `served` False and `lines` 0. `last_line` is the latest write of any of its lines.
	"""
	orders = list(dict.fromkeys(order for order in orders if order))
	if not orders:
		return {}
	has_status = frappe.db.has_column("Sales Invoice Item", "kds_status")
	fields = ["parent", "item_code", "modified", "preparation_station", "qty", "price_list_rate"]
	if has_status:
		fields.append("kds_status")
	rows = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": ["in", orders], "parenttype": "Sales Invoice"},
		fields=fields,
		limit_page_length=0,
	)
	paper = paper_only_stations()
	states = {
		order: {
			"lines": 0,
			"sent": 0,
			"delivered": 0,
			"consumed": False,
			"unserved": 0,
			"last_line": None,
			"list_value": 0.0,
		}
		for order in orders
	}
	for row in rows:
		state = states[row.parent]
		# What offering the whole order is worth, at list price (the tip line included: it is offered with the rest): what a manager approves
		state["list_value"] += flt(row.get("qty")) * flt(row.get("price_list_rate"))
		if tip_item and row.item_code == tip_item:
			continue
		status = (row.get("kds_status") or "") if has_status else ""
		on_paper = bool(row.preparation_station) and row.preparation_station in paper
		state["lines"] += 1
		if status in SENT:
			state["sent"] += 1
		if status == "Delivered":
			state["delivered"] += 1
		# Delivered, or sent to a station no screen will ever deliver from: served, and so consumed
		served = status == "Delivered" or (status in SENT and on_paper)
		if served:
			state["consumed"] = True
		else:
			state["unserved"] += 1
		if row.modified and (state["last_line"] is None or row.modified > state["last_line"]):
			state["last_line"] = row.modified
	for state in states.values():
		state["served"] = state["lines"] > 0 and state["unserved"] == 0
	return states


def last_activity(order, state):
	"""The latest write of an order or of any of its lines."""
	moments = [m for m in (order.get("modified"), state.get("last_line")) if m]
	return max((get_datetime(m) for m in moments), default=None)


def idle_minutes(moment) -> int:
	"""Whole minutes since `moment` (0 when unknown)."""
	if not moment:
		return 0
	return max(0, int((now_datetime() - get_datetime(moment)).total_seconds() // 60))


def to_cash_in(minutes, served, idle) -> bool:
	"""Whether a table is marked « to cash in? »: the reminder is on, everything is served and nothing has moved for `minutes`."""
	return bool(minutes) and bool(served) and idle >= minutes


def summary_of_table(orders, states, minutes) -> dict:
	"""What the floor says of one table from its open orders (notes): all served, and for how long it has been quiet.

	`orders` are the table's open orders (rows with `name` and `modified`), `states` the result of `line_states` for them.
	"""
	quiet_since = [last_activity(order, states.get(order.name, {})) for order in orders]
	quiet_since = [moment for moment in quiet_since if moment]
	served = bool(orders) and all(states.get(order.name, {}).get("served") for order in orders)
	idle = idle_minutes(max(quiet_since)) if quiet_since else 0
	return {"served": served, "idle_minutes": idle, "to_cash_in": to_cash_in(minutes, served, idle)}


# //// Neoffice — the stages an open order is in when the SERVICE closes (NeoResto lot 1, the product owner, 08.11.2026; the study of the open tables, note 57, § 3): what the service
# //// does with it follows from the stage alone. The first two need no question, the third is cancelled in one gesture, the fourth is a debt to settle, the last is cashed at its table.
HOLDS_MONEY = "holds_money"
EMPTY = "empty"
NEVER_SENT = "never_sent"
SENT_STAGE = "sent"


def stage_of(holds_money, lines, sent, grand_total) -> str:
	"""Where an open order stands for the closing of the service.

	- `holds_money`: money was posted on it (a guest paid part of it from a phone); the service cannot cancel or settle it, it is cashed at its table;
	- `empty`: a table opened and left, no line and nothing to pay (study R8): it goes without a question;
	- `never_sent`: it has lines, none has left for the kitchen or the bar (R2): nothing was consumed, so it is cancelled by default;
	- `sent`: something left for the kitchen (R4 and R5): a dish served is a debt to settle, none served is cancelled with a reason.
	"""
	if holds_money:
		return HOLDS_MONEY
	if not lines and not flt(grand_total):
		return EMPTY
	if not sent:
		return NEVER_SENT
	return SENT_STAGE


def open_orders(orders, tip_item=None, user=None) -> list[dict]:
	"""The open orders of a restaurant as the closing lists them, oldest first.

	`orders` are open drafts (rows with `name`, `restaurant_table`, `is_takeaway`, `owner`, `creation`, `modified`, `grand_total`, `paid_amount`, `table_label`).
	Each answer carries what the manager must know to settle it: the total, `holds_money` (money posted on a draft the closing does not read), `consumed` (a dish
	was delivered: a debt, never to be deleted), `served`, the minutes since it last moved, and `mine` (opened by `user`: whoever opened an order may leave
	it open for a colleague, who cashes it in his own shift, or settle it before closing his own).
	"""
	states = line_states([order.name for order in orders], tip_item)
	answer = []
	for order in orders:
		state = states.get(order.name, {})
		moment = last_activity(order, state)
		answer.append(
			{
				"name": order.name,
				"kind": "takeaway" if cint(order.get("is_takeaway")) else "table",
				"table": order.get("restaurant_table"),
				"label": order.get("table_label") or order.get("restaurant_table") or "",
				"owner": order.get("owner_name") or order.get("owner"),
				"mine": bool(user) and order.get("owner") == user,
				"opened_at": str(order.creation),
				"idle_minutes": idle_minutes(moment),
				"grand_total": flt(order.grand_total),
				"paid_amount": flt(order.paid_amount),
				"holds_money": flt(order.paid_amount) > 0,
				"lines": state.get("lines", 0),
				"sent": state.get("sent", 0),
				"delivered": state.get("delivered", 0),
				"consumed": bool(state.get("consumed")),
				"offer_value": flt(state.get("list_value"), 2),
				"served": bool(state.get("served")),
				"stage": stage_of(
					flt(order.paid_amount) > 0, state.get("lines", 0), state.get("sent", 0), order.grand_total
				),
			}
		)
	answer.sort(key=lambda row: row["opened_at"])
	return answer
