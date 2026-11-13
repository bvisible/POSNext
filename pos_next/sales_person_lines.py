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

# //// Neoffice — what counts as a service, chosen by the till itself (13.11.2026: « un garage ou une boutique, pas seulement le salon »)
MODE_SITE = "As the site says"
MODE_NON_STOCK = "Items not kept in stock"
MODE_GROUPS = "Items of the chosen groups"
HOOK = "pos_next_item_kind"
SERVICE = "service"
PRODUCT = "product"
KINDS = (SERVICE, PRODUCT)
# One call of the till names this many items at most: the cart of a sale, with room to spare
MOST_ITEMS_ASKED_AT_ONCE = 200


def rule_of(pos_profile: str | None) -> frappe._dict:
	"""What the till says counts as a service: `mode` (as the site says, items not kept in stock, items of chosen groups), the `groups` of the last
	one, and the `question` the cashier reads for a service in the client's words. A till that says nothing, or a site not migrated yet, keeps the
	site's way (the hooks), which is what every till did before."""
	rule = frappe._dict(mode=MODE_SITE, groups=[], question="")
	if not pos_profile:
		return rule
	try:
		row = frappe.db.get_value(
			"POS Settings",
			{"pos_profile": pos_profile},
			["name", "sales_person_lines_ask", "sales_person_question"],
			as_dict=True,
		)
	except Exception as error:
		if frappe.db.is_missing_column(error):
			return rule
		raise
	if not row:
		return rule
	if row.sales_person_lines_ask in (MODE_NON_STOCK, MODE_GROUPS):
		rule.mode = row.sales_person_lines_ask
	rule.question = (row.sales_person_question or "").strip()
	if rule.mode == MODE_GROUPS:
		rule.groups = frappe.get_all(
			"POS Item Group",
			filters={"parent": row.name, "parenttype": "POS Settings", "parentfield": "sales_person_service_groups"},
			pluck="item_group",
		)
	return rule


def _is_internal_or_gift_card(item_code: str) -> bool:
	"""The tip and the gift card are neither a service nor a product, whatever the till says."""
	if frappe.db.has_column("Item", "is_internal_item") and cint(frappe.db.get_value("Item", item_code, "is_internal_item")):
		return True
	if not (frappe.db.table_exists("POS Settings") and frappe.db.has_column("POS Settings", "gift_card_item")):
		return False
	return bool(frappe.db.exists("POS Settings", {"gift_card_item": item_code}))


def _kind_by_the_till(item_code: str, rule) -> str | None:
	"""The kind an item has by what the till says: the items not kept in stock are services, or the items of the chosen groups (and their
	sub-groups); everything else a product. None for what is neither (the tip, a gift card, an item that does not exist)."""
	item = frappe.db.get_value("Item", item_code, ["is_stock_item", "item_group"], as_dict=True)
	if not item or _is_internal_or_gift_card(item_code):
		return None
	if rule.mode == MODE_NON_STOCK:
		return PRODUCT if cint(item.is_stock_item) else SERVICE
	lft = frappe.db.get_value("Item Group", item.item_group, "lft")
	for group in rule.groups:
		left, right = frappe.db.get_value("Item Group", group, ["lft", "rgt"]) or (None, None)
		if left is not None and lft is not None and left <= lft < right:
			return SERVICE
	return PRODUCT


def item_kind(item_code: str | None, pos_profile: str | None = None) -> str | None:
	"""What the item is: "service", "product", or None when nothing has an answer. The till's own rule first (items not kept in stock, items of
	chosen groups) where it has one; otherwise what the site's hooks say."""
	if not item_code:
		return None
	rule = rule_of(pos_profile)
	if rule.mode != MODE_SITE:
		return _kind_by_the_till(item_code, rule)
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


def asks_for_a_person(item_code: str | None, *, products_tracked: bool, pos_profile: str | None = None) -> bool:
	"""Whether a line of this item must name its person: a service always, a product when products are tracked."""
	if products_tracked:
		return True
	return item_kind(item_code, pos_profile) != PRODUCT


def the_site_tells_the_kinds(pos_profile: str | None = None) -> bool:
	"""Whether the kinds are told (by the site's hook, or by the till's own rule): else the till keeps its ordinary words."""
	return bool(frappe.get_hooks(HOOK)) or rule_of(pos_profile).mode != MODE_SITE


@frappe.whitelist()
def item_kinds(pos_profile: str, item_codes=None) -> dict:
	"""What the till needs to word and to ask for the person of each line of its cart.

	`{"told": whether the site tells services from products at all, "kinds": {item_code: kind}}`. The kind is "service", "product", or ""
	when no hook of the site has an answer for that item. Only a user of the till asks, like for every read of the till.
	"""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	if item_codes is None:
		item_codes = []
	if isinstance(item_codes, str):
		item_codes = json.loads(item_codes)
	if not isinstance(item_codes, list) or not all(isinstance(code, str) for code in item_codes):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return {
		"told": the_site_tells_the_kinds(pos_profile),
		"question": rule_of(pos_profile).question,
		"kinds": {
			code: item_kind(code, pos_profile) or ""
			for code in dict.fromkeys(item_codes[:MOST_ITEMS_ASKED_AT_ONCE])
		},
	}
