# //// Neoffice — added file (no upstream equivalent).
"""The cooking of a steak and the side of a fish, set with the owner by talking (NeoResto, « Nora au restaurant », lot R1).

The till asks a waiter for a cooking and a side when a dish carries an option group for them. Nora proposes them from what a cook
knows (a steak has a cooking, a chicken has not; the meats and the fish come with a side, the pasta and the desserts do not), writes
nothing until the owner said yes, and then makes the groups that do not exist and extends the ones that do. The suite pins:

- what a cook knows, as plain words (cuisine_knowledge);
- the proposal writes nothing, names the dishes it left alone and why, and answers with the owner's own group when there is one;
- what a confirmed proposal writes (the groups, their options at no price, the families and the dishes they cover) and that the till reads
  them back for the dish; that a group that exists keeps its words and is only extended;
- who may do it, and that nothing is available where the site has not switched the feature on.

The suite builds everything it needs and rolls back.
"""

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as till
from pos_next.restaurant import cuisine_knowledge as cook
from pos_next.restaurant import option_plan
from pos_next.tests.test_service_families import a_group, an_item, the_root

FLAG = {"neoresto_card_with_nora_active": 1}
ROOT = "_Test OP Food"
MAINS = "_Test OP Plats zurichois"
GRILLS = "_Test OP Grillades zurichoises"
PASTA = "_Test OP Pates zurichoises"
STEAK = "_Test OP Entrecote zurichoise"
CHICKEN = "_Test OP Poulet zurichois"
SAUSAGE = "_Test OP Saucisse zurichoise"
SPAGHETTI = "_Test OP Spaghetti zurichois"
KNOWN_NAMES = ("Cuisson", "Cuissons", "Accompagnement", "Garniture", "_Test OP Garniture maison")


class TestWhatACookKnows(unittest.TestCase):
	def test_a_steak_and_its_kin_are_cooked_to_the_customers_taste(self):
		for name in (
			"Entrecôte de bœuf",
			"Faux-filet grillé",
			"Filet de bœuf sauce poivre",
			"Magret de canard",
			"Carré d'agneau",
			"Côtelettes d'agneau",
			"Steak haché",
			"Burger maison",
			"Cheeseburger",
			"Tournedos Rossini",
		):
			with self.subTest(name=name):
				self.assertTrue(cook.is_cooked_to_order(name))

	def test_what_is_always_cooked_through_has_no_cooking_to_ask(self):
		for name in (
			"Poulet rôti",
			"Côtelette de porc",
			"Saucisse de veau",
			"Émincé de veau",
			"Civet de chevreuil",
			"Cordon bleu",
			"Spaghetti",
		):
			with self.subTest(name=name):
				self.assertFalse(cook.is_cooked_to_order(name))

	def test_a_word_inside_another_is_no_match(self):
		self.assertFalse(cook.is_cooked_to_order("Onglerie du chef"))
		self.assertFalse(cook.is_cooked_to_order("Pâtes bavettes"), "a pasta is not a bavette steak")

	def test_the_meats_the_fish_and_the_grills_come_with_a_side(self):
		for name in ("Viandes", "Poissons", "Grillades", "Burgers", "Volailles", "Viandes grillées"):
			with self.subTest(name=name):
				self.assertTrue(cook.family_has_a_side(name))
		for name in ("Pâtes et riz", "Pizzas", "Desserts", "Entrées", "Végétarien", "Boissons"):
			with self.subTest(name=name):
				self.assertFalse(cook.family_has_a_side(name))

	def test_an_option_group_is_known_under_the_names_an_owner_gives_it(self):
		self.assertTrue(cook.is_known_as(cook.COOKING, "Cuissons"))
		self.assertTrue(cook.is_known_as(cook.COOKING, "Point de cuisson"))
		self.assertTrue(cook.is_known_as(cook.SIDE, "Garniture"))
		self.assertFalse(cook.is_known_as(cook.SIDE, "Sauce"))

	def test_no_option_costs_anything_to_begin_with(self):
		for kind in cook.GROUPS.values():
			self.assertEqual(kind["selection_type"], "Single")
			self.assertEqual(kind["required"], 1)
			self.assertGreaterEqual(len(kind["options"]), 4)


class OptionPlanCase(FrappeTestCase):
	def setUp(self):
		super().setUp()
		patcher = patch.dict(frappe.conf, FLAG)
		patcher.start()
		self.addCleanup(patcher.stop)
		# the option groups of the site are put aside inside the test's own transaction
		for name in frappe.get_all(
			"Product Option Group", filters={"group_name": ["in", KNOWN_NAMES]}, pluck="name"
		):
			frappe.delete_doc("Product Option Group", name, force=1, ignore_permissions=True)
		self.company = frappe.db.get_value("Company", {}, "name")
		self.root = a_group(ROOT, the_root(), is_group=1)
		self.mains = a_group(MAINS, self.root, family="Main", is_group=1)
		self.grills = a_group(GRILLS, self.mains)
		self.pasta = a_group(PASTA, self.mains)
		self.steak = an_item(STEAK, self.grills, self.company)
		self.chicken = an_item(CHICKEN, self.grills, self.company)
		self.sausage = an_item(SAUSAGE, self.grills, self.company)
		self.spaghetti = an_item(SPAGHETTI, self.pasta, self.company)

	def propose(self, *targets):
		with as_role("client_admin"):
			return option_plan.propose(list(targets) or None)

	def apply(self, proposal):
		with as_role("client_admin"):
			return option_plan.apply(proposal["lines"])

	def by_kind(self, proposal):
		return {line["kind"]: line for line in proposal["lines"]}


class TestAProposalWritesNothing(OptionPlanCase):
	def test_it_changes_nothing_and_says_what_it_understood(self):
		before = frappe.db.count("Product Option Group")
		proposal = self.propose("grillades zurichoises")
		self.assertEqual(frappe.db.count("Product Option Group"), before)
		lines = self.by_kind(proposal)
		self.assertEqual(set(lines), {"cooking", "side"})
		self.assertEqual({line["status"] for line in lines.values()}, {"new"})

	def test_the_cooking_goes_on_the_steak_alone_and_the_side_on_the_whole_family(self):
		lines = self.by_kind(self.propose("grillades zurichoises"))
		self.assertEqual([d["item"] for d in lines["cooking"]["add_items"]], [self.steak])
		self.assertEqual(lines["cooking"]["add_item_groups"], [])
		self.assertEqual(lines["side"]["add_item_groups"], [self.grills])
		self.assertEqual(lines["side"]["add_items"], [])

	def test_the_chicken_and_the_sausage_are_left_alone_and_the_owner_is_told_why(self):
		left = {row["item_name"]: row["why"] for row in self.propose("grillades zurichoises")["left_alone"]}
		self.assertIn(CHICKEN, left)
		self.assertIn(SAUSAGE, left)
		self.assertNotIn(STEAK, left)
		self.assertIn("no cooking", left[CHICKEN])

	def test_the_options_are_the_cooks_and_cost_nothing(self):
		lines = self.by_kind(self.propose("grillades zurichoises"))
		self.assertEqual(lines["cooking"]["options"], ["Bleu", "Saignant", "À point", "Bien cuit"])
		self.assertEqual(lines["cooking"]["group"], "Cuisson")
		self.assertEqual((lines["side"]["selection_type"], lines["side"]["required"]), ("Single", 1))

	def test_a_single_dish_is_named_by_its_words(self):
		lines = self.by_kind(self.propose("entrecote zurichoise"))
		self.assertEqual([d["item"] for d in lines["cooking"]["add_items"]], [self.steak])
		self.assertEqual(
			[d["item"] for d in lines["side"]["add_items"]], [self.steak], "a side for that dish only"
		)
		self.assertEqual(lines["side"]["add_item_groups"], [])

	def test_a_dish_cooked_through_is_not_asked_a_cooking(self):
		proposal = self.propose("poulet zurichois")
		self.assertNotIn("cooking", self.by_kind(proposal))
		self.assertEqual([row["item_name"] for row in proposal["left_alone"]], [CHICKEN])

	def test_a_family_without_a_side_gets_nothing(self):
		self.assertEqual(self.propose("pates zurichoises")["lines"], [])

	def test_no_word_means_every_family_of_dishes(self):
		lines = self.by_kind(self.propose())
		self.assertIn(self.grills, lines["side"]["add_item_groups"])
		self.assertNotIn(self.pasta, lines["side"]["add_item_groups"])
		self.assertIn(self.steak, [d["item"] for d in lines["cooking"]["add_items"]])

	def test_what_names_nothing_is_said_so(self):
		proposal = self.propose("caviar des abysses")
		self.assertEqual((proposal["lines"], proposal["unknown"]), ([], ["caviar des abysses"]))


class TestWhatAConfirmedProposalWrites(OptionPlanCase):
	def test_the_groups_are_made_with_their_options_and_what_they_cover(self):
		report = self.apply(self.propose("grillades zurichoises"))
		self.assertCountEqual(report["created"], ["Cuisson", "Accompagnement"])
		cooking = frappe.get_doc("Product Option Group", "Cuisson")
		self.assertEqual(
			[o.option_name for o in cooking.options], ["Bleu", "Saignant", "À point", "Bien cuit"]
		)
		self.assertEqual({o.price_adjustment for o in cooking.options}, {0})
		self.assertEqual([r.item for r in cooking.applicable_items], [self.steak])
		side = frappe.get_doc("Product Option Group", "Accompagnement")
		self.assertEqual([r.item_group for r in side.applicable_item_groups], [self.grills])
		self.assertEqual((cooking.selection_type, cooking.required), ("Single", 1))

	def test_the_till_reads_them_back_for_the_dish(self):
		self.apply(self.propose("grillades zurichoises"))
		with as_role("client_admin"):
			steak = {g["group_name"] for g in till.get_product_options(self.steak)}
			chicken = {g["group_name"] for g in till.get_product_options(self.chicken)}
		self.assertEqual(steak, {"Cuisson", "Accompagnement"})
		self.assertEqual(chicken, {"Accompagnement"}, "a side, and no cooking")

	def test_asking_again_finds_everything_in_place(self):
		self.apply(self.propose("grillades zurichoises"))
		again = self.propose("grillades zurichoises")
		self.assertEqual({line["status"] for line in again["lines"]}, {"present"})
		with self.assertRaises(frappe.ValidationError):
			self.apply(again)

	def test_a_group_the_owner_has_under_his_own_name_is_extended_and_keeps_its_words(self):
		with as_role("client_admin"):
			frappe.get_doc(
				{
					"doctype": "Product Option Group",
					"group_name": "_Test OP Garniture maison",
					"selection_type": "Multiple",
					"options": [{"option_name": "Pommes frites maison", "price_adjustment": 2}],
					"applicable_item_groups": [{"item_group": self.pasta}],
				}
			).insert()
		# the owner calls his side « Garniture »: the name of the kind is not the group's
		frappe.db.set_value("Product Option Group", "_Test OP Garniture maison", "group_name", "Garniture")
		side = self.by_kind(self.propose("grillades zurichoises"))["side"]
		self.assertEqual((side["status"], side["group"]), ("extend", "_Test OP Garniture maison"))
		self.apply({"lines": [side]})
		doc = frappe.get_doc("Product Option Group", "_Test OP Garniture maison")
		self.assertEqual(
			[o.option_name for o in doc.options],
			["Pommes frites maison"],
			"his options stay as he wrote them",
		)
		self.assertEqual(doc.selection_type, "Multiple")
		self.assertCountEqual([r.item_group for r in doc.applicable_item_groups], [self.pasta, self.grills])
		self.assertEqual(
			frappe.db.count("Product Option Group", {"group_name": ["like", "Accompagnement%"]}), 0
		)

	def test_a_line_that_names_a_family_that_does_not_exist_writes_nothing(self):
		proposal = self.propose("grillades zurichoises")
		proposal["lines"][1]["add_item_groups"] = ["_Test OP Nowhere"]
		before = frappe.db.count("Product Option Group")
		with self.assertRaises(frappe.DoesNotExistError):
			self.apply(proposal)
		self.assertEqual(frappe.db.count("Product Option Group"), before)

	def test_a_line_of_a_kind_nora_does_not_know_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.apply({"lines": [{"kind": "sauce", "status": "new", "add_item_groups": [self.grills]}]})


class TestWhoMayAndWhere(OptionPlanCase):
	def test_a_cashier_may_neither_propose_nor_apply(self):
		proposal = self.propose("grillades zurichoises")
		with as_role("cashier"):
			with self.assertRaises(frappe.PermissionError):
				option_plan.propose(["grillades zurichoises"])
			with self.assertRaises(frappe.PermissionError):
				option_plan.apply(proposal["lines"])
		self.assertEqual(
			frappe.db.count("Product Option Group", {"group_name": ["in", ["Cuisson", "Accompagnement"]]}), 0
		)

	def test_nothing_is_available_where_the_site_has_not_switched_the_feature_on(self):
		with patch.dict(frappe.conf, {"neoresto_card_with_nora_active": 0}), as_role("client_admin"):
			with self.assertRaises(frappe.PermissionError):
				option_plan.propose(["grillades zurichoises"])
