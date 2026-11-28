# //// Neoffice — added file (no upstream equivalent). The open order of a table put on a hotel room, asked for by voice or by chat
# //// (« mets la table 5 sur la chambre 12 »). The till knows nothing of hotels: the stay is found, checked and charged by the provider an app
# //// declared in the hook `pos_next_room_charge` (pos_next/room_charge.py), and the sale goes through the till's own `submit_invoice`.
"""A table's open order put on a room: look first, then do it, by the way the cashier's « On the room » does.

Two calls, both made as the person who asks and neither writing anything of its own:

- ``preview(table, room, invoice, reservation)`` reads. It names the open order of the table in the caller's restaurant and the one stay in house
  that the room says, runs the provider's refusals that need no total on an unsaved copy of the order (``prepare``: a room that takes no charge, a
  closed bill, a till of another company), and answers what the sale would come to. Whatever is not clear is an answer, never a guess: no open order,
  several, no stay, several stays, each with what the asker may choose among.
- ``put_on_room(invoice, reservation, expected_modified)`` does it: the draft goes through ``submit_invoice`` with ``room_charge``, in the till and the shift
  of the person who asks, exactly as the payment window sends a sale « On the room ». The provider refuses there what only the total can refuse (a limit
  of one charge, a bill closed since), and the sale is taken back with a refusal: nothing is half done.

Nothing here decides which table or which room: the caller says it, and this file checks facts (a table label, a room number, an open draft, a shift).
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next import room_charge
from pos_next.restaurant import scope, settlement

# What is named back to the asker when its words match nothing or too much: the open tables, the stays of a room. Never more.
MOST_NAMED = 30


def _said(value) -> str:
	"""What the caller said, as a trimmed text: a table or a room is a text, never a list a JSON body could turn into a filter."""
	return value.strip() if isinstance(value, str) else ""


def _answer(problem: str, reason: str, **more) -> dict:
	"""An answer that is no success and no failure of the code: `problem` says which fact stopped it, `reason` is for the cashier's words."""
	return {"ok": False, "problem": problem, "reason": reason, **more}


def _the_callers_till() -> None:
	"""Whoever asks works at a till of this site (a desk account with a till, a manager); a visitor or a portal account does not."""
	from pos_next.api.cash_entry import require_till_user

	require_till_user(None)


def _tables_with_an_open_order() -> list[dict]:
	"""The open orders of the caller's restaurant that sit at a table, as the closing of a shift lists them (one reader of the floor)."""
	from pos_next.api import restaurant as restaurant_api

	orders = restaurant_api.get_open_orders()["orders"]
	return [order for order in orders if order.get("kind") == "table"]


def _named(order: dict) -> dict:
	return {"invoice": order["name"], "table": order.get("label"), "total": flt(order.get("grand_total"), 2)}


def _which_order(orders: list[dict], table: str, invoice: str):
	"""(the order, None), or (None, the answer to give instead).

	An invoice named wins: it is one of the table orders the caller was shown. Else the table said, compared with the table's own label (its
	`table_name`) or its record name, as written, ignoring case: no word is guessed, a label that matches nothing hands the open tables back."""
	if invoice:
		found = [order for order in orders if order["name"] == invoice]
		if found:
			return found[0], None
		return None, _answer(
			"no_open_order",
			_("This order is not open any more, or it is not one of the restaurant's tables."),
			open_orders=[_named(order) for order in orders[:MOST_NAMED]],
		)
	if not table:
		return None, _answer(
			"no_open_order",
			_("Say which table."),
			open_orders=[_named(order) for order in orders[:MOST_NAMED]],
		)
	wanted = table.lower()
	labels = dict(
		frappe.get_all(
			"Restaurant Table",
			filters={"name": ["in", sorted({order["table"] for order in orders if order.get("table")})]},
			fields=["name", "table_name"],
			as_list=True,
		)
	)
	found = [
		order
		for order in orders
		if order.get("table")
		and wanted in {_said(order["table"]).lower(), _said(labels.get(order["table"])).lower()}
	]
	if not found:
		return None, _answer(
			"no_open_order",
			_("No table with that name has an open order."),
			open_orders=[_named(order) for order in orders[:MOST_NAMED]],
		)
	if len(found) > 1:
		return None, _answer(
			"several_orders",
			_("This table has several open orders: say which one."),
			open_orders=[_named(order) for order in found[:MOST_NAMED]],
		)
	return found[0], None


def _which_stay(module, room: str, reservation: str):
	"""(the stay, None), or (None, the answer to give instead).

	The provider answers the stays in house whose room number starts with the words, or whose guest has them in the name (never the whole house).
	Only the room number said EXACTLY names a stay here; a stay named by `reservation` must be one of those answered. Anything else is handed back."""
	try:
		answered = module.search_stays(room) or []
	except frappe.ValidationError as exc:
		frappe.clear_messages()
		return None, _answer("no_stay", str(exc))
	if reservation:
		chosen = [stay for stay in answered if stay.get("reservation") == reservation]
	else:
		chosen = [stay for stay in answered if _said(stay.get("room_number")).lower() == room.lower()]
	if not chosen:
		return None, _answer(
			"no_stay",
			_("No guest in house is in that room."),
			stays=answered[:MOST_NAMED],
		)
	if len(chosen) > 1:
		return None, _answer(
			"several_stays", _("Several stays match: say which one."), stays=chosen[:MOST_NAMED]
		)
	return chosen[0], None


def preview(table=None, room=None, invoice=None, reservation=None) -> dict:
	"""What putting the table's open order on the room would do, written nowhere. `{"ok": True, "order", "stay", "modified"}` or an answer of `_answer`."""
	_the_callers_till()
	module = room_charge.require_provider()
	table, room, invoice, reservation = _said(table), _said(room), _said(invoice), _said(reservation)
	if not room:
		return _answer("no_stay", _("Say which room."))
	profile, shift = scope.current_profile(), settlement.open_shift_of_caller()
	if not (profile and shift):
		return _answer("no_shift", _("You need to open a shift before you can start making sales."))
	status = room_charge.status()
	if not status["available"]:
		return _answer(
			"not_available", status["reason"] or _("Putting a meal on a room is not available on this site.")
		)

	order, problem = _which_order(_tables_with_an_open_order(), table, invoice)
	if problem:
		return problem
	if order["holds_money"]:
		return _answer(
			"holds_money",
			_("Money was already posted on this order: open it at its table and cash it from the till"),
		)
	if flt(order["grand_total"]) <= 0:
		return _answer("empty_order", _("This order owes nothing: there is nothing to put on the room."))
	stay, problem = _which_stay(module, room, reservation)
	if problem:
		return problem
	if not cint(stay.get("takes_charges", 1)):
		return _answer(
			"takes_no_charge",
			_("This room takes no charge to the bill: the guest pays at the till."),
			stay=stay,
		)

	doc = settlement.open_order(order["name"])
	try:
		# the provider's own refusals that need no total, on a copy nobody saves (a closed bill, a company's folio, another company)
		module.prepare(doc, stay["reservation"])
	except frappe.ValidationError as exc:
		frappe.clear_messages()
		return _answer("refused", str(exc), stay=stay)
	return {
		"ok": True,
		"order": {
			"invoice": doc.name,
			"table": order.get("label"),
			"total": flt(doc.grand_total, 2),
			"currency": doc.currency,
			"lines": [
				{"item_name": row.item_name, "qty": flt(row.qty), "amount": flt(row.amount, 2)}
				for row in doc.get("items") or []
			],
		},
		"stay": {
			"reservation": stay["reservation"],
			"room_number": stay.get("room_number"),
			"guest_name": stay.get("guest_name"),
			"check_out_date": stay.get("check_out_date"),
		},
		# what the order was when it was shown: `put_on_room` refuses an order that was changed since
		"modified": str(doc.modified),
	}


def put_on_room(invoice, reservation, expected_modified=None) -> dict:
	"""Put the open order on the stay, by the till's own `submit_invoice`: `{"invoice", "reservation", "room"}`.

	`expected_modified`: what `preview` said the order was; an order touched since (a dish added, a guest paid) is refused, to be shown again."""
	from pos_next.api import invoices

	_the_callers_till()
	module = room_charge.require_provider()
	doc = settlement.open_order(invoice)
	reservation = _said(reservation)
	if not reservation:
		frappe.throw(_("Say which stay."))
	if expected_modified and str(doc.modified) != str(expected_modified):
		frappe.throw(
			_("This order was changed after it was shown: look at it again before putting it on the room.")
		)
	if flt(doc.get("paid_amount")) > 0:
		frappe.throw(
			_("Money was already posted on this order: open it at its table and cash it from the till")
		)
	pos_profile, shift = scope.current_profile(), settlement.open_shift_of_caller()
	if not (pos_profile and shift):
		frappe.throw(_("You need to open a shift before you can start making sales."))
	status = room_charge.status()
	if not status["available"]:
		frappe.throw(status["reason"] or _("Putting a meal on a room is not available on this site."))

	payload = settlement._sale_payload(doc, pos_profile, shift)
	answer = invoices.submit_invoice(
		invoice=json.dumps(payload, default=str),
		data=json.dumps({"room_charge": {"reservation": reservation}}),
	)
	name = answer["name"] if isinstance(answer, dict) else doc.name
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("table_update")
	return {"invoice": name, "reservation": reservation, "room": module.room_of(name)}
