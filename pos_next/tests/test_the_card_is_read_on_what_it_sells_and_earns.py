# //// Neoffice — added file (no upstream equivalent).
"""« Quels plats me rapportent ? »: the card placed on what it sells and what it earns, family by family (card_analysis.py)."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import card_analysis
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import OWNER, OWNER_ROLES, PORTAL, _user


def _dish(name, qty, price, cost):
	return {"dish": name, "qty": qty, "price": price, "cost": cost}


def _sold(name, family, qty, amount):
	return {"item": name, "item_name": name, "family": family, "qty": qty, "amount": amount}


class TestTheCardIsReadOnWhatItSellsAndEarns(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(PORTAL, (), user_type="Website User")

	def tearDown(self):
		frappe.set_user("Administrator")

	def _card(self, sold, costs, **kwargs):
		"""The reading of the card over what was sold, the costs given by dish (a list: what is missing)."""

		def portion(row):
			cost = costs[row["item"]]
			return {"missing": cost} if isinstance(cost, list) else {"per_portion": cost}

		with (
			patch.object(card_analysis, "require_neoresto"),
			patch.object(card_analysis, "_sold", lambda *a: sold),
			patch.object(card_analysis, "_portion_cost", portion),
		):
			return card_analysis.card(**kwargs)

	def test_a_dish_is_placed_on_what_it_sells_and_what_it_earns(self):
		placed = card_analysis.place(
			[
				_dish("sells and earns", 100, 30, 10),
				_dish("sells, earns little", 100, 20, 14),
				_dish("earns, sells little", 10, 40, 10),
				_dish("neither", 10, 15, 12),
			]
		)
		self.assertEqual(
			{dish["dish"]: dish["place"] for dish in placed},
			{
				"sells and earns": "star",
				"sells, earns little": "workhorse",
				"earns, sells little": "puzzle",
				"neither": "dog",
			},
		)
		self.assertEqual(placed[0]["dish"], "sells and earns", "what brings in the most comes first")
		self.assertEqual((placed[0]["margin"], placed[0]["share"]), (20, 45.5))

	def test_a_dish_alone_in_its_family_has_nothing_to_be_compared_with(self):
		(dish,) = card_analysis.place([_dish("soup", 5, 12, 3)])
		self.assertEqual(dish["place"], "alone")

	def test_families_are_compared_apart(self):
		report = self._card(
			[
				_sold("gigot", "Mains", 50, 1500),
				_sold("rumsteck", "Mains", 50, 1500),
				_sold("tarte", "Desserts", 2, 20),
				_sold("flan", "Desserts", 2, 20),
			],
			{"gigot": 10, "rumsteck": 20, "tarte": 2, "flan": 4},
		)
		self.assertEqual([family["family"] for family in report["families"]], ["Desserts", "Mains"])
		places = {d["dish"]: d["place"] for family in report["families"] for d in family["dishes"]}
		self.assertEqual(places, {"gigot": "star", "rumsteck": "workhorse", "tarte": "star", "flan": "workhorse"})

	def test_the_price_is_what_was_really_sold_net_of_tax(self):
		report = self._card([_sold("gigot", "Mains", 4, 100), _sold("rumsteck", "Mains", 4, 100)], {"gigot": 10, "rumsteck": 10})
		self.assertEqual(report["families"][0]["dishes"][0]["price"], 25)

	def test_a_cost_unknown_or_partial_is_never_placed(self):
		report = self._card(
			[_sold("gigot", "Mains", 8, 240), _sold("rumsteck", "Mains", 3, 90)],
			{"gigot": 10, "rumsteck": ["no recipe"]},
		)
		self.assertEqual(report["not_costed"], [{"dish": "rumsteck", "qty": 3, "missing": ["no recipe"]}])
		self.assertEqual([d["dish"] for d in report["families"][0]["dishes"]], ["gigot"])
		self.assertEqual(report["sold"], 2)

	def test_a_dish_with_no_recipe_says_so(self):
		item = frappe.db.get_value("Item", {"disabled": 0}, "name")
		self.assertEqual(card_analysis._portion_cost({"item": item, "item_name": item}).get("missing"), ["no recipe"])

	def test_the_sales_are_read_from_the_tills_of_one_company(self):
		self.assertEqual(list(card_analysis._sold("_No such company", "2026-01-01", "2026-12-31")), [])

	def test_the_period_is_bounded(self):
		self.assertRaises(frappe.ValidationError, self._card, [], {}, months=100)

	def test_a_portal_account_reads_nothing(self):
		frappe.set_user(PORTAL)
		with patch.object(card_analysis, "require_neoresto"):
			self.assertRaises(frappe.PermissionError, card_analysis.card)
