# //// Neoffice — added file (no upstream equivalent).
"""The sales persons of a salon are its employees (NeoSalon, step 1, lot G1.2; product owner, 09.11.2026).

ERPNext ties a Sales Person to at most ONE Employee, and nothing creates the first from the second: a salon that turns on the
till's « who did the work » would have to make a Sales Person by hand for each hairdresser, and again for each one who joins. This
module makes them from the employees, so that the person of the signed-in account (`is_mine`, `get_sales_persons`) and the colleagues
the cashier can name are there from the first day.

It acts only on a site where a till asks for a sales person (`POS Settings.enable_sales_persons` is not « Disabled » on an enabled
till): anywhere else an employee is an employee, and no Sales Person appears for the staff of a company that does not sell with them.

- an employee who is saved Active without a Sales Person gets one, under the root of the sales team, in the employee's company
  (the till lists the Sales Persons of its own company), named as the employee, and told apart by the employee's id when the name is
  taken;
- an employee who is no longer Active (Left, Inactive, Suspended) has the Sales Person disabled, never deleted: the sales already
  booked keep their person and their commission; an employee who comes back Active has it enabled again;
- an administrator who disables or deletes the Sales Person of an Active employee is obeyed: nothing is remade until the status of
  the employee changes;
- turning the option on for a till makes the missing ones for the employees who already exist, and so does a migration of a site
  where it is already on (the patch of the same name).
"""

import frappe

ACTIVE = "Active"


def option_is_on() -> bool:
	"""Whether a till of the site asks for a sales person."""
	return bool(
		frappe.db.exists(
			"POS Settings", {"enabled": 1, "enable_sales_persons": ["in", ["Single", "Multiple"]]}
		)
	)


def sales_person_of(employee: str) -> str | None:
	return frappe.db.get_value("Sales Person", {"employee": employee}, "name")


def _root_of_the_team() -> str | None:
	roots = frappe.get_all(
		"Sales Person",
		filters={"is_group": 1, "parent_sales_person": ["is", "not set"]},
		pluck="name",
		order_by="creation asc",
		limit=1,
	)
	return roots[0] if roots else None


def _free_name(employee_name: str, employee: str) -> str:
	"""The employee's name, or the name and the employee's id when another Sales Person has taken it."""
	if not frappe.db.exists("Sales Person", employee_name):
		return employee_name
	return f"{employee_name} ({employee})"


def make_the_sales_person_of(employee: str) -> str | None:
	"""Make the Sales Person of an employee who has none; its name, or None when there is nothing to make it under."""
	existing = sales_person_of(employee)
	if existing:
		return existing
	root = _root_of_the_team()
	if not root:
		return None
	values = frappe.db.get_value("Employee", employee, ["employee_name", "company"], as_dict=True)
	person = frappe.get_doc(
		{
			"doctype": "Sales Person",
			"sales_person_name": _free_name(values.employee_name, employee),
			"parent_sales_person": root,
			"is_group": 0,
			"enabled": 1,
			"employee": employee,
		}
	)
	if person.meta.has_field("company"):
		person.company = values.company
	person.flags.ignore_permissions = True
	person.insert()
	return person.name


def make_the_missing_sales_persons() -> list[str]:
	"""A Sales Person for every Active employee who has none; the names made."""
	made = []
	for employee in frappe.get_all("Employee", filters={"status": ACTIVE}, pluck="name"):
		if not sales_person_of(employee):
			name = make_the_sales_person_of(employee)
			if name:
				made.append(name)
	return made


def _enable(person: str, on: bool) -> None:
	if frappe.db.get_value("Sales Person", person, "enabled") != int(on):
		frappe.db.set_value("Sales Person", person, "enabled", int(on))


def employee_saved(doc, method=None) -> None:
	"""`Employee.on_update`: follow the employee when a till asks for a sales person."""
	if not option_is_on():
		return
	before = doc.get_doc_before_save()
	status_changed = before is None or before.status != doc.status
	person = sales_person_of(doc.name)
	if doc.status == ACTIVE:
		if not person:
			if status_changed:
				make_the_sales_person_of(doc.name)
		elif status_changed:
			_enable(person, True)
	elif person:
		_enable(person, False)


def till_settings_saved(doc, method=None) -> None:
	"""`POS Settings.on_update`: a till that begins to ask for a sales person has one for each employee."""
	if doc.enabled and doc.enable_sales_persons in ("Single", "Multiple"):
		before = doc.get_doc_before_save()
		if before is None or before.enable_sales_persons not in ("Single", "Multiple"):
			make_the_missing_sales_persons()
