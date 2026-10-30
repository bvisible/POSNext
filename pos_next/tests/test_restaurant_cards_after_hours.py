# //// Neoffice — added file (no upstream equivalent).
"""After the last service its card stays on the till, and any other card can be fetched (NeoRestau lot 1, task 25).

The restaurant's opening hours assign cards to service slots. Until now a card the hours name was shown during its
slots only, so after the last slot of the day (a Friday 09:00 to 23:00 lunch, say) every scheduled card was hidden
and a till rung at 23:12 held nothing but the permanent card. The product owner decided (30.10.2026): the card of the
last service stays until the next service begins, and any other card can be fetched from a « ⋯ ».

The suite relies on neither the patches nor any restaurant of the clone: it builds two restaurants of its own with
their cards and slots, sets the clock with the `frappe.utils` patches the other restaurant tests use, and rolls
everything back.
"""

import json
from contextlib import contextmanager
from itertools import count
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import authorization
from pos_next.api import restaurant as restaurant_api
from pos_next.authorization import pin as pin_store
from pos_next.authorization.tests.helpers import GOOD_PIN, MANAGER, ROLE, make_role, make_user
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _item, _user
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants, a_request_from

# The action the till asks a manager's PIN for, written as the product owner named it
ACTION = "Open a card outside its hours"

THURSDAY, FRIDAY, SATURDAY, SUNDAY = "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"

LUNCH = "_Test Card Lunch"
SATURDAY_CARD = "_Test Card Saturday"
SUNDAY_CARD = "_Test Card Sunday"
ALWAYS = "_Test Card Always"
PERMANENT = "_Test Card Permanent"
INACTIVE = "_Test Card Inactive"
NOT_YET = "_Test Card Not Yet"
EXPIRED = "_Test Card Expired"
OF_B = "_Test Card Of Restaurant B"
ALSO_OF_B = "_Test Card Also Of Restaurant B"

CASHIER_OF_A = "cards-after-hours-cashier-a@yopmail.com"
CASHIER_OF_B = "cards-after-hours-cashier-b@yopmail.com"
PORTAL = "cards-after-hours-portal@yopmail.com"
TILL_A = "_Test Till Cards A"

_ip = count(1)


@contextmanager
def at(date, time):
	"""The clock the opening hours are read against: a day and a time of day."""
	with (
		patch.object(frappe.utils, "nowdate", return_value=date),
		patch.object(frappe.utils, "nowtime", return_value=time),
	):
		yield


@contextmanager
def as_user(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


class TheHours(TwoRestaurants):
	"""Restaurant A serves a card per day (Friday's lunch, Saturday's and Sunday's services, each 09:00 to 23:00), and
	keeps three more cards the hours name on days of the week the tests do not look at: an inactive one, one that is not
	yet available and one that no longer is. Beside them a permanent card the hours cannot hide, and a card they name
	nowhere, always shown. Restaurant B has two cards and two slots of its own."""

	def setUp(self):
		super().setUp()
		self.lunch = self.make_card(self.a, LUNCH, description="Friday lunch")
		self.saturday = self.make_card(
			self.a,
			SATURDAY_CARD,
			items=[
				{"item_type": "Category", "label": "Starters"},
				{"item_type": "Item", "item": _item(self.company), "price": 7},
			],
		)
		self.sunday = self.make_card(self.a, SUNDAY_CARD)
		self.always = self.make_card(self.a, ALWAYS)
		self.permanent = self.make_card(self.a, PERMANENT, is_permanent=1)
		self.inactive = self.make_card(self.a, INACTIVE, is_active=0)
		self.not_yet = self.make_card(self.a, NOT_YET, available_from="2026-12-31")
		self.expired = self.make_card(self.a, EXPIRED, available_to="2026-01-31")
		self.of_b = self.make_card(self.b, OF_B)
		self.also_of_b = self.make_card(self.b, ALSO_OF_B)
		self.set_hours(
			self.a,
			("Friday", "09:00:00", "23:00:00", "Lunch", self.lunch),
			("Saturday", "09:00:00", "23:00:00", "Saturday service", self.saturday),
			("Sunday", "09:00:00", "23:00:00", "Sunday service", self.sunday),
			("Monday", "09:00:00", "10:00:00", "Monday", self.inactive),
			("Tuesday", "09:00:00", "10:00:00", "Tuesday", self.not_yet),
			("Wednesday", "09:00:00", "10:00:00", "Wednesday", self.expired),
		)
		self.set_hours(
			self.b,
			("Friday", "09:00:00", "23:00:00", "Lunch of B", self.of_b),
			("Saturday", "09:00:00", "23:00:00", "Saturday of B", self.also_of_b),
		)

	def set_hours(self, restaurant, *slots):
		"""The opening hours of a restaurant: (day, from, to, label, card) per slot."""
		doc = frappe.get_doc("Restaurant", restaurant)
		doc.set("opening_hours", [])
		for day, start, end, label, card in slots:
			doc.append(
				"opening_hours",
				{
					"day_of_week": day,
					"from_time": start,
					"to_time": end,
					"label": label,
					"restaurant_card": card,
				},
			)
		doc.save(ignore_permissions=True)

	def cashier(self, email, restaurant):
		"""A cashier whom a user permission keeps to one restaurant."""
		_user(email, [CASHIER_ROLE], "System User")
		frappe.get_doc(
			{"doctype": "User Permission", "user": email, "allow": "Restaurant", "for_value": restaurant}
		).insert(ignore_permissions=True)
		frappe.clear_cache(user=email)
		return email

	def shown(self, date, time, restaurant=None):
		with at(date, time):
			return [card["name"] for card in restaurant_api.get_active_cards(restaurant or self.a)]

	def other(self, date, time, restaurant=None):
		with at(date, time):
			return [card["name"] for card in restaurant_api.get_other_cards(restaurant or self.a)]

	def service(self, date, time, restaurant=None):
		with at(date, time):
			return restaurant_api.get_restaurant_status(restaurant or self.a)["service"]


class TestTheLastServicesCardStays(TheHours, FrappeTestCase):
	def test_a_card_shows_during_its_slot_and_stays_after_it(self):
		for time in ("09:00:00", "12:30:00", "22:59:00", "23:12:00", "23:59:59"):
			with self.subTest(time=time):
				self.assertIn(self.lunch, self.shown(FRIDAY, time))
		# The cards of the other days' services were never there on a Friday
		for time in ("22:59:00", "23:12:00"):
			self.assertNotIn(self.saturday, self.shown(FRIDAY, time))

	def test_it_stays_through_the_night_until_the_next_service_begins(self):
		for time in ("00:00:00", "03:00:00", "08:00:00", "08:59:59"):
			with self.subTest(time=time):
				shown = self.shown(SATURDAY, time)
				self.assertIn(self.lunch, shown)
				self.assertNotIn(self.saturday, shown)
		# The service begins: its card replaces the last service's
		for time in ("09:00:00", "09:30:00", "23:30:00"):
			with self.subTest(time=time):
				shown = self.shown(SATURDAY, time)
				self.assertIn(self.saturday, shown)
				self.assertNotIn(self.lunch, shown)

	def test_between_two_services_of_a_day_the_first_card_stays(self):
		midday, evening = self.lunch, self.saturday
		self.set_hours(
			self.a,
			("Friday", "11:00:00", "14:00:00", "Midday", midday),
			("Friday", "18:00:00", "23:00:00", "Evening", evening),
		)
		for time in ("11:00:00", "13:59:00", "14:00:01", "15:30:00", "17:59:59"):
			with self.subTest(time=time):
				shown = self.shown(FRIDAY, time)
				self.assertIn(midday, shown)
				self.assertNotIn(evening, shown)
		for time in ("18:00:00", "22:00:00", "23:12:00"):
			with self.subTest(time=time):
				shown = self.shown(FRIDAY, time)
				self.assertIn(evening, shown)
				self.assertNotIn(midday, shown)

	def test_the_cards_of_every_slot_that_matches_now_show_together(self):
		first, second = self.lunch, self.saturday
		self.set_hours(
			self.a,
			("Friday", "12:00:00", "14:00:00", "Midday", first),
			("Friday", "13:00:00", "15:00:00", "Brunch", second),
		)
		shown = self.shown(FRIDAY, "13:30:00")
		self.assertIn(first, shown)
		self.assertIn(second, shown)
		shown = self.shown(FRIDAY, "14:30:00")
		self.assertNotIn(first, shown)
		self.assertIn(second, shown)
		# After both: the card of the slot that ended last
		shown = self.shown(FRIDAY, "15:30:00")
		self.assertNotIn(first, shown)
		self.assertIn(second, shown)

	def test_a_slot_inside_another_does_not_take_the_card_when_the_outer_one_ends(self):
		# What is on screen in the last minute of the service is what stays: the outer slot ended last
		outer, inner = self.lunch, self.saturday
		self.set_hours(
			self.a,
			("Friday", "09:00:00", "23:00:00", "Open", outer),
			("Friday", "12:00:00", "14:00:00", "Brunch", inner),
		)
		shown = self.shown(FRIDAY, "22:59:00")
		self.assertIn(outer, shown)
		self.assertNotIn(inner, shown)
		shown = self.shown(FRIDAY, "23:30:00")
		self.assertIn(outer, shown)
		self.assertNotIn(inner, shown)

	def test_a_slot_that_spans_midnight_runs_to_the_next_morning_and_its_card_stays_after(self):
		day, night = self.lunch, self.saturday
		self.set_hours(
			self.a,
			("Friday", "09:00:00", "21:00:00", "Day", day),
			("Friday", "22:00:00", "02:00:00", "Night", night),
		)
		# Between the two services the day's card stays, the night begins at 22:00
		shown = self.shown(FRIDAY, "21:30:00")
		self.assertIn(day, shown)
		self.assertNotIn(night, shown)
		for date, time in (
			(FRIDAY, "22:00:00"),
			(FRIDAY, "23:30:00"),
			(SATURDAY, "00:30:00"),
			(SATURDAY, "02:00:00"),
		):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				self.assertIn(night, shown)
				self.assertNotIn(day, shown)
				self.assertFalse(self.service(date, time)["after_hours"])
		# After 02:00 it is over, and its card stays until the next service begins
		for time in ("02:00:01", "03:00:00", "09:00:00", "20:00:00"):
			with self.subTest(time=time):
				shown = self.shown(SATURDAY, time)
				self.assertIn(night, shown)
				self.assertNotIn(day, shown)
				self.assertTrue(self.service(SATURDAY, time)["after_hours"])

	def test_a_weekly_slot_is_found_a_week_later(self):
		# Only a Friday slot: the next Friday morning, a full week after, the last service is still last Friday's
		self.set_hours(self.a, ("Friday", "09:00:00", "23:00:00", "Lunch", self.lunch))
		for date, time in (
			(SATURDAY, "08:00:00"),
			("2026-10-26", "12:00:00"),
			("2026-10-29", "23:59:00"),
			("2026-10-30", "08:00:00"),
		):
			with self.subTest(date=date, time=time):
				self.assertIn(self.lunch, self.shown(date, time))

	def test_a_card_the_hours_name_nowhere_shows_at_every_hour(self):
		for date, time in (
			(FRIDAY, "10:00:00"),
			(FRIDAY, "23:12:00"),
			(SATURDAY, "08:00:00"),
			(SATURDAY, "09:30:00"),
		):
			with self.subTest(date=date, time=time):
				self.assertIn(self.always, self.shown(date, time))

	def test_hours_that_assign_no_card_filter_nothing(self):
		self.set_hours(self.a, ("Friday", "09:00:00", "23:00:00", "Lunch", None))
		for date, time in ((FRIDAY, "10:00:00"), (FRIDAY, "23:12:00"), (SATURDAY, "08:00:00")):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				for card in (self.lunch, self.saturday, self.sunday, self.always):
					self.assertIn(card, shown)
				self.assertEqual(self.service(date, time), {"key": None, "after_hours": False, "label": None})
				self.assertEqual(self.other(date, time), [])

	def test_a_restaurant_without_hours_filters_nothing(self):
		self.set_hours(self.a)
		shown = self.shown(FRIDAY, "23:12:00")
		for card in (self.lunch, self.saturday, self.sunday, self.always):
			self.assertIn(card, shown)
		self.assertEqual(self.service(FRIDAY, "23:12:00"), {"key": None, "after_hours": False, "label": None})
		self.assertEqual(self.other(FRIDAY, "23:12:00"), [])

	def test_the_dates_of_a_card_still_apply_after_hours(self):
		self.set_hours(
			self.a,
			("Friday", "09:00:00", "23:00:00", "Lunch", self.not_yet),
			("Saturday", "09:00:00", "23:00:00", "Saturday service", self.expired),
		)
		frappe.db.set_value("Restaurant Card", self.not_yet, "available_from", SATURDAY)
		frappe.db.set_value("Restaurant Card", self.expired, "available_to", THURSDAY)
		# Not available before its first day, even in the slot that names it
		self.assertNotIn(self.not_yet, self.shown(FRIDAY, "12:00:00"))
		self.assertNotIn(self.not_yet, self.shown(FRIDAY, "23:12:00"))
		# Gone after its last day
		self.assertNotIn(self.expired, self.shown(SATURDAY, "12:00:00"))
		self.assertNotIn(self.expired, self.shown(SATURDAY, "23:12:00"))
		# Inside its dates it shows, after hours as well
		frappe.db.set_value("Restaurant Card", self.not_yet, "available_from", FRIDAY)
		self.assertIn(self.not_yet, self.shown(FRIDAY, "23:12:00"))
		frappe.db.set_value("Restaurant Card", self.expired, "available_to", SATURDAY)
		self.assertIn(self.expired, self.shown(SATURDAY, "12:00:00"))

	def test_the_permanent_card_is_always_shown_and_last(self):
		for date, time in ((FRIDAY, "10:00:00"), (FRIDAY, "23:12:00"), (SATURDAY, "08:00:00")):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				self.assertEqual(shown[-1], self.permanent)
				self.assertEqual(shown.count(self.permanent), 1)

	def test_an_inactive_card_and_another_restaurants_card_are_never_shown(self):
		for date, time in (
			(FRIDAY, "10:00:00"),
			(FRIDAY, "23:12:00"),
			(SATURDAY, "08:00:00"),
			(SUNDAY, "12:00:00"),
		):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				self.assertNotIn(self.inactive, shown)
				self.assertNotIn(self.of_b, shown)

	def test_each_restaurant_follows_its_own_hours(self):
		self.assertEqual(self.shown(FRIDAY, "23:12:00", self.b), [self.of_b])
		self.assertEqual(self.shown(SATURDAY, "09:30:00", self.b), [self.also_of_b])
		self.assertNotIn(self.lunch, self.shown(FRIDAY, "23:12:00", self.b))

	def test_a_slot_that_starts_at_midnight_is_a_slot(self):
		small_hours, morning = self.saturday, self.sunday
		self.set_hours(
			self.a,
			("Saturday", "00:00:00", "03:00:00", "Night", small_hours),
			("Saturday", "09:00:00", "23:00:00", "Saturday service", morning),
		)
		self.assertIn(small_hours, self.shown(SATURDAY, "01:00:00"))
		self.assertFalse(self.service(SATURDAY, "01:00:00")["after_hours"])
		self.assertIn(small_hours, self.shown(SATURDAY, "05:00:00"))
		self.assertTrue(self.service(SATURDAY, "05:00:00")["after_hours"])

	def test_the_status_says_which_service_the_cards_are_of(self):
		self.assertEqual(
			self.service(FRIDAY, "22:59:00"),
			{"key": f"{FRIDAY}T09:00:00", "after_hours": False, "label": None},
		)
		self.assertEqual(
			self.service(FRIDAY, "23:12:00"),
			{"key": f"{FRIDAY}T09:00:00", "after_hours": True, "label": "Lunch"},
		)
		self.assertEqual(
			self.service(SATURDAY, "08:00:00"),
			{"key": f"{FRIDAY}T09:00:00", "after_hours": True, "label": "Lunch"},
		)
		self.assertEqual(
			self.service(SATURDAY, "09:00:00"),
			{"key": f"{SATURDAY}T09:00:00", "after_hours": False, "label": None},
		)

	def test_the_key_of_the_service_changes_when_the_next_one_begins_and_only_then(self):
		before = [
			(FRIDAY, "09:00:00"),
			(FRIDAY, "22:59:00"),
			(FRIDAY, "23:12:00"),
			(SATURDAY, "00:01:00"),
			(SATURDAY, "08:59:59"),
		]
		after = [(SATURDAY, "09:00:00"), (SATURDAY, "23:30:00")]
		self.assertEqual({self.service(*when)["key"] for when in before}, {f"{FRIDAY}T09:00:00"})
		self.assertEqual({self.service(*when)["key"] for when in after}, {f"{SATURDAY}T09:00:00"})

	def test_a_last_service_with_no_card_is_not_announced(self):
		self.set_hours(
			self.a,
			("Friday", "11:00:00", "14:00:00", "Midday", self.lunch),
			("Friday", "18:00:00", "23:00:00", "Bar", None),
		)
		# Nothing of the Bar service to show: no line claims a card of it
		service = self.service(FRIDAY, "23:30:00")
		self.assertFalse(service["after_hours"])
		self.assertIsNone(service["label"])
		self.assertNotIn(self.lunch, self.shown(FRIDAY, "23:30:00"))
		# The Midday card is one the till can still fetch
		self.assertIn(self.lunch, self.other(FRIDAY, "23:30:00"))

	def test_what_the_status_already_said_is_unchanged(self):
		with at(FRIDAY, "23:12:00"):
			status = restaurant_api.get_restaurant_status(self.a)
		self.assertFalse(status["is_open"])
		self.assertIsNone(status["current_slot"])
		with at(FRIDAY, "12:00:00"):
			status = restaurant_api.get_restaurant_status(self.a)
		self.assertTrue(status["is_open"])
		self.assertEqual(status["current_slot"], "Lunch")
		self.assertTrue(status["has_active_cards"])


class TestTheOtherCards(TheHours, FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.cashier_of_a = self.cashier(CASHIER_OF_A, self.a)
		self.cashier_of_b = self.cashier(CASHIER_OF_B, self.b)
		_user(PORTAL, [CASHIER_ROLE], "Website User")

	def test_it_lists_the_active_cards_the_hours_hide_right_now(self):
		self.assertEqual(self.other(FRIDAY, "23:12:00"), [self.saturday, self.sunday])
		self.assertEqual(self.other(FRIDAY, "22:59:00"), [self.saturday, self.sunday])
		self.assertEqual(self.other(SATURDAY, "09:30:00"), [self.lunch, self.sunday])
		self.assertEqual(self.other(SATURDAY, "08:00:00"), [self.saturday, self.sunday])

	def test_it_lists_names_and_labels_not_items(self):
		with at(FRIDAY, "23:12:00"):
			cards = restaurant_api.get_other_cards(self.a)
		self.assertEqual([card["restaurant"] for card in cards], [self.a, self.a])
		self.assertEqual(
			sorted(cards[0]), sorted(["name", "card_name", "description", "image", "restaurant"])
		)

	def test_it_never_lists_an_inactive_card_a_card_out_of_its_dates_the_permanent_one_an_unscheduled_one_or_another_restaurants(
		self,
	):
		for date, time in ((FRIDAY, "23:12:00"), (SATURDAY, "09:30:00"), (SUNDAY, "08:00:00")):
			with self.subTest(date=date, time=time):
				names = self.other(date, time)
				for card in (
					self.inactive,
					self.not_yet,
					self.expired,
					self.permanent,
					self.always,
					self.of_b,
					self.also_of_b,
				):
					self.assertNotIn(card, names)

	def test_it_is_the_list_of_the_restaurant_asked(self):
		self.assertEqual(self.other(FRIDAY, "23:12:00", self.b), [self.also_of_b])
		self.assertEqual(self.other(SATURDAY, "09:30:00", self.b), [self.of_b])
		self.assertEqual(self.other(FRIDAY, "23:12:00", self.a), [self.saturday, self.sunday])

	def test_it_defaults_to_the_restaurant_of_the_till(self):
		self.make_till(TILL_A, self.a)
		with self.at_the_till_of(TILL_A), at(FRIDAY, "23:12:00"):
			names = [card["name"] for card in restaurant_api.get_other_cards()]
		self.assertEqual(names, [self.saturday, self.sunday])

	def test_a_portal_account_a_guest_and_a_cashier_of_another_restaurant_are_refused(self):
		for user in (PORTAL, "Guest", self.cashier_of_b):
			with self.subTest(user=user), as_user(user), self.assertRaises(frappe.PermissionError):
				restaurant_api.get_other_cards(self.a)
		with as_user(self.cashier_of_a), at(FRIDAY, "23:12:00"):
			self.assertEqual(
				[card["name"] for card in restaurant_api.get_other_cards(self.a)],
				[self.saturday, self.sunday],
			)


class OpeningACard(TheHours):
	def setUp(self):
		super().setUp()
		self.cashier_of_a = self.cashier(CASHIER_OF_A, self.a)
		self.cashier_of_b = self.cashier(CASHIER_OF_B, self.b)
		_user(PORTAL, [CASHIER_ROLE], "Website User")
		self.make_till(TILL_A, self.a)
		# The log of the gate writes on a connection of its own: nothing of it is kept
		log = patch("pos_next.authorization.log.record")
		log.start()
		self.addCleanup(log.stop)

	def open(self, user, card, restaurant=None, token=None):
		"""The call the till makes, as that user, at the Friday 23:12 of the tests (the Saturday card is hidden), at the
		till of restaurant A."""
		with as_user(user), at(FRIDAY, "23:12:00"), self.at_the_till_of(TILL_A):
			return restaurant_api.open_card_outside_hours(
				card, restaurant=restaurant or self.a, authorization_token=token
			)

	def gate_on(self):
		"""A rule that asks a manager's PIN to open a card outside its hours."""
		make_role(ROLE)
		make_user(MANAGER, [ROLE])
		pin_store.set_pin(MANAGER, GOOD_PIN)
		# Wrong PINs are counted in the cache, which a rollback does not undo: the manager must not stay locked out of
		# the next run
		pin_store.clear_failures(MANAGER)
		self.addCleanup(pin_store.clear_failures, MANAGER)
		frappe.db.delete("POS Authorization Rule", {"action": ACTION})
		rule = frappe.get_doc(
			{
				"doctype": "POS Authorization Rule",
				"action": ACTION,
				"enabled": 1,
				"allow_self_approval": 0,
				"approvers": [{"approver_type": "Role", "role": ROLE}],
			}
		)
		# The clone's Select lists the action only once it is migrated with this code
		with patch("frappe.model.document.Document._validate_selects"):
			rule.insert(ignore_permissions=True)

	def request_grant(self, user, card, approver=MANAGER, pin=GOOD_PIN, **context):
		"""What the till's authorization dialog sends, as the cashier's session, at the cashier's till."""
		with (
			as_user(user),
			at(FRIDAY, "23:12:00"),
			self.at_the_till_of(TILL_A),
			a_request_from(f"10.25.0.{next(_ip)}"),
		):
			return authorization.request_grant(
				ACTION, approver, pin, json.dumps({"restaurant_card": card, **context})
			)

	def grant(self, user, card, **context):
		answer = self.request_grant(user, card, **context)
		self.assertTrue(answer["authorized"], answer)
		return answer["grant_token"]


class TestOpeningAHiddenCard(OpeningACard, FrappeTestCase):
	def test_the_action_is_registered_under_the_name_the_product_owner_gave_it(self):
		from pos_next.authorization import registry
		from pos_next.authorization.actions.card_hours import ACTION_OPEN_CARD_OUTSIDE_HOURS

		self.assertEqual(ACTION_OPEN_CARD_OUTSIDE_HOURS, ACTION)
		self.assertIsNotNone(registry.get(ACTION))
		self.assertIn(ACTION, [action.name for action in registry.all_actions()])

	def test_it_serves_a_hidden_card_with_its_items(self):
		card = self.open(self.cashier_of_a, self.saturday)
		self.assertEqual(card["name"], self.saturday)
		self.assertEqual(card["restaurant"], self.a)
		self.assertFalse(card["is_permanent"])
		self.assertEqual([row["item_type"] for row in card["items"]], ["Category", "Item"])
		dish = card["items"][1]
		self.assertEqual(dish["price"], 7)
		self.assertTrue(dish["item_name"])
		# It is shaped as the cards the till already holds
		with at(FRIDAY, "12:00:00"):
			on_the_till = restaurant_api.get_active_cards(self.a)
		self.assertEqual(set(card), set(on_the_till[0]))

	def test_a_card_that_was_opened_stays_hidden_from_the_hours(self):
		self.open(self.cashier_of_a, self.saturday)
		self.assertNotIn(self.saturday, self.shown(FRIDAY, "23:12:00"))
		self.assertIn(self.saturday, self.other(FRIDAY, "23:12:00"))

	def test_the_administrator_may_open_it_as_well(self):
		self.assertEqual(self.open("Administrator", self.saturday)["name"], self.saturday)

	def test_it_refuses_the_cards_it_must_not_serve(self):
		for card in (self.inactive, self.not_yet, self.expired):
			with self.subTest(card=card), self.assertRaises(frappe.ValidationError):
				self.open(self.cashier_of_a, card)
		with self.assertRaises(frappe.DoesNotExistError):
			self.open(self.cashier_of_a, "_Test Card That Does Not Exist")

	def test_it_never_serves_a_card_of_another_restaurant(self):
		# Asked for the restaurant of the cashier, or for the one the card is of
		with self.assertRaises(frappe.PermissionError):
			self.open(self.cashier_of_a, self.of_b)
		with self.assertRaises(frappe.PermissionError):
			self.open(self.cashier_of_a, self.of_b, restaurant=self.b)
		with self.assertRaises(frappe.PermissionError):
			self.open(self.cashier_of_b, self.saturday, restaurant=self.a)
		# And at a till of restaurant A, whoever asks for a card of B by name
		with self.assertRaises(frappe.PermissionError):
			with self.at_the_till_of(TILL_A):
				restaurant_api.open_card_outside_hours(self.of_b)

	def test_a_portal_account_and_a_guest_are_refused(self):
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user), self.assertRaises(frappe.PermissionError):
				self.open(user, self.saturday)

	def test_a_card_the_hours_show_is_served_without_the_gate(self):
		# The service began between the list and the pick: the card is no longer outside its hours
		self.gate_on()
		with as_user(self.cashier_of_a), at(FRIDAY, "12:00:00"), self.at_the_till_of(TILL_A):
			card = restaurant_api.open_card_outside_hours(self.lunch, restaurant=self.a)
		self.assertEqual(card["name"], self.lunch)

	def test_the_permanent_card_and_an_unscheduled_card_are_served_without_the_gate(self):
		self.gate_on()
		for card in (self.permanent, self.always):
			with self.subTest(card=card):
				self.assertEqual(self.open(self.cashier_of_a, card)["name"], card)


class TestTheGate(OpeningACard, FrappeTestCase):
	def test_with_no_rule_no_pin_is_asked(self):
		with as_user(self.cashier_of_a):
			self.assertFalse(authorization.get_authorization_policy().get(ACTION))
		self.assertEqual(self.open(self.cashier_of_a, self.saturday)["name"], self.saturday)

	def test_with_a_rule_the_server_asks_for_a_grant(self):
		self.gate_on()
		with as_user(self.cashier_of_a):
			self.assertTrue(authorization.get_authorization_policy().get(ACTION))
		with self.assertRaises(frappe.ValidationError):
			self.open(self.cashier_of_a, self.saturday)
		with self.assertRaises(frappe.ValidationError):
			self.open(self.cashier_of_a, self.saturday, token="not-a-grant")

	def test_a_grant_from_a_managers_pin_opens_the_card(self):
		self.gate_on()
		token = self.grant(self.cashier_of_a, self.saturday)
		self.assertEqual(self.open(self.cashier_of_a, self.saturday, token=token)["name"], self.saturday)
		# A retry of the same gesture, with the same grant
		self.assertEqual(self.open(self.cashier_of_a, self.saturday, token=token)["name"], self.saturday)

	def test_a_grant_is_for_one_card(self):
		self.gate_on()
		token = self.grant(self.cashier_of_a, self.saturday)
		with self.assertRaises(frappe.ValidationError):
			self.open(self.cashier_of_a, self.sunday, token=token)

	def test_a_grant_is_for_the_cashier_who_asked(self):
		self.gate_on()
		token = self.grant(self.cashier_of_a, self.saturday)
		with self.assertRaises(frappe.ValidationError):
			self.open("Administrator", self.saturday, token=token)

	def test_a_wrong_pin_or_an_approver_without_the_role_gives_no_grant(self):
		self.gate_on()
		self.assertFalse(self.request_grant(self.cashier_of_a, self.saturday, pin="0000")["authorized"])
		self.assertFalse(
			self.request_grant(self.cashier_of_a, self.saturday, approver=CASHIER_OF_B)["authorized"]
		)

	def test_the_till_of_a_grant_is_the_one_of_the_open_shift_not_the_clients(self):
		self.gate_on()
		# A client that names another till is refused: the profile is read from the cashier's shift
		with self.assertRaises(frappe.ValidationError):
			self.request_grant(self.cashier_of_a, self.saturday, pos_profile="_Test Till Somewhere Else")
		# Its own till is accepted, and so is none
		self.assertTrue(
			self.request_grant(self.cashier_of_a, self.saturday, pos_profile=TILL_A)["authorized"]
		)
		self.assertTrue(self.request_grant(self.cashier_of_a, self.saturday)["authorized"])

	def test_a_card_of_another_restaurant_gets_no_grant(self):
		self.gate_on()
		with self.assertRaises(frappe.PermissionError):
			self.request_grant(self.cashier_of_a, self.of_b)

	def test_the_approvers_are_listed_for_the_action(self):
		self.gate_on()
		with as_user(self.cashier_of_a):
			approvers = authorization.get_authorizers(
				ACTION, None, json.dumps({"restaurant_card": self.saturday})
			)
		self.assertEqual([row["user"] for row in approvers], [MANAGER])

	def test_a_card_that_fails_to_load_gives_the_grant_back(self):
		from pos_next.authorization import grants

		self.gate_on()
		token = self.grant(self.cashier_of_a, self.saturday)
		with patch.object(restaurant_api, "_card_with_items", side_effect=RuntimeError("boom")):
			with self.assertRaises(RuntimeError):
				self.open(self.cashier_of_a, self.saturday, token=token)
		# The grant was not burnt on a card that never opened: it is not pinned to that card any more
		binding = {"pos_profile": TILL_A, "restaurant_card": self.saturday}
		with as_user(self.cashier_of_a):
			self.assertTrue(grants.consume(token, ACTION, binding, None))
