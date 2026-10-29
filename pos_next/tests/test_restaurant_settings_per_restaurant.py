# //// Neoffice — added file (no upstream equivalent).
"""Restaurant settings belong to a restaurant, not to the site (NeoRestau lot 1, task 1).

The opening hours, the tips, the QR and takeaway ordering and the reservation rules used to live in one
single, ``Restaurant Settings``. They now live on the ``Restaurant`` doctype, one set per restaurant, and the
single moves into a default restaurant once, by a patch.

The suite relies on neither that patch nor any restaurant: a fresh CI site runs no patch, while the clone of a
working site holds a real restaurant, its hours and its reservations. Every test builds what it needs. The
tests that need an empty site delete the restaurants inside the test transaction, which the end of the class
rolls back: nothing here commits (the jobs that commit are run with the commit switched off).
"""

from datetime import datetime, time
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, getdate, nowdate

from pos_next.api import reservations
from pos_next.api import restaurant as restaurant_api
from pos_next.patches.neorestau.move_restaurant_settings_to_a_restaurant import execute
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant.settings import default_restaurant, get_restaurant_settings

NO_ONE = "_Test Restaurant Nowhere"
A_MONDAY = "2026-10-19"
LUNCH = {"day_of_week": "Monday", "from_time": "09:00:00", "to_time": "14:00:00", "label": "Lunch"}
DINNER = {"day_of_week": "Monday", "from_time": "18:00:00", "to_time": "23:00:00", "label": "Dinner"}

# What the till's screens read of a restaurant's settings (the settings dialog, the restaurant store, the card
# editor, the reservation dialog): the only keys `get_restaurant_settings` may answer with
READ_BY_THE_TILL = {
	"restaurant",
	"opening_hours",
	"is_open",
	"current_slot",
	"enable_runner",
	"enable_takeaway",
	"takeaway_card",
	"enable_tips",
	"auto_detect_tip",
	"tip_item",
	"tip_account",
	"enable_qr_ordering",
	"guest_menu",
	"qr_order_validation",
	"guest_account_mode",
	"token_expiry_mode",
	"token_expiry_days",
	"enable_web_takeaway",
	"takeaway_menu",
	"default_reservation_duration",
	"reservation_channels",
}
# What only the server uses: the call answers any signed-in user, so none of it may leave
ONLY_THE_SERVER_USES = (
	"restaurant_email",
	"restaurant_name",
	"enable_reservations",
	"no_show_delay",
	"reservation_reminder_hours",
	"enable_online_reservations",
	"require_reservation_validation",
)


def today_at(hour, minute=0):
	return datetime.combine(getdate(nowdate()), time(hour, minute))


class RestaurantFixtures:
	"""Restaurants and reservations a test builds for itself, and removes in tearDown."""

	def setUp(self):
		super().setUp()
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		self.company = company[0]
		self.restaurants = []
		self.reservation_names = []
		# Tip provisioning (an item and an account) is the doctype's own test: it is switched off here
		self.tip_provisioning = {}
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			self.tip_provisioning[method] = patcher.start()
			self.addCleanup(patcher.stop)

	def tearDown(self):
		for name in self.reservation_names:
			frappe.delete_doc("Restaurant Reservation", name, force=True, ignore_permissions=True)
		for name in self.restaurants:
			frappe.delete_doc("Restaurant", name, force=True, ignore_permissions=True)
		super().tearDown()

	def make_restaurant(self, name, **values):
		doc = frappe.get_doc({"doctype": "Restaurant", "restaurant_name": name, "company": self.company, **values})
		doc.insert(ignore_permissions=True)
		self.restaurants.append(doc.name)
		return doc.name

	def make_reservation(self, restaurant, email, at="13:00:00", date=None, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Reservation",
				"restaurant": restaurant,
				"status": "Confirmed",
				"reservation_date": date or nowdate(),
				"reservation_time": at,
				"duration": 5400,
				"no_of_guests": 2,
				"guest_name": "_Test Guest",
				"email": email,
				**values,
			}
		)
		doc.insert(ignore_permissions=True)
		self.reservation_names.append(doc.name)
		return doc.name

	def reservation_value(self, name, fieldname):
		return frappe.db.get_value("Restaurant Reservation", name, fieldname)


class TestRestaurantSettingsPerRestaurant(RestaurantFixtures, FrappeTestCase):
	def test_each_restaurant_reads_its_own_settings(self):
		a = self.make_restaurant("_Test Restaurant A", enable_tips=1)
		b = self.make_restaurant("_Test Restaurant B", enable_tips=0)
		self.assertEqual(get_restaurant_settings(a).enable_tips, 1)
		self.assertEqual(get_restaurant_settings(b).enable_tips, 0)

	def test_a_restaurant_carries_its_name_and_its_opening_hours(self):
		a = self.make_restaurant("_Test Restaurant A", opening_hours=[LUNCH])
		b = self.make_restaurant("_Test Restaurant B")
		settings = get_restaurant_settings(a)
		self.assertEqual(settings.name, a)
		self.assertEqual([(row.day_of_week, row.label) for row in settings.opening_hours], [("Monday", "Lunch")])
		self.assertFalse(get_restaurant_settings(b).opening_hours)

	def test_a_restaurant_that_does_not_exist_reads_as_empty_settings(self):
		self.assertEqual(get_restaurant_settings(NO_ONE), {})

	def test_no_restaurant_named_reads_the_default_one(self):
		self.make_restaurant("_Test Restaurant A")
		self.assertEqual(get_restaurant_settings().get("name"), default_restaurant())

	def test_the_api_answers_with_the_settings_of_the_restaurant_asked_for(self):
		a = self.make_restaurant(
			"_Test Restaurant A",
			enable_tips=1,
			enable_runner=0,
			reservation_channels="Phone\nWalk-in",
			opening_hours=[LUNCH],
		)
		b = self.make_restaurant("_Test Restaurant B", enable_tips=0)
		answer = restaurant_api.get_restaurant_settings(a)
		self.assertEqual(answer["restaurant"], a)
		self.assertTrue(answer["enable_tips"])
		self.assertFalse(answer["enable_runner"])
		self.assertEqual(answer["reservation_channels"], "Phone\nWalk-in")
		self.assertEqual(
			answer["opening_hours"],
			[
				{
					"day_of_week": "Monday",
					"from_time": "09:00",
					"to_time": "14:00",
					"label": "Lunch",
					"restaurant_card": None,
				}
			],
		)
		self.assertFalse(restaurant_api.get_restaurant_settings(b)["enable_tips"])

	def test_the_api_answers_with_what_the_till_reads_and_nothing_else(self):
		a = self.make_restaurant(
			"_Test Restaurant A",
			enable_reservations=1,
			enable_online_reservations=1,
			require_reservation_validation=1,
			no_show_delay=45,
			reservation_reminder_hours=2,
			restaurant_email="test-restaurant-a@yopmail.com",
			default_reservation_duration=3600,
			reservation_channels="Phone\nWalk-in",
		)
		answer = restaurant_api.get_restaurant_settings(a)
		# The call is open to any signed-in user: the e-mail and the reservation rules the server alone uses stay out
		for field in ONLY_THE_SERVER_USES:
			self.assertNotIn(field, answer)
		self.assertNotIn("test-restaurant-a@yopmail.com", str(answer))
		self.assertEqual(set(answer), READ_BY_THE_TILL)
		# What the reservation dialog reads is there
		self.assertEqual(answer["default_reservation_duration"], 3600)
		self.assertEqual(answer["reservation_channels"], "Phone\nWalk-in")

	def test_saving_settings_writes_the_restaurant_named_and_no_other(self):
		a = self.make_restaurant("_Test Restaurant A")
		b = self.make_restaurant("_Test Restaurant B")
		restaurant_api.save_restaurant_settings(
			{
				"enable_qr_ordering": 1,
				"token_expiry_mode": "Timed",
				"opening_hours": [{"day_of_week": "Friday", "from_time": "18:00", "to_time": "23:00", "label": "Dinner"}],
			},
			restaurant=a,
		)
		saved = frappe.get_doc("Restaurant", a)
		self.assertEqual((saved.enable_qr_ordering, saved.token_expiry_mode), (1, "Timed"))
		self.assertEqual([row.day_of_week for row in saved.opening_hours], ["Friday"])
		untouched = frappe.get_doc("Restaurant", b)
		self.assertEqual(untouched.enable_qr_ordering, 0)
		self.assertFalse(untouched.opening_hours)

	def test_saving_the_opening_hours_alone_keeps_the_other_settings(self):
		a = self.make_restaurant("_Test Restaurant A", enable_qr_ordering=1)
		restaurant_api.save_restaurant_settings({"opening_hours": []}, restaurant=a)
		self.assertEqual(frappe.db.get_value("Restaurant", a, "enable_qr_ordering"), 1)

	def test_saving_a_setting_the_restaurant_does_not_have_is_refused(self):
		a = self.make_restaurant("_Test Restaurant A")
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.save_restaurant_settings({"company": "Somewhere Else"}, restaurant=a)

	def test_saving_the_tip_settings_writes_the_restaurant_named(self):
		a = self.make_restaurant("_Test Restaurant A", enable_tips=0)
		b = self.make_restaurant("_Test Restaurant B", enable_tips=0)
		answer = restaurant_api.save_tip_settings({"enable_tips": 1, "auto_detect_tip": 0}, restaurant=a)
		self.assertEqual(answer["status"], "success")
		self.assertEqual(frappe.db.get_value("Restaurant", a, ["enable_tips", "auto_detect_tip"]), (1, 0))
		self.assertEqual(frappe.db.get_value("Restaurant", b, "enable_tips"), 0)

	def test_the_open_status_follows_the_hours_of_the_restaurant(self):
		a = self.make_restaurant(
			"_Test Restaurant A",
			opening_hours=[{"day_of_week": "Monday", "from_time": "09:00:00", "to_time": "10:00:00", "label": "Breakfast"}],
		)
		b = self.make_restaurant("_Test Restaurant B")
		with (
			patch.object(frappe.utils, "nowdate", return_value=A_MONDAY),
			patch.object(frappe.utils, "nowtime", return_value="20:00:00"),
		):
			self.assertFalse(restaurant_api.get_restaurant_status(a)["is_open"])
			# A restaurant without hours is open at every hour
			self.assertTrue(restaurant_api.get_restaurant_status(b)["is_open"])

	def test_reminders_skip_a_restaurant_whose_reservations_are_off(self):
		a = self.make_restaurant("_Test Restaurant A", enable_reservations=1, reservation_reminder_hours=3)
		b = self.make_restaurant("_Test Restaurant B", enable_reservations=0, reservation_reminder_hours=3)
		self.res_a = self.make_reservation(a, "test-reservation-a@yopmail.com")
		self.res_b = self.make_reservation(b, "test-reservation-b@yopmail.com")
		with (
			patch.object(reservations, "now_datetime", return_value=today_at(12)),
			patch.object(reservations, "_send_reminder_email") as send,
			patch.object(frappe.db, "commit"),
		):
			reservations.send_reminders()
		self.assertTrue(frappe.db.get_value("Restaurant Reservation", self.res_a, "reminder_sent"))
		self.assertFalse(frappe.db.get_value("Restaurant Reservation", self.res_b, "reminder_sent"))
		# The clone of a working site holds reservations of its own: only the two of this test are counted
		mailed = [call.args[0].name for call in send.call_args_list]
		self.assertEqual([name for name in mailed if name in (self.res_a, self.res_b)], [self.res_a])

	def test_a_restaurant_sets_its_own_reminder_window(self):
		a = self.make_restaurant("_Test Restaurant A", enable_reservations=1, reservation_reminder_hours=3)
		b = self.make_restaurant("_Test Restaurant B", enable_reservations=1, reservation_reminder_hours=1)
		res_a = self.make_reservation(a, "test-reservation-a@yopmail.com")
		res_b = self.make_reservation(b, "test-reservation-b@yopmail.com")
		# Both reservations are at 13:00 and it is 11:30: A's three hours reach them, B's one hour does not
		with (
			patch.object(reservations, "now_datetime", return_value=today_at(11, 30)),
			patch.object(reservations, "_send_reminder_email"),
			patch.object(frappe.db, "commit"),
		):
			reservations.send_reminders()
		self.assertTrue(self.reservation_value(res_a, "reminder_sent"))
		self.assertFalse(self.reservation_value(res_b, "reminder_sent"))

	def test_the_no_show_job_skips_a_restaurant_whose_reservations_are_off(self):
		a = self.make_restaurant("_Test Restaurant A", enable_reservations=1, no_show_delay=60)
		b = self.make_restaurant("_Test Restaurant B", enable_reservations=0, no_show_delay=60)
		res_a = self.make_reservation(a, "test-reservation-a@yopmail.com", at="08:00:00")
		res_b = self.make_reservation(b, "test-reservation-b@yopmail.com", at="08:00:00")
		with patch.object(reservations, "now_datetime", return_value=today_at(12)), patch.object(frappe.db, "commit"):
			reservations.auto_no_show()
		self.assertEqual(self.reservation_value(res_a, "status"), "No Show")
		self.assertEqual(self.reservation_value(res_b, "status"), "Confirmed")

	def test_a_reservation_is_mailed_to_the_address_of_its_own_restaurant(self):
		self.make_restaurant("_Test Restaurant A", restaurant_email="test-restaurant-a@yopmail.com")
		b = self.make_restaurant("_Test Restaurant B", restaurant_email="test-restaurant-b@yopmail.com")
		res_b = self.make_reservation(b, "test-reservation-b@yopmail.com")
		with patch.object(frappe, "sendmail") as sendmail:
			reservations._send_confirmation_email(frappe.get_doc("Restaurant Reservation", res_b))
		recipients = [call.kwargs["recipients"] for call in sendmail.call_args_list]
		self.assertIn(["test-restaurant-b@yopmail.com"], recipients)
		self.assertNotIn(["test-restaurant-a@yopmail.com"], recipients)

	def test_a_reservation_is_checked_against_the_hours_of_its_own_restaurant(self):
		tomorrow = add_days(nowdate(), 1)
		a = self.make_restaurant(
			"_Test Restaurant A",
			opening_hours=[
				{
					"day_of_week": getdate(tomorrow).strftime("%A"),
					"from_time": "09:00:00",
					"to_time": "10:00:00",
					"label": "Breakfast",
				}
			],
		)
		b = self.make_restaurant("_Test Restaurant B")
		# Eight in the evening is outside A's hours; B sets none, so it takes a booking at any time
		self.make_reservation(b, "test-reservation-b@yopmail.com", at="20:00:00", date=tomorrow)
		with self.assertRaises(frappe.ValidationError):
			self.make_reservation(a, "test-reservation-a@yopmail.com", at="20:00:00", date=tomorrow)


class TestTheSingleMovesIntoARestaurant(RestaurantFixtures, FrappeTestCase):
	"""The patch, and the default restaurant, on a site that has no restaurant yet."""

	def setUp(self):
		super().setUp()
		# The clone of a working site already holds the restaurant its own migration made: start from none
		for name in frappe.get_all("Restaurant", pluck="name"):
			frappe.delete_doc("Restaurant", name, force=True, ignore_permissions=True)
		single = frappe.get_single("Restaurant Settings")
		single.flags.ignore_validate = True
		single.enable_tips = 1
		single.set("opening_hours", [])
		single.append("opening_hours", LUNCH)
		single.append("opening_hours", DINNER)
		single.save(ignore_permissions=True)
		self.before = frappe.db.count("Restaurant")

	def with_default_company(self, company):
		original = frappe.db.get_single_value

		def get_single_value(doctype, fieldname, *args, **kwargs):
			if (doctype, fieldname) == ("Global Defaults", "default_company"):
				return company
			return original(doctype, fieldname, *args, **kwargs)

		return patch.object(frappe.db, "get_single_value", side_effect=get_single_value)

	def test_the_single_settings_move_into_one_default_restaurant(self):
		execute()
		name = default_restaurant()
		doc = frappe.get_doc("Restaurant", name)
		self.assertEqual(doc.enable_tips, 1)
		self.assertEqual(len(doc.opening_hours), 2)
		self.assertEqual({r.parenttype for r in doc.opening_hours}, {"Restaurant"})

	def test_the_default_restaurant_is_named_after_the_default_company(self):
		with self.with_default_company(self.company):
			execute()
		doc = frappe.get_doc("Restaurant", default_restaurant())
		self.assertEqual((doc.restaurant_name, doc.company), (self.company, self.company))

	def test_without_a_default_company_a_company_of_the_site_stands_in(self):
		with self.with_default_company(None):
			execute()
		doc = frappe.get_doc("Restaurant", default_restaurant())
		self.assertTrue(frappe.db.exists("Company", doc.company))

	def test_the_opening_hours_keep_their_content_when_they_move(self):
		execute()
		doc = frappe.get_doc("Restaurant", default_restaurant())
		self.assertEqual(
			[(r.day_of_week, str(r.from_time), str(r.to_time), r.label) for r in doc.opening_hours],
			[("Monday", "9:00:00", "14:00:00", "Lunch"), ("Monday", "18:00:00", "23:00:00", "Dinner")],
		)
		self.assertFalse(frappe.db.count("Restaurant Opening Hours", {"parent": "Restaurant Settings"}))

	def test_the_patch_copies_the_single_and_provisions_no_tip_item_or_account(self):
		execute()
		for provisioning in self.tip_provisioning.values():
			provisioning.assert_not_called()

	def test_a_link_whose_target_is_gone_is_left_out_instead_of_stopping_the_migration(self):
		# Written straight into the single, as a force delete or a restore leaves it: the single itself no
		# longer saves with it, so the next test must not find it there
		self.addCleanup(frappe.db.set_single_value, "Restaurant Settings", "guest_menu", None)
		frappe.db.set_single_value("Restaurant Settings", "guest_menu", "_Test Card That Is Gone")
		execute()
		doc = frappe.get_doc("Restaurant", default_restaurant())
		self.assertFalse(doc.guest_menu)
		self.assertEqual(doc.enable_tips, 1)

	def test_the_patch_runs_twice_without_a_second_restaurant(self):
		execute()
		execute()
		self.assertEqual(frappe.db.count("Restaurant"), self.before + 1)

	def test_a_site_that_never_used_the_module_gets_no_restaurant(self):
		frappe.db.delete("Singles", {"doctype": "Restaurant Settings"})
		frappe.db.delete("Restaurant Opening Hours", {"parent": "Restaurant Settings"})
		for doctype in ("Restaurant Area", "Restaurant Card", "Preparation Station"):
			frappe.db.delete(doctype)
		execute()
		self.assertEqual(frappe.db.count("Restaurant"), self.before)

	def test_the_default_restaurant_is_the_only_one_or_the_oldest_enabled_one(self):
		self.assertIsNone(default_restaurant())
		a = self.make_restaurant("_Test Restaurant A", enabled=0)
		self.assertEqual(default_restaurant(), a)
		b = self.make_restaurant("_Test Restaurant B")
		self.assertEqual(default_restaurant(), b)
		self.make_restaurant("_Test Restaurant C")
		self.assertEqual(default_restaurant(), b)

	def test_without_a_restaurant_the_settings_read_empty_and_the_feature_stays_off(self):
		self.assertEqual(get_restaurant_settings(), {})
		self.assertEqual(
			restaurant_api.get_restaurant_settings(), {"opening_hours": [], "is_open": True, "current_slot": None}
		)
		self.assertTrue(restaurant_api.get_restaurant_status()["is_open"])

	def test_saving_settings_on_a_site_without_a_restaurant_creates_the_default_one(self):
		restaurant_api.save_restaurant_settings({"enable_runner": 0})
		doc = frappe.get_doc("Restaurant", default_restaurant())
		self.assertEqual(doc.enable_runner, 0)
		self.assertEqual(frappe.db.count("Restaurant"), self.before + 1)
