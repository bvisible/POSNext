# //// Neoffice — added file (no upstream equivalent).
"""What the till reads of the restaurant carries the units of the items (NeoResto lot 1, task 22).

A dish added from a restaurant card opened « Edit Item Details » with « Nos » in the header and an empty unit select: the
card read named the item and its price, not its unit, so the cart line was made without one. A cart line made from a card
entry, a menu course or a table's order read back has to carry what a line made from the grid carries (`get_items`):
`stock_uom` and `item_uoms`, the item's OTHER units with their factors, the stock unit left out.

The reads take the units of all the items of a card, a menu or an order together: two queries however many items there
are, never one per item.

Nothing here relies on a patch, on an after_migrate or on the data of the site: the suite makes its units, its items, a
restaurant with a card, a menu and a table, and rolls everything back. Nothing is committed.
"""

from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from pos_next.api import restaurant
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant

SAVEPOINT = "restaurant_lines_carry_their_units"
GLASS, BOTTLE, CASE_OF_SIX = "_Test Unit Glass 22", "_Test Unit Bottle 22", "_Test Unit Case 22"
WINE, WATER, BREAD = "_Test Dish Wine 22", "_Test Dish Water 22", "_Test Dish Bread 22"
RESTAURANT = "_Test Restaurant Units 22"
CARD = "_Test Card Units 22"
MENU = "_Test Menu Units 22"
SECOND_CARD = "_Test Second Card Units 22"
SECOND_MENU = "_Test Second Menu Units 22"
TABLE = "_Test Table Units 22"
TILL = "_Test Till Units 22"


@contextmanager
def counting_reads(*doctypes):
	"""The reads of these doctypes made through get_all and get_value, by doctype."""
	counts = dict.fromkeys(doctypes, 0)
	get_all, get_value = frappe.get_all, frappe.db.get_value

	def counted_get_all(doctype, *args, **kwargs):
		if doctype in counts:
			counts[doctype] += 1
		return get_all(doctype, *args, **kwargs)

	def counted_get_value(doctype, *args, **kwargs):
		if doctype in counts:
			counts[doctype] += 1
		return get_value(doctype, *args, **kwargs)

	with (
		patch.object(frappe, "get_all", counted_get_all),
		patch.object(frappe.db, "get_value", counted_get_value),
	):
		yield counts


class TestRestaurantLinesCarryTheirUnits(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		# A restaurant provisions its tip account and item: that is the doctype's own test
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		# A few endpoints commit: nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)

		self.restaurant = self.insert("Restaurant", restaurant_name=RESTAURANT, company=company[0])
		for unit in (GLASS, BOTTLE, CASE_OF_SIX):
			self.insert("UOM", uom_name=unit, enabled=1)
		# A wine sold by the glass only, a water stocked by the bottle and sold by the case of six too, a bread that is
		# not the card's
		self.wine = self.make_item(WINE, GLASS)
		self.water = self.make_item(WATER, BOTTLE, [(CASE_OF_SIX, 6)])
		self.bread = self.make_item(BREAD, GLASS)

		self.card = self.insert(
			"Restaurant Card",
			restaurant=self.restaurant,
			card_name=CARD,
			is_active=1,
			items=[
				{"item_type": "Category", "label": "Drinks"},
				{"item_type": "Item", "item": self.wine, "price": 29},
				{"item_type": "Item", "item": self.water, "price": 4.5},
			],
		)
		self.menu = self.insert(
			"Restaurant Menu",
			restaurant=self.restaurant,
			menu_name=MENU,
			price=25,
			is_active=1,
			courses=[
				{"course_name": "Starter", "item": self.bread, "item_name": BREAD},
				{"course_name": "Drink", "item": self.water, "item_name": WATER},
				{"course_name": "Drink", "item": self.wine, "item_name": WINE},
			],
		)

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def make_item(self, code, stock_uom, other_units=()):
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or self.insert(
			"Item Group", item_group_name="_Test Group Units 22", parent_item_group="All Item Groups"
		)
		return self.insert(
			"Item",
			item_code=code,
			item_name=code,
			item_group=group,
			stock_uom=stock_uom,
			is_stock_item=0,
			uoms=[
				{"uom": stock_uom, "conversion_factor": 1},
				*({"uom": unit, "conversion_factor": factor} for unit, factor in other_units),
			],
		)

	def entries_of_the_card(self):
		cards = {card["name"]: card for card in restaurant.get_active_cards(self.restaurant)}
		return {entry["item"]: entry for entry in cards[self.card]["items"] if entry.get("item")}

	# --- the card ---

	def test_a_card_entry_carries_the_stock_unit_of_its_item(self):
		entries = self.entries_of_the_card()

		self.assertEqual(entries[self.wine]["stock_uom"], GLASS)
		self.assertEqual(entries[self.water]["stock_uom"], BOTTLE)

	def test_a_card_entry_carries_the_other_units_of_its_item_with_their_factors(self):
		entries = self.entries_of_the_card()

		self.assertEqual(
			[(unit["uom"], flt(unit["conversion_factor"])) for unit in entries[self.water]["item_uoms"]],
			[(CASE_OF_SIX, 6)],
		)

	def test_the_stock_unit_is_not_repeated_among_the_other_units(self):
		# The item's table of units holds its stock unit (ERPNext puts it there): get_items leaves it out of item_uoms
		entries = self.entries_of_the_card()

		self.assertTrue(
			frappe.db.exists("UOM Conversion Detail", {"parent": self.wine, "uom": GLASS}),
			"the item keeps its stock unit among its units: the case is only worth something with it",
		)
		self.assertEqual(entries[self.wine]["item_uoms"], [])
		for entry in entries.values():
			self.assertNotIn(entry["stock_uom"], [unit["uom"] for unit in entry["item_uoms"]])

	def test_what_the_card_read_gave_before_is_still_there(self):
		entry = self.entries_of_the_card()[self.wine]

		self.assertEqual(entry["item_name"], WINE)
		self.assertEqual(flt(entry["price"]), 29)
		self.assertEqual(entry["is_stock_item"], 0)
		self.assertIn("item_group", entry)
		self.assertIn("default_price", entry)

	def test_a_category_of_the_card_has_no_units(self):
		cards = {card["name"]: card for card in restaurant.get_active_cards(self.restaurant)}
		category = next(entry for entry in cards[self.card]["items"] if entry["item_type"] == "Category")

		self.assertNotIn("stock_uom", category)
		self.assertNotIn("item_uoms", category)

	def test_an_item_the_site_lost_is_listed_without_units_and_does_not_stop_the_card(self):
		row = frappe.get_doc("Restaurant Card", self.card).items[2]
		frappe.db.set_value("Restaurant Card Item", row.name, "item", "_Test Dish Gone 22")

		entries = self.entries_of_the_card()

		self.assertNotIn("stock_uom", entries["_Test Dish Gone 22"])
		self.assertEqual(entries[self.wine]["stock_uom"], GLASS)

	def test_the_units_of_a_card_are_read_together_not_one_item_at_a_time(self):
		with counting_reads("Item", "UOM Conversion Detail") as reads:
			restaurant.get_active_cards(self.restaurant)

		# One card with two dishes: one read of the items, one of their units. A read per item would make four
		self.assertEqual(reads, {"Item": 1, "UOM Conversion Detail": 1})

	def test_the_units_of_all_the_cards_are_read_together_not_one_card_at_a_time(self):
		# A second card with a dish of its own: the call reads the items of both cards once, with their units
		self.insert(
			"Restaurant Card",
			restaurant=self.restaurant,
			card_name=SECOND_CARD,
			is_active=1,
			items=[{"item_type": "Item", "item": self.bread, "price": 6}],
		)

		with counting_reads("Item", "UOM Conversion Detail") as reads:
			cards = restaurant.get_active_cards(self.restaurant)

		self.assertEqual(reads, {"Item": 1, "UOM Conversion Detail": 1})
		# Each card keeps its own dishes, with their units
		by_card = {
			card["name"]: {entry["item"]: entry for entry in card["items"] if entry.get("item")}
			for card in cards
		}
		self.assertEqual(by_card[SECOND_CARD][self.bread]["stock_uom"], GLASS)
		self.assertEqual(by_card[self.card][self.water]["stock_uom"], BOTTLE)

	# --- the menus ---

	def test_a_course_item_of_a_menu_carries_its_units(self):
		menus = {menu["name"]: menu for menu in restaurant.get_active_menus(self.restaurant)}
		items = {item["item"]: item for course in menus[self.menu]["courses"] for item in course["items"]}

		self.assertEqual(items[self.bread]["stock_uom"], GLASS)
		self.assertEqual(items[self.water]["stock_uom"], BOTTLE)
		self.assertEqual(
			[(unit["uom"], flt(unit["conversion_factor"])) for unit in items[self.water]["item_uoms"]],
			[(CASE_OF_SIX, 6)],
		)
		self.assertEqual(items[self.wine]["item_uoms"], [])
		# What the read gave before
		self.assertEqual(items[self.water]["item_name"], WATER)

	def test_the_units_of_a_menu_are_read_together_too(self):
		with counting_reads("Item", "UOM Conversion Detail") as reads:
			restaurant.get_active_menus(self.restaurant)

		self.assertEqual(reads, {"Item": 1, "UOM Conversion Detail": 1})

	def test_the_units_of_all_the_menus_are_read_together_not_one_menu_at_a_time(self):
		self.insert(
			"Restaurant Menu",
			restaurant=self.restaurant,
			menu_name=SECOND_MENU,
			price=30,
			is_active=1,
			courses=[{"course_name": "Main", "item": self.bread, "item_name": BREAD}],
		)

		with counting_reads("Item", "UOM Conversion Detail") as reads:
			menus = restaurant.get_active_menus(self.restaurant)

		self.assertEqual(reads, {"Item": 1, "UOM Conversion Detail": 1})
		second = next(menu for menu in menus if menu["name"] == SECOND_MENU)
		self.assertEqual(second["courses"][0]["items"][0]["stock_uom"], GLASS)

	# --- an order on a table ---

	def a_table(self):
		area = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Room Units 22")
		return self.insert("Restaurant Table", restaurant=self.restaurant, area=area, table_name=TABLE)

	def a_draft_order_on_the_table(self, table):
		"""A draft order of two lines on a table, saved row by row as the reads see it: the reads count columns."""
		order = f"_Test-UNITS-SINV-{frappe.generate_hash(length=8)}"
		frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"name": order,
				"docstatus": 0,
				"restaurant_table": table,
				"customer": "_Test Customer Units 22",
				"posting_date": nowdate(),
				"idx": 0,
			}
		).db_insert()
		rows = (
			(self.wine, 2, 29, GLASS, GLASS, 1),
			# A case of water: the line is in the case, the item is stocked by the bottle
			(self.water, 1, 27, CASE_OF_SIX, BOTTLE, 6),
		)
		for idx, (item, qty, rate, uom, stock_uom, factor) in enumerate(rows, start=1):
			frappe.get_doc(
				{
					"doctype": "Sales Invoice Item",
					"name": f"{order}-{idx}",
					"parent": order,
					"parenttype": "Sales Invoice",
					"parentfield": "items",
					"idx": idx,
					"item_code": item,
					"item_name": item,
					"qty": qty,
					"rate": rate,
					"amount": qty * rate,
					"uom": uom,
					"stock_uom": stock_uom,
					"conversion_factor": factor,
				}
			).db_insert()
		return order

	def test_the_lines_of_a_table_read_back_carry_their_units(self):
		table = self.a_table()
		self.a_draft_order_on_the_table(table)

		lines = {line["item_code"]: line for line in restaurant.get_table_order(table)["items"]}

		self.assertEqual(
			(
				lines[self.wine]["uom"],
				lines[self.wine]["stock_uom"],
				flt(lines[self.wine]["conversion_factor"]),
			),
			(GLASS, GLASS, 1),
		)
		self.assertEqual(lines[self.wine]["item_uoms"], [])
		self.assertEqual(
			(
				lines[self.water]["uom"],
				lines[self.water]["stock_uom"],
				flt(lines[self.water]["conversion_factor"]),
			),
			(CASE_OF_SIX, BOTTLE, 6),
		)
		self.assertEqual(
			[(unit["uom"], flt(unit["conversion_factor"])) for unit in lines[self.water]["item_uoms"]],
			[(CASE_OF_SIX, 6)],
		)

	def test_a_table_opened_from_the_floor_plan_carries_them_too(self):
		table = self.a_table()
		self.a_draft_order_on_the_table(table)

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(
				restaurant.restaurant_config, "get_restaurant_settings_for_profile", return_value={}
			),
		):
			opened = restaurant.open_table(table, TILL)

		lines = {line["item_code"]: line for line in opened["items"]}
		self.assertEqual(lines[self.wine]["stock_uom"], GLASS)
		self.assertEqual(
			[(unit["uom"], flt(unit["conversion_factor"])) for unit in lines[self.water]["item_uoms"]],
			[(CASE_OF_SIX, 6)],
		)

	def test_the_lines_of_a_table_say_whether_their_item_is_a_stock_item(self):
		# A "+" on a line read back makes its unit from the line: without the flag it became a stock item, refused by the
		# stock validation for a service or a non-stock dish (neoffice-maintenance#2080).
		frappe.db.set_value("Item", self.water, "is_stock_item", 1)
		table = self.a_table()
		self.a_draft_order_on_the_table(table)

		lines = {line["item_code"]: line for line in restaurant.get_table_order(table)["items"]}

		self.assertEqual((lines[self.wine]["is_stock_item"], lines[self.water]["is_stock_item"]), (0, 1))

	def test_a_table_opened_from_the_floor_plan_says_it_too(self):
		frappe.db.set_value("Item", self.water, "is_stock_item", 1)
		table = self.a_table()
		self.a_draft_order_on_the_table(table)

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(
				restaurant.restaurant_config, "get_restaurant_settings_for_profile", return_value={}
			),
		):
			opened = restaurant.open_table(table, TILL)

		lines = {line["item_code"]: line for line in opened["items"]}
		self.assertEqual((lines[self.wine]["is_stock_item"], lines[self.water]["is_stock_item"]), (0, 1))

	def test_a_table_opened_from_the_floor_plan_reads_its_items_together(self):
		table = self.a_table()
		self.a_draft_order_on_the_table(table)

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(
				restaurant.restaurant_config, "get_restaurant_settings_for_profile", return_value={}
			),
			counting_reads("Item", "UOM Conversion Detail") as reads,
		):
			opened = restaurant.open_table(table, TILL)

		# One read of the items' stock units and one of their images, whatever the number of lines (it was one per line)
		self.assertLessEqual(reads["Item"], 2)
		self.assertEqual(reads["UOM Conversion Detail"], 1)
		self.assertEqual(len(opened["items"]), 2)
		# The images are still there
		for line in opened["items"]:
			self.assertIn("image", line)

	def test_the_units_of_an_order_are_read_together_too(self):
		table = self.a_table()
		self.a_draft_order_on_the_table(table)

		with counting_reads("Item", "UOM Conversion Detail") as reads:
			restaurant.get_table_order(table)

		# The images of the order's items are read with the items already: the units add one read of their own
		self.assertEqual(reads["UOM Conversion Detail"], 1)
		self.assertLessEqual(reads["Item"], 2)
