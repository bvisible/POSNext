# //// Neoffice — added file (no upstream equivalent). What the desk's recipe screens and Nora ask of the server (NeoResto lot R3). The rules, and
# //// the rights they ask, are pos_next/restaurant/recipes.py, recipe_library.py and recipe_plan.py. Where the site does not run NeoResto every
# //// call refuses.
"""The recipes' calls."""

import json

import frappe

from pos_next.restaurant import card_analysis as card_reading
from pos_next.restaurant import recipe_library, recipe_plan, recipe_shopping, recipes, season


def _json(value):
	return json.loads(value) if isinstance(value, str) else value


@frappe.whitelist()
def get_recipe(name, portions=None):
	"""A recipe as it is read, its quantities for `portions` when asked (the recipe's own otherwise)."""
	return recipes.sheet(name, portions)


@frappe.whitelist()
def search_recipes(
	query=None, family=None, ingredient=None, vegetarian=None, limit=None, month=None, in_season=None
):
	"""The recipes that fit the words asked, the best first; `in_season` keeps those in season (or stored) for `month`."""
	flag = None if vegetarian in (None, "") else frappe.utils.cint(vegetarian) == 1
	seasonal = None if in_season in (None, "") else frappe.utils.cint(in_season) == 1
	return recipes.search(
		query, family, ingredient, flag, limit or recipes.MOST_RESULTS, month or None, seasonal
	)


@frappe.whitelist()
def get_library(month=None):
	"""What the free library offers, and which of it the restaurant already holds (and which is in season, when a calendar is installed)."""
	return recipe_library.listing(month or None)


@frappe.whitelist()
def get_season(month=None, family=None, query=None):
	"""What is in season in Switzerland for a month (this month by default), or what the calendar says of the products asked."""
	return season.what_is_in_season(month or None, family or None, query or None)


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


@frappe.whitelist()
def plan_recipe_shopping(dishes):
	"""What the dishes planned come to on the shopping list (a JSON list of {name, portions}); nothing is written."""
	return recipe_shopping.plan(_json(dishes))


@frappe.whitelist()
def card_analysis(months=None, from_date=None, to_date=None):
	"""The dishes sold, placed on what they sell and what they earn, family by family; nothing written (card_analysis.py)."""
	return card_reading.card(months or None, from_date or None, to_date or None)


@frappe.whitelist()
def recipe_cost(name, portions=None, markup=None):
	"""What a portion of a dish costs from the last prices paid; a selling price only when the owner's coefficient (`markup`) is given."""
	return recipe_shopping.cost(name, portions or None, markup or None)
