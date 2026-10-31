# //// Neoffice — added file (no upstream equivalent).
"""The public menu (NeoRestau lot 1, task 17): one QR code on the tables shows a restaurant's guest card, read only.

Today a guest orders at the table through the unique QR the waiter brings, which is tied to the table's draft ticket.
This is the other QR: the same for every table, it opens `/pos/menu/<restaurant>`, a page that shows the card and lets
nobody order. It exists only where the restaurant switched it on (`Restaurant.enable_public_menu`) and the site runs
NeoRestau; the endpoint behind it is open to anybody, so these tests pin what it must never say: nothing of stock, cost,
an internal item, another restaurant's card, a card that is not published, a private file.

Every test builds what it needs under names of its own (`_Test`) and works inside a savepoint it rolls back. The site's
NeoRestau flag is set by patching the configuration the code reads; nothing writes a site_config.json.
"""

import copy
import json
import re
from contextlib import ExitStack, contextmanager
from html.parser import HTMLParser
from types import SimpleNamespace
from typing import ClassVar
from unittest.mock import patch
from urllib.parse import unquote

import frappe
from babel.messages.extract import extract
from frappe.core.doctype.translation.translation import clear_user_translation_cache
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.gettext.extractors.python import extract as python_extractor
from frappe.gettext.translate import PYTHON_KEYWORDS
from frappe.handler import execute_cmd
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, cint, nowdate

from pos_next.api import public_menu
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import settings as restaurant_settings
from pos_next.restaurant.mode import SITE_FLAG

PREFIX = "_Test Public Menu"
BISTRO = f"{PREFIX} Bistro"
BRASSERIE = f"{PREFIX} Brasserie"
# A name with an ampersand and an accent, and one with an apostrophe: plain text, which Frappe leaves as it is in the
# arguments of a guest's call (it rewrites only a string that holds an HTML tag)
CAFE = f"{PREFIX} Café & Bar"
APOSTROPHE = f"{PREFIX} Joe's Grill"
# The languages a card is kept in (a badge's name is read in the guest's)
LANGUAGES = ("en", "fr")
NOT_AVAILABLE = "This menu is not available"
SAVEPOINT = "public_menu_test"
GUEST_IP = "198.51.100.23"
PORTAL = "public-menu-portal@yopmail.com"
COMMAND = "pos_next.api.public_menu.get_public_menu"

# What the menu reads, as Custom Fields the hub and this app add to Item and to a card's rows. A fresh CI site may not
# have them all (the hub's `is_internal_item` never reaches it): the class adds what is missing, before any write.
CUSTOM_FIELDS = (
	(
		"Item",
		{"fieldname": "is_internal_item", "label": "Is Internal Item", "fieldtype": "Check", "hidden": 1},
	),
	(
		"Item",
		{"fieldname": "custom_item_badges", "label": "Badges", "fieldtype": "Table", "options": "Item Badge"},
	),
	("Item", {"fieldname": "custom_spice_level", "label": "Spice Level", "fieldtype": "Int", "default": "0"}),
	("Restaurant Card Item", {"fieldname": "custom_price_text", "label": "Price Text", "fieldtype": "Data"}),
)

DISH_KEYS = {"name", "description", "price", "price_text", "image", "spice_level", "badges"}
BADGE_KEYS = {"name", "type", "icon", "color"}
# "No restaurant named": the test's own. An empty name is a name too, and must be refused
THE_TEST_RESTAURANT = object()


@contextmanager
def a_site_where_neorestau_is(value):
	"""The site's `neorestau_active` as the code reads it (None: the key is not in the configuration)."""
	with patch.dict(frappe.conf):
		if value is None:
			frappe.conf.pop(SITE_FLAG, None)
		else:
			frappe.conf[SITE_FLAG] = value
		yield


@contextmanager
def a_request_from(ip):
	"""A web request as the rate limiter sees it: its address, its method and the command it calls."""
	missing = object()
	before = {name: getattr(frappe.local, name, missing) for name in ("request", "request_ip")}
	frappe.local.request = SimpleNamespace(method="GET", path=f"/api/method/{COMMAND}", headers={})
	frappe.local.request_ip = ip
	try:
		with patch.dict(frappe.local.form_dict, {"cmd": COMMAND}):
			yield
	finally:
		for name, value in before.items():
			if value is missing:
				delattr(frappe.local, name)
			else:
				setattr(frappe.local, name, value)


class PublicMenuFixtures:
	"""A restaurant that publishes its menu, the dishes and the card of it, and what a test adds to them."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for doctype, field in CUSTOM_FIELDS:
			if not frappe.get_meta(doctype).has_field(field["fieldname"]):
				create_custom_field(doctype, field)

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		self.company = company[0]
		self.currency = frappe.db.get_value("Company", self.company, "default_currency")
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		# A built card is kept for a minute, in Redis, which a rollback does not empty
		self.restaurants = []
		self.addCleanup(self.forget_the_cards)
		flag = a_site_where_neorestau_is(1)
		flag.__enter__()
		self.addCleanup(flag.__exit__, None, None, None)
		# Tip provisioning (an item and an account) is the restaurant doctype's own test
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch(f"pos_next.pos_next.doctype.restaurant.restaurant.Restaurant.{method}")
			patcher.start()
			self.addCleanup(patcher.stop)
		self.forget_the_cards()
		self.restaurant = self.make_restaurant(BISTRO, enable_public_menu=1)

	def forget_the_cards(self):
		for name in (BISTRO, BRASSERIE, CAFE, APOSTROPHE, *self.restaurants):
			for lang in (*LANGUAGES, frappe.local.lang):
				frappe.cache().delete_value(public_menu.cache_key(name, lang))
			# A rolled-back restaurant must not be read again from the cache of documents
			frappe.clear_document_cache("Restaurant", name)

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True)

	def make_restaurant(self, name, **values):
		doc = self.insert("Restaurant", restaurant_name=name, company=self.company, **values)
		self.restaurants.append(doc.name)
		return doc.name

	def make_item(self, code, item_name=None, **values):
		"""A dish of the test's own. What a picture, a flag or a spice level says is written to the row afterwards, as the
		desk's forms and the hub's scripts do: none of it is the test's business."""
		code = f"{PREFIX} {code}"
		afterwards = {
			key: values.pop(key)
			for key in ("image", "is_internal_item", "custom_spice_level")
			if key in values
		}
		badges = values.pop("badges", [])
		self.insert(
			"Item",
			**{
				"item_code": code,
				"item_name": item_name or code,
				"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft"),
				"stock_uom": frappe.db.get_value("UOM", "Nos") or frappe.db.get_value("UOM", {}, "name"),
				"is_stock_item": 0,
				"is_sales_item": 1,
				"custom_item_badges": [{"menu_badge": badge} for badge in badges],
				**values,
			},
		)
		if afterwards:
			frappe.db.set_value("Item", code, afterwards)
		return code

	def make_badge(self, name, badge_type="Dietary", icon="vegetarian.svg", color="#2f9e44"):
		return self.insert(
			"Menu Badge", badge_name=f"{PREFIX} {name}", badge_type=badge_type, icon=icon, color=color
		).name

	def make_card(self, restaurant, name, rows, **values):
		values = {"is_active": 1, "is_permanent": 1, **values}
		return self.insert(
			"Restaurant Card", card_name=f"{PREFIX} {name}", restaurant=restaurant, items=rows, **values
		).name

	def publish(self, card, restaurant=None):
		frappe.db.set_value("Restaurant", restaurant or self.restaurant, "guest_menu", card)

	def menu(self, restaurant=THE_TEST_RESTAURANT):
		"""The answer for a restaurant, built now: whatever was kept of an earlier one is forgotten first."""
		self.forget_the_cards()
		return public_menu.get_public_menu(
			self.restaurant if restaurant is THE_TEST_RESTAURANT else restaurant
		)

	def refusal(self, restaurant=THE_TEST_RESTAURANT):
		with self.assertRaises(frappe.DoesNotExistError) as refused:
			self.menu(restaurant)
		return str(refused.exception)

	def a_card_with(self, rows, **values):
		card = self.make_card(self.restaurant, "Card", rows, **values)
		self.publish(card)
		return card

	def dishes(self, answer):
		return [dish for section in answer["sections"] for dish in section["items"]]


class TestThePublicMenuSetting(FrappeTestCase):
	"""The restaurant's option that puts the public menu on or off, where its other guest settings are."""

	def test_the_restaurant_has_the_option_and_it_is_off_by_default(self):
		field = frappe.get_meta("Restaurant").get_field("enable_public_menu")

		self.assertEqual(field.fieldtype, "Check")
		self.assertEqual(field.label, "Public menu (QR)")
		self.assertEqual(cint(field.default), 0)
		# It says what it does, in the language of the person who ticks it
		self.assertIn("QR", field.description)
		self.assertIn("order", field.description.lower())

	def test_the_option_sits_with_the_guest_settings_next_to_the_guest_menu(self):
		fields = [field.fieldname for field in frappe.get_meta("Restaurant").fields]

		self.assertEqual(abs(fields.index("enable_public_menu") - fields.index("guest_menu")), 1)
		self.assertGreater(fields.index("enable_public_menu"), fields.index("section_qr_ordering"))
		self.assertLess(fields.index("enable_public_menu"), fields.index("section_web_takeaway"))

	def test_the_guest_menu_shows_when_the_public_menu_is_on_even_without_qr_ordering(self):
		# The public menu shows the guest card: a restaurant that does not take orders at the table must still be able to
		# choose it
		depends_on = frappe.get_meta("Restaurant").get_field("guest_menu").depends_on

		self.assertIn("enable_public_menu", depends_on)
		self.assertIn("enable_qr_ordering", depends_on)


class TestTheTillReadsAndSavesTheOption(PublicMenuFixtures, FrappeTestCase):
	def test_the_settings_the_till_reads_say_whether_the_menu_is_public(self):
		self.assertIs(restaurant_api.get_restaurant_settings(self.restaurant)["enable_public_menu"], True)
		frappe.db.set_value("Restaurant", self.restaurant, "enable_public_menu", 0)
		frappe.clear_document_cache("Restaurant", self.restaurant)

		self.assertIs(restaurant_api.get_restaurant_settings(self.restaurant)["enable_public_menu"], False)

	def test_a_manager_can_switch_it_from_the_till(self):
		restaurant_api.save_restaurant_settings({"enable_public_menu": 0}, restaurant=self.restaurant)
		self.assertEqual(frappe.db.get_value("Restaurant", self.restaurant, "enable_public_menu"), 0)

		restaurant_api.save_restaurant_settings({"enable_public_menu": 1}, restaurant=self.restaurant)
		self.assertEqual(frappe.db.get_value("Restaurant", self.restaurant, "enable_public_menu"), 1)

	def test_the_option_is_not_one_the_former_single_ever_held(self):
		# The patch that moved the single into a default restaurant copies SETTINGS_FIELDS from a single that has no such
		# field: it must not be named there
		self.assertNotIn("enable_public_menu", restaurant_settings.SETTINGS_FIELDS)


class TestThePublicMenuIsOffUnlessThereIsOne(PublicMenuFixtures, FrappeTestCase):
	"""Off means nothing public exists: the same polite refusal whatever the reason, so that it tells nothing."""

	def setUp(self):
		super().setUp()
		self.a_card_with([{"item_type": "Item", "item": self.make_item("Soup")}])

	def test_with_the_option_ticked_the_menu_is_served(self):
		self.assertTrue(self.dishes(self.menu()))

	def test_with_the_option_off_nothing_is_public(self):
		frappe.db.set_value("Restaurant", self.restaurant, "enable_public_menu", 0)

		self.assertEqual(self.refusal(), NOT_AVAILABLE)

	def test_where_neorestau_is_off_nothing_is_public(self):
		for value in (0, "0", None):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				self.assertEqual(self.refusal(), NOT_AVAILABLE)

	def test_a_disabled_restaurant_publishes_nothing(self):
		frappe.db.set_value("Restaurant", self.restaurant, "enabled", 0)

		self.assertEqual(self.refusal(), NOT_AVAILABLE)

	def test_a_restaurant_that_does_not_exist_gets_the_same_refusal(self):
		for name in ("", "   ", None, f"{PREFIX} Nowhere", "x" * 300, 5, ["a"], {"a": 1}):
			with self.subTest(name=name):
				self.assertEqual(self.refusal(name), NOT_AVAILABLE)

	def test_the_refusal_is_a_404_with_nothing_but_the_sentence(self):
		with self.assertRaises(frappe.DoesNotExistError) as refused:
			self.menu(f"{PREFIX} Nowhere")

		self.assertEqual(refused.exception.http_status_code, 404)
		self.assertEqual(str(refused.exception), NOT_AVAILABLE)

	def test_switching_it_off_takes_effect_at_once_even_when_the_card_is_kept(self):
		self.assertTrue(public_menu.get_public_menu(self.restaurant))
		frappe.db.set_value("Restaurant", self.restaurant, "enable_public_menu", 0)

		with self.assertRaises(frappe.DoesNotExistError):
			public_menu.get_public_menu(self.restaurant)

	def test_neorestau_going_off_takes_effect_at_once_even_when_the_card_is_kept(self):
		self.assertTrue(public_menu.get_public_menu(self.restaurant))

		with a_site_where_neorestau_is(0), self.assertRaises(frappe.DoesNotExistError):
			public_menu.get_public_menu(self.restaurant)


class TestWhatThePublicMenuSays(PublicMenuFixtures, FrappeTestCase):
	def test_it_is_the_displayable_fields_of_the_guest_card_and_nothing_else(self):
		badges = [
			self.make_badge("Vegetarian"),
			self.make_badge("Gluten", "Allergen", "gluten.svg", "#e8590c"),
		]
		soup = self.make_item(
			"Soup",
			"Tomato soup",
			standard_rate=9.5,
			description='<div class="ql-editor read-mode"><p>Basil &amp; cream</p></div>',
			image="/files/_test-public-menu-soup.jpg",
			badges=badges[:1],
		)
		chili = self.make_item(
			"Chili", "Chili sin carne", standard_rate=18, custom_spice_level=2, badges=badges
		)
		market = self.make_item("Fish", "Fish of the day", standard_rate=0)
		self.a_card_with(
			[
				{"item_type": "Item", "item": soup},
				{"item_type": "Category", "label": "Mains"},
				{"item_type": "Item", "item": chili, "label": "Chili con carne", "price": 21},
				{"item_type": "Item", "item": market, "custom_price_text": "Market price"},
				{"item_type": "Category", "label": "Desserts"},
			],
			description="Our guests' card",
		)
		frappe.db.set_value("Restaurant", self.restaurant, "logo", "/files/_test-public-menu-logo.png")

		answer = self.menu()

		self.assertEqual(
			answer,
			{
				"restaurant": {"name": BISTRO, "logo": "/files/_test-public-menu-logo.png"},
				"currency": self.currency,
				"card": {"name": f"{PREFIX} Card", "description": "Our guests' card"},
				"sections": [
					{
						"label": "",
						"items": [
							{
								"name": "Tomato soup",
								"description": "Basil & cream",
								"price": 9.5,
								"price_text": "",
								"image": "/files/_test-public-menu-soup.jpg",
								"spice_level": 0,
								"badges": [
									{
										"name": f"{PREFIX} Vegetarian",
										"type": "Dietary",
										"icon": "vegetarian.svg",
										"color": "#2f9e44",
									}
								],
							}
						],
					},
					{
						"label": "Mains",
						"items": [
							{
								"name": "Chili con carne",
								"description": "",
								"price": 21,
								"price_text": "",
								"image": "",
								"spice_level": 2,
								"badges": [
									{
										"name": f"{PREFIX} Vegetarian",
										"type": "Dietary",
										"icon": "vegetarian.svg",
										"color": "#2f9e44",
									},
									{
										"name": f"{PREFIX} Gluten",
										"type": "Allergen",
										"icon": "gluten.svg",
										"color": "#e8590c",
									},
								],
							},
							{
								"name": "Fish of the day",
								"description": "",
								"price": 0,
								"price_text": "Market price",
								"image": "",
								"spice_level": 0,
								"badges": [],
							},
						],
					},
				],
			},
		)

	def test_a_dish_says_only_what_a_guest_reads(self):
		self.a_card_with([{"item_type": "Item", "item": self.make_item("Soup", standard_rate=9)}])
		dish = self.dishes(self.menu())[0]

		self.assertEqual(set(dish), DISH_KEYS)

	def test_it_never_says_stock_cost_or_the_internal_code_of_a_dish(self):
		warehouse = frappe.db.get_value("Warehouse", {"is_group": 0, "disabled": 0}, "name")
		code = self.make_item(
			"Steak",
			"Steak frites",
			is_stock_item=1,
			standard_rate=32,
			valuation_rate=7.77,
			last_purchase_rate=6.66,
		)
		if warehouse:
			self.insert("Bin", item_code=code, warehouse=warehouse, actual_qty=4242)
		self.a_card_with([{"item_type": "Item", "item": code}])

		answer = self.menu()
		said = json.dumps(answer)

		self.assertEqual(self.dishes(answer)[0]["price"], 32)
		for secret in (code, warehouse, "4242", "7.77", "6.66"):
			if secret:
				self.assertNotIn(secret, said)
		for key in (
			"actual_qty",
			"valuation_rate",
			"last_purchase_rate",
			"is_stock_item",
			"item_code",
			"warehouse",
			"stock",
		):
			self.assertNotIn(key, said)

	def test_an_internal_item_is_never_on_it(self):
		tip = self.make_item("Tip", "Tip", is_internal_item=1)
		soup = self.make_item("Soup", "Tomato soup")
		self.a_card_with([{"item_type": "Item", "item": tip}, {"item_type": "Item", "item": soup}])

		self.assertEqual([dish["name"] for dish in self.dishes(self.menu())], ["Tomato soup"])

	def test_a_dish_that_cannot_be_sold_is_not_on_it(self):
		disabled = self.make_item("Gone", "Gone dish", disabled=1)
		deleted = self.make_item("Deleted", "Deleted dish")
		not_for_sale = self.make_item("Parts", "A part", is_sales_item=0)
		soup = self.make_item("Soup", "Tomato soup")
		self.a_card_with(
			[
				{"item_type": "Item", "item": disabled},
				{"item_type": "Item", "item": not_for_sale},
				{"item_type": "Item", "item": soup},
				{"item_type": "Item", "item": soup, "disabled": 1},
				{"item_type": "Item", "item": deleted},
			]
		)
		# An item deleted by force leaves a link that points nowhere
		frappe.delete_doc("Item", deleted, force=True, ignore_permissions=True)

		self.assertEqual([dish["name"] for dish in self.dishes(self.menu())], ["Tomato soup"])

	def test_an_empty_section_is_dropped_and_what_comes_before_the_first_one_is_not(self):
		soup = self.make_item("Soup", "Tomato soup")
		self.a_card_with(
			[
				{"item_type": "Item", "item": soup},
				{"item_type": "Category", "label": "Empty"},
				{"item_type": "Category", "label": "Also empty"},
			]
		)

		self.assertEqual([section["label"] for section in self.menu()["sections"]], [""])

	def test_a_description_that_only_repeats_the_name_is_left_out(self):
		code = self.make_item("Soup", "Tomato soup", description="<p>Tomato soup</p>")
		self.a_card_with([{"item_type": "Item", "item": code}])

		self.assertEqual(self.dishes(self.menu())[0]["description"], "")

	def test_a_price_written_on_the_card_wins_over_the_items(self):
		code = self.make_item("Soup", "Tomato soup", standard_rate=9)
		self.a_card_with(
			[{"item_type": "Item", "item": code, "price": 11}, {"item_type": "Item", "item": code}]
		)

		self.assertEqual([dish["price"] for dish in self.dishes(self.menu())], [11, 9])

	def test_a_spice_level_stays_between_none_and_three(self):
		hot = self.make_item("Hot", "Hot", custom_spice_level=9)
		self.a_card_with([{"item_type": "Item", "item": hot}])

		self.assertEqual(self.dishes(self.menu())[0]["spice_level"], 3)

	def test_a_picture_is_served_only_where_a_guest_can_open_it(self):
		cases = {
			"/files/a.jpg": "/files/a.jpg",
			"/assets/pos_next/a.png": "/assets/pos_next/a.png",
			"https://cdn.example.test/a.jpg": "https://cdn.example.test/a.jpg",
			"/private/files/a.jpg": "",
			"/files/%2e%2e/private/files/a.jpg": "",
			"https://cdn.example.test//private/files/a.jpg": "",
			"https://cdn.example.test/%2Fprivate/files/a.jpg": "",
			"javascript:alert(1)": "",
			"//elsewhere.example.test/a.jpg": "",
			"": "",
			# Written into a template between quotes, an address must not be able to close them
			'/files/x.png"><script>alert(1)</script>': "/files/x.png%22%3E%3Cscript%3Ealert(1)%3C/script%3E",
			"/files/Pizza d'été 2.png": "/files/Pizza%20d%27été%202.png",
		}
		for index, (stored, served) in enumerate(cases.items()):
			code = self.make_item(f"Photo {index}", f"Photo {index}", image=stored)
			with self.subTest(stored=stored):
				self.publish(
					self.make_card(self.restaurant, f"Photos {index}", [{"item_type": "Item", "item": code}])
				)
				self.assertEqual(self.dishes(self.menu())[0]["image"], served)

	def test_the_logos_are_served_as_the_pictures_are(self):
		self.a_card_with([{"item_type": "Item", "item": self.make_item("Soup", "Tomato soup")}])
		breakout = 'https://cdn.example.test/logo.png" onerror="alert(1)'
		frappe.db.set_value("Restaurant", self.restaurant, "logo", breakout)
		self.forget_the_cards()

		self.assertEqual(
			self.menu()["restaurant"]["logo"], "https://cdn.example.test/logo.png%22%20onerror=%22alert(1)"
		)

		# The company's stands in for a restaurant that has none: through the same check
		frappe.db.set_value("Restaurant", self.restaurant, "logo", "")
		frappe.db.set_value("Company", self.company, "company_logo", "/files/x.png'><svg onload=alert(1)>")
		self.forget_the_cards()

		self.assertEqual(self.menu()["restaurant"]["logo"], "/files/x.png%27%3E%3Csvg%20onload=alert(1)%3E")

	def test_a_badge_icon_and_colour_are_checked_before_they_are_served(self):
		odd = self.make_badge("Odd", "Quality")
		# What a desk form would refuse is not what a script, an import or an older version may have written
		frappe.db.set_value(
			"Menu Badge", odd, {"icon": "../../private/x.svg", "color": "red; background:url(x)"}
		)
		code = self.make_item("Soup", "Tomato soup", badges=[odd])
		self.a_card_with([{"item_type": "Item", "item": code}])

		badge = self.dishes(self.menu())[0]["badges"][0]

		self.assertEqual(set(badge), BADGE_KEYS)
		self.assertEqual((badge["icon"], badge["color"]), ("", ""))

	def test_the_logo_of_the_company_stands_in_for_a_restaurant_without_one(self):
		self.a_card_with([{"item_type": "Item", "item": self.make_item("Soup", "Tomato soup")}])
		frappe.db.set_value("Company", self.company, "company_logo", "/files/_test-public-menu-company.png")

		self.assertEqual(self.menu()["restaurant"]["logo"], "/files/_test-public-menu-company.png")

	def test_a_name_with_an_ampersand_and_an_accent_is_found(self):
		self.make_restaurant(CAFE, enable_public_menu=1)

		self.assertEqual(self.menu(CAFE)["restaurant"]["name"], CAFE)


class TestWhichCardThePublicMenuShows(PublicMenuFixtures, FrappeTestCase):
	"""Only the restaurant's own guest card, published; anything else is the polite answer that there is no menu yet."""

	def setUp(self):
		super().setUp()
		self.soup = self.make_item("Soup", "Tomato soup")
		self.rows = [{"item_type": "Item", "item": self.soup}]

	def assert_no_menu(self, answer):
		self.assertIsNone(answer["card"])
		self.assertEqual(answer["sections"], [])
		# The restaurant is still named: the page says so politely, it is not an error
		self.assertEqual(answer["restaurant"]["name"], BISTRO)

	def test_a_restaurant_that_chose_no_guest_card_has_no_menu_yet(self):
		self.assert_no_menu(self.menu())

	def test_a_guest_card_that_is_gone_is_no_menu(self):
		self.publish(f"{PREFIX} Deleted card")

		self.assert_no_menu(self.menu())

	def test_an_inactive_card_is_never_shown(self):
		self.a_card_with(self.rows, is_active=0)

		self.assert_no_menu(self.menu())

	def test_a_card_outside_its_dates_is_not_published(self):
		for window in (
			{"available_from": add_days(nowdate(), 1)},
			{"available_to": add_days(nowdate(), -1)},
		):
			with self.subTest(window=window):
				card = self.make_card(
					self.restaurant, f"Dated {sorted(window)[0]}", self.rows, is_permanent=0, **window
				)
				self.publish(card)
				self.assert_no_menu(self.menu())

	def test_a_card_inside_its_dates_is_published_and_a_permanent_one_has_no_dates(self):
		inside = self.make_card(
			self.restaurant,
			"Inside",
			self.rows,
			is_permanent=0,
			available_from=add_days(nowdate(), -1),
			available_to=add_days(nowdate(), 1),
		)
		always = self.make_card(
			self.restaurant, "Always", self.rows, is_permanent=1, available_to=add_days(nowdate(), -30)
		)
		for card in (inside, always):
			with self.subTest(card=card):
				self.publish(card)
				self.assertEqual(self.menu()["card"]["name"], card)

	def test_the_card_of_another_restaurant_is_never_served(self):
		brasserie = self.make_restaurant(BRASSERIE, enable_public_menu=1)
		theirs = self.make_card(
			brasserie, "Theirs", [{"item_type": "Item", "item": self.make_item("Steak", "Steak")}]
		)
		self.publish(theirs)

		answer = self.menu()

		self.assert_no_menu(answer)
		self.assertNotIn("Steak", json.dumps(answer))
		self.assertNotIn(theirs, json.dumps(answer))

	def test_each_restaurant_serves_its_own_card(self):
		brasserie = self.make_restaurant(BRASSERIE, enable_public_menu=1)
		steak = self.make_item("Steak", "Steak frites")
		self.publish(self.make_card(brasserie, "Theirs", [{"item_type": "Item", "item": steak}]), brasserie)
		self.a_card_with(self.rows)

		self.assertEqual([d["name"] for d in self.dishes(self.menu(BISTRO))], ["Tomato soup"])
		self.assertEqual([d["name"] for d in self.dishes(self.menu(BRASSERIE))], ["Steak frites"])

	def test_a_card_that_names_no_restaurant_belongs_to_the_default_one_only(self):
		brasserie = self.make_restaurant(BRASSERIE, enable_public_menu=1)
		legacy = self.make_card(self.restaurant, "Legacy", self.rows)
		# A card saved before the restaurants existed: the doctype attaches one to a card that names none, so it is cleared here
		frappe.db.set_value("Restaurant Card", legacy, "restaurant", None)
		for default, shown in ((self.restaurant, True), (brasserie, False)):
			with (
				self.subTest(default=default),
				patch.object(restaurant_settings, "default_restaurant", return_value=default),
			):
				self.publish(legacy)
				answer = self.menu()
				if shown:
					self.assertEqual(self.dishes(answer)[0]["name"], "Tomato soup")
				else:
					self.assert_no_menu(answer)


class TestThePublicMenuIsOpenToEveryone(PublicMenuFixtures, FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.a_card_with(
			[{"item_type": "Item", "item": self.make_item("Soup", "Tomato soup", standard_rate=9)}]
		)

	def test_the_endpoint_is_for_guests_and_for_reading_only(self):
		endpoint = public_menu.get_public_menu

		self.assertIn(endpoint, frappe.whitelisted)
		self.assertIn(endpoint, frappe.guest_methods)
		self.assertEqual(frappe.allowed_http_methods_for_whitelisted_func[endpoint], ("GET",))
		# It does not ask Frappe to leave its argument as it is: Frappe rewrites a guest's string only when it holds an HTML
		# tag, which no restaurant's name can (see below), so there is nothing to ask
		self.assertNotIn(endpoint, frappe.xss_safe_methods)

	def test_a_guest_finds_a_restaurant_whose_name_has_an_ampersand_an_accent_or_an_apostrophe(self):
		# Through the handler a web request goes through, which rewrites a guest's string only when it holds an HTML tag: a
		# plain name arrives as it was typed. It passes the endpoint only the arguments it takes (the command is one it does not)
		self.addCleanup(frappe.cache().delete_value, f"rl:{COMMAND}:{GUEST_IP}")
		for name in (CAFE, APOSTROPHE):
			self.make_restaurant(name, enable_public_menu=1)
		frappe.set_user("Guest")

		for name in (CAFE, APOSTROPHE):
			with self.subTest(name=name), a_request_from(GUEST_IP):
				frappe.form_dict.update({"restaurant": name})
				answer = execute_cmd(COMMAND)

				self.assertEqual(answer["restaurant"]["name"], name)

	def test_a_name_that_holds_a_tag_is_rewritten_by_frappe_and_finds_nothing(self):
		frappe.set_user("Guest")
		self.addCleanup(frappe.cache().delete_value, f"rl:{COMMAND}:{GUEST_IP}")

		for name in (f"<script>alert(1)</script>{self.restaurant}", f"<b>{self.restaurant}</b>"):
			with self.subTest(name=name), a_request_from(GUEST_IP):
				frappe.form_dict.update({"restaurant": name})
				with self.assertRaises(frappe.DoesNotExistError) as refused:
					execute_cmd(COMMAND)

				self.assertEqual(str(refused.exception), NOT_AVAILABLE)

	def test_no_restaurant_can_be_named_with_a_tag_so_none_is_lost_to_that_rewriting(self):
		with self.assertRaises(frappe.NameError):
			self.make_restaurant(f"{PREFIX} <b>Bar</b>")

	def test_a_guest_cannot_call_it_to_write(self):
		frappe.set_user("Guest")

		with a_request_from(GUEST_IP):
			frappe.local.request.method = "POST"
			frappe.form_dict.update({"restaurant": self.restaurant})
			with self.assertRaises(frappe.PermissionError):
				execute_cmd(COMMAND)

	def test_a_portal_account_and_an_anonymous_visitor_see_the_same(self):
		if frappe.db.exists("User", PORTAL):
			frappe.delete_doc("User", PORTAL, ignore_permissions=True, force=True)
		self.insert("User", email=PORTAL, first_name="Portal", send_welcome_email=0)
		frappe.db.set_value("User", PORTAL, "user_type", "Website User")
		frappe.clear_cache(user=PORTAL)

		answers = {}
		for user in ("Guest", PORTAL, "Administrator"):
			frappe.set_user(user)
			answers[user] = self.menu()

		self.assertTrue(answers["Guest"]["sections"])
		self.assertEqual(answers["Guest"], answers[PORTAL])
		self.assertEqual(answers["Guest"], answers["Administrator"])


class TestThePublicMenuInProcess(PublicMenuFixtures, FrappeTestCase):
	"""What the website's menu block (task 19) calls: the rules of the endpoint, in process.

	`public_menu()` is the gate, the kept card and the build, and answers None for a menu that is not public; the endpoint
	wraps it for the 404 and for the limit per address.
	"""

	def setUp(self):
		super().setUp()
		self.a_card_with(
			[{"item_type": "Item", "item": self.make_item("Soup", "Tomato soup", standard_rate=9)}]
		)
		self.addCleanup(frappe.cache().delete_value, f"rl:{COMMAND}:{GUEST_IP}")

	def test_it_is_the_answer_of_the_endpoint(self):
		self.forget_the_cards()
		in_process = public_menu.public_menu(self.restaurant)
		self.forget_the_cards()
		through_the_endpoint = public_menu.get_public_menu(self.restaurant)

		self.assertEqual(in_process, through_the_endpoint)
		self.assertEqual([dish["name"] for dish in self.dishes(in_process)], ["Tomato soup"])

	def test_it_is_none_where_the_option_is_off(self):
		frappe.db.set_value("Restaurant", self.restaurant, "enable_public_menu", 0)

		self.assertIsNone(public_menu.public_menu(self.restaurant))

	def test_it_is_none_where_neorestau_is_off_even_when_the_card_is_kept(self):
		self.assertTrue(public_menu.public_menu(self.restaurant))

		for value in (0, "0", None):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				self.assertIsNone(public_menu.public_menu(self.restaurant))

	def test_it_is_none_for_a_disabled_restaurant_and_for_a_name_that_is_not_one(self):
		frappe.db.set_value("Restaurant", self.restaurant, "enabled", 0)
		self.assertIsNone(public_menu.public_menu(self.restaurant))

		for name in ("", "   ", None, f"{PREFIX} Nowhere", "x" * 300, 5, ["a"], {"a": 1}):
			with self.subTest(name=name):
				self.assertIsNone(public_menu.public_menu(name))

	def test_it_is_built_once_and_kept_for_the_endpoint_too(self):
		self.forget_the_cards()
		with patch.object(public_menu, "_build", wraps=public_menu._build) as build:
			public_menu.public_menu(self.restaurant)
			public_menu.get_public_menu(self.restaurant)
			public_menu.public_menu(self.restaurant)

		self.assertEqual(build.call_count, 1)

	def test_the_endpoint_does_nothing_but_wrap_it(self):
		the_menu = {"restaurant": {"name": "A", "logo": ""}, "currency": "CHF", "card": None, "sections": []}

		with patch.object(public_menu, "public_menu", return_value=the_menu) as inner:
			self.assertIs(public_menu.get_public_menu("Whatever"), the_menu)
		inner.assert_called_once_with("Whatever")

		with patch.object(public_menu, "public_menu", return_value=None):
			with self.assertRaises(frappe.DoesNotExistError) as refused:
				public_menu.get_public_menu(self.restaurant)
		self.assertEqual(str(refused.exception), NOT_AVAILABLE)

	def test_what_a_caller_does_to_the_answer_never_reaches_the_next_answer(self):
		first = public_menu.public_menu(self.restaurant)
		before = copy.deepcopy(first)
		self.assertTrue(first["sections"])

		# What a template might do to it: drop, fill in, empty
		first["sections"][0]["items"].clear()
		first["sections"][0]["label"] = "Changed"
		first["restaurant"]["name"] = "Changed"
		first["card"] = None
		second = public_menu.public_menu(self.restaurant)
		self.assertEqual(second, before)

		second["sections"].clear()
		self.assertEqual(public_menu.public_menu(self.restaurant), before)
		self.assertEqual(public_menu.get_public_menu(self.restaurant), before)

	def test_the_answer_is_a_copy_even_where_the_cache_hands_back_the_very_object_it_holds(self):
		# Frappe's Redis cache unpickles a fresh object at each read, but a cache that keeps objects (an in-process one, a
		# future version) hands back the same one to everybody: the rule does not rest on which cache is under it
		kept = {}
		real = frappe.cache

		class AnObjectKeptAsItIs:
			"""Frappe's cache for everything but the public menu's cards, which it keeps as the objects they are."""

			def __call__(self):
				return self

			def __getattr__(self, name):
				return getattr(real, name)

			def get_value(self, key, *args, **kwargs):
				if key.startswith(public_menu.CACHE_PREFIX):
					return kept.get(key)
				return real.get_value(key, *args, **kwargs)

			def set_value(self, key, value, *args, **kwargs):
				if key.startswith(public_menu.CACHE_PREFIX):
					kept[key] = value
				else:
					real.set_value(key, value, *args, **kwargs)

		with patch.object(frappe, "cache", new=AnObjectKeptAsItIs()):
			first = public_menu.public_menu(self.restaurant)
			before = copy.deepcopy(first)
			first["sections"].clear()
			first["restaurant"]["name"] = "Changed"
			second = public_menu.public_menu(self.restaurant)
			second["sections"].clear()

			self.assertEqual(public_menu.public_menu(self.restaurant), before)
		self.assertTrue(kept)

	def test_only_the_endpoint_is_limited_per_address(self):
		with a_request_from(GUEST_IP), patch.object(public_menu, "RATE_LIMIT", 1):
			for _ in range(3):
				self.assertTrue(public_menu.public_menu(self.restaurant))

			self.assertTrue(public_menu.get_public_menu(self.restaurant))
			with self.assertRaises(frappe.RateLimitExceededError):
				public_menu.get_public_menu(self.restaurant)


class ParsedMarkup(HTMLParser):
	"""What a browser makes of a piece of markup: its tags with their attributes, and the text it holds."""

	def __init__(self):
		super().__init__()
		self.tags = []
		self.text = ""

	def handle_starttag(self, tag, attrs):
		self.tags.append((tag, attrs))

	def handle_data(self, data):
		self.text += data


class TestAPictureIsServedOnlyWhereAGuestCanOpenIt(FrappeTestCase):
	"""The address of a picture goes to a guest's browser, which reads it as a URL and not as the text the desk stored.

	A browser reads `%2e` as a dot and `\\` as a slash, a server decodes what it is given, so a climb out of a public folder
	into a private one is looked for in the path as they read it.
	"""

	# Served as they are: nothing in them needs encoding
	SERVED = (
		"/files/a.jpg",
		"/files/my%20photo.jpg",
		"/files/caf%C3%A9.jpg",
		"/files/café.jpg",
		# Two dots inside a name climb nowhere
		"/files/a..b.jpg",
		"/files/sub/dir/x.png",
		"/files/a.jpg?v=2",
		"/files/a%27b%22c.jpg",
		"/files/a.jpg?v=2&w=3",
		"/assets/pos_next/a.png",
		"https://cdn.example.test/a.jpg",
		"http://cdn.example.test/a.jpg",
	)
	# Frappe keeps a file name as it was uploaded, spaces and apostrophes included: these are served, and what is served is
	# the same address with what could close an attribute percent-encoded (a `%` that is already there is left alone)
	ENCODED: ClassVar[dict[str, str]] = {
		"/files/my photo.jpg": "/files/my%20photo.jpg",
		"/files/Pizza d'été 2.png": "/files/Pizza%20d%27été%202.png",
		"https://cdn.example.test/my photo.jpg": "https://cdn.example.test/my%20photo.jpg",
		'/files/say "hi".jpg': "/files/say%20%22hi%22.jpg",
		"/files/a`b.jpg": "/files/a%60b.jpg",
		"/files/a\u00a0b\u2028c.jpg": "/files/a%C2%A0b%E2%80%A8c.jpg",
		"/files/50%25 off.jpg": "/files/50%25%20off.jpg",
		"  /files/a.jpg  ": "/files/a.jpg",
	}
	# What breaks out of an attribute, a tag or a script block when an address is written between quotes, or none
	BREAKOUTS = (
		'/files/x.png"><script>alert(1)</script>',
		'https://cdn.example.test/x.png" onerror="alert(1)',
		"/files/x.png' onerror='alert(1)",
		"/files/x.png` onerror=`alert(1)",
		'/files/x.png"\u2028onerror="alert(1)',
		'https://cdn.example.test/x.png?a="><img src=x onerror=alert(1)>',
		"https://cdn.example.test/</script><script>alert(1)</script>.png",
		"/files/x.png\u00a0onerror=alert(1)",
	)
	REFUSED = (
		"",
		None,
		"a.jpg",
		"files/a.jpg",
		# A folder is no picture
		"/files/",
		"/files/.",
		"javascript:alert(1)",
		"data:image/png;base64,AAAA",
		"//elsewhere.example.test/a.jpg",
		"/private/files/a.jpg",
		# The site's own host does not make its private folder public
		"https://bistro.example.test/private/files/a.jpg",
		"https://bistro.example.test/files/./../private/files/a.jpg",
		# The private folder under every spelling of its slash: `normpath` keeps a leading double slash, a server does not
		"https://bistro.example.test//private/files/a.pdf",
		"https://bistro.example.test///private/files/a.pdf",
		"https://bistro.example.test/%2Fprivate/files/a.pdf",
		"https://bistro.example.test/%2F%2Fprivate/files/a.pdf",
		"https://bistro.example.test/%2fprivate/files/a.pdf",
		"https://bistro.example.test/%252Fprivate/files/a.pdf",
		"https://bistro.example.test/./private/files/a.pdf",
		"https://bistro.example.test/files/..//private/files/a.pdf",
		"https://bistro.example.test//./private/files/a.pdf",
		"https://bistro.example.test/%2F/private/files/a.pdf",
		# A climb, spelt every way a browser or a server reads it
		"/files/../private/files/a.jpg",
		"/files/%2e%2e/private/files/a.jpg",
		"/files/%2E%2E/private/files/a.jpg",
		"/files/.%2e/private/files/a.jpg",
		"/files/%2e./private/files/a.jpg",
		"/files/..%2fprivate%2ffiles%2fa.jpg",
		"/files/%2e%2e%2fprivate/files/a.jpg",
		"/files/..%5cprivate%5cfiles%5ca.jpg",
		"/files/..\\private\\files\\a.jpg",
		"/files/%252e%252e/private/files/a.jpg",
		"/assets/%2e%2e/private/files/a.jpg",
		"https://cdn.example.test/%2e%2e/a.jpg",
		# What has no place in an address
		"/files/a\\b.jpg",
		"/files/a%00.jpg",
		"/files/a\x00.jpg",
		"/files/a\r\nX-Header: 1.jpg",
		"/files/a%0d%0ab.jpg",
		"http://[::1/a.jpg",
	)

	def test_what_a_guest_can_open_is_served_as_it_is(self):
		for url in self.SERVED:
			with self.subTest(url=url):
				self.assertEqual(public_menu._public_file(url), url)

	def test_everything_else_is_left_out(self):
		for url in self.REFUSED:
			with self.subTest(url=url):
				self.assertEqual(public_menu._public_file(url), "")

	def test_a_file_name_with_spaces_and_apostrophes_is_served_encoded_and_opens_the_same_file(self):
		for stored, served in self.ENCODED.items():
			with self.subTest(stored=stored):
				self.assertEqual(public_menu._public_file(stored), served)
				# What a browser asks for is the file the desk stored (a `%` the name already held is not encoded again)
				self.assertEqual(unquote(served), unquote(stored.strip()))

	def test_what_could_close_an_attribute_comes_out_encoded(self):
		for stored in self.BREAKOUTS:
			with self.subTest(stored=stored):
				served = public_menu._public_file(stored)

				# Served (a legitimate name may hold any of these), and not one character of it can close an attribute,
				# quoted or not, open a tag or end a script block
				self.assertTrue(served)
				self.assertIsNone(re.search(r"[\"'`<>\s]", served), served)
				self.assertEqual(unquote(served), stored)

	def test_the_encoded_address_stays_in_the_attribute_the_template_writes_it_in(self):
		# As the website's menu block writes it: Frappe's Jinja does not escape what it renders
		templates = (
			'<img src="{{ image }}" alt="">',
			"<img src='{{ image }}' alt=''>",
			'<img src={{ image }} alt="">',
			'<script type="application/ld+json">{"image": "{{ image }}"}</script>',
		)
		for stored in (*self.BREAKOUTS, *self.ENCODED):
			served = public_menu._public_file(stored)
			for template in templates:
				with self.subTest(stored=stored, template=template):
					parsed = ParsedMarkup()
					parsed.feed(frappe.render_template(template, {"image": served}))
					parsed.close()

					if template.startswith("<script"):
						self.assertEqual(parsed.tags, [("script", [("type", "application/ld+json")])])
						self.assertEqual(json.loads(parsed.text)["image"], served)
					else:
						self.assertEqual(parsed.tags, [("img", [("src", served), ("alt", "")])])


class TestBadgeNamesReadInTheLanguageOfTheGuest(PublicMenuFixtures, FrappeTestCase):
	"""An allergen is something a guest must be able to read.

	The seeded badges are English data (`Tree Nuts`, `Sulfites`): their names are translated when the card is built, in the
	language of the request (`frappe.local.lang`, which follows a guest's Accept-Language), and a card is kept once per
	language.
	"""

	def setUp(self):
		# Registered before the fixtures' rollback, so that it runs after it: what a test translated is in Redis, which a
		# rollback does not empty
		self.addCleanup(clear_user_translation_cache, "fr")
		super().setUp()
		self.nuts = self.make_badge("Tree Nuts", "Allergen", "tree_nuts.svg", "#78350F")
		# A badge the restaurant made itself: no catalogue knows it, so it reads as it was written
		self.pick = self.make_badge("Chef's Pick", "Quality", "homemade.svg", "#EA580C")
		code = self.make_item("Soup", "Tomato soup", badges=[self.nuts, self.pick])
		self.a_card_with([{"item_type": "Item", "item": code}])
		self.translate_to_french(self.nuts, "Fruits à coque d'essai", context=public_menu.BADGE_CONTEXT)

	def translate_to_french(self, source, translated, context=None):
		values = {"language": "fr", "source_text": source, "translated_text": translated}
		self.insert("Translation", **values, **({"context": context} if context else {}))

	def asked_in(self, lang):
		"""The answer to a request in a language: its `frappe.local.lang`, as the request sets it from Accept-Language."""
		before = frappe.local.lang
		frappe.local.lang = lang
		try:
			return public_menu.get_public_menu(self.restaurant)
		finally:
			frappe.local.lang = before

	def names(self, answer):
		return [badge["name"] for badge in self.dishes(answer)[0]["badges"]]

	def test_a_french_request_reads_the_allergens_in_french_and_an_english_one_in_english(self):
		french = self.asked_in("fr")
		english = self.asked_in("en")

		self.assertEqual(self.names(french), ["Fruits à coque d'essai", self.pick])
		self.assertEqual(self.names(english), [self.nuts, self.pick])

	def test_only_the_name_is_translated(self):
		badge = self.dishes(self.asked_in("fr"))[0]["badges"][0]

		self.assertEqual(set(badge), BADGE_KEYS)
		self.assertEqual(
			(badge["type"], badge["icon"], badge["color"]), ("Allergen", "tree_nuts.svg", "#78350F")
		)

	def test_each_language_is_kept_apart_and_answers_in_its_own(self):
		with patch.object(public_menu, "_build", wraps=public_menu._build) as build:
			first_french = self.asked_in("fr")
			english = self.asked_in("en")
			second_french = self.asked_in("fr")
			second_english = self.asked_in("en")

		self.assertEqual(build.call_count, 2)
		self.assertEqual(first_french, second_french)
		self.assertEqual(english, second_english)
		self.assertNotEqual(first_french, english)
		french_key = public_menu.cache_key(self.restaurant, "fr")
		english_key = public_menu.cache_key(self.restaurant, "en")
		self.assertNotEqual(french_key, english_key)
		self.assertEqual(frappe.cache().get_value(french_key, expires=True), first_french)
		self.assertEqual(frappe.cache().get_value(english_key, expires=True), english)

	def test_a_language_with_no_translation_reads_the_english(self):
		self.assertEqual(self.names(self.asked_in("de")), [self.nuts, self.pick])

	def test_a_translation_with_no_context_serves_a_badge_the_catalogue_already_knows(self):
		# `_()` looks the contextual entry up first and falls back on the bare text: a word the catalogue already translates
		# (as the other apps' do for `Milk` or `Fish`) needs nothing of ours
		self.translate_to_french(self.pick, "Choix du chef (catalogue)")

		self.assertEqual(self.names(self.asked_in("fr"))[1], "Choix du chef (catalogue)")

	def test_the_cache_key_names_the_language_of_the_request_unless_told_another(self):
		before = frappe.local.lang
		frappe.local.lang = "fr"
		try:
			self.assertEqual(
				public_menu.cache_key(self.restaurant), public_menu.cache_key(self.restaurant, "fr")
			)
			self.assertNotEqual(
				public_menu.cache_key(self.restaurant), public_menu.cache_key(self.restaurant, "en")
			)
		finally:
			frappe.local.lang = before


class TestTheSeededBadgesAreAnchoredForTheTranslators(FrappeTestCase):
	"""A badge's name is data, read out of the database: the extractor of the translators never sees it in the code.

	`i18n_anchors.py` mentions each seeded name, with the context the menu translates it in, so that the next
	`bench generate-pot-file` keeps it. The check is made with the extractor itself.
	"""

	def test_every_seeded_badge_is_anchored_with_the_context_the_menu_translates_it_in(self):
		with open(frappe.get_app_path("pos_next", "fixtures", "menu_badge.json")) as seeded_file:
			seeded = {badge["badge_name"] for badge in json.load(seeded_file)}
		with open(frappe.get_app_path("pos_next", "i18n_anchors.py"), "rb") as anchors_file:
			extracted = {
				(message, context)
				for _line, message, _comments, context in extract(
					python_extractor, anchors_file, keywords=PYTHON_KEYWORDS
				)
			}

		self.assertTrue(seeded)
		self.assertEqual(
			sorted(
				seeded - {message for message, context in extracted if context == public_menu.BADGE_CONTEXT}
			),
			[],
		)

	def test_the_menu_itself_feeds_no_badge_name_to_the_pot_by_chance(self):
		# Its `_()` takes the name from a variable: the names are the anchors' business, and a literal here would be a
		# second home for one
		with open(frappe.get_app_path("pos_next", "api", "public_menu.py"), "rb") as source:
			extracted = [
				message
				for _line, message, _comments, _context in extract(
					python_extractor, source, keywords=PYTHON_KEYWORDS
				)
			]

		self.assertEqual(extracted, ["This menu is not available"])

	def test_this_file_feeds_nothing_to_the_pot(self):
		# The generator reads every .py of the app, tests included
		with open(__file__, "rb") as source:
			self.assertEqual(list(extract(python_extractor, source, keywords=PYTHON_KEYWORDS)), [])


class TestThePublicMenuIsKeptAndLimited(PublicMenuFixtures, FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.a_card_with(
			[{"item_type": "Item", "item": self.make_item("Soup", "Tomato soup", standard_rate=9)}]
		)
		self.forget_the_cards()
		stack = ExitStack()
		self.addCleanup(stack.close)
		self.stack = stack

	def test_the_card_is_built_once_and_kept_for_a_short_time(self):
		with patch.object(public_menu, "_build", wraps=public_menu._build) as build:
			first = public_menu.get_public_menu(self.restaurant)
			second = public_menu.get_public_menu(self.restaurant)

		self.assertEqual(build.call_count, 1)
		self.assertEqual(first, second)
		lifetime = frappe.cache().ttl(frappe.cache().make_key(public_menu.cache_key(self.restaurant)))
		self.assertTrue(0 < lifetime <= public_menu.CACHE_SECONDS <= 120)

	def test_it_is_kept_for_each_restaurant_apart(self):
		brasserie = self.make_restaurant(BRASSERIE, enable_public_menu=1)
		steak = self.make_item("Steak", "Steak frites")
		self.publish(self.make_card(brasserie, "Theirs", [{"item_type": "Item", "item": steak}]), brasserie)
		self.forget_the_cards()

		ours = public_menu.get_public_menu(self.restaurant)
		theirs = public_menu.get_public_menu(brasserie)

		self.assertNotEqual(public_menu.cache_key(self.restaurant), public_menu.cache_key(brasserie))
		self.assertEqual([d["name"] for d in self.dishes(ours)], ["Tomato soup"])
		self.assertEqual([d["name"] for d in self.dishes(theirs)], ["Steak frites"])

	def test_a_restaurant_that_does_not_publish_leaves_nothing_in_the_cache(self):
		frappe.db.set_value("Restaurant", self.restaurant, "enable_public_menu", 0)
		with self.assertRaises(frappe.DoesNotExistError):
			public_menu.get_public_menu(self.restaurant)
		with self.assertRaises(frappe.DoesNotExistError):
			public_menu.get_public_menu(f"{PREFIX} {'x' * 50}")

		self.assertIsNone(frappe.cache().get_value(public_menu.cache_key(self.restaurant), expires=True))
		self.assertIsNone(
			frappe.cache().get_value(public_menu.cache_key(f"{PREFIX} {'x' * 50}"), expires=True)
		)

	def test_a_guest_can_ask_only_so_often(self):
		self.addCleanup(frappe.cache().delete_value, f"rl:{COMMAND}:{GUEST_IP}")
		self.stack.enter_context(a_request_from(GUEST_IP))
		self.stack.enter_context(patch.object(public_menu, "RATE_LIMIT", 3))

		for _ in range(3):
			public_menu.get_public_menu(self.restaurant)
		with self.assertRaises(frappe.RateLimitExceededError):
			public_menu.get_public_menu(self.restaurant)

	def test_the_limit_is_each_address_s_own(self):
		self.addCleanup(frappe.cache().delete_value, f"rl:{COMMAND}:{GUEST_IP}")
		self.addCleanup(frappe.cache().delete_value, f"rl:{COMMAND}:198.51.100.24")
		self.stack.enter_context(patch.object(public_menu, "RATE_LIMIT", 2))

		with a_request_from(GUEST_IP):
			for _ in range(2):
				public_menu.get_public_menu(self.restaurant)
		with a_request_from("198.51.100.24"):
			self.assertTrue(public_menu.get_public_menu(self.restaurant))
