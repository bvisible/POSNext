# //// Neoffice — added file (no upstream equivalent).
"""The items grid of a sales invoice shows no column the till put there (Daniel, 02.11.2026: « un vendeur affiché dans la table des articles, qu'on ne remplit jamais »).

Upstream's till adds a `sales_person` field to every line of a sales invoice and shows it as a column of the grid; the feature is off on our
tills and nobody fills it. The field stays (the till's sales-person code reads and writes it when the feature is on), but it is not a column.
The fields our restaurant mode adds to the lines of an invoice (kitchen state, station, family, options) are never on screen: hidden, and not a
column (a hidden field is not in the standard print either: an invoice with options, printed on osiris, carries none of them). The suite pins both.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

OURS = ("kds_", "service_family", "preparation_station", "posa_special_instructions", "posa_item_modifiers")


class TestTheItemsGridOfAnInvoice(FrappeTestCase):
	def test_the_sales_person_is_not_a_column_of_the_grid(self):
		field = frappe.get_meta("Sales Invoice Item").get_field("sales_person")

		self.assertIsNotNone(field, "the till's sales-person code writes it when the feature is on")
		self.assertFalse(field.in_list_view)

	def test_the_item_level_customer_is_not_a_column_of_the_grid(self):
		field = frappe.get_meta("Sales Invoice Item").get_field("customer")

		self.assertIsNotNone(field)
		self.assertFalse(field.in_list_view)

	def test_what_the_restaurant_adds_to_a_line_is_never_on_screen(self):
		found = []
		for field in frappe.get_meta("Sales Invoice Item").fields:
			if field.fieldname.startswith(OURS):
				found.append(field.fieldname)
				self.assertTrue(field.hidden, f"{field.fieldname} must be hidden")
				self.assertFalse(field.in_list_view, f"{field.fieldname} must not be a column")

		self.assertIn("kds_status", found)
		self.assertIn("service_family", found)
