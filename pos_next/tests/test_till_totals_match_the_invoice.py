# //// Neoffice — added file (no upstream equivalent).
"""The till shows what the invoice holds, to the cent (NeoResto lot 1, Ruling 70).

The till computes a cart's VAT and grand total by ERPNext's own rules (POS utils/invoiceTaxes.js), on the rows it sends.
POS/src/composables/__tests__/useInvoice.invoiceParity.spec.js rings carts through the till's own code and keeps, in
fixtures/till_invoice_parity.json, the payload the till sends and the figures it shows: a coffee at 4.20, a takeaway
order with a beer, prices without tax, header discounts, a percentage and an amount off three dishes, each line's VAT
rounded first, half a cent of VAT, a price edited by the cashier. Here each payload is saved and paid the way the till
does it (update_invoice, then submit_invoice with the takeaway flag), and the submitted invoice must hold the till's
figures: its VAT per account and in all, each line's amount, the grand total and its Swiss 0.05 rounding.

The fixture is the takeaway till of test_takeaway_tax_category. Nothing is committed: each cart is rolled back.
"""

import json
import os
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase, change_settings
from frappe.utils import flt

from pos_next.api import invoices
from pos_next.tests.test_takeaway_tax_category import TILL, TakeawayTill

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "till_invoice_parity.json")
CART = "till_parity_cart"


class TestTillTotalsMatchTheInvoice(TakeawayTill, FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		# Registered first, so it runs last: after the class's rollback, the cached fraction goes too
		cls.addClassCleanup(cls.forget_cached_fraction)
		super().setUpClass()
		with open(FIXTURE) as table:
			cls.carts = json.load(table)["cases"]
		# The Swiss rounding the till applies: the till rounds its totals, its currency to 0.05
		profile = frappe.get_doc("POS Profile", cls.till)
		profile.disable_rounded_total = 0
		profile.save(ignore_permissions=True)
		cls.currency = cls.fx.currency
		frappe.db.set_value("Currency", cls.currency, "smallest_currency_fraction_value", 0.05)
		cls.forget_cached_fraction()

	@classmethod
	def forget_cached_fraction(cls):
		"""ERPNext reads the fraction through the connection's value cache: never let it outlive what the test set."""
		currency = getattr(cls, "currency", None)
		if currency:
			frappe.db.value_cache.pop(("Currency", currency, "smallest_currency_fraction_value"), None)

	def items_of(self, cart):
		"""The rows as the till sent them, each on the fixture's item of its kind."""
		kinds = {"food": self.food, "alcohol": self.alcohol, "dessert": self.dessert}
		rows = []
		for row in cart["items"]:
			sent = {key: value for key, value in row.items() if key != "item"}
			rows.append({"item_code": kinds[row["item"]], **sent})
		return rows

	def account_of(self, account):
		return {self.vat_81: "VAT 8.1", self.vat_26: "VAT 2.6"}.get(account, account)

	def invoiced(self, cart):
		"""Save and pay the cart the way the till does, as its cashier; the submitted invoice."""
		self.make_till(
			enable_restaurant_mode=1, tax_inclusive=1 if cart["inclusive"] else 0, allow_user_to_edit_rate=1
		)
		sale = self.sale([])
		sale.update(
			{
				"items": self.items_of(cart),
				"discount_amount": cart["discount_amount"],
				"apply_discount_on": cart["apply_discount_on"],
				"payments": [{"mode_of_payment": self.fx.mode, "amount": cart["till"]["rounded_total"]}],
			}
		)
		real_single_value = frappe.db.get_single_value

		def accounts_settings(doctype, fieldname, *args, **kwargs):
			if (doctype, fieldname) == ("Accounts Settings", "round_row_wise_tax"):
				return 1 if cart["round_row_wise_tax"] else 0
			return real_single_value(doctype, fieldname, *args, **kwargs)

		frappe.set_user(TILL)
		try:
			with patch.object(frappe.db, "get_single_value", side_effect=accounts_settings):
				draft = invoices.update_invoice(json.dumps(sale))
				paid = {**sale, "name": draft["name"]}
				if cart["takeaway"]:
					paid.update({"is_takeaway": 1, "takeaway_number": "T-950"})
				invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		return frappe.get_doc("Sales Invoice", draft["name"])

	# The till's figures (fixtures/till_invoice_parity.json) are computed under the rounding the fleet's sites hold: none, which
	# frappe reads as "Banker's Rounding (legacy)" and which takes half a cent up (0.325 of VAT is 0.33). A site that ran
	# frappe's setup wizard holds "Banker's Rounding" (half a cent to the even cent: 0.32), as the fresh site of the CI
	# does, and the till is then told that one. The parity is proved under the first.
	@change_settings("System Settings", {"rounding_method": "Banker's Rounding (legacy)"})
	def test_every_cart_the_till_rings_is_invoiced_as_the_till_shows_it(self):
		self.assertEqual(len(self.carts), 10)
		for cart in self.carts:
			with self.subTest(cart["name"]):
				frappe.db.savepoint(CART)
				try:
					invoice = self.invoiced(cart)
					till = cart["till"]
					self.assertEqual(invoice.docstatus, 1)
					self.assertEqual(flt(invoice.total_taxes_and_charges, 2), till["total_taxes_and_charges"])
					self.assertEqual(flt(invoice.grand_total, 2), till["grand_total"])
					self.assertEqual(flt(invoice.rounded_total, 2), till["rounded_total"])
					accounts = {}
					for tax in invoice.taxes:
						name = self.account_of(tax.account_head)
						accounts[name] = flt(accounts.get(name, 0) + tax.tax_amount_after_discount_amount, 2)
					self.assertEqual(accounts, till["accounts"])
					self.assertEqual([flt(row.amount, 2) for row in invoice.items], till["lines"])
				finally:
					frappe.db.rollback(save_point=CART)
