# //// Neoffice — added file (no upstream equivalent): what a list of Frappe would hide from the till's search.
"""The till's customer and item searches run raw SQL, which asks nothing of the permission engine: a cashier limited to
some customers, item groups or brands (a User Permission, a `permission_query_conditions` hook, a restricted role) still
read the whole catalogue and the whole customer list of the site, where the same account sees only its share in a desk list.

`match_conditions` hands back the SQL that a Frappe list adds for the signed-in user (the engine's own
`DatabaseQuery.build_match_conditions`: role rules, User Permission, the doctype's hooks, shared documents), after the same
read check a list makes. `restrict_to_permitted` turns it into one condition for a query that gives the table an alias.
Nothing is added for an account the rules leave unrestricted (Administrator, a role with no User Permission), so the
common case costs nothing."""

import frappe
from frappe.model.db_query import DatabaseQuery


def match_conditions(doctype: str) -> str:
	"""The SQL a list of `doctype` would add for the signed-in user, in terms of `tab<doctype>`; "" when nothing restricts her.

	Raises the PermissionError a list raises for an account that may not read the doctype at all. A right to `select` is not enough
	here (a list with only that right shows the names): the till gives the phone, the e-mail and the price of what it finds."""
	frappe.has_permission(doctype, "read", throw=True)
	return DatabaseQuery(doctype).build_match_conditions(as_condition=True) or ""


def restrict_to_permitted(doctype: str, alias: str, for_parameters: bool = False) -> str:
	"""One condition that keeps, of a query on `tab<doctype> <alias>`, the rows the signed-in user may read; "" when she may read them all.

	The rules name `tab<doctype>`, and the query gives it an alias: they are asked of the table itself, in a subquery.
	`for_parameters`: the query runs with `%s` parameters, so a literal `%` of the rules is doubled."""
	conditions = match_conditions(doctype)
	if not conditions:
		return ""
	if for_parameters:
		conditions = conditions.replace("%", "%%")
	return f"{alias}.name IN (SELECT `tab{doctype}`.`name` FROM `tab{doctype}` WHERE {conditions})"
