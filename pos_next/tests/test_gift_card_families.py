# //// Neoffice — added file (no upstream equivalent). Two families of gift card
# //// coexist on one site: the POS issues `coupon_type="Promotional"` + the custom
# //// flag `pos_next_gift_card`, the webshop issues the ERPNext-native
# //// `coupon_type="Gift Card"` with no flag. Until 2026-09-22 every gate in the POS
# //// tested the flag alone, so a card bought online and spent at the till was
# //// accepted and its balance never moved — a permanent discount. Measured on a
# //// retail instance that day: 126 such cards still carrying CHF 8 909.80.
"""Both gift card families must be recognised, decremented and refunded alike."""

import frappe
import unittest
from frappe.utils import flt, nowdate

from pos_next.api.gift_cards import is_gift_card, process_gift_card_on_submit
from pos_next.api.offers import validate_coupon


def _fake_invoice(coupon_name, used):
	"""The shape `process_gift_card_on_submit` reads off a submitted POS invoice."""
	return frappe._dict({
		"doctype": "Sales Invoice",
		"name": "ZZ-TEST-GC-INV",
		"is_return": 0,
		"return_against": None,
		"coupon_code": coupon_name,
		"posa_coupon_code": None,
		"posa_gift_card_amount_used": used,
		"discount_amount": used,
		"pos_profile": None,
		"posa_pos_opening_shift": None,
		"get": lambda k, d=None: None,
	})


class TestGiftCardFamilies(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		cls.company = frappe.get_all("Company", limit=1)[0].name
		customers = frappe.get_all("Customer", limit=1)
		cls.customer = customers[0].name if customers else None
		cls.created = []

	@classmethod
	def tearDownClass(cls):
		for dt, name in cls.created:
			try:
				frappe.delete_doc(dt, name, force=True)
			except Exception:
				pass
		frappe.db.commit()

	def _web_card(self, amount=100, code="ZZ-WEB-GC-1"):
		"""A card exactly as the webshop creates it: native type, no POS flag."""
		rule = frappe.get_doc({
			"doctype": "Pricing Rule", "title": "ZZ Web Card %s" % code,
			"apply_on": "Transaction", "price_or_product_discount": "Price",
			"rate_or_discount": "Discount Amount", "discount_amount": amount,
			"selling": 1, "company": self.company,
			"currency": frappe.get_cached_value("Company", self.company, "default_currency"),
			"valid_from": nowdate(), "coupon_code_based": 1, "priority": "1",
		})
		rule.insert(ignore_permissions=True)
		self.created.append(("Pricing Rule", rule.name))

		card = frappe.get_doc({
			"doctype": "Coupon Code", "coupon_name": "ZZ Web Gift Card %s" % code,
			"coupon_type": "Gift Card", "coupon_code": code, "pricing_rule": rule.name,
			"valid_from": nowdate(), "maximum_use": 0, "used": 0,
			"gift_card_amount": amount, "original_gift_card_amount": amount,
			"customer": self.customer,
		})
		card.insert(ignore_permissions=True)
		self.created.append(("Coupon Code", card.name))
		frappe.db.commit()
		return card

	def test_the_predicate_recognises_both_families(self):
		self.assertTrue(is_gift_card({"pos_next_gift_card": 1, "coupon_type": "Promotional"}))
		self.assertTrue(is_gift_card({"pos_next_gift_card": 0, "coupon_type": "Gift Card"}))
		self.assertFalse(is_gift_card({"pos_next_gift_card": 0, "coupon_type": "Promotional"}))
		self.assertFalse(is_gift_card(None))

	def test_a_webshop_card_spent_at_the_till_loses_its_balance(self):
		"""The defect that was costing real money: the balance never moved."""
		card = self._web_card(amount=100, code="ZZ-WEB-GC-SPEND")
		process_gift_card_on_submit(_fake_invoice(card.name, 30))
		frappe.db.commit()

		after = frappe.db.get_value(
			"Coupon Code", card.name, ["gift_card_amount", "used"], as_dict=True
		)
		self.assertEqual(flt(after.gift_card_amount), 70)
		self.assertEqual(after.used, 1)

	def test_a_webshop_card_is_validated_on_its_balance_not_as_a_flat_discount(self):
		card = self._web_card(amount=40, code="ZZ-WEB-GC-VALID")
		result = validate_coupon(
			coupon_code=card.coupon_code, customer=self.customer, company=self.company
		)
		self.assertTrue(result.get("valid"), result.get("message"))
		self.assertTrue(result.get("coupon", {}).get("is_gift_card"))
		self.assertEqual(flt(result.get("coupon", {}).get("balance")), 40)

	def test_an_exhausted_webshop_card_is_refused(self):
		card = self._web_card(amount=10, code="ZZ-WEB-GC-EMPTY")
		frappe.db.set_value("Coupon Code", card.name, "gift_card_amount", 0)
		frappe.db.commit()

		result = validate_coupon(
			coupon_code=card.coupon_code, customer=self.customer, company=self.company
		)
		self.assertFalse(result.get("valid"))
		self.assertIn("balance", (result.get("message") or "").lower())

	def test_a_webshop_card_is_a_bearer_instrument_too(self):
		card = self._web_card(amount=25, code="ZZ-WEB-GC-BEARER")
		result = validate_coupon(
			coupon_code=card.coupon_code, customer="Some-Other-Customer", company=self.company
		)
		self.assertTrue(result.get("valid"), result.get("message"))
