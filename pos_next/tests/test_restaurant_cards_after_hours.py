# //// Neoffice — added file (no upstream equivalent).
"""A card the opening hours keep off the till can be fetched from a « ⋯ » (NeoRestau lot 1, task 25).

The restaurant's opening hours assign cards to service slots. A card they name is shown during its slots only, and
between the services nothing of it shows by itself: the afternoon between a lunch and an evening service has no card
of its own (product owner, 31.10.2026, who first wanted the last service's card to stay until the next one began and
then took that back). What a cashier still needs of a card the hours have hidden, with people still at a table at 14:00,
he fetches from the « ⋯ »: `get_other_cards` lists the cards, `open_card_outside_hours` serves one, through the
authorization gate as « Open a card outside its hours » (opt-in manager PIN, off by default).

What is already typed stays workable: a table opened at 13:00 is edited, sent to the kitchen, paid and replayed offline
at 14:30, whatever the hours did to the card its lines came from.

The suite relies on neither the patches nor any restaurant of the clone: it builds two restaurants of its own with
their cards and slots, sets the clock with the `frappe.utils` patches the other restaurant tests use, and rolls
everything back.
"""

import ast
import json
import os
import re
from contextlib import contextmanager
from itertools import count
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import authorization, invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.authorization import pin as pin_store
from pos_next.authorization.tests.helpers import GOOD_PIN, MANAGER, ROLE, make_role, make_user
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, TILL, _item, _sale, _user
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
OFFLINE_SALE = "cards-after-hours-offline-sale"

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


class TestACardTiedToHoursShowsInItsSlotsOnly(TheHours, FrappeTestCase):
	def setUp(self):
		super().setUp()
		# A noon service and an evening service on Fridays, each with its card
		self.noon, self.evening = self.lunch, self.saturday
		self.set_hours(
			self.a,
			("Friday", "12:00:00", "14:00:00", "Noon", self.noon),
			("Friday", "18:00:00", "23:00:00", "Evening", self.evening),
		)

	def test_the_noon_card_shows_from_noon_and_is_gone_after_two(self):
		self.assertNotIn(self.noon, self.shown(FRIDAY, "11:59:00"))
		for time in ("12:00:00", "12:30:00", "13:59:00", "14:00:00"):
			with self.subTest(time=time):
				self.assertIn(self.noon, self.shown(FRIDAY, time))
		self.assertNotIn(self.noon, self.shown(FRIDAY, "14:01:00"))

	def test_between_the_two_services_nothing_of_the_hours_shows(self):
		for time in ("14:01:00", "14:30:00", "16:00:00", "17:59:00"):
			with self.subTest(time=time):
				shown = self.shown(FRIDAY, time)
				self.assertNotIn(self.noon, shown)
				self.assertNotIn(self.evening, shown)

	def test_the_evening_card_appears_at_six(self):
		self.assertNotIn(self.evening, self.shown(FRIDAY, "17:59:00"))
		for time in ("18:00:00", "20:00:00", "22:59:00"):
			with self.subTest(time=time):
				shown = self.shown(FRIDAY, time)
				self.assertIn(self.evening, shown)
				self.assertNotIn(self.noon, shown)

	def test_after_the_last_service_nothing_of_the_hours_shows_either(self):
		# The case the first version of the task kept a card on screen for: the evening is over at 23:00
		for date, time in (
			(FRIDAY, "23:12:00"),
			(FRIDAY, "23:59:00"),
			(SATURDAY, "08:00:00"),
			(SATURDAY, "09:30:00"),
		):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				self.assertNotIn(self.noon, shown)
				self.assertNotIn(self.evening, shown)

	def test_the_cards_of_every_slot_that_matches_now_show_together(self):
		self.set_hours(
			self.a,
			("Friday", "12:00:00", "14:00:00", "Noon", self.noon),
			("Friday", "13:00:00", "15:00:00", "Brunch", self.evening),
		)
		shown = self.shown(FRIDAY, "13:30:00")
		self.assertIn(self.noon, shown)
		self.assertIn(self.evening, shown)
		shown = self.shown(FRIDAY, "14:30:00")
		self.assertNotIn(self.noon, shown)
		self.assertIn(self.evening, shown)
		shown = self.shown(FRIDAY, "15:30:00")
		self.assertNotIn(self.noon, shown)
		self.assertNotIn(self.evening, shown)

	def test_a_slot_that_spans_midnight_is_read_on_its_own_weekday_as_the_hours_always_did(self):
		night = self.evening
		self.set_hours(self.a, ("Friday", "22:00:00", "02:00:00", "Night", night))
		for time in ("22:00:00", "23:30:00", "23:59:00", "00:30:00", "02:00:00"):
			with self.subTest(time=time):
				self.assertIn(night, self.shown(FRIDAY, time))
		for time in ("02:01:00", "12:00:00", "21:59:00"):
			with self.subTest(time=time):
				self.assertNotIn(night, self.shown(FRIDAY, time))
		# Saturday has no slot of its own: nothing of the Friday night follows it there
		self.assertNotIn(night, self.shown(SATURDAY, "00:30:00"))

	def test_a_card_the_hours_name_nowhere_shows_at_every_hour(self):
		for date, time in (
			(FRIDAY, "10:00:00"),
			(FRIDAY, "14:30:00"),
			(FRIDAY, "23:12:00"),
			(SATURDAY, "08:00:00"),
		):
			with self.subTest(date=date, time=time):
				self.assertIn(self.always, self.shown(date, time))

	def test_hours_that_assign_no_card_filter_nothing(self):
		self.set_hours(self.a, ("Friday", "09:00:00", "23:00:00", "Lunch", None))
		for date, time in ((FRIDAY, "10:00:00"), (FRIDAY, "23:12:00"), (SATURDAY, "08:00:00")):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				for card in (self.noon, self.evening, self.always):
					self.assertIn(card, shown)
				self.assertEqual(self.other(date, time), [])

	def test_a_restaurant_without_hours_filters_nothing(self):
		self.set_hours(self.a)
		shown = self.shown(FRIDAY, "14:30:00")
		for card in (self.noon, self.evening, self.always):
			self.assertIn(card, shown)
		self.assertEqual(self.other(FRIDAY, "14:30:00"), [])

	def test_the_dates_of_a_card_still_apply(self):
		self.set_hours(
			self.a,
			("Friday", "09:00:00", "23:00:00", "Lunch", self.not_yet),
			("Saturday", "09:00:00", "23:00:00", "Saturday service", self.expired),
		)
		frappe.db.set_value("Restaurant Card", self.not_yet, "available_from", SATURDAY)
		frappe.db.set_value("Restaurant Card", self.expired, "available_to", THURSDAY)
		# Not available before its first day, even in the slot that names it
		self.assertNotIn(self.not_yet, self.shown(FRIDAY, "12:00:00"))
		# Gone after its last day
		self.assertNotIn(self.expired, self.shown(SATURDAY, "12:00:00"))
		# Inside its dates it shows, in its slot
		frappe.db.set_value("Restaurant Card", self.not_yet, "available_from", FRIDAY)
		self.assertIn(self.not_yet, self.shown(FRIDAY, "12:00:00"))
		frappe.db.set_value("Restaurant Card", self.expired, "available_to", SATURDAY)
		self.assertIn(self.expired, self.shown(SATURDAY, "12:00:00"))

	def test_the_permanent_card_is_always_shown_and_last(self):
		for date, time in (
			(FRIDAY, "10:00:00"),
			(FRIDAY, "12:30:00"),
			(FRIDAY, "14:30:00"),
			(SATURDAY, "08:00:00"),
		):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				self.assertEqual(shown[-1], self.permanent)
				self.assertEqual(shown.count(self.permanent), 1)

	def test_an_inactive_card_and_another_restaurants_card_are_never_shown(self):
		for date, time in (
			(FRIDAY, "10:00:00"),
			(FRIDAY, "14:30:00"),
			(SATURDAY, "08:00:00"),
			(SUNDAY, "12:00:00"),
		):
			with self.subTest(date=date, time=time):
				shown = self.shown(date, time)
				self.assertNotIn(self.inactive, shown)
				self.assertNotIn(self.of_b, shown)

	def test_each_restaurant_follows_its_own_hours(self):
		self.assertEqual(self.shown(FRIDAY, "23:12:00", self.b), [])
		self.assertEqual(self.shown(FRIDAY, "12:00:00", self.b), [self.of_b])
		self.assertEqual(self.shown(SATURDAY, "09:30:00", self.b), [self.also_of_b])
		self.assertNotIn(self.noon, self.shown(FRIDAY, "12:00:00", self.b))

	def test_the_status_says_nothing_about_a_service_and_what_it_said_is_unchanged(self):
		with at(FRIDAY, "14:30:00"):
			status = restaurant_api.get_restaurant_status(self.a)
		self.assertEqual(set(status), {"is_open", "current_slot", "has_active_cards", "warning"})
		self.assertFalse(status["is_open"])
		self.assertIsNone(status["current_slot"])
		with at(FRIDAY, "12:00:00"):
			status = restaurant_api.get_restaurant_status(self.a)
		self.assertEqual(set(status), {"is_open", "current_slot", "has_active_cards", "warning"})
		self.assertTrue(status["is_open"])
		self.assertEqual(status["current_slot"], "Noon")
		self.assertTrue(status["has_active_cards"])


class TestTheOtherCards(TheHours, FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.cashier_of_a = self.cashier(CASHIER_OF_A, self.a)
		self.cashier_of_b = self.cashier(CASHIER_OF_B, self.b)
		_user(PORTAL, [CASHIER_ROLE], "Website User")

	def test_it_lists_the_active_cards_the_hours_hide_right_now(self):
		everything = [self.lunch, self.saturday, self.sunday]
		# After the last slot of the day, and before the first one of the next: all of them
		self.assertEqual(self.other(FRIDAY, "23:12:00"), everything)
		self.assertEqual(self.other(SATURDAY, "08:00:00"), everything)
		# During a slot: the cards of the other slots
		self.assertEqual(self.other(FRIDAY, "22:59:00"), [self.saturday, self.sunday])
		self.assertEqual(self.other(SATURDAY, "09:30:00"), [self.lunch, self.sunday])

	def test_it_lists_the_noon_card_at_two_minutes_past_two(self):
		noon, evening = self.lunch, self.saturday
		self.set_hours(
			self.a,
			("Friday", "12:00:00", "14:00:00", "Noon", noon),
			("Friday", "18:00:00", "23:00:00", "Evening", evening),
		)
		self.assertEqual(self.other(FRIDAY, "12:30:00"), [evening])
		self.assertEqual(self.other(FRIDAY, "14:01:00"), [noon, evening])
		self.assertEqual(self.other(FRIDAY, "18:30:00"), [noon])

	def test_it_lists_names_and_labels_not_items(self):
		with at(FRIDAY, "23:12:00"):
			cards = restaurant_api.get_other_cards(self.a)
		self.assertEqual([card["restaurant"] for card in cards], [self.a, self.a, self.a])
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
		# Sorted by the name the cashier reads: « Also Of Restaurant B » before « Of Restaurant B »
		self.assertEqual(self.other(FRIDAY, "23:12:00", self.b), [self.also_of_b, self.of_b])
		self.assertEqual(self.other(SATURDAY, "09:30:00", self.b), [self.of_b])
		self.assertEqual(self.other(FRIDAY, "23:12:00", self.a), [self.lunch, self.saturday, self.sunday])

	def test_it_defaults_to_the_restaurant_of_the_till(self):
		self.make_till(TILL_A, self.a)
		with self.at_the_till_of(TILL_A), at(FRIDAY, "23:12:00"):
			names = [card["name"] for card in restaurant_api.get_other_cards()]
		self.assertEqual(names, [self.lunch, self.saturday, self.sunday])

	def test_a_portal_account_a_guest_and_a_cashier_of_another_restaurant_are_refused(self):
		for user in (PORTAL, "Guest", self.cashier_of_b):
			with self.subTest(user=user), as_user(user), self.assertRaises(frappe.PermissionError):
				restaurant_api.get_other_cards(self.a)
		with as_user(self.cashier_of_a), at(FRIDAY, "23:12:00"):
			self.assertEqual(
				[card["name"] for card in restaurant_api.get_other_cards(self.a)],
				[self.lunch, self.saturday, self.sunday],
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


class TestAHiddenCardRefusesNothing(TheHours, FrappeTestCase):
	"""At 14:30 the opening hours have taken the noon card off the till. A table opened at 13:00 on that card is still
	edited, recalled, sent to the kitchen, paid, and a sale made offline still syncs: a line carries an item, never the
	card it was picked from, and none of these places asks which cards are on the till."""

	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.make_till(self.fx.profile, self.a)
		self.today = frappe.utils.nowdate()
		self.noon = self.make_card(
			self.a,
			"_Test Card Noon Dish",
			items=[{"item_type": "Item", "item": self.fx.item, "price": 10}],
		)
		# The noon slot of today, whatever day it is
		weekday = restaurant_api.WEEKDAYS[frappe.utils.getdate(self.today).weekday()]
		self.set_hours(self.a, (weekday, "12:00:00", "14:00:00", "Noon", self.noon))
		# The order is taken at 13:00, from the noon card, and sent to the kitchen
		with self.clock("13:00:00"):
			self.order = invoices.update_invoice(json.dumps(self.paper()))["name"]
		frappe.db.set_value("Sales Invoice Item", {"parent": self.order}, "kds_status", "Pending")

	def clock(self, time):
		return at(self.today, time)

	def paper(self, **changes):
		"""The order of table A as the till sends it: one line of the noon card, paid in cash."""
		return _sale(self.fx, restaurant_table=self.table_a, **changes)

	def assert_the_noon_card_is_off_the_till(self):
		"""At the moment of the call: the hours show nothing of the noon card, and the « ⋯ » offers it."""
		self.assertNotIn(self.noon, [card["name"] for card in restaurant_api.get_active_cards(self.a)])
		self.assertIn(self.noon, [card["name"] for card in restaurant_api.get_other_cards(self.a)])

	def test_the_noon_card_is_on_the_till_at_13_00_and_off_it_at_14_30(self):
		with self.clock("13:00:00"):
			self.assertIn(self.noon, [card["name"] for card in restaurant_api.get_active_cards(self.a)])
			self.assertNotIn(self.noon, [card["name"] for card in restaurant_api.get_other_cards(self.a)])
		with self.clock("14:30:00"):
			self.assert_the_noon_card_is_off_the_till()

	def test_a_line_of_the_order_is_edited_at_14_30(self):
		line = {"item_code": self.fx.item, "qty": 2, "rate": 10, "price_list_rate": 10}
		with self.clock("14:30:00"):
			self.assert_the_noon_card_is_off_the_till()
			edited = invoices.update_invoice(json.dumps(self.paper(name=self.order, items=[line])))
		self.assertEqual(edited["name"], self.order)
		self.assertEqual(frappe.db.get_value("Sales Invoice Item", {"parent": self.order}, "qty"), 2)

	def test_the_order_of_the_table_is_recalled_at_14_30(self):
		with self.clock("14:30:00"), self.at_the_till_of(self.fx.profile):
			self.assert_the_noon_card_is_off_the_till()
			order = restaurant_api.get_table_order(self.table_a)
		self.assertEqual(order["name"], self.order)
		self.assertEqual([row["item_code"] for row in order["items"]], [self.fx.item])

	def test_the_kitchen_and_the_runner_still_see_the_order_at_14_30(self):
		with self.clock("14:30:00"):
			self.assert_the_noon_card_is_off_the_till()
			kitchen = {order["name"] for order in restaurant_api.get_kds_orders(restaurant=self.a)}
			frappe.db.set_value("Sales Invoice Item", {"parent": self.order}, "kds_status", "Ready")
			runner = {order["name"] for order in restaurant_api.get_runner_orders(restaurant=self.a)}
		self.assertIn(self.order, kitchen)
		self.assertIn(self.order, runner)

	def test_the_order_is_paid_at_14_30(self):
		with self.clock("14:30:00"), as_user(TILL):
			self.assert_the_noon_card_is_off_the_till()
			paid = invoices.submit_invoice(invoice=json.dumps(self.paper(name=self.order)), data="{}")
		self.assertEqual((paid["name"], paid["status"]), (self.order, 1))
		self.assertEqual(frappe.db.get_value("Sales Invoice", self.order, "docstatus"), 1)

	def test_a_sale_made_offline_still_syncs_at_14_30(self):
		replay = {"invoice": _sale(self.fx, offline_id=OFFLINE_SALE), "data": {"sales_team": []}}
		with self.clock("14:30:00"), as_user(TILL):
			synced = invoices.submit_invoice(data=json.dumps(replay))
		self.assertEqual((synced["status"], synced["offline_id"]), (1, OFFLINE_SALE))

	def test_a_card_that_is_not_there_is_no_reason_to_refuse_it_when_it_is_asked_for(self):
		# What a cashier asks for by hand is served at 14:30, to the till that works at it
		with self.clock("14:30:00"), self.at_the_till_of(self.fx.profile):
			card = restaurant_api.open_card_outside_hours(self.noon, restaurant=self.a)
		self.assertEqual(card["name"], self.noon)
		self.assertEqual([row["item"] for row in card["items"]], [self.fx.item])


class TestNothingOfTheSalePathReadsTheCardsTheHoursShow(FrappeTestCase):
	"""The places that read which cards are on the till are few, and the sale path is not one of them: this fails the
	day one starts to, so that it is a decision and not an accident."""

	PATTERN = re.compile(
		r"get_active_cards|get_other_cards|open_card_outside_hours|_cards_of_the_hours|_hidden_by_the_hours"
		r"|_cards_outside_hours|_card_is_in_its_dates"
	)
	# What reads them, and why: the card functions, and the registry that loads the card action of the gate
	READERS = frozenset(
		{
			"api/restaurant.py",
			"authorization/actions/__init__.py",
			"authorization/actions/card_hours.py",
		}
	)
	# The functions of the card module that may: the cards, the « ⋯ », and the banner of a till with no card
	CARD_FUNCTIONS = frozenset(
		{
			"_cards_of_the_hours",
			"_hidden_by_the_hours",
			"_card_is_in_its_dates",
			"_card_with_items",
			"get_active_cards",
			"_cards_outside_hours",
			"get_other_cards",
			"check_card_can_be_opened",
			"open_card_outside_hours",
			"get_restaurant_status",
		}
	)

	def test_no_module_of_the_app_but_the_card_functions_and_the_gate_reads_them(self):
		import pos_next

		root = os.path.dirname(pos_next.__file__)
		readers = set()
		for folder, _dirs, files in os.walk(root):
			parts = folder.split(os.sep)
			if "public" in parts or "tests" in parts:
				continue
			for name in files:
				if not name.endswith(".py") or name.startswith("test_"):
					continue
				path = os.path.join(folder, name)
				with open(path, encoding="utf-8") as source:
					if self.PATTERN.search(source.read()):
						readers.add(os.path.relpath(path, root))
		self.assertEqual(readers, set(self.READERS))

	def test_no_function_of_the_restaurant_module_but_the_card_ones_reads_them(self):
		path = os.path.join(os.path.dirname(restaurant_api.__file__), "restaurant.py")
		with open(path, encoding="utf-8") as handle:
			source = handle.read()
		offenders = [
			node.name
			for node in ast.parse(source).body
			if isinstance(node, ast.FunctionDef)
			and node.name not in self.CARD_FUNCTIONS
			and self.PATTERN.search(ast.get_source_segment(source, node))
		]
		self.assertEqual(offenders, [])
		# The pattern is not blind: it finds the functions that do
		found = [
			node.name
			for node in ast.parse(source).body
			if isinstance(node, ast.FunctionDef) and self.PATTERN.search(ast.get_source_segment(source, node))
		]
		self.assertIn("get_active_cards", found)
		self.assertIn("open_card_outside_hours", found)
