# //// Neoffice — added file (no upstream equivalent).
"""A gift card goes with the sale that created it (maintenance#2725).

The till creates a card when it sells one (create_gift_card_from_invoice, on submit). Nothing took it back: a sale of a card cancelled, or taken back by a
credit note, gave the customer the money back and left the card full, to spend. The suite plays it with real invoices, the sale and the return made by the
till's server path as the cashier, the cancel made by the head accountant:

- a card nobody has spent goes with its sale: cancelled or returned, its balance is 0 and its pricing rule disabled;
- a card already spent, even in part, stops the cancel or the return of its sale, and keeps what it holds;
- a credit note that takes back one card of two takes one, the one nobody has spent;
- a credit note that is cancelled gives its card back.
"""

import json

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from pos_next.api import invoices
from pos_next.patches.gift_cards import say_the_origin_of_each_gift_card as the_patch
from pos_next.tests.test_takeaway_tax_category import TakeawayTill, _item, _item_tax_template
from pos_next.tests.test_till_writes_need_the_till import TILL

CARD_ITEM = "_Test Gift Card Undone Voucher"


def _due(doc):
	return flt(doc.rounded_total) or flt(doc.grand_total)


class TestAGiftCardGoesWithTheSaleThatCreatedIt(TakeawayTill, FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		# A clone that has not migrated yet lacks the custom fields of a card: made before the class's transaction begins
		the_patch.ensure_the_columns()
		frappe.clear_cache(doctype="Coupon Code")
		frappe.db.commit()
		super().setUpClass()
		company = cls.fx.company
		zero = _item_tax_template(company, "_Test VAT 0 undone card", {cls.vat_81: 0, cls.vat_26: 0})
		cls.card_item = _item(CARD_ITEM, cls.dishes, company, [{"item_tax_template": zero}])
		cls.make_till(
			enable_restaurant_mode=1,
			enable_gift_cards=1,
			gift_card_item=cls.card_item,
			enable_gift_card_splitting=1,
		)

	# ------------------------------------------------------------------------------------------------ helpers
	def as_the_till(self, call, *args, **kwargs):
		frappe.set_user(TILL)
		try:
			return call(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def submit(self, sale, used=0, card=None):
		"""The sale as the till makes it: a draft, then paid and submitted (a card spent as the invoice's discount)."""
		if card:
			sale = {
				**sale,
				"coupon_code": frappe.db.get_value("Coupon Code", card, "coupon_code"),
				"posa_gift_card_amount_used": used,
				"discount_amount": used,
				"apply_discount_on": "Grand Total",
			}
		draft = self.as_the_till(invoices.update_invoice, json.dumps(sale))
		due = _due(frappe.get_doc("Sales Invoice", draft["name"]))
		paid = {**sale, "name": draft["name"], "payments": [{"mode_of_payment": self.fx.mode, "amount": due}]}
		done = self.as_the_till(invoices.submit_invoice, invoice=json.dumps(paid), data="{}")
		return frappe.get_doc("Sales Invoice", done["name"])

	def sell_cards(self, amount=100, qty=1):
		sale = self.sale([self.card_item])
		sale["items"][0].update({"rate": amount, "price_list_rate": amount, "qty": qty})
		sold = self.submit(sale)
		cards = frappe.get_all(
			"Coupon Code", filters={"source_invoice": sold.name}, pluck="name", order_by="creation asc"
		)
		self.assertEqual(len(cards), qty, "the sale created its cards")
		return sold, cards

	def give_back(self, sold, qty=1):
		"""The credit note, as the till's return dialog builds it (ReturnInvoiceDialog.vue), for qty of each line."""
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
					"qty": -qty,
					"rate": row.rate,
					"warehouse": row.warehouse,
					"uom": row.uom,
					"conversion_factor": 1,
					"sales_invoice_item": row.name,
				}
				for row in sold.items
			],
			"payments": [
				{"mode_of_payment": self.fx.mode, "amount": -sum(flt(row.rate) * qty for row in sold.items)}
			],
		}
		done = self.as_the_till(invoices.submit_invoice, invoice=json.dumps(returned), data="{}")
		return frappe.get_doc("Sales Invoice", done["name"])

	def cancel(self, name):
		# Cancelling a submitted sale is the head accountant's (an accountant may not on a site with the real rights)
		with as_role("head_accountant"):
			frappe.get_doc("Sales Invoice", name).cancel()

	def spend(self, card, used):
		self.submit(self.sale([self.food]), used=used, card=card)

	def balance_of(self, card):
		return flt(frappe.db.get_value("Coupon Code", card, "gift_card_amount"))

	def spendable(self, card):
		rule = frappe.db.get_value("Coupon Code", card, "pricing_rule")
		disabled, discount = frappe.db.get_value("Pricing Rule", rule, ["disable", "discount_amount"])
		return self.balance_of(card) > 0 and not disabled and flt(discount) > 0

	# ------------------------------------------------------------------------------------------------ a card nobody has spent
	def test_a_card_whose_sale_is_cancelled_can_no_longer_be_spent(self):
		sold, (card,) = self.sell_cards(100)

		self.cancel(sold.name)

		self.assertEqual(self.balance_of(card), 0)
		self.assertFalse(self.spendable(card), "the card of a cancelled sale is spendable")

	def test_a_card_whose_sale_is_returned_at_the_till_can_no_longer_be_spent(self):
		sold, (card,) = self.sell_cards(100)

		credit = self.give_back(sold)

		self.assertEqual(credit.docstatus, 1)
		self.assertEqual(self.balance_of(card), 0)
		self.assertFalse(self.spendable(card), "the card of a returned sale is spendable")

	def test_a_credit_note_that_takes_back_one_card_of_two_takes_the_one_nobody_has_spent(self):
		sold, (first, second) = self.sell_cards(100, qty=2)
		self.spend(first, 4)

		self.give_back(sold, qty=1)

		self.assertEqual((self.balance_of(first), self.balance_of(second)), (96, 0))
		self.assertTrue(self.spendable(first), "the card in use is left as it is")

	def test_a_cancelled_credit_note_gives_its_card_back(self):
		sold, (card,) = self.sell_cards(100)
		credit = self.give_back(sold)

		self.cancel(credit.name)

		self.assertEqual(self.balance_of(card), 100)
		self.assertTrue(self.spendable(card), "the card of a sale that stands again is spendable again")

	# ------------------------------------------------------------------------------------------------ a card already spent
	def test_a_card_already_used_stops_the_cancel_of_its_sale(self):
		sold, (card,) = self.sell_cards(100)
		self.spend(card, 4)

		with self.assertRaises(frappe.ValidationError):
			self.cancel(sold.name)

		self.assertEqual(self.balance_of(card), 96, "the card keeps what it holds")

	def test_a_card_already_used_stops_the_return_of_its_sale(self):
		sold, (card,) = self.sell_cards(100)
		self.spend(card, 4)

		with self.assertRaises(frappe.ValidationError):
			self.give_back(sold)

		self.assertEqual(self.balance_of(card), 96, "the card keeps what it holds")
