# //// Neoffice — added file (no upstream equivalent).
"""A cart paid on the phone is paid on the provider's word, and waits for its check at the counter (scan in the shop, lot 4).

The page coming back from the payment page is told to wait while the provider has not settled, and that the payment failed
when it failed; nothing is booked on its word. Settled, the money is booked once on the draft, which is NOT submitted: the
cart is « paid », keeps the lines it was paid for and the amount the phone showed (the till's offer under it), takes no more
scan, outlives its session's lifetime, is listed at the till as paid and is never purged. A page that never comes back is
booked by the intent's own update.
"""

import json
from unittest.mock import patch

import frappe
from frappe.utils import add_to_date, flt, now_datetime

from pos_next.api import shop_scan
from pos_next.shop_scan import payment, purge
from pos_next.tests.shop_scan_paid_case import PaidCase


class TestAPaidShopCartWaitsForItsCheck(PaidCase):
	def confirm(self, token):
		return self.as_guest(shop_scan.confirm_shop_payment, token)

	def test_no_payment_at_the_provider_is_awaited_and_books_nothing(self):
		token, _cart = self.a_cart()
		self.assertEqual(self.confirm(token)["status"], "awaiting_payment")

		self.the_provider(token, status="processing")
		self.assertEqual(self.confirm(token)["status"], "awaiting_payment")
		self.assertEqual(flt(self.the_draft(token).paid_amount), 0)

	def test_a_payment_that_failed_is_said_failed(self):
		token, _cart = self.a_cart()
		self.the_provider(token, status="failed")

		answer = self.confirm(token)

		self.assertEqual(answer["status"], "failed")
		self.assertNotEqual(self.session_of(token).cart_status, "Paid")

	def test_settled_the_cart_is_paid_and_waits_for_its_check_at_the_phones_amount(self):
		frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": "_Test Shop Paid Offer",
				"selling": 1,
				"company": self.fx.company,
				"currency": frappe.get_cached_value("Company", self.fx.company, "default_currency"),
				"valid_from": frappe.utils.nowdate(),
				"apply_on": "Item Code",
				"items": [{"item_code": self.fx.item}],
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Percentage",
				"discount_percentage": 10,
			}
		).insert(ignore_permissions=True)
		token, phone = self.a_cart(2)
		self.the_provider(token)

		answer = self.confirm(token)

		draft = self.the_draft(token)
		self.assertEqual(answer["status"], "paid")
		self.assertEqual(answer["cart"]["status"], "Paid")
		self.assertEqual(
			(draft.docstatus, flt(draft.grand_total), flt(draft.paid_amount)),
			(0, phone["grand_total"], phone["grand_total"]),
		)
		self.assertEqual([(row.qty, row.rate) for row in draft.items], [(2, 9)])
		session = self.session_of(token)
		self.assertEqual([(line["qty"], line["rate"]) for line in json.loads(session.paid_lines)], [(2, 9)])
		with self.assertRaises(frappe.ValidationError):
			self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)

	def test_the_money_is_booked_once(self):  # role-check: ok the system's background booking
		token, _cart = self.a_cart()
		self.the_provider(token)

		self.confirm(token)
		self.confirm(token)
		payment.book(self.session_of(token).invoice)

		self.assertEqual(len([row for row in self.the_draft(token).payments if flt(row.amount) > 0]), 1)

	def test_a_page_that_never_comes_back_is_booked(self):  # role-check: ok the system's background booking
		token, _cart = self.a_cart()

		with patch("frappe.enqueue") as enqueue:
			intent = self.the_provider(token)
			payment.book_on_payment(intent)
		self.assertEqual(enqueue.call_args.kwargs["invoice"], self.the_draft(token).name)

		payment.book_in_the_background(self.the_draft(token).name)
		self.assertEqual(self.session_of(token).cart_status, "Paid")

	def test_a_paid_cart_outlives_its_session_is_listed_paid_and_is_never_purged(self):
		token, _cart = self.a_paid_cart()
		session = self.session_of(token)
		self.assertGreater(session.expires_at, add_to_date(now_datetime(), hours=3))
		frappe.db.set_value(
			"Guest Order Token", session.name, "expires_at", add_to_date(now_datetime(), hours=-1)
		)
		frappe.db.sql(
			"update `tabSales Invoice` set modified = %s where name = %s",
			(add_to_date(now_datetime(), days=-3), session.invoice),
		)

		listed = self.as_cashier(shop_scan.list_shop_carts, self.fx.profile)
		purge.purge_abandoned_carts()

		self.assertEqual([(cart["status"], cart["paid_amount"] > 0) for cart in listed], [("Paid", True)])
		self.assertTrue(frappe.db.exists("Sales Invoice", session.invoice))

	def test_the_till_takes_a_paid_cart_over_as_paid(self):
		token, cart = self.a_paid_cart()

		opened = self.as_cashier(shop_scan.open_shop_cart, cart["code"], self.fx.profile)

		self.assertEqual((opened["status"], opened["paid_amount"]), ("Paid", cart["grand_total"]))
		self.assertEqual(self.session_of(token).cart_status, "Paid")
