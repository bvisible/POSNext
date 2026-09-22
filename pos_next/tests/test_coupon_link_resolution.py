# //// Neoffice — added file (no upstream equivalent). `coupon_code` on an invoice is a
# //// Link to Coupon Code, so it holds the document NAME, while the POS sends the code
# //// the cashier typed or scanned. Whenever a coupon is not named after its own code —
# //// every gift card the webshop issues — the sale died at submit on
# //// LinkValidationError, basket already paid on screen. Found 2026-09-22 by running
# //// the till in Chrome; no unit test could have caught it, which is the point.
"""A coupon reaches the invoice by its code; the Link field needs its name."""

import frappe
import unittest
from frappe.utils import nowdate

from pos_next.api.sales_invoice_hooks import resolve_coupon_document_name


class TestCouponLinkResolution(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.company = frappe.get_all("Company", limit=1)[0].name
		# ERPNext requires a customer on a Gift Card coupon.
		cls.customer = frappe.get_all("Customer", limit=1)[0].name
		cls.created = []

		# A coupon whose document name differs from its code — how the webshop names
		# gift cards ("Carte cadeau CHF 50.00 - <someone> - <code>").
		cls.code_named_apart = "ZZ-LINK-CODE-1"
		rule = frappe.get_doc({
			"doctype": "Pricing Rule", "title": "ZZ Link Test", "apply_on": "Transaction",
			"price_or_product_discount": "Price", "rate_or_discount": "Discount Amount",
			"discount_amount": 25, "selling": 1, "company": cls.company,
			"currency": frappe.get_cached_value("Company", cls.company, "default_currency"),
			"valid_from": nowdate(), "coupon_code_based": 1, "priority": "1",
		})
		rule.insert(ignore_permissions=True)
		cls.created.append(("Pricing Rule", rule.name))

		card = frappe.get_doc({
			"doctype": "Coupon Code",
			"coupon_name": "ZZ Gift card 25.00 - someone - ZZ-LINK-CODE-1",
			"coupon_type": "Gift Card", "coupon_code": cls.code_named_apart,
			"pricing_rule": rule.name, "valid_from": nowdate(),
			"maximum_use": 0, "used": 0,
			"gift_card_amount": 25, "original_gift_card_amount": 25,
			"customer": cls.customer,
		})
		card.insert(ignore_permissions=True)
		cls.created.append(("Coupon Code", card.name))
		cls.doc_name = card.name
		frappe.db.commit()

	@classmethod
	def tearDownClass(cls):
		for dt, name in reversed(cls.created):
			try:
				frappe.delete_doc(dt, name, force=True)
			except Exception:
				pass
		frappe.db.commit()

	def test_a_code_is_resolved_to_the_document_name(self):
		got = resolve_coupon_document_name(self.code_named_apart)
		self.assertEqual(got, self.doc_name)
		self.assertNotEqual(got, self.code_named_apart)

	def test_a_name_is_left_alone(self):
		self.assertEqual(resolve_coupon_document_name(self.doc_name), self.doc_name)

	def test_an_unknown_code_is_left_for_the_link_to_refuse(self):
		"""Silently blanking it would turn a typo into a sale with no coupon at all."""
		self.assertEqual(resolve_coupon_document_name("ZZ-NO-SUCH-CODE"), "ZZ-NO-SUCH-CODE")

	def test_an_empty_field_is_a_no_op(self):
		self.assertEqual(resolve_coupon_document_name(""), "")
		# None normalises to the empty string rather than propagating None into a
		# Link field — the caller assigns the result straight onto the payload.
		self.assertEqual(resolve_coupon_document_name(None), "")

	def test_surrounding_whitespace_from_a_scanner_is_tolerated(self):
		self.assertEqual(resolve_coupon_document_name("  %s  " % self.code_named_apart), self.doc_name)
