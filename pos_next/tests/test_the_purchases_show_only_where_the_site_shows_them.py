# //// Neoffice — added file (no upstream equivalent).
"""The purchases of a restaurant ship dark (NeoResto, purchases, lot A).

The Achats page, its tab in the Resto space and its three calls show only where the site says so: NeoResto runs and
`neoresto_purchases_active` is 1 in the site's config. Where it is off, the space is the one it was and the calls refuse.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import supplies as api
from pos_next.restaurant import neoresto, supply_catalogue

NEORESTO = "pos_next.restaurant.neoresto.neoresto_active"
SUPPLY_NEORESTO = "pos_next.restaurant.supply_catalogue.neoresto_active"


def _keys():
	return [tab["key"] for tab in neoresto.tabs().get(neoresto.SPACE, [])]


class TestThePurchasesShowOnlyWhereTheSiteShowsThem(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def _flag(self, on):
		return patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 1 if on else 0})

	def test_the_flag_needs_neoresto_to_run(self):
		with self._flag(True), patch(SUPPLY_NEORESTO, return_value=False):
			self.assertFalse(supply_catalogue.purchases_active())
		with self._flag(True), patch(SUPPLY_NEORESTO, return_value=True):
			self.assertTrue(supply_catalogue.purchases_active())
		with self._flag(False), patch(SUPPLY_NEORESTO, return_value=True):
			self.assertFalse(supply_catalogue.purchases_active())

	def test_the_space_has_the_tab_only_where_the_purchases_show(self):
		with self._flag(True), patch(NEORESTO, return_value=True), patch(SUPPLY_NEORESTO, return_value=True):
			keys = _keys()
			self.assertIn("purchases", keys)
			self.assertIn("shopping", keys)
			tab = next(t for t in neoresto.tabs()[neoresto.SPACE] if t["key"] == "purchases")
			self.assertEqual(tab["route"], "/app/neoresto-purchases")
			self.assertEqual(tab["requires"], ["Item"])
		with self._flag(False), patch(NEORESTO, return_value=True), patch(SUPPLY_NEORESTO, return_value=True):
			self.assertNotIn("purchases", _keys())
			self.assertNotIn("shopping", _keys())

	def test_the_calls_refuse_where_the_purchases_do_not_show(self):
		with self._flag(False), patch(SUPPLY_NEORESTO, return_value=True):
			with self.assertRaises(frappe.PermissionError):
				api.get_supply_catalogue()
			with self.assertRaises(frappe.PermissionError):
				api.create_supply_item("_PNXT dark", "x", "y")
			with self.assertRaises(frappe.PermissionError):
				api.add_supply_pack("x", "y", "z", 1)

	def test_the_catalogue_call_answers_where_they_show(self):
		with self._flag(True), patch(SUPPLY_NEORESTO, return_value=True):
			answer = api.get_supply_catalogue()
		self.assertEqual(set(answer), {"rows", "total", "families", "suppliers"})
