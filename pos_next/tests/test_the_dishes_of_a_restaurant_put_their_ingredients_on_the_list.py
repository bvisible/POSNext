# //// Neoffice — added file (no upstream equivalent).
"""A dish carries the articles it needs, and adding the dish puts them on the shopping list (NeoResto, purchases, lot E).

The owner sells lasagnes and buys pasta, tomato sauce and minced beef. A dish is an article the restaurant SELLS with a small list of its
ingredients (a reminder, never a recipe: no stock, no bill of materials). The quantity per portion is optional: with it, adding the dish
works out the packagings and rounds UP; without it, the ingredient goes on the list as one packaging, to be completed.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import dishes, shopping, supplies
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import (
	MANAGER_ONLY,
	OWNER,
	OWNER_ROLES,
	_supplier,
	_user,
)
from pos_next.tests.test_till_writes_need_the_till import _company

WHOLESALER = "_PNXT dishes wholesaler"
BUTCHER = "_PNXT dishes butcher"
KG = "_PNXT dishes Kg"


class TestTheDishesOfARestaurantPutTheirIngredientsOnTheList(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(MANAGER_ONLY, ("Restaurant Manager",))
		_supplier(WHOLESALER)
		_supplier(BUTCHER)
		if not frappe.db.exists("UOM", KG):
			frappe.get_doc({"doctype": "UOM", "uom_name": KG}).insert(ignore_permissions=True)
		cls.company = _company()
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		frappe.set_user(OWNER)
		cls.pasta = supplies.create_supply_item("_PNXT dishes pasta", group, KG)
		supplies.add_supply_pack(
			cls.pasta, WHOLESALER, "_PNXT dishes Carton of 5 kg", 5, 18.6, None, 1, cls.company
		)
		cls.mince = supplies.create_supply_item("_PNXT dishes mince", group, KG)
		supplies.add_supply_pack(cls.mince, BUTCHER, "_PNXT dishes Pack of 5 kg", 5, 64, None, 1, cls.company)
		cls.salt = supplies.create_supply_item("_PNXT dishes salt", group, KG)
		supplies.add_supply_pack(
			cls.salt, WHOLESALER, "_PNXT dishes Bag of 1 kg", 1, None, None, 1, cls.company
		)
		cls.bare = supplies.create_supply_item("_PNXT dishes pepper", group, KG)  # no packaging yet
		frappe.set_user("Administrator")
		cls.dish = (
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": "_PNXT dishes lasagnes",
					"item_name": "_PNXT dishes lasagnes",
					"item_group": group,
					"stock_uom": "Nos",
					"is_stock_item": 0,
					"is_sales_item": 1,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _list(self):
		frappe.set_user(OWNER)
		return shopping.new_list(self.company)

	def _set(self, rows):
		frappe.set_user(OWNER)
		dishes.set_dish_ingredients(self.dish, rows)

	def _lines(self, name):
		return {line.item: line for line in frappe.get_doc("Restaurant Shopping List", name).lines}

	def test_the_ingredients_of_a_dish_are_kept_and_read(self):
		self._set(
			[
				{"item": self.pasta, "qty_per_portion": 0.12},
				{"item": self.salt, "qty_per_portion": None},
				{"item": self.pasta, "qty_per_portion": 9},  # twice: the first stays
			]
		)
		frappe.set_user(OWNER)
		read = dishes.dish_ingredients(self.dish)
		self.assertEqual(
			[(r["item"], r["qty_per_portion"]) for r in read], [(self.pasta, 0.12), (self.salt, None)]
		)
		self.assertEqual(read[0]["unit"], KG)

	def test_a_dish_is_not_its_own_ingredient(self):
		frappe.set_user(OWNER)
		with self.assertRaises(frappe.ValidationError):
			dishes.set_dish_ingredients(self.dish, [{"item": self.dish, "qty_per_portion": 1}])

	def test_the_packagings_are_worked_out_and_rounded_up(self):
		self._set(
			[{"item": self.pasta, "qty_per_portion": 0.12}, {"item": self.mince, "qty_per_portion": 0.15}]
		)
		name = self._list()
		report = dishes.add_dish_to_list(name, self.dish, 40)
		lines = self._lines(name)
		self.assertEqual(lines[self.pasta].qty, 1, "4.8 kg: one pack of 5 kg")
		self.assertEqual(lines[self.mince].qty, 2, "6 kg: two packs of 5 kg")
		self.assertEqual((lines[self.pasta].origin, lines[self.pasta].supplier), ("Dish", WHOLESALER))
		said = {r["item"]: r for r in report}
		self.assertEqual(
			(said[self.pasta]["needed"], said[self.pasta]["packs"], said[self.pasta]["calculated"]),
			(4.8, 1, True),
		)

	def test_an_ingredient_with_no_quantity_goes_on_as_one_packaging(self):
		self._set([{"item": self.salt, "qty_per_portion": None}])
		name = self._list()
		report = dishes.add_dish_to_list(name, self.dish, 40)
		self.assertEqual(self._lines(name)[self.salt].qty, 1)
		self.assertFalse(
			report[0]["calculated"], "no quantity per portion: nothing was worked out, and the report says so"
		)

	def test_an_ingredient_with_no_packaging_yet_is_counted_in_its_own_unit(self):
		self._set([{"item": self.bare, "qty_per_portion": 0.01}])
		name = self._list()
		dishes.add_dish_to_list(name, self.dish, 10)
		line = self._lines(name)[self.bare]
		self.assertEqual((line.uom, line.supplier), (KG, None))

	def test_adding_a_dish_twice_adds_up(self):
		self._set([{"item": self.mince, "qty_per_portion": 0.15}])
		name = self._list()
		dishes.add_dish_to_list(name, self.dish, 40)
		dishes.add_dish_to_list(name, self.dish, 40)
		self.assertEqual(self._lines(name)[self.mince].qty, 4)

	def test_a_dish_with_no_ingredient_or_no_portion_is_refused(self):
		self._set([])
		name = self._list()
		with self.assertRaises(frappe.ValidationError):
			dishes.add_dish_to_list(name, self.dish, 10)
		self._set([{"item": self.salt, "qty_per_portion": None}])
		with self.assertRaises(frappe.ValidationError):
			dishes.add_dish_to_list(name, self.dish, 0)

	def test_a_manager_without_the_erp_rights_cannot_change_a_dish(self):
		frappe.set_user(MANAGER_ONLY)
		with self.assertRaises(frappe.PermissionError):
			dishes.set_dish_ingredients(self.dish, [{"item": self.salt, "qty_per_portion": None}])
