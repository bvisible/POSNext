# //// Neoffice — added file (no upstream equivalent). What the desk's recipe screens and Nora ask of the server (NeoResto lot R3). The rules, and
# //// the rights they ask, are pos_next/restaurant/recipes.py, recipe_library.py and recipe_plan.py. Where the site does not run NeoResto every
# //// call refuses.
"""The recipes' calls."""

import json

import frappe

from pos_next.restaurant import recipe_library, recipe_plan, recipes


def _json(value):
	return json.loads(value) if isinstance(value, str) else value


@frappe.whitelist()
def get_recipe(name, portions=None):
	"""A recipe as it is read, its quantities for `portions` when asked (the recipe's own otherwise)."""
	return recipes.sheet(name, portions)


@frappe.whitelist()
def search_recipes(query=None, family=None, ingredient=None, vegetarian=None, limit=None):
	"""The recipes that fit the words asked, the best first."""
	flag = None if vegetarian in (None, "") else frappe.utils.cint(vegetarian) == 1
	return recipes.search(query, family, ingredient, flag, limit or recipes.MOST_RESULTS)


@frappe.whitelist()
def get_library():
	"""What the free library offers, and which of it the restaurant already holds."""
	return recipe_library.listing()


@frappe.whitelist()
def add_from_library(ids):
	"""Add the fiches chosen from the free library to the restaurant's recipes, « To review »."""
	return recipe_library.add_to_restaurant(_json(ids))


@frappe.whitelist()
def get_link_suggestions(recipe):
	"""For each ingredient of a recipe: the article it is linked to, or those it could be. Nothing is applied."""
	return recipes.link_suggestions(recipe)


@frappe.whitelist()
def set_ingredient_links(recipe, links):
	"""Link ingredients to articles as the person confirmed: [{idx, item, qty, unit}], all or none."""
	return recipes.set_ingredient_links(recipe, _json(links))


@frappe.whitelist()
def set_dish_recipe(dish, recipe=None):
	"""Link a dish the restaurant sells to a recipe, or take the link away."""
	return recipes.set_dish_recipe(dish, recipe)


@frappe.whitelist()
def propose_recipes(recipes_said):
	"""What the recipes the owner described mean, and nothing written: a JSON list of {name, family, portions, minutes, ingredients, steps...}.
	Nora reads it back to the owner before `apply_recipes`."""
	return recipe_plan.propose(_json(recipes_said))


@frappe.whitelist()
def apply_recipes(recipes_said):
	"""Write what the owner confirmed, as `propose_recipes` answered it: all of it, or none."""
	return recipe_plan.apply(_json(recipes_said))
