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
from pos_next.tests.test_neoresto import theme_or_skip

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
		# The space borrows tabs of the theme's spaces: a fresh CI site has no neoffice_theme (as TestTheTabs)
		theme_or_skip("neoffice_theme.workspace_spaces.retail", "tabs")
		theme_or_skip("neoffice_theme.workspace_spaces.operations", "tabs")
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


class TestTheRestoPageCards(FrappeTestCase):
	"""The page of the Resto space carries its cards of buttons, the way the Sport page carries its own (« Tout le module »).

	The theme draws a card of the page's link rows when the page's content names it: both are written. The Purchases card is
	there only where the site shows the purchases, and goes where it does not. What the page's administrators put there, and
	whatever they changed in a card of ours, is left as it is.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		neoresto._make_the_page()
		page = frappe.get_doc("Workspace", neoresto.SPACE)
		page.set("links", [])
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
			neoresto.sync_page_cards()
		return frappe.get_doc("Workspace", neoresto.SPACE)

	@staticmethod
	def _cards(page):
		"""{card title: [(label, link type, target), ...]} in the order of the link rows."""
		cards, current = {}, None
		for row in page.links:
			if row.type == "Card Break":
				current = cards.setdefault(row.label, [])
			elif current is not None:
				current.append((row.label, row.link_type, row.link_to))
		return cards

	@staticmethod
	def _declared(page):
		return [b["data"]["card_name"] for b in json.loads(page.content or "[]") if b.get("type") == "card"]

	def test_each_card_is_written_with_its_buttons_and_named_in_the_content(self):
		page = self._sync(True)
		cards = self._cards(page)
		self.assertEqual(
			list(cards),
			["Service", "Cards and menus", "Purchases", "Settings"],
			"in the order the page shows them",
		)
		self.assertIn(("Floor and tables", "DocType", "Restaurant Table"), cards["Service"])
		self.assertIn(("What we buy", "Page", "neoresto-purchases"), cards["Purchases"])
		self.assertIn(("Shopping list", "Page", "neoresto-shopping"), cards["Purchases"])
		self.assertEqual(self._declared(page), list(cards))
		breaks = {r.label: r.link_count for r in page.links if r.type == "Card Break"}
		self.assertEqual(breaks, {title: len(rows) for title, rows in cards.items()})

	def test_the_purchases_card_is_there_only_where_the_site_shows_the_purchases(self):
		page = self._sync(False)
		self.assertEqual(list(self._cards(page)), ["Service", "Cards and menus", "Settings"])
		self.assertEqual(self._declared(page), ["Service", "Cards and menus", "Settings"])

	def test_the_purchases_card_goes_and_comes_with_the_flag(self):
		self._sync(True)
		off = self._sync(False)
		self.assertNotIn("Purchases", self._cards(off))
		self.assertNotIn("Purchases", self._declared(off))
		self.assertFalse([r for r in off.links if r.link_to in ("neoresto-purchases", "neoresto-shopping")])
		on = self._sync(True)
		self.assertIn("Purchases", self._cards(on))
		self.assertEqual(sorted(self._declared(on)), sorted(self._cards(on)))

	def test_syncing_again_writes_nothing_twice(self):
		self._sync(True)
		page = self._sync(True)
		self.assertEqual(len([r for r in page.links if r.type == "Card Break"]), 4)
		self.assertEqual(len(self._declared(page)), 4)

	def test_what_an_administrator_put_on_the_page_is_left_alone(self):
		page = frappe.get_doc("Workspace", neoresto.SPACE)
		page.append("links", {"type": "Card Break", "label": "My own card", "link_count": 1})
		page.append(
			"links",
			{"type": "Link", "label": "Tables", "link_type": "DocType", "link_to": "Restaurant Table"},
		)
		page.content = json.dumps(
			[{"id": "abc1234567", "type": "card", "data": {"card_name": "My own card", "col": 4}}]
		)
		with neoresto._never_exported():
			page.save(ignore_permissions=True)
		on = self._sync(True)
		self.assertIn("My own card", self._cards(on))
		self.assertEqual(self._cards(on)["My own card"], [("Tables", "DocType", "Restaurant Table")])
		off = self._sync(False)
		self.assertIn("My own card", self._cards(off))
		self.assertIn("My own card", self._declared(off))

	def test_a_card_the_administrator_changed_is_not_written_again(self):
		page = self._sync(False)
		service = next(r for r in page.links if r.type == "Card Break" and r.label == "Service")
		page.links = [
			r for r in page.links if r.idx != service.idx + 1
		]  # the first button of the card, taken off
		with neoresto._never_exported():
			page.save(ignore_permissions=True)
		after = self._sync(False)
		self.assertEqual(len(self._cards(after)["Service"]), 3)

	def test_the_two_shortcuts_of_the_first_version_are_taken_away(self):
		page = frappe.get_doc("Workspace", neoresto.SPACE)
		for label, target in (("Purchases", "neoresto-purchases"), ("Shopping list", "neoresto-shopping")):
			page.append("shortcuts", {"label": label, "type": "Page", "link_to": target})
		page.append("shortcuts", {"label": "Tables", "type": "DocType", "link_to": "Restaurant Table"})
		page.content = json.dumps(
			[
				{"id": "aaa1111111", "type": "shortcut", "data": {"shortcut_name": "Purchases", "col": 3}},
				{
					"id": "bbb2222222",
					"type": "shortcut",
					"data": {"shortcut_name": "Shopping list", "col": 3},
				},
				{"id": "ccc3333333", "type": "shortcut", "data": {"shortcut_name": "Tables", "col": 3}},
			]
		)
		with neoresto._never_exported():
			page.save(ignore_permissions=True)
		after = self._sync(True)
		self.assertEqual([r.label for r in after.shortcuts], ["Tables"])
		kept = [b["data"]["shortcut_name"] for b in json.loads(after.content) if b["type"] == "shortcut"]
		self.assertEqual(kept, ["Tables"])

	def test_a_migrate_never_fails_for_the_cards(self):
		"""The hook runs at every migrate of every client: a card that cannot be written is an Error Log row, never a failed migrate."""
		with (
			patch(NEORESTO, return_value=True),
			patch.object(frappe.db, "exists", return_value=True),
			patch.object(neoresto, "sync_page_cards", side_effect=RuntimeError("the page is gone")),
			patch.object(frappe, "log_error") as logged,
		):
			neoresto.after_migrate()
		logged.assert_called_once()
		self.assertEqual(logged.call_args.args[0], "POS Next: NeoResto page cards")

	def test_a_site_that_does_not_run_neoresto_gets_no_cards(self):
		with patch(NEORESTO, return_value=False), patch.object(neoresto, "sync_page_cards") as sync:
			neoresto.after_migrate()
		sync.assert_not_called()
