# //// Neoffice — added file (no upstream equivalent).
"""The card of a restaurant built step by step from a plan (NeoResto, « créer la carte avec Nora », Daniel, 03.11).

A restaurateur with an empty till talks to Nora; she PROPOSES the buttons of one step (the coffees, then the cold drinks, the
wines of a supplier, the dishes), he validates, and only then are the families, sub-families, articles, prices and card rows
written. A step can be completed later, or taken back. The suite pins:

- the proposal writes nothing and says what it understood: what is new, what exists, what has no price, what it could not use;
- what a validated step writes: the families under the restaurant's root group (the group that carries the VAT), their service
  family, colour and station; the articles and their price; the card, its headings and its rows, a dish with no price on the
  card but switched off, so that nothing without a price reaches a customer;
- what it never does: write twice, overwrite the settings of a family that exists, move an article that exists;
- completing a step later (new dishes land under their own heading) and taking a step back (what the step made goes, what was
  there before stays, and a dish already in an order refuses the whole undo);
- who may do it, and that nothing is available where the site has not switched the feature on.

The suite builds everything it needs and rolls back.
"""

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import card_plan
from pos_next.tests.test_service_families import a_group, an_item, the_root
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants

ROOT = "_Test CP Food"
CARD = "_Test CP Card"
BAR = "_Test CP Bar"
COFFEES = "_Test CP Coffees"
SOFTS = "_Test CP Soft drinks"
WATER = "_Test CP Water"
FLAG = {"neoresto_card_with_nora_active": 1}


def coffees(**more):
	return {
		"name": COFFEES,
		"service_family": "Dessert",
		"station": BAR,
		"color": "brown",
		"subs": [
			{
				"name": None,
				"items": [
					{"name": "_Test CP Espresso", "price": 4.2},
					{"name": "_Test CP Ristretto", "price": 3.8},
					{"name": "_Test CP Decaf"},
				],
			}
		],
		**more,
	}


def softs():
	return {
		"name": SOFTS,
		"service_family": "Drink",
		"station": BAR,
		"subs": [
			{
				"name": WATER,
				"color": "blue",
				"items": [
					{"name": "_Test CP Still water", "price": 3.5},
					{"name": "_Test CP Sparkling water", "price": 3.5},
				],
			}
		],
	}


class CardPlanCase(TwoRestaurants, FrappeTestCase):
	def setUp(self):
		super().setUp()
		patcher = patch_flag()
		patcher.start()
		self.addCleanup(patcher.stop)
		try:
			# the list the till of the restaurant sells in: the one the step writes its prices to
			self.price_list = card_plan._selling_price_list(self.a)[0]
		except frappe.ValidationError:
			self.skipTest("The site has no selling price list")
		self.root = a_group(ROOT, the_root(), is_group=1)
		self.bar = self.make_station(self.a, BAR, station_type="Bar")

	def plan(self, *families, **more):
		return {
			"step": "Test step",
			"restaurant": self.a,
			"root": ROOT,
			"card": CARD,
			"families": list(families),
			**more,
		}

	def card_rows(self, card=CARD):
		"""What the card holds, in the order the till reads it: (type, label or item, sub-category, switched off)."""
		rows = frappe.get_all(
			"Restaurant Card Item",
			filters={"parent": card},
			fields=["item_type", "label", "item", "is_subcategory", "disabled", "sort_order", "idx"],
			order_by="sort_order asc, idx asc",
		)
		return [(r.item_type, r.label or r.item, bool(r.is_subcategory), bool(r.disabled)) for r in rows]

	def count(self, doctype, **filters):
		return frappe.db.count(doctype, filters)

	def apply(self, plan):
		with as_role("client_admin"):
			return card_plan.apply(plan)


def patch_flag():
	from unittest.mock import patch

	return patch.dict(frappe.conf, FLAG)


class TestAProposalWritesNothing(CardPlanCase):
	def test_it_changes_nothing_and_says_what_is_new(self):
		groups, items, cards = self.count("Item Group"), self.count("Item"), self.count("Restaurant Card")

		with as_role("client_admin"):
			proposal = card_plan.propose(self.plan(coffees(), softs()))

		self.assertEqual(
			(self.count("Item Group"), self.count("Item"), self.count("Restaurant Card")),
			(groups, items, cards),
		)
		family = proposal["families"][0]
		self.assertEqual((family["name"], family["status"]), (COFFEES, "new"))
		self.assertEqual({item["status"] for sub in family["subs"] for item in sub["items"]}, {"new"})
		self.assertEqual(
			proposal["counts"],
			{
				"families": 2,
				"subfamilies": 1,
				"buttons": 5,
				"new_items": 5,
				"existing_items": 0,
				"without_price": 1,
			},
		)

	def test_what_exists_is_recognised_whatever_its_accents_and_case(self):
		a_group(COFFEES, ROOT)
		an_item("_Test CP Espresso", COFFEES, self.company)

		with as_role("client_admin"):
			proposal = card_plan.propose(self.plan(coffees(name=COFFEES.lower())))

		family = proposal["families"][0]
		self.assertEqual((family["status"], family["name"]), ("exists", COFFEES))
		statuses = {item["name"]: item["status"] for item in family["subs"][0]["items"]}
		self.assertEqual(statuses["_Test CP Espresso"], "existing")
		self.assertEqual(statuses["_Test CP Ristretto"], "new")
		self.assertEqual(family["subs"][0]["items"][0]["item_code"], "_Test CP Espresso")

	def test_a_missing_or_zero_price_is_flagged(self):
		plan = self.plan(coffees())
		plan["families"][0]["subs"][0]["items"][1]["price"] = 0

		with as_role("client_admin"):
			items = card_plan.propose(plan)["families"][0]["subs"][0]["items"]

		self.assertEqual([item["needs_price"] for item in items], [False, True, True])

	def test_what_it_cannot_use_is_dropped_and_said(self):
		plan = self.plan(coffees(service_family="Pudding", color="chartreuse", station="Nowhere"))

		with as_role("client_admin"):
			family = card_plan.propose(plan)["families"][0]
			warnings = card_plan.propose(plan)["warnings"]

		self.assertEqual((family["service_family"], family["station_found"]), (None, False))
		self.assertEqual(len(warnings), 3)

	def test_a_plan_with_nothing_in_it_is_refused(self):
		with as_role("client_admin"), self.assertRaises(frappe.ValidationError):
			card_plan.propose(self.plan())
		with as_role("client_admin"), self.assertRaises(frappe.ValidationError):
			card_plan.propose(self.plan({"name": " ", "subs": []}))

	def test_the_family_of_the_root_group_is_the_one_a_plan_without_root_uses(self):
		plan = self.plan(coffees())
		del plan["root"]
		with (
			as_role("client_admin"),
			patch_default_root(ROOT),
		):
			proposal = card_plan.propose(plan)

		self.assertEqual(proposal["families"][0]["parent"], ROOT)


def patch_default_root(name):
	from unittest.mock import patch

	return patch.object(card_plan, "DEFAULT_ROOT", name)


class TestAStepIsWritten(CardPlanCase):
	def test_the_family_is_made_under_the_root_with_its_settings(self):
		self.apply(self.plan(coffees(), softs()))

		coffee = frappe.get_doc("Item Group", COFFEES)
		self.assertEqual(
			(coffee.parent_item_group, coffee.service_family, coffee.service_color),
			(ROOT, "Dessert", "#A07856"),
		)
		self.assertEqual(frappe.db.get_value("Item Group", SOFTS, "is_group"), 1)
		water = frappe.get_doc("Item Group", WATER)
		self.assertEqual((water.parent_item_group, water.service_color), (SOFTS, "#5B9BD5"))
		self.assertEqual(
			frappe.get_all(
				"Preparation Station Item Group",
				filters={"parent": self.bar},
				pluck="item_group",
				order_by="idx",
			),
			[COFFEES, SOFTS, WATER],
		)

	def test_the_articles_are_made_with_their_price_in_the_selling_list(self):
		self.apply(self.plan(coffees()))

		espresso = frappe.get_doc("Item", "_Test CP Espresso")
		self.assertEqual(
			(espresso.item_group, espresso.is_sales_item, espresso.is_stock_item), (COFFEES, 1, 0)
		)
		rate = frappe.db.get_value(
			"Item Price", {"item_code": "_Test CP Espresso", "price_list": self.price_list}, "price_list_rate"
		)
		self.assertEqual(rate, 4.2)
		self.assertFalse(frappe.db.exists("Item Price", {"item_code": "_Test CP Decaf"}))

	def test_a_new_card_holds_a_heading_and_its_rows_and_a_dish_without_a_price_is_switched_off(self):
		self.apply(self.plan(coffees()))

		self.assertEqual(
			self.card_rows(),
			[
				("Category", COFFEES, False, False),
				("Item", "_Test CP Espresso", False, False),
				("Item", "_Test CP Ristretto", False, False),
				("Item", "_Test CP Decaf", False, True),
			],
		)
		self.assertEqual(
			frappe.db.get_value("Restaurant Card", CARD, ["restaurant", "is_active"]), (self.a, 1)
		)

	def test_a_sub_family_has_its_own_heading_under_the_family(self):
		self.apply(self.plan(softs()))

		self.assertEqual(
			self.card_rows(),
			[
				("Category", SOFTS, False, False),
				("Category", WATER, True, False),
				("Item", "_Test CP Still water", False, False),
				("Item", "_Test CP Sparkling water", False, False),
			],
		)

	def test_the_card_the_restaurant_has_not_got_is_made_and_becomes_its_guest_menu(self):
		plan = self.plan(coffees())
		del plan["card"]

		result = self.apply(plan)

		card = result["card"]
		self.assertTrue(result["card_created"])
		self.assertEqual(frappe.db.get_value("Restaurant", self.a, "guest_menu"), card)

	def test_applying_twice_writes_nothing_twice(self):
		self.apply(self.plan(coffees()))
		before = (
			self.count("Item Group"),
			self.count("Item"),
			self.count("Item Price"),
			len(self.card_rows()),
		)

		again = self.apply(self.plan(coffees()))

		self.assertEqual(
			(self.count("Item Group"), self.count("Item"), self.count("Item Price"), len(self.card_rows())),
			before,
		)
		self.assertEqual((again["groups"], again["items"], again["rows"]), ([], [], []))

	def test_a_family_that_exists_keeps_its_own_settings(self):
		frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": COFFEES,
				"parent_item_group": ROOT,
				"service_family": "Main",
				"service_color": "#112233",
			}
		).insert(ignore_permissions=True)

		self.apply(self.plan(coffees()))

		group = frappe.get_doc("Item Group", COFFEES)
		self.assertEqual((group.service_family, group.service_color), ("Main", "#112233"))
		self.assertEqual(frappe.db.get_value("Item", "_Test CP Espresso", "item_group"), COFFEES)

	def test_an_article_that_exists_becomes_a_sales_article_and_stays_in_its_group(self):
		other = a_group("_Test CP Cellar", the_root(), is_group=0)
		frappe.db.set_value("Item", an_item("_Test CP Dole", other, self.company), "is_sales_item", 0)
		plan = self.plan(
			{
				"name": COFFEES,
				"subs": [{"items": [{"name": "_Test CP Dole", "item_code": "_Test CP Dole", "price": 14.5}]}],
			}
		)

		result = self.apply(plan)

		dole = frappe.get_doc("Item", "_Test CP Dole")
		self.assertEqual((dole.item_group, dole.is_sales_item), (other, 1))
		self.assertEqual(
			frappe.db.get_value(
				"Item Price", {"item_code": "_Test CP Dole", "price_list": self.price_list}, "price_list_rate"
			),
			14.5,
		)
		self.assertIn(("Item", "_Test CP Dole", False, False), self.card_rows())
		self.assertEqual(result["items"], [])
		self.assertEqual([change["item"] for change in result["item_changes"]], ["_Test CP Dole"])

	def test_a_price_given_later_switches_the_dish_on(self):
		self.apply(self.plan(coffees()))
		self.assertIn(("Item", "_Test CP Decaf", False, True), self.card_rows())
		plan = self.plan(coffees())
		plan["families"][0]["subs"][0]["items"][2]["price"] = 4.0

		self.apply(plan)

		self.assertIn(("Item", "_Test CP Decaf", False, False), self.card_rows())
		self.assertEqual(
			frappe.db.get_value(
				"Item Price",
				{"item_code": "_Test CP Decaf", "price_list": self.price_list},
				"price_list_rate",
			),
			4.0,
		)

	def test_a_step_completed_later_lands_under_its_own_heading(self):
		self.apply(self.plan(coffees(), softs()))
		more = coffees()
		more["subs"][0]["items"] = [{"name": "_Test CP Cappuccino", "price": 4.8}]

		self.apply(self.plan(more))

		labels = [label for _kind, label, _sub, _off in self.card_rows()]
		self.assertEqual(
			labels,
			[
				COFFEES,
				"_Test CP Espresso",
				"_Test CP Ristretto",
				"_Test CP Decaf",
				"_Test CP Cappuccino",
				SOFTS,
				WATER,
				"_Test CP Still water",
				"_Test CP Sparkling water",
			],
		)


class TestWhatTheRestaurantHasAlready(CardPlanCase):
	"""Where the owner is when he comes back to a step: the families, their buttons, the cards."""

	def test_the_overview_counts_the_buttons_of_each_family_and_card(self):
		self.apply(self.plan(coffees(), softs()))

		with as_role("client_admin"):
			overview = card_plan.overview(self.a, root=ROOT)

		families = {family["name"]: family for family in overview["families"]}
		self.assertEqual(families[COFFEES]["buttons"], 3)
		self.assertEqual(families[SOFTS]["buttons"], 2)
		self.assertEqual([(sub["name"], sub["buttons"]) for sub in families[SOFTS]["subs"]], [(WATER, 2)])
		self.assertEqual(overview["cards"], [{"name": CARD, "buttons": 5, "hidden": 1}])

	def test_an_empty_restaurant_has_nothing_and_says_so(self):
		with as_role("client_admin"):
			overview = card_plan.overview(self.a, root=ROOT)

		self.assertEqual((overview["families"], overview["cards"]), ([], []))
		self.assertEqual(overview["root"], ROOT)

	def test_a_cashier_may_not_look(self):
		with as_role("cashier"), self.assertRaises(frappe.PermissionError):
			card_plan.overview(self.a, root=ROOT)


class TestAStepIsTakenBack(CardPlanCase):
	def test_what_the_step_made_goes(self):
		groups, items, prices = self.count("Item Group"), self.count("Item"), self.count("Item Price")
		made = self.apply(self.plan(coffees(), softs()))

		with as_role("client_admin"):
			report = card_plan.undo(made)

		self.assertEqual(
			(self.count("Item Group"), self.count("Item"), self.count("Item Price")), (groups, items, prices)
		)
		self.assertFalse(frappe.db.exists("Restaurant Card", CARD))
		self.assertEqual(frappe.get_all("Preparation Station Item Group", filters={"parent": self.bar}), [])
		self.assertEqual(report["kept"], [])

	def test_what_was_there_before_stays(self):
		a_group(COFFEES, ROOT)
		other = a_group("_Test CP Cellar", the_root(), is_group=0)
		dole = an_item("_Test CP Dole", other, self.company)
		frappe.db.set_value("Item", dole, "is_sales_item", 0)
		first = self.apply(self.plan(coffees()))
		plan = self.plan(
			{
				"name": COFFEES,
				"subs": [{"items": [{"name": "_Test CP Dole", "item_code": dole, "price": 14.5}]}],
			}
		)
		second = self.apply(plan)

		with as_role("client_admin"):
			card_plan.undo(second)

		self.assertEqual(frappe.db.get_value("Item", dole, ["is_sales_item", "item_group"]), (0, other))
		self.assertFalse(frappe.db.exists("Item Price", {"item_code": dole, "price_list": self.price_list}))
		self.assertTrue(frappe.db.exists("Item Group", COFFEES))
		self.assertTrue(frappe.db.exists("Item", "_Test CP Espresso"))
		self.assertNotIn(("Item", dole, False, False), self.card_rows())
		self.assertEqual(first["groups"], [])

	def test_the_rows_that_were_there_keep_their_order(self):
		first = self.apply(self.plan(coffees()))
		before = self.card_rows()
		more = coffees()
		more["subs"][0]["items"] = [{"name": "_Test CP Cappuccino", "price": 4.8}]
		second = self.apply(self.plan(more))

		with as_role("client_admin"):
			card_plan.undo(second)

		self.assertEqual(self.card_rows(), before)
		self.assertEqual(len(first["rows"]), 4)

	def test_a_dish_already_in_an_order_refuses_the_whole_undo(self):
		made = self.apply(self.plan(coffees(), softs()))
		invoice = frappe.new_doc("Sales Invoice")
		invoice.company = self.company
		invoice.customer = frappe.db.get_value("Customer", {}, "name")
		if not invoice.customer:
			self.skipTest("The site has no customer")
		invoice.append("items", {"item_code": "_Test CP Espresso", "qty": 1, "rate": 4.2})
		# an order of a table is a draft: it is numbered by hand, a test site has no fiscal year to number it by
		invoice.flags.ignore_validate = True
		invoice.insert(ignore_permissions=True, ignore_mandatory=True, set_name="_Test CP Order")

		with as_role("client_admin"), self.assertRaises(frappe.ValidationError):
			card_plan.undo(made)

		self.assertTrue(frappe.db.exists("Item", "_Test CP Espresso"))
		self.assertTrue(frappe.db.exists("Item Group", SOFTS))
		self.assertIn(("Item", "_Test CP Espresso", False, False), self.card_rows())


class TestWhoMayDoIt(CardPlanCase):
	def test_a_cashier_may_neither_propose_nor_write(self):
		for call in (card_plan.propose, card_plan.apply):
			with as_role("cashier"), self.assertRaises(frappe.PermissionError):
				call(self.plan(coffees()))

		self.assertFalse(frappe.db.exists("Item Group", COFFEES))

	def test_a_visitor_may_do_nothing(self):
		with as_role("Guest"), self.assertRaises(frappe.PermissionError):
			card_plan.propose(self.plan(coffees()))

	def test_nothing_is_available_where_the_site_has_not_switched_it_on(self):
		with patch_off(), as_role("client_admin"):
			for call in (card_plan.propose, card_plan.apply):
				with self.assertRaises(frappe.PermissionError):
					call(self.plan(coffees()))
			self.assertFalse(card_plan.active())

		self.assertFalse(frappe.db.exists("Item Group", COFFEES))


def patch_off():
	from unittest.mock import patch

	return patch.dict(frappe.conf, {"neoresto_card_with_nora_active": 0})
