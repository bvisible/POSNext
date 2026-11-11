# //// Neoffice — added file (no upstream equivalent).
"""A return at a till whose prices exclude the VAT credits the VAT of its sale and records the whole refund as paid (maintenance#2073).

Since NeoRestau lot 1 every return of a till takes the tax category and the line templates of its sale (takeaway_tax.py,
copy_taxes_of_the_returned_sale): the VAT charged is the VAT credited, proven at a till whose prices include the VAT
(test_takeaway_tax_category). A review of the money paths saw, on an earlier commit, a return at a till whose prices EXCLUDE
the VAT record only « the refund less the net » as paid: the customer's money back would be partly owed. This pins that till:
the sale charges its VAT on top of its prices, and its return credits the same VAT, at the same rates, refunds the same total
and is paid in full, with nothing left outstanding.

The till's own server path makes the sale and the return (update_invoice, submit_invoice), in the cashier's session; the
scenery (the till, its VAT, its items) is the takeaway tax suite's, the till switched to prices without the VAT. Rolled back.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from pos_next.api import invoices
from pos_next.tests.test_takeaway_tax_category import TakeawayTill
from pos_next.tests.test_till_writes_need_the_till import TILL


def _due(doc):
	"""What the till takes for a sale: its rounded total where it rounds, else its total."""
	return flt(doc.rounded_total) or flt(doc.grand_total)


class TestAnExclusivePriceReturnCreditsItsSale(TakeawayTill, FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# The same till, its prices now WITHOUT the VAT
		cls.make_till(enable_restaurant_mode=1, tax_inclusive=0)

	def test_the_return_credits_the_vat_of_its_sale_and_is_paid_in_full(self):
		sale = self.sale([self.food, self.dessert])
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			total = _due(frappe.get_doc("Sales Invoice", draft["name"]))
			paid = {
				**sale,
				"name": draft["name"],
				"is_takeaway": 1,
				"takeaway_number": "T-2073",
				"payments": [{"mode_of_payment": self.fx.mode, "amount": total}],
			}
			invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		sold = frappe.get_doc("Sales Invoice", draft["name"])
		# The VAT is on top of the prices: the sale's total is its net and its VAT
		self.assertEqual(sold.docstatus, 1)
		self.assertGreater(flt(sold.total_taxes_and_charges), 0)
		self.assertFalse(any(tax.included_in_print_rate for tax in sold.taxes))
		self.assertEqual(flt(sold.grand_total), flt(flt(sold.net_total) + flt(sold.total_taxes_and_charges), 2))

		# The return, as the till's return dialog builds it (ReturnInvoiceDialog.vue): no tax category, no template
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
				for row in sold.items
			],
			"payments": [{"mode_of_payment": self.fx.mode, "amount": -_due(sold)}],
		}
		frappe.set_user(TILL)
		try:
			done = invoices.submit_invoice(invoice=json.dumps(returned), data="{}")
		finally:
			frappe.set_user("Administrator")
		credit = frappe.get_doc("Sales Invoice", done["name"])

		# The VAT credited is the VAT charged, at the same rates, and the refund is the sale's total
		self.assertEqual(credit.docstatus, 1)
		self.assertEqual(flt(credit.total_taxes_and_charges), -flt(sold.total_taxes_and_charges))
		self.assertEqual(
			(self.vat_rate(credit, self.food), self.vat_rate(credit, self.dessert)),
			(self.vat_rate(sold, self.food), self.vat_rate(sold, self.dessert)),
		)
		self.assertEqual(flt(credit.grand_total), -flt(sold.grand_total))
		# The whole refund is paid back, not « the refund less the net »: nothing is left owed either way
		self.assertEqual(flt(credit.paid_amount), -_due(sold))
		self.assertEqual(flt(credit.outstanding_amount), 0)
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", sold.name, "outstanding_amount")), 0)
