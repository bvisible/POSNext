# //// Neoffice — added file (no upstream equivalent).
"""What a gift card is for VAT (NeoCoiffeur study, product owner, 13.11.2026; the Federal Tax Administration's MWST-Info 04, ch. 2.7.6).

A value voucher is a means of payment: its sale is no supply and carries no VAT, booked as a debt to the holder; the card is spent as a PAYMENT, so that
the invoice carries its full price and its VAT is taken in full. A service voucher is taxed when it is sold, as its item, and spent as a discount (its VAT
is taken already). The suite pins, with real invoices read back with their ledger entries, as the till's own server path makes them:

- the provisioning of a value voucher: the account, the template at 0 %, the mode of payment and the item, and the refusal, in words, where the company
  has no template at 0 % and none was chosen; nothing is made for a service voucher;
- the sale of a card: no VAT, booked on the liability account, the card saying where it comes from and which account its sale credited;
- the spending: a payment row of the mode of payment, the invoice at its full price and its VAT in full, the ledger clearing the debt to the holder;
  an invoice a card covers entirely is booked all the same; a card sold with VAT, an offered card, or a till with no account for it, keeps the discount;
  a card sold before, whose sale was credited to revenue, clears that account and never leaves the debt account negative;
- the return of such a sale gives the card's share back to the debt, and the balance of the card with it;
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

HOOKS = (
	"pos_next.gift_card_vat.the_card_pays_by_payment",
	"pos_next.gift_card_vat.the_return_gives_the_card_back",
)
CARD_ITEM = "_Test Gift Card Voucher"
ACCOUNT_NAME = "_Test Gift Card Debt"
CODE = "VATCARD"
OLD_REVENUE_NAME = "_Test Old Gift Card Revenue"
WITH_VAT = gift_card_vat.ORIGIN_SOLD_WITH_VAT
WITHOUT_VAT = gift_card_vat.ORIGIN_SOLD_WITHOUT_VAT
OFFERED = gift_card_vat.ORIGIN_OFFERED


def _due(doc):
	return flt(doc.rounded_total) or flt(doc.grand_total)


class TestAValueGiftCardIsSpentAsAPayment(TakeawayTill, FrappeTestCase):
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
		# The doc events as THIS process reads them: a copy of the app run from a folder of its own (a test of a change not yet on the bench) must not
		# write its hooks in the site's cache, which every other process reads. Where the hooks are the bench's own they are there already.
		events = frappe.get_doc_hooks().setdefault("Sales Invoice", {}).setdefault("before_validate", [])
		for path in HOOKS:
			if path not in events:
				events.append(path)
				cls.addClassCleanup(events.remove, path)
		company = cls.fx.company
		cls.zero = _item_tax_template(company, "_Test VAT 0 gift", {cls.vat_81: 0, cls.vat_26: 0})
		parent = frappe.db.get_value(
			"Account", {"company": company, "root_type": "Liability", "is_group": 1}, "name"
		)
		cls.liability = (
			frappe.db.get_value("Account", {"company": company, "account_name": ACCOUNT_NAME}, "name")
			or frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": ACCOUNT_NAME,
					"parent_account": parent,
					"company": company,
					"is_group": 0,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
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
		cls.card_item = _item(CARD_ITEM, cls.dishes, company, [])
		cls.make_the_till()

	@classmethod
	def make_the_till(cls, **values):
		return cls.make_till(
			**{
				"enable_restaurant_mode": 1,
				"enable_gift_cards": 1,
				"gift_card_kind": gift_card_vat.KIND_VALUE,
				"gift_card_item": cls.card_item,
				"gift_card_account": cls.liability,
				"gift_card_tax_template": cls.zero,
				"enable_gift_card_splitting": 1,
				**values,
			}
		)

	# ------------------------------------------------------------------------------------------------ helpers
	def a_card(self, amount=100, origin=gift_card_vat.ORIGIN_SOLD_WITHOUT_VAT, code=CODE, sale_account=None):
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

	def gl_balance(self, account):
		"""debit - credit of an account over everything the test booked (the debt to the holders must never be a debit)."""
		row = frappe.db.sql(
			"select sum(debit) - sum(credit) from `tabGL Entry` where account = %s and is_cancelled = 0",
			account,
		)
		return flt(row[0][0]) if row else 0

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

	def the_card_sale(self, amount=100):
		sale = self.sale([self.card_item])
		sale["items"][0].update({"rate": amount, "price_list_rate": amount})
		sale["payments"] = [{"mode_of_payment": self.fx.mode, "amount": amount}]
		return sale

	def test_the_hooks_are_declared_by_the_app(self):
		from pos_next import hooks

		declared = hooks.doc_events["Sales Invoice"]["before_validate"]
		for path in HOOKS:
			self.assertIn(path, declared)

	# ------------------------------------------------------------------------------------------------ the provisioning
	def test_a_value_voucher_is_given_its_item_its_template_its_account_and_its_mode_of_payment(self):
		item = frappe.get_doc("Item", CARD_ITEM)
		self.assertEqual(till_tips.vat_template_of(item, self.fx.company), self.zero)
		self.assertEqual(
			[row.income_account for row in item.item_defaults if row.company == self.fx.company],
			[self.liability],
		)
		self.assertTrue(frappe.db.exists("Mode of Payment", gift_card_vat.MODE_OF_PAYMENT))

	def test_a_value_voucher_with_no_template_at_zero_is_refused_in_words(self):
		with patch.object(till_tips, "zero_rate_templates", return_value=[]):
			with self.assertRaises(frappe.ValidationError) as refused:
				self.make_the_till(gift_card_tax_template=None)

		self.assertIn("item tax template at 0 %", str(refused.exception))

	def test_a_service_voucher_is_left_to_its_item(self):
		other = _item("_Test Gift Card Service Voucher", self.dishes, self.fx.company, [])

		self.make_the_till(
			gift_card_kind=gift_card_vat.KIND_SERVICE,
			gift_card_item=other,
			gift_card_account=None,
			gift_card_tax_template=None,
		)

		item = frappe.get_doc("Item", other)
		self.assertIsNone(till_tips.vat_template_of(item, self.fx.company))
		self.assertFalse(
			[row for row in item.item_defaults if row.company == self.fx.company and row.income_account]
		)

	def test_an_item_cannot_be_the_gift_card_item_of_two_kinds_of_card(self):
		shared = _item("_Test Gift Card Shared Item", self.dishes, self.fx.company, [])
		self.make_the_till(
			gift_card_kind=gift_card_vat.KIND_SERVICE,
			gift_card_item=shared,
			gift_card_account=None,
			gift_card_tax_template=None,
		)
		# A second till (not saved) that would sell the same item as value vouchers
		second = frappe._dict(
			name="_Test Second Till Settings",
			pos_profile=self.till,
			enable_gift_cards=1,
			gift_card_kind=gift_card_vat.KIND_VALUE,
			gift_card_item=shared,
			gift_card_account=self.liability,
			gift_card_tax_template=self.zero,
			is_new=lambda: True,
			has_value_changed=lambda field: True,
		)

		with self.assertRaises(frappe.ValidationError) as refused:
			gift_card_vat.provision(second)

		self.assertIn("give each kind its own item", str(refused.exception))

	def test_a_template_of_another_company_is_refused(self):
		foreign = frappe.db.get_value("Item Tax Template", {"company": ["!=", self.fx.company]}, "name")
		if not foreign:
			self.skipTest("the site has one company only")

		with self.assertRaises(frappe.ValidationError):
			self.make_the_till(gift_card_tax_template=foreign)

	# ------------------------------------------------------------------------------------------------ the sale of a card
	def test_the_sale_of_a_value_card_carries_no_vat_and_is_booked_on_the_debt_to_the_holder(self):
		sold = self.submit(self.the_card_sale(100))

		self.assertEqual(flt(sold.total_taxes_and_charges), 0)
		self.assertEqual(flt(sold.grand_total), 100)
		booked = self.ledger(sold.name)
		self.assertEqual(booked.get(self.liability), -100)
		self.assertFalse(
			[account for account in booked if account in (self.vat_81, self.vat_26) and booked[account]]
		)

	def test_a_card_made_by_a_sale_says_where_it_comes_from_and_what_its_sale_credited(self):
		sold = self.submit(self.the_card_sale(100))

		card = frappe.get_all(
			"Coupon Code",
			filters={"source_invoice": sold.name},
			fields=["pos_next_origin", "pos_next_sale_account", "gift_card_amount"],
		)

		self.assertEqual(
			[(row.pos_next_origin, row.pos_next_sale_account, flt(row.gift_card_amount)) for row in card],
			[(gift_card_vat.ORIGIN_SOLD_WITHOUT_VAT, self.liability, 100.0)],
		)

	def test_a_card_made_without_a_sale_is_an_offered_one(self):
		# The button of the list (and a card made in the desk) makes a card nobody paid for
		made = gift_card_manual(100, self.fx.company)
		self.assertTrue(made.get("success"), made)

		origin = frappe.db.get_value("Coupon Code", made["name"], "pos_next_origin")

		self.assertEqual(origin, gift_card_vat.ORIGIN_OFFERED)

	def test_the_card_a_service_voucher_sale_makes_says_it_was_taxed(self):
		other = _item(
			"_Test Gift Card Service Voucher 2",
			self.dishes,
			self.fx.company,
			[{"item_tax_template": self.usual_template}],
		)
		self.make_the_till(
			gift_card_kind=gift_card_vat.KIND_SERVICE,
			gift_card_item=other,
			gift_card_account=None,
			gift_card_tax_template=None,
		)
		sale = self.the_card_sale(100)
		sale["items"][0]["item_code"] = other

		sold = self.submit(sale)

		self.assertGreater(flt(sold.total_taxes_and_charges), 0)
		card = frappe.get_all("Coupon Code", filters={"source_invoice": sold.name}, pluck="pos_next_origin")
		self.assertEqual(card, [gift_card_vat.ORIGIN_SOLD_WITH_VAT])

	# ------------------------------------------------------------------------------------------------ the spending
	def test_a_value_card_spent_on_a_sale_is_a_payment_and_the_vat_is_taken_in_full(self):
		card = self.a_card(20)
		whole = self.sale([self.food, self.alcohol])

		sold = self.submit(whole, used=20, card=card)

		# The invoice carries its full price and its VAT in full, the card among its payments
		self.assertEqual(flt(sold.discount_amount), 0)
		self.assertEqual(flt(sold.grand_total), flt(PRICE * 2, 2))
		self.assertEqual(
			flt(sold.total_taxes_and_charges, 2), flt(flt(PRICE * 2, 2) - flt(PRICE * 2 / 1.081, 2), 2)
		)
		by_mode = {row.mode_of_payment: flt(row.amount) for row in sold.payments}
		self.assertEqual(by_mode.get(gift_card_vat.MODE_OF_PAYMENT), 20)
		# What the till rounds is the till's: the payments cover the sale to the rounding of its total
		self.assertAlmostEqual(sum(by_mode.values()), _due(sold), delta=0.06)
		# The ledger clears the debt to the holder for the card's part, and the card holds what is left
		self.assertEqual(self.ledger(sold.name).get(self.liability), 20)
		self.assertEqual(self.balance_of(card), 0)

	def test_a_partial_use_leaves_the_rest_on_the_card(self):
		card = self.a_card(100)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=15, card=card)

		self.assertEqual(self.balance_of(card), 85)
		self.assertEqual(self.ledger(sold.name).get(self.liability), 15)

	def test_an_invoice_a_card_covers_entirely_is_booked_like_any_other(self):
		card = self.a_card(50)
		whole = self.sale([self.food])
		total = flt(PRICE, 2)

		sold = self.submit(whole, used=total, card=card, pay_the_rest=False)

		# It used to book nothing at all (a total of 0: no revenue, no VAT)
		self.assertEqual(flt(sold.grand_total), total)
		booked = self.ledger(sold.name)
		self.assertEqual(booked.get(self.liability), total)
		self.assertTrue(booked, "the invoice a card covers entirely is booked")
		self.assertEqual(flt(sold.outstanding_amount), 0)
		self.assertEqual(self.balance_of(card), flt(50 - total, 2))

	def test_a_card_sold_with_vat_is_still_a_discount(self):
		card = self.a_card(20, origin=gift_card_vat.ORIGIN_SOLD_WITH_VAT)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		self.assertEqual(flt(sold.discount_amount), 20)
		self.assertNotIn(gift_card_vat.MODE_OF_PAYMENT, [row.mode_of_payment for row in sold.payments])
		self.assertEqual(self.balance_of(card), 0)

	def test_an_offered_card_is_a_discount_whose_vat_is_taken_on_what_is_paid(self):
		# No money came in for it: a payment would clear a debt to the holder that was never booked
		card = self.a_card(20, origin=OFFERED)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		self.assertEqual(flt(sold.discount_amount), 20)
		self.assertNotIn(gift_card_vat.MODE_OF_PAYMENT, [row.mode_of_payment for row in sold.payments])
		self.assertFalse(self.ledger(sold.name).get(self.liability), "the debt account is not touched")
		self.assertEqual(self.balance_of(card), 0)

	def test_a_card_that_says_nothing_is_an_offered_one(self):
		card = self.a_card(20)
		frappe.db.set_value("Coupon Code", card, "pos_next_origin", None)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		self.assertEqual(flt(sold.discount_amount), 20)
		self.assertNotIn(gift_card_vat.MODE_OF_PAYMENT, [row.mode_of_payment for row in sold.payments])

	def test_a_card_sold_before_clears_the_account_its_sale_credited_not_the_debt_account(self):
		# Its sale (no VAT) was credited to a REVENUE account: debiting the debt account instead would leave that account negative and count the revenue twice
		card = self.a_card(20, sale_account=self.old_revenue)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		by_account = {row.mode_of_payment: row.account for row in sold.payments}
		self.assertEqual(by_account.get(gift_card_vat.MODE_OF_PAYMENT), self.old_revenue)
		booked = self.ledger(sold.name)
		self.assertEqual(booked.get(self.old_revenue), 20)
		self.assertFalse(booked.get(self.liability), "the debt account is not touched")
		self.assertEqual(flt(sold.discount_amount), 0)
		# The VAT is taken on the full price
		self.assertEqual(
			flt(sold.total_taxes_and_charges, 2), flt(flt(PRICE * 2, 2) - flt(PRICE * 2 / 1.081, 2), 2)
		)

	def test_a_card_sold_since_clears_the_debt_account_and_it_never_goes_negative_on_the_wrong_side(self):
		sold_card = self.submit(self.the_card_sale(100))
		card = frappe.get_all("Coupon Code", filters={"source_invoice": sold_card.name}, pluck="name")[0]

		self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		# 100 credited when the card was sold, 20 debited when it was spent: what is owed to the holder is 80, a credit
		self.assertEqual(self.gl_balance(self.liability), -80)
		self.assertEqual(self.balance_of(card), 80)

	def test_a_card_whose_account_belongs_to_another_company_is_spent_through_the_till_account(self):
		other = frappe.db.get_value(
			"Account", {"root_type": "Income", "is_group": 0, "company": ["!=", self.fx.company]}, "name"
		)
		if not other:
			self.skipTest("no account of another company on this site")
		card = self.a_card(20, sale_account=other)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		by_account = {row.mode_of_payment: row.account for row in sold.payments}
		self.assertEqual(by_account.get(gift_card_vat.MODE_OF_PAYMENT), self.liability)

	def test_a_till_with_no_account_for_the_card_leaves_it_a_discount(self):
		card = self.a_card(20)
		self.make_the_till(gift_card_kind=gift_card_vat.KIND_VALUE, gift_card_account=None)
		frappe.db.set_value("POS Settings", {"pos_profile": self.till}, "gift_card_account", None)

		sold = self.submit(self.sale([self.food, self.alcohol]), used=20, card=card)

		self.assertEqual(flt(sold.discount_amount), 20)
		self.assertNotIn(gift_card_vat.MODE_OF_PAYMENT, [row.mode_of_payment for row in sold.payments])

	def test_a_sale_with_no_card_is_untouched(self):
		sold = self.submit(self.sale([self.food, self.alcohol]))

		self.assertNotIn(gift_card_vat.MODE_OF_PAYMENT, [row.mode_of_payment for row in sold.payments])
		self.assertEqual(flt(sold.discount_amount), 0)

	# ------------------------------------------------------------------------------------------------ the return
	def return_of(self, sold, quantity=-1):
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
					"qty": quantity,
					"rate": row.rate,
					"warehouse": row.warehouse,
					"uom": row.uom,
					"conversion_factor": 1,
					"sales_invoice_item": row.name,
				}
				for row in sold.items[:1]
			],
			"payments": [{"mode_of_payment": self.fx.mode, "amount": flt(-PRICE * abs(quantity), 2)}],
		}
		frappe.set_user(TILL)
		try:
			done = invoices.submit_invoice(invoice=json.dumps(returned), data="{}")
		finally:
			frappe.set_user("Administrator")
		return frappe.get_doc("Sales Invoice", done["name"])

	def test_the_return_of_a_sale_a_card_paid_gives_the_card_back(self):
		card = self.a_card(20)
		sold = self.submit(self.sale([self.food]), used=flt(PRICE, 2), card=card, pay_the_rest=False)
		self.assertEqual(self.balance_of(card), flt(20 - PRICE, 2))

		credit = self.return_of(sold)

		by_mode = {row.mode_of_payment: flt(row.amount) for row in credit.payments}
		self.assertEqual(by_mode.get(gift_card_vat.MODE_OF_PAYMENT), -flt(PRICE, 2))
		self.assertEqual(flt(by_mode.get(self.fx.mode, 0)), 0)
		self.assertEqual(self.balance_of(card), 20)
		self.assertEqual(self.ledger(credit.name).get(self.liability), -flt(PRICE, 2))

	def test_the_return_of_a_sale_an_old_card_paid_gives_back_to_the_account_the_sale_credited(self):
		card = self.a_card(20, sale_account=self.old_revenue)
		sold = self.submit(self.sale([self.food]), used=flt(PRICE, 2), card=card, pay_the_rest=False)

		credit = self.return_of(sold)

		self.assertEqual(self.ledger(credit.name).get(self.old_revenue), -flt(PRICE, 2))
		self.assertFalse(self.ledger(credit.name).get(self.liability))
		self.assertEqual(self.balance_of(card), 20)

	# ------------------------------------------------------------------------------------------------ the patch
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

	def test_the_patch_says_from_the_sales_where_each_card_comes_from_and_what_each_till_sells(self):
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
		# A till whose gift card item was sold with a rate is a service-voucher till
		self.assertEqual(
			frappe.db.get_value("POS Settings", {"pos_profile": self.till}, "gift_card_kind"),
			gift_card_vat.KIND_SERVICE,
		)
