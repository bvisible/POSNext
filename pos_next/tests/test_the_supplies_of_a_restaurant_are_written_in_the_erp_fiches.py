# //// Neoffice — added file (no upstream equivalent).
"""The supplies a restaurant buys are written in the ERP's own fiches (NeoResto, purchases, lot A).

A restaurant buys goods it does not sell (a tomato sauce, pasta, salt) and goods it sells as they come (a bottled
beer). Every one of them is an ERP Item. What the owner adds to an item to buy it, a packaging ("Carton of 6"), a supplier
and the price of that packaging at that supplier, already has a place in the ERP: the item's table of units, its table
of suppliers and a buying Item Price. `add_supply_pack` writes the three in one gesture, under the ERP's own rights
(`permissions.require`): nobody gets a right here that the ERP does not give, and a refusal writes nothing.

An article that is bought and never sold must not appear on a till: `create_supply_item` makes it with « sells » off, which the
ERP leaves ticked by default and the till filters on.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import supplies
from pos_next.tests.test_till_writes_need_the_till import _company

OWNER = "supplies-owner@yopmail.com"
MANAGER_ONLY = "supplies-manager-only@yopmail.com"
PORTAL = "supplies-portal@yopmail.com"
# The roles of a customer's administrator that decide the ERP's rights on items, units, suppliers and buying prices
OWNER_ROLES = (
	"Item Manager",
	"Purchase Manager",
	"Purchase Master Manager",
	"Sales Master Manager",
	"Restaurant Manager",
)
SUPPLIER = "_PNXT supplies supplier"
OTHER_SUPPLIER = "_PNXT supplies other supplier"
PACK = "_PNXT Carton of 6"
BOTTLE_UOM = "_PNXT Bottle"


def _user(email, roles, user_type="System User"):
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, ignore_permissions=True, force=True)
	frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"roles": [{"role": r} for r in roles if frappe.db.exists("Role", r)],
		}
	).insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "user_type", user_type)
	frappe.clear_cache(user=email)


def _supplier(name):
	if not frappe.db.exists("Supplier", name):
		frappe.get_doc(
			{
				"doctype": "Supplier",
				"supplier_name": name,
				"supplier_group": frappe.db.get_value("Supplier Group", {"is_group": 0}, "name")
				or frappe.db.get_value("Supplier Group", {}, "name"),
			}
		).insert(ignore_permissions=True)
	return name


def _bottle_uom():
	if not frappe.db.exists("UOM", BOTTLE_UOM):
		frappe.get_doc({"doctype": "UOM", "uom_name": BOTTLE_UOM}).insert(ignore_permissions=True)
	return BOTTLE_UOM


class TestTheSuppliesOfARestaurantAreWrittenInTheErpFiches(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(MANAGER_ONLY, ("Restaurant Manager",))
		_user(PORTAL, (), user_type="Website User")
		_supplier(SUPPLIER)
		_supplier(OTHER_SUPPLIER)
		_bottle_uom()
		cls.group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		cls.company = _company()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _item(self, name=None):
		"""A supply item made the way the owner makes it, by the call under test, as the owner. One name per test: the tests of
		a class share one transaction, which only the end of the class rolls back."""
		frappe.set_user(OWNER)
		return supplies.create_supply_item(
			name or f"_PNXT supplies {self._testMethodName}", self.group, BOTTLE_UOM
		)

	def _pack(self, item, **over):
		args = dict(
			item=item,
			supplier=SUPPLIER,
			pack_name=PACK,
			content=6,
			price=52.5,
			supplier_part_no="REF-6",
			make_usual=0,
		)
		args.update(over)
		return supplies.add_supply_pack(**args)

	# -- the article ---------------------------------------------------------------------------------------------

	def test_an_article_that_is_bought_is_never_sold(self):
		code = self._item()
		item = frappe.get_doc("Item", code)
		self.assertEqual(
			item.is_sales_item, 0, "the ERP ticks « sells » by default, and the till lists what sells"
		)
		self.assertEqual(item.is_purchase_item, 1)
		self.assertEqual(item.is_stock_item, 0, "no stock is kept")
		self.assertEqual(item.include_item_in_manufacturing, 0, "no manufacturing")
		self.assertEqual(item.is_restaurant_supply, 1, "it belongs to the restaurant's purchases")
		self.assertEqual(item.stock_uom, BOTTLE_UOM)
		# What the till lists is what sells (api/items.py: `is_sales_item = 1`): this article is not among it
		self.assertFalse(frappe.get_all("Item", filters={"name": code, "is_sales_item": 1}))

	def test_an_article_is_not_made_twice(self):
		code = self._item()
		frappe.set_user(OWNER)
		with self.assertRaises(frappe.ValidationError) as caught:
			supplies.create_supply_item(code, self.group, BOTTLE_UOM)
		self.assertIn(code, str(caught.exception))

	def test_a_manager_without_the_erp_rights_cannot_make_an_article(self):
		frappe.set_user(MANAGER_ONLY)
		with self.assertRaises(frappe.PermissionError):
			supplies.create_supply_item("_PNXT supplies refused", self.group, BOTTLE_UOM)
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("Item", "_PNXT supplies refused"))

	# -- the packaging, in the three fiches of the ERP -------------------------------------------------------------

	def test_a_pack_writes_the_unit_the_supplier_and_the_price(self):
		code = self._item()
		frappe.set_user(OWNER)
		done = self._pack(code)
		frappe.set_user("Administrator")
		item = frappe.get_doc("Item", code)
		self.assertEqual(
			[(row.uom, row.conversion_factor) for row in item.uoms if row.uom == PACK],
			[(PACK, 6)],
			"the packaging is a unit of the item, worth 6 of its stock unit",
		)
		self.assertTrue(frappe.db.get_value("UOM", PACK, "must_be_whole_number"), "a carton is counted whole")
		self.assertEqual(
			[(row.supplier, row.supply_uom, row.supplier_part_no) for row in item.supplier_items],
			[(SUPPLIER, PACK, "REF-6")],
			"the supplier's row says which packaging it sells: that link must not depend on a price being typed",
		)
		price = frappe.get_all(
			"Item Price",
			filters={"item_code": code, "supplier": SUPPLIER, "uom": PACK, "buying": 1},
			fields=["price_list", "price_list_rate"],
		)
		self.assertEqual(len(price), 1)
		self.assertEqual(price[0].price_list_rate, 52.5)
		self.assertEqual(done["price_list"], price[0].price_list)
		self.assertEqual(done["item"], code)
		self.assertEqual(done["uom"], PACK)

	def test_a_pack_played_again_writes_nothing_twice(self):
		code = self._item()
		frappe.set_user(OWNER)
		self._pack(code)
		self._pack(code, price=55)
		frappe.set_user("Administrator")
		item = frappe.get_doc("Item", code)
		self.assertEqual(len([row for row in item.uoms if row.uom == PACK]), 1)
		self.assertEqual(len(item.supplier_items), 1)
		prices = frappe.get_all(
			"Item Price",
			filters={"item_code": code, "supplier": SUPPLIER, "uom": PACK},
			fields=["price_list_rate"],
		)
		self.assertEqual([p.price_list_rate for p in prices], [55], "the price is updated, not added")

	def test_the_same_name_with_another_content_is_refused(self):
		code = self._item()
		frappe.set_user(OWNER)
		self._pack(code)
		with self.assertRaises(frappe.ValidationError) as caught:
			self._pack(code, content=12)
		self.assertIn(PACK, str(caught.exception))
		frappe.set_user("Administrator")
		item = frappe.get_doc("Item", code)
		self.assertEqual([row.conversion_factor for row in item.uoms if row.uom == PACK], [6])

	def test_a_pack_with_no_price_is_fine(self):
		code = self._item()
		frappe.set_user(OWNER)
		self._pack(code, price=None)
		frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.count("Item Price", {"item_code": code, "supplier": SUPPLIER}),
			0,
			"a price is optional: the owner who never types one is not asked for it",
		)
		rows = frappe.get_doc("Item", code).supplier_items
		self.assertEqual([(row.supplier, row.supply_uom) for row in rows], [(SUPPLIER, PACK)])

	def test_two_packs_at_one_supplier_are_two_rows(self):
		code = self._item()
		frappe.set_user(OWNER)
		self._pack(code)
		self._pack(code, pack_name="_PNXT Case of 12", content=12, price=None, supplier_part_no="REF-12")
		frappe.set_user("Administrator")
		rows = frappe.get_doc("Item", code).supplier_items
		self.assertEqual(
			sorted((row.supplier, row.supply_uom, row.supplier_part_no) for row in rows),
			sorted([(SUPPLIER, PACK, "REF-6"), (SUPPLIER, "_PNXT Case of 12", "REF-12")]),
		)

	def test_a_supplier_row_without_a_packaging_is_taken_over(self):
		code = self._item()
		frappe.set_user("Administrator")
		doc = frappe.get_doc("Item", code)
		doc.append("supplier_items", {"supplier": SUPPLIER})
		doc.save()
		frappe.set_user(OWNER)
		self._pack(code)
		frappe.set_user("Administrator")
		rows = frappe.get_doc("Item", code).supplier_items
		self.assertEqual(
			[(row.supplier, row.supply_uom) for row in rows], [(SUPPLIER, PACK)], "no second row"
		)

	def test_two_suppliers_sell_one_article(self):
		code = self._item()
		frappe.set_user(OWNER)
		self._pack(code)
		self._pack(code, supplier=OTHER_SUPPLIER, pack_name="_PNXT Case of 12", content=12, price=99)
		frappe.set_user("Administrator")
		item = frappe.get_doc("Item", code)
		self.assertEqual(
			sorted(row.supplier for row in item.supplier_items), sorted([SUPPLIER, OTHER_SUPPLIER])
		)
		self.assertEqual(
			sorted(row.uom for row in item.uoms if row.uom.startswith("_PNXT ") and row.uom != BOTTLE_UOM),
			sorted([PACK, "_PNXT Case of 12"]),
		)

	def test_the_usual_supplier_is_the_items_default_supplier(self):
		code = self._item()
		frappe.set_user(OWNER)
		self._pack(code, make_usual=1, company=self.company)
		frappe.set_user("Administrator")
		defaults = frappe.get_doc("Item", code).item_defaults
		self.assertEqual(
			[row.default_supplier for row in defaults if row.company == self.company],
			[SUPPLIER],
		)

	# -- who may do it ----------------------------------------------------------------------------------------------

	def test_a_refusal_writes_nothing(self):
		code = self._item()
		for user in (MANAGER_ONLY, PORTAL, "Guest"):
			frappe.set_user(user)
			with self.assertRaises(frappe.PermissionError, msg=user):
				self._pack(code, pack_name="_PNXT Refused pack")
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("UOM", "_PNXT Refused pack"), "no unit made by a refused call")
		item = frappe.get_doc("Item", code)
		self.assertFalse([row for row in item.uoms if row.uom == "_PNXT Refused pack"])
		self.assertFalse(item.supplier_items)
