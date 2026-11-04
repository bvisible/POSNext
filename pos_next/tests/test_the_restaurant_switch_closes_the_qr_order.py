# //// Neoffice — added file (no upstream equivalent).
"""The restaurant's switch closes the QR order on the server, and the QR menu says whether a dish is in stock, never how many.

The till hid its QR button when the restaurant switched QR ordering off, but the server took the order of any code still valid: a code printed or
stuck on a table outlives the switch, and every phone that scanned it could still send orders to the kitchen. The public menu carried the quantity
each stock dish had in the warehouse, which is the business's figure, not the guest's: the page only greys a dish out when there is none.

The guest acts as `Guest` (no account, no right); the test administrator only lays the table. The suite rolls back.
"""

import frappe

from pos_next.api import guest_ordering
from pos_next.tests.test_guest_account import GuestAccountCase


class TestTheSwitchClosesTheOrder(GuestAccountCase):
	def switch(self, **values):
		frappe.db.set_value("Restaurant", self.a, values)
		frappe.clear_document_cache("Restaurant")

	def test_a_restaurant_that_switched_qr_ordering_off_takes_no_order_from_a_code(self):
		self.switch(enable_qr_ordering=0)

		with self.assertRaises(frappe.ValidationError) as refused:
			self.order((self.cola, 1))

		self.assertEqual(str(refused.exception), frappe._("Ordering from the table's QR code is not enabled here."))
		self.assertFalse(frappe.db.get_value("Guest Order Token", self.token.name, "invoice"))

	def test_its_menu_still_shows(self):
		self.switch(enable_qr_ordering=0)

		menu = self.as_guest(guest_ordering.get_guest_menu, self.token.token)

		self.assertIn(self.cola, [dish["item_code"] for category in menu["categories"] for dish in category["menu_items"]])

	def test_with_the_switch_on_the_order_is_taken(self):
		answer = self.order((self.cola, 1))

		self.assertEqual(answer["status"], "sent_to_kitchen")

	def test_a_takeaway_session_takes_no_order_where_web_takeaway_is_off(self):
		self.switch(enable_web_takeaway=0)
		takeaway = frappe.get_doc(
			{"doctype": "Guest Order Token", "mode": "takeaway", "pos_profile": self.fx.profile}
		).insert(ignore_permissions=True)

		with self.assertRaises(frappe.ValidationError) as refused:
			self.as_guest(
				guest_ordering.submit_guest_order, takeaway.token, frappe.as_json([{"item_code": self.cola, "qty": 1}])
			)

		self.assertEqual(str(refused.exception), frappe._("Takeaway web ordering is not enabled."))
		self.assertFalse(frappe.db.get_value("Guest Order Token", takeaway.name, "invoice"))


class TestTheMenuSaysInStockNotHowMany(GuestAccountCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("Item", self.cola, "is_stock_item", 1)
		frappe.clear_document_cache("Item", self.cola)
		self.warehouse = frappe.db.get_value("POS Profile", self.fx.profile, "warehouse")

	def dish(self):
		menu = self.as_guest(guest_ordering.get_guest_menu, self.token.token)
		return next(dish for category in menu["categories"] for dish in category["menu_items"] if dish["item_code"] == self.cola)

	def test_a_dish_in_stock_says_so_and_not_its_quantity(self):
		frappe.get_doc(
			{"doctype": "Bin", "item_code": self.cola, "warehouse": self.warehouse, "actual_qty": 37}
		).insert(ignore_permissions=True)

		dish = self.dish()

		self.assertIs(dish["in_stock"], True)
		self.assertNotIn("actual_qty", dish)
		self.assertNotIn(37, [value for value in dish.values() if isinstance(value, int | float) and not isinstance(value, bool)])

	def test_a_dish_with_none_left_is_out_of_stock(self):
		dish = self.dish()

		self.assertIs(dish["in_stock"], False)
		self.assertNotIn("actual_qty", dish)
