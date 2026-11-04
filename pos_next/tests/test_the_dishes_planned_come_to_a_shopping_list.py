# //// Neoffice — added file (no upstream equivalent).
"""« Mardi, quarante couverts: la soupe, le gratin. » From the dishes planned to the shopping list, and what a portion costs (NeoResto, « Nora au
restaurant », lot R6). The list and its packagings are the purchases' (lots B and E); this suite pins what the recipes add to them:

- the quantities are worked out for the portions asked, counted in the article's own unit, ADDED UP across the dishes and only then rounded UP
  to the packaging (two dishes that each need half a pack come to one pack);
- an ingredient without an article goes on as a free line written as the recipe says it; what cannot be worked out (no quantity, a quantity in
  cups not yet converted, a unit that does not fit the article's) is said and left off, never guessed;
- a dish is named by a recipe, by a dish it sells that follows a recipe, or by a dish with its own ingredients (the aide-mémoire of lot E); the
  recipe wins when a dish has both; several fits or none make the whole answer not ok, and nothing is written;
- what `plan` answers is what `spoken_list.add` writes, with the origin « Dish »;
- the cost of a portion comes from the prices of the packs; a partial cost never suggests a selling price, and a coefficient is applied only when given;
- who may ask, and that where the site does not run NeoResto or its purchases nothing answers.

The suite builds everything it needs and rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.api import recipes as api
from pos_next.restaurant import dishes, recipe_shopping, shopping, spoken_list, supplies
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import (
	PORTAL,
	_supplier,
	_user,
)
from pos_next.tests.test_till_writes_need_the_till import _company

FLAGS = {"neoresto_active": 1, "neoresto_purchases_active": 1}
WHOLESALER = "_Test RS wholesaler"
PASTA = "_Test RS pasta"
MINCE = "_Test RS mince"
CREAM = "_Test RS cream"
ONION = "_Test RS onion"
SOUP = "_Test RS Soupe de courge"
GRATIN = "_Test RS Gratin de pâtes"
LASAGNE = "_Test RS Lasagnes"
MENU_DISH = "_Test RS Soupe du jour"


class ShoppingCase(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		patcher = patch.dict(frappe.conf, FLAGS)
		patcher.start()
		self.addCleanup(patcher.stop)
		self.company = _company()
		if not (
			frappe.db.exists("UOM", "Kg")
			and frappe.db.exists("UOM", "Litre")
			and frappe.db.exists("UOM", "Nos")
		):
			self.skipTest("The site has no Kg, Litre or Nos unit")
		if not frappe.get_meta("Item").has_field("restaurant_recipe"):
			self.skipTest("The site has no recipe field on its articles")
		self.group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		_supplier(WHOLESALER)
		with as_role("client_admin"):
			self.pasta = supplies.create_supply_item(PASTA, self.group, "Kg")
			supplies.add_supply_pack(
				self.pasta, WHOLESALER, "_Test RS Carton of 5 kg", 5, 18.6, None, 1, self.company
			)
			self.mince = supplies.create_supply_item(MINCE, self.group, "Kg")
			supplies.add_supply_pack(
				self.mince, WHOLESALER, "_Test RS Pack of 5 kg", 5, 64, None, 1, self.company
			)
			self.cream = supplies.create_supply_item(CREAM, self.group, "Litre")
			supplies.add_supply_pack(
				self.cream, WHOLESALER, "_Test RS Case of 6 l", 6, 30, None, 1, self.company
			)
			self.onion = supplies.create_supply_item(ONION, self.group, "Kg")  # no packaging yet

	def a_recipe(self, name, rows, portions=4, **more):
		fields = {
			"doctype": "Restaurant Recipe",
			"recipe_name": name,
			"base_portions": portions,
			"status": "Draft",
			"steps": "Cook.",
			"ingredients": rows,
			**more,
		}
		with as_role("client_admin"):
			return frappe.get_doc(fields).insert()

	def plan(self, *dishes_said):
		with as_role("client_admin"):
			return recipe_shopping.plan(list(dishes_said))

	def lines_of(self, answer):
		return {line["item"] or line["text"]: line for line in answer["lines"]}

	def a_dish(self, name, **more):
		with as_role("client_admin"):
			doc = frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": name,
					"item_name": name,
					"item_group": self.group,
					"stock_uom": "Nos",
					"is_stock_item": 0,
					"is_sales_item": 1,
					**more,
				}
			)
			doc.flags.ignore_crm_sync = True
			return doc.insert().name


class TestThePortionsAreWorkedOutAddedUpAndRoundedUp(ShoppingCase):
	def test_the_quantities_are_counted_in_the_articles_unit_and_rounded_up_to_the_pack(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 480, "unit": "g"},
				{"ingredient_name": "Viande", "item": self.mince, "qty": 600, "unit": "g"},
			],
		)
		answer = self.plan({"name": SOUP, "portions": 40})
		lines = self.lines_of(answer)
		self.assertTrue(answer["ok"])
		self.assertEqual(lines[self.pasta]["needed"], 4.8)
		self.assertEqual(
			(lines[self.pasta]["qty"], lines[self.pasta]["unit"]), (1, "_Test RS Carton of 5 kg")
		)
		self.assertEqual((lines[self.mince]["needed"], lines[self.mince]["qty"]), (6.0, 2))
		self.assertEqual(lines[self.pasta]["estimated"], 18.6)
		self.assertEqual(answer["estimated_total"], round(18.6 + 2 * 64, 2))
		self.assertFalse(answer["estimated_partial"])

	def test_two_dishes_that_share_an_article_are_added_up_before_the_pack_is_counted(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 300, "unit": "g"}])
		self.a_recipe(GRATIN, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 190, "unit": "g"}])
		answer = self.plan({"name": SOUP, "portions": 40}, {"name": GRATIN, "portions": 40})
		line = self.lines_of(answer)[self.pasta]
		self.assertEqual(
			(line["needed"], line["qty"]), (4.9, 1), "3 kg + 1.9 kg is one pack of 5 kg, not two"
		)
		self.assertEqual(len(line["from"]), 2)

	def test_a_quantity_is_counted_across_units_of_the_same_kind(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Crème", "item": self.cream, "qty": 12, "unit": "dl"}])
		line = self.lines_of(self.plan({"name": SOUP, "portions": 40}))[self.cream]
		self.assertEqual(line["needed"], 12.0, "12 dl for 4 portions, ten times: 120 dl = 12 l")
		self.assertEqual(line["qty"], 2, "12 l in cases of 6 l: two")

	def test_the_portions_of_the_recipe_do_not_matter_only_the_proportion_does(self):
		self.a_recipe(
			SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 600, "unit": "g"}], portions=8
		)
		self.assertEqual(self.lines_of(self.plan({"name": SOUP, "portions": 40}))[self.pasta]["needed"], 3.0)

	def test_an_article_without_a_pack_goes_on_with_the_quantity_itself(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Oignons", "item": self.onion, "qty": 100, "unit": "g"}])
		line = self.lines_of(self.plan({"name": SOUP, "portions": 40}))[self.onion]
		self.assertEqual((line["qty"], line["calculated"], line["unit"]), (1.0, True, "Kg"))
		self.assertEqual(
			line["line"], {"item": self.onion, "qty": 1.0, "supplier": None, "uom": None, "origin": "Dish"}
		)
		self.assertIsNone(line["estimated"])

	def test_a_price_missing_makes_the_estimate_partial(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"},
				{"ingredient_name": "Oignons", "item": self.onion, "qty": 100, "unit": "g"},
			],
		)
		answer = self.plan({"name": SOUP, "portions": 40})
		self.assertTrue(answer["estimated_partial"])
		self.assertEqual(answer["estimated_total"], 18.6)


class TestWhatCannotBeWorkedOutIsSaidNeverGuessed(ShoppingCase):
	def test_an_ingredient_without_an_article_goes_on_as_a_free_line_written_as_the_recipe_says_it(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"},
				{"ingredient_name": "Courge butternut", "qty": 800, "unit": "g"},
			],
		)
		answer = self.plan({"name": SOUP, "portions": 8})
		free = [line for line in answer["lines"] if line["status"] == "unknown"]
		self.assertEqual(len(free), 1)
		self.assertEqual(
			free[0]["line"], {"free": True, "text": "Courge butternut", "qty": 1600.0, "unit_text": "g"}
		)
		self.assertEqual(answer["counts"], {"matched": 1, "ambiguous": 0, "unknown": 1})

	def test_what_has_no_quantity_no_conversion_or_no_matching_unit_is_left_off_and_said(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"},
				{"ingredient_name": "Bouillon", "item": self.cream, "qty": 1, "unit": "cup (source)"},
				{"ingredient_name": "Muscade", "item": self.onion},
				{"ingredient_name": "Oignons", "item": self.onion, "qty": 2, "unit": "boîte"},
				{"ingredient_name": "Sel", "to_taste": 1},
			],
		)
		answer = self.plan({"name": SOUP, "portions": 4})
		why = {row["ingredient"]: row["why"] for row in answer["left_out"]}
		self.assertEqual(why, {"Bouillon": "to_convert", "Muscade": "to_complete", "Oignons": "unit"})
		self.assertEqual(
			[line["item"] for line in answer["lines"]],
			[self.pasta],
			"and the salt, that nobody weighs, is not even said",
		)

	def test_a_recipe_still_to_complete_is_never_made_up(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta}])
		answer = self.plan({"name": SOUP, "portions": 40})
		self.assertEqual(answer["lines"], [])
		self.assertEqual(answer["left_out"][0]["why"], "to_complete")
		self.assertIsNone(answer["estimated_total"])


class TestADishIsNamedByARecipeADishOrItsOwnIngredients(ShoppingCase):
	def test_a_dish_that_follows_a_recipe_is_the_recipe(self):
		recipe = self.a_recipe(
			SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 480, "unit": "g"}]
		)
		dish = self.a_dish(MENU_DISH, restaurant_recipe=recipe.name)
		answer = self.plan({"name": MENU_DISH, "portions": 40})
		self.assertTrue(answer["ok"])
		self.assertEqual((answer["dishes"][0]["title"], answer["dishes"][0]["source"]), (SOUP, "recipe"))
		self.assertEqual(self.lines_of(answer)[self.pasta]["needed"], 4.8)
		self.assertTrue(frappe.db.exists("Item", dish))

	def test_a_dish_with_its_own_ingredients_uses_them_as_the_purchases_do(self):
		dish = self.a_dish(LASAGNE)
		with as_role("client_admin"):
			dishes.set_dish_ingredients(
				dish,
				[
					{"item": self.pasta, "qty_per_portion": 0.12},
					{"item": self.mince, "qty_per_portion": None},
				],
			)
		answer = self.plan({"name": LASAGNE, "portions": 40})
		lines = self.lines_of(answer)
		self.assertEqual(answer["dishes"][0]["source"], "dish ingredients")
		self.assertEqual((lines[self.pasta]["needed"], lines[self.pasta]["qty"]), (4.8, 1))
		self.assertEqual(
			(lines[self.mince]["qty"], lines[self.mince]["calculated"]),
			(1, False),
			"no quantity: one pack, to be completed",
		)

	def test_an_exact_name_wins_over_a_longer_one_that_holds_it(self):
		short, long = self.a_dish(LASAGNE), self.a_dish(f"{LASAGNE} verte")
		with as_role("client_admin"):
			for dish in (short, long):
				dishes.set_dish_ingredients(dish, [{"item": self.pasta, "qty_per_portion": 0.1}])
			exact = recipe_shopping.candidates(LASAGNE)
			words = recipe_shopping.candidates("_Test RS lasagne")
		self.assertEqual([c["dish"] for c in exact], [short])
		self.assertEqual(sorted(c["dish"] for c in words), sorted([short, long]))

	def test_a_dish_that_has_both_follows_its_recipe(self):
		recipe = self.a_recipe(
			SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"}]
		)
		dish = self.a_dish(MENU_DISH, restaurant_recipe=recipe.name)
		with as_role("client_admin"):
			dishes.set_dish_ingredients(dish, [{"item": self.mince, "qty_per_portion": 1}])
		lines = self.lines_of(self.plan({"name": MENU_DISH, "portions": 40}))
		self.assertEqual(list(lines), [self.pasta])

	def test_several_fits_or_none_make_the_answer_not_ok_and_write_nothing(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"}])
		self.a_recipe(
			f"{SOUP} bis", [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 100, "unit": "g"}]
		)
		lists = frappe.db.count("Restaurant Shopping List")
		answer = self.plan(
			{"name": "soupe courge", "portions": 40}, {"name": "gigot d'agneau", "portions": 10}
		)
		self.assertFalse(answer["ok"])
		self.assertEqual([d["status"] for d in answer["dishes"]], ["ambiguous", "unknown"])
		self.assertEqual(len(answer["dishes"][0]["candidates"]), 2)
		self.assertEqual(frappe.db.count("Restaurant Shopping List"), lists)

	def test_the_portions_are_asked_never_assumed(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"}])
		for bad in (
			{"name": SOUP},
			{"name": SOUP, "portions": 0},
			{"name": SOUP, "portions": 5000},
			{"portions": 4},
		):
			with as_role("client_admin"), self.assertRaises(frappe.ValidationError):
				recipe_shopping.plan([bad])


class TestWhatThePlanSaysIsWhatTheListWrites(ShoppingCase):
	def test_the_confirmed_lines_land_on_the_list_with_the_origin_of_a_dish(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"},
				{"ingredient_name": "Courge butternut", "qty": 800, "unit": "g"},
			],
		)
		answer = self.plan({"name": SOUP, "portions": 40})
		with as_role("client_admin"):
			name = shopping.new_list(self.company)
			written = spoken_list.add([line["line"] for line in answer["lines"]], name)
		self.assertEqual((written["articles"], written["free"]), (1, 1))
		doc = frappe.get_doc("Restaurant Shopping List", name)
		article = next(row for row in doc.lines if row.item == self.pasta)
		self.assertEqual((article.qty, article.uom, article.origin), (1, "_Test RS Carton of 5 kg", "Dish"))


class TestWhatAPortionCosts(ShoppingCase):
	def test_the_cost_comes_from_the_prices_of_the_packs_ingredient_by_ingredient(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 200, "unit": "g"},
				{"ingredient_name": "Viande", "item": self.mince, "qty": 100, "unit": "g"},
			],
		)
		with as_role("client_admin"):
			answer = recipe_shopping.cost(SOUP)
		by = {row["name"]: row for row in answer["ingredients"]}
		self.assertEqual((by["Pâtes"]["unit_price"], by["Pâtes"]["cost"]), (3.72, 0.74))
		self.assertEqual((by["Viande"]["unit_price"], by["Viande"]["cost"]), (12.8, 1.28))
		self.assertEqual((answer["total"], answer["portions"], answer["per_portion"]), (2.02, 4, 0.51))
		self.assertFalse(answer["partial"])
		self.assertEqual(by["Pâtes"]["price_source"], "catalogue")

	def test_the_cost_is_for_the_portions_asked(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 200, "unit": "g"}])
		with as_role("client_admin"):
			answer = recipe_shopping.cost(SOUP, 40)
		self.assertEqual((answer["portions"], answer["total"], answer["per_portion"]), (40, 7.44, 0.19))

	def test_a_cost_that_misses_an_ingredient_is_partial_and_suggests_no_price(self):
		self.a_recipe(
			SOUP,
			[
				{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 200, "unit": "g"},
				{"ingredient_name": "Courge", "qty": 800, "unit": "g"},
				{"ingredient_name": "Oignons", "item": self.onion, "qty": 100, "unit": "g"},
			],
		)
		with as_role("client_admin"):
			answer = recipe_shopping.cost(SOUP, markup=3)
		why = {row["ingredient"]: row["why"] for row in answer["missing"]}
		self.assertEqual(why, {"Courge": "not_linked", "Oignons": "no_price"})
		self.assertTrue(answer["partial"])
		self.assertIsNone(answer["suggested_price"])
		self.assertIn("too low", answer["markup_not_applied"])

	def test_a_selling_price_is_worked_out_only_from_the_coefficient_the_owner_gave(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Viande", "item": self.mince, "qty": 400, "unit": "g"}])
		with as_role("client_admin"):
			none = recipe_shopping.cost(SOUP)
			priced = recipe_shopping.cost(SOUP, markup=3.5)
		self.assertIsNone(none["suggested_price"])
		self.assertEqual((priced["per_portion"], priced["suggested_price"]), (1.28, 4.5))
		for bad in (0, -2, 50, "x"):
			with as_role("client_admin"), self.assertRaises(frappe.ValidationError):
				recipe_shopping.cost(SOUP, markup=bad)

	def test_a_dish_with_its_own_ingredients_has_a_cost_too(self):
		dish = self.a_dish(LASAGNE)
		with as_role("client_admin"):
			dishes.set_dish_ingredients(dish, [{"item": self.pasta, "qty_per_portion": 0.12}])
			answer = recipe_shopping.cost(LASAGNE, 10)
		self.assertEqual(
			(answer["source"], answer["total"], answer["per_portion"]), ("dish ingredients", 4.46, 0.45)
		)

	def test_a_dish_that_is_unknown_or_ambiguous_is_said(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 100, "unit": "g"}])
		self.a_recipe(
			f"{SOUP} bis", [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 100, "unit": "g"}]
		)
		with as_role("client_admin"):
			with self.assertRaises(frappe.DoesNotExistError):
				recipe_shopping.cost("gigot")
			with self.assertRaisesRegex(frappe.ValidationError, "Say which one"):
				recipe_shopping.cost("soupe courge")


class TestWhoMayAsk(ShoppingCase):
	def test_nothing_answers_where_the_site_does_not_run_neoresto_or_its_purchases(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"}])
		with patch.dict(frappe.conf, {"neoresto_active": 0}), as_role("client_admin"):
			for call in (
				lambda: recipe_shopping.plan([{"name": SOUP, "portions": 4}]),
				lambda: recipe_shopping.cost(SOUP),
			):
				with self.assertRaisesRegex(frappe.ValidationError, "not available"):
					call()
		with patch.dict(frappe.conf, {"neoresto_purchases_active": 0}), as_role("client_admin"):
			with self.assertRaisesRegex(frappe.PermissionError, "Purchases are not available"):
				recipe_shopping.plan([{"name": SOUP, "portions": 4}])

	def test_a_cashier_a_visitor_and_a_portal_account_are_refused(self):
		self.a_recipe(SOUP, [{"ingredient_name": "Pâtes", "item": self.pasta, "qty": 120, "unit": "g"}])
		with as_role("cashier"), self.assertRaises(frappe.PermissionError):
			recipe_shopping.plan([{"name": SOUP, "portions": 4}])
		_user(PORTAL, (), user_type="Website User")
		for user in ("Guest", PORTAL):
			frappe.set_user(user)
			self.addCleanup(frappe.set_user, "Administrator")
			for call in (
				lambda: api.plan_recipe_shopping([{"name": SOUP, "portions": 4}]),
				lambda: api.recipe_cost(SOUP),
			):
				with self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
					call()
		frappe.set_user("Administrator")
