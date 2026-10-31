# //// Neoffice — added file (no upstream equivalent).
"""Every item the till loads carries its VAT rates, on site and to take away (NeoRestau lot 1, task 11).

The till computes the VAT item by item, as the invoice does: it needs each item's VAT map (account -> rate) for its own
tax category (`item_tax_rate`) and for its restaurant's takeaway category (`takeaway_item_tax_rate`, None where the till
has no takeaway rule). Both come from ERPNext's own lookup, the one the invoice makes (pos_next.restaurant.takeaway_tax),
for the catalogue the till browses and caches offline, a scanned item and the variants of an item.

The fixture is the takeaway till of test_takeaway_tax_category: a dish with a takeaway row of its own, an alcohol with
none, a dessert whose item group carries the takeaway row.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from pos_next.api import items
from pos_next.restaurant import takeaway_tax
from pos_next.tests.test_takeaway_tax_category import PRICE, TakeawayTill


class TestItemsCarryTheirTaxRates(TakeawayTill, FrappeTestCase):
	def loaded(self, item_code):
		"""The item as the till's catalogue loads it (get_items, searched by its code)."""
		found = items.get_items(pos_profile=self.till, search_term=item_code, limit=50)
		return next(item for item in found if item["item_code"] == item_code)

	def test_the_till_gets_each_items_rates_on_site_and_to_take_away(self):
		item = self.loaded(self.food)
		self.assertEqual(json.loads(item["item_tax_rate"])[self.vat_81], 8.1)
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"])[self.vat_26], 2.6)
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"])[self.vat_81], 0)

	def test_alcohol_keeps_its_usual_rates_to_take_away(self):
		item = self.loaded(self.alcohol)
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"]), json.loads(item["item_tax_rate"]))
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"])[self.vat_81], 8.1)

	def test_the_item_groups_takeaway_rate_reaches_the_till(self):
		item = self.loaded(self.dessert)
		self.assertEqual(json.loads(item["item_tax_rate"])[self.vat_81], 8.1)
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"])[self.vat_26], 2.6)

	def test_a_till_without_a_takeaway_rule_gets_no_takeaway_rates(self):
		# A counter till: its takeaway orders, if any, keep the usual rates (the invoice does too)
		self.make_till(enable_restaurant_mode=0)
		item = self.loaded(self.food)
		self.assertIsNone(item["takeaway_item_tax_rate"])
		self.assertEqual(json.loads(item["item_tax_rate"])[self.vat_81], 8.1)

	def test_the_catalogue_cached_offline_carries_both_maps(self):
		cached = {
			item["item_code"]: item
			for item in items.get_items_bulk(
				pos_profile=self.till, item_groups=json.dumps([self.dishes, self.desserts])
			)
		}
		self.assertEqual(set(cached), {self.food, self.alcohol, self.dessert})
		takeaway = {code: json.loads(item["takeaway_item_tax_rate"]) for code, item in cached.items()}
		self.assertEqual(takeaway[self.food][self.vat_26], 2.6)
		self.assertEqual(takeaway[self.alcohol][self.vat_81], 8.1)
		self.assertEqual(takeaway[self.dessert][self.vat_26], 2.6)

	def test_a_scanned_item_carries_both_maps(self):
		item = items.search_by_barcode(self.food, self.till)
		self.assertEqual(json.loads(item["item_tax_rate"])[self.vat_81], 8.1)
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"])[self.vat_26], 2.6)

	def test_the_till_and_the_invoice_agree(self):
		# The rate the till reads for each item, on site and to take away, is the one its invoice charges
		for is_takeaway, field in ((0, "item_tax_rate"), (1, "takeaway_item_tax_rate")):
			invoice = self.pos_invoice(is_takeaway=is_takeaway, items=[self.food, self.alcohol, self.dessert])
			for code in (self.food, self.alcohol, self.dessert):
				with self.subTest(item=code, is_takeaway=is_takeaway):
					till_rate = sum(json.loads(self.loaded(code)[field]).values())
					self.assertEqual(till_rate, self.vat_rate(invoice, code))
			self.assertEqual(invoice.grand_total, flt(3 * PRICE, 2))

	def forget_logged_items(self):
		"""The once-a-day marks of the fixture's items: kept in Redis, outside the transaction a test rolls back."""
		for code in (self.food, self.alcohol, self.dessert):
			frappe.cache().delete_value(f"pos_next:item_vat_unreadable:{nowdate()}:{code}")

	def test_each_item_says_which_till_its_rates_are_for(self):
		# The offline cache keeps the maps by till (POS utils/offline/vatMaps.js)
		self.assertEqual(self.loaded(self.food)["vat_maps_pos_profile"], self.till)

	def test_the_rates_come_from_erpnexts_public_lookup(self):
		from erpnext.stock import get_item_details

		with patch.object(
			get_item_details, "get_item_tax_template", wraps=get_item_details.get_item_tax_template
		) as lookup:
			item = self.loaded(self.dessert)
		self.assertTrue(lookup.called)
		self.assertEqual(json.loads(item["takeaway_item_tax_rate"])[self.vat_26], 2.6)

	def test_an_unreadable_item_is_logged_once_a_day(self):
		read = takeaway_tax.item_tax_template

		def unreadable_desserts(args, taxes, group, memo=None):
			if group == self.desserts:
				raise frappe.DoesNotExistError("an unreadable tax row")
			return read(args, taxes, group, memo)

		self.forget_logged_items()
		self.addCleanup(self.forget_logged_items)
		with (
			patch.object(takeaway_tax, "item_tax_template", side_effect=unreadable_desserts),
			patch.object(frappe, "log_error") as logged,
		):
			for _search in range(3):
				items.get_items_bulk(
					pos_profile=self.till, item_groups=json.dumps([self.dishes, self.desserts])
				)
		logged.assert_called_once()
		self.assertIn(self.dessert, logged.call_args.args[1])

	def test_an_item_whose_rates_cannot_be_read_does_not_stop_the_catalogue(self):
		# The till would load no item at all if one item's tax rows failed the whole catalogue: that item goes without
		# its maps (the till taxes it at its own rows' rates, as before), the others keep theirs, and it is logged
		read = takeaway_tax.item_tax_template

		def unreadable_desserts(args, taxes, group, memo=None):
			if group == self.desserts:
				raise frappe.DoesNotExistError("an unreadable tax row")
			return read(args, taxes, group, memo)

		self.forget_logged_items()
		self.addCleanup(self.forget_logged_items)
		with (
			patch.object(takeaway_tax, "item_tax_template", side_effect=unreadable_desserts),
			patch.object(frappe, "log_error") as logged,
		):
			loaded = {
				item["item_code"]: item
				for item in items.get_items_bulk(
					pos_profile=self.till, item_groups=json.dumps([self.dishes, self.desserts])
				)
			}
		self.assertNotIn("item_tax_rate", loaded[self.dessert])
		self.assertEqual(json.loads(loaded[self.food]["takeaway_item_tax_rate"])[self.vat_26], 2.6)
		logged.assert_called_once()
