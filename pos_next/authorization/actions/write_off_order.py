# //// Neoffice — added file (no upstream equivalent). When the service closes, an order that was served and not paid because the guests left is
# //// written off (NeoResto lot 1, the product owner, 08.11.2026, solution C of the study of the open tables, note 57). Writing it off is giving
# //// money away, so it goes through upstream's authorization gate under an action of its own. The gate is opt-in: nothing is asked until a POS
# //// Authorization Rule names « Write off an order ». (Offering the order is the gate's « Offer an item », which asks for the same PIN.)
"""« Write off an order »: a manager's approval to write off, as a customer's loss, an order that was served.

The security-relevant context (the till, the order and what it is worth) never comes from the client: the till is the POS Profile of the
caller's open shift and the amount is the order's own total, read when the grant is minted (pos_next.api.authorization.request_grant,
through ``resolve_write_off_context``) and again when it is spent (pos_next.restaurant.settlement.settle), so both sides bind to the same
values. A grant is for one order, at one till.
"""

import frappe
from frappe import _
from frappe.utils import flt

from pos_next.authorization.registry import Action, register

ACTION_WRITE_OFF_ORDER = "Write off an order"


def write_off_context(invoice, pos_profile) -> dict:
	"""The context the gate binds a grant to: the order, the till it is written off at, and what the order is worth."""
	amount = flt(frappe.db.get_value("Sales Invoice", invoice, "grand_total")) if invoice else 0
	return {"pos_profile": pos_profile, "invoice": invoice, "amount": abs(amount)}


def resolve_write_off_context(invoice, client_context=None) -> dict:
	"""``write_off_context`` for a grant request: the order must be an open order of the restaurant that the caller may settle, and a
	till named by the client must be the one of the caller's open shift."""
	from pos_next.restaurant import scope, settlement

	order = settlement.open_order(invoice)
	pos_profile = scope.current_profile()
	claimed = (client_context or {}).get("pos_profile")
	if claimed and claimed != pos_profile:
		frappe.throw(_("POS Opening Shift does not belong to the selected POS Profile"))
	return write_off_context(order.name, pos_profile)


# Enforced from settlement.settle through gate.enforce_context; no document hook.
register(
	Action(
		name=ACTION_WRITE_OFF_ORDER,
		binding=lambda ctx: {
			"pos_profile": ctx.get("pos_profile"),
			"invoice": ctx.get("invoice"),
			"amount": abs(flt(ctx.get("amount"))),
		},
	)
)
