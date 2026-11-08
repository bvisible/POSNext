# //// Neoffice — added file (no upstream equivalent). Settling an open order of a restaurant when the service closes (NeoResto lot 1, the product
# //// owner, 08.11.2026, solution C of the study of the open tables, note 57): « à la clôture, toutes les tables doivent être fermées […] on ne laisse
# //// rien traîner pour demain ». Every open order ends in one of five ways, each leaving a piece behind.
"""The five ends of an open order, and the journal that keeps them.

| Issue       | When                                                  | What it makes                                                              |
|-------------|-------------------------------------------------------|----------------------------------------------------------------------------|
| `cashed`    | the guests paid in cash and nobody entered it         | a submitted invoice, paid in cash in the shift that settles it             |
| `tab`       | a known customer pays later                           | a submitted invoice on the customer's account (a credit sale)              |
| `offered`   | a gesture of the house                                | a submitted invoice whose every line is offered (the gate's « Offer an item ») |
| `loss`      | served, and the guests left without paying            | a submitted invoice paid by the restaurant's « loss » mode of payment      |
| `cancelled` | nothing was served: forgotten, or gone before service | the draft is deleted; the journal keeps what it held                       |

One criterion decides between a loss and a cancellation: **was anything served?** What was served is a sale: it leaves an accounting piece and is
never deleted. What was not served is cancelled, with a trace all the same, since a waiter who deletes orders without one is the risk.

The four sales go through the till's own `submit_invoice`, so the stock, the taxes, the hooks and the closing of the shift that settles them are those
of any sale: the money is that of the person who settles, as when a colleague cashes a table the waiter left. An order that already holds money
(a guest paid part of it from his phone) is not settled here: it is opened at its table and cashed from the till.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

from pos_next import offered
from pos_next.restaurant import covers as covers_module
from pos_next.restaurant import notes as notes_module
from pos_next.restaurant import open_orders, permissions, scope, tickets

JOURNAL = "Restaurant Settlement"
CASHED = "cashed"
TAB = "tab"
OFFERED = "offered"
LOSS = "loss"
CANCELLED = "cancelled"
ISSUES = (CASHED, TAB, OFFERED, LOSS, CANCELLED)
# The journal's Select stores these English words (the screen translates them)
ISSUE_LABELS = {
	CASHED: "Cashed late",
	TAB: "On account",
	OFFERED: "Offered",
	LOSS: "Customer loss",
	CANCELLED: "Cancelled",
}
# A reason is written for every issue that gives something away or deletes an order
NEEDS_REASON = (OFFERED, LOSS, CANCELLED)
LOSS_FIELD = "loss_mode_of_payment"


def open_order(invoice):
	"""The open order named, as a document: a table's or a takeaway's draft, of a restaurant the caller works for.

	The caller works at its till (`require_document_till`); an invoice that is no restaurant order, or already submitted, is refused, as is an order of
	a restaurant the caller is kept out of.
	"""
	from pos_next.api.cash_entry import require_document_till

	require_document_till("Sales Invoice", invoice)
	if not isinstance(invoice, str) or not frappe.db.exists("Sales Invoice", invoice):
		frappe.throw(_("Invoice {0} does not exist").format(invoice))
	doc = frappe.get_doc("Sales Invoice", invoice)
	if doc.docstatus != 0:
		frappe.throw(_("Cannot delete submitted invoice {0}").format(invoice))
	if not (doc.get("restaurant_table") or cint(doc.get("is_takeaway"))):
		frappe.throw(_("Invoice {0} is not a restaurant order").format(invoice))
	permissions.require_restaurant(
		scope.restaurant_of_record("Restaurant Table", doc.restaurant_table)
		if doc.get("restaurant_table")
		else scope.current_restaurant(doc.pos_profile)
	)
	return doc


def open_shift_of_caller() -> str | None:
	"""The name of the shift the current user has open: the one the sales he settles are counted in."""
	user = frappe.session.user
	if not user or user == "Guest":
		return None
	return frappe.db.get_value(
		"POS Opening Shift",
		{"user": user, "pos_closing_shift": ["is", "not set"], "docstatus": 1, "status": "Open"},
		"name",
		order_by="period_start_date desc",
	)


def cash_mode_of(pos_profile) -> str | None:
	from pos_next.api.cash_entry import _get_cash_mode

	return _get_cash_mode(pos_profile) if pos_profile else None


def loss_mode_of(restaurant) -> str | None:
	"""The mode of payment the restaurant writes a customer's loss off with (None when it set none, or the site is not migrated yet)."""
	if not restaurant or not frappe.db.has_column("Restaurant", LOSS_FIELD):
		return None
	mode = frappe.db.get_value("Restaurant", restaurant, LOSS_FIELD)
	return mode if mode and frappe.db.exists("Mode of Payment", mode) else None


def allows_credit_sale(pos_profile) -> bool:
	return bool(
		pos_profile
		and cint(frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, "allow_credit_sale"))
	)


def capabilities(pos_profile, restaurant) -> dict:
	"""What the caller's till and restaurant allow, for every order alike: `{issue: why not, or None}` (read once for a whole list)."""
	return {
		CASHED: None if cash_mode_of(pos_profile) else _("This till has no cash mode of payment"),
		TAB: None
		if allows_credit_sale(pos_profile)
		else _("Credit sales are not enabled for this POS Profile."),
		OFFERED: None
		if offered.till_allows_offers(pos_profile)
		else _("This till does not let its cashiers change a discount: a line cannot be offered there."),
		LOSS: None
		if loss_mode_of(restaurant)
		else _(
			"No mode of payment is set for a customer's loss: ask the manager to set it on the restaurant"
		),
	}


def issues_for(order, state, pos_profile, restaurant, caps=None) -> dict:
	"""What the caller may do with one open order: `{issue: {"available": bool, "why": the reason it is not, or None}}`.

	`order` is the order's row (`paid_amount`), `state` its kitchen state (`open_orders.line_states`), `pos_profile` the caller's till; `caps` the
	result of `capabilities`, when many orders are asked for.
	"""
	caps = caps if caps is not None else capabilities(pos_profile, restaurant)
	if flt(order.get("paid_amount")) > 0:
		why = _("Money was already posted on this order: open it at its table and cash it from the till")
		return {issue: {"available": False, "why": why} for issue in ISSUES}
	consumed = bool((state or {}).get("consumed"))
	not_served = (
		None
		if not consumed
		else _("A dish was served: settle the order as a tab, an offer or a loss, not as a cancellation")
	)
	reasons = {**caps, CANCELLED: not_served}
	return {issue: {"available": reasons[issue] is None, "why": reasons[issue]} for issue in ISSUES}


def _label_of(doc) -> str:
	if not doc.get("restaurant_table"):
		return _("Takeaway")
	table = (
		frappe.db.get_value("Restaurant Table", doc.restaurant_table, "table_name") or doc.restaurant_table
	)
	others = frappe.db.count("Sales Invoice", {"docstatus": 0, "restaurant_table": doc.restaurant_table})
	return notes_module.table_label(
		table, doc.get(notes_module.FIELD), doc.get(notes_module.NAME_FIELD), others
	)


def _snapshot(doc, state) -> str:
	"""What the order held, as a text the journal keeps (a cancelled order is deleted)."""
	return json.dumps(
		{
			"lines": [
				{
					"item_code": row.item_code,
					"item_name": row.item_name,
					"qty": flt(row.qty),
					"rate": flt(row.rate),
					"amount": flt(row.amount),
					"kitchen": row.get("kds_status") or "",
				}
				for row in doc.get("items") or []
			],
			"grand_total": flt(doc.grand_total),
			"opened_at": str(doc.creation),
			"last_moved_at": str(doc.modified),
			"delivered_lines": (state or {}).get("delivered", 0),
		},
		ensure_ascii=False,
	)


def _owed(doc) -> float:
	"""What the order costs to cash, as the till would send it: the rounded total when the site rounds, else the total (a takeaway order takes
	its takeaway VAT at the save, which `_grand_total_as_saved` reads)."""
	from pos_next.api import invoices

	total = invoices._grand_total_as_saved(doc)
	return flt(doc.get("rounded_total")) or flt(total)


def _sale_payload(doc, pos_profile, shift) -> dict:
	"""The draft as the till of the person who settles would send it to be paid: the draft itself, in that till and that shift."""
	payload = doc.as_dict(convert_dates_to_str=True)
	payload["pos_profile"] = pos_profile
	payload["posa_pos_opening_shift"] = shift
	if frappe.db.has_column("Sales Invoice", "pos_opening_shift"):
		payload["pos_opening_shift"] = shift
	payload["payments"] = []
	return payload


def _submit_sale(doc, issue, pos_profile, restaurant, shift, customer, authorization_token) -> str:
	"""Pay the order through the till's own `submit_invoice`; the submitted invoice's name."""
	from pos_next.api import invoices

	payload = _sale_payload(doc, pos_profile, shift)
	data = {}
	owed = _owed(doc)
	if issue == CASHED:
		payload["payments"] = [{"mode_of_payment": cash_mode_of(pos_profile), "amount": owed}]
	elif issue == LOSS:
		payload["payments"] = [{"mode_of_payment": loss_mode_of(restaurant), "amount": owed}]
	elif issue == TAB:
		customer = (customer or "").strip() if isinstance(customer, str) else ""
		if not customer or not frappe.db.exists("Customer", customer):
			frappe.throw(_("Customer is required for credit sales"), title=_("Customer Required"))
		payload["customer"] = customer
		data["is_credit_sale"] = 1
	elif issue == OFFERED:
		offered.ensure_offered_field()
		for row in payload.get("items") or []:
			row[offered.FIELD] = 1
			row["discount_percentage"] = 100
	if authorization_token:
		payload["authorization_token"] = authorization_token
	answer = invoices.submit_invoice(invoice=json.dumps(payload, default=str), data=json.dumps(data))
	return answer["name"] if isinstance(answer, dict) else doc.name


def settle(invoice, issue, reason=None, customer=None, complaint_filed=0, authorization_token=None) -> dict:
	"""Settle one open order with one of the five issues; writes the journal, and answers `{issue, invoice, journal}`.

	The caller works at a till with a shift open (the sales are counted there). A reason is required to offer, to write off or to cancel; a customer to
	put it on a tab. Writing off asks the manager's approval where a rule of the authorization gate asks for it (`authorization_token`); offering is
	the gate's own « Offer an item », which asks for the same PIN on the invoice, and the token is passed to it.
	"""
	from pos_next.api import restaurant as restaurant_api
	from pos_next.authorization import grants
	from pos_next.authorization.actions.write_off_order import ACTION_WRITE_OFF_ORDER, write_off_context
	from pos_next.authorization.gate import enforce_context

	if not isinstance(issue, str) or issue not in ISSUES:
		frappe.throw(_("Unknown way to settle an order: {0}").format(issue))
	doc = open_order(invoice)
	pos_profile = scope.current_profile()
	shift = open_shift_of_caller()
	if not (pos_profile and shift):
		frappe.throw(_("You need to open a shift before you can start making sales."))
	restaurant = (
		scope.restaurant_of_record("Restaurant Table", doc.restaurant_table)
		if doc.get("restaurant_table")
		else scope.current_restaurant(pos_profile)
	)
	reason = (reason or "").strip() if isinstance(reason, str) else ""
	if issue in NEEDS_REASON and not reason:
		frappe.throw(_("Say why: a reason is required to offer, write off or cancel an order"))

	tip_item = covers_module.tip_item_of(restaurant)
	state = open_orders.line_states([doc.name], tip_item).get(doc.name) or {}
	way = issues_for(doc, state, pos_profile, restaurant)[issue]
	if not way["available"]:
		frappe.throw(way["why"])

	approved_by = None
	spent = None
	if issue == LOSS:
		spent = enforce_context(
			ACTION_WRITE_OFF_ORDER,
			write_off_context(doc.name, pos_profile),
			authorization_token,
			reference=doc.name,
		)
		approved_by = spent["approver"] if spent else None

	entry = frappe.get_doc(
		{
			"doctype": JOURNAL,
			"order": doc.name,
			"table_label": _label_of(doc),
			"issue": ISSUE_LABELS[issue],
			"total": flt(doc.grand_total),
			"consumed": 1 if state.get("consumed") else 0,
			"reason": reason,
			"complaint_filed": 1 if (issue == LOSS and cint(complaint_filed)) else 0,
			"waiter": doc.owner,
			"settled_by": frappe.session.user,
			"approved_by": approved_by,
			"restaurant": restaurant,
			"pos_profile": pos_profile,
			"service_day": tickets.business_day_of(
				doc.creation, tickets.ticket_settings(restaurant).day_start
			),
			"settled_at": now_datetime(),
			"customer": customer if issue == TAB and isinstance(customer, str) else None,
			"lines": _snapshot(doc, state),
		}
	)
	entry.insert(ignore_permissions=True)

	result = None
	try:
		if issue == CANCELLED:
			restaurant_api.cancel_table_order(doc.name)
		else:
			result = _submit_sale(doc, issue, pos_profile, restaurant, shift, customer, authorization_token)
			entry.db_set("invoice", result, update_modified=False)
	except Exception:
		# The approval was not used: it is given back, so that the manager does not have to give it twice
		if spent:
			grants.release(authorization_token, doc.name)
		raise
	frappe.db.commit()
	frappe.publish_realtime("kds_update")
	frappe.publish_realtime("table_update")
	return {"issue": issue, "invoice": result, "journal": entry.name}
