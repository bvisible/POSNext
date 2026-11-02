# //// Neoffice — added file (no upstream equivalent).
"""A table opened again hands the till the family of each of its lines (NeoResto lot 1, Daniel's test of 01.11: « je vois pas comment faire
la demande de la suite sur la table 2 »).

The till names the next course (« Commander la suite · Desserts ») from the family each line of the cart carries. `open_table` returned a
table's stored draft WITHOUT that field, so a table opened on another till, or on a pad, or after a reload, came back with lines that had no
course: no course was held, and the button never showed. `get_table_order` has always sent it; `open_table` now does too.

The suite builds everything it needs (the menu of `test_service_families`, a restaurant, a table, a till) and rolls back.
"""

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import ServiceCase


class AReopenedTableKeepsTheFamilyOfItsLines(ServiceCase):
	def test_the_lines_of_a_stored_draft_come_back_with_their_family_and_their_status(self):
		self.save(
			[
				self.line(self.cola, service_family="Drink"),
				self.line(self.soup, service_family="Starter"),
				self.line(self.penne, service_family="Main"),
				self.line(self.tart, service_family="Dessert"),
			]
		)

		opened = restaurant_api.open_table(self.table_a, self.fx.profile)
		lines = {row["item_code"].replace("_Test SF ", ""): row for row in opened["items"]}

		self.assertEqual(
			{name: (row["service_family"], row["kds_status"]) for name, row in lines.items()},
			{
				"Cola": ("Drink", "Pending"),
				"Soup": ("Starter", "Pending"),
				"Penne": ("Main", "Waiting"),
				"Tart": ("Dessert", "Waiting"),
			},
		)

	def test_a_site_not_migrated_yet_still_opens_the_table(self):
		"""The column is read only where the site has it (the code is updated before the site is migrated)."""
		self.save([self.line(self.cola, service_family="Drink")])
		real = frappe.db.has_column

		def without_the_family(doctype, column):
			return False if column == "service_family" else real(doctype, column)

		frappe.db.has_column = without_the_family
		try:
			opened = restaurant_api.open_table(self.table_a, self.fx.profile)
		finally:
			frappe.db.has_column = real

		self.assertEqual(len(opened["items"]), 1)
		self.assertNotIn("service_family", opened["items"][0])
