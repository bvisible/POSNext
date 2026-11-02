# //// Neoffice — added file (no upstream equivalent). The till's drawer movements (« Entrées/Sorties de
# //// caisse », pos_next.api.cash_entry) are ours; cancelling one at the till goes through upstream's
# //// authorization gate like a POS expense's void, under an action of its own (NeoResto lot 1, task 15).
# //// The gate is opt-in: nothing is asked until a POS Authorization Rule names « Void Cash Movement ».
"""« Void Cash Movement »: a manager's approval to cancel a drawer movement at the till.

The security-relevant context (the till and the amount) never comes from the client: ``void_context``
reads the POS Profile from the movement's shift and the amount from what the entry did to the till's cash
account, and it is used both when the grant is minted (pos_next.api.authorization.request_grant) and when
it is spent (pos_next.api.cash_entry.cancel_cash_entry), so both sides bind to the same values.
"""

import frappe
from frappe import _
from frappe.utils import flt

from pos_next.authorization.registry import Action, register

ACTION_VOID_CASH_MOVEMENT = "Void Cash Movement"


def void_context(journal_entry, opening) -> dict:
	"""The authoritative context for cancelling ``journal_entry``, recorded during ``opening``'s shift."""
	from pos_next import cash_movement

	row = cash_movement.movement(journal_entry)
	return {
		"pos_profile": opening.pos_profile,
		"journal_entry": journal_entry,
		"amount": abs(flt(row.amount)) if row else 0,
	}


def resolve_void_context(journal_entry, client_context=None) -> dict:
	"""``void_context`` for a grant request: the caller must be someone who may cancel the movement now
	(its author or a till manager, the shift open), and a till named by the client must be the shift's."""
	from pos_next.api.cash_entry import require_movement_author_or_manager

	_values, opening = require_movement_author_or_manager(journal_entry)
	claimed = (client_context or {}).get("pos_profile")
	if claimed and claimed != opening.pos_profile:
		frappe.throw(_("POS Opening Shift does not belong to the selected POS Profile"))
	return void_context(journal_entry, opening)


# Enforced from cancel_cash_entry through gate.enforce_context; no document hook.
register(
	Action(
		name=ACTION_VOID_CASH_MOVEMENT,
		binding=lambda ctx: {
			"pos_profile": ctx.get("pos_profile"),
			"journal_entry": ctx.get("journal_entry"),
			"amount": abs(flt(ctx.get("amount"))),
		},
	)
)
