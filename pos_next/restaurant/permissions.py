# //// Neoffice — added file (no upstream equivalent). Who may manage a restaurant (NeoRestau lot 1, task 3;
# //// maintenance#1967). Lot 0 made every till endpoint check WHO calls it: a portal account reaches nothing, a
# //// cashier works at a till of his. What he may DO there was still open: the floor plan and its tables, the
# //// preparation stations and workflows, the option groups, the cards, their prices, items, badges and design were
# //// every cashier's to change. They are the restaurant managers' now, checked here, on the server, whatever the
# //// till shows.
"""The rights of a restaurant: one rule for every endpoint, its two roles, and the rules of its doctypes.

A caller may do something to a restaurant when he is a desk account (a portal account never is, whatever roles it was
given) and his roles grant the right on the doctype concerned, as the doctype's permission rules say. An endpoint
then saves as that user, so that Frappe checks the same rules once more on the document itself.

Who holds which right is written in the doctypes' JSON: the restaurant's managers (`Restaurant Manager`, the
customer's `Admin`, the till manager `Nexus POS Manager`) read, write, create and delete everything; a cashier
(`POSNext Cashier`) reads it all, takes reservations, records tips and sets the status of a table; the kitchen
(`Restaurant Kitchen`) reads the preparation stations and workflows. That role has no desk access: an account that
holds it alone is a portal account, which every endpoint refuses, so a kitchen tablet runs on a desk account that also
holds a till role (a cashier's), until the devices get accounts of their own (NeoRestau lot 4).

The item sheet (description, image, colour) and the till's price list are the ERP's Item and Item Price: whoever
edits them from the till needs the ERP's own rights on them. The badges and spice level of a dish, and its price and
availability on a card, are the restaurant's (`manage_cards`).
"""

import frappe
from frappe import _

# The roles that manage a restaurant: its own manager (who runs the dining room), the customer's administrator, and
# System Manager. A restaurant screen is never gated on System Manager alone: on the fleet only Administrator holds it.
MANAGER_ROLES = ("Restaurant Manager", "Admin", "System Manager")
MANAGER_ROLE = "Restaurant Manager"
KITCHEN_ROLE = "Restaurant Kitchen"
# The till manager role upstream ships (cash_entry.TILL_MANAGER_ROLES) manages the restaurant as well
TILL_MANAGER_ROLE = "Nexus POS Manager"
# The desk access of the roles this app defines: a kitchen device account has no business on the desk
ROLES = {MANAGER_ROLE: 1, KITCHEN_ROLE: 0}

# The doctypes of a restaurant's set-up and service, whose rules this app ships in their JSON
DOCTYPES = (
	"Restaurant",
	"Restaurant Area",
	"Restaurant Table",
	"Preparation Station",
	"Preparation Workflow",
	"Restaurant Card",
	"Restaurant Menu",
	"Product Option Group",
	"Menu Badge",
	"Menu Design Template",
	"Restaurant Reservation",
	"Restaurant Tip",
)
# The roles whose rules grant_restaurant_permissions() carries over to a site that customized those doctypes
CASHIER_ROLE = "POSNext Cashier"
ADMIN_ROLE = "Admin"
GRANTED_ROLES = (*MANAGER_ROLES, TILL_MANAGER_ROLE, KITCHEN_ROLE, CASHIER_ROLE)

# What the till is told the user may do, and the right on a doctype that decides it. The floor plan is the rooms':
# a cashier may write a table (its status), never a room. The item sheet and the price list are the ERP's.
RIGHTS = {
	"manage_floor": ("Restaurant Area", "write"),
	# The service's, not the layout's: a cashier writes a table's status. It is the right of `update_table_status`,
	# `mark_table_available` and `free_cleaning_tables`, and what the floor plan's menu shows its table items by
	"set_table_status": ("Restaurant Table", "write"),
	"manage_cards": ("Restaurant Card", "write"),
	"manage_options": ("Product Option Group", "write"),
	"manage_workflows": ("Preparation Workflow", "write"),
	"manage_settings": ("Restaurant", "write"),
	"view_tips": ("Restaurant Tip", "read"),
	"edit_items": ("Item", "write"),
	"edit_prices": ("Item Price", "write"),
	"create_items": ("Item", "create"),
}


def require(doctype: str, ptype: str = "write", name: str | None = None) -> None:
	"""Refuse (frappe.PermissionError, a 403 over HTTP) whoever may not `ptype` the doctype, or the record named.

	A visitor and a portal account are refused before anything is looked up (cash_entry.require_system_user). Then
	the doctype's own rules decide, for the doctype and, when a record is named and exists, for that record. A name
	that does not exist is left to the endpoint, which reports it as it always did.
	"""
	from pos_next.api.cash_entry import require_system_user

	require_system_user()
	# A record is named by its name: anything else (a dict from a JSON body, which frappe.get_doc would read as
	# filters) would skip the record's own check below
	if name is not None and not isinstance(name, str):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	frappe.has_permission(doctype, ptype, throw=True)
	if name and frappe.db.exists(doctype, name):
		frappe.has_permission(doctype, ptype, doc=name, throw=True)


def require_right(right: str) -> None:
	"""Refuse whoever may not do what the till's `right` (a key of RIGHTS) stands for."""
	doctype, ptype = RIGHTS[right]
	require(doctype, ptype)


def require_restaurant(restaurant: str | None) -> None:
	"""Refuse whoever may not read the restaurant whose records an endpoint answers (none named: nothing to check).

	It is where per-restaurant user permissions apply: a user restricted to one restaurant reads no other's.
	"""
	if restaurant:
		require("Restaurant", "read", restaurant)


def can(right: str) -> bool:
	"""Whether the session user may do what the till's `right` stands for (the check `require_right` makes)."""
	from pos_next.api.cash_entry import is_desk_account

	doctype, ptype = RIGHTS[right]
	try:
		return is_desk_account() and bool(frappe.has_permission(doctype, ptype))
	except frappe.DoesNotExistError:
		# The code is updated and the site is not migrated yet: the doctype is not there to be managed
		frappe.clear_last_message()
		return False


def rights_of_the_user() -> dict[str, bool]:
	"""Every right of RIGHTS for the session user, and whether he may save the till's settings: what the till shows him.

	The till's own settings (its POS Settings, its warehouse) are its managers' (product owner, 30.10.2026): lot 0's
	till managers (cash_entry.TILL_MANAGER_ROLES), whatever the restaurant's rights.
	"""
	from pos_next.api.cash_entry import is_till_manager

	rights = {right: can(right) for right in RIGHTS}
	rights["manage_till_settings"] = is_till_manager()
	return rights


def ensure_restaurant_roles() -> None:
	"""Make the two roles of the restaurant, `Restaurant Manager` and `Restaurant Kitchen`, with their desk access.

	Idempotent. Frappe makes every role a doctype's rules name when it syncs the doctype, always with desk access: the
	kitchen's is turned off here, at each migrate, since the role is this app's to define (an account that needs the
	desk is given another role).
	"""
	for role, desk_access in ROLES.items():
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": desk_access}).insert(
				ignore_permissions=True
			)
			continue
		if frappe.db.get_value("Role", role, "desk_access") != desk_access:
			doc = frappe.get_doc("Role", role)
			doc.desk_access = desk_access
			doc.save(ignore_permissions=True)


def grant_restaurant_permissions() -> list[str]:
	"""Carry the rules the doctypes' JSON gives the restaurant's roles over to the doctypes a site customized.

	Frappe reads a doctype's rules from its JSON until the site customizes it (one Custom DocPerm row), and from then on
	from the custom rules alone: a rule this app adds to its JSON later never reaches that site. On the fleet every
	restaurant doctype is customized (the customer's administrator was given read on every doctype), so the rules of
	GRANTED_ROLES are carried over here, for a role that has no rule at all on that doctype, as the JSON writes it.

	A rule the site has for a role is the site's, whatever it grants: it is never changed, never widened (a customer
	may have narrowed it on purpose), never removed. One exception, the customer's administrator (`Admin`), who manages
	everything (NeoRestau spec, § C). His read-only rule on these doctypes is our theme's, which gives him read on
	every doctype, not the customer's choice, so it is widened to the rights the JSON grants him (never narrowed). A
	doctype the site did not customize reads its JSON: nothing to do. Returns the doctypes given or widened a rule.
	"""
	from frappe.permissions import rights

	changed = set()
	for doctype in DOCTYPES:
		if not frappe.db.exists("DocType", doctype) or not frappe.db.exists(
			"Custom DocPerm", {"parent": doctype}
		):
			continue
		standard = frappe.get_all(
			"DocPerm",
			filters={
				"parent": doctype,
				"parenttype": "DocType",
				"permlevel": 0,
				"if_owner": 0,
				"role": ["in", GRANTED_ROLES],
			},
			fields=["role", *rights],
		)
		for rule in standard:
			granted = {right: 1 for right in rights if rule.get(right)}
			if not granted or not frappe.db.exists("Role", rule.role):
				continue
			try:
				if rule.role == ADMIN_ROLE:
					# The administrator's rule is widened where he has one, added where he has none
					if _widen(doctype, rule.role, granted):
						changed.add(doctype)
					if frappe.db.exists("Custom DocPerm", _level_zero(doctype, rule.role)):
						continue
				# Any other role that already has a rule, at any level, keeps it as it is
				elif frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": rule.role}):
					continue
				frappe.get_doc(
					{
						"doctype": "Custom DocPerm",
						"parent": doctype,
						"parenttype": "DocType",
						"parentfield": "permissions",
						"role": rule.role,
						"permlevel": 0,
						"if_owner": 0,
						**granted,
					}
				).insert(ignore_permissions=True)
				changed.add(doctype)
			except Exception:
				frappe.log_error(f"POS Next: restaurant permission on {doctype}", frappe.get_traceback())
	for doctype in changed:
		frappe.clear_cache(doctype=doctype)
	return sorted(changed)


def _widen(doctype: str, role: str, granted: dict) -> bool:
	"""Give the role's existing rule (permlevel 0, not owner-only) the rights the JSON grants; True when widened.

	Only rights are added, none is taken away. A role without such a rule is left to the caller (it gets one added).
	"""
	custom = frappe.get_all(
		"Custom DocPerm", filters=_level_zero(doctype, role), pluck="name", order_by="creation asc", limit=1
	)
	if not custom:
		return False
	doc = frappe.get_doc("Custom DocPerm", custom[0])
	missing = [right for right in granted if not doc.get(right)]
	if not missing:
		return False
	for right in missing:
		doc.set(right, 1)
	doc.save(ignore_permissions=True)
	return True


def _level_zero(doctype: str, role: str) -> dict:
	"""The filters of a role's main rule on a doctype: permission level 0, not owner-only."""
	return {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
