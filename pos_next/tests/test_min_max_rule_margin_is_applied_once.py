# //// Neoffice — added file (no upstream equivalent): erpnext applies the margin of every Price rule in
# //// apply_pricing_rule_margin(); the Min/Max branch of our apply_price_discount_rule used to add it a
# //// second time when the rule has apply_multiple_pricing_rules.
import unittest

import frappe
from erpnext.accounts.doctype.pricing_rule.pricing_rule import apply_pricing_rule_margin

from pos_next.overrides.pricing_rule import apply_price_discount_rule


class TestMinMaxRuleMargin(unittest.TestCase):
	def margin_of(self, **rule_fields):
		rule = frappe._dict(
			apply_discount_on_price="Min",
			rate_or_discount="Discount Percentage",
			discount_percentage=10,
			margin_type="Percentage",
			margin_rate_or_amount=5,
			currency="CHF",
			**rule_fields,
		)
		args = frappe._dict(currency="CHF", price_list_rate=100)
		item_details = frappe._dict(margin_rate_or_amount=None, price_list_rate=100)
		# what get_pricing_rule_for_item() does for a Price rule
		apply_price_discount_rule(rule, item_details, args)
		apply_pricing_rule_margin(rule, item_details, args)
		return item_details

	def test_the_margin_of_a_min_max_rule_is_counted_once_with_multiple_rules(self):
		self.assertEqual(self.margin_of(apply_multiple_pricing_rules=1).margin_rate_or_amount, 5)

	def test_the_margin_of_a_single_min_max_rule_is_counted_once(self):
		self.assertEqual(self.margin_of(apply_multiple_pricing_rules=0).margin_rate_or_amount, 5)

	def test_a_min_max_rule_does_not_discount_the_line_by_itself(self):
		details = self.margin_of(apply_multiple_pricing_rules=0)
		self.assertNotIn("discount_percentage", details)
