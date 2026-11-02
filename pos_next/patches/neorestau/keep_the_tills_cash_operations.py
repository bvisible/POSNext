# //// Neoffice — added file (no upstream equivalent). Since NeoResto lot 1 (task 15) a till's list of cash
# //// operations (POS Profile.posa_cash_entry_templates) is a control: an empty list means no movement. Before,
# //// an empty list offered every Journal Entry Template of the till's company, so a till that never chose its
# //// operations would lose them the day the lot reaches it. This fills, once, each empty list with what that till
# //// offered, less what the new rule refuses for that till (an operation that does not move the till's cash
# //// account, or whose direction cannot be read from it), and leaves a Comment on the till saying what it kept,
# //// what it left out and why. A list that is not empty is never touched.
"""Fill each till's empty list of cash operations with what it offered before the list became a control."""

import frappe
from frappe import _
from frappe.utils import escape_html

# The subject of the Comment left on a till: how a second run knows the till was sorted out already, a till
# whose list stayed empty because none of its company's operations moves its cash account included.
MARK = "pos_next: cash operations kept"


def execute():
	for profile in frappe.get_all("POS Profile", fields=["name", "company"], order_by="name asc"):
		frappe.db.savepoint("keep_the_tills_cash_operations")
		try:
			keep_the_operations(profile.name, profile.company)
		except Exception:
			# One till that cannot be sorted out must not stop the migration of the others, nor keep half its
			# rows without the Comment that explains them.
			frappe.db.rollback(save_point="keep_the_tills_cash_operations")
			frappe.log_error(
				f"Cash operations of the till {profile.name} not kept"[:140], frappe.get_traceback()
			)


def keep_the_operations(pos_profile, company):
	"""Fill one till's empty list. Returns (kept, left out), or None when the till is left as it is: its list
	is not empty, it was sorted out before, or its company has no operation at all."""
	if frappe.db.exists(
		"POS Cash Entry Template",
		{"parent": pos_profile, "parenttype": "POS Profile", "parentfield": "posa_cash_entry_templates"},
	):
		return None
	if frappe.db.exists(
		"Comment", {"reference_doctype": "POS Profile", "reference_name": pos_profile, "subject": MARK}
	):
		return None
	kept, left_out = sort_out(pos_profile, company)
	if not kept and not left_out:
		return None
	for idx, template in enumerate(kept, start=1):
		frappe.get_doc(
			{
				"doctype": "POS Cash Entry Template",
				"parent": pos_profile,
				"parenttype": "POS Profile",
				"parentfield": "posa_cash_entry_templates",
				"idx": idx,
				"journal_entry_template": template,
			}
		).db_insert()
	frappe.clear_document_cache("POS Profile", pos_profile)
	_say(pos_profile, kept, left_out)
	return kept, left_out


def sort_out(pos_profile, company):
	"""What the till offered before (every operation of its company), split into the operations the till can
	book and those the new rule refuses for it: [names], [(name, reason)]."""
	from pos_next import cash_movement

	operations = frappe.get_all(
		"Journal Entry Template", filters={"company": company}, pluck="name", order_by="template_title asc"
	)
	if not company or not operations:
		return [], []
	cash_account = cash_movement.till_cash_account(pos_profile, company, required=False)
	if not cash_account:
		return [], [
			(name, _("{0}: the till's cash mode of payment has no account for {1}.").format(name, company))
			for name in operations
		]
	kept, left_out = [], []
	for name in operations:
		definition = cash_movement.template_definition(name)
		if cash_movement.drawer_direction(definition, cash_account):
			kept.append(name)
		else:
			# Its direction cannot be read, or it does not move the till's cash account: the reason says which.
			left_out.append((name, cash_movement.definition_problem(definition, cash_account, company)))
	return kept, left_out


def _say(pos_profile, kept, left_out):
	"""A Comment on the till, for its manager, and a line in the migration's output."""
	lines = [
		_(
			"Cash In/Out: this till's list of operations was empty, which offered every operation of its company. It now lists those the till can book: {0}."
		).format(", ".join(kept))
		if kept
		else _(
			"Cash In/Out: this till's list of operations was empty, which offered every operation of its company. None of them can be booked at this till: the list stays empty."
		)
	]
	if left_out:
		# Each reason names its operation (cash_movement.definition_problem, or the line above).
		lines.append(_("Left out: {0}").format(" ".join(reason for _name, reason in left_out)))
	frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": "POS Profile",
			"reference_name": pos_profile,
			"subject": MARK,
			"content": "<br>".join(escape_html(line) for line in lines),
		}
	).insert(ignore_permissions=True)
	print(
		f"POS Profile {pos_profile}: cash operations kept {kept}; left out {[name for name, _reason in left_out]}"
	)
