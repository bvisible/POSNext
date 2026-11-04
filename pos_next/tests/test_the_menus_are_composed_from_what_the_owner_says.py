# //// Neoffice — added file (no upstream equivalent).
"""The menus (formulas at a fixed price) of a restaurant, composed with its owner by talking (NeoResto, « Nora au restaurant », lot R2).

« Le menu du midi : le plat du jour et un café, 24 francs. » The server reads what was said, PROPOSES and writes nothing: the menu is new or
exists, each dish is an article the restaurant sells, several it could be, one to make in a family the owner named, or unknown; the price is
the owner's, never guessed. Only once he said yes are the dishes made, the menu written with its courses and put on a card. The suite pins:

- the proposal writes nothing, and says what is missing (a price, a dish) instead of guessing;
- what a confirmed proposal writes: the menu, its price, its courses (dishes of one course are a choice), the dishes that were new, its place
  on the card under one heading of menus, once; and that the till reads the menu back with its courses;
- completing a menu later (a dish added, one taken out, a new price, switched off) without touching what was not named;
- who may do it, and that nothing is available where the site has not switched the feature on.

The suite builds everything it needs and rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as till
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import menu_plan
from pos_next.restaurant.settings import default_restaurant
from pos_next.tests.test_service_families import a_group, an_item, the_root

FLAG = {"neoresto_card_with_nora_active": 1}
ROOT = "_Test MP Food"
MAINS = "_Test MP Plats zurichois"
SOFTS = "_Test MP Boissons zurichoises"
DISH = "_Test MP Plat du jour zurichois"
COFFEE = "_Test MP Cafe zurichois"
SOUP = "_Test MP Soupe zurichoise"
SALAD = "_Test MP Salade zurichoise"
TART_A = "_Test MP Tartare boeuf zurichois"
TART_B = "_Test MP Tartare saumon zurichois"
CARD = "_Test MP Carte"
MENU = "_Test MP Menu midi zurichois"


class MenuPlanCase(FrappeTestCase):
	def setUp(self):
		super().setUp()
		# Whatever a test built is rolled back at its end (the next test builds the same families), even when this setUp stops halfway
		self.addCleanup(frappe.db.rollback)
		patcher = patch.dict(frappe.conf, FLAG)
		patcher.start()
		self.addCleanup(patcher.stop)
		self.company = frappe.db.get_value("Company", {}, "name")
		if not self.company:
			self.skipTest("The site has no company")
		self.restaurant = default_restaurant() or self.a_restaurant()
		self.root = a_group(ROOT, the_root(), is_group=1)
		self.mains = a_group(MAINS, self.root, family="Main")
		self.softs = a_group(SOFTS, self.root, family="Drink")
		self.dish = an_item(DISH, self.mains, self.company)
		self.coffee = an_item(COFFEE, self.softs, self.company)
		self.soup = an_item(SOUP, self.mains, self.company)
		self.salad = an_item(SALAD, self.mains, self.company)
		self.tartare_a = an_item(TART_A, self.mains, self.company)
		self.tartare_b = an_item(TART_B, self.mains, self.company)
		self.card = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"restaurant": self.restaurant,
				"card_name": CARD,
				"is_active": 1,
				"items": [
					{"item_type": "Category", "label": "Plats", "sort_order": 10},
					{"item_type": "Item", "item": self.dish, "sort_order": 20},
				],
			}
		).insert(ignore_permissions=True)

	def a_restaurant(self):
		"""A fresh site has none: one of the test's own (its tip provisioning is the doctype's own test, switched off here)."""
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		doc = frappe.get_doc(
			{"doctype": "Restaurant", "restaurant_name": "_Test MP Restaurant", "company": self.company}
		)
		return doc.insert(ignore_permissions=True).name

	def menu(self, **more):
		return {
			"name": MENU,
			"price": 24,
			"card": CARD,
			"courses": [
				{"name": "Plat", "choices": ["plat du jour zurichois"]},
				{"name": "Boisson", "choices": ["cafe zurichois"]},
			],
			**more,
		}

	def propose(self, *menus):
		with as_role("client_admin"):
			return menu_plan.propose(list(menus))

	def apply(self, proposal):
		with as_role("client_admin"):
			return menu_plan.apply(proposal["menus"])

	def courses(self, name=MENU):
		rows = frappe.get_all(
			"Restaurant Menu Course",
			filters={"parent": name},
			fields=["course_name", "item", "sort_order"],
			order_by="sort_order asc",
		)
		return [(r.course_name, r.item) for r in rows]

	def card_rows(self):
		doc = frappe.get_doc("Restaurant Card", CARD)
		rows = sorted(doc.items, key=lambda r: (r.sort_order, r.idx))
		return [(r.item_type, r.label or r.item or r.menu) for r in rows]


class TestAProposalWritesNothing(MenuPlanCase):
	def test_it_changes_nothing_and_says_what_it_understood(self):
		before = frappe.db.count("Restaurant Menu")
		menu = self.propose(self.menu())["menus"][0]
		self.assertEqual(frappe.db.count("Restaurant Menu"), before)
		self.assertEqual((menu["status"], menu["price"], menu["needs"]), ("new", 24.0, []))
		plat, boisson = menu["courses"]
		self.assertEqual((plat["choices"][0]["status"], plat["choices"][0]["item"]), ("matched", self.dish))
		self.assertEqual(
			(boisson["choices"][0]["status"], boisson["choices"][0]["item"]), ("matched", self.coffee)
		)
		self.assertEqual(menu["card"], {"name": CARD, "exists": True, "placed": False, "will_place": True})

	def test_a_menu_with_no_price_waits_for_the_owner_to_give_one(self):
		menu = self.propose(self.menu(price=None))["menus"][0]
		self.assertIsNone(menu["price"])
		self.assertEqual(menu["needs"], ["price"])
		with self.assertRaises(frappe.ValidationError):
			self.apply({"menus": [menu]})
		self.assertFalse(frappe.db.exists("Restaurant Menu", MENU))

	def test_a_menu_with_nothing_in_it_waits_too(self):
		self.assertEqual(self.propose({"name": MENU, "price": 20})["menus"][0]["needs"], ["courses"])

	def test_the_dishes_of_one_course_are_a_choice_and_a_vague_word_is_left_to_the_owner(self):
		menu = self.propose(
			{
				"name": MENU,
				"price": 30,
				"courses": [
					{"name": "Entrée", "choices": ["soupe zurichoise", "salade zurichoise"]},
					{"name": "Plat", "choices": ["tartare zurichois"]},
				],
			}
		)["menus"][0]
		entree, plat = menu["courses"]
		self.assertEqual([c["status"] for c in entree["choices"]], ["matched", "matched"])
		self.assertEqual(plat["choices"][0]["status"], "ambiguous")
		self.assertEqual(
			{c["item"] for c in plat["choices"][0]["candidates"]}, {self.tartare_a, self.tartare_b}
		)

	def test_a_dish_that_is_new_is_made_only_in_a_family_the_owner_named(self):
		made = {"text": "burger vegetarien zurichois", "family": MAINS}
		unplaced = {"text": "burger vegetarien zurichois"}
		menu = self.propose(
			{"name": MENU, "price": 30, "courses": [{"name": "Plat", "choices": [made, unplaced]}]}
		)["menus"][0]
		first, second = menu["courses"][0]["choices"]
		self.assertEqual((first["status"], first["family"]), ("to_create", MAINS))
		self.assertEqual(second["status"], "unknown")

	def test_a_family_that_does_not_exist_makes_nothing(self):
		menu = self.propose(
			{
				"name": MENU,
				"price": 30,
				"courses": [
					{
						"name": "Plat",
						"choices": [{"text": "burger vegetarien zurichois", "family": "_Test MP Nowhere"}],
					}
				],
			}
		)["menus"][0]
		self.assertEqual(menu["courses"][0]["choices"][0]["status"], "unknown")

	def test_things_that_make_no_sense_are_refused(self):
		for bad in (
			[],
			[{"price": 3}],
			[{"name": MENU, "price": "beaucoup"}],
			[{"name": MENU, "price": 0}],
			[{"name": MENU, "courses": [{"choices": ["a"]}]}],
			[{"name": MENU, "available_from": "demain"}],
			[{"name": f"m{n}"} for n in range(6)],
		):
			with self.subTest(menus=bad), self.assertRaises(frappe.ValidationError):
				with as_role("client_admin"):
					menu_plan.propose(bad)


class TestWhatAConfirmedProposalWrites(MenuPlanCase):
	def test_the_menu_is_written_with_its_price_its_courses_and_its_place_on_the_card(self):
		report = self.apply(self.propose(self.menu()))
		self.assertEqual(
			report["menus"][0], {"name": MENU, "created": True, "items_made": [], "placed_on": CARD}
		)
		doc = frappe.get_doc("Restaurant Menu", MENU)
		self.assertEqual((doc.price, doc.is_active), (24, 1))
		self.assertEqual(self.courses(), [("Plat", self.dish), ("Boisson", self.coffee)])
		rows = self.card_rows()
		self.assertEqual(rows[-2:], [("Category", "Menus"), ("Menu", MENU)])
		self.assertEqual(
			rows[:2], [("Category", "Plats"), ("Item", self.dish)], "what was on the card stays where it was"
		)

	def test_the_till_reads_the_menu_back_with_its_courses(self):
		self.apply(self.propose(self.menu()))
		with as_role("client_admin"):
			shown = {m["name"]: m for m in till.get_active_menus()}
		courses = {c["course_name"]: [i["item"] for i in c["items"]] for c in shown[MENU]["courses"]}
		self.assertEqual(courses, {"Plat": [self.dish], "Boisson": [self.coffee]})
		self.assertEqual(shown[MENU]["price"], 24)

	def test_the_dishes_of_a_course_are_written_as_a_choice(self):
		proposal = self.propose(
			{
				"name": MENU,
				"price": 30,
				"courses": [{"name": "Entrée", "choices": ["soupe zurichoise", "salade zurichoise"]}],
			}
		)
		self.apply(proposal)
		self.assertEqual(self.courses(), [("Entrée", self.soup), ("Entrée", self.salad)])

	def test_a_dish_that_was_new_is_made_as_an_article_sold_in_its_family(self):
		proposal = self.propose(
			{
				"name": MENU,
				"price": 30,
				"courses": [
					{"name": "Plat", "choices": [{"text": "burger vegetarien zurichois", "family": MAINS}]}
				],
			}
		)
		report = self.apply(proposal)
		code = report["menus"][0]["items_made"][0]
		item = frappe.get_doc("Item", code)
		self.assertEqual((item.item_group, item.is_sales_item, item.is_stock_item), (MAINS, 1, 0))
		self.assertEqual(self.courses(), [("Plat", code)])

	def test_an_ambiguous_dish_the_owner_chose_is_written_as_chosen(self):
		proposal = self.propose(
			{"name": MENU, "price": 30, "courses": [{"name": "Plat", "choices": ["tartare zurichois"]}]}
		)
		choice = proposal["menus"][0]["courses"][0]["choices"][0]
		with self.assertRaises(frappe.ValidationError):
			self.apply(proposal)
		self.assertFalse(
			frappe.db.exists("Restaurant Menu", MENU), "nothing was written while a dish was still to settle"
		)
		choice.update(status="matched", item=self.tartare_b)
		self.apply(proposal)
		self.assertEqual(self.courses(), [("Plat", self.tartare_b)])

	def test_asking_again_finds_everything_in_place(self):
		self.apply(self.propose(self.menu()))
		again = self.propose(self.menu())["menus"][0]
		self.assertEqual(again["status"], "unchanged")
		self.assertEqual(again["card"]["placed"], True)
		with self.assertRaises(frappe.ValidationError):
			self.apply({"menus": [again]})
		self.assertEqual(self.card_rows().count(("Menu", MENU)), 1, "the menu is on the card once")

	def test_a_menu_is_completed_later_without_touching_what_was_not_named(self):
		self.apply(self.propose(self.menu()))
		change = self.menu(
			price=26,
			description="Du lundi au vendredi",
			courses=[
				{"name": "Dessert", "choices": ["soupe zurichoise"]},
				{"name": "plat", "choices": ["salade zurichoise"]},
				{"name": "Boisson", "choices": [{"text": "cafe zurichois", "remove": True}]},
			],
		)
		proposal = self.propose(change)
		self.assertEqual(
			(proposal["menus"][0]["status"], proposal["menus"][0]["price_was"]), ("extend", 24.0)
		)
		report = self.apply(proposal)
		self.assertEqual((report["menus"][0]["created"], report["menus"][0]["placed_on"]), (False, None))
		doc = frappe.get_doc("Restaurant Menu", MENU)
		self.assertEqual((doc.price, doc.description), (26, "Du lundi au vendredi"))
		self.assertEqual(self.courses(), [("Plat", self.dish), ("Plat", self.salad), ("Dessert", self.soup)])

	def test_the_proposal_says_the_whole_menu_as_it_will_stand_not_only_the_change(self):
		"""A model that is told only what changes completes the rest from memory: 04.11, « le dessert ne proposera plus rien » was said of a
		menu whose dessert held another dish since."""
		self.apply(self.propose(self.menu()))
		self.apply(
			self.propose({"name": MENU, "courses": [{"name": "Dessert", "choices": ["soupe zurichoise"]}]})
		)
		change = {
			"name": MENU,
			"courses": [{"name": "Plat", "choices": [{"text": "plat du jour zurichois", "remove": True}]}],
		}
		held = self.propose(change)["menus"][0]["will_hold"]
		self.assertEqual(
			held,
			[
				{"course": "Plat", "dishes": []},
				{"course": "Boisson", "dishes": [COFFEE]},
				{"course": "Dessert", "dishes": [SOUP]},
			],
		)

	def test_a_new_menu_will_hold_what_was_said_and_a_dish_still_to_settle_is_not_in_it(self):
		menu = self.menu(
			courses=[
				{"name": "Plat", "choices": ["tartare zurichois"]},
				{"name": "Boisson", "choices": ["cafe zurichois"]},
			]
		)
		held = self.propose(menu)["menus"][0]["will_hold"]
		self.assertEqual(held, [{"course": "Plat", "dishes": []}, {"course": "Boisson", "dishes": [COFFEE]}])

	def test_a_menu_is_switched_off_without_losing_its_courses(self):
		self.apply(self.propose(self.menu()))
		self.apply(self.propose({"name": MENU, "active": False}))
		self.assertEqual(frappe.db.get_value("Restaurant Menu", MENU, "is_active"), 0)
		self.assertEqual(len(self.courses()), 2)
		with as_role("client_admin"):
			self.assertNotIn(MENU, [m["name"] for m in till.get_active_menus()])

	def test_a_menu_is_found_under_the_name_the_owner_says(self):
		self.apply(self.propose(self.menu()))
		found = self.propose(
			{"name": MENU.upper(), "courses": [{"name": "Plat", "choices": ["plat du jour zurichois"]}]}
		)["menus"][0]
		self.assertEqual((found["name"], found["status"]), (MENU, "unchanged"))

	def test_a_card_that_does_not_exist_is_said_and_gets_nothing(self):
		menu = self.propose(self.menu(card="_Test MP Nowhere"))["menus"][0]
		self.assertEqual((menu["card"]["exists"], menu["card"]["will_place"]), (False, False))

	def test_no_card_asked_none_touched(self):
		before = self.card_rows()
		self.apply(self.propose(self.menu(card=None)))
		self.assertEqual(self.card_rows(), before)


class TestWhoMayAndWhere(MenuPlanCase):
	def test_a_cashier_may_neither_propose_nor_apply(self):
		proposal = self.propose(self.menu())
		with as_role("cashier"):
			with self.assertRaises(frappe.PermissionError):
				menu_plan.propose([self.menu()])
			with self.assertRaises(frappe.PermissionError):
				menu_plan.apply(proposal["menus"])
		self.assertFalse(frappe.db.exists("Restaurant Menu", MENU))

	def test_nothing_is_available_where_the_site_has_not_switched_the_feature_on(self):
		with patch.dict(frappe.conf, {"neoresto_card_with_nora_active": 0}), as_role("client_admin"):
			with self.assertRaises(frappe.PermissionError):
				menu_plan.propose([self.menu()])
