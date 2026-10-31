# //// Neoffice — added file (no upstream equivalent). « Offer an item » (NeoRestau lot 1, task 24): an opt-in manager PIN
# //// for the lines a cashier offers, through upstream's authorization gate, registered the way the fork's other actions
# //// are (one module, one line in actions/__init__.py, one option of POS Authorization Rule.action).
"""The offered rows of a sale, approved by a manager where a rule asks for it.

Nothing is enforced until someone creates a ``POS Authorization Rule`` for "Offer an item" (for every till, or one
POS Profile): the rule is opt-in, off by default, like every action of the gate. With a rule, a sale whose invoice
offers something is refused before submit unless it carries a manager's grant for this till and for at least the value
offered, at list price (the binding's ``amount`` may be lower than approved, never higher). The till asks the PIN when
the cashier offers, and again before the payment when the grant it holds no longer covers the ticket.

A return is not an offer: the rows it gives back were offered by the sale it returns.
"""

from frappe.utils import flt

from pos_next.authorization.registry import Action, register

ACTION_OFFER_ITEM = "Offer an item"
SALES_INVOICE = "Sales Invoice"


def _offers_something(doc) -> bool:
	from pos_next.offered import offered_rows

	return not doc.get("is_return") and bool(offered_rows(doc))


def _binding(ctx: dict) -> dict:
	"""The till and the value offered: read from the document when the gate spends the grant, from the approval's
	context when a manager gives it (the value the till asked for)."""
	from pos_next.offered import offered_rows, offered_value

	doc = ctx.get("doc")
	amount = offered_value(offered_rows(doc)) if doc else abs(flt(ctx.get("amount")))
	return {"pos_profile": ctx.get("pos_profile"), "amount": amount}


register(
	Action(
		name=ACTION_OFFER_ITEM,
		doctype=SALES_INVOICE,
		applies=_offers_something,
		binding=_binding,
	)
)
