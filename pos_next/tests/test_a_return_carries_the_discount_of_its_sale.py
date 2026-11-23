# //// Neoffice — added file (no upstream equivalent).
"""A return takes back what its sale charged, its invoice-level discount included (maintenance gift-card test of 23.11.2026).

The till's return dialog builds the credit note line by line (ReturnInvoiceDialog.vue) and sent no discount: a sale of 21.62
that spent a gift card (or took any discount) of 1.62 was paid 20.00, and its return took back 21.62, the whole of the goods,
while the card was credited its 1.62 again: the customer left with 23.24 for 20.00 paid. ERPNext's own return copies the discount
(`make_return_doc`); the till's does not. The till's server path now gives the return the share of its sale's discount that the
lines it takes back carry, and the last return of a sale takes what is left of it, to the cent.

The till's own server path makes the sale and the returns (update_invoice, submit_invoice), in the cashier's session; the scenery
(the till, its VAT, its items: 10.81 each, the VAT included) is the takeaway tax suite's. Rolled back.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from pos_next.api import invoices
from pos_next.tests.test_takeaway_tax_category import TakeawayTill
from pos_next.tests.test_till_writes_need_the_till import TILL

DISCOUNT = 1.62  # of a sale of 21.62: it is paid 20.00, and half of it (10.81 of the goods) carries 0.81


def _due(doc):
	"""What the till takes for a sale: its rounded total where it rounds, else its total."""
	return flt(doc.rounded_total) or flt(doc.grand_total)


class TestAReturnCarriesTheDiscountOfItsSale(TakeawayTill, FrappeTestCase):
	def sold_with_a_discount(self):
		sale = self.sale([self.food, self.dessert], discount_amount=DISCOUNT, apply_discount_on="Grand Total")
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			total = _due(frappe.get_doc("Sales Invoice", draft["name"]))
			paid = {**sale, "name": draft["name"], "payments": [{"mode_of_payment": self.fx.mode, "amount": total}]}
			invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		return frappe.get_doc("Sales Invoice", draft["name"])

	def return_of(self, sold, rows, refund, **changes):
		"""The return as the till's dialog builds it: the lines, their quantities, the refund; no discount unless it says so."""
		returned = {
			"doctype": "Sales Invoice",
			"pos_profile": self.till,
			"customer": sold.customer,
			"company": sold.company,
			"is_return": 1,
			"return_against": sold.name,
			"update_outstanding_for_self": 0,
			"is_pos": 1,
			"update_stock": 1,
			"items": [
				{
					"item_code": row.item_code,
					"item_name": row.item_name,
					"qty": -1,
					"rate": row.rate,
					"warehouse": row.warehouse,
					"uom": row.uom,
					"conversion_factor": 1,
					"sales_invoice_item": row.name,
				}
				for row in rows
			],
			"payments": [{"mode_of_payment": self.fx.mode, "amount": -refund}],
		}
		returned.update(changes)
		frappe.set_user(TILL)
		try:
			done = invoices.submit_invoice(invoice=json.dumps(returned), data="{}")
		finally:
			frappe.set_user("Administrator")
		return frappe.get_doc("Sales Invoice", done["name"])

	def test_the_sale_of_the_scenery_is_paid_less_than_its_goods(self):
		sold = self.sold_with_a_discount()

		self.assertEqual(flt(sold.discount_amount), DISCOUNT)
		self.assertEqual(_due(sold), 20.00)

	def test_the_return_of_everything_takes_back_what_was_paid_not_the_goods(self):
		sold = self.sold_with_a_discount()

		credit = self.return_of(sold, sold.items, refund=_due(sold))

		self.assertEqual(flt(credit.discount_amount), -DISCOUNT)
		self.assertEqual(flt(credit.grand_total), -flt(sold.grand_total))
		self.assertEqual(flt(credit.paid_amount), -_due(sold))
		self.assertEqual(flt(credit.outstanding_amount), 0)

	def test_the_return_of_one_line_carries_its_share_of_the_discount(self):
		sold = self.sold_with_a_discount()

		credit = self.return_of(sold, sold.items[:1], refund=10.00)

		self.assertEqual(flt(credit.discount_amount), -0.81)
		self.assertEqual(flt(credit.grand_total), -10.00)
		self.assertEqual(flt(credit.outstanding_amount), 0)

	def test_two_returns_that_take_everything_back_take_the_whole_discount_to_the_cent(self):
		sold = self.sold_with_a_discount()

		first = self.return_of(sold, sold.items[:1], refund=10.00)
		second = self.return_of(sold, sold.items[1:], refund=10.00)

		self.assertEqual(flt(first.discount_amount) + flt(second.discount_amount), -DISCOUNT)
		self.assertEqual(flt(first.grand_total) + flt(second.grand_total), -flt(sold.grand_total))

	def test_a_discount_the_return_names_itself_is_replaced_by_the_one_of_its_sale(self):
		sold = self.sold_with_a_discount()

		credit = self.return_of(
			sold, sold.items, refund=_due(sold), discount_amount=-5.00, apply_discount_on="Grand Total"
		)

		self.assertEqual(flt(credit.discount_amount), -DISCOUNT)
		self.assertEqual(flt(credit.grand_total), -flt(sold.grand_total))

	def test_a_return_that_names_no_discount_does_not_take_the_whole_goods_back(self):
		sold = self.sold_with_a_discount()

		credit = self.return_of(sold, sold.items, refund=_due(sold))

		# the goods cost 21.62, the sale 20.00: the credit note gives back the 20.00
		self.assertLess(abs(flt(credit.grand_total)), sum(flt(row.amount) for row in sold.items))

	def test_the_dialog_is_offered_each_line_with_its_part_of_the_discount(self):
		sold = self.sold_with_a_discount()

		frappe.set_user(TILL)
		try:
			prepared = invoices.prepare_return_invoice(sold.name)
		finally:
			frappe.set_user("Administrator")

		per_unit = [flt(item["invoice_discount_per_unit"]) for item in prepared["items"]]
		self.assertEqual(per_unit, [0.81, 0.81])
		self.assertEqual(flt(prepared["invoice_discount_to_return"]), DISCOUNT)

	def test_after_a_first_return_the_dialog_offers_what_is_left_of_the_discount(self):
		sold = self.sold_with_a_discount()
		self.return_of(sold, sold.items[:1], refund=10.00)

		frappe.set_user(TILL)
		try:
			prepared = invoices.prepare_return_invoice(sold.name)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(len(prepared["items"]), 1)
		self.assertEqual(flt(prepared["items"][0]["invoice_discount_per_unit"]), 0.81)
		self.assertEqual(flt(prepared["invoice_discount_to_return"]), 0.81)

	def test_a_sale_without_a_discount_offers_no_discount_to_the_dialog(self):
		sale = self.sale([self.food, self.dessert])
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			total = _due(frappe.get_doc("Sales Invoice", draft["name"]))
			paid = {**sale, "name": draft["name"], "payments": [{"mode_of_payment": self.fx.mode, "amount": total}]}
			invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
			prepared = invoices.prepare_return_invoice(draft["name"])
		finally:
			frappe.set_user("Administrator")

		self.assertEqual([item["invoice_discount_per_unit"] for item in prepared["items"]], [0, 0])
		self.assertNotIn("invoice_discount_to_return", prepared)

	def test_a_sale_without_a_discount_returns_without_one(self):
		sale = self.sale([self.food, self.dessert])
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			total = _due(frappe.get_doc("Sales Invoice", draft["name"]))
			paid = {**sale, "name": draft["name"], "payments": [{"mode_of_payment": self.fx.mode, "amount": total}]}
			invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		sold = frappe.get_doc("Sales Invoice", draft["name"])

		credit = self.return_of(sold, sold.items, refund=_due(sold))

		self.assertEqual(flt(credit.discount_amount), 0)
		self.assertEqual(flt(credit.grand_total), -flt(sold.grand_total))
