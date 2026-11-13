# //// Neoffice — added file (no upstream equivalent).
"""The VAT, the account and the commission of the tip of a shop till are the client's choices (product owner, 13.11.2026).

« Une valeur légale est un réglage que le client remplit […] on ne veut pas être accusé de faire les choses fausses. » The tip of a shop till used to
be booked on an account the code made (2211), with a VAT template the code found (at 0 %, and, when the site had none, nothing at all and no word),
and with a commission the code forced back to zero at every provisioning. The suite pins what replaces it, as the till manager of the till:

- tips are REFUSED, in words, where the company has no item tax template at 0 % and none was chosen: nothing is made, the setting stays off;
- an empty VAT setting is given the template at 0 % of the company; a template the client chooses is the one the tip item holds, and is kept; a
  template of another company is refused;
- the account is the one the client chooses (2211 is only proposed when none is), and the tip item is booked on it for the till's company;
- the commission is none until the client says « like the sale », and nothing sets it back: a later save of another setting leaves it;
- the three settings are listed with the choices the client picks from, and the VAT carries the source cited beside it.
"""

from unittest.mock import patch

import frappe

from pos_next import till_tips
from pos_next.tests.test_till_settings import TILL_MANAGER, TillSettingsCase, by_key
from pos_next.tests.test_tips_at_a_shop_till import a_parent_for_the_tip_account, a_zero_rate_template
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "enable_till_tips"
VAT = "till_tip_tax_template"
ACCOUNT = "till_tip_account"
COMMISSION = "till_tip_commission"


class TestTheTipsOfAShopTillAreWhatTheClientChose(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		a_parent_for_the_tip_account(cls.fx.company)

	def setUp(self):
		super().setUp()
		self.company = self.fx.company
		self.zero = a_zero_rate_template(self.company)
		self.eight = a_zero_rate_template(self.company, title="_Test Tip VAT 8.1", rate=8.1)

	def save(self, **values):
		"""A save of the till manager, the way the till's settings screen makes it."""
		self.as_user(TILL_MANAGER)
		try:
			return save_till_settings(self.shop_till, {KEY: 1, **values})
		finally:
			frappe.set_user("Administrator")

	def stored(self, *fields):
		return self.stored_settings(self.shop_till, *fields)

	def tip_item(self):
		return frappe.get_doc("Item", till_tips.TIP_ITEM)

	# ------------------------------------------------------------------------------------------------ the VAT
	def test_tips_are_refused_in_words_where_the_company_has_no_template_at_zero_and_none_was_chosen(self):
		with patch.object(till_tips, "zero_rate_templates", return_value=[]):
			with self.assertRaises(frappe.ValidationError) as refused:
				self.save()

		self.assertIn("item tax template at 0 %", str(refused.exception))
		stored = self.stored(KEY, "till_tip_item", VAT)
		self.assertEqual((stored[KEY], stored.till_tip_item, stored[VAT]), (0, None, None))

	def test_an_empty_vat_setting_is_given_the_template_at_zero_of_the_company_and_the_item_holds_it(self):
		self.save()

		stored = self.stored(VAT)
		self.assertEqual(stored[VAT], self.zero)
		self.assertEqual(till_tips.vat_template_of(self.tip_item(), self.company), self.zero)

	def test_a_template_the_client_chooses_is_the_one_the_tip_carries_and_it_is_kept(self):
		self.save(**{VAT: self.eight})
		self.save(till_tips_auto_detect=0)

		self.assertEqual(self.stored(VAT)[VAT], self.eight)
		self.assertEqual(till_tips.vat_template_of(self.tip_item(), self.company), self.eight)

	def test_the_vat_the_client_changes_replaces_the_one_before_for_the_company_only(self):
		self.save()
		self.save(**{VAT: self.eight})

		taxes = [row.item_tax_template for row in self.tip_item().taxes]
		self.assertIn(self.eight, taxes)
		self.assertNotIn(self.zero, taxes)

	def test_a_template_of_another_company_is_refused(self):
		other = frappe.db.get_value("Company", {"name": ["!=", self.company]}, "name")
		if not other:
			self.skipTest("the site has one company only")
		foreign = a_zero_rate_template(other, title="_Test Tip VAT Of Another Company")

		with self.assertRaises(frappe.ValidationError):
			self.save(**{VAT: foreign})

		self.assertEqual(self.stored(KEY)[KEY], 0)

	# ------------------------------------------------------------------------------------------------ the account
	def test_the_account_the_client_chooses_is_the_one_the_tip_is_booked_on(self):
		account = self.an_account("_Test Tip Own Account")

		self.save(**{ACCOUNT: account})

		self.assertEqual(self.stored(ACCOUNT)[ACCOUNT], account)
		row = next(row for row in self.tip_item().item_defaults if row.company == self.company)
		self.assertEqual(row.income_account, account)

	def test_the_transit_account_is_only_proposed_when_the_client_chose_none(self):
		self.save()

		account = self.stored(ACCOUNT)[ACCOUNT]
		self.assertEqual(frappe.db.get_value("Account", account, "account_number"), "2211")

	def test_a_change_of_account_moves_the_tip_item_to_it(self):
		self.save()
		account = self.an_account("_Test Tip Moved Account")

		self.save(**{ACCOUNT: account})

		row = next(row for row in self.tip_item().item_defaults if row.company == self.company)
		self.assertEqual(row.income_account, account)

	def an_account(self, name):
		parent = frappe.db.get_value(
			"Account", {"company": self.company, "root_type": "Liability", "is_group": 1}, "name"
		)
		existing = frappe.db.get_value("Account", {"account_name": name, "company": self.company}, "name")
		return (
			existing
			or frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": name,
					"parent_account": parent,
					"company": self.company,
					"is_group": 0,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	# ------------------------------------------------------------------------------------------------ the commission
	def test_the_tip_grants_no_commission_until_the_client_says_otherwise(self):
		self.save()

		self.assertEqual(self.stored(COMMISSION)[COMMISSION], "None")
		self.assertEqual(self.tip_item().grant_commission, 0)

	def test_a_commission_like_the_sale_is_written_on_the_tip_item_and_nothing_sets_it_back(self):
		self.save(**{COMMISSION: "Like the sale"})
		self.assertEqual(self.tip_item().grant_commission, 1)

		# A later save of another setting leaves what the client chose
		self.save(till_tips_auto_detect=0)

		self.assertEqual(self.tip_item().grant_commission, 1)

	def test_the_client_can_go_back_to_none(self):
		self.save(**{COMMISSION: "Like the sale"})
		self.save(**{COMMISSION: "None"})

		self.assertEqual(self.tip_item().grant_commission, 0)

	def test_a_value_the_commission_does_not_offer_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.save(**{COMMISSION: "Always"})

	# ------------------------------------------------------------------------------------------------ what the screen draws
	def test_the_three_settings_come_with_the_choices_the_client_picks_from(self):
		self.save()
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)
		settings = by_key(answer)

		templates = {choice["value"]: choice["label"] for choice in answer["choices"][VAT]}
		self.assertIn("0 %", templates[self.zero])
		self.assertIn("8.1 %", templates[self.eight])
		accounts = [choice["value"] for choice in answer["choices"][ACCOUNT]]
		self.assertIn(self.stored(ACCOUNT)[ACCOUNT], accounts)
		self.assertEqual(
			[option["value"] for option in settings[COMMISSION]["options"]], ["None", "Like the sale"]
		)

	def test_the_vat_carries_the_source_cited_beside_it_and_says_it_is_a_secondary_one(self):
		self.as_user(TILL_MANAGER)

		settings = by_key(get_till_settings(self.shop_till))

		(source,) = settings[VAT]["sources"]
		self.assertTrue(source["url"].startswith("https://www.beobachter.ch/"))
		self.assertIn("Secondary source", source["note"])
		# What has no source says so, instead of a link that proves nothing
		(none,) = settings[COMMISSION]["sources"]
		self.assertIsNone(none["url"])
		self.assertEqual(settings[ACCOUNT]["sources"], [])
