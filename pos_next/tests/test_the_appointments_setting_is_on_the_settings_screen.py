# //// Neoffice — added file (no upstream equivalent).
"""« Collect appointments » is a setting of the till's settings screen (NeoSalon, step 2, lot G4; product owner, 10.11.2026).

The screen is drawn from the registry; the suite pins what the registry says and what the server does with it:

- where it is: a group of its own in the Sales tab of a shop till, a tick that is off by default;
- that it is greyed while the site has no reservation app (a hook of `pos_next.api.appointments`), and not greyed where it has one;
- that a restaurant till does not show it;
- that a till manager sets it and the till reads it where it reads it (`appointments_enabled`), and that a cashier and a portal account cannot.
"""

from unittest.mock import patch

import frappe

from pos_next.api import appointments
from pos_next.tests.test_till_settings import PORTAL, TILL, TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "enable_appointments"


def a_site(with_a_reservation_app: bool):
	"""The hooks of a site that has a reservation app (the one of the list), or has none: whatever the site under test declares."""
	real = frappe.get_hooks

	def get_hooks(hook=None, *args, **kwargs):
		if hook == appointments.LIST_HOOK:
			return ["x.y.appointments_of_the_day"] if with_a_reservation_app else []
		return real(hook, *args, **kwargs)

	return patch("frappe.get_hooks", side_effect=get_hooks)


class TestTheAppointmentsSettingIsOnTheSettingsScreen(TillSettingsCase):
	def test_it_is_a_tick_in_a_group_of_its_own_in_the_sales_tab_of_a_shop_till(self):
		self.assertNotIn(KEY, registry.NOT_LISTED[registry.POS_SETTINGS])
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)

		setting = by_key(answer)[KEY]
		self.assertEqual(
			(setting["tab"], setting["group"], setting["widget"]), ("sales", "appointments", "check")
		)
		self.assertTrue(setting["editable"])
		self.assertEqual(answer["values"][KEY], 0)
		self.assertIn("appointments", [group["key"] for group in answer["groups"]])
		self.assertTrue(setting["label"].strip() and setting["help"].strip())

	def test_it_is_greyed_while_the_site_has_no_reservation_app(self):
		self.as_user(TILL_MANAGER)

		with a_site(False):
			self.assertTrue(by_key(get_till_settings(self.shop_till))[KEY]["greyed"])

	def test_it_is_not_greyed_where_the_site_has_one(self):
		self.as_user(TILL_MANAGER)

		with a_site(True):
			self.assertFalse(by_key(get_till_settings(self.shop_till))[KEY]["greyed"])

	def test_a_restaurant_till_does_not_show_it(self):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.restaurant_till)

		self.assertNotIn(KEY, by_key(answer))
		self.assertNotIn(KEY, answer["values"])

	def test_a_till_manager_sets_it_and_the_till_reads_it(self):
		self.as_user(TILL_MANAGER)
		self.assertFalse(appointments.appointments_enabled(self.shop_till))

		answer = save_till_settings(self.shop_till, {KEY: 1})

		self.assertEqual(answer["values"][KEY], 1)
		self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], 1)
		self.assertTrue(appointments.appointments_enabled(self.shop_till))
		self.assertFalse(appointments.appointments_enabled(self.restaurant_till))

		save_till_settings(self.shop_till, {KEY: 0})
		self.assertFalse(appointments.appointments_enabled(self.shop_till))

	def test_a_cashier_of_the_till_and_a_portal_account_cannot_set_it(self):
		for user in (TILL, PORTAL):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					save_till_settings(self.shop_till, {KEY: 1})
				frappe.set_user("Administrator")
				self.assertEqual(self.stored_settings(self.shop_till, KEY)[KEY], 0)
