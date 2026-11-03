# //// Neoffice — added file (no upstream equivalent).
"""The purchases of a restaurant ship dark (NeoResto, purchases, lot A).

The Achats page, its tab in the Resto space and its three calls show only where the site says so: NeoResto runs and
`neoresto_purchases_active` is 1 in the site's config. Where it is off, the space is the one it was and the calls refuse.
"""

import json
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


class TestThePurchasesShortcutsOfTheRestoPage(FrappeTestCase):
	"""The page of the Resto space carries a shortcut to each purchases screen, where the site shows the purchases.

	The theme draws the shortcuts the page's rows AND its content declare: both are written, and both are taken away where
	the purchases do not show. What the page's administrators put there is left as it is.
	"""

	OURS = (("Purchases", "neoresto-purchases"), ("Shopping list", "neoresto-shopping"))

	def setUp(self):
		frappe.set_user("Administrator")
		neoresto._make_the_page()
		page = frappe.get_doc("Workspace", neoresto.SPACE)
		page.set("shortcuts", [])
		page.content = "[]"
		with neoresto._never_exported():
			page.save(ignore_permissions=True)

	def _sync(self, on):
		with (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 1 if on else 0}),
			patch(NEORESTO, return_value=True),
			patch(SUPPLY_NEORESTO, return_value=True),
		):
			neoresto.sync_purchase_shortcuts()
		return frappe.get_doc("Workspace", neoresto.SPACE)

	@staticmethod
	def _declared(page):
		return [
			b["data"]["shortcut_name"]
			for b in json.loads(page.content or "[]")
			if b.get("type") == "shortcut"
		]

	def test_each_purchases_screen_has_its_shortcut_where_the_site_shows_them(self):
		page = self._sync(True)
		rows = {(r.label, r.type, r.link_to) for r in page.shortcuts}
		self.assertEqual(rows, {(label, "Page", target) for label, target in self.OURS})
		self.assertEqual(sorted(self._declared(page)), sorted(label for label, _target in self.OURS))

	def test_the_shortcuts_are_taken_away_where_the_purchases_do_not_show(self):
		self._sync(True)
		page = self._sync(False)
		self.assertEqual([r.link_to for r in page.shortcuts], [])
		self.assertEqual(self._declared(page), [])

	def test_syncing_again_writes_nothing_twice(self):
		self._sync(True)
		page = self._sync(True)
		self.assertEqual(len(page.shortcuts), 2)
		self.assertEqual(len(self._declared(page)), 2)

	def test_what_an_administrator_put_on_the_page_is_left_alone(self):
		page = frappe.get_doc("Workspace", neoresto.SPACE)
		page.append("shortcuts", {"label": "Tables", "type": "DocType", "link_to": "Restaurant Table"})
		page.content = json.dumps(
			[{"id": "abc1234567", "type": "shortcut", "data": {"shortcut_name": "Tables", "col": 3}}]
		)
		with neoresto._never_exported():
			page.save(ignore_permissions=True)
		on = self._sync(True)
		self.assertIn("Tables", self._declared(on))
		self.assertEqual(len(on.shortcuts), 3)
		off = self._sync(False)
		self.assertEqual(self._declared(off), ["Tables"])
		self.assertEqual([r.label for r in off.shortcuts], ["Tables"])
