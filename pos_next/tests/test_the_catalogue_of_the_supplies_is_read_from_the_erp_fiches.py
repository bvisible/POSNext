# //// Neoffice — added file (no upstream equivalent).
"""The purchase catalogue of a restaurant is read from the ERP's own fiches (NeoResto, purchases, lot A).

The Achats screen shows the articles the restaurant buys regularly, who sells each, in which packaging and at what price.
Nothing is stored for it: the catalogue is worked out from the items ticked « Restaurant Supply », the rows of their table
of suppliers, their units and their prices. A price is the last one PAID at that supplier (a submitted purchase invoice),
else the catalogue price of the buying Item Price, else none: the owner who types no price still has a catalogue.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from pos_next.restaurant import supplies, supply_catalogue
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import (
	BOTTLE_UOM,
	OWNER,
	OWNER_ROLES,
	PORTAL,
	_bottle_uom,
	_supplier,
	_user,
)

CELLAR = "_PNXT catalogue cellar"
PRIMEUR = "_PNXT catalogue greengrocer"
CASH_AND_CARRY = "_PNXT catalogue wholesaler"
PREFIX = "_PNXT catalogue "


def _mine(result):
	"""The rows of this suite only: a working site may hold regular purchases of its own."""
	return {row["item"]: row for row in result["rows"] if row["item"].startswith(PREFIX)}


class TestTheCatalogueOfTheSuppliesIsReadFromTheErpFiches(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(PORTAL, (), user_type="Website User")
		for name in (CELLAR, PRIMEUR, CASH_AND_CARRY):
			_supplier(name)
		_bottle_uom()
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		frappe.set_user(OWNER)
		# A wine, sold as it is bought; a pasta, only bought; a salad that two suppliers sell, one with no price at all
		cls.wine = supplies.create_supply_item(PREFIX + "wine", group, BOTTLE_UOM)
		cls.pasta = supplies.create_supply_item(PREFIX + "pasta", group, BOTTLE_UOM)
		cls.salad = supplies.create_supply_item(PREFIX + "salad", group, BOTTLE_UOM)
		frappe.set_user("Administrator")
		frappe.db.set_value("Item", cls.wine, "is_sales_item", 1)
		frappe.set_user(OWNER)
		supplies.add_supply_pack(cls.wine, CELLAR, PREFIX + "Carton of 6", 6, 52.5, "W-6", make_usual=1)
		supplies.add_supply_pack(cls.pasta, CASH_AND_CARRY, PREFIX + "Box of 5 kg", 5, 18.6)
		supplies.add_supply_pack(cls.salad, PRIMEUR, PREFIX + "Crate of 12", 12, 18)
		supplies.add_supply_pack(cls.salad, CASH_AND_CARRY, PREFIX + "Box of 10", 10, None)
		frappe.set_user("Administrator")
		cls.group = group

	def tearDown(self):
		frappe.set_user("Administrator")

	def _read(self, **kwargs):
		frappe.set_user(OWNER)
		return supply_catalogue.catalogue(**kwargs)

	def test_the_articles_come_with_their_packs_and_suppliers(self):
		rows = _mine(self._read())
		self.assertEqual(set(rows), {self.wine, self.pasta, self.salad})
		salad = rows[self.salad]
		self.assertEqual(salad["stock_uom"], BOTTLE_UOM)
		self.assertFalse(salad["sold"])
		self.assertEqual(
			sorted((p["supplier"], p["uom"], p["content"]) for p in salad["packs"]),
			sorted([(PRIMEUR, PREFIX + "Crate of 12", 12), (CASH_AND_CARRY, PREFIX + "Box of 10", 10)]),
		)
		self.assertTrue(rows[self.wine]["sold"])

	def test_a_price_is_the_catalogue_one_and_a_pack_with_none_has_none(self):
		salad = _mine(self._read())[self.salad]
		crate = next(p for p in salad["packs"] if p["supplier"] == PRIMEUR)
		box = next(p for p in salad["packs"] if p["supplier"] == CASH_AND_CARRY)
		self.assertEqual((crate["price"], crate["price_source"]), (18, "catalogue"))
		self.assertEqual(crate["unit_price"], 1.5, "the price of one unit, to compare packagings")
		self.assertEqual((box["price"], box["price_source"], box["unit_price"]), (None, None, None))

	def test_the_last_price_paid_wins_over_the_catalogue_one(self):
		frappe.set_user("Administrator")
		self._paid(self.wine, CELLAR, PREFIX + "Carton of 6", 49.8)
		pack = _mine(self._read())[self.wine]["packs"][0]
		self.assertEqual((pack["price"], pack["price_source"]), (49.8, "invoice"))
		self.assertEqual(pack["paid_on"], nowdate())

	def test_the_usual_supplier_is_marked(self):
		pack = _mine(self._read())[self.wine]["packs"][0]
		self.assertTrue(pack["usual"])
		self.assertFalse(any(p["usual"] for p in _mine(self._read())[self.salad]["packs"]))

	def test_the_menu_and_the_supplies_are_told_apart(self):
		self.assertEqual(set(_mine(self._read(scope="menu"))), {self.wine})
		self.assertEqual(set(_mine(self._read(scope="supplies"))), {self.pasta, self.salad})

	def test_the_filters_keep_what_is_asked(self):
		self.assertEqual(set(_mine(self._read(search="pasta"))), {self.pasta})
		self.assertEqual(set(_mine(self._read(supplier=PRIMEUR))), {self.salad})
		self.assertEqual(set(_mine(self._read(supplier=CASH_AND_CARRY))), {self.pasta, self.salad})
		self.assertEqual(set(_mine(self._read(item_group=self.group))), {self.wine, self.pasta, self.salad})

	def test_the_facets_name_the_families_and_the_suppliers(self):
		result = self._read()
		self.assertIn(self.group, [f["name"] for f in result["families"]])
		suppliers = {s["name"]: s["count"] for s in result["suppliers"]}
		self.assertEqual(suppliers[CASH_AND_CARRY], 2)
		self.assertEqual(suppliers[PRIMEUR], 1)

	def test_a_disabled_article_is_no_longer_in_the_catalogue(self):
		frappe.db.set_value("Item", self.pasta, "disabled", 1)
		try:
			self.assertNotIn(self.pasta, _mine(self._read()))
		finally:
			frappe.db.set_value("Item", self.pasta, "disabled", 0)

	def test_a_visitor_and_a_portal_account_read_nothing(self):
		for user in ("Guest", PORTAL):
			frappe.set_user(user)
			with self.assertRaises(frappe.PermissionError, msg=user):
				supply_catalogue.catalogue()

	def _paid(self, item, supplier, uom, rate):
		"""A submitted purchase invoice line, written as a row: only what the catalogue reads, rolled back with the class."""
		name = f"PINV-PNXT-{frappe.generate_hash(length=8)}"
		invoice = frappe.new_doc("Purchase Invoice")
		invoice.update(
			{
				"name": name,
				"supplier": supplier,
				"posting_date": nowdate(),
				"docstatus": 1,
				"is_return": 0,
				"company": frappe.db.get_value("Company", {}, "name"),
			}
		)
		invoice.db_insert()
		line = frappe.new_doc("Purchase Invoice Item")
		line.update(
			{
				"name": frappe.generate_hash(length=10),
				"parent": name,
				"parenttype": "Purchase Invoice",
				"parentfield": "items",
				"idx": 1,
				"item_code": item,
				"uom": uom,
				"rate": rate,
				"base_rate": rate,
				"qty": 1,
			}
		)
		line.db_insert()
