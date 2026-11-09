# //// Neoffice — added file (no upstream equivalent).
"""Which lines of a sale ask for a sales person (NeoSalon, step 1, lot G1; product owner, 09.11.2026).

The till's « sales persons » setting (`POS Settings.enable_sales_persons`) makes it ask for a person on every billable line. A
salon sells two kinds of things: services, which somebody performed, and products on the shelf, which nobody may want to track.
The product owner decided it is a setting, not a fixed rule: services always ask, a product asks only when the till follows the
sales of products by person too (`POS Settings.track_product_sales_by_person`, off by default).

What a line is — a service or a product — is not known to POS Next, which sells shoes as well as haircuts: the site says it through
a hook, `pos_next_item_kind(item_code)`, which answers "service", "product" or None (not mine, ask the next one). Without a hook, or
when no hook answers, every line counts as a service: the person is asked exactly as before, and a till that is not a salon sees
no change. A hook that fails is logged and ignored, which also leaves the line asking for its person.

Nothing here makes a person required where the rule has never made one so: a return, a sale played back from the offline queue and
the lines worth nothing are decided by `sales_person_commission.py` before it asks this module.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint

HOOK = "pos_next_item_kind"
SERVICE = "service"
PRODUCT = "product"
KINDS = (SERVICE, PRODUCT)
# One call of the till names this many items at most: the cart of a sale, with room to spare
MOST_ITEMS_ASKED_AT_ONCE = 200


def item_kind(item_code: str | None) -> str | None:
	"""What the site's hooks say the item is: "service", "product", or None when no hook has an answer."""
	if not item_code:
		return None
	for path in frappe.get_hooks(HOOK) or []:
		try:
			answer = frappe.get_attr(path)(item_code)
		except Exception:
			frappe.log_error("The item kind hook failed", f"{path} for {item_code}\n{frappe.get_traceback()}")
			continue
		if answer in KINDS:
			return answer
	return None


def products_are_tracked(pos_profile: str | None) -> bool:
	"""Whether the till of this profile follows the sales of products by person too."""
	if not pos_profile:
		return False
	return bool(
		cint(
			frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, "track_product_sales_by_person")
		)
	)


def asks_for_a_person(item_code: str | None, *, products_tracked: bool) -> bool:
	"""Whether a line of this item must name its person: a service always, a product when products are tracked."""
	if products_tracked:
		return True
	return item_kind(item_code) != PRODUCT


@frappe.whitelist()
def item_kinds(pos_profile: str, item_codes) -> dict:
	"""What the till needs to word and to ask for the person of each line of its cart: `{item_code: kind}`.

	The kind is "service", "product", or "" when no hook of the site has an answer (the till then keeps its ordinary wording).
	Only a user of the till asks, like for every read of the till.
	"""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes)
	if not isinstance(item_codes, list) or not all(isinstance(code, str) for code in item_codes):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return {code: item_kind(code) or "" for code in dict.fromkeys(item_codes[:MOST_ITEMS_ASKED_AT_ONCE])}
