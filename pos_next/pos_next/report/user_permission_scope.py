# //// Neoffice — added file (no upstream equivalent).
"""What a POS report may show a user kept to some companies, tills or warehouses.

The POS reports read with raw SQL, which reads no User Permission, and they have no Company column for the
framework's own row filter (`frappe.desk.query_report`), so a user kept to one company read the others'
figures (neoffice-maintenance#2296). `pos_expense_report.apply_company_scope` scopes its own report the same
way. A user with no User Permission adds no condition, and his report reads as it always did.
"""

from frappe.core.doctype.user_permission.user_permission import get_permitted_documents

SCOPED = (("Company", "company"), ("POS Profile", "pos_profile"))


def conditions(alias, filters):
	"""The SQL conditions on the table `alias`, with their values put in `filters`."""
	found = []
	for doctype, column in SCOPED:
		permitted = get_permitted_documents(doctype)
		if permitted:
			key = f"permitted_{column}"
			filters[key] = tuple(permitted)
			found.append(f"{alias}.{column} IN %({key})s")
	return found


def company_conditions(alias, filters):
	"""Only the company's condition, for a table with a company but no till (a Payment Entry, a Journal Entry)."""
	permitted = get_permitted_documents("Company")
	if not permitted:
		return []
	filters["permitted_company"] = tuple(permitted)
	return [f"{alias}.company IN %(permitted_company)s"]


def permitted_warehouses():
	return get_permitted_documents("Warehouse")


def warehouse_conditions(column, filters):
	"""The SQL condition on the warehouse `column`, with its value put in `filters`."""
	permitted = permitted_warehouses()
	if not permitted:
		return []
	filters["permitted_warehouse"] = tuple(permitted)
	return [f"{column} IN %(permitted_warehouse)s"]


def leaves_profile(pos_profile):
	permitted = get_permitted_documents("POS Profile")
	return not permitted or pos_profile in permitted
