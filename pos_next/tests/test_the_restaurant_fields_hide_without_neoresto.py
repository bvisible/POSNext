# //// Neoffice — added file (no upstream equivalent).
"""A site that does not run NeoResto sees nothing of the restaurant on its forms (Jérémy, 04.11: « si je n'ai pas de restaurant, je ne dois rien voir »).

Every custom field this app puts on the ERP's own forms (Item, Item Group, Supplier, Item Supplier) for the restaurant reads the site's flag
(`frappe.boot.neoresto_active`, told to the desk by `mode.extend_boot`) in its `depends_on`. The fields of the till (cash movements, wallet,
coupons) and of scanning in a shop belong to other features and are not hidden by it. A field added later that shows on those forms without
reading the flag, and is not named below as someone else's, fails here.
"""

import json
import unittest
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "custom_field.json"
FLAG = "frappe.boot.neoresto_active"
# The ERP's own forms the restaurant's fields are put on
FORMS = ("Item", "Item Group", "Supplier", "Item Supplier")
# Shown on those forms for another feature: scanning in a shop (counter validation) is the shop's, not the restaurant's
NOT_THE_RESTAURANTS = {"Item-requires_counter_validation", "Item Group-requires_counter_validation"}


def fields():
	return json.loads(FIXTURE.read_text(encoding="utf-8"))


class TestTheRestaurantFieldsHideWithoutNeoresto(unittest.TestCase):
	def test_every_restaurant_field_of_the_erp_forms_reads_the_flag(self):
		shown = [
			f
			for f in fields()
			if f["dt"] in FORMS
			and not f.get("hidden")
			and f["name"] not in NOT_THE_RESTAURANTS
			and f["fieldtype"] not in ("Column Break",)
		]
		self.assertGreaterEqual(len(shown), 13, "the fields of the restaurant on the ERP's forms")
		for field in shown:
			with self.subTest(field=field["name"]):
				self.assertIn(FLAG, field.get("depends_on") or "", f"{field['name']} shows on every site")

	def test_a_condition_of_its_own_is_kept_next_to_the_flag(self):
		by = {f["name"]: f for f in fields()}
		self.assertEqual(by["Item-supply_place"]["depends_on"], f"eval:{FLAG} && doc.is_restaurant_supply")
		self.assertEqual(by["Item-dish_ingredients"]["depends_on"], f"eval:{FLAG} && doc.is_sales_item")
		self.assertEqual(by["Item-restaurant_recipe"]["depends_on"], f"eval:{FLAG} && doc.is_sales_item")
		self.assertEqual(by["Supplier-order_email"]["depends_on"], f"eval:{FLAG} && doc.order_mode=='Email'")

	def test_the_fields_of_the_shop_and_the_till_are_not_hidden_by_it(self):
		by = {f["name"]: f for f in fields()}
		for name in NOT_THE_RESTAURANTS:
			self.assertNotIn(FLAG, by[name].get("depends_on") or "", name)
		for field in fields():
			if field["dt"] in (
				"POS Profile",
				"Journal Entry",
				"Coupon Code",
				"Mode of Payment",
				"Sales Order",
			):
				self.assertNotIn(FLAG, field.get("depends_on") or "", field["name"])

	def test_every_gated_field_is_newer_than_the_site_that_has_it(self):
		# Frappe imports a fixture again when its `modified` moved: a field changed without it would stay as the site has it
		for field in fields():
			if FLAG in (field.get("depends_on") or "") and field["name"] != "Item-restaurant_recipe":
				with self.subTest(field=field["name"]):
					self.assertGreater(field["modified"], "2026-11-03", field["name"])

	def test_the_supplier_column_that_depends_on_cannot_hide_is_hidden_by_the_form_of_the_article(self):
		# A column of a table does not read depends_on: the form of an Item hides the restaurant's one itself
		root = FIXTURE.parents[1]
		script = (root / "public" / "js" / "item.js").read_text(encoding="utf-8")
		self.assertIn("frappe.boot.neoresto_active", script)
		self.assertIn('"supply_uom", "hidden", 1', script)
		hooks = (root / "hooks.py").read_text(encoding="utf-8")
		self.assertIn('"Item": "public/js/item.js"', hooks)
