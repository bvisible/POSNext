# //// Neoffice — added file (no upstream equivalent).
"""What a gift card is for VAT (product owner, 16.11.2026; the Federal Tax Administration's MWST-Info 04, ch. 2.7.6).

A gift card the till sells is taxed when it is sold, as its item says, and spent as a discount of the invoice. There is no second kind: the « value voucher »
(sold at no VAT, spent as a payment) and its setting, its account, its VAT template, its mode of payment and its hooks are gone. The suite pins, with real
invoices read back with their ledger entries, as the till's own server path makes them:

- the till has no kind of gift card any more: no field, no setting on the till page, no hook, no provisioning, and saving its settings leaves its item as it is;
- the sale of a card: taxed when its item is, the card saying so; sold by an item at 0 %, the card saying « without VAT » and which account its sale credited;
  read on the card's own line when a taxed product is in the same basket; a sale that cannot be read is a sale with VAT;
- the spending, whatever the origin of the card (with VAT, without VAT, given for free, nothing said): a discount of the invoice, the balance of the card down;
- the patch that says, from the sales, where each card comes from.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from pos_next import gift_card_vat, till_tips
from pos_next.api import invoices
from pos_next.api.gift_cards import create_gift_card_manual as gift_card_manual
from pos_next.patches.gift_cards import say_the_origin_of_each_gift_card as the_patch
from pos_next.tests.test_takeaway_tax_category import PRICE, TakeawayTill, _item, _item_tax_template
from pos_next.tests.test_till_writes_need_the_till import TILL

CARD_ITEM = "_Test Gift Card Voucher"
TAXED_CARD_ITEM = "_Test Gift Card Taxed Voucher"
CODE = "VATCARD"
OLD_REVENUE_NAME = "_Test Old Gift Card Revenue"
WITH_VAT = gift_card_vat.ORIGIN_SOLD_WITH_VAT
WITHOUT_VAT = gift_card_vat.ORIGIN_SOLD_WITHOUT_VAT
OFFERED = gift_card_vat.ORIGIN_OFFERED


def _due(doc):
	return flt(doc.rounded_total) or flt(doc.grand_total)


class TestAGiftCardIsTaxedAtItsSaleAndSpentAsADiscount(TakeawayTill, FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		# A clone of a site that has not migrated yet has not the custom fields of a card (or has them as an earlier version made them): made and brought up to the
		# definitions of the patch, before the class's transaction begins
		the_patch.ensure_the_columns()
		for field in the_patch.FIELDS:
			name = f"Coupon Code-{field['fieldname']}"
			if frappe.db.exists("Custom Field", name):
				for key in ("options", "default", "depends_on"):
					if (frappe.db.get_value("Custom Field", name, key) or None) != (field.get(key) or None):
						frappe.db.set_value("Custom Field", name, key, field.get(key))
		frappe.clear_cache(doctype="Coupon Code")
		frappe.db.commit()
		super().setUpClass()
		company = cls.fx.company
		cls.zero = _item_tax_template(company, "_Test VAT 0 gift", {cls.vat_81: 0, cls.vat_26: 0})
		income_parent = frappe.db.get_value(
			"Account", {"company": company, "root_type": "Income", "is_group": 1}, "name"
		)
		cls.old_revenue = (
			frappe.db.get_value("Account", {"company": company, "account_name": OLD_REVENUE_NAME}, "name")
			or frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": OLD_REVENUE_NAME,
					"parent_account": income_parent,
					"company": company,
					"is_group": 0,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		# The item of the tills of the suite is set at 0 % (a card sold without VAT, which the patch tests read); the taxed one carries the usual rate
		cls.card_item = _item(CARD_ITEM, cls.dishes, company, [{"item_tax_template": cls.zero}])
		cls.taxed_card_item = _item(
			TAXED_CARD_ITEM, cls.dishes, company, [{"item_tax_template": cls.usual_template}]
		)
		cls.make_the_till()

	@classmethod
	def make_the_till(cls, **values):
		return cls.make_till(
			**{
				"enable_restaurant_mode": 1,
				"enable_gift_cards": 1,
				"gift_card_item": cls.card_item,
				"enable_gift_card_splitting": 1,
				**values,
			}
		)

	# ------------------------------------------------------------------------------------------------ helpers
	def a_card(self, amount=100, origin=WITHOUT_VAT, code=CODE, sale_account=None):
		rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": f"_Test VAT card {code}",
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Amount",
				"discount_amount": amount,
				"selling": 1,
				"company": self.fx.company,
				"currency": self.fx.currency,
				"valid_from": nowdate(),
				"coupon_code_based": 1,
				"priority": "1",
			}
		).insert(ignore_permissions=True)
		return (
			frappe.get_doc(
				{
					"doctype": "Coupon Code",
					"coupon_name": f"Gift Card {code}",
					"coupon_type": "Promotional",
					"coupon_code": code,
					"pricing_rule": rule.name,
					"pos_next_gift_card": 1,
					"gift_card_amount": amount,
					"original_gift_card_amount": amount,
					"pos_next_origin": origin,
					"pos_next_sale_account": sale_account,
					"valid_from": nowdate(),
					"maximum_use": 0,
				}
			)
			.insert(ignore_permissions=True, ignore_mandatory=True)
			.name
		)

	def balance_of(self, card):
		return flt(frappe.db.get_value("Coupon Code", card, "gift_card_amount"))

	def ledger(self, invoice):
		"""The ledger entries of an invoice as {account: debit - credit}."""
		rows = frappe.get_all(
			"GL Entry",
			filters={"voucher_type": "Sales Invoice", "voucher_no": invoice, "is_cancelled": 0},
			fields=["account", "debit", "credit"],
		)
		booked = {}
		for row in rows:
			booked[row.account] = flt(booked.get(row.account, 0) + flt(row.debit) - flt(row.credit), 2)
		return booked

	def submit(self, sale, used=0, card=None, pay_the_rest=True, until=1):
		"""The sale as the till makes it: saved as a draft, then paid and submitted (the card, when there is one, as the invoice's discount)."""
		if card:
			sale = {
				**sale,
				# The till sends the CODE the cashier typed, which the server resolves to the card's name
				"coupon_code": frappe.db.get_value("Coupon Code", card, "coupon_code"),
				"posa_gift_card_amount_used": used,
				"discount_amount": used,
				"apply_discount_on": "Grand Total",
			}
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(sale))
			due = _due(frappe.get_doc("Sales Invoice", draft["name"]))
			paid = {
				**sale,
				"name": draft["name"],
				"payments": [{"mode_of_payment": self.fx.mode, "amount": due}]
				if (pay_the_rest and due)
				else [],
			}
			done = invoices.submit_invoice(invoice=json.dumps(paid), data="{}")
		finally:
			frappe.set_user("Administrator")
		return frappe.get_doc("Sales Invoice", done["name"])

	def the_card_sale(self, amount=100, item=None):
		sale = self.sale([item or self.card_item])
		sale["items"][0].update({"rate": amount, "price_list_rate": amount})
		sale["payments"] = [{"mode_of_payment": self.fx.mode, "amount": amount}]
		return sale

	def the_cards_of(self, sold):
		return frappe.get_all(
			"Coupon Code",
			filters={"source_invoice": sold.name},
			fields=["pos_next_origin", "pos_next_sale_account", "gift_card_amount"],
		)

	# ------------------------------------------------------------------------------------------------ the kind is gone
	def test_a_till_has_no_kind_of_gift_card_any_more(self):
		from pos_next import hooks
		from pos_next.till_settings import registry

		meta = frappe.get_meta("POS Settings")
		gone = ("gift_card_kind", "gift_card_account", "gift_card_tax_template")
		for field in gone:
			self.assertFalse(meta.has_field(field), f"{field} is still a field of the till's settings")
		self.assertFalse(
			[setting.key for setting in registry.SETTINGS if setting.key in gone],
			"the till page still offers a setting that is gone",
		)
		declared = hooks.doc_events["Sales Invoice"]["before_validate"]
		self.assertFalse([path for path in declared if "gift_card_vat" in path])
		for name in (
			"provision",
			"the_kind_of",
			"the_card_pays_by_payment",
			"the_return_gives_the_card_back",
			"ensure_mode_of_payment",
		):
			self.assertFalse(hasattr(gift_card_vat, name), f"gift_card_vat.{name} is still there")

	def test_saving_the_settings_of_a_till_leaves_its_gift_card_item_as_it_is(self):
		self.make_the_till(gift_card_item=self.taxed_card_item)
		self.make_the_till(gift_card_item=self.card_item)

		taxed = frappe.get_doc("Item", self.taxed_card_item)
		untaxed = frappe.get_doc("Item", self.card_item)

		self.assertEqual(till_tips.vat_template_of(taxed, self.fx.company), self.usual_template)
		self.assertEqual(
			till_tips.vat_template_of(untaxed, self.fx.company),
			self.zero,
			"the item is neither taxed nor switched to 0 % by saving",
		)
		for item in (taxed, untaxed):
			self.assertFalse(
				[row for row in item.item_defaults if row.company == self.fx.company and row.income_account]
			)

	# ------------------------------------------------------------------------------------------------ the sale of a card
	def test_a_card_sold_by_a_taxed_item_carries_its_vat_and_says_it_was_taxed(self):
		self.make_the_till(gift_card_item=self.taxed_card_item)

		sold = self.submit(self.the_card_sale(100, item=self.taxed_card_item))

		self.assertGreater(flt(sold.total_taxes_and_charges), 0, "the sale of the card carries its VAT")
		self.assertEqual(
			[(row.pos_next_origin, row.pos_next_sale_account) for row in self.the_cards_of(sold)],
			[(WITH_VAT, None)],
		)

	def test_a_card_sold_by_an_item_at_zero_says_without_vat_and_the_account_its_sale_credited(self):
		sold = self.submit(self.the_card_sale(100))

		self.assertEqual(flt(sold.total_taxes_and_charges), 0)
		cards = self.the_cards_of(sold)
		self.assertEqual(
			[(row.pos_next_origin, row.pos_next_sale_account, flt(row.gift_card_amount)) for row in cards],
			[(WITHOUT_VAT, sold.items[0].income_account, 100.0)],
		)

	def test_the_card_of_a_basket_is_read_on_its_own_line_not_on_the_product_beside_it(self):
		basket = self.the_card_sale(60)
		basket["items"].append({**self.sale([self.food])["items"][0]})

		sold = self.submit(basket)

		self.assertEqual([row.pos_next_origin for row in self.the_cards_of(sold)], [WITHOUT_VAT])

	def test_a_sale_that_cannot_be_read_is_a_sale_with_vat(self):
		for invoice in (None, "SINV-THAT-IS-NOT-THERE"):
			self.assertEqual(gift_card_vat.the_sale_of_a_card(invoice, self.card_item, 100), (WITH_VAT, None))

	def test_a_card_made_without_a_sale_is_an_offered_one(self):
		# The button of the list (and a card made in the desk) makes a card nobody paid for
		made = gift_card_manual(100, self.fx.company)
		self.assertTrue(made.get("success"), made)

		origin = frappe.db.get_value("Coupon Code", made["name"], "pos_next_origin")

		self.assertEqual(origin, OFFERED)

	# ------------------------------------------------------------------------------------------------ the spending: a discount, whatever the origin
	def spent(self, card, used=20):
		sold = self.submit(self.sale([self.food, self.alcohol]), used=used, card=card)
		self.assertEqual(flt(sold.discount_amount), used, "the card is the discount of the invoice")
		self.assertEqual(
			{row.mode_of_payment for row in sold.payments} - {self.fx.mode},
			set(),
			"no payment row but the cashier's own",
		)
		return sold

	def test_a_card_sold_with_vat_is_spent_as_a_discount(self):
		card = self.a_card(20, origin=WITH_VAT)

		self.spent(card)

		self.assertEqual(self.balance_of(card), 0)

	def test_an_offered_card_is_spent_as_a_discount(self):
		card = self.a_card(20, origin=OFFERED)

		sold = self.spent(card)

		self.assertEqual(self.balance_of(card), 0)
		self.assertFalse(self.ledger(sold.name).get(self.old_revenue), "no account of a sale is touched")

	def test_a_card_sold_without_vat_is_spent_as_a_discount_too_at_the_till(self):
		# The way it used to be spent (a payment on the account its sale credited) is gone: the till takes every card as a discount
		card = self.a_card(20, origin=WITHOUT_VAT, sale_account=self.old_revenue)

		sold = self.spent(card)

		self.assertEqual(self.balance_of(card), 0)
		self.assertFalse(
			self.ledger(sold.name).get(self.old_revenue), "the account its sale credited is not cleared"
		)

	def test_a_card_that_says_nothing_is_spent_as_a_discount(self):
		card = self.a_card(20)
		frappe.db.set_value("Coupon Code", card, "pos_next_origin", None)

		self.spent(card)

	def test_a_partial_use_leaves_the_rest_on_the_card(self):
		card = self.a_card(100, origin=WITH_VAT, code="VATCARDPARTIAL")

		self.spent(card, used=20)

		self.assertEqual(self.balance_of(card), 80)

	# ------------------------------------------------------------------------------------------------ the patch that says where each card comes from
	def test_the_patch_makes_the_custom_fields_itself_when_the_fixtures_have_not_yet(self):
		# On a migration the patches run BEFORE the fixtures are imported: it would find no column, and do nothing
		with patch.object(frappe.db, "has_column", return_value=False):
			with patch("frappe.custom.doctype.custom_field.custom_field.create_custom_field") as made:
				the_patch.ensure_the_columns()

		self.assertEqual(
			[(call.args[0], call.args[1]["fieldname"]) for call in made.call_args_list],
			[("Coupon Code", "pos_next_origin"), ("Coupon Code", "pos_next_sale_account")],
		)

		with patch("frappe.custom.doctype.custom_field.custom_field.create_custom_field") as untouched:
			the_patch.ensure_the_columns()
		untouched.assert_not_called()

	def _origin_of(self, card):
		return frappe.db.get_value(
			"Coupon Code", card, ["pos_next_origin", "pos_next_sale_account"], as_dict=True
		)

	def test_the_patch_reads_the_line_that_sold_a_card_even_when_its_item_is_no_longer_the_tills(self):
		# The item a till sells as a gift card can have changed since: the line that sold the card is the one whose price is its value
		other_sale = self.submit(self.sale([self.food]))
		card = self.a_card(PRICE, code="VATCARDOTHERITEM", origin=OFFERED)
		frappe.db.set_value("Coupon Code", card, "source_invoice", other_sale.name)

		the_patch.execute()

		self.assertEqual(self._origin_of(card).pos_next_origin, WITH_VAT)

	def test_the_patch_is_not_fooled_by_a_taxed_product_sold_in_the_same_basket_as_an_untaxed_card(self):
		basket = self.the_card_sale(60)
		basket["items"].append({**self.sale([self.food])["items"][0]})
		sold = self.submit(basket)
		card = frappe.get_all("Coupon Code", filters={"source_invoice": sold.name}, pluck="name")[0]
		frappe.db.set_value("Coupon Code", card, "pos_next_origin", WITH_VAT)

		the_patch.execute()

		# The line that sold the card (its price is the card's value) carried no VAT, whatever the product beside it was charged
		self.assertEqual(self._origin_of(card).pos_next_origin, WITHOUT_VAT)

	def _a_card_sold_on_a_line_with_no_template(self, invoice_rate):
		"""A card sold on a line with no item tax template, on an invoice whose VAT rows carry `invoice_rate`; its origin is set to offered for the patch to say."""
		sold = self.submit(self.the_card_sale(60))
		card = frappe.get_all("Coupon Code", filters={"source_invoice": sold.name}, pluck="name")[0]
		frappe.db.set_value("Sales Invoice Item", {"parent": sold.name}, "item_tax_rate", "{}")
		frappe.db.set_value(
			"Sales Taxes and Charges",
			{"parent": sold.name, "parenttype": "Sales Invoice"},
			"rate",
			invoice_rate,
		)
		frappe.db.set_value("Coupon Code", card, "pos_next_origin", OFFERED)
		the_patch.execute()
		return self._origin_of(card).pos_next_origin

	def test_a_line_with_no_template_is_charged_the_rate_of_its_invoice_so_its_card_was_sold_with_vat(self):
		# A site that sells with one tax row at the standard rate: an item with no template is charged that rate
		self.assertEqual(self._a_card_sold_on_a_line_with_no_template(8.1), WITH_VAT)

	def test_a_line_with_no_template_where_the_rows_of_the_invoice_are_at_zero_was_sold_without_vat(self):
		# The Swiss layout item by item (the tests' own): the rows are at 0 and each item's template gives the rate, so no template is no VAT
		self.assertEqual(self._a_card_sold_on_a_line_with_no_template(0), WITHOUT_VAT)

	def test_a_template_at_zero_wins_over_the_rate_of_the_invoice(self):
		sold = self.submit(self.the_card_sale(60))
		card = frappe.get_all("Coupon Code", filters={"source_invoice": sold.name}, pluck="name")[0]
		frappe.db.set_value(
			"Sales Taxes and Charges", {"parent": sold.name, "parenttype": "Sales Invoice"}, "rate", 8.1
		)
		frappe.db.set_value("Coupon Code", card, "pos_next_origin", WITH_VAT)

		the_patch.execute()

		# The line names both VAT accounts at 0 (the template of a value voucher): no VAT, whatever the rows of the invoice say
		self.assertEqual(self._origin_of(card).pos_next_origin, WITHOUT_VAT)

	def test_a_card_whose_sale_line_cannot_be_told_keeps_the_old_way_when_any_line_of_its_sale_was_taxed(
		self,
	):
		other_sale = self.submit(self.sale([self.food, self.alcohol]))
		card = self.a_card(77, code="VATCARDDOUBT")
		frappe.db.set_value("Coupon Code", card, "source_invoice", other_sale.name)

		the_patch.execute()

		self.assertEqual(self._origin_of(card).pos_next_origin, WITH_VAT)

	def test_the_patch_keeps_the_account_the_sale_of_a_card_sold_before_credited(self):
		# Before the change the item booked the sale on a revenue account: spending the card must clear that one
		sold = self.submit(self.the_card_sale(60))
		frappe.db.set_value("Sales Invoice Item", {"parent": sold.name}, "income_account", self.old_revenue)
		card = frappe.get_all("Coupon Code", filters={"source_invoice": sold.name}, pluck="name")[0]
		frappe.db.set_value("Coupon Code", card, {"pos_next_origin": OFFERED, "pos_next_sale_account": None})

		the_patch.execute()

		self.assertEqual(
			(self._origin_of(card).pos_next_origin, self._origin_of(card).pos_next_sale_account),
			(WITHOUT_VAT, self.old_revenue),
		)

	def test_a_card_made_by_hand_is_offered_and_so_is_one_whose_sale_cannot_be_read(self):
		by_hand = self.a_card(10, code="VATCARDHAND", origin=WITHOUT_VAT)
		gone = self.a_card(10, code="VATCARDGONE", origin=WITHOUT_VAT)
		frappe.db.set_value("Coupon Code", gone, "source_invoice", "SINV-THAT-IS-NOT-THERE")

		the_patch.execute()

		self.assertEqual(self._origin_of(by_hand).pos_next_origin, OFFERED)
		self.assertEqual(self._origin_of(gone).pos_next_origin, OFFERED)
		self.assertFalse(self._origin_of(by_hand).pos_next_sale_account)

	def test_the_patch_removes_the_yes_no_field_a_first_version_made(self):
		with patch.object(frappe.db, "exists", return_value=True) as exists:
			with patch("frappe.delete_doc") as deleted:
				the_patch.execute()

		exists.assert_any_call("Custom Field", the_patch.OLD_FLAG)
		deleted.assert_called_with("Custom Field", the_patch.OLD_FLAG, force=True, ignore_permissions=True)

	def test_the_patch_says_from_the_sales_where_each_card_comes_from(self):
		taxed_sale = self.submit(self.the_card_sale(100))
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": taxed_sale.name}, "item_tax_rate", json.dumps({self.vat_81: 8.1})
		)
		untaxed = self.submit(self.the_card_sale(40))
		by_hand = self.a_card(10, code="VATCARDHAND", origin=WITHOUT_VAT)
		taxed_card = frappe.get_all("Coupon Code", filters={"source_invoice": taxed_sale.name}, pluck="name")[
			0
		]
		untaxed_card = frappe.get_all("Coupon Code", filters={"source_invoice": untaxed.name}, pluck="name")[
			0
		]
		for name in (taxed_card, untaxed_card, by_hand):
			frappe.db.set_value(
				"Coupon Code", name, "pos_next_origin", WITH_VAT if name == by_hand else OFFERED
			)

		the_patch.execute()

		origins = {
			name: frappe.db.get_value("Coupon Code", name, "pos_next_origin")
			for name in (taxed_card, untaxed_card, by_hand)
		}
		self.assertEqual(origins, {taxed_card: WITH_VAT, untaxed_card: WITHOUT_VAT, by_hand: OFFERED})
