# //// Neoffice — added file (no upstream equivalent).
"""The till's barcode scan sells what the till's grid sells, nothing else (neoffice-maintenance#2219).

A code scanned at the till (`search_by_barcode`) was checked for `is_sales_item` only: the scan found, and the till rang up,
a disabled item, an internal one (`is_internal_item`, the items code adds by itself, such as the tip) and an item outside
the item groups the till's POS Profile names. The grid leaves all three out (`_build_item_base_conditions`); the scan now
answers for them as for an unknown code, and an item of the till scans as before.

The cashier scans, at her till; the test administrator only lays the till and its items. The suite rolls back.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils.nestedset import get_root_of

from pos_next.api import items
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

OTHER_GROUP = "_PNXT scan other group"


class TestTheTillsScanSellsWhatItsGridSells(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		# The fixture lays two tills, each assigned to its cashier
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, [CASHIER_ROLE], "System User")
		self.fx = _till_fixture()
		self.group = frappe.db.get_value("Item", self.fx.item, "item_group")
		self.warehouse = frappe.db.get_value("POS Profile", self.fx.profile, "warehouse")
		self.give_a_barcode(self.fx.item, "PNXT-SCAN-OF-THE-TILL")

	def tearDown(self):
		self.forget_the_tills_scope()

	def forget_the_tills_scope(self):
		frappe.cache().delete_value(f"pos_profile_allowed_item_groups:{self.fx.profile}")

	def give_a_barcode(self, item_code, barcode):
		if frappe.db.exists("Item Barcode", {"barcode": barcode}):
			return
		item = frappe.get_doc("Item", item_code)
		item.append("barcodes", {"barcode": barcode})
		item.save(ignore_permissions=True)

	def an_item(self, item_code, barcode, item_group=None, **fields):
		"""An item of the till's company with `barcode`, like the till's own item but for `fields`."""
		if not frappe.db.exists("Item", item_code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": item_code,
					"item_name": item_code,
					"item_group": item_group or self.group,
					"stock_uom": frappe.db.get_value("Item", self.fx.item, "stock_uom"),
					"is_stock_item": 0,
					"is_sales_item": 1,
					"barcodes": [{"barcode": barcode}],
					# Its own row, as the fixture's item: an item group's defaults may list a company twice
					"item_defaults": [{"company": self.fx.company, "default_warehouse": self.warehouse}],
				}
			).insert(ignore_permissions=True)
		if fields:
			frappe.db.set_value("Item", item_code, fields)
			frappe.clear_document_cache("Item", item_code)
		return item_code

	def the_till_names_its_group(self):
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("item_groups", {"item_group": self.group})
		profile.save(ignore_permissions=True)
		self.forget_the_tills_scope()

	def scanned(self, barcode):
		frappe.set_user(TILL)
		try:
			return items.search_by_barcode(barcode, self.fx.profile)
		finally:
			frappe.set_user("Administrator")

	def test_an_item_of_the_till_scans(self):
		self.the_till_names_its_group()

		found = self.scanned("PNXT-SCAN-OF-THE-TILL")

		self.assertEqual(found["item_code"], self.fx.item)

	def test_a_disabled_item_reads_as_an_unknown_code(self):
		self.an_item("_PNXT scan disabled", "PNXT-SCAN-DISABLED", disabled=1)

		self.assertIsNone(self.scanned("PNXT-SCAN-DISABLED"))

	def test_an_internal_item_reads_as_an_unknown_code(self):
		if not frappe.db.has_column("Item", "is_internal_item"):
			self.skipTest("no internal items on a site without the theme")
		self.an_item("_PNXT scan internal", "PNXT-SCAN-INTERNAL", is_internal_item=1)

		self.assertIsNone(self.scanned("PNXT-SCAN-INTERNAL"))

	def test_an_item_outside_the_tills_groups_reads_as_an_unknown_code(self):
		if not frappe.db.exists("Item Group", OTHER_GROUP):
			frappe.get_doc(
				{
					"doctype": "Item Group",
					"item_group_name": OTHER_GROUP,
					"parent_item_group": get_root_of("Item Group"),
					"is_group": 0,
				}
			).insert(ignore_permissions=True)
		self.an_item("_PNXT scan other shop", "PNXT-SCAN-OTHER-SHOP", item_group=OTHER_GROUP)
		self.the_till_names_its_group()

		self.assertIsNone(self.scanned("PNXT-SCAN-OTHER-SHOP"))
		self.assertEqual(self.scanned("PNXT-SCAN-OF-THE-TILL")["item_code"], self.fx.item)

	def test_a_till_that_names_no_group_sells_every_group(self):
		self.an_item("_PNXT scan any group", "PNXT-SCAN-ANY-GROUP")

		self.assertEqual(self.scanned("PNXT-SCAN-ANY-GROUP")["item_code"], "_PNXT scan any group")
