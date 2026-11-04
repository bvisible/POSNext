# //// Neoffice — added file (no upstream equivalent).
"""A dish proposed for the card can carry its recipe (NeoResto, « Nora au restaurant », lot R5). The card of a restaurant is built step by step
from a plan (`card_plan`): proposed first, written by one click, taken back by one. The suite pins what a recipe adds to that:

- a dish names one of the restaurant's own recipes (`recipe`) or a fiche of the free library (`library`); the proposal says what it means
  (matched, present, to be added « To review », ambiguous, unknown, the dish already has another one) and writes nothing;
- the click makes the dish, its price, its card row AND links its recipe, a fiche of the library being added « To review » first; the same
  fiche on two dishes makes one recipe;
- taking the step back unlinks the recipes it linked and removes the recipes it added, unless somebody touched them since;
- a dish that has a recipe already keeps it; a recipe that is not found, or not unique, leaves the dish without one and says so;
- where the site does not run NeoResto the dishes are proposed and written without a recipe, and the proposal says it.

The suite builds everything it needs and rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role

from pos_next.restaurant import card_plan
from pos_next.tests.test_service_families import a_group, an_item
from pos_next.tests.test_the_card_is_built_step_by_step_from_a_plan import CARD, ROOT, CardPlanCase

MAINS = "_Test CR Plats"
SOUP = "_Test CR Soupe de courge du chef"
STEW = "_Test CR Ragoût de bœuf"
DISH = "_Test CR Soupe du jour"
OTHER = "_Test CR Ragoût du jour"
FICHE = "based-autumn-soup"
FICHE_TITLE = "Soupe de courge d\u2019automne"


def mains(*items):
	return {"name": MAINS, "service_family": "Main", "subs": [{"name": None, "items": list(items)}]}


class RecipeCardCase(CardPlanCase):
	def setUp(self):
		super().setUp()
		patcher = patch.dict(frappe.conf, {"neoresto_active": 1})
		patcher.start()
		self.addCleanup(patcher.stop)
		self.company = frappe.db.get_value("Company", {}, "name")
		if not self.company:
			self.skipTest("The site has no company")
		if not frappe.get_meta("Item").has_field("restaurant_recipe"):
			self.skipTest("The site has no recipe field on its articles")

	def a_recipe(self, name, *ingredients, **more):
		fields = {
			"doctype": "Restaurant Recipe",
			"recipe_name": name,
			"base_portions": 4,
			"status": "Draft",
			"steps": "Cook.",
			"ingredients": [{"ingredient_name": n, "qty": 100, "unit": "g"} for n in ingredients],
			**more,
		}
		with as_role("client_admin"):
			return frappe.get_doc(fields).insert()

	def propose(self, plan):
		with as_role("client_admin"):
			return card_plan.propose(plan)

	def recipe_of(self, item):
		return frappe.db.get_value("Item", item, "restaurant_recipe")

	def item_named(self, proposal, name):
		return next(
			i for f in proposal["families"] for s in f["subs"] for i in s["items"] if i["name"] == name
		)


class TestADishNamesItsRecipe(RecipeCardCase):
	def test_the_proposal_says_which_recipe_it_means_and_writes_nothing(self):
		recipe = self.a_recipe(SOUP, "Courge", "Pommes de terre")
		items, recipes = self.count("Item"), self.count("Restaurant Recipe")
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "recipe": SOUP})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual((link["status"], link["recipe"], link["title"]), ("matched", recipe.name, SOUP))
		self.assertEqual(proposal["counts"]["recipes"], 1)
		self.assertEqual((self.count("Item"), self.count("Restaurant Recipe")), (items, recipes))

	def test_words_of_a_recipe_find_it_when_they_fit_only_one(self):
		recipe = self.a_recipe(SOUP, "Courge")
		self.a_recipe(STEW, "Bœuf")
		proposal = self.propose(self.plan(mains({"name": DISH, "recipe": "_Test CR soupe courge"})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual((link["status"], link["recipe"]), ("matched", recipe.name))

	def test_the_click_makes_the_dish_and_links_its_recipe(self):
		recipe = self.a_recipe(SOUP, "Courge")
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "recipe": SOUP})))
		self.assertEqual(self.recipe_of(DISH), recipe.name)
		self.assertEqual(manifest["recipe_links"], [{"item": DISH, "recipe": recipe.name}])
		self.assertEqual(manifest["recipes_added"], [])
		self.assertIn(DISH, manifest["items"])

	def test_taking_the_step_back_unlinks_and_removes_the_dish_but_keeps_the_recipe(self):
		recipe = self.a_recipe(SOUP, "Courge")
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "recipe": SOUP})))
		with as_role("client_admin"):
			card_plan.undo(manifest)
		self.assertFalse(frappe.db.exists("Item", DISH))
		self.assertTrue(frappe.db.exists("Restaurant Recipe", recipe.name))

	def test_an_existing_dish_is_linked_and_unlinked_without_being_removed(self):
		recipe = self.a_recipe(SOUP, "Courge")
		group = a_group(MAINS, self.root, family="Main")
		dish = an_item(DISH, group, self.company)
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "recipe": SOUP})))
		self.assertEqual(self.recipe_of(dish), recipe.name)
		with as_role("client_admin"):
			card_plan.undo(manifest)
		self.assertTrue(frappe.db.exists("Item", dish))
		self.assertIsNone(self.recipe_of(dish))

	def test_a_dish_that_has_a_recipe_keeps_it(self):
		mine = self.a_recipe(SOUP, "Courge")
		other = self.a_recipe(STEW, "Bœuf")
		group = a_group(MAINS, self.root, family="Main")
		dish = an_item(DISH, group, self.company)
		frappe.db.set_value("Item", dish, "restaurant_recipe", mine.name)
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "recipe": STEW})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual((link["status"], link["recipe"]), ("already_linked", mine.name))
		self.assertTrue(any("already has the recipe" in w for w in proposal["warnings"]))
		self.apply(self.plan(mains({"name": DISH, "price": 14.5, "recipe": STEW})))
		self.assertEqual(self.recipe_of(dish), mine.name)
		self.assertTrue(frappe.db.exists("Restaurant Recipe", other.name))

	def test_a_recipe_that_is_not_found_or_not_unique_leaves_the_dish_without_one(self):
		self.a_recipe(SOUP, "Courge")
		self.a_recipe(f"{SOUP} bis", "Courge")
		proposal = self.propose(
			self.plan(
				mains(
					{"name": DISH, "price": 14.5, "recipe": "_Test CR soupe de courge"},
					{"name": OTHER, "price": 18, "recipe": "_Test CR gigot"},
				)
			)
		)
		self.assertEqual(self.item_named(proposal, DISH)["recipe"]["status"], "ambiguous")
		self.assertEqual(self.item_named(proposal, OTHER)["recipe"]["status"], "unknown")
		self.assertEqual(proposal["counts"]["recipes"], 0)
		self.assertEqual(len([w for w in proposal["warnings"] if "recipe" in w.lower()]), 2)
		manifest = self.apply(
			self.plan(mains({"name": DISH, "price": 14.5, "recipe": "_Test CR soupe de courge"}))
		)
		self.assertTrue(frappe.db.exists("Item", DISH))
		self.assertIsNone(self.recipe_of(DISH))
		self.assertEqual(manifest["recipe_links"], [])


class TestADishNamesAFicheOfTheFreeLibrary(RecipeCardCase):
	def test_the_proposal_says_the_fiche_its_author_and_licence_and_writes_nothing(self):
		recipes = self.count("Restaurant Recipe")
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "library": "soupe courge"})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual((link["status"], link["id"], link["title"]), ("library_new", FICHE, FICHE_TITLE))
		self.assertTrue(link["author"] and link["license"])
		self.assertEqual(self.count("Restaurant Recipe"), recipes)

	def test_the_click_adds_the_fiche_to_review_and_links_it(self):
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "library": FICHE})))
		recipe = self.recipe_of(DISH)
		self.assertTrue(recipe)
		self.assertEqual(manifest["recipes_added"], [recipe])
		doc = frappe.get_doc("Restaurant Recipe", recipe)
		self.assertEqual((doc.status, doc.source_ref, doc.source_kind), ("To review", FICHE, "Library"))

	def test_taking_the_step_back_removes_the_recipe_it_added(self):
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "library": FICHE})))
		recipe = self.recipe_of(DISH)
		with as_role("client_admin"):
			result = card_plan.undo(manifest)
		self.assertFalse(frappe.db.exists("Restaurant Recipe", recipe))
		self.assertFalse(frappe.db.exists("Item", DISH))
		self.assertEqual(result["kept"], [])

	def test_a_recipe_somebody_has_since_worked_on_stays(self):
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "library": FICHE})))
		recipe = self.recipe_of(DISH)
		frappe.db.set_value("Restaurant Recipe", recipe, "status", "Validated")
		with as_role("client_admin"):
			result = card_plan.undo(manifest)
		self.assertTrue(frappe.db.exists("Restaurant Recipe", recipe))
		self.assertEqual(result["kept"], [recipe])
		self.assertFalse(frappe.db.exists("Item", DISH))

	def test_a_fiche_the_restaurant_already_has_is_linked_and_left_in_place_by_the_undo(self):
		with as_role("client_admin"):
			held = frappe.get_doc(self._library_document())
			held.insert()
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "library": FICHE})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual((link["status"], link["recipe"]), ("present", held.name))
		manifest = self.apply(self.plan(mains({"name": DISH, "price": 14.5, "library": FICHE})))
		self.assertEqual(self.recipe_of(DISH), held.name)
		self.assertEqual(manifest["recipes_added"], [])
		with as_role("client_admin"):
			card_plan.undo(manifest)
		self.assertTrue(frappe.db.exists("Restaurant Recipe", held.name))

	def _library_document(self):
		from pos_next.restaurant import recipe_library

		manifest = recipe_library._manifest()
		entry = recipe_library._entry(manifest, FICHE)
		return recipe_library._document(manifest, recipe_library._read(manifest, entry))

	def test_the_same_fiche_on_two_dishes_makes_one_recipe(self):
		manifest = self.apply(
			self.plan(
				mains(
					{"name": DISH, "price": 14.5, "library": FICHE},
					{"name": OTHER, "price": 15, "library": FICHE},
				)
			)
		)
		self.assertEqual(self.recipe_of(DISH), self.recipe_of(OTHER))
		self.assertEqual(len(manifest["recipes_added"]), 1)
		self.assertEqual(self.count("Restaurant Recipe", source_ref=FICHE), 1)
		with as_role("client_admin"):
			card_plan.undo(manifest)
		self.assertEqual(self.count("Restaurant Recipe", source_ref=FICHE), 0)

	def test_words_that_fit_several_fiches_leave_the_dish_without_one(self):
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "library": "soupe"})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual(link["status"], "ambiguous")
		self.assertGreater(len(link["candidates"]), 1)
		self.assertEqual(self.count("Restaurant Recipe", source_ref=["is", "set"]), 0)

	def test_a_fiche_the_library_does_not_have_is_said_never_made_up(self):
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "library": "gigot d'agneau"})))
		self.assertEqual(self.item_named(proposal, DISH)["recipe"]["status"], "unknown")

	def test_a_recipe_of_the_same_name_that_is_not_the_fiche_is_not_taken_for_it(self):
		self.a_recipe(FICHE_TITLE, "Courge")
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "library": FICHE})))
		link = self.item_named(proposal, DISH)["recipe"]
		self.assertEqual((link["status"], link["recipe"]), ("name_taken", None))
		self.assertEqual(proposal["counts"]["recipes"], 0)


class TestWhereTheSiteHasNoRestaurant(RecipeCardCase):
	def test_the_dishes_are_proposed_and_written_without_a_recipe(self):
		self.a_recipe(SOUP, "Courge")
		with patch.dict(frappe.conf, {"neoresto_active": 0}):
			proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5, "recipe": SOUP})))
			self.assertEqual(self.item_named(proposal, DISH)["recipe"]["status"], "unavailable")
			self.assertTrue(any("Recipes are not available" in w for w in proposal["warnings"]))
			self.apply(self.plan(mains({"name": DISH, "price": 14.5, "recipe": SOUP})))
		self.assertTrue(frappe.db.exists("Item", DISH))
		self.assertIsNone(self.recipe_of(DISH))


class TestAPlanThatNamesNoRecipe(RecipeCardCase):
	def test_its_proposal_has_no_recipe_in_it(self):
		proposal = self.propose(self.plan(mains({"name": DISH, "price": 14.5})))
		self.assertNotIn("recipes", proposal["counts"])
		self.assertNotIn("recipe", self.item_named(proposal, DISH))
		self.assertEqual(CARD, proposal["card"]["name"])
		self.assertEqual(ROOT, proposal["root"])
