# //// Neoffice — added file (no upstream equivalent).
"""Where a sales person is asked for (product owner, 02.11.2026: « si on coche vendeur dans la caisse, qu'est-ce qui se passe quand on facture depuis
les factures de vente sans passer par la caisse ? Ça devient un champ obligatoire ? »).

The till's « sales persons » setting (`POS Settings.enable_sales_persons`: Disabled, Single, Multiple) makes the TILL ask for a sales person on every line
of a sale (`_apply_pos_sales_team`, called by the till's save and submit). It is not a rule of the Sales Invoice document: an invoice made at the desk,
with or without the « include payment » flag, is valid with no sales person whatever the setting says; the sales team of the desk stays ERPNext's own,
optional table. The suite pins both, so that a merge of upstream that moves the rule into the document is seen.
"""

import frappe
from frappe.utils import nowdate

from pos_next.api import invoices
from pos_next.tests.test_service_families import ServiceCase


class TestTheSalesPersonIsAskedByTheTillOnly(ServiceCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Single")

	def desk_invoice(self, **changes):
		"""An invoice as the desk makes it: no till, no table, no sales person on any line."""
		values = {
			"doctype": "Sales Invoice",
			"company": self.fx.company,
			"customer": self.fx.customer,
			"currency": self.fx.currency,
			"selling_price_list": self.fx.price_list,
			"posting_date": nowdate(),
			"items": [{"item_code": self.cola, "qty": 1, "rate": 10}],
		}
		values.update(changes)
		return frappe.get_doc(values)

	def test_the_setting_is_on_for_the_till_under_test(self):
		from pos_next.pos_next.utils.sales_person_commission import sales_persons_enabled

		self.assertTrue(sales_persons_enabled(self.fx.profile))

	def test_the_till_asks_for_a_sales_person_on_every_line(self):
		sale = self.desk_invoice(pos_profile=self.fx.profile)

		with self.assertRaises(frappe.ValidationError) as caught:
			invoices._apply_pos_sales_team(sale, None, self.fx.profile)

		self.assertIn("Sales Person is required", str(caught.exception))

	def test_a_sale_of_the_desk_asks_for_none(self):
		sale = self.desk_invoice().insert(ignore_permissions=True)

		self.assertTrue(sale.name)
		self.assertFalse([row for row in sale.items if row.get("sales_person")])

	def test_a_sale_of_the_desk_with_the_payment_flag_and_the_till_profile_asks_for_none(self):
		sale = self.desk_invoice(
			is_pos=1,
			pos_profile=self.fx.profile,
			payments=[{"mode_of_payment": self.fx.mode, "amount": 10}],
		).insert(ignore_permissions=True)

		self.assertTrue(sale.name)

	def test_a_sale_of_the_desk_may_still_name_a_sales_person_on_a_line(self):
		person = frappe.get_doc(
			{"doctype": "Sales Person", "sales_person_name": "_Test Desk Seller", "parent_sales_person": "Sales Team", "is_group": 0}
		).insert(ignore_permissions=True)
		sale = self.desk_invoice(items=[{"item_code": self.cola, "qty": 1, "rate": 10, "sales_person": person.name}]).insert(
			ignore_permissions=True
		)

		self.assertEqual(sale.items[0].sales_person, person.name)
