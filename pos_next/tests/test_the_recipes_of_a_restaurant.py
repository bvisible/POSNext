# //// Neoffice — added file (no upstream equivalent).
"""The recipes of a restaurant (NeoResto, « Nora au restaurant », lot R3): written by its owner or taken from the free library.

A recipe is a reminder, never a bill of materials: ingredients for a number of portions, steps, allergens, provenance. The suite pins:

- nothing is invented: a quantity nobody gave is « to complete », a unit of a source that is not metric is « to convert », and a recipe is
  « Validated » only when it can be cooked from what is written;
- the quantities scale with the portions, the steps do not;
- the free library enters the restaurant only when someone picks a fiche, as « To review », with its source and its licence, and only if the
  file is the one its manifest names;
- the owner's words are PROPOSED first (nothing written), then written all or none: a recipe that exists is completed, never overwritten, and
  a dish is linked only when the owner named it;
- who may do it, and that where the site does not run NeoResto nothing answers.

The suite builds everything it needs and rolls back.
"""

import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.api import recipes as api
from pos_next.restaurant import recipe_library, recipe_plan, recipes
from pos_next.restaurant.settings import default_restaurant
from pos_next.tests.test_service_families import a_group, an_item, the_root
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import PORTAL, _user

FLAGS = {"neoresto_active": 1, "neoresto_card_with_nora_active": 1}
ROOT = "_Test RC Food"
MAINS = "_Test RC Plats"
DISH = "_Test RC Soupe du jour zurichoise"
OTHER_DISH = "_Test RC Soupe aux orties zurichoise"
SOUP = "_Test RC Soupe de courge zurichoise"
MANAGER = "recipes-manager@yopmail.com"


class RecipeCase(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		patcher = patch.dict(frappe.conf, FLAGS)
		patcher.start()
		self.addCleanup(patcher.stop)
		self.company = frappe.db.get_value("Company", {}, "name")
		if not self.company:
			self.skipTest("The site has no company")
		self.restaurant = default_restaurant()
		self.root = a_group(ROOT, the_root(), is_group=1)
		self.mains = a_group(MAINS, self.root, family="Main")
		self.dish = an_item(DISH, self.mains, self.company)
		self.other_dish = an_item(OTHER_DISH, self.mains, self.company)

	def a_recipe(self, **more):
		fields = {
			"doctype": "Restaurant Recipe",
			"recipe_name": SOUP,
			"family": "Soupes",
			"base_portions": 4,
			"total_minutes": 45,
			"status": "Draft",
			"steps": "Cut.\nCook.",
			"ingredients": [
				{"ingredient_name": "Courge", "qty": 800, "unit": "g"},
				{"ingredient_name": "Bouillon", "qty": 1, "unit": "cup (source)"},
				{"ingredient_name": "Crème", "qty": 0},
				{"ingredient_name": "Sel", "to_taste": 1, "qty": 5},
			],
			**more,
		}
		with as_role("client_admin"):
			return frappe.get_doc(fields).insert()

	def said(self, **more):
		return {
			"name": "Risotto zurichois aux bolets",
			"family": "Plats",
			"portions": 4,
			"minutes": 40,
			"ingredients": [
				{"name": "Riz arborio", "qty": 320, "unit": "g"},
				{"name": "Bouillon de légumes", "qty": 1, "unit": "l"},
				{"name": "Sel", "without_quantity": True},
			],
			"steps": ["Faire revenir le riz.", "Mouiller peu à peu."],
			**more,
		}

	def propose(self, *specs):
		with as_role("client_admin"):
			return recipe_plan.propose(list(specs))

	def apply(self, proposal):
		with as_role("client_admin"):
			return recipe_plan.apply(proposal["recipes"])


class TestARecipeIsNeverInvented(RecipeCase):
	def test_a_quantity_is_scaled_the_way_a_kitchen_reads_it(self):
		self.assertEqual(recipes.scale_qty(800, 4, 40), 8000.0)
		self.assertEqual(recipes.scale_qty(1.5, 4, 6), 2.25)
		self.assertEqual(recipes.scale_qty(60, 4, 6), 90.0)
		self.assertEqual(recipes.scale_qty(37, 4, 5), 46.2)
		self.assertIsNone(recipes.scale_qty(0, 4, 8))
		self.assertIsNone(recipes.scale_qty(None, 4, 8))

	def test_a_unit_of_a_source_that_is_not_metric_is_to_be_converted(self):
		for unit in ("cup", "2 cups", "oz (source)", "TS (source)", "boîte de 15 oz", "lb", "t (source)"):
			self.assertTrue(recipes.is_foreign_unit(unit), unit)
		for unit in ("g", "kg", "l", "dl", "c. à soupe", "pièce", "gousse", "", None):
			self.assertFalse(recipes.is_foreign_unit(unit), unit)

	def test_a_row_says_what_is_still_open_about_it(self):
		doc = self.a_recipe()
		rows = {r["name"]: r for r in recipes.ingredient_rows(doc)}
		self.assertTrue(rows["Bouillon"]["to_convert"])
		self.assertFalse(rows["Courge"]["to_convert"])
		self.assertTrue(rows["Crème"]["to_complete"])
		self.assertFalse(rows["Sel"]["to_complete"])
		self.assertEqual(rows["Sel"]["qty"], None, "salt without quantity keeps none, whatever was typed")

	def test_a_recipe_is_validated_only_when_it_can_be_cooked_from_what_is_written(self):
		doc = self.a_recipe()
		doc.status = "Validated"
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		doc.reload()
		doc.ingredients[2].qty = 200
		doc.status = "Validated"
		doc.save()
		self.assertEqual(doc.status, "Validated")
		doc.steps = ""
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_the_sheet_scales_the_quantities_and_not_the_steps(self):
		self.a_recipe()
		with as_role("client_admin"):
			sheet = recipes.sheet(SOUP, 40)
		rows = {r["name"]: r for r in sheet["ingredients"]}
		self.assertEqual(rows["Courge"]["qty"], 8000.0)
		self.assertIsNone(rows["Crème"]["qty"], "nothing is worked out from a quantity nobody gave")
		self.assertEqual(sheet["steps"], ["Cut.", "Cook."])
		self.assertTrue(sheet["scaled"])
		self.assertIn("times and the temperatures", sheet["note"])
		self.assertEqual(sheet["open"]["to_complete"], ["Crème"])
		self.assertEqual(sheet["open"]["to_convert"], ["Bouillon"])

	def test_a_recipe_is_found_by_a_word_of_its_name_its_family_or_an_ingredient(self):
		self.a_recipe()
		with as_role("client_admin"):
			self.assertEqual([r["name"] for r in recipes.search("soupes")["recipes"]], [SOUP])
			self.assertEqual(recipes.search(family="soupes")["count"], 1)
			self.assertEqual(recipes.search(ingredient="courge")["count"], 1)
			self.assertEqual(recipes.search("zzz-nothing")["count"], 0)
			self.assertEqual(recipes.search(SOUP, vegetarian=True)["count"], 0)


class TestTheFreeLibraryEntersOnlyWhenSomeonePicksAFiche(RecipeCase):
	def test_the_library_is_intact_and_adds_nothing_by_itself(self):
		before = frappe.db.count("Restaurant Recipe")
		with as_role("client_admin"):
			listing = recipe_library.listing()
		self.assertEqual(listing["count"], 24)
		self.assertEqual(frappe.db.count("Restaurant Recipe"), before)
		self.assertTrue(all(r["license"] and r["author"] for r in listing["recipes"]))

	def test_a_fiche_added_is_to_review_and_keeps_its_source_and_licence(self):
		with as_role("client_admin"):
			made = recipe_library.add_to_restaurant(["based-potato-leek-soup"])
		self.assertEqual(len(made["added"]), 1)
		doc = frappe.get_doc("Restaurant Recipe", made["added"][0]["recipe"])
		self.assertEqual(doc.status, "To review")
		self.assertEqual(doc.culinary_status, "Not tested")
		self.assertEqual(doc.source_kind, "Library")
		self.assertIn("Unlicense", doc.source_license)
		self.assertRegex(doc.source_hash, r"^[0-9a-f]{64}$")
		self.assertEqual(doc.family, "Soupes")
		self.assertTrue(
			any(r.unit_to_convert for r in doc.ingredients), "cups stay as the source wrote them, to convert"
		)
		self.assertTrue(
			any(r.to_taste for r in doc.ingredients), "the unquantified ingredients stay without quantity"
		)

	def test_a_fiche_is_added_once(self):
		with as_role("client_admin"):
			recipe_library.add_to_restaurant(["based-frittata"])
			again = recipe_library.add_to_restaurant(["based-frittata"])
			listing = {r["id"]: r for r in recipe_library.listing()["recipes"]}
		self.assertEqual(again["added"], [])
		self.assertEqual(again["skipped"][0]["why"], "already added")
		self.assertEqual(listing["based-frittata"]["state"], "present")

	def test_a_fiche_that_is_not_the_one_its_manifest_names_is_refused(self):
		folder = Path(tempfile.mkdtemp())
		self.addCleanup(shutil.rmtree, folder, True)
		for path in recipe_library.DATA.iterdir():
			shutil.copy(path, folder / path.name)
		target = folder / "based-frittata.json"
		target.write_text(
			target.read_text(encoding="utf-8").replace("Frittata", "Frittata truquée", 1), encoding="utf-8"
		)
		with patch.object(recipe_library, "DATA", folder), as_role("client_admin"):
			with self.assertRaisesRegex(frappe.ValidationError, "changed since it was checked"):
				recipe_library.add_to_restaurant(["based-frittata"])
		self.assertFalse(frappe.db.exists("Restaurant Recipe", {"source_ref": "based-frittata"}))

	def test_a_fiche_with_no_licence_is_refused(self):
		folder = Path(tempfile.mkdtemp())
		self.addCleanup(shutil.rmtree, folder, True)
		for path in recipe_library.DATA.iterdir():
			shutil.copy(path, folder / path.name)
		manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
		fiche = json.loads((folder / "based-frittata.json").read_text(encoding="utf-8"))
		fiche["provenance"]["sources"][0]["license"] = ""
		raw = json.dumps(fiche, ensure_ascii=False, indent=2).encode()
		(folder / "based-frittata.json").write_bytes(raw)
		import hashlib

		for entry in manifest["entries"]:
			if entry["id"] == "based-frittata":
				entry["file_sha256"] = hashlib.sha256(raw).hexdigest()
		(folder / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
		with patch.object(recipe_library, "DATA", folder), as_role("client_admin"):
			with self.assertRaisesRegex(frappe.ValidationError, "author or licence"):
				recipe_library.add_to_restaurant(["based-frittata"])

	def test_a_name_that_is_not_in_the_manifest_is_refused(self):
		with as_role("client_admin"):
			for bad in ("../etc/passwd", "based-unknown", "based-frittata/../x"):
				with self.assertRaises(frappe.ValidationError):
					recipe_library.add_to_restaurant([bad])


class TestARecipeIsProposedThenWritten(RecipeCase):
	def test_the_proposal_writes_nothing_and_says_what_it_understood(self):
		before = frappe.db.count("Restaurant Recipe")
		proposal = self.propose(self.said())
		line = proposal["recipes"][0]
		self.assertEqual(frappe.db.count("Restaurant Recipe"), before)
		self.assertEqual(line["status"], "new")
		self.assertEqual(line["status_after"], "Validated")
		self.assertEqual(
			[i["state"] for i in line["ingredients"]], ["complete", "complete", "without_quantity"]
		)
		self.assertEqual(proposal["counts"]["new"], 1)

	def test_a_missing_quantity_is_never_filled_in_and_leaves_a_draft(self):
		said = self.said(ingredients=[{"name": "Riz arborio"}, {"name": "Bouillon", "qty": 1, "unit": "l"}])
		line = self.propose(said)["recipes"][0]
		self.assertEqual(line["to_complete"], ["Riz arborio"])
		self.assertEqual(line["status_after"], "Draft")
		made = self.apply({"recipes": [line]})
		doc = frappe.get_doc("Restaurant Recipe", made["recipes"][0]["recipe"])
		self.assertEqual(doc.status, "Draft")
		self.assertEqual(doc.ingredients[0].qty, 0)

	def test_a_recipe_with_no_portions_or_no_ingredient_waits(self):
		self.assertEqual(self.propose(self.said(portions=None))["recipes"][0]["needs"], ["portions"])
		self.assertEqual(self.propose(self.said(ingredients=[]))["recipes"][0]["needs"], ["ingredients"])
		with self.assertRaises(frappe.ValidationError):
			self.apply(self.propose(self.said(portions=None)))

	def test_what_the_owner_confirmed_is_written_all_or_none(self):
		proposal = self.propose(self.said(), self.said(name="Soupe zurichoise de test", portions=None))
		with self.assertRaises(frappe.ValidationError):
			self.apply(proposal)
		self.assertFalse(frappe.db.exists("Restaurant Recipe", "Risotto zurichois aux bolets"))
		made = self.apply(self.propose(self.said()))
		doc = frappe.get_doc("Restaurant Recipe", made["recipes"][0]["recipe"])
		self.assertEqual(
			(doc.base_portions, doc.total_minutes, doc.status, doc.source_kind), (4, 40, "Validated", "Own")
		)
		self.assertEqual(
			[r.ingredient_name for r in doc.ingredients], ["Riz arborio", "Bouillon de légumes", "Sel"]
		)
		self.assertEqual(doc.steps.splitlines(), ["Faire revenir le riz.", "Mouiller peu à peu."])

	def test_a_recipe_that_exists_is_completed_and_never_overwritten(self):
		doc = self.a_recipe()
		line = self.propose(
			{
				"name": SOUP,
				"ingredients": [
					{"name": "crème", "qty": 200, "unit": "ml"},
					{"name": "Poivre", "without_quantity": True},
				],
			}
		)["recipes"][0]
		self.assertEqual(line["status"], "exists")
		self.assertEqual(
			{
				c["name"]: c["change"]
				for c in line["ingredients"]
				if c["name"] in ("Crème", "Poivre", "Courge")
			},
			{"Crème": "change", "Poivre": "add", "Courge": "same"},
		)
		self.apply({"recipes": [line]})
		doc.reload()
		by_name = {r.ingredient_name: r for r in doc.ingredients}
		self.assertEqual(by_name["Courge"].qty, 800, "what the owner did not name stays")
		self.assertEqual(by_name["Crème"].qty, 200)
		self.assertIn("Poivre", by_name)
		self.assertEqual(
			doc.steps.splitlines(), ["Cut.", "Cook."], "steps change only when the owner gave steps"
		)
		self.assertEqual(doc.base_portions, 4)

	def test_a_recipe_already_as_said_has_nothing_to_write(self):
		self.a_recipe()
		line = self.propose({"name": SOUP, "ingredients": [{"name": "Courge", "qty": 800, "unit": "g"}]})[
			"recipes"
		][0]
		self.assertEqual(line["status"], "unchanged")

	def test_a_dish_is_linked_only_when_the_owner_named_it(self):
		said = self.said(name="Soupe zurichoise liée", dish="Soupe du jour zurichoise")
		line = self.propose(said)["recipes"][0]
		self.assertEqual(line["dish"]["status"], "matched")
		self.assertEqual(line["dish"]["item"], self.dish)
		self.apply({"recipes": [line]})
		self.assertEqual(frappe.db.get_value("Item", self.dish, "restaurant_recipe"), "Soupe zurichoise liée")
		self.assertFalse(frappe.db.get_value("Item", self.other_dish, "restaurant_recipe"))
		self.assertEqual(recipes.dishes_of("Soupe zurichoise liée")[0]["item"], self.dish)
		unnamed = self.propose(self.said(name="Soupe sans plat"))["recipes"][0]
		self.assertIsNone(unnamed["dish"])

	def test_two_dishes_that_fit_make_the_owner_choose(self):
		line = self.propose(self.said(name="Soupe à choisir", dish="soupe zurichoise"))["recipes"][0]
		self.assertEqual(line["dish"]["status"], "ambiguous")
		with self.assertRaises(frappe.ValidationError):
			self.apply({"recipes": [line]})
		line["dish"]["item"] = self.other_dish
		self.apply({"recipes": [line]})
		self.assertEqual(frappe.db.get_value("Item", self.other_dish, "restaurant_recipe"), "Soupe à choisir")

	def test_an_ingredient_is_linked_to_an_article_with_the_figure_the_owner_confirmed(self):
		self.a_recipe()
		with as_role("client_admin"):
			with self.assertRaises(frappe.ValidationError):
				recipes.set_ingredient_links(SOUP, [{"idx": 2, "item": self.dish}])
			recipes.set_ingredient_links(SOUP, [{"idx": 2, "item": self.dish, "qty": 240, "unit": "ml"}])
		row = frappe.get_doc("Restaurant Recipe", SOUP).ingredients[1]
		self.assertEqual((row.item, row.qty, row.unit, row.unit_to_convert), (self.dish, 240, "ml", 0))


class TestWhoMayDoIt(RecipeCase):
	def test_nothing_answers_where_the_site_does_not_run_neoresto(self):
		self.a_recipe()
		with patch.dict(frappe.conf, {"neoresto_active": 0}), as_role("client_admin"):
			for call in (
				lambda: recipes.sheet(SOUP),
				lambda: recipes.search("soupe"),
				lambda: recipe_library.listing(),
				lambda: recipe_library.add_to_restaurant(["based-frittata"]),
				lambda: recipe_plan.propose([self.said()]),
				lambda: recipes.set_dish_recipe(self.dish, SOUP),
			):
				with self.assertRaisesRegex(frappe.ValidationError, "not available"):
					call()

	def test_nora_writes_only_where_the_site_switched_it_on(self):
		with patch.dict(frappe.conf, {"neoresto_card_with_nora_active": 0}), as_role("client_admin"):
			with self.assertRaises(frappe.PermissionError):
				recipe_plan.propose([self.said()])

	def test_a_visitor_and_a_portal_account_reach_nothing(self):
		self.a_recipe()
		_user(PORTAL, (), user_type="Website User")
		for user in ("Guest", PORTAL):
			frappe.set_user(user)
			self.addCleanup(frappe.set_user, "Administrator")
			for call in (
				lambda: api.get_recipe(SOUP),
				lambda: api.search_recipes("soupe"),
				lambda: api.get_library(),
				lambda: api.add_from_library(["based-frittata"]),
				lambda: api.propose_recipes([self.said()]),
				lambda: api.apply_recipes([]),
			):
				with self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
					call()
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("Restaurant Recipe", {"source_ref": "based-frittata"}))

	def test_a_cashier_reads_the_recipes_and_writes_none(self):
		self.a_recipe()
		with as_role("cashier"):
			self.assertEqual(recipes.sheet(SOUP)["recipe"], SOUP)
			with self.assertRaises(frappe.PermissionError):
				recipe_library.add_to_restaurant(["based-frittata"])
