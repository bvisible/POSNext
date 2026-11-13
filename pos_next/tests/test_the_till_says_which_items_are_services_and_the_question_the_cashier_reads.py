# //// Neoffice — added file (no upstream equivalent).
"""Which lines ask for a person, and in which words, is the till's own choice (product owner, 13.11.2026: « pour un garage ou une boutique, pas seulement le salon »).

Until now what a service is came from the site only: a hook answered by the salon's settings, and without it every line was a service. A garage or a shop could
not say « my services are the items I do not keep in stock » or « the items of these groups ». The suite pins what replaces it, as the till manager of the till:

- by default nothing changes: the till says nothing, the site's hook decides (and without it every line is a service);
- « items not kept in stock »: a service is an item that is not kept in stock, a product one that is; the tip and a gift card are neither;
- « items of the chosen groups »: a service is an item of those groups or of their sub-groups, everything else a product;
- a product asks for a person only where the till follows the products by person too (the tick that was already there), whatever way services are told;
- the till is told the kinds are told as soon as it has a rule of its own, and the question the manager chose for a service, trimmed;
- the three settings are listed on the sales persons group, the groups only once « items of the chosen groups » is chosen, and a manager sets them.
"""

from unittest.mock import patch

import frappe

from pos_next import sales_person_lines as lines
from pos_next.tests.test_service_families import a_group, an_item, the_root
from pos_next.tests.test_till_settings import TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings.api import get_till_settings, save_till_settings

MODE = "sales_person_lines_ask"
GROUPS = "sales_person_service_groups"
QUESTION = "sales_person_question"


def a_site_without_a_kind_hook():
	"""A site whose theme does not tell services from products: the work site's own theme declares the hook, whatever it answers."""
	real = frappe.get_hooks

	def get_hooks(hook=None, *args, **kwargs):
		if hook == lines.HOOK:
			return []
		return real(hook, *args, **kwargs)

	return patch("frappe.get_hooks", side_effect=get_hooks)


def a_group_of(name, parent, is_group=0):
	return frappe.db.exists("Item Group", name) or a_group(name, parent, is_group=is_group)


class TestTheTillSaysWhichItemsAreServices(TillSettingsCase):
	def setUp(self):
		super().setUp()
		company = self.fx.company
		services = a_group_of("_Test LA Services", the_root(), is_group=1)
		self.hair = a_group_of("_Test LA Hair", services)
		self.shelf = a_group_of("_Test LA Shelf", the_root())
		self.services_group = services
		self.cut = frappe.db.exists("Item", "_Test LA Cut") or an_item("_Test LA Cut", self.hair, company)
		self.consulting = frappe.db.exists("Item", "_Test LA Consulting") or an_item(
			"_Test LA Consulting", self.shelf, company
		)
		self.shampoo = frappe.db.exists("Item", "_Test LA Shampoo") or an_item(
			"_Test LA Shampoo", self.shelf, company
		)
		frappe.db.set_value("Item", self.shampoo, "is_stock_item", 1)
		frappe.db.set_value("Item", self.consulting, "is_stock_item", 0)
		frappe.db.set_value("Item", self.cut, "is_stock_item", 0)

	def choose(self, **values):
		self.as_user(TILL_MANAGER)
		try:
			return save_till_settings(self.shop_till, {"enable_sales_persons": "Single", **values})
		finally:
			frappe.set_user("Administrator")

	# ------------------------------------------------------------------------------------------------ the default
	def test_a_till_that_says_nothing_keeps_the_way_of_the_site(self):
		rule = lines.rule_of(self.shop_till)

		self.assertEqual((rule.mode, rule.groups, rule.question), (lines.MODE_SITE, [], ""))
		# Without a hook every line is a service, as it always was; and the kinds are not told
		with a_site_without_a_kind_hook():
			self.assertIsNone(lines.item_kind(self.shampoo, self.shop_till))
			self.assertTrue(
				lines.asks_for_a_person(self.shampoo, products_tracked=False, pos_profile=self.shop_till)
			)

	def test_a_profile_that_is_none_or_unknown_keeps_the_way_of_the_site(self):
		for profile in (None, "", "No Such Till"):
			with self.subTest(profile=profile):
				self.assertEqual(lines.rule_of(profile).mode, lines.MODE_SITE)

	# ------------------------------------------------------------------------------------------------ items not kept in stock
	def test_items_not_kept_in_stock_are_the_services_and_the_others_products(self):
		self.choose(**{MODE: lines.MODE_NON_STOCK})

		self.assertEqual(lines.item_kind(self.cut, self.shop_till), lines.SERVICE)
		self.assertEqual(lines.item_kind(self.consulting, self.shop_till), lines.SERVICE)
		self.assertEqual(lines.item_kind(self.shampoo, self.shop_till), lines.PRODUCT)

	def test_the_tip_a_gift_card_and_an_item_that_does_not_exist_are_neither(self):
		self.choose(**{MODE: lines.MODE_NON_STOCK})
		frappe.db.set_value("Item", self.consulting, "is_internal_item", 1)
		gift = self.consulting
		frappe.db.set_value("POS Settings", {"pos_profile": self.shop_till}, "gift_card_item", self.cut)

		self.assertIsNone(lines.item_kind(gift, self.shop_till))
		self.assertIsNone(lines.item_kind(self.cut, self.shop_till))
		self.assertIsNone(lines.item_kind("_Test LA Nothing", self.shop_till))

	def test_a_product_asks_for_a_person_only_where_the_till_follows_products_by_person(self):
		self.choose(**{MODE: lines.MODE_NON_STOCK})

		self.assertTrue(lines.asks_for_a_person(self.cut, products_tracked=False, pos_profile=self.shop_till))
		self.assertFalse(
			lines.asks_for_a_person(self.shampoo, products_tracked=False, pos_profile=self.shop_till)
		)
		self.assertTrue(
			lines.asks_for_a_person(self.shampoo, products_tracked=True, pos_profile=self.shop_till)
		)

	# ------------------------------------------------------------------------------------------------ items of the chosen groups
	def test_the_items_of_the_chosen_groups_and_their_subgroups_are_the_services(self):
		self.choose(**{MODE: lines.MODE_GROUPS, GROUPS: [self.services_group]})

		self.assertEqual(lines.rule_of(self.shop_till).groups, [self.services_group])
		# The cut is in a sub-group of the chosen group
		self.assertEqual(lines.item_kind(self.cut, self.shop_till), lines.SERVICE)
		# Not in the chosen group: a product, even though it is not kept in stock
		self.assertEqual(lines.item_kind(self.consulting, self.shop_till), lines.PRODUCT)
		self.assertEqual(lines.item_kind(self.shampoo, self.shop_till), lines.PRODUCT)

	def test_no_group_chosen_makes_every_item_a_product(self):
		self.choose(**{MODE: lines.MODE_GROUPS, GROUPS: []})

		self.assertEqual(lines.item_kind(self.cut, self.shop_till), lines.PRODUCT)

	def test_the_groups_are_ignored_while_the_mode_is_another(self):
		self.choose(**{MODE: lines.MODE_GROUPS, GROUPS: [self.services_group]})
		self.choose(**{MODE: lines.MODE_NON_STOCK})

		self.assertEqual(lines.rule_of(self.shop_till).groups, [])
		self.assertEqual(lines.item_kind(self.consulting, self.shop_till), lines.SERVICE)

	# ------------------------------------------------------------------------------------------------ what the till is told
	def test_the_kinds_are_told_as_soon_as_the_till_has_a_rule_of_its_own_and_the_question_comes_trimmed(
		self,
	):
		with a_site_without_a_kind_hook():
			self.assertFalse(lines.the_site_tells_the_kinds(self.shop_till))
		self.choose(**{MODE: lines.MODE_NON_STOCK, QUESTION: "  Mechanic  "})

		self.as_user(TILL_MANAGER)
		answer = lines.item_kinds(self.shop_till, [self.cut, self.shampoo, "_Test LA Nothing"])

		self.assertTrue(answer["told"])
		self.assertEqual(answer["question"], "Mechanic")
		self.assertEqual(
			answer["kinds"], {self.cut: lines.SERVICE, self.shampoo: lines.PRODUCT, "_Test LA Nothing": ""}
		)

	def test_a_till_with_no_question_of_its_own_says_so_with_an_empty_text(self):
		self.as_user(TILL_MANAGER)

		self.assertEqual(lines.item_kinds(self.shop_till, [])["question"], "")

	# ------------------------------------------------------------------------------------------------ the screen
	def test_the_three_settings_are_on_the_sales_persons_group_and_the_groups_wait_for_their_mode(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)
		settings = by_key(answer)

		keys = [setting["key"] for setting in answer["settings"] if setting["group"] == "sales_persons"]
		self.assertEqual(
			keys,
			["enable_sales_persons", "track_product_sales_by_person", MODE, GROUPS, QUESTION],
		)
		self.assertEqual(
			[option["value"] for option in settings[MODE]["options"]],
			[lines.MODE_SITE, lines.MODE_NON_STOCK, lines.MODE_GROUPS],
		)
		self.assertEqual(
			settings[GROUPS]["depends_on"], [{"key": MODE, "equals": lines.MODE_GROUPS, "off": False}]
		)
		self.assertEqual(settings[GROUPS]["widget"], "multiselect")
		self.assertEqual(answer["values"][MODE], lines.MODE_SITE)
		self.assertEqual(answer["values"][QUESTION] or "", "")
		self.assertIn(self.hair, [choice["value"] for choice in answer["choices"][GROUPS]])

	def test_a_value_the_mode_does_not_offer_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.choose(**{MODE: "Everything"})

	def test_a_restaurant_till_does_not_show_them(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.restaurant_till)

		for key in (MODE, GROUPS, QUESTION):
			with self.subTest(key=key):
				self.assertNotIn(key, by_key(answer))
