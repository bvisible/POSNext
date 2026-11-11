# //// Neoffice — added file (no upstream equivalent).
"""A table or a takeaway order costs on the phone what the till takes for it: its total rounded as the till rounds it (maintenance#2254).

The till rounds a sale to the currency's smallest coin (CHF 0.05) unless its profile disables the rounding; the scan in the shop
was corrected so (test_a_shop_cart_costs_what_the_till_takes_rounded). The QR of the restaurant kept counting the exact total: an
order of 9.98 was 9.98 on the phone and 10.00 at the till. It now owes, shows and asks the provider for the rounded total; a payment
of that total settles the order with nothing left owed, and a till that does not round keeps the exact total.

The guest acts as `Guest`; the test administrator lays the table and stands for the provider. The suite rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.utils import flt

from pos_next.api import guest_ordering
from pos_next.tests.test_a_guest_payment_is_booked_by_the_provider import PaymentCase
from pos_next.tests.test_a_takeaway_order_goes_to_the_end import TakeawayCase

ODD = 4.98  # a cola at 4.98 and a soup at 5.00: 9.98, 10.00 at the till
EXACT, ROUNDED = 9.98, 10.0
INTENT = {
	"status": "requires_action",
	"next_action_payload": {"url": "https://pay.example/x"},
	"provider_intent_id": "x",
	"intent_name": "PI-x",
}


class RoundingCase:
	"""The till of the fixture rounds to CHF 0.05, and one line of the order costs a price that does not fall on 5 centimes."""

	def round_like_the_till(self, invoice, on=True):
		currency = frappe.db.get_value("Sales Invoice", invoice, "currency")
		frappe.db.set_value("Currency", currency, "smallest_currency_fraction_value", 0.05)
		frappe.clear_document_cache("Currency", currency)
		frappe.db.set_value("POS Profile", self.fx.profile, "disable_rounded_total", 0 if on else 1)
		frappe.clear_document_cache("POS Profile", self.fx.profile)

	def an_odd_price(self, invoice, item):
		row = frappe.db.get_value("Sales Invoice Item", {"parent": invoice, "item_code": item}, "name")
		frappe.db.set_value(
			"Sales Invoice Item",
			row,
			{"rate": ODD, "price_list_rate": ODD, "amount": ODD},
			update_modified=False,
		)

	def ask_the_provider(self, token, amount, tip=0):
		with patch("payments.api.intent.create_intent", return_value=INTENT) as create_intent:
			with patch.object(guest_ordering, "_resolve_wallee_provider", return_value="wallee_test"):
				self.as_guest(
					guest_ordering.create_guest_payment,
					token,
					amount,
					None,
					tip,
					"https://shop.example/ok",
					"https://shop.example/ko",
				)
		return create_intent.call_args.kwargs["amount"]


class TestATableOwesTheRoundedTotal(RoundingCase, PaymentCase):
	def setUp(self):
		super().setUp()
		self.round_like_the_till(self.invoice)
		self.an_odd_price(self.invoice, self.cola)

	def test_the_order_owes_what_the_till_takes(self):
		self.assertEqual(
			guest_ordering._still_owed(frappe.get_doc("Sales Invoice", self.invoice), None), ROUNDED
		)

	def test_the_page_shows_the_rounding_and_the_total_the_till_takes(self):
		status = self.as_guest(guest_ordering.get_order_status, self.token.token)

		self.assertEqual(
			(flt(status["grand_total"]), status.get("rounding"), status.get("amount_due")),
			(EXACT, 0.02, ROUNDED),
		)

	def test_the_phone_pays_the_rounded_total(self):
		self.assertEqual(self.ask_the_provider(self.token.token, ROUNDED), 1000)

	def test_the_rounded_total_settled_submits_the_order_with_nothing_left_owed(self):
		self.the_provider(ROUNDED)

		answer = self.confirm(ROUNDED)

		self.assertTrue(answer["submitted"])
		sale = frappe.get_doc("Sales Invoice", self.invoice)
		self.assertEqual(
			(sale.docstatus, flt(sale.rounded_total), flt(sale.outstanding_amount)), (1, ROUNDED, 0)
		)

	def test_a_till_that_does_not_round_takes_the_exact_total(self):
		self.round_like_the_till(self.invoice, on=False)

		status = self.as_guest(guest_ordering.get_order_status, self.token.token)

		self.assertEqual(
			guest_ordering._still_owed(frappe.get_doc("Sales Invoice", self.invoice), None), EXACT
		)
		self.assertEqual((status.get("rounding"), status.get("amount_due")), (0, EXACT))


class TestATakeawayOrderIsPaidItsRoundedTotal(RoundingCase, TakeawayCase):
	def setUp(self):
		super().setUp()
		self.register_and_order()

	def register_and_order(self):
		self.register("rounding-takeaway@yopmail.com")
		self.invoice = self.order((self.cola, 1), (self.soup, 1))["invoice"]
		self.round_like_the_till(self.invoice)
		self.an_odd_price(self.invoice, self.cola)

	def test_the_phone_is_asked_the_rounded_total(self):
		self.assertEqual(self.ask_the_provider(self.token.token, 1), 1000)

	def test_the_rounded_total_settled_submits_the_order_with_nothing_left_owed(self):
		self.the_provider_confirms(self.invoice, minor=1000)

		answer = self.confirm(ROUNDED)

		self.assertEqual(answer["status"], "success")
		sale = frappe.get_doc("Sales Invoice", self.invoice)
		self.assertEqual(
			(sale.docstatus, flt(sale.paid_amount), flt(sale.outstanding_amount)), (1, ROUNDED, 0)
		)
