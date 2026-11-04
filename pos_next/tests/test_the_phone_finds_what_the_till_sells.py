# //// Neoffice — added file (no upstream equivalent).
"""The barcode lookup of the till is shared with the shop scan, and a phone sees only what a customer may see.

`items.find_item_by_barcode` is the till's lookup without its guard: the till's endpoint keeps the guard, the shop scan
calls it for a customer's phone as the system. The phone is given the item's code, name, picture, unit and price, whether
a seller checks it at the counter (its own tick, or its group's or a parent group's) and whether the code carries a weight
or a price of its own: never the stock, the batches, the accounts nor the taxes.
"""

import frappe

from pos_next.api import items
from pos_next.shop_scan.catalogue import needs_counter_validation, public_item
from pos_next.tests.shop_scan_case import PRICE, ShopCase


class TestThePhoneFindsWhatTheTillSells(ShopCase):
	def a_group(self, name, parent, is_group=0, **fields):
		if not frappe.db.exists("Item Group", name):
			frappe.get_doc(
				{
					"doctype": "Item Group",
					"item_group_name": name,
					"parent_item_group": parent,
					"is_group": is_group,
					**fields,
				}
			).insert(ignore_permissions=True)
		return name

	def test_the_phone_sees_no_stock_nor_accounts(self):
		item = public_item(items.find_item_by_barcode("PNXT-SHOP-A", self.fx.profile))

		self.assertEqual(
			set(item),
			{
				"item_code",
				"item_name",
				"image",
				"uom",
				"price_list_rate",
				"needs_validation",
				"priced_by_barcode",
			},
		)
		self.assertEqual((item["item_code"], item["price_list_rate"]), (self.fx.item, PRICE))
		self.assertFalse(item["needs_validation"])
		self.assertFalse(item["priced_by_barcode"])

	def test_a_group_that_needs_the_counter_passes_it_to_its_sub_groups(self):
		from frappe.utils.nestedset import get_root_of

		parent = self.a_group(
			"_PNXT shop checked", get_root_of("Item Group"), is_group=1, requires_counter_validation=1
		)
		child = self.a_group("_PNXT shop checked child", parent)
		in_the_child = self.an_item("_PNXT shop checked article", "PNXT-SHOP-CHECKED", item_group=child)
		ticked = self.an_item("_PNXT shop ticked article", "PNXT-SHOP-TICKED", requires_counter_validation=1)

		self.assertTrue(needs_counter_validation(in_the_child))
		self.assertTrue(needs_counter_validation(ticked))
		self.assertFalse(needs_counter_validation(self.fx.item))

	def test_the_till_still_scans_its_items(self):
		found = self.as_cashier(items.search_by_barcode, "PNXT-SHOP-A", self.fx.profile)

		self.assertEqual(found["item_code"], self.fx.item)
