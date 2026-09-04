# -*- coding: utf-8 -*-
# Copyright (c) 2025, BrainWise and contributors
# For license information, please see license.txt

"""
Test Suite for Coupon Code Integration with Sales Invoice

This module tests the native ERPNext coupon_code field integration on Sales Invoice:
- Coupon validation on invoice validate
- Coupon usage counter increment on submit
- Coupon usage counter decrement on cancel

Run with: bench --site [site] run-tests --app pos_next --module pos_next.tests.test_coupon_invoice_integration
"""

import frappe
import unittest
from frappe.utils import nowdate, add_months, flt


class TestCouponInvoiceIntegration(unittest.TestCase):
	"""Test coupon_code field integration with Sales Invoice"""

	#//// Neoffice — added _pick_company (764047c "tests: fixtures must pick rows the test can actually use"): frappe.get_all("Company", limit=1) picked whatever came first and had no fiscal year covering today on the dev instance, failing all four invoice tests with FiscalYearError
	@classmethod
	def _pick_company(cls):
		"""A company an invoice dated today can actually be booked in.

		frappe.get_all("Company", limit=1) took whatever row came back first
		(modified desc), which on any site holding more than one company is a
		coin toss. On the dev instance it picked a company whose fiscal years do
		not cover today and all four invoice tests died on FiscalYearError before
		reaching the coupon behaviour they exist to check. Ask for the property
		the test actually needs instead, and order by name so the pick is stable.
		"""
		from erpnext.accounts.utils import get_fiscal_year

		for name in frappe.get_all("Company", pluck="name", order_by="name asc"):
			if get_fiscal_year(nowdate(), company=name, boolean=True, verbose=0):
				return name
		return None

	@classmethod
	def setUpClass(cls):
		"""Set up test fixtures"""
		# Get test company
		#//// Neoffice — modified (764047c "tests: fixtures must pick rows the test can actually use"): use _pick_company() and skip instead of a random get_all() pick that could lack a fiscal year for today
		cls.test_company = cls._pick_company()
		if not cls.test_company:
			raise unittest.SkipTest("No company with an active fiscal year for today")

		#//// Neoffice — modified: create the test customer instead of borrowing an arbitrary get_all("Customer", limit=1) row — the row you land on decides the invoice currency, and on CI it put a USD customer against an INR company, failing all four invoice tests on "Party Account Debtors - _TC currency (INR) and document currency (USD) should be same"
		# Track created docs for cleanup (before anything is created)
		cls.created_customers = []
		cls.created_coupons = []
		cls.created_pricing_rules = []
		cls.created_invoices = []

		# Test customer: create our own instead of borrowing an arbitrary row.
		# frappe.get_all("Customer", limit=1) returned whatever came back first,
		# and which customer you land on decides the invoice currency: on CI it
		# reached a USD customer against an INR company and every invoice died on
		# "Party Account Debtors - _TC currency (INR) and document currency (USD)
		# should be same". A customer with no default_currency of its own bills in
		# the company currency, which is all these coupon tests need.
		cls.test_customer = cls._create_test_customer()

		#//// Neoffice — modified (764047c "tests: fixtures must pick rows the test can actually use"): exclude templates/fixed assets/disabled items and order by name so the pick is stable
		# Get test item: one that can actually go on an invoice line.
		# erpnext ships _Test Variant Item among its test records - a template
		# (has_variants=1) whose variants are the sellable rows. Filtering only on
		# is_sales_item picked it up and every invoice built here died on
		# "Item _Test Variant Item is a template, please select one of its
		# variants" (CI, 2026-09-03). Fixed assets need an Asset record and
		# disabled items are refused too, so exclude all three; order by name so
		# the fixture is the same row from one run to the next.
		items = frappe.get_all(
			"Item",
			filters={
				"is_sales_item": 1,
				"has_variants": 0,
				"is_fixed_asset": 0,
				"disabled": 0,
			},
			order_by="name asc",
			limit=1,
		)
		cls.test_item = items[0].name if items else None

		# Get default income account
		cls.income_account = frappe.db.get_value(
			"Company", cls.test_company, "default_income_account"
		)

		#//// Neoffice — removed cls.created_coupons/created_pricing_rules init here (fa314f91 "tests(coupon): create the test customer instead of borrowing one"): moved up next to created_customers/created_invoices so every tracking list exists before anything is created

		#//// Neoffice — added: pin the receivable account and bill in ITS currency.
		# The invoice used to take its currency from the ambient default, which is
		# not the company's: bench run-tests only bootstraps the app under test, so
		# erpnext's before_tests never runs and Global Defaults keeps frappe's own
		# USD while the test company is INR. Every invoice then died on "Party
		# Account Debtors - _TC currency (INR) and document currency (USD) should
		# be same" (CI, 2026-09-04). Taking the currency FROM the party account is
		# the one choice that cannot disagree with the check that compares them.
		from erpnext.accounts.party import get_party_account, get_party_account_currency

		cls.debit_to = get_party_account("Customer", cls.test_customer, cls.test_company)
		cls.test_currency = (
			get_party_account_currency("Customer", cls.test_customer, cls.test_company)
			or frappe.get_cached_value("Company", cls.test_company, "default_currency")
		)

		# Create a test Pricing Rule and Coupon Code
		cls._create_test_coupon()

	#//// Neoffice — added _create_test_customer: the coupon tests need a customer that bills in the company currency, which no borrowed row guarantees
	@classmethod
	def _create_test_customer(cls):
		"""Create a customer that bills in the company currency."""
		name = "POS Next Coupon Test Customer"
		existing = frappe.db.get_value("Customer", {"customer_name": name})
		if existing:
			return existing

		customer = frappe.get_doc({
			"doctype": "Customer",
			"customer_name": name,
			"customer_type": "Individual",
			"customer_group": frappe.get_all(
				"Customer Group", filters={"is_group": 0}, limit=1
			)[0].name,
			"territory": frappe.get_all(
				"Territory", filters={"is_group": 0}, limit=1
			)[0].name,
		})
		customer.insert(ignore_permissions=True)
		cls.created_customers.append(customer.name)
		return customer.name

	@classmethod
	def _create_test_coupon(cls):
		"""Create a test coupon for testing"""
		# Create Pricing Rule
		pricing_rule = frappe.get_doc({
			"doctype": "Pricing Rule",
			"title": "Test Coupon PR",
			"apply_on": "Transaction",
			"price_or_product_discount": "Price",
			"rate_or_discount": "Discount Amount",
			"discount_amount": 10,
			"selling": 1,
			"company": cls.test_company,
			"currency": frappe.get_cached_value("Company", cls.test_company, "default_currency"),
			"valid_from": nowdate(),
			"valid_upto": add_months(nowdate(), 12),
			"coupon_code_based": 1,
		})
		pricing_rule.insert(ignore_permissions=True)
		cls.created_pricing_rules.append(pricing_rule.name)

		# Create Coupon Code
		cls.test_coupon_code = "TESTCOUPON2024"
		coupon = frappe.get_doc({
			"doctype": "Coupon Code",
			"coupon_name": "Test Coupon",
			"coupon_type": "Promotional",
			"coupon_code": cls.test_coupon_code,
			"pricing_rule": pricing_rule.name,
			"valid_from": nowdate(),
			"valid_upto": add_months(nowdate(), 12),
			"maximum_use": 100,
			"used": 0,
		})
		coupon.insert(ignore_permissions=True)
		cls.created_coupons.append(coupon.name)
		cls.test_coupon_name = coupon.name

		frappe.db.commit()

	@classmethod
	def tearDownClass(cls):
		"""Clean up test data"""
		# Cancel and delete invoices first
		for invoice_name in cls.created_invoices:
			try:
				invoice = frappe.get_doc("Sales Invoice", invoice_name)
				if invoice.docstatus == 1:
					invoice.cancel()
				frappe.delete_doc("Sales Invoice", invoice_name, force=True)
			except Exception:
				pass

		# Delete coupons
		for coupon_name in cls.created_coupons:
			try:
				frappe.delete_doc("Coupon Code", coupon_name, force=True)
			except Exception:
				pass

		# Delete pricing rules
		for pr_name in cls.created_pricing_rules:
			try:
				frappe.delete_doc("Pricing Rule", pr_name, force=True)
			except Exception:
				pass

		#//// Neoffice — added (fa314f91 "tests(coupon): create the test customer instead of borrowing one"): clean up the customer we created for the invoice-currency fixture, along with the coupon/pricing rule
		# Delete the customer we created (only ours: created_customers is empty
		# when the run reused one that was already on the site)
		for customer_name in cls.created_customers:
			try:
				frappe.delete_doc("Customer", customer_name, force=True)
			except Exception:
				pass

		frappe.db.commit()

	def _create_invoice_with_coupon(self, coupon_code, submit=False):
		"""Helper to create a Sales Invoice with coupon_code"""
		if not self.test_customer or not self.test_item:
			self.skipTest("Missing test customer or item")

		invoice = frappe.get_doc({
			"doctype": "Sales Invoice",
			"customer": self.test_customer,
			"company": self.test_company,
			"posting_date": nowdate(),
			"due_date": nowdate(),
			# Bill in the receivable account's own currency - see setUpClass.
			"debit_to": self.debit_to,
			"currency": self.test_currency,
			"conversion_rate": 1,
			"price_list_currency": self.test_currency,
			"plc_conversion_rate": 1,
			"coupon_code": coupon_code,
			"items": [{
				"item_code": self.test_item,
				"qty": 1,
				"rate": 100,
				"income_account": self.income_account,
			}],
		})

		invoice.insert(ignore_permissions=True)
		self.created_invoices.append(invoice.name)

		if submit:
			invoice.submit()

		return invoice

	def test_coupon_code_field_exists(self):
		"""Test that coupon_code custom field exists on Sales Invoice"""
		# Check if the field exists in the doctype
		has_field = frappe.db.exists("Custom Field", {
			"dt": "Sales Invoice",
			"fieldname": "coupon_code"
		})

		self.assertTrue(has_field, "coupon_code custom field should exist on Sales Invoice")

	def test_coupon_code_is_link_field(self):
		"""Test that coupon_code is a Link field to Coupon Code"""
		field = frappe.get_doc("Custom Field", "Sales Invoice-coupon_code")

		self.assertEqual(field.fieldtype, "Link")
		self.assertEqual(field.options, "Coupon Code")

	def test_validate_coupon_on_invoice(self):
		"""Test that valid coupon passes validation"""
		# This should not raise an exception
		invoice = self._create_invoice_with_coupon(self.test_coupon_name)

		self.assertEqual(invoice.coupon_code, self.test_coupon_name)

	def test_coupon_usage_increment_on_submit(self):
		"""Test that coupon usage counter increments on invoice submit"""
		# Get initial usage count
		initial_used = frappe.db.get_value("Coupon Code", self.test_coupon_name, "used")

		# Create and submit invoice with coupon
		invoice = self._create_invoice_with_coupon(self.test_coupon_name, submit=True)

		# Check usage count increased
		new_used = frappe.db.get_value("Coupon Code", self.test_coupon_name, "used")
		self.assertEqual(new_used, initial_used + 1, "Coupon usage should increment on submit")

	def test_coupon_usage_decrement_on_cancel(self):
		"""Test that coupon usage counter decrements on invoice cancel"""
		# Create and submit invoice with coupon
		invoice = self._create_invoice_with_coupon(self.test_coupon_name, submit=True)

		# Get usage count after submit
		used_after_submit = frappe.db.get_value("Coupon Code", self.test_coupon_name, "used")

		# Cancel the invoice
		invoice.cancel()

		# Check usage count decreased
		used_after_cancel = frappe.db.get_value("Coupon Code", self.test_coupon_name, "used")
		self.assertEqual(
			used_after_cancel, used_after_submit - 1,
			"Coupon usage should decrement on cancel"
		)

	def test_no_increment_without_coupon(self):
		"""Test that usage doesn't change for invoices without coupon"""
		# Get initial usage count
		initial_used = frappe.db.get_value("Coupon Code", self.test_coupon_name, "used")

		# Create invoice WITHOUT coupon
		if not self.test_customer or not self.test_item:
			self.skipTest("Missing test customer or item")

		invoice = frappe.get_doc({
			"doctype": "Sales Invoice",
			"customer": self.test_customer,
			"company": self.test_company,
			"posting_date": nowdate(),
			"due_date": nowdate(),
			# Bill in the receivable account's own currency - see setUpClass.
			"debit_to": self.debit_to,
			"currency": self.test_currency,
			"conversion_rate": 1,
			"price_list_currency": self.test_currency,
			"plc_conversion_rate": 1,
			"items": [{
				"item_code": self.test_item,
				"qty": 1,
				"rate": 100,
				"income_account": self.income_account,
			}],
		})
		invoice.insert(ignore_permissions=True)
		self.created_invoices.append(invoice.name)
		invoice.submit()

		# Check usage count unchanged
		new_used = frappe.db.get_value("Coupon Code", self.test_coupon_name, "used")
		self.assertEqual(new_used, initial_used, "Coupon usage should not change for invoices without coupon")

		# Cleanup
		invoice.cancel()


class TestLegacyPosaCouponCodeCompatibility(unittest.TestCase):
	"""Test backwards compatibility with posa_coupon_code field"""

	@classmethod
	def setUpClass(cls):
		"""Set up test fixtures"""
		cls.test_company = frappe.get_all("Company", limit=1)[0].name
		customers = frappe.get_all("Customer", limit=1)
		cls.test_customer = customers[0].name if customers else None

	def test_posa_coupon_code_field_exists(self):
		"""Test that legacy posa_coupon_code field still exists"""
		has_field = frappe.db.exists("Custom Field", {
			"dt": "Sales Invoice",
			"fieldname": "posa_coupon_code"
		})

		self.assertTrue(has_field, "posa_coupon_code field should exist for backwards compatibility")

	def test_gift_cards_can_read_both_fields(self):
		"""Test that gift_cards.py logic handles both fields"""
		# This tests the getattr pattern used in gift_cards.py
		from pos_next.api.gift_cards import process_gift_card_on_submit

		# Create a mock invoice object
		class MockInvoice:
			def __init__(self):
				self.posa_coupon_code = None
				self.coupon_code = "TEST123"
				self.is_return = False
				self.doctype = "Sales Invoice"

		invoice = MockInvoice()

		# Test the pattern used in gift_cards.py
		coupon_code = getattr(invoice, 'posa_coupon_code', None) or getattr(invoice, 'coupon_code', None)
		self.assertEqual(coupon_code, "TEST123")

		# Test with posa_coupon_code set
		invoice.posa_coupon_code = "LEGACY456"
		coupon_code = getattr(invoice, 'posa_coupon_code', None) or getattr(invoice, 'coupon_code', None)
		self.assertEqual(coupon_code, "LEGACY456")


def run_coupon_invoice_integration_tests():
	"""Run all coupon invoice integration tests and return results"""
	loader = unittest.TestLoader()
	suite = unittest.TestSuite()

	suite.addTests(loader.loadTestsFromTestCase(TestCouponInvoiceIntegration))
	suite.addTests(loader.loadTestsFromTestCase(TestLegacyPosaCouponCodeCompatibility))

	runner = unittest.TextTestRunner(verbosity=2)
	return runner.run(suite)


if __name__ == "__main__":
	run_coupon_invoice_integration_tests()
