# //// Neoffice — added file (no upstream equivalent).
"""The Settings card of the Resto page opens the till settings page first (NeoResto lot 1, task 13b; product owner, 05.11.2026:
« sur le menu principal il y a aussi la carte des paramètres »).

A card of the page is written once, so a site that already holds the Settings card gets the new button put in once, in front
of « Tills » and counted; a site that writes the card now gets it whole. What an administrator did to the card is never undone:
a button taken off is not put back, a card taken off is not written for it.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.restaurant import neoresto, supply_catalogue

NEORESTO = "pos_next.restaurant.neoresto.neoresto_active"
SUPPLY_NEORESTO = "pos_next.restaurant.supply_catalogue.neoresto_active"
BUTTON = ("Till settings", "Page", "till-settings")
OLD_SETTINGS = (
	("Restaurants", "DocType", "Restaurant"),
	("Tills", "DocType", "POS Profile"),
	("POS Settings", "DocType", "POS Settings"),
	("Preparation Workflow", "DocType", "Preparation Workflow"),
)


class TestTheRestoPageGainsTheTillSettingsButton(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		neoresto._make_the_page()
		self.addCleanup(frappe.set_user, "Administrator")
		self.page_with(None)

	def page_with(self, settings):
		"""The page as a site left it: no card at all (`None`), or only the Settings card as the first version wrote it."""
		page = frappe.get_doc("Workspace", neoresto.SPACE)
		page.set("links", [])
		page.set("shortcuts", [])
		blocks = []
		if settings is not None:
			page.append("links", {"type": "Card Break", "label": "Settings", "link_count": len(settings)})
			for label, link_type, target in settings:
				page.append(
					"links", {"type": "Link", "label": label, "link_type": link_type, "link_to": target}
				)
			blocks.append({"id": "abc1234567", "type": "card", "data": {"card_name": "Settings", "col": 4}})
		page.content = json.dumps(blocks)
		with neoresto._never_exported():
			page.save(ignore_permissions=True)
		frappe.defaults.clear_default(neoresto.BUTTONS_KEY)
		return page

	def sync(self):
		with (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 0}),
			patch(NEORESTO, return_value=True),
			patch(SUPPLY_NEORESTO, return_value=True),
		):
			neoresto.sync_page_cards()
		return frappe.get_doc("Workspace", neoresto.SPACE)

	@staticmethod
	def settings_card(page):
		"""The buttons of the Settings card in the order of the rows, and the count its Card Break says."""
		rows, count, current = [], None, False
		for row in page.links:
			if row.type == "Card Break":
				current = row.label == "Settings"
				count = row.link_count if current else count
			elif current:
				rows.append((row.label, row.link_type, row.link_to))
		return rows, count

	def test_a_site_that_writes_the_card_now_gets_the_button_first_among_the_tills(self):
		page = self.sync()

		rows, count = self.settings_card(page)
		self.assertEqual([label for label, *_rest in rows][:3], ["Restaurants", "Till settings", "Tills"])
		self.assertIn(BUTTON, rows)
		self.assertEqual(count, len(rows))

	def test_a_card_written_before_gets_the_button_once_in_front_of_the_tills_and_counted(self):
		self.page_with(OLD_SETTINGS)

		page = self.sync()

		rows, count = self.settings_card(page)
		self.assertEqual(
			rows,
			[OLD_SETTINGS[0], BUTTON, *OLD_SETTINGS[1:]],
		)
		self.assertEqual(count, len(rows))
		self.assertEqual([row.idx for row in page.links], list(range(1, len(page.links) + 1)))
		# The page still names the card, once
		self.assertEqual(
			[b["data"]["card_name"] for b in json.loads(page.content) if b["type"] == "card"].count(
				"Settings"
			),
			1,
		)

	def test_syncing_again_adds_nothing(self):
		self.page_with(OLD_SETTINGS)
		self.sync()

		page = self.sync()

		rows, count = self.settings_card(page)
		self.assertEqual(sum(1 for row in rows if row[2] == "till-settings"), 1)
		self.assertEqual(count, len(rows))

	def test_a_button_an_administrator_took_off_is_not_put_back(self):
		self.page_with(OLD_SETTINGS)
		page = self.sync()
		gone = next(row for row in page.links if row.link_to == "till-settings")
		page.remove(gone)
		next(
			row for row in page.links if row.type == "Card Break" and row.label == "Settings"
		).link_count -= 1
		with neoresto._never_exported():
			page.save(ignore_permissions=True)

		after = self.sync()

		self.assertNotIn(BUTTON, self.settings_card(after)[0])

	def test_a_card_that_already_holds_the_page_is_not_given_a_second_button(self):
		mine = (*OLD_SETTINGS, ("My own door", "Page", "till-settings"))
		self.page_with(mine)

		page = self.sync()

		rows, count = self.settings_card(page)
		self.assertEqual(rows, list(mine))
		self.assertEqual(count, len(mine))

	def test_the_button_is_remembered_so_that_it_is_added_only_once(self):
		self.page_with(None)

		self.sync()

		self.assertIn("Settings|till-settings", json.loads(frappe.db.get_default(neoresto.BUTTONS_KEY)))
