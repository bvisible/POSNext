# //// Neoffice — added file (no upstream equivalent).
"""« Who made the sale » is a setting of the till's settings screen (NeoCoiffeur study, product owner, 09.11.2026).

The option is upstream's (`POS Settings.enable_sales_persons`: Disabled, One person, Several people): the till asks who did the
work and does not close a sale without it. The fork had left it off the screen « until a till's use is decided »; it was tried
on osiris the same day (a sale, a return, a sale shared by two people, offline) and it is now one of the settings a till manager
sets, like the others, with its help behind the lightbulb. The suite pins:

- where it is: the Sales tab of a shop till, in a group of its own, a segmented choice of the three values, and no longer set aside;
- that a restaurant till does not show it (the order of a table carries its waiter);
- that a till manager sets it and the till reads it where it reads the option, and that a value the list does not offer is refused;
- that a cashier of the till and a portal account cannot set it.
"""

import frappe

from pos_next.pos_next.utils.sales_person_commission import sales_persons_enabled
from pos_next.tests.test_till_settings import PORTAL, TILL, TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "enable_sales_persons"


class TestTheSalesPersonSettingIsOnTheSettingsScreen(TillSettingsCase):
	def test_it_is_listed_in_the_sales_tab_of_a_shop_till_and_no_longer_set_aside(self):
		self.assertNotIn(KEY, registry.NOT_LISTED[registry.POS_SETTINGS])
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)

		setting = by_key(answer)[KEY]
		self.assertEqual(
			(setting["tab"], setting["group"], setting["widget"]), ("sales", "sales_persons", "segmented")
		)
		self.assertEqual(
			[option["value"] for option in setting["options"]], ["Disabled", "Single", "Multiple"]
		)
		self.assertTrue(setting["editable"])
		self.assertEqual(answer["values"][KEY], "Disabled")
		self.assertIn("sales_persons", [group["key"] for group in answer["groups"]])

	def test_it_comes_with_its_help_and_labels(self):
		self.as_user(TILL_MANAGER)

		setting = by_key(get_till_settings(self.shop_till))[KEY]

		self.assertTrue(setting["label"].strip())
		self.assertTrue(setting["help"].strip())
		self.assertTrue(all(option["label"].strip() for option in setting["options"]))

	def test_a_restaurant_till_does_not_show_it(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.restaurant_till)

		self.assertNotIn(KEY, by_key(answer))
		self.assertNotIn(KEY, answer["values"])

	def test_a_till_manager_sets_one_person_or_several_and_the_till_reads_it(self):
		self.as_user(TILL_MANAGER)
		self.assertFalse(sales_persons_enabled(self.shop_till))

		for value in ("Single", "Multiple"):
			with self.subTest(value=value):
				answer = save_till_settings(self.shop_till, {KEY: value})

				self.assertEqual(answer["values"][KEY], value)
				self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], value)
				self.assertTrue(sales_persons_enabled(self.shop_till))

		save_till_settings(self.shop_till, {KEY: "Disabled"})
		self.assertFalse(sales_persons_enabled(self.shop_till))

	def test_a_value_the_list_does_not_offer_is_refused_and_nothing_changes(self):
		self.as_user(TILL_MANAGER)
		save_till_settings(self.shop_till, {KEY: "Single"})

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.shop_till, {KEY: "Everybody"})

		self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], "Single")

	def test_a_cashier_of_the_till_and_a_portal_account_cannot_set_it(self):
		for user in (TILL, PORTAL):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					save_till_settings(self.shop_till, {KEY: "Single"})
				frappe.set_user("Administrator")
				self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], "Disabled")
