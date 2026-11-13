# //// Neoffice — added file (no upstream equivalent).
"""« Appointments till » is a setting of the till's settings screen (NeoSalon, step 2, lot G4; product owner, 10.11.2026; renamed and made available by what the site
answers, 13.11.2026).

The screen is drawn from the registry; the suite pins what the registry says and what the server does with it:

- where it is: a group of its own in the Sales tab of a shop till, a tick that is off by default;
- that it is greyed, with its reason, unless the site's booking ANSWERS for the till (a hook that says something other than None: a theme declares its hooks
  on every site and answers None where nothing is booked, so a declared hook proves nothing), and not greyed where it answers;
- that a restaurant till does not show it;
- that a till manager sets it and the till reads it where it reads it (`appointments_enabled`), and that a cashier and a portal account cannot;
- « Price collected » (product owner, 13.11.2026): the price an appointment is rung at is the till's choice, the price of the day (decision of 10.11) being
  the proposal and the price announced at booking the other; the till is given it with its other settings, and a value it does not offer is refused.
"""

from unittest.mock import patch

import frappe

from pos_next.api import appointments
from pos_next.tests.test_till_settings import PORTAL, TILL, TILL_MANAGER, TillSettingsCase, by_key
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

KEY = "enable_appointments"
PRICE = "appointment_price"
DAY_PRICE = "Price of the day"
ANNOUNCED_PRICE = "Price announced at booking"


ME = "pos_next.tests.test_the_appointments_setting_is_on_the_settings_screen"


def a_day(pos_profile, date=None):
	return {"day": date, "visibility": "all", "people": [], "unassigned": []}


def no_day(pos_profile, date=None):
	return None


def a_day_that_breaks(pos_profile, date=None):
	raise RuntimeError("the booking is broken")


def a_site(day=None):
	"""The hooks of a site: none at all (`day=None`), or a day view that answers (`a_day`), says nothing (`no_day`) or breaks: whatever the site under test
	declares, the work site's own lanes included."""
	real = frappe.get_hooks
	empty = set(appointments.LEGACY_HOOKS.values()) | {appointments.LIST_HOOK}

	def get_hooks(hook=None, *args, **kwargs):
		if hook == appointments.DAY_HOOK:
			return [f"{ME}.{day}"] if day else []
		if hook in empty:
			return []
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
		# The label says what the till does, not the trade it was made for
		self.assertNotIn("salon", f"{setting['label']} {setting['help']}".lower())

	def test_it_is_greyed_with_its_reason_while_the_site_declares_no_booking(self):
		self.as_user(TILL_MANAGER)

		with a_site():
			setting = by_key(get_till_settings(self.shop_till))[KEY]

		self.assertTrue(setting["greyed"])
		self.assertIn("booking does not answer", setting["greyed_reason"])

	def test_it_is_greyed_where_the_hook_is_declared_and_says_nothing(self):
		# The theme declares its hooks on every site and answers None where nothing is booked: the presence of a hook is no answer
		self.as_user(TILL_MANAGER)

		with a_site("no_day"):
			setting = by_key(get_till_settings(self.shop_till))[KEY]

		self.assertTrue(setting["greyed"])
		self.assertTrue(setting["greyed_reason"])

	def test_it_is_greyed_where_the_booking_breaks(self):
		self.as_user(TILL_MANAGER)

		with a_site("a_day_that_breaks"), patch("frappe.log_error"):
			self.assertTrue(by_key(get_till_settings(self.shop_till))[KEY]["greyed"])

	def test_it_is_not_greyed_where_the_booking_answers_and_has_no_reason(self):
		self.as_user(TILL_MANAGER)

		with a_site("a_day"):
			setting = by_key(get_till_settings(self.shop_till))[KEY]

		self.assertFalse(setting["greyed"])
		self.assertFalse(setting.get("greyed_reason"))

	def test_the_question_is_put_about_the_site_so_that_no_account_is_told_no_for_want_of_a_right(self):
		self.as_user(TILL_MANAGER)
		asked_by = []

		original = a_day

		def a_day_that_notes_its_user(pos_profile, date=None):
			asked_by.append(frappe.session.user)
			return original(pos_profile, date)

		with a_site("a_day"), patch(f"{ME}.a_day", a_day_that_notes_its_user):
			self.assertTrue(appointments.site_takes_appointments(self.shop_till))

		self.assertEqual(asked_by, ["Administrator"])
		self.assertEqual(frappe.session.user, TILL_MANAGER)

	def test_the_old_name_of_the_day_hook_is_still_read(self):
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			if hook == appointments.DAY_HOOK:
				return []
			if hook == "pos_next_salon_day":
				return [f"{ME}.a_day"]
			return real(hook, *args, **kwargs)

		with patch("frappe.get_hooks", side_effect=get_hooks):
			self.assertTrue(appointments.site_takes_appointments(self.shop_till))

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

	# ------------------------------------------------------------------------------------------------ the price collected
	def test_the_price_collected_is_a_choice_of_two_that_waits_for_the_appointments_and_proposes_the_day(
		self,
	):
		self.as_user(TILL_MANAGER)

		answer = get_till_settings(self.shop_till)

		setting = by_key(answer)[PRICE]
		self.assertEqual(
			(setting["tab"], setting["group"], setting["widget"]), ("sales", "appointments", "segmented")
		)
		self.assertEqual([option["value"] for option in setting["options"]], [DAY_PRICE, ANNOUNCED_PRICE])
		self.assertEqual(setting["depends_on"], [{"key": KEY, "equals": None, "off": False}])
		self.assertEqual(answer["values"][PRICE], DAY_PRICE)
		self.assertNotIn("salon", f"{setting['label']} {setting['help']}".lower())

	def test_a_till_manager_chooses_the_price_announced_at_booking_and_the_till_is_given_it(self):
		self.as_user(TILL_MANAGER)

		save_till_settings(self.shop_till, {KEY: 1, PRICE: ANNOUNCED_PRICE})

		self.assertEqual(self.stored_settings(self.shop_till, PRICE)[PRICE], ANNOUNCED_PRICE)
		# The till reads its settings from the list the front is given, with the day's price as its default
		from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS

		self.assertIn(PRICE, POS_SETTINGS_FIELDS)
		self.assertEqual(DEFAULT_POS_SETTINGS[PRICE], DAY_PRICE)

	def test_a_value_the_price_collected_does_not_offer_is_refused(self):
		self.as_user(TILL_MANAGER)

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.shop_till, {KEY: 1, PRICE: "Half price"})

	def test_a_restaurant_till_does_not_show_the_price_collected(self):
		self.as_user(TILL_MANAGER)

		self.assertNotIn(PRICE, by_key(get_till_settings(self.restaurant_till)))
