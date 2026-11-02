# //// Neoffice — added file (no upstream equivalent). The restaurant's opening hours decide which cards the till
# //// shows; a cashier may fetch another card from the « ⋯ » of the card row (pos_next.api.restaurant), and what a
# //// lunch card sells at dinner is the owner's call, so opening it goes through upstream's authorization gate under
# //// an action of its own (NeoResto lot 1, task 25). The gate is opt-in: nothing is asked until a POS Authorization
# //// Rule names « Open a card outside its hours ».
"""« Open a card outside its hours »: a manager's approval to open, at the till, a card the opening hours keep off it.

The security-relevant context (the till) never comes from the client: it is the POS Profile of the caller's open
shift, read when the grant is minted (pos_next.api.authorization.request_grant, through ``resolve_open_card_context``)
and again when it is spent (pos_next.api.restaurant.open_card_outside_hours), so both sides bind to the same values.
A grant is for one card, at one till.
"""

import frappe
from frappe import _

from pos_next.authorization.registry import Action, register

ACTION_OPEN_CARD_OUTSIDE_HOURS = "Open a card outside its hours"


def open_card_context(card_name, pos_profile) -> dict:
	"""The context the gate binds a grant to: the card, and the till it is opened at."""
	return {"pos_profile": pos_profile, "restaurant_card": card_name}


def resolve_open_card_context(card_name, client_context=None) -> dict:
	"""``open_card_context`` for a grant request: the card must be one the caller may fetch (see
	``check_card_can_be_opened``), and a till named by the client must be the one of the caller's open shift."""
	from pos_next.api.restaurant import check_card_can_be_opened
	from pos_next.restaurant import scope

	card = check_card_can_be_opened(card_name)
	pos_profile = scope.current_profile()
	claimed = (client_context or {}).get("pos_profile")
	if claimed and claimed != pos_profile:
		frappe.throw(_("POS Opening Shift does not belong to the selected POS Profile"))
	return open_card_context(card.name, pos_profile)


# Enforced from open_card_outside_hours through gate.enforce_context; no document hook.
register(
	Action(
		name=ACTION_OPEN_CARD_OUTSIDE_HOURS,
		binding=lambda ctx: {
			"pos_profile": ctx.get("pos_profile"),
			"restaurant_card": ctx.get("restaurant_card"),
		},
	)
)
