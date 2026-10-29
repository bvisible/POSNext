# //// Neoffice — added file (no upstream equivalent).
"""Two restaurants on one site (NeoRestau lot 1, task 2).

Rooms, tables, preparation stations, cards, menus, reservations and tips belong to a restaurant, and a till works
for one restaurant, the one its POS Settings name. What a till reads is that restaurant's, what it creates is that
restaurant's, and the name of a room, a table or a station only has to be unique within its restaurant.

The suite relies on neither the patches nor any restaurant: a fresh CI site runs no patch, while the clone of a
working site holds a real restaurant with its rooms, its cards and its reservations. Every test builds the two
restaurants it needs, with the same labels in each ("Room 1", "T1", "Kitchen"), and nothing here commits: the tests
that reach a commit run with it switched off, and each test rolls back.
"""

import json
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.api import bootstrap, guest_ordering, invoices, menu_pdf, pos_profile, reservations
from pos_next.api import restaurant as restaurant_api
from pos_next.api.constants import DEFAULT_POS_SETTINGS, POS_SETTINGS_FIELDS
from pos_next.patches.neorestau.attach_records_to_the_default_restaurant import execute
from pos_next.pos_next.doctype.pos_settings.pos_settings import get_pos_settings
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import scope, settings
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

ROOM = "Room 1"
TABLE = "T1"
STATION = "Kitchen"
NO_ONE = "_Test Till Nowhere"
BOOKING_ONLINE = {"enable_reservations": 1, "enable_online_reservations": 1}
# The records a site made before the restaurants existed, by the key the patch tests use for each
LEGACY_DOCTYPES = {
	"area": "Restaurant Area",
	"table": "Restaurant Table",
	"station": "Preparation Station",
	"card": "Restaurant Card",
	"menu": "Restaurant Menu",
	"reservation": "Restaurant Reservation",
	"tip": "Restaurant Tip",
}


@contextmanager
def a_request_from(ip):
	"""frappe.local.request_ip as a web request sets it: restored as it was (it may not be set at all) afterwards."""
	missing = object()
	before = getattr(frappe.local, "request_ip", missing)
	frappe.local.request_ip = ip
	try:
		yield
	finally:
		if before is missing:
			del frappe.local.request_ip
		else:
			frappe.local.request_ip = before


@contextmanager
def the_default_restaurant_is(restaurant):
	"""The default restaurant as every module that names it reads it (None: a site without any restaurant)."""
	with (
		patch.object(settings, "default_restaurant", return_value=restaurant),
		patch.object(scope, "default_restaurant", return_value=restaurant),
	):
		yield


class TwoRestaurants:
	"""Restaurant A and restaurant B, each with a room "Room 1", a table "T1" in it and a station "Kitchen"."""

	def setUp(self):
		super().setUp()
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		self.company = company[0]
		# Tip provisioning (an item and an account) is the doctype's own test: it is switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		# A few endpoints commit: nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		self.a = self.make_restaurant("_Test Restaurant A", logo="/files/_test_restaurant_a.png")
		self.b = self.make_restaurant("_Test Restaurant B")
		self.room_a = self.make_room(self.a)
		self.room_b = self.make_room(self.b)
		self.table_a = self.make_table(self.a, self.room_a)
		self.table_b = self.make_table(self.b, self.room_b)
		self.station_a = self.make_station(self.a)
		self.station_b = self.make_station(self.b)

	def make_restaurant(self, name, **values):
		doc = frappe.get_doc(
			{"doctype": "Restaurant", "restaurant_name": name, "company": self.company, **values}
		)
		return doc.insert(ignore_permissions=True).name

	def make_room(self, restaurant, label=ROOM, **values):
		doc = frappe.get_doc(
			{"doctype": "Restaurant Area", "restaurant": restaurant, "area_name": label, **values}
		)
		return doc.insert(ignore_permissions=True).name

	def make_table(self, restaurant, area, table_name=TABLE, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Table",
				"restaurant": restaurant,
				"area": area,
				"table_name": table_name,
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def make_station(self, restaurant, station_name=STATION, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Preparation Station",
				"restaurant": restaurant,
				"station_name": station_name,
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def make_card(self, restaurant, name, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"restaurant": restaurant,
				"card_name": name,
				"is_active": 1,
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def make_menu(self, restaurant, name, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Menu",
				"restaurant": restaurant,
				"menu_name": name,
				"price": 25,
				"is_active": 1,
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def make_reservation(self, restaurant, tables, guest="_Test Guest", **values):
		doc = frappe.get_doc(
			{
				"doctype": "Restaurant Reservation",
				"restaurant": restaurant,
				"status": "Confirmed",
				"reservation_date": nowdate(),
				"reservation_time": "20:00:00",
				"duration": 5400,
				"no_of_guests": 2,
				"guest_name": guest,
				"tables": [{"restaurant_table": table} for table in tables],
				**values,
			}
		)
		return doc.insert(ignore_permissions=True).name

	def make_tip(self, restaurant, amount, **values):
		doc = frappe.get_doc(
			{"doctype": "Restaurant Tip", "restaurant": restaurant, "amount": amount, **values}
		)
		return doc.insert(ignore_permissions=True).name

	def make_till(self, profile, restaurant, **values):
		"""The POS Settings of a till in restaurant mode (the POS Profile itself is not needed)."""
		for name in frappe.get_all("POS Settings", filters={"pos_profile": profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": profile,
				"enabled": 1,
				"enable_restaurant_mode": 1,
				"restaurant": restaurant,
				**values,
			}
		)
		doc.flags.ignore_links = True
		return doc.insert(ignore_permissions=True).name

	def two_real_tills(self):
		"""Two POS Profiles with their cashiers, as the till tests build them (the profiles name their users)."""
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		return _till_fixture()

	def at_the_till_of(self, profile):
		"""Whoever asks works at the till of this POS Profile (its shift is open)."""
		return patch.object(settings, "open_shift_profile", return_value=profile)


class TestLabelsAreUniqueWithinARestaurant(TwoRestaurants, FrappeTestCase):
	def test_the_same_labels_live_in_two_restaurants(self):
		both = {"restaurant": ["in", [self.a, self.b]]}
		self.assertEqual(frappe.db.count("Restaurant Area", {"area_name": ROOM, **both}), 2)
		self.assertEqual(frappe.db.count("Restaurant Table", {"table_name": TABLE, **both}), 2)
		self.assertEqual(frappe.db.count("Preparation Station", {"station_name": STATION, **both}), 2)

	def test_the_same_label_twice_in_one_restaurant_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.make_table(self.a, self.room_a, table_name=TABLE)
		with self.assertRaises(frappe.ValidationError):
			self.make_room(self.a, label=ROOM)
		with self.assertRaises(frappe.ValidationError):
			self.make_station(self.a, station_name=STATION)

	def test_a_label_is_unique_in_the_restaurant_whatever_the_room_or_the_case(self):
		second_room = self.make_room(self.a, label="Terrace")
		with self.assertRaises(frappe.ValidationError):
			self.make_table(self.a, second_room, table_name=TABLE.lower())
		with self.assertRaises(frappe.ValidationError):
			self.make_room(self.a, label=ROOM.upper())

	def test_a_record_may_keep_its_own_label_when_it_is_saved_again(self):
		table = frappe.get_doc("Restaurant Table", self.table_a)
		table.capacity = 6
		table.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "capacity"), 6)

	def test_new_rooms_tables_and_stations_are_named_by_a_hash_and_carry_their_label(self):
		for doctype, name, label_field, label in (
			("Restaurant Area", self.room_a, "area_name", ROOM),
			("Restaurant Table", self.table_a, "table_name", TABLE),
			("Preparation Station", self.station_a, "station_name", STATION),
		):
			with self.subTest(doctype=doctype):
				self.assertNotEqual(name, label)
				self.assertEqual(frappe.db.get_value(doctype, name, label_field), label)
		# The two restaurants' rooms are two records, not one record twice
		self.assertNotEqual(self.room_a, self.room_b)

	def test_renaming_a_room_changes_its_label_and_keeps_its_name(self):
		restaurant_api.rename_area(self.room_a, "Terrace")
		self.assertEqual(frappe.db.get_value("Restaurant Area", self.room_a, "area_name"), "Terrace")
		# The table still links to the same room
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "area"), self.room_a)
		# The label B's room carries is free in A, and taken in B
		restaurant_api.rename_area(self.room_a, ROOM)
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.rename_area(self.make_room(self.a, label="Bar"), ROOM)

	def test_a_table_is_in_the_restaurant_of_its_room(self):
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "restaurant"), self.a)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_b, "restaurant"), self.b)
		# Whatever restaurant a caller names, the room decides
		table = self.make_table(self.b, self.room_a, table_name="T2")
		self.assertEqual(frappe.db.get_value("Restaurant Table", table, "restaurant"), self.a)

	def test_a_table_does_not_move_to_a_room_of_another_restaurant(self):
		table = frappe.get_doc("Restaurant Table", self.table_a)
		table.area = self.room_b
		with self.assertRaises(frappe.ValidationError):
			table.save(ignore_permissions=True)

	def test_a_room_that_holds_tables_stays_in_its_restaurant(self):
		room = frappe.get_doc("Restaurant Area", self.room_a)
		room.restaurant = self.b
		with self.assertRaises(frappe.ValidationError):
			room.save(ignore_permissions=True)
		empty = self.make_room(self.a, label="Cellar")
		room = frappe.get_doc("Restaurant Area", empty)
		room.restaurant = self.b
		room.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Restaurant Area", empty, "restaurant"), self.b)

	def test_a_station_on_the_plan_of_a_room_is_in_the_restaurant_of_that_room(self):
		with self.assertRaises(frappe.ValidationError):
			self.make_station(self.a, station_name="Pizza", area=self.room_b)
		station = self.make_station(self.a, station_name="Pizza", area=self.room_a)
		self.assertEqual(frappe.db.get_value("Preparation Station", station, "restaurant"), self.a)

	def test_a_record_naming_no_restaurant_joins_the_default_one(self):
		for doctype, values in (
			("Restaurant Area", {"area_name": "No restaurant"}),
			("Restaurant Card", {"card_name": "_Test Card No Restaurant", "is_active": 1}),
			("Restaurant Menu", {"menu_name": "_Test Menu No Restaurant", "price": 10}),
			("Preparation Station", {"station_name": "No restaurant"}),
		):
			with self.subTest(doctype=doctype):
				doc = frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True)
				self.assertEqual(doc.restaurant, settings.default_restaurant())

	def test_a_tip_is_in_the_restaurant_of_its_table(self):
		tip = self.make_tip(None, 5, restaurant_table=self.table_b)
		self.assertEqual(frappe.db.get_value("Restaurant Tip", tip, "restaurant"), self.b)


class TestEachTillSeesItsOwnRestaurant(TwoRestaurants, FrappeTestCase):
	def test_each_till_sees_only_its_own_floor(self):
		floor = restaurant_api.get_tables(restaurant=self.a)
		self.assertEqual({table["restaurant"] for table in floor["tables"]}, {self.a})
		self.assertEqual({area["restaurant"] for area in floor["areas"]}, {self.a})
		self.assertEqual({station["restaurant"] for station in floor["stations"]}, {self.a})
		self.assertEqual([t["name"] for t in floor["tables"]], [self.table_a])
		self.assertEqual([a["name"] for a in floor["areas"]], [self.room_a])
		self.assertEqual([s["name"] for s in floor["stations"]], [self.station_a])
		other = restaurant_api.get_tables(restaurant=self.b)
		self.assertEqual([t["name"] for t in other["tables"]], [self.table_b])

	def test_the_floor_shows_labels_beside_names(self):
		table = restaurant_api.get_tables(restaurant=self.a)["tables"][0]
		self.assertEqual((table["table_name"], table["area_name"]), (TABLE, ROOM))
		self.assertEqual(table["area"], self.room_a)

	def test_the_floor_of_a_till_is_the_one_of_its_restaurant(self):
		self.make_till("_Test Till A", self.a)
		self.make_till("_Test Till B", self.b)
		with self.at_the_till_of("_Test Till B"):
			floor = restaurant_api.get_tables()
		self.assertEqual({table["restaurant"] for table in floor["tables"]}, {self.b})

	def test_reset_all_tables_leaves_the_other_restaurant_alone(self):
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Occupied")
		frappe.db.set_value("Restaurant Table", self.table_b, "status", "Occupied")
		restaurant_api.reset_all_tables(restaurant=self.a)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a, "status"), "Empty")
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_b, "status"), "Occupied")

	def test_the_stations_and_their_map_are_the_restaurants(self):
		self.assertEqual(
			[s["name"] for s in restaurant_api.get_preparation_stations(restaurant=self.a)], [self.station_a]
		)
		self.assertEqual(
			[s["name"] for s in restaurant_api.get_preparation_stations(restaurant=self.b)], [self.station_b]
		)
		item = frappe.get_all("Item", limit=1, pluck="name")
		if not item:
			self.skipTest("The site has no item")
		for station in (self.station_a, self.station_b):
			doc = frappe.get_doc("Preparation Station", station)
			doc.append("items", {"item": item[0]})
			doc.save(ignore_permissions=True)
		self.assertEqual(
			restaurant_api.get_station_items_map(restaurant=self.a)["items"][item[0]]["station"],
			self.station_a,
		)
		self.assertEqual(
			restaurant_api.get_station_items_map(restaurant=self.b)["items"][item[0]]["station"],
			self.station_b,
		)

	def test_the_workflows_of_the_stations_are_the_restaurants(self):
		answer = restaurant_api.get_station_workflows(restaurant=self.b)
		names = [station["name"] for station in answer["stations"]]
		self.assertIn(self.station_b, names)
		self.assertNotIn(self.station_a, names)
		self.assertEqual({station["restaurant"] for station in answer["stations"]}, {self.b})
		self.assertEqual(
			[station["station_name"] for station in answer["stations"] if station["name"] == self.station_b],
			[STATION],
		)

	def test_the_workflows_of_a_till_are_the_ones_of_its_restaurants_stations(self):
		self.make_till("_Test Till A", self.a)
		with self.at_the_till_of("_Test Till A"):
			names = [station["name"] for station in restaurant_api.get_station_workflows()["stations"]]
		self.assertIn(self.station_a, names)
		self.assertNotIn(self.station_b, names)

	def test_a_kitchen_screen_opened_on_a_station_alone_lists_the_stations_of_its_restaurant(self):
		stations = restaurant_api.get_preparation_stations(station=self.station_b)
		self.assertEqual({station["restaurant"] for station in stations}, {self.b})
		self.assertEqual([station["name"] for station in stations], [self.station_b])

	def test_the_restaurant_in_the_address_of_a_kitchen_screen_wins_over_its_station(self):
		stations = restaurant_api.get_preparation_stations(restaurant=self.a, station=self.station_b)
		self.assertEqual([station["name"] for station in stations], [self.station_a])

	def test_cards_menus_and_tips_are_scoped(self):
		card_a, card_b = self.make_card(self.a, "_Test Card A"), self.make_card(self.b, "_Test Card B")
		menu_a, menu_b = self.make_menu(self.a, "_Test Menu A"), self.make_menu(self.b, "_Test Menu B")
		tip_a, tip_b = self.make_tip(self.a, 3, restaurant_table=self.table_a), self.make_tip(self.b, 4)
		cards = restaurant_api.get_active_cards(restaurant=self.a)
		self.assertEqual({c["restaurant"] for c in cards}, {self.a})
		self.assertIn(card_a, [c["name"] for c in cards])
		self.assertNotIn(card_b, [c["name"] for c in cards])
		menus = restaurant_api.get_active_menus(restaurant=self.b)
		self.assertEqual({m["restaurant"] for m in menus}, {self.b})
		self.assertEqual(([m["name"] for m in menus if m["name"] in (menu_a, menu_b)]), [menu_b])
		tips = restaurant_api.get_tips(restaurant=self.a)
		self.assertEqual({t["restaurant"] for t in tips["tips"]}, {self.a})
		self.assertIn(tip_a, [t["name"] for t in tips["tips"]])
		self.assertNotIn(tip_b, [t["name"] for t in tips["tips"]])
		# The label of the table, not its name, comes with the tip
		self.assertEqual([t["table_name"] for t in tips["tips"] if t["name"] == tip_a], [TABLE])

	def test_the_cards_of_a_till_are_the_ones_of_its_restaurant(self):
		card_a, card_b = self.make_card(self.a, "_Test Card A"), self.make_card(self.b, "_Test Card B")
		self.make_till("_Test Till B", self.b)
		with self.at_the_till_of("_Test Till B"):
			names = [c["name"] for c in restaurant_api.get_active_cards()]
		self.assertIn(card_b, names)
		self.assertNotIn(card_a, names)

	def test_the_guest_menu_is_a_card_of_the_restaurant(self):
		card_a = self.make_card(self.a, "_Test Guest Card A", is_guest_menu=1)
		card_b = self.make_card(self.b, "_Test Guest Card B", is_guest_menu=1)
		self.assertEqual(
			guest_ordering._get_guest_menu_card(settings.get_restaurant_settings(self.a)), card_a
		)
		self.assertEqual(
			guest_ordering._get_guest_menu_card(settings.get_restaurant_settings(self.b)), card_b
		)

	def test_created_rooms_and_stations_belong_to_the_restaurant_asked_or_the_tills(self):
		room = restaurant_api.create_area("Garden", restaurant=self.b)
		self.assertEqual(frappe.db.get_value("Restaurant Area", room["name"], "restaurant"), self.b)
		self.make_till("_Test Till A", self.a)
		with self.at_the_till_of("_Test Till A"):
			room = restaurant_api.create_area("Garden")
			station = restaurant_api.create_station("Pizza")
		self.assertEqual(frappe.db.get_value("Restaurant Area", room["name"], "restaurant"), self.a)
		self.assertEqual(frappe.db.get_value("Preparation Station", station["name"], "restaurant"), self.a)
		# A station drawn on a room is in that room's restaurant
		station = restaurant_api.create_station("Ice creams", area=self.room_b)
		self.assertEqual(frappe.db.get_value("Preparation Station", station["name"], "restaurant"), self.b)
		table = restaurant_api.create_table("T9", self.room_b)
		self.assertEqual(frappe.db.get_value("Restaurant Table", table["name"], "restaurant"), self.b)


class TestEachRestaurantHasItsOwnCards(TwoRestaurants, FrappeTestCase):
	"""What the card editor and the settings dialog list, and the card of the permanent items."""

	@property
	def plain(self):
		"""The name the first restaurant to ask gets, in the language of the user."""
		return frappe._("Permanent items")

	def permanent(self, restaurant):
		return restaurant_api.get_or_create_permanent_card(restaurant=restaurant)

	def names(self, cards):
		return [card["name"] for card in cards]

	def test_every_restaurant_gets_a_permanent_card_whoever_took_the_name_first(self):
		first, second = self.permanent(self.a), self.permanent(self.b)
		self.assertTrue(second["created"])
		self.assertNotEqual(first["name"], second["name"])
		for answer, restaurant in ((first, self.a), (second, self.b)):
			card = frappe.db.get_value(
				"Restaurant Card", answer["name"], ["restaurant", "is_permanent", "is_active"], as_dict=True
			)
			self.assertEqual((card.restaurant, card.is_permanent, card.is_active), (restaurant, 1, 1))

	def test_the_name_is_free_when_a_card_of_another_restaurant_already_has_the_plain_one(self):
		if not frappe.db.exists("Restaurant Card", self.plain):
			self.make_card(self.a, self.plain)
		answer = self.permanent(self.b)
		self.assertEqual(answer["name"], f"{self.plain} - _Test Restaurant B")
		self.assertEqual(frappe.db.get_value("Restaurant Card", answer["name"], "restaurant"), self.b)

	def test_the_name_is_still_free_when_even_the_restaurants_own_one_is_taken(self):
		for taken in (self.plain, f"{self.plain} - _Test Restaurant B"):
			if not frappe.db.exists("Restaurant Card", taken):
				self.make_card(self.a, taken)
		self.assertEqual(self.permanent(self.b)["name"], f"{self.plain} - _Test Restaurant B 2")

	def test_a_restaurant_asked_again_gets_the_same_card(self):
		first = self.permanent(self.b)
		again = self.permanent(self.b)
		self.assertEqual((again["name"], again["created"]), (first["name"], False))
		self.assertEqual(frappe.db.count("Restaurant Card", {"restaurant": self.b, "is_permanent": 1}), 1)

	def test_a_till_gets_the_permanent_card_of_its_own_restaurant(self):
		self.make_till("_Test Till B", self.b)
		with self.at_the_till_of("_Test Till B"):
			answer = restaurant_api.get_or_create_permanent_card()
		self.assertEqual(frappe.db.get_value("Restaurant Card", answer["name"], "restaurant"), self.b)

	def test_whoever_may_not_read_the_cards_gets_no_permanent_card(self):
		self.two_real_tills()
		frappe.set_user(OTHER_TILL)
		with self.assertRaises(frappe.PermissionError):
			self.permanent(self.b)

	def test_the_editor_lists_the_cards_of_the_restaurant_with_its_permanent_card(self):
		card_a, card_b = self.make_card(self.a, "_Test Card A"), self.make_card(self.b, "_Test Card B")
		permanent_b = self.permanent(self.b)["name"]
		cards = restaurant_api.get_restaurant_cards(restaurant=self.b)
		self.assertTrue({card_b, permanent_b} <= set(self.names(cards)))
		self.assertNotIn(card_a, self.names(cards))
		self.assertEqual({card["restaurant"] for card in cards}, {self.b})
		self.assertEqual([card["is_permanent"] for card in cards if card["name"] == permanent_b], [1])

	def test_a_card_that_names_no_restaurant_is_the_default_restaurants_in_the_editor(self):
		card = self.make_card(self.a, "_Test Card Legacy")
		frappe.db.set_value("Restaurant Card", card, "restaurant", None)
		with the_default_restaurant_is(self.a):
			self.assertIn(card, self.names(restaurant_api.get_restaurant_cards(restaurant=self.a)))
			self.assertNotIn(card, self.names(restaurant_api.get_restaurant_cards(restaurant=self.b)))

	def test_the_editor_of_a_till_lists_its_restaurants_cards(self):
		card_a, card_b = self.make_card(self.a, "_Test Card A"), self.make_card(self.b, "_Test Card B")
		self.make_till("_Test Till A", self.a)
		with self.at_the_till_of("_Test Till A"):
			names = self.names(restaurant_api.get_restaurant_cards())
		self.assertIn(card_a, names)
		self.assertNotIn(card_b, names)

	def test_the_settings_dialog_offers_the_active_cards_of_the_restaurant_that_are_not_permanent(self):
		active = self.make_card(self.a, "_Test Card Active")
		inactive = self.make_card(self.a, "_Test Card Inactive", is_active=0)
		other = self.make_card(self.b, "_Test Card Of The Other")
		permanent = self.permanent(self.a)["name"]
		offered = self.names(restaurant_api.get_restaurant_cards(restaurant=self.a, selectable_only=1))
		self.assertIn(active, offered)
		self.assertNotIn(inactive, offered)
		self.assertNotIn(permanent, offered)
		self.assertNotIn(other, offered)
		# The editor lists them all
		listed = self.names(restaurant_api.get_restaurant_cards(restaurant=self.a))
		self.assertTrue({active, inactive, permanent} <= set(listed))


class TestReservationsAreScoped(TwoRestaurants, FrappeTestCase):
	def test_reservations_are_the_restaurants(self):
		res_a = self.make_reservation(self.a, [self.table_a], guest="_Test Guest A")
		res_b = self.make_reservation(self.b, [self.table_b], guest="_Test Guest B")
		listed = reservations.get_reservations(restaurant=self.a)
		self.assertEqual({r["restaurant"] for r in listed}, {self.a})
		self.assertIn(res_a, [r["name"] for r in listed])
		self.assertNotIn(res_b, [r["name"] for r in listed])
		# The room is shown by its label
		tables = next(r for r in listed if r["name"] == res_a)["tables"]
		self.assertEqual([(t["table_name"], t["area_name"]) for t in tables], [(TABLE, ROOM)])

	def test_a_reservation_naming_no_restaurant_is_the_default_ones(self):
		res = self.make_reservation(self.a, [self.table_a])
		frappe.db.set_value("Restaurant Reservation", res, "restaurant", None)
		with patch.object(scope, "default_restaurant", return_value=self.a):
			self.assertIn(res, [r["name"] for r in reservations.get_reservations(restaurant=self.a)])
			self.assertNotIn(res, [r["name"] for r in reservations.get_reservations(restaurant=self.b)])
		with patch.object(scope, "default_restaurant", return_value=self.b):
			self.assertNotIn(res, [r["name"] for r in reservations.get_reservations(restaurant=self.a)])
			self.assertIn(res, [r["name"] for r in reservations.get_reservations(restaurant=self.b)])

	def test_the_statistics_count_the_restaurants_own_reservations(self):
		self.make_reservation(self.a, [self.table_a], no_of_guests=3)
		self.make_reservation(self.b, [self.table_b], no_of_guests=5)
		stats = reservations.get_reservation_stats(nowdate(), nowdate(), restaurant=self.a)
		self.assertEqual((stats["total"], stats["total_guests"]), (1, 3))

	def test_a_reservation_taken_at_a_till_is_in_the_restaurant_of_that_till(self):
		self.make_till("_Test Till B", self.b)
		with self.at_the_till_of("_Test Till B"):
			answer = reservations.create_reservation(
				nowdate(), "21:00:00", 2, "_Test Guest", tables=json.dumps([self.table_b])
			)
		self.assertEqual(frappe.db.get_value("Restaurant Reservation", answer["name"], "restaurant"), self.b)

	def test_an_overlap_names_the_table_by_its_label(self):
		self.make_reservation(self.a, [self.table_a], guest="_Test Guest A")
		asked = reservations.create_reservation(
			nowdate(), "20:30:00", 2, "_Test Guest", tables=json.dumps([self.table_a]), restaurant=self.a
		)
		self.assertEqual(asked["status"], "conflict")
		self.assertEqual([(c["table"], c["table_name"]) for c in asked["conflicts"]], [(self.table_a, TABLE)])
		with self.assertRaises(frappe.ValidationError) as refused:
			self.make_reservation(self.a, [self.table_a], guest="_Test Guest B")
		self.assertIn(TABLE, str(refused.exception))
		self.assertNotIn(self.table_a, str(refused.exception))

	def test_a_reservation_cannot_hold_the_table_of_another_restaurant(self):
		with self.assertRaises(frappe.ValidationError):
			self.make_reservation(self.a, [self.table_b])

	def test_the_online_booking_form_lists_the_tables_of_the_restaurant_named(self):
		frappe.db.set_value("Restaurant", self.a, BOOKING_ONLINE)
		frappe.db.set_value("Restaurant", self.b, BOOKING_ONLINE)
		frappe.clear_document_cache("Restaurant")
		tables = reservations.get_available_tables(nowdate(), "20:00:00", restaurant=self.b)["tables"]
		self.assertEqual({t["restaurant"] for t in tables}, {self.b})
		self.assertEqual(
			[(t["name"], t["table_name"], t["area_name"]) for t in tables], [(self.table_b, TABLE, ROOM)]
		)

	def book_online(self, table, restaurant):
		"""A visitor books `table` on the public form of `restaurant`."""
		frappe.db.set_value("Restaurant", restaurant, BOOKING_ONLINE)
		frappe.clear_document_cache("Restaurant")
		with patch.object(reservations, "_send_verification_email"):
			return reservations.submit_guest_reservation(
				add_days(nowdate(), 1),
				"20:00:00",
				2,
				"_Test Guest",
				"0000000000",
				"test-two-restaurants@yopmail.com",
				tables=json.dumps([table]),
				restaurant=restaurant,
			)

	def test_the_online_booking_form_refuses_the_table_of_another_restaurant(self):
		# The refusal is the table's: the form got as far as saving the reservation (the customer is made before)
		with self.assertRaises(frappe.ValidationError) as refused:
			self.book_online(self.table_b, self.a)
		self.assertIn(f"Table {TABLE} belongs to another restaurant", str(refused.exception))
		self.assertFalse(
			frappe.db.exists("Restaurant Reservation", {"email": "test-two-restaurants@yopmail.com"})
		)

	def test_the_online_booking_form_books_a_table_of_the_restaurant_asked(self):
		answer = self.book_online(self.table_a, self.a)
		self.assertEqual(answer["status"], "ok")
		reservation = frappe.get_doc("Restaurant Reservation", answer["name"])
		self.assertEqual(reservation.restaurant, self.a)
		self.assertEqual([row.restaurant_table for row in reservation.tables], [self.table_a])


class TestWhichRestaurantATillWorksFor(TwoRestaurants, FrappeTestCase):
	def test_a_till_belongs_to_the_restaurant_its_settings_name(self):
		self.make_till("_Test Till A", self.a)
		self.make_till("_Test Till B", self.b)
		self.assertEqual(settings.restaurant_for_profile("_Test Till A"), self.a)
		self.assertEqual(settings.restaurant_for_profile("_Test Till B"), self.b)
		self.assertEqual(scope.current_restaurant("_Test Till B"), self.b)
		with self.at_the_till_of("_Test Till A"):
			self.assertEqual(scope.current_restaurant(), self.a)
		# A profile named explicitly wins over the shift that is open
		with self.at_the_till_of("_Test Till A"):
			self.assertEqual(scope.current_restaurant("_Test Till B"), self.b)

	def test_no_till_belongs_to_the_default_restaurant_on_purpose(self):
		with patch.object(settings, "default_restaurant", return_value=self.b):
			self.assertEqual(settings.restaurant_for_profile(None), self.b)
			self.assertEqual(settings.restaurant_for_profile(""), self.b)
			with self.at_the_till_of(None):
				self.assertEqual(scope.current_restaurant(), self.b)

	def test_a_till_whose_settings_name_no_restaurant_belongs_to_none(self):
		self.make_till("_Test Till Retail", None, enable_restaurant_mode=0)
		with the_default_restaurant_is(self.b):
			# It is not a restaurant till: not the default restaurant's either, which only "no till at all" gets
			self.assertIsNone(settings.restaurant_for_profile("_Test Till Retail"))
			self.assertIsNone(scope.current_restaurant("_Test Till Retail"))
			self.assertEqual(settings.restaurant_for_profile(None), self.b)

	def test_a_profile_without_any_settings_belongs_to_none(self):
		with the_default_restaurant_is(self.b):
			self.assertIsNone(settings.restaurant_for_profile(NO_ONE))
			self.assertIsNone(scope.current_restaurant(NO_ONE))

	def test_a_till_whose_settings_are_disabled_belongs_to_none_and_has_no_takeaway_lane(self):
		# One row is read for both: the restaurant of a till and its other settings agree on whether it has settings
		self.make_till("_Test Till Off", self.a, enabled=0, enable_takeaway=1)
		self.assertIsNone(settings.restaurant_for_profile("_Test Till Off"))
		self.assertFalse(scope.till_settings("_Test Till Off", ["enable_takeaway"]).enable_takeaway)
		self.make_till("_Test Till On", self.a, enable_takeaway=1)
		self.assertEqual(settings.restaurant_for_profile("_Test Till On"), self.a)
		self.assertTrue(scope.till_settings("_Test Till On", ["enable_takeaway"]).enable_takeaway)

	def test_the_settings_and_the_lists_of_a_screen_come_from_the_same_restaurant(self):
		self.make_till("_Test Till B", self.b)
		self.make_till("_Test Till Retail", None, enable_restaurant_mode=0)
		with the_default_restaurant_is(self.a):
			for profile, expected in (("_Test Till B", self.b), ("_Test Till Retail", None), (None, self.a)):
				with self.subTest(till=profile), self.at_the_till_of(profile):
					self.assertEqual(scope.current_restaurant(), expected)
					self.assertEqual(settings.get_restaurant_settings().get("name"), expected)

	def test_a_user_whose_till_is_not_a_restaurant_till_sees_no_floor(self):
		self.make_till("_Test Till Retail", None, enable_restaurant_mode=0)
		with self.at_the_till_of("_Test Till Retail"):
			floor = restaurant_api.get_tables()
			stations = restaurant_api.get_preparation_stations()
			cards = restaurant_api.get_restaurant_cards()
		self.assertEqual((floor["tables"], floor["areas"], floor["stations"]), ([], [], []))
		self.assertEqual((stations, cards), ([], []))

	def test_a_guest_takeaway_token_without_a_till_reads_the_default_restaurants_settings(self):
		frappe.db.set_value("Restaurant", self.a, "enable_web_takeaway", 1)
		frappe.db.set_value("Restaurant", self.b, "enable_web_takeaway", 0)
		frappe.clear_document_cache("Restaurant")
		with a_request_from("127.0.0.1"):
			with patch.object(settings, "default_restaurant", return_value=self.a):
				self.assertEqual(guest_ordering._get_restaurant_settings().name, self.a)
				self.assertTrue(guest_ordering.create_takeaway_token()["token"])
			with patch.object(settings, "default_restaurant", return_value=self.b):
				self.assertEqual(guest_ordering._get_restaurant_settings().name, self.b)
				with self.assertRaises(frappe.ValidationError):
					guest_ordering.create_takeaway_token()

	def test_an_invoice_without_a_till_reads_the_default_restaurants_tip_settings(self):
		frappe.db.set_value("Restaurant", self.b, "enable_tips", 1)
		frappe.clear_document_cache("Restaurant")
		with patch.object(settings, "default_restaurant", return_value=self.b):
			self.assertEqual(invoices._restaurant_settings_of(frappe._dict()).name, self.b)
			self.assertTrue(invoices._restaurant_settings_of(frappe._dict(pos_profile=None)).enable_tips)

	def test_the_takeaway_flags_are_the_tills_own_row_not_a_stray_single(self):
		card = self.make_card(self.a, "_Test Takeaway Card")
		self.make_till("_Test Till A", self.a, enable_takeaway=1, takeaway_card=card)
		self.make_till("_Test Till B", self.b, enable_takeaway=0)
		# What a stray row of tabSingles says is no till's setting
		frappe.db.set_single_value("POS Settings", "enable_takeaway", 1)
		frappe.db.set_single_value("POS Settings", "takeaway_card", "A Card Of Nobody")
		with self.at_the_till_of("_Test Till A"):
			answer = restaurant_api.get_restaurant_settings(self.a)
		self.assertTrue(answer["enable_takeaway"])
		self.assertEqual(answer["takeaway_card"], card)
		with self.at_the_till_of("_Test Till B"):
			answer = restaurant_api.get_restaurant_settings(self.b)
		self.assertFalse(answer["enable_takeaway"])
		self.assertIsNone(answer["takeaway_card"])
		# A user with no open till has no takeaway lane
		with self.at_the_till_of(None):
			self.assertFalse(restaurant_api.get_restaurant_settings(self.a)["enable_takeaway"])

	def test_the_loyalty_flag_of_a_guest_session_is_its_tills_own(self):
		self.make_till("_Test Till A", self.a, enable_loyalty_program=1)
		self.make_till("_Test Till B", self.b, enable_loyalty_program=0)
		frappe.db.set_single_value("POS Settings", "enable_loyalty_program", 1)
		self.assertTrue(
			scope.till_settings("_Test Till A", ["enable_loyalty_program"]).enable_loyalty_program
		)
		self.assertFalse(
			scope.till_settings("_Test Till B", ["enable_loyalty_program"]).enable_loyalty_program
		)
		self.assertFalse(scope.till_settings(None, ["enable_loyalty_program"]).enable_loyalty_program)


class TestWhichRestaurantARecordBelongsTo(TwoRestaurants, FrappeTestCase):
	"""A record names its restaurant; one that names none is the default restaurant's, whatever else is asked."""

	def kept_by(self, restaurant, doctype="Restaurant Area"):
		return frappe.get_all(doctype, or_filters=scope.restaurant_or_filters(restaurant), pluck="name")

	def an_unattached_room(self):
		room = self.make_room(self.a, label="Orphan")
		frappe.db.set_value("Restaurant Area", room, "restaurant", None)
		return room

	def test_a_record_that_names_no_restaurant_is_the_default_ones_and_nobody_elses(self):
		room = self.an_unattached_room()
		with the_default_restaurant_is(self.a):
			self.assertIn(room, self.kept_by(self.a))
			self.assertNotIn(room, self.kept_by(self.b))

	def test_a_till_that_belongs_to_no_restaurant_keeps_no_record_on_a_site_that_has_restaurants(self):
		room = self.an_unattached_room()
		with the_default_restaurant_is(self.a):
			self.assertEqual(self.kept_by(None), [])
			self.assertNotIn(room, self.kept_by(None))

	def test_on_a_site_without_any_restaurant_the_records_that_name_none_are_kept(self):
		room = self.an_unattached_room()
		with the_default_restaurant_is(None):
			self.assertIn(room, self.kept_by(None))
			self.assertNotIn(self.room_a, self.kept_by(None))

	def test_the_restaurant_of_a_record_is_the_one_it_names_else_the_default_one(self):
		with the_default_restaurant_is(self.a):
			self.assertEqual(scope.restaurant_of_record("Restaurant Table", self.table_b), self.b)
			# A record that is gone, and no record at all, are the default restaurant's: the link validation says
			# the record does not exist, not this lookup
			self.assertEqual(scope.restaurant_of_record("Restaurant Table", "no such table"), self.a)
			self.assertEqual(scope.restaurant_of_record("Restaurant Table", None), self.a)

	def test_an_order_belongs_to_the_restaurant_of_its_table_else_of_its_till_else_to_the_default_one(self):
		self.make_till("_Test Till B", self.b)
		self.make_till("_Test Till Retail", None, enable_restaurant_mode=0)
		orders = [
			# A takeaway order of a till that is not a restaurant till names no restaurant: the default one's
			frappe._dict(name="ORDER-RETAIL", restaurant_table=None, pos_profile="_Test Till Retail"),
			frappe._dict(name="ORDER-TILL-B", restaurant_table=None, pos_profile="_Test Till B"),
			frappe._dict(name="ORDER-NO-TILL", restaurant_table=None, pos_profile=None),
			# The table decides, whatever the till
			frappe._dict(
				name="ORDER-TABLE-B", restaurant_table=self.table_b, pos_profile="_Test Till Retail"
			),
		]

		def kept(restaurant):
			return {order.name for order in scope.keep_orders_of(orders, restaurant)}

		with the_default_restaurant_is(self.a):
			self.assertEqual(kept(self.a), {"ORDER-RETAIL", "ORDER-NO-TILL"})
			self.assertEqual(kept(self.b), {"ORDER-TILL-B", "ORDER-TABLE-B"})
			# A till that belongs to no restaurant keeps no order
			self.assertEqual(kept(None), set())
		# A site without any restaurant has no default one: what names none is all there is to keep
		with the_default_restaurant_is(None):
			self.assertEqual(kept(None), {"ORDER-RETAIL", "ORDER-NO-TILL"})


class TestTheTillTellsItsRestaurant(TwoRestaurants, FrappeTestCase):
	def test_the_hook_that_names_the_restaurant_is_registered(self):
		self.assertIn(
			"pos_next.restaurant.scope.extend_bootstrap_settings",
			frappe.get_hooks("pos_next_bootstrap_settings"),
		)
		self.assertIn("restaurant", POS_SETTINGS_FIELDS)
		self.assertEqual(DEFAULT_POS_SETTINGS["restaurant"], "")
		self.assertEqual(DEFAULT_POS_SETTINGS["restaurant_name"], "")

	def test_the_settings_of_a_till_carry_its_restaurant_and_its_label(self):
		answer = {"restaurant": self.a}
		scope.extend_bootstrap_settings(answer, "_Test Till A")
		self.assertEqual((answer["restaurant"], answer["restaurant_name"]), (self.a, "_Test Restaurant A"))
		answer = {"restaurant": None}
		scope.extend_bootstrap_settings(answer)
		self.assertEqual((answer["restaurant"], answer["restaurant_name"]), ("", ""))

	def test_every_way_the_till_reads_its_settings_names_its_restaurant(self):
		fx = self.two_real_tills()
		self.make_till(fx.profile, self.b)
		expected = (self.b, "_Test Restaurant B")
		profile = frappe.get_doc("POS Profile", fx.profile)
		for source, read in (
			("bootstrap", lambda: bootstrap._get_pos_settings(profile)),
			("the profile's settings", lambda: pos_profile.get_pos_settings(fx.profile)),
			("the settings dialog", lambda: get_pos_settings(fx.profile)),
		):
			with self.subTest(source=source):
				answer = read()
				self.assertEqual((answer["restaurant"], answer["restaurant_name"]), expected)


class TestOrdersBelongToTheRestaurantOfTheirTable(TwoRestaurants, FrappeTestCase):
	"""Draft orders on a table, and takeaway orders, as the till saves them."""

	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.make_till(self.fx.profile, self.a, enable_takeaway=1)
		self.make_till(self.fx.other_profile, self.b, enable_takeaway=1)
		self.table_a_order = self.draft(self.fx.profile, restaurant_table=self.table_a)
		self.table_b_order = self.draft(self.fx.other_profile, restaurant_table=self.table_b)
		self.takeaway_a = self.draft(self.fx.profile, is_takeaway=1, takeaway_number="T-901")
		self.takeaway_b = self.draft(self.fx.other_profile, is_takeaway=1, takeaway_number="T-902")

	def draft(self, profile, **changes):
		"""A draft saved the way the till saves one, its lines sent to the kitchen."""
		payload = _sale(self.fx, pos_profile=profile, **changes)
		name = invoices.update_invoice(json.dumps(payload))["name"]
		frappe.db.set_value("Sales Invoice Item", {"parent": name}, "kds_status", "Pending")
		return name

	def names(self, orders):
		return {order["name"] for order in orders}

	def test_the_kitchen_screen_shows_the_orders_of_its_restaurant(self):
		mine = self.names(restaurant_api.get_kds_orders(restaurant=self.a))
		self.assertTrue({self.table_a_order, self.takeaway_a} <= mine)
		self.assertFalse({self.table_b_order, self.takeaway_b} & mine)
		theirs = self.names(restaurant_api.get_kds_orders(restaurant=self.b))
		self.assertTrue({self.table_b_order, self.takeaway_b} <= theirs)
		self.assertFalse({self.table_a_order, self.takeaway_a} & theirs)

	def test_a_kitchen_screen_opened_on_a_station_shows_the_restaurant_of_that_station(self):
		doc = frappe.get_doc("Preparation Station", self.station_b)
		doc.append("items", {"item": self.fx.item})
		doc.save(ignore_permissions=True)
		orders = restaurant_api.get_kds_orders(station=self.station_b)
		self.assertEqual(self.names(orders), {self.table_b_order, self.takeaway_b})
		# The lines name their station by label, the order its table by label
		self.assertEqual({line["station_name"] for order in orders for line in order["items"]}, {STATION})
		table_order = next(order for order in orders if order["name"] == self.table_b_order)
		self.assertEqual(table_order["table_display_name"], TABLE)

	def test_the_runner_shows_the_ready_orders_of_its_restaurant(self):
		for order in (self.table_a_order, self.table_b_order):
			frappe.db.set_value("Sales Invoice Item", {"parent": order}, "kds_status", "Ready")
		mine = restaurant_api.get_runner_orders(restaurant=self.a)
		self.assertEqual(self.names(mine) & {self.table_a_order, self.table_b_order}, {self.table_a_order})
		self.assertEqual(
			next(o for o in mine if o["name"] == self.table_a_order)["table_display_name"], TABLE
		)
		theirs = restaurant_api.get_runner_orders(restaurant=self.b)
		self.assertEqual(self.names(theirs) & {self.table_a_order, self.table_b_order}, {self.table_b_order})

	def test_the_takeaway_screen_shows_the_takeaway_orders_of_its_restaurant(self):
		mine = self.names(restaurant_api.get_takeaway_orders(restaurant=self.a))
		self.assertTrue(self.takeaway_a in mine and self.takeaway_b not in mine)
		theirs = self.names(restaurant_api.get_takeaway_orders(restaurant=self.b))
		self.assertTrue(self.takeaway_b in theirs and self.takeaway_a not in theirs)

	def test_resetting_the_tables_of_a_restaurant_clears_its_orders_only(self):
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Occupied")
		frappe.db.set_value("Restaurant Table", self.table_b, "status", "Occupied")
		restaurant_api.reset_all_tables(restaurant=self.a)
		self.assertIsNone(frappe.db.get_value("Sales Invoice", self.table_a_order, "restaurant_table"))
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", self.table_b_order, "restaurant_table"), self.table_b
		)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_b, "status"), "Occupied")

	def test_the_alert_of_a_guest_event_names_the_restaurant_of_its_table(self):
		with patch.object(frappe, "publish_realtime") as published:
			guest_ordering._publish_to_the_tills(
				"guest_order_submitted", self.table_b, {"table": self.table_b}
			)
		published.assert_called_once_with(
			"guest_order_submitted", {"restaurant": self.b, "table": self.table_b}
		)

	def test_a_table_that_names_no_restaurant_is_announced_for_the_default_one(self):
		frappe.db.set_value("Restaurant Table", self.table_a, "restaurant", None)
		with (
			the_default_restaurant_is(self.b),
			patch.object(frappe, "publish_realtime") as published,
		):
			guest_ordering._publish_to_the_tills("guest_payment_received", self.table_a, {})
		self.assertEqual(published.call_args.args[1]["restaurant"], self.b)

	def test_every_alert_a_guest_order_sends_to_the_tills_names_its_restaurant(self):
		token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_b,
				"pos_profile": self.fx.other_profile,
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value(
			"Restaurant", self.b, {"enable_qr_ordering": 1, "qr_order_validation": "Server Approval"}
		)
		frappe.clear_document_cache("Restaurant")
		with patch.object(frappe, "publish_realtime") as published:
			guest_ordering.submit_guest_order(
				token.token, json.dumps([{"item_code": self.fx.item, "qty": 1, "rate": 5}])
			)
		sent = {call.args[0]: call.args[1] for call in published.call_args_list if len(call.args) > 1}
		for event in ("guest_order_submitted", "guest_order_pending"):
			with self.subTest(event=event):
				self.assertEqual(sent[event]["restaurant"], self.b)
				self.assertEqual(sent[event]["table"], self.table_b)

	def test_the_guest_page_shows_the_label_of_the_room_and_the_loyalty_of_its_till(self):
		token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_a,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)
		# A stray row of tabSingles says yes; the till of the session says no
		frappe.db.set_single_value("POS Settings", "enable_loyalty_program", 1)
		answer = guest_ordering.validate_token(token.token)
		self.assertEqual((answer["table"]["table_name"], answer["table"]["area_name"]), (TABLE, ROOM))
		self.assertFalse(answer["has_loyalty_program"])
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_loyalty_program", 1)
		self.assertTrue(guest_ordering.validate_token(token.token)["has_loyalty_program"])

	def test_a_tip_of_a_till_that_is_not_a_restaurant_till_is_the_default_restaurants(self):
		self.make_till(self.fx.profile, None, enable_restaurant_mode=0)
		with the_default_restaurant_is(self.b):
			tip = self.make_tip(None, 2, sales_invoice=self.takeaway_a)
		self.assertEqual(frappe.db.get_value("Restaurant Tip", tip, "restaurant"), self.b)

	def test_a_tip_is_recorded_in_the_restaurant_whose_settings_priced_it(self):
		frappe.db.set_value("Restaurant", self.a, {"enable_tips": 1, "tip_item": self.fx.item})
		frappe.clear_document_cache("Restaurant")
		invoice = frappe.get_doc("Sales Invoice", self.table_a_order)
		invoices._add_tip_to_invoice(invoice, 2, {"restaurant_table": self.table_a})
		tips = frappe.get_all(
			"Restaurant Tip", filters={"sales_invoice": invoice.name}, fields=["restaurant", "amount"]
		)
		self.assertEqual([(t.restaurant, t.amount) for t in tips], [(self.a, 2)])


class TestTheMenuCardCarriesItsRestaurant(TwoRestaurants, FrappeTestCase):
	def test_the_preview_data_names_the_restaurant_and_its_logo(self):
		card = self.make_card(self.a, "_Test Card A")
		data = menu_pdf.get_menu_preview_data(card)
		self.assertEqual(data["restaurant"], self.a)
		self.assertEqual(data["restaurant_name"], "_Test Restaurant A")
		self.assertEqual(data["logo"], "/files/_test_restaurant_a.png")

	def test_a_restaurant_without_a_logo_says_so(self):
		card = self.make_card(self.b, "_Test Card B")
		data = menu_pdf.get_menu_preview_data(card)
		self.assertEqual((data["restaurant_name"], data["logo"]), ("_Test Restaurant B", ""))

	def test_the_printed_header_shows_them(self):
		card = self.make_card(self.a, "_Test Card A")
		html = menu_pdf.get_menu_preview_html(card_name=card)
		self.assertIn("_Test Restaurant A", html)
		self.assertIn("/files/_test_restaurant_a.png", html)

	def test_several_cards_on_one_sheet_carry_the_restaurant_of_the_first(self):
		card_a, card_b = self.make_card(self.a, "_Test Card A"), self.make_card(self.a, "_Test Card A2")
		html = menu_pdf.get_menu_preview_html(card_names=json.dumps([card_a, card_b]))
		self.assertIn("_Test Restaurant A", html)
		self.assertIn("/files/_test_restaurant_a.png", html)


class TestExistingRecordsJoinTheDefaultRestaurant(FrappeTestCase):
	"""The patch, on a site that has no restaurant yet, or that has one and records which name none."""

	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		self.company = company[0]
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		# The restaurants of the clone are deleted below: nothing that commits may make that stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		# The clone of a working site already holds the restaurants its own migration made: start from none
		for name in frappe.get_all("Restaurant", pluck="name"):
			frappe.delete_doc("Restaurant", name, force=True, ignore_permissions=True)
		self.legacy = self.make_legacy_records()

	def make_legacy_records(self):
		"""Records as a site made them before the restaurants existed: none of them names a restaurant."""
		legacy = frappe._dict()
		legacy.area = self.insert("Restaurant Area", area_name="Room 1")
		legacy.table = self.insert("Restaurant Table", table_name="T1", area=legacy.area)
		legacy.station = self.insert("Preparation Station", station_name="Kitchen")
		legacy.card = self.insert("Restaurant Card", card_name="_Test Legacy Card", is_active=1)
		legacy.menu = self.insert("Restaurant Menu", menu_name="_Test Legacy Menu", price=20)
		legacy.reservation = self.insert(
			"Restaurant Reservation",
			status="Confirmed",
			reservation_date=nowdate(),
			reservation_time="20:00:00",
			duration=5400,
			no_of_guests=2,
			guest_name="_Test Guest",
		)
		legacy.tip = self.insert("Restaurant Tip", amount=3)
		for doctype, name in legacy.items():
			self.assertFalse(
				frappe.db.get_value(self.doctype_of(doctype), name, "restaurant"),
				f"{doctype} should name no restaurant",
			)
		return legacy

	def doctype_of(self, key):
		return LEGACY_DOCTYPES[key]

	def insert(self, doctype, **values):
		"""A record naming no restaurant: with none on the site, the controllers have none to default to."""
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def restaurant_of(self, key):
		return frappe.db.get_value(self.doctype_of(key), self.legacy[key], "restaurant")

	def a_till_in_restaurant_mode(self, profile="_Test Legacy Till"):
		doc = frappe.get_doc(
			{"doctype": "POS Settings", "pos_profile": profile, "enabled": 1, "enable_restaurant_mode": 1}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True).name

	def test_existing_records_join_the_default_restaurant(self):
		execute()  # attach patch
		self.assertFalse(frappe.db.count("Restaurant Area", {"restaurant": ["is", "not set"]}))
		default = settings.default_restaurant()
		self.assertTrue(default)
		for key in LEGACY_DOCTYPES:
			with self.subTest(record=key):
				self.assertEqual(self.restaurant_of(key), default)

	def test_the_default_restaurant_is_made_when_only_the_records_need_one(self):
		execute()
		restaurants = frappe.get_all("Restaurant", fields=["name", "restaurant_name", "company"])
		self.assertEqual(len(restaurants), 1)
		self.assertEqual(restaurants[0].restaurant_name, settings.default_company())
		self.assertEqual(restaurants[0].company, settings.default_company())

	def test_every_till_in_restaurant_mode_ends_with_a_restaurant(self):
		# No record at all: a site whose restaurant mode is on but which never used the rest of the module
		for key, doctype in LEGACY_DOCTYPES.items():
			frappe.delete_doc(doctype, self.legacy[key], force=True, ignore_permissions=True)
		till = self.a_till_in_restaurant_mode()
		self.assertFalse(frappe.db.count("Restaurant"))
		execute()
		restaurant = frappe.db.get_value("POS Settings", till, "restaurant")
		self.assertTrue(restaurant)
		self.assertEqual(restaurant, settings.default_restaurant())
		self.assertEqual(frappe.db.count("Restaurant"), 1)
		# ... and its settings can be saved again
		doc = frappe.get_doc("POS Settings", till)
		doc.flags.ignore_links = True
		doc.silent_print = 1
		doc.save(ignore_permissions=True)

	def test_a_till_that_is_not_in_restaurant_mode_is_left_alone(self):
		for key, doctype in LEGACY_DOCTYPES.items():
			frappe.delete_doc(doctype, self.legacy[key], force=True, ignore_permissions=True)
		doc = frappe.get_doc({"doctype": "POS Settings", "pos_profile": "_Test Counter Till", "enabled": 1})
		doc.flags.ignore_links = True
		till = doc.insert(ignore_permissions=True).name
		execute()
		self.assertFalse(frappe.db.get_value("POS Settings", till, "restaurant"))
		self.assertFalse(frappe.db.count("Restaurant"))

	def test_the_patch_gives_the_records_the_restaurant_a_site_already_has(self):
		existing = frappe.get_doc(
			{"doctype": "Restaurant", "restaurant_name": "_Test Restaurant Existing", "company": self.company}
		).insert(ignore_permissions=True)
		execute()
		self.assertEqual(frappe.db.count("Restaurant"), 1)
		self.assertEqual(self.restaurant_of("table"), existing.name)

	def test_a_site_whose_restaurants_are_all_off_gets_no_new_one(self):
		first = frappe.get_doc(
			{
				"doctype": "Restaurant",
				"restaurant_name": "_Test Restaurant Off 1",
				"company": self.company,
				"enabled": 0,
			}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "Restaurant",
				"restaurant_name": "_Test Restaurant Off 2",
				"company": self.company,
				"enabled": 0,
			}
		).insert(ignore_permissions=True)
		self.assertIsNone(settings.default_restaurant())
		execute()
		self.assertEqual(frappe.db.count("Restaurant"), 2)
		self.assertEqual(self.restaurant_of("area"), first.name)

	def test_the_patch_runs_twice_without_changing_anything(self):
		till = self.a_till_in_restaurant_mode()
		execute()
		restaurants = frappe.db.count("Restaurant")
		snapshot = {key: self.restaurant_of(key) for key in LEGACY_DOCTYPES}
		execute()
		self.assertEqual(frappe.db.count("Restaurant"), restaurants)
		self.assertEqual({key: self.restaurant_of(key) for key in LEGACY_DOCTYPES}, snapshot)
		self.assertTrue(frappe.db.get_value("POS Settings", till, "restaurant"))

	def test_the_cached_documents_know_their_restaurant_once_the_patch_has_run(self):
		# The cache is read first, as a worker that served the site before the patch would have: it holds no restaurant
		self.assertFalse(frappe.get_cached_doc("Preparation Station", self.legacy.station).restaurant)
		self.assertFalse(frappe.get_cached_doc("Restaurant Table", self.legacy.table).restaurant)
		till = self.a_till_in_restaurant_mode()
		self.assertFalse(frappe.get_cached_doc("POS Settings", till).restaurant)
		execute()
		default = settings.default_restaurant()
		self.assertEqual(
			frappe.get_cached_doc("Preparation Station", self.legacy.station).restaurant, default
		)
		self.assertEqual(frappe.get_cached_doc("Restaurant Table", self.legacy.table).restaurant, default)
		self.assertEqual(frappe.get_cached_doc("POS Settings", till).restaurant, default)

	def test_a_table_whose_room_is_gone_still_gets_the_default_restaurant(self):
		frappe.delete_doc("Restaurant Area", self.legacy.area, force=True, ignore_permissions=True)
		execute()
		self.assertTrue(self.restaurant_of("table"))

	def test_records_that_already_name_a_restaurant_keep_it(self):
		other = frappe.get_doc(
			{"doctype": "Restaurant", "restaurant_name": "_Test Restaurant Other", "company": self.company}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Restaurant Card", self.legacy.card, "restaurant", other.name)
		# The default restaurant is the only one or the oldest enabled one: the other is the newer
		frappe.db.set_value("Restaurant", other.name, "creation", add_days(nowdate(), 1))
		first = frappe.get_doc(
			{"doctype": "Restaurant", "restaurant_name": "_Test Restaurant First", "company": self.company}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Restaurant", first.name, "creation", add_days(nowdate(), -1))
		execute()
		self.assertEqual(self.restaurant_of("card"), other.name)
		self.assertEqual(self.restaurant_of("area"), first.name)
