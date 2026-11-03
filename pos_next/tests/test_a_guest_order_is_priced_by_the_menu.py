# //// Neoffice — added file (no upstream equivalent).
"""A guest's QR order is priced by the menu, on the server (maintenance#2198).

The page adds up the price of a line in the browser (the dish's price, or its discounted price, plus the price of its options) and sent it as `rate`;
the server wrote it as sent, so whoever held the token of a table could order a dish at 0.05, or a line of -2 dishes that took two off the bill.
The server now prices each line by the menu it serves the page (`get_guest_menu`), refuses a dish the menu does not offer and an option the dish does
not have, and takes a whole number of dishes, at least one. A refused order writes nothing.

The guest acts as `Guest` (no account, no right); the test administrator only lays the table. The suite rolls back.
"""

import json

import frappe
from frappe.tests.roles import as_role

from pos_next.api import guest_ordering
from pos_next.tests.test_service_families import ServiceCase

CARD_PRICE = 4.5
OPTIONS = "_Test Guest Price Options"


class TestAGuestOrderIsPricedByTheMenu(ServiceCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value(
			"Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": "Direct to Kitchen"}
		)
		self.on_the_guest_menu(self.a, self.cola, self.soup, price=CARD_PRICE)
		frappe.get_doc(
			{
				"doctype": "Product Option Group",
				"group_name": OPTIONS,
				"selection_type": "Multiple",
				"applicable_items": [{"item": self.cola}],
				"options": [
					{"option_name": "Ice", "price_adjustment": 0.5},
					{"option_name": "Lemon", "price_adjustment": 1},
				],
			}
		).insert(ignore_permissions=True)
		self.token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_a,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)

	def order(self, *lines):
		with as_role("Guest"):
			return guest_ordering.submit_guest_order(self.token.token, json.dumps(list(lines)))

	def refused(self, *lines):
		with self.assertRaises(frappe.ValidationError) as refusal:
			self.order(*lines)
		self.assertFalse(
			frappe.db.get_value("Guest Order Token", self.token.name, "invoice"),
			"a refused order wrote an invoice",
		)
		return str(refusal.exception)

	def rows(self, invoice):
		return frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": invoice},
			fields=["item_code", "qty", "rate"],
			order_by="idx asc",
		)

	def test_a_line_sent_at_five_cents_is_written_at_the_price_of_the_card(self):
		answer = self.order(
			{"item_code": self.cola, "qty": 2, "rate": 0.05}, {"item_code": self.soup, "qty": 1, "price": 0}
		)

		self.assertEqual(
			[(r.item_code, r.qty, r.rate) for r in self.rows(answer["invoice"])],
			[(self.cola, 2, CARD_PRICE), (self.soup, 1, CARD_PRICE)],
		)

	def test_the_order_is_priced_as_the_page_shows_the_menu(self):
		with as_role("Guest"):
			menu = guest_ordering.get_guest_menu(self.token.token)
		shown = {
			dish["item_code"]: dish["price"]
			for category in menu["categories"]
			for dish in category["menu_items"]
		}

		answer = self.order({"item_code": self.cola, "qty": 1})

		self.assertEqual(self.rows(answer["invoice"])[0].rate, shown[self.cola])

	def test_an_option_costs_what_the_card_says_whatever_the_page_sends(self):
		lemon = {
			"group": OPTIONS,
			"group_name": OPTIONS,
			"option": "Lemon",
			"option_name": "Lemon",
			"additional_price": 99,
		}
		ice = {"group_name": OPTIONS, "option_name": "Ice", "additional_price": -4}

		answer = self.order({"item_code": self.cola, "qty": 1, "rate": 0.05, "modifiers": [lemon, ice]})

		self.assertEqual(self.rows(answer["invoice"])[0].rate, CARD_PRICE + 1 + 0.5)

	def test_an_option_the_dish_does_not_have_is_refused(self):
		for modifier in (
			{"group_name": OPTIONS, "option_name": "Gold leaf", "additional_price": 0},
			{"group_name": "_Test Another Group", "option_name": "Ice"},
			"Ice",
		):
			with self.subTest(modifier=modifier):
				self.refused({"item_code": self.cola, "qty": 1, "modifiers": [modifier]})
		# Nor does the soup have the cola's options
		self.refused(
			{"item_code": self.soup, "qty": 1, "modifiers": [{"group_name": OPTIONS, "option_name": "Ice"}]}
		)

	def test_a_dish_the_menu_does_not_offer_is_refused_and_nothing_is_written(self):
		message = self.refused(
			{"item_code": self.cola, "qty": 1}, {"item_code": self.gum, "qty": 1, "rate": 0.05}
		)

		self.assertIn(frappe.db.get_value("Item", self.gum, "item_name"), message)

	def test_a_quantity_below_one_or_in_parts_is_refused(self):
		for qty in (-2, 0, 0.5, 1.5):
			with self.subTest(qty=qty):
				self.refused({"item_code": self.cola, "qty": 1}, {"item_code": self.soup, "qty": qty})
