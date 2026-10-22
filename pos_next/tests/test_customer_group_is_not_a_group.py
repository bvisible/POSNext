# //// Neoffice — added file (no upstream equivalent): erpnext 15.123 refuses a customer created in a group-type
# //// Customer Group; the till made its customers in the root "All Customer Groups" or in Selling Settings' group,
# //// both groups on the fleet.
import unittest
from unittest.mock import patch

from pos_next.api import invoices


class TestLeafCustomerGroup(unittest.TestCase):
	def group(self, selling_settings_group, is_group, first_leaf):
		def get_value(doctype, filters, fieldname=None, **kwargs):
			if isinstance(filters, str):  # Customer Group name -> is_group
				return is_group.get(filters)
			return first_leaf

		with (
			patch.object(invoices.frappe.db, "get_single_value", return_value=selling_settings_group),
			patch.object(invoices.frappe.db, "get_value", side_effect=get_value),
		):
			return invoices._leaf_customer_group()

	def test_the_group_of_selling_settings_is_used_when_it_is_not_a_group(self):
		self.assertEqual(self.group("Individual", {"Individual": 0}, "B2B"), "Individual")

	def test_a_group_type_default_gives_the_first_group_that_is_not_one(self):
		self.assertEqual(self.group("All Customer Groups", {"All Customer Groups": 1}, "B2B"), "B2B")

	def test_without_a_default_the_first_group_that_is_not_one_is_used(self):
		self.assertEqual(self.group(None, {}, "B2B"), "B2B")
