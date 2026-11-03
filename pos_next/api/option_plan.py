# //// Neoffice — added file (no upstream equivalent). What Nora asks of the server to set the options of the dishes (cooking, side) with the
# //// owner. The rules, and the rights they ask, are pos_next/restaurant/option_plan.py.
"""The option groups' calls."""

import json

import frappe

from pos_next.restaurant import option_plan


@frappe.whitelist()
def propose_options(targets=None):
	"""What the till should carry for the families or dishes named (every family of dishes when none is), and nothing written: a JSON
	list of words such as ["viandes", "entrecôte"]. Nora reads it back to the owner before `apply_options`."""
	return option_plan.propose(
		json.loads(targets) if isinstance(targets, str) and targets.strip() else targets or None
	)


@frappe.whitelist()
def apply_options(lines):
	"""Write what the owner confirmed, as `propose_options` answered it (its `lines`, a JSON list): all of it, or none."""
	return option_plan.apply(json.loads(lines) if isinstance(lines, str) else lines)
