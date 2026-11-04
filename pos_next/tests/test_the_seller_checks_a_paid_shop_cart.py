# //// Neoffice — added file (no upstream equivalent).
"""The seller checks a cart paid on the phone and validates it (scan in the shop, lot 4, board 8 of the canvas).

All there, the sale is submitted as it was paid, nothing to take, the phone's session closed. A paid article that is missing
is taken off and refunded on the payment it was paid by, before the sale is submitted; a refund the provider refuses leaves
the cart paid and unsold. An article found in the bag is sold by the till's payment, which keeps the phone's money. Each
difference is written on the sale. An unpaid cart is sold by the till's payment, not validated; a portal account, a visitor
and a desk account of no till are refused.
"""

import json
from unittest.mock import patch

import frappe
from frappe.utils import flt

from pos_next.api import invoices, shop_scan
from pos_next.tests.shop_scan_paid_case import PaidCase
from pos_next.tests.test_till_writes_need_the_till import _sale, _user

PORTAL = "shop-check-portal@yopmail.com"
DESK = "shop-check-desk@yopmail.com"


def _comments(invoice):
	return frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Sales Invoice", "reference_name": invoice, "comment_type": "Comment"},
		pluck="content",
	)


class TestTheSellerChecksAPaidShopCart(PaidCase):
	def validate(self, code, missing=None, user=None):
		return self.as_cashier(
			shop_scan.validate_shop_cart,
			code,
			self.fx.profile,
			json.dumps(missing) if missing else None,
			**({"user": user} if user else {}),
		)

	def test_all_there_the_sale_is_submitted_as_paid(self):
		token, cart = self.a_paid_cart(2)

		answer = self.validate(cart["code"])

		sale = frappe.get_doc("Sales Invoice", answer["invoice"])
		self.assertEqual(
			(sale.docstatus, flt(sale.paid_amount), answer["refunded"]), (1, cart["grand_total"], 0)
		)
		self.assertEqual(sale.name, self.session_of(token).invoice)
		self.assertEqual(self.session_of(token).cart_status, "Checked")
		self.assertEqual(_comments(sale.name), [])
		# The phone says it is validated
		self.assertEqual(self.as_guest(shop_scan.get_shop_cart, token)["status"], "Checked")

	def test_a_missing_article_is_refunded_on_its_payment_then_the_sale_submitted(self):
		token, cart = self.a_paid_cart(2)
		line = cart["lines"][0]

		with patch("payments.api.intent.refund_intent") as refund:
			answer = self.validate(cart["code"], missing=[{"line": line["line"], "qty": 1}])

		sale = frappe.get_doc("Sales Invoice", answer["invoice"])
		self.assertEqual(answer["refunded"], line["rate"])
		self.assertEqual(refund.call_args.args[1], round(line["rate"] * 100))
		self.assertEqual(
			(sale.docstatus, sale.items[0].qty, flt(sale.paid_amount)),
			(1, 1, flt(cart["grand_total"] - line["rate"])),
		)
		self.assertEqual(len(_comments(sale.name)), 1)
		self.assertIn("missing, refunded", _comments(sale.name)[0])

	def test_a_refund_the_provider_refuses_leaves_the_cart_paid_and_unsold(self):
		token, cart = self.a_paid_cart(2)

		with patch("payments.api.intent.refund_intent", side_effect=frappe.ValidationError("refused")):
			with self.assertRaises(frappe.ValidationError):
				self.validate(cart["code"], missing=[{"line": cart["lines"][0]["line"], "qty": 1}])

		self.assertEqual(self.the_draft(token).docstatus, 0)
		self.assertEqual(self.session_of(token).cart_status, "Paid")

	def test_an_article_found_in_the_bag_is_sold_by_the_tills_payment_with_the_phones_money_kept(self):
		token, cart = self.a_paid_cart(1)
		draft = self.the_draft(token)
		extra = self.an_item("_PNXT shop check extra", "PNXT-SHOP-X", price=5)
		lines = [
			{
				"item_code": row.item_code,
				"qty": row.qty,
				"rate": row.rate,
				"price_list_rate": row.price_list_rate,
			}
			for row in draft.items
		] + [{"item_code": extra, "qty": 1, "rate": 5, "price_list_rate": 5}]
		# The phone's money is booked under the payment page's mode: the till sends its own cash row for the rest
		sale = _sale(
			self.fx, name=draft.name, items=lines, payments=[{"mode_of_payment": self.fx.mode, "amount": 5}]
		)

		saved = self.as_cashier(invoices.update_invoice, json.dumps(sale))
		self.as_cashier(
			invoices.submit_invoice, invoice=json.dumps({**sale, "name": saved["name"]}), data="{}"
		)

		sold = frappe.get_doc("Sales Invoice", draft.name)
		self.assertEqual(sold.docstatus, 1)
		self.assertEqual(
			sorted((row.mode_of_payment, flt(row.amount)) for row in sold.payments if flt(row.amount) > 0),
			sorted([(self.web_mode, cart["grand_total"]), (self.fx.mode, 5)]),
		)
		self.assertIn("added at the counter", _comments(sold.name)[0])
		self.assertEqual(self.session_of(token).cart_status, "Checked")

	def test_the_rest_paid_by_the_phones_own_mode_keeps_the_phones_payment(self):
		# The phone's card money is booked under the mode the till pays the rest by card with: both stay on the sale
		token, cart = self.a_paid_cart(1)
		draft = self.the_draft(token)
		extra = self.an_item("_PNXT shop check extra", "PNXT-SHOP-X", price=5)
		lines = [
			{
				"item_code": row.item_code,
				"qty": row.qty,
				"rate": row.rate,
				"price_list_rate": row.price_list_rate,
			}
			for row in draft.items
		] + [{"item_code": extra, "qty": 1, "rate": 5, "price_list_rate": 5}]
		sale = _sale(
			self.fx, name=draft.name, items=lines, payments=[{"mode_of_payment": self.web_mode, "amount": 5}]
		)

		saved = self.as_cashier(invoices.update_invoice, json.dumps(sale))
		self.as_cashier(
			invoices.submit_invoice, invoice=json.dumps({**sale, "name": saved["name"]}), data="{}"
		)

		sold = frappe.get_doc("Sales Invoice", draft.name)
		self.assertEqual(
			sorted(flt(row.amount) for row in sold.payments if flt(row.amount) > 0),
			sorted([cart["grand_total"], 5]),
		)
		self.assertEqual(flt(sold.paid_amount), flt(cart["grand_total"] + 5))

	def test_an_unpaid_cart_is_not_validated(self):
		token = self.a_session()
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", 1)
		phone = self.as_guest(shop_scan.finish_shop_cart, token)

		with self.assertRaises(frappe.ValidationError):
			self.validate(phone["code"])
		self.assertEqual(self.the_draft(token).docstatus, 0)

	def test_a_portal_account_a_visitor_and_a_desk_account_of_no_till_are_refused(self):
		_token, cart = self.a_paid_cart(1)
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")

		for user in (PORTAL, "Guest", DESK):
			with self.subTest(user=user):
				with self.assertRaises(frappe.PermissionError):
					self.validate(cart["code"], user=user)
