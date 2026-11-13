# //// Neoffice — added file (no upstream equivalent).
"""The gift cards the web shop sold say where they come from, read on the line of their sale invoice (13.11.2026, maintenance#2639).

A card sold without VAT is spent as a payment, in the shop and at the till; a card sold with VAT or offered, as a discount. A shop card made
before the origin existed says nothing, and this patch reads it where the sale left it. The lines of the invoices are stood in for: what the
patch does with them is the point, and a real invoice per case would only test the sales module.
"""

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.patches.gift_cards import say_the_origin_of_each_shop_gift_card as the_patch

DEBT = "2020 - Gift cards - TEST"
REVENUE = "3200 - Sales - TEST"
INVOICE = "ACC-SINV-SHOP-2639"
OTHER_INVOICE = "ACC-SINV-SHOP-2639-B"


def _line(
	invoice=INVOICE, item="giftcard", rate=50.0, item_tax_rate="{}", income_account=DEBT, vat_accounts=()
):
	return frappe._dict(
		invoice=invoice,
		item=item,
		rate=rate,
		item_tax_rate=item_tax_rate,
		income_account=income_account,
		vat_accounts=list(vat_accounts),
	)


@unittest.skipUnless(
	frappe.db.has_column("Coupon Code", "sales_invoice"), "the shop is not installed on this site"
)
class TestTheShopCardsSayWhereTheyComeFrom(FrappeTestCase):
	def setUp(self):
		the_patch.ensure_the_columns()
		self.customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": f"_Test Shop Card Origin {frappe.generate_hash(length=6)}",
				"customer_type": "Individual",
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
				"email_id": f"shop-card-origin-{frappe.generate_hash(length=6)}@yopmail.com",
			}
		).insert(ignore_permissions=True)
		self.rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": f"Test shop card origin {frappe.generate_hash(length=6)}",
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"selling": 1,
				"coupon_code_based": 1,
				"rate_or_discount": "Discount Amount",
				"discount_amount": 50,
				"valid_upto": "2999-12-31",
			}
		).insert(ignore_permissions=True)

	def _card(self, invoice=INVOICE, till=0, origin=None, account=None):
		card = frappe.get_doc(
			{
				"doctype": "Coupon Code",
				"coupon_name": f"Test shop card origin {frappe.generate_hash(length=6)}",
				"coupon_type": "Gift Card",
				"pricing_rule": self.rule.name,
				"customer": self.customer.name,
				"coupon_code": frappe.generate_hash(length=10).upper(),
				"valid_from": nowdate(),
				"valid_upto": add_days(nowdate(), 30),
				"maximum_use": 9999,
				"gift_card_amount": 50,
			}
		).insert(ignore_permissions=True)
		# written straight: the link to an invoice is checked at insertion, and the invoice here is only a name for the lines to answer to
		frappe.db.set_value(
			"Coupon Code",
			card.name,
			{
				"sales_invoice": invoice,
				"pos_next_gift_card": till,
				the_patch.ORIGIN: origin or "Offered",
				the_patch.SALE_ACCOUNT: account,
			},
		)
		return card.name

	def _run(self, *lines, items=("giftcard",)):
		with (
			patch.object(the_patch, "_the_lines", return_value=list(lines)),
			patch.object(the_patch, "_the_items_of_the_shop", return_value=set(items)),
		):
			the_patch.execute()

	def _origin(self, card):
		return tuple(frappe.db.get_value("Coupon Code", card, [the_patch.ORIGIN, the_patch.SALE_ACCOUNT]))

	def test_a_card_sold_on_a_line_without_vat_is_sold_without_vat_and_keeps_the_account_its_sale_credited(
		self,
	):
		card = self._card()

		self._run(_line(item_tax_rate='{"VAT 8.1%": 0}', income_account=DEBT))

		self.assertEqual(self._origin(card), ("Sold without VAT", DEBT))

	def test_a_card_sold_on_a_line_with_vat_is_sold_with_vat_and_names_no_account(self):
		card = self._card()

		self._run(_line(item_tax_rate='{"VAT 8.1%": 8.1}', income_account=REVENUE))

		self.assertEqual(self._origin(card), ("Sold with VAT", None))

	def test_a_card_sold_before_keeps_the_revenue_account_its_sale_credited(self):
		card = self._card()

		self._run(_line(item_tax_rate="{}", income_account=REVENUE))

		self.assertEqual(self._origin(card), ("Sold without VAT", REVENUE))

	def test_a_line_with_no_template_is_charged_the_rate_of_its_invoice(self):
		card = self._card()

		self._run(_line(item_tax_rate=None, vat_accounts=["22007 - VAT 8.1%"]))

		self.assertEqual(self._origin(card)[0], "Sold with VAT")

	def test_a_taxed_product_in_the_same_basket_does_not_tax_the_card(self):
		card = self._card()

		self._run(
			_line(item="giftcard", item_tax_rate="{}", income_account=DEBT),
			_line(item="a-product", rate=80.0, item_tax_rate='{"VAT 8.1%": 8.1}', income_account=REVENUE),
		)

		self.assertEqual(self._origin(card), ("Sold without VAT", DEBT))

	def test_in_the_doubt_a_taxed_line_keeps_the_card_a_discount(self):
		card = self._card()

		self._run(
			_line(item="one-product", item_tax_rate="{}", income_account=DEBT),
			_line(item="another-product", item_tax_rate='{"VAT 8.1%": 8.1}', income_account=REVENUE),
			items=(),
		)

		self.assertEqual(self._origin(card)[0], "Sold with VAT")

	def test_a_card_whose_sale_cannot_be_read_is_left_as_it_was(self):
		card = self._card(invoice=OTHER_INVOICE)

		self._run(_line(invoice=INVOICE, item_tax_rate="{}"))

		self.assertEqual(self._origin(card), ("Offered", None))

	def test_a_card_with_no_invoice_is_left_as_it_was(self):
		card = self._card()
		frappe.db.set_value("Coupon Code", card, "sales_invoice", None)

		self._run(_line(item_tax_rate="{}"))

		self.assertEqual(self._origin(card), ("Offered", None))

	def test_a_card_of_the_till_is_not_this_patchs(self):
		card = self._card(till=1)

		self._run(_line(item_tax_rate="{}"))

		self.assertEqual(self._origin(card), ("Offered", None))

	def test_a_card_that_already_says_it_was_sold_is_not_touched(self):
		with_vat = self._card(origin="Sold with VAT")
		without_vat = self._card(origin="Sold without VAT", account=REVENUE)

		self._run(_line(item_tax_rate='{"VAT 8.1%": 0}', income_account=DEBT))

		self.assertEqual(self._origin(with_vat), ("Sold with VAT", None))
		self.assertEqual(self._origin(without_vat), ("Sold without VAT", REVENUE))

	def test_it_can_be_run_again(self):
		card = self._card()
		self._run(_line(item_tax_rate='{"VAT 8.1%": 0}', income_account=DEBT))

		self._run(_line(item_tax_rate='{"VAT 8.1%": 8.1}', income_account=REVENUE))

		self.assertEqual(
			self._origin(card), ("Sold without VAT", DEBT), "a card that says it was sold is not read again"
		)

	def test_a_site_without_the_shop_has_nothing_to_do(self):
		real = frappe.db.has_column

		def has_column(doctype, column):
			return False if column == "sales_invoice" else real(doctype, column)

		with (
			patch.object(frappe.db, "has_column", side_effect=has_column),
			patch.object(the_patch, "_the_lines") as read,
		):
			the_patch.execute()

		read.assert_not_called()
