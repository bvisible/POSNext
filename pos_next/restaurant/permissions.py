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
(`Restaurant Kitchen`) reads the preparation stations and workflows.
"""

import frappe

# The roles that manage a restaurant: its own manager (« responsable de salle »), the customer's administrator, and
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
GRANTED_ROLES = (*MANAGER_ROLES, TILL_MANAGER_ROLE, KITCHEN_ROLE)

# What the till is told the user may do, and the right on a doctype that decides it. The floor plan is the rooms':
# a cashier may write a table (its status), never a room.
RIGHTS = {
	"manage_floor": ("Restaurant Area", "write"),
	"manage_cards": ("Restaurant Card", "write"),
	"manage_options": ("Product Option Group", "write"),
	"manage_workflows": ("Preparation Workflow", "write"),
	"manage_settings": ("Restaurant", "write"),
	"view_tips": ("Restaurant Tip", "read"),
}


def require(doctype: str, ptype: str = "write", name: str | None = None) -> None:
	"""Refuse (frappe.PermissionError, a 403 over HTTP) whoever may not `ptype` the doctype, or the record named.

	A visitor and a portal account are refused before anything is looked up (cash_entry.require_system_user). Then
	the doctype's own rules decide, for the doctype and, when a record is named and exists, for that record. A name
	that does not exist is left to the endpoint, which reports it as it always did.
	"""
	from pos_next.api.cash_entry import require_system_user

	require_system_user()
	frappe.has_permission(doctype, ptype, throw=True)
	if name and isinstance(name, str) and frappe.db.exists(doctype, name):
		frappe.has_permission(doctype, ptype, doc=name, throw=True)


def require_right(right: str) -> None:
	"""Refuse whoever may not do what the till's `right` (a key of RIGHTS) stands for."""
	doctype, ptype = RIGHTS[right]
	require(doctype, ptype)


def _is_desk_account() -> bool:
	user = frappe.session.user
	if user == "Administrator":
		return True
	return user != "Guest" and frappe.get_cached_value("User", user, "user_type") == "System User"


def can(right: str) -> bool:
	"""Whether the session user may do what the till's `right` stands for (the check `require_right` makes)."""
	doctype, ptype = RIGHTS[right]
	try:
		return _is_desk_account() and bool(frappe.has_permission(doctype, ptype))
	except frappe.DoesNotExistError:
		# The code is updated and the site is not migrated yet: the doctype is not there to be managed
		frappe.clear_last_message()
		return False


def rights_of_the_user() -> dict[str, bool]:
	"""Every right of RIGHTS, for the session user: what the till shows him."""
	return {right: can(right) for right in RIGHTS}


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


def grant_restaurant_permissions() -> None:
	"""Carry the rules the doctypes' JSON gives the restaurant's roles over to the doctypes a site customized.

	Frappe reads a doctype's rules from its JSON until the site customizes it (one Custom DocPerm row), and from then on
	from the custom rules alone: a rule this app adds to its JSON later never reaches that site. On the fleet every
	restaurant doctype is customized (the customer's administrator was given read on every doctype), so the rules of
	GRANTED_ROLES are carried over here, the way the site keeps them: a missing rule is added, and a rule that grants
	less than the JSON gets the rights the JSON grants (the customer's administrator only read the restaurant, he
	manages it now). Nothing is ever taken away, and the rules of the other roles are left as the site has them.
	A doctype the site did not customize reads its JSON: nothing to do.
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
				if _grant(doctype, rule.role, granted, rights):
					changed.add(doctype)
			except Exception:
				frappe.log_error(f"POS Next: restaurant permission on {doctype}", frappe.get_traceback())
	for doctype in changed:
		frappe.clear_cache(doctype=doctype)


def _grant(doctype: str, role: str, granted: dict, rights: tuple) -> bool:
	"""Give `role` at least the `granted` rights on a customized doctype; True when a rule was added or widened."""
	custom = frappe.get_all(
		"Custom DocPerm",
		filters={"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0},
		fields=["name", *rights],
		order_by="creation asc",
	)
	if not custom:
		frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": doctype,
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": role,
				"permlevel": 0,
				"if_owner": 0,
				**granted,
			}
		).insert(ignore_permissions=True)
		return True
	missing = [right for right in granted if not custom[0].get(right)]
	if not missing:
		return False
	doc = frappe.get_doc("Custom DocPerm", custom[0].name)
	for right in missing:
		doc.set(right, 1)
	doc.save(ignore_permissions=True)
	return True
