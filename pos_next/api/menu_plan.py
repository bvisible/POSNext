# //// Neoffice — added file (no upstream equivalent). What Nora asks of the server to compose the menus (formulas) of a restaurant with its
# //// owner. The rules, and the rights they ask, are pos_next/restaurant/menu_plan.py.
"""The menus' calls."""

import json

import frappe

from pos_next.restaurant import menu_plan


@frappe.whitelist()
def propose_menus(menus):
	"""What the menus the owner described mean, and nothing written: a JSON list of {name, price, description, courses: [{name, choices}], card}.
	Nora reads it back to the owner before `apply_menus`."""
	return menu_plan.propose(json.loads(menus) if isinstance(menus, str) else menus)


@frappe.whitelist()
def apply_menus(menus):
	"""Write what the owner confirmed, as `propose_menus` answered it (its `menus` with every dish settled, a JSON list): all of it, or none."""
	return menu_plan.apply(json.loads(menus) if isinstance(menus, str) else menus)
