# //// Neoffice — added file (no upstream equivalent).
"""A manager who holds one role opens the office's page of a till on the tills that role lets him set (neoffice-maintenance#3283).

Seen on screen (24.11): an account holding only `POSNext Manager`, or only `Restaurant Manager`, opened `/app/till-settings` and saw
« New till » and « Save » on an empty page. With no till named, the page asked Frappe's own list of POS Profiles, which refuses both:
neither holds a rule on POS Profile, and neither needs one (`till_settings.api._open` asks their role and their User Permissions).
The page now asks its own server method (`get_desk_tills`), which answers as `_open` does: the till manager every till, the
restaurant's manager the tills of his restaurant, nobody else; and it says whether the user may make a till, as `create_till` asks.
The people of a till and what it needs to open are the till manager's: the restaurant's manager, who opens none of their tabs, is not
served them.

Each act is played by an account holding one role; Administrator only lays out the tills. The suite rolls everything back.
"""

import re
from pathlib import Path

import frappe
import frappe.client

from pos_next.tests.test_till_settings import (
	PORTAL,
	RESTAURANT_MANAGER,
	TILL_MANAGER,
	TillSettingsCase,
	till_tabs,
)
from pos_next.tests.test_till_writes_need_the_till import OTHER_TILL, TILL, _user
from pos_next.till_settings import api as till_settings_api
from pos_next.till_settings.api import create_till, get_desk_settings

PAGE = (Path(frappe.get_app_path("pos_next")) / "pos_next/page/till_settings/till_settings.js").read_text()
# An office clerk who may make a till: the till manager's role and the accountant's (create on POS Profile)
CLERK = "till-one-role-clerk@yopmail.com"
RESTAURANT_TABS = ["restaurant", "hours", "online", "reservations"]


def names_of(answer):
	return [till["name"] for till in answer["tills"]]


class TestAManagerOfOneRoleOpensTheOfficePageOnHisTills(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(CLERK, ["POSNext Manager", "Accounts Manager"], "System User")

	def test_frappes_list_of_tills_refuses_both_managers_and_the_page_does_not_ask_it(self):
		# Why the page stayed empty. It stays so: no read rule on POS Profile is given, the page asks its own method
		for user in (TILL_MANAGER, RESTAURANT_MANAGER):
			with self.subTest(user=user):
				self.as_user(user)
				self.assertFalse(frappe.has_permission("POS Profile", "read"))
				with self.assertRaises(frappe.PermissionError):
					frappe.client.get_list("POS Profile", fields=["name"], limit_page_length=1)
		self.assertIsNone(
			re.search(r'get_list\(\s*"POS Profile"', PAGE), "the page asks Frappe's list of POS Profiles"
		)
		self.assertTrue(
			re.search(r'prototype\.open_the_first = function[\s\S]*?API \+ "get_desk_tills"', PAGE),
			"the page does not ask its tills of get_desk_tills",
		)

	def test_the_till_manager_is_given_every_till_the_ones_in_use_first_and_opens_the_first(self):
		frappe.db.set_value("POS Profile", self.shop_till, "disabled", 1)
		self.as_user(TILL_MANAGER)

		answer = till_settings_api.get_desk_tills()

		names = names_of(answer)
		self.assertIn(self.restaurant_till, names)
		self.assertIn(self.shop_till, names)
		self.assertLess(names.index(self.restaurant_till), names.index(self.shop_till))
		# The till the page opens first shows him the till's own tabs
		first = get_desk_settings(names[0])
		self.assertTrue(first["can"]["till"])
		self.assertIn("general", till_tabs(first))

	def test_the_restaurant_manager_is_given_the_tills_of_his_restaurant_only_and_opens_their_tabs(self):
		self.as_user(RESTAURANT_MANAGER)

		answer = till_settings_api.get_desk_tills()

		names = names_of(answer)
		self.assertIn(self.restaurant_till, names)
		self.assertNotIn(self.shop_till, names)
		self.assertTrue(all(till["restaurant"] for till in answer["tills"]), answer["tills"])
		self.assertTrue(get_desk_settings(names[0])["can"]["restaurant"])
		self.assertEqual(till_tabs(get_desk_settings(self.restaurant_till)), RESTAURANT_TABS)

	def test_a_new_till_is_offered_to_whoever_may_make_one_and_to_nobody_else(self):
		for user, may in ((TILL_MANAGER, False), (RESTAURANT_MANAGER, False), (CLERK, True)):
			with self.subTest(user=user):
				self.as_user(user)
				self.assertIs(till_settings_api.get_desk_tills()["can"]["create"], may)
				if not may:
					# The offer says what the door does
					with self.assertRaises(frappe.PermissionError):
						create_till("A till nobody may make", self.fx.company)
		self.assertFalse(frappe.db.exists("POS Profile", "A till nobody may make"))

	def test_who_manages_no_till_and_no_restaurant_is_refused_the_tills(self):
		# A cashier, a desk account with no role of the till, a portal account, a visitor
		for user in (TILL, OTHER_TILL, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					till_settings_api.get_desk_tills()

	def test_every_chip_of_what_a_till_needs_opens_a_tab_its_user_is_shown(self):
		for user in (TILL_MANAGER, RESTAURANT_MANAGER):
			with self.subTest(user=user):
				self.as_user(user)
				answer = get_desk_settings(self.restaurant_till)
				self.assertLessEqual({check["tab"] for check in answer["readiness"]}, set(till_tabs(answer)))

	def test_the_people_and_the_readiness_of_a_till_are_its_managers_not_the_restaurants(self):
		self.as_user(RESTAURANT_MANAGER)
		answer = get_desk_settings(self.restaurant_till)
		self.assertEqual((answer["people"], answer["readiness"]), ([], []))

		self.as_user(TILL_MANAGER)
		answer = get_desk_settings(self.restaurant_till)
		self.assertIn(TILL, [person["user"] for person in answer["people"]])
		self.assertTrue(answer["readiness"])
