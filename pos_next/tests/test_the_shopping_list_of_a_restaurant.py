# //// Neoffice — added file (no upstream equivalent).
"""The shopping list of a restaurant (NeoResto, purchases, lot B).

A list is the owner's own table of what he is going to buy: article lines (an article in a packaging at a supplier, as the ERP's
own fiches give them) and free lines (a text). It is grouped by supplier, each line goes from « to order / to buy » to « ordered /
bought » or is put aside, and the list works out an estimate that counts only the lines whose price is known and says on how many.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import shopping, supplies
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import (
	BOTTLE_UOM,
	MANAGER_ONLY,
	OWNER,
	OWNER_ROLES,
	PORTAL,
	_bottle_uom,
	_supplier,
	_user,
)
from pos_next.tests.test_till_writes_need_the_till import _company

CELLAR = "_PNXT shopping cellar"
MARKET = "_PNXT shopping market"
WHOLESALER = "_PNXT shopping wholesaler"
PACK = "_PNXT shop Carton of 6"
CRATE = "_PNXT shop Crate of 12"


class TestTheShoppingListOfARestaurant(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(MANAGER_ONLY, ("Restaurant Manager",))
		_user(PORTAL, (), user_type="Website User")
		for name in (CELLAR, MARKET, WHOLESALER):
			_supplier(name)
		_bottle_uom()
		cls.company = _company()
		cls.group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		frappe.db.set_value("Supplier", CELLAR, "order_mode", "Email")
		frappe.db.set_value("Supplier", MARKET, "order_mode", "On site")
		frappe.set_user(OWNER)
		# a wine from the cellar (usual) and from the wholesaler; a salad at the market with no price at all
		cls.wine = supplies.create_supply_item("_PNXT shop wine", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.wine, CELLAR, PACK, 6, 52.5, None, 1, cls.company)
		supplies.add_supply_pack(cls.wine, WHOLESALER, CRATE, 12, 99.0)
		cls.salad = supplies.create_supply_item("_PNXT shop salad", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.salad, MARKET, "_PNXT shop Crate of 4", 4, None, None, 1, cls.company)
		cls.pasta = supplies.create_supply_item("_PNXT shop pasta", cls.group, BOTTLE_UOM)
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def _new(self):
		frappe.set_user(OWNER)
		return shopping.new_list(self.company)

	def _lines(self, name):
		return frappe.get_doc("Restaurant Shopping List", name).lines

	# -- the list ----------------------------------------------------------------------------------------------------

	def test_a_list_starts_as_a_draft_of_the_company(self):
		name = self._new()
		doc = frappe.get_doc("Restaurant Shopping List", name)
		self.assertEqual((doc.status, doc.company, len(doc.lines)), ("Draft", self.company, 0))
		self.assertEqual(doc.estimated_total, 0)

	def test_an_article_goes_on_with_its_usual_supplier_packaging_and_price(self):
		name = self._new()
		shopping.add_article_line(name, self.wine, 2)
		(line,) = self._lines(name)
		self.assertEqual((line.supplier, line.uom, line.estimated_rate, line.qty), (CELLAR, PACK, 52.5, 2))
		self.assertEqual(line.line_state, "To order", "the cellar is ordered from by e-mail")

	def test_the_same_article_packaging_and_supplier_adds_up(self):
		name = self._new()
		shopping.add_article_line(name, self.wine, 1)
		shopping.add_article_line(name, self.wine, 2)
		(line,) = self._lines(name)
		self.assertEqual(line.qty, 3)

	def test_a_line_can_be_bought_elsewhere(self):
		name = self._new()
		row = shopping.add_article_line(name, self.wine, 1)
		shopping.change_supplier(name, row, WHOLESALER)
		(line,) = self._lines(name)
		self.assertEqual((line.supplier, line.uom, line.estimated_rate), (WHOLESALER, CRATE, 99.0))
		self.assertEqual(
			line.line_state, "To buy", "the wholesaler says nothing of how it is ordered from: on site"
		)
		shopping.change_supplier(name, row, MARKET)
		(line,) = self._lines(name)
		self.assertEqual(
			(line.supplier, line.estimated_rate or 0), (MARKET, 0), "no price where nobody has said one"
		)

	def test_an_article_with_no_packaging_yet_is_counted_in_its_own_unit(self):
		name = self._new()
		shopping.add_article_line(name, self.pasta, 3)
		(line,) = self._lines(name)
		self.assertEqual((line.supplier, line.uom), (None, BOTTLE_UOM))

	def test_a_free_line_is_a_text_and_a_quantity(self):
		name = self._new()
		shopping.add_free_line(name, "gift wrap", 3, "rolls", MARKET)
		(line,) = self._lines(name)
		self.assertEqual(
			(line.item, line.free_text, line.qty, line.unit_text, line.supplier),
			(None, "gift wrap", 3, "rolls", MARKET),
		)
		with self.assertRaises(frappe.ValidationError):
			shopping.add_free_line(name, "   ", 1)

	def test_a_line_holds_something(self):
		name = self._new()
		frappe.set_user("Administrator")
		doc = frappe.get_doc("Restaurant Shopping List", name)
		doc.append("lines", {"qty": 1})
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		doc = frappe.get_doc("Restaurant Shopping List", name)
		doc.append("lines", {"free_text": "x", "qty": 0})
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	# -- ticking and the estimate ------------------------------------------------------------------------------------

	def test_the_estimate_counts_only_the_lines_with_a_price_and_says_how_many(self):
		name = self._new()
		shopping.add_article_line(name, self.wine, 2)  # 2 x 52.5 = 105
		shopping.add_article_line(name, self.salad, 1)  # no price
		shopping.add_free_line(name, "gift wrap", 1)  # no price
		doc = frappe.get_doc("Restaurant Shopping List", name)
		self.assertEqual((doc.estimated_total, doc.priced_lines, doc.counted_lines), (105, 1, 3))

	def test_a_line_put_aside_is_in_no_count_and_no_estimate(self):
		name = self._new()
		wine_row = shopping.add_article_line(name, self.wine, 2)
		shopping.add_article_line(name, self.salad, 1)
		shopping.set_state(name, wine_row, "Already in stock")
		doc = frappe.get_doc("Restaurant Shopping List", name)
		self.assertEqual((doc.estimated_total, doc.priced_lines, doc.counted_lines), (0, 0, 1))

	def test_a_line_is_ticked_with_what_was_taken_and_paid(self):
		name = self._new()
		row = shopping.add_article_line(name, self.wine, 2)
		shopping.set_state(name, row, "Bought", taken_qty=1, paid_rate=49.8)
		(line,) = self._lines(name)
		self.assertEqual((line.line_state, line.taken_qty, line.paid_rate), ("Bought", 1, 49.8))
		with self.assertRaises(frappe.ValidationError):
			shopping.set_state(name, row, "Done")

	def test_a_quantity_changes_and_a_line_is_removed(self):
		name = self._new()
		row = shopping.add_article_line(name, self.wine, 1)
		shopping.set_quantity(name, row, 5)
		self.assertEqual(self._lines(name)[0].qty, 5)
		shopping.remove_line(name, row)
		self.assertEqual(len(self._lines(name)), 0)

	# -- grouped by supplier ------------------------------------------------------------------------------------------

	def test_the_list_is_grouped_by_supplier_with_the_unplaced_last(self):
		name = self._new()
		shopping.add_article_line(name, self.wine, 2)
		shopping.add_article_line(name, self.salad, 1)
		shopping.add_article_line(name, self.pasta, 1)
		frappe.set_user(OWNER)
		view = shopping.grouped(name)
		self.assertEqual([b["supplier"] for b in view["blocks"]], [CELLAR, MARKET, None])
		cellar = view["blocks"][0]
		self.assertEqual(
			(cellar["mode"], cellar["subtotal"], cellar["priced"], cellar["counted"]), ("Email", 105, 1, 1)
		)
		self.assertEqual(view["blocks"][1]["mode"], "On site")
		self.assertEqual((view["estimated_total"], view["priced_lines"], view["counted_lines"]), (105, 1, 3))

	# -- who may ------------------------------------------------------------------------------------------------------

	def test_a_visitor_and_a_portal_account_have_no_list(self):
		for user in ("Guest", PORTAL):
			frappe.set_user(user)
			with self.assertRaises(frappe.PermissionError, msg=user):
				shopping.new_list(self.company)

	def test_a_manager_without_the_erp_rights_keeps_a_list_of_free_lines_only(self):
		frappe.set_user(MANAGER_ONLY)
		name = shopping.new_list(self.company)
		shopping.add_free_line(name, "napkins", 2)
		with self.assertRaises(frappe.PermissionError):
			shopping.add_article_line(name, self.wine, 1)
