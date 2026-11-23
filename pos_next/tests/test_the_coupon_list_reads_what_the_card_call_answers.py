# //// Neoffice — added file (no upstream equivalent).
"""The « Créer une carte cadeau » button of the Coupon Code list and the dialog it opens (screen test
`gift-card-spending`, 23.11.2026). The dialog says « Valeur : <strong>{gift_card.formatted_amount}</strong> » and the
alert « Carte cadeau {0} créée avec un solde de {1} » reads `r.message.formatted_amount`; the server answered no such
key, so the manager read « Valeur : undefined » and « un solde de (1) ».

- the script of the list still reads `formatted_amount` (so this contract is the one to keep);
- the call answers it: the amount of the card, written the way the site writes money.
"""

from pathlib import Path

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.api.gift_cards import create_gift_card_manual

SCRIPT = Path(frappe.get_app_path("pos_next", "public", "js", "coupon_code_list.js"))


class TestTheCouponListReadsWhatTheCardCallAnswers(FrappeTestCase):
	def test_the_script_of_the_list_reads_the_formatted_amount_of_the_card_it_made(self):
		source = SCRIPT.read_text()
		self.assertIn("r.message.formatted_amount", source)
		self.assertIn("gift_card.formatted_amount", source)

	def test_the_card_made_by_hand_answers_its_value_written_as_money(self):
		company = frappe.db.get_single_value("Global Defaults", "default_company")
		with as_role("till_manager"):
			made = create_gift_card_manual(amount=12.5, company=company)
		self.addCleanup(self.remove, made)
		self.assertTrue(made.get("success"), made)
		shown = made.get("formatted_amount")
		self.assertTrue(shown and "12.50" in str(shown).replace("'", ""), f"answered {shown!r}")

	def remove(self, made):
		if not made.get("name"):
			return
		rule = frappe.db.get_value("Coupon Code", made["name"], "pricing_rule")
		frappe.delete_doc("Coupon Code", made["name"], force=True, ignore_permissions=True)
		if rule and not frappe.db.exists("Coupon Code", {"pricing_rule": rule}):
			frappe.delete_doc("Pricing Rule", rule, force=True, ignore_permissions=True)
