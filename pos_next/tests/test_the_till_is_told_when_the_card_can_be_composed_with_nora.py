# //// Neoffice — added file (no upstream equivalent).
"""The till's card editor offers « Compose with Nora » (Daniel, 03.11: the wizard of the card starts from the card, in the till too).

The server tells the till, in the rights of its user (`restaurant_can`), whether to show the entry: the site switched the
feature on AND the user manages the cards. A cashier, or a site without the switch, is told no.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import bootstrap

FLAG = {"neoresto_card_with_nora_active": 1}


class TestTheTillIsToldWhenTheCardCanBeComposedWithNora(FrappeTestCase):
	def told(self, role):
		settings = {}
		with as_role(role):
			bootstrap.extend_bootstrap_settings(settings)
		return settings["restaurant_can"]["compose_card_with_nora"]

	def test_a_manager_of_the_cards_is_told_where_the_site_switched_it_on(self):
		with patch.dict(frappe.conf, FLAG):
			self.assertIs(self.told("client_admin"), True)

	def test_a_cashier_is_told_no(self):
		with patch.dict(frappe.conf, FLAG):
			self.assertIs(self.told("cashier"), False)

	def test_nobody_is_told_yes_where_the_site_did_not_switch_it_on(self):
		with patch.dict(frappe.conf, {"neoresto_card_with_nora_active": 0}):
			self.assertIs(self.told("client_admin"), False)
