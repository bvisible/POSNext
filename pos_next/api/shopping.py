# //// Neoffice — added file (no upstream equivalent). What the Achats screens of NeoResto ask of the server about the shopping
# //// list (purchases, lot B). The rules, and the rights they ask, are pos_next/restaurant/shopping.py.
"""The shopping list's calls."""

import json

import frappe

from pos_next.restaurant import dishes, shopping, supply_catalogue


def _gate():
	supply_catalogue.require_purchases()


@frappe.whitelist()
def new_list(company=None, cost_center=None, list_date=None):
	_gate()
	return shopping.new_list(company, cost_center, list_date)


@frappe.whitelist()
def get_list(list_name):
	"""The list as the screen shows it: one block per supplier, with its lines, and the estimate."""
	_gate()
	return shopping.grouped(list_name)


@frappe.whitelist()
def add_article_line(list_name, item, qty=1, supplier=None, uom=None):
	_gate()
	return shopping.add_article_line(list_name, item, qty, supplier or None, uom or None)


@frappe.whitelist()
def add_article_lines(list_name, lines):
	"""The articles ticked in the picker, with their quantities: a JSON list of {item, qty, supplier, uom}."""
	_gate()
	return shopping.add_article_lines(list_name, json.loads(lines) if isinstance(lines, str) else lines)


@frappe.whitelist()
def add_free_line(list_name, text, qty=1, unit_text=None, supplier=None):
	_gate()
	return shopping.add_free_line(list_name, text, qty, unit_text, supplier or None)


@frappe.whitelist()
def change_supplier(list_name, row_name, supplier=None):
	_gate()
	shopping.change_supplier(list_name, row_name, supplier or None)


@frappe.whitelist()
def set_state(list_name, row_name, state, taken_qty=None, paid_rate=None):
	_gate()
	shopping.set_state(list_name, row_name, state, taken_qty, paid_rate)


@frappe.whitelist()
def set_quantity(list_name, row_name, qty):
	_gate()
	shopping.set_quantity(list_name, row_name, qty)


@frappe.whitelist()
def remove_line(list_name, row_name):
	_gate()
	shopping.remove_line(list_name, row_name)


@frappe.whitelist()
def get_dish_ingredients(dish):
	"""What a dish needs, from the articles the restaurant buys."""
	_gate()
	return dishes.dish_ingredients(dish)


@frappe.whitelist()
def set_dish_ingredients(dish, ingredients):
	"""Replace what a dish needs: `[{"item": ..., "qty_per_portion": ... or None}, ...]`."""
	_gate()
	if isinstance(ingredients, str):
		ingredients = json.loads(ingredients or "[]")
	dishes.set_dish_ingredients(dish, ingredients)


@frappe.whitelist()
def add_dish(list_name, dish, portions=1):
	"""Put the ingredients of a dish on the list; answers, for each, what was put and how it was worked out."""
	_gate()
	return dishes.add_dish_to_list(list_name, dish, portions)


@frappe.whitelist()
def round_answer(list_name, item, answer):
	"""One answer of the stores round: `order` or `enough`."""
	_gate()
	return shopping.round_answer(list_name, item, answer)
