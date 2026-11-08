# //// Neoffice — added file (no upstream equivalent).
"""A table's payment from the QR page is booked by what the payment provider settled, never by what the page says (maintenance#1973).

`confirm_guest_payment` is public: the page calls it when the guest comes back from the payment page, with the amount and the tip it says were
paid. It booked them as a payment of the table's order, submitted the order once the total was reached and marked the table paid, without asking
the provider whether anything was charged, nor how much. It now books each Payment Intent of the order the provider settled, once, for what it
settled and the tip it was created with; the page is told to wait while the payment it came back from is not settled yet.

The guest acts as `Guest`; the test administrator lays the table and stands for the provider (a Payment Intent the `payments` app marks settled on
the provider's word). The suite rolls back.
"""

import frappe
from frappe.utils import flt

from pos_next.api import guest_ordering
from pos_next.tests.test_guest_account import GuestAccountCase

TIP_ITEM = "_Test Guest Tip"


class PaymentCase(GuestAccountCase):
	def setUp(self):
		super().setUp()
		if not frappe.db.exists("Item", TIP_ITEM):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": TIP_ITEM,
					"item_name": TIP_ITEM,
					"item_group": frappe.db.get_value("Item", self.cola, "item_group"),
					"stock_uom": frappe.db.get_value("Item", self.cola, "stock_uom"),
					"is_stock_item": 0,
				}
			).insert(ignore_permissions=True)
		frappe.db.set_value("Restaurant", self.a, {"enable_tips": 1, "tip_item": TIP_ITEM})
		frappe.clear_document_cache("Restaurant")
		# A cola and a soup: 10.00
		self.invoice = self.order((self.cola, 1), (self.soup, 1))["invoice"]

	def the_provider(self, amount, status="succeeded", tip=0, invoice=None):
		"""A payment of the order as the provider reports it: `amount` charged (with the tip), its state."""
		return frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": status,
				"amount": round(amount * 100),
				"currency": frappe.db.get_value("Sales Invoice", self.invoice, "currency"),
				"reference_doctype": "Sales Invoice",
				"reference_name": invoice or self.invoice,
				"metadata_json": frappe.as_json({"tip": tip}),
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

	def confirm(self, amount, tip=0):
		return self.as_guest(guest_ordering.confirm_guest_payment, self.token.token, amount, tip)

	def the_order(self):
		return frappe.db.get_value("Sales Invoice", self.invoice, ["docstatus", "paid_amount", "grand_total"], as_dict=True)

	def tips(self):
		return frappe.get_all("Restaurant Tip", filters={"sales_invoice": self.invoice}, pluck="amount")

	def dishes(self, status):
		"""The kitchen's state of every line of the order (the guest's order goes to the kitchen as it is placed)."""
		for row in frappe.get_all("Sales Invoice Item", filters={"parent": self.invoice}, pluck="name"):
			frappe.db.set_value("Sales Invoice Item", row, "kds_status", status, update_modified=False)

	def table_status(self):
		return frappe.db.get_value("Restaurant Table", self.table_a, "status")


class TestThePagesWordIsNotAPayment(PaymentCase):
	def test_a_return_with_no_payment_at_the_provider_books_nothing(self):
		answer = self.confirm(10)

		self.assertEqual(answer["status"], "awaiting_payment")
		self.assertEqual((self.the_order().docstatus, self.the_order().paid_amount), (0, 0))
		self.assertNotEqual(frappe.db.get_value("Restaurant Table", self.table_a, "status"), "Paid")

	def test_a_payment_the_provider_has_not_settled_yet_books_nothing(self):
		self.the_provider(10, status="processing")

		answer = self.confirm(10)

		self.assertEqual(answer["status"], "awaiting_payment")
		self.assertEqual(self.the_order().paid_amount, 0)

	def test_a_payment_that_failed_is_said_failed_and_books_nothing(self):
		self.the_provider(10, status="failed")

		answer = self.confirm(10)

		self.assertEqual(answer["status"], "failed")
		self.assertEqual((self.the_order().docstatus, self.the_order().paid_amount), (0, 0))

	def test_the_amount_booked_is_the_one_the_provider_settled(self):
		self.the_provider(4)

		answer = self.confirm(10)

		self.assertEqual(answer["status"], "success")
		self.assertFalse(answer["submitted"])
		self.assertEqual((self.the_order().docstatus, self.the_order().paid_amount), (0, 4))

	def test_a_payment_of_another_order_is_not_booked_on_this_one(self):
		self.the_provider(10, invoice="_Test another order")

		answer = self.confirm(10)

		self.assertEqual(answer["status"], "awaiting_payment")
		self.assertEqual(self.the_order().paid_amount, 0)


class TestASettledPayment(PaymentCase):
	def test_the_whole_order_settled_is_submitted_and_its_table_follows_the_rule_of_every_payment(self):
		# Everything is out: the bill settled leaves a table to clean, as the same bill paid at the till does (08.11.2026: « Paid » was written whatever the kitchen held)
		self.dishes("Delivered")
		self.the_provider(10)

		answer = self.confirm(0.05)

		self.assertTrue(answer["submitted"])
		self.assertEqual((self.the_order().docstatus, self.the_order().paid_amount), (1, 10))
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "status"), "Cleaning")

	def test_two_payments_of_a_shared_bill_submit_it_at_the_second(self):
		self.the_provider(6)
		self.assertFalse(self.confirm(6)["submitted"])

		self.the_provider(4)
		answer = self.confirm(4)

		self.assertTrue(answer["submitted"])
		self.assertEqual((self.the_order().docstatus, self.the_order().paid_amount), (1, 10))

	def test_the_tip_is_the_one_the_payment_carried_not_the_pages(self):
		self.the_provider(12, tip=2)

		self.confirm(12, tip=99)

		order = self.the_order()
		self.assertEqual((order.docstatus, order.paid_amount, order.grand_total), (1, 12, 12))
		self.assertEqual(self.tips(), [2])
		self.assertEqual(
			frappe.db.get_value("Sales Invoice Item", {"parent": self.invoice, "item_code": TIP_ITEM}, "rate"), 2
		)

	def test_a_tip_is_never_more_than_the_payment(self):
		self.the_provider(4, tip=50)

		self.confirm(4)

		self.assertEqual(self.tips(), [4])

	def test_asking_again_books_nothing_twice(self):
		self.the_provider(6, tip=1)

		for _ in range(3):
			self.confirm(6, tip=1)

		order = self.the_order()
		self.assertEqual(order.paid_amount, 6)
		self.assertEqual(self.tips(), [1])
		self.assertEqual(frappe.db.count("Sales Invoice Payment", {"parent": self.invoice, "amount": [">", 0]}), 1)


class TestWhatThePaidTableBecomes(PaymentCase):
	"""« Une table payée n'est pas une table où les gens sont partis » (product owner, 08.11.2026): a guest who pays from the QR page before the plates are out is still at the table."""

	def test_a_table_paid_while_a_dish_is_at_the_kitchen_stays_seated(self):
		self.dishes("Pending")
		self.the_provider(10)

		answer = self.confirm(10)

		self.assertTrue(answer["submitted"])
		self.assertEqual(self.table_status(), "Occupied")

	def test_a_dish_ready_at_the_pass_keeps_it_seated_too(self):
		self.dishes("Ready")
		self.the_provider(10)

		self.confirm(10)

		self.assertEqual(self.table_status(), "Occupied")

	def test_the_last_delivery_of_a_table_paid_by_its_guest_sends_it_to_cleaning(self):
		from pos_next.restaurant import paid_orders

		self.dishes("Pending")
		self.the_provider(10)
		self.confirm(10)
		self.assertEqual(self.table_status(), "Occupied")

		self.dishes("Delivered")
		released = paid_orders.release_when_served(self.invoice)

		self.assertTrue(released)
		self.assertEqual(self.table_status(), "Cleaning")

	def test_a_bill_paid_in_part_leaves_the_order_open_and_the_table_seated(self):
		self.dishes("Delivered")
		self.the_provider(4)

		answer = self.confirm(4)

		self.assertFalse(answer["submitted"])
		self.assertEqual(self.the_order().docstatus, 0)
		self.assertNotEqual(self.table_status(), "Cleaning")

	def test_the_summary_of_the_floor_says_a_table_is_paid_with_the_dishes_left_to_serve(self):
		from pos_next.api import restaurant as restaurant_api

		self.dishes("Pending")
		self.the_provider(10)
		self.confirm(10)

		tiles = {row["name"]: row for row in restaurant_api.get_tables(restaurant=self.a)["tables"]}
		summary = tiles[self.table_a]["order_summary"]

		self.assertEqual(tiles[self.table_a]["status"], "Occupied")
		self.assertTrue(summary["paid"])
		self.assertGreaterEqual(summary["item_count"], 1)


class TestWhatThePageMayAskToPay(PaymentCase):
	def ask(self, amount, tip=0):
		with self.assertRaises(frappe.ValidationError) as refused:
			self.as_guest(guest_ordering.create_guest_payment, self.token.token, amount, None, tip)
		return str(refused.exception)

	def test_a_tip_below_zero_or_the_whole_payment_is_refused(self):
		for tip in (-5, 10):
			with self.subTest(tip=tip):
				self.assertEqual(self.ask(10, tip), frappe._("The tip cannot be negative, nor the whole payment."))

	def test_more_than_the_order_owes_is_refused(self):
		self.assertEqual(self.ask(25), frappe._("This payment is more than the order still owes."))

	def test_what_was_paid_is_not_owed_again(self):
		self.the_provider(6)
		self.confirm(6)

		self.assertEqual(self.ask(5), frappe._("This payment is more than the order still owes."))
		self.assertEqual(flt(guest_ordering._still_owed(frappe.get_doc("Sales Invoice", self.invoice), TIP_ITEM)), 4)
