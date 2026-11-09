# //// Neoffice — added file (no upstream equivalent).
"""« Follow the sales of products by person too » is a setting of the till's settings screen (NeoSalon, step 1, lot G1.1; product owner, 09.11.2026).

The group of the sales persons is the question the salon's cashier reads (« Who did the work? », canvas « Caisse 3 »): a choice of three
(off, one person per sale, several people) and, under it, a tick that makes the products ask for their person too. The screen is drawn from
the registry, so the suite pins what the registry says and what the server does with it:

- where it is: the same group as the choice, drawn under it, a tick that is off by default, on a shop till only;
- that a till manager sets it and the till reads it where it reads it (`sales_person_lines.products_are_tracked`);
- that a cashier of the till and a portal account cannot set it, and that a restaurant till does not show it;
- that the group carries the question, and the choice its three values with the words of the canvas.
"""

import frappe

from pos_next.sales_person_lines import products_are_tracked
from pos_next.tests.test_till_settings import PORTAL, TILL, TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "track_product_sales_by_person"
CHOICE = "enable_sales_persons"


class TestTheProductsByPersonSettingIsOnTheSettingsScreen(TillSettingsCase):
	def test_it_is_a_tick_under_the_choice_in_the_same_group_of_a_shop_till(self):
		self.assertNotIn(KEY, registry.NOT_LISTED[registry.POS_SETTINGS])
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)

		settings = by_key(answer)
		self.assertEqual(
			(settings[KEY]["tab"], settings[KEY]["group"], settings[KEY]["widget"]),
			("sales", "sales_persons", "check"),
		)
		self.assertEqual(settings[KEY]["group"], settings[CHOICE]["group"])
		self.assertTrue(settings[KEY]["editable"])
		keys = [setting["key"] for setting in answer["settings"] if setting["group"] == "sales_persons"]
		self.assertEqual(keys, [CHOICE, KEY])
		self.assertEqual(answer["values"][KEY], 0)

	def test_it_comes_with_its_help_and_label(self):
		self.as_user(TILL_MANAGER)

		setting = by_key(get_till_settings(self.shop_till))[KEY]

		self.assertTrue(setting["label"].strip())
		self.assertTrue(setting["help"].strip())

	def test_a_restaurant_till_does_not_show_it(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.restaurant_till)

		self.assertNotIn(KEY, by_key(answer))
		self.assertNotIn(KEY, answer["values"])

	def test_the_group_carries_the_question_and_the_choice_the_words_of_the_canvas(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)

		group = {group["key"]: group for group in answer["groups"]}["sales_persons"]
		self.assertEqual(str(group["label"]), "Who did the work?")
		options = {option["value"]: option["label"] for option in by_key(answer)[CHOICE]["options"]}
		self.assertEqual(options["Single"], "One person per sale")
		self.assertEqual(list(options), ["Disabled", "Single", "Multiple"])

	def test_a_till_manager_sets_it_and_the_till_reads_it(self):
		self.as_user(TILL_MANAGER)
		self.assertFalse(products_are_tracked(self.shop_till))

		answer = save_till_settings(self.shop_till, {KEY: 1})

		self.assertEqual(answer["values"][KEY], 1)
		self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], 1)
		self.assertTrue(products_are_tracked(self.shop_till))

		save_till_settings(self.shop_till, {KEY: 0})
		self.assertFalse(products_are_tracked(self.shop_till))

	def test_it_is_set_for_one_till_and_not_the_others(self):
		self.as_user(TILL_MANAGER)

		save_till_settings(self.shop_till, {KEY: 1})

		self.assertFalse(products_are_tracked(self.restaurant_till))

	def test_a_cashier_of_the_till_and_a_portal_account_cannot_set_it(self):
		for user in (TILL, PORTAL):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					save_till_settings(self.shop_till, {KEY: 1})
				frappe.set_user("Administrator")
				self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], 0)
