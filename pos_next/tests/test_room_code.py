# //// Neoffice — added file (no upstream equivalent).
"""The short code of a room (NeoResto lot 1, task 38b, rulings 124 and 126).

A kitchen can feed several rooms, so a ticket opens with the room as a small chip: « S01 · Table 15 · 0007 ». The code is
typed on the room (`Restaurant Area.short_code`, from the floor plan's room dialog) and, when it is not, derived from the
room's name. The derivation is written twice, in Python here and in JavaScript for the screen's fallback
(`POS/src/utils/kitchenRoomCode.js`); both are tested against ONE table of examples, `room_code_cases.json`, so that they
cannot drift apart. The rest pins what the server tells the screens: `area_code` with the rooms, the tables, the kitchen's
orders, the runner's and the takeaway's.
"""

import json
import os

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant.room_code import derived_room_code, room_code
from pos_next.tests.test_ticket_numbers import TicketCase

CASES = os.path.join(os.path.dirname(__file__), "room_code_cases.json")


class TestTheDerivationOfTheCode(FrappeTestCase):
	def test_every_example_of_the_shared_table_gives_its_code(self):
		with open(CASES, encoding="utf-8") as table:
			cases = json.load(table)["cases"]

		self.assertGreaterEqual(len(cases), 20)
		for case in cases:
			with self.subTest(name=case["name"], takeaway=case.get("takeaway", False)):
				self.assertEqual(derived_room_code(case["name"], takeaway=case.get("takeaway", False)), case["code"])

	def test_the_table_holds_the_examples_of_the_client_spec(self):
		# The cases of POS/src/utils/__tests__/kitchenRoomCode.spec.js, each of which must stay in the shared table
		with open(CASES, encoding="utf-8") as table:
			names = {case["name"] for case in json.load(table)["cases"]}

		for name in ("Salle 1", "Salle 2", "Salle 12", "Salle 100", "Étage 1", "Terrasse 2", "Salle 3 - côté jardin 2"):
			self.assertIn(name, names)
		for name in ("Terrasse", "Bar", "Étage", "Salle des fêtes", "Cœur", "Ba", "Salle", "3", "", "   ", "---"):
			self.assertIn(name, names)

	def test_the_code_typed_on_the_room_wins_in_capitals(self):
		self.assertEqual(room_code("sal1", "Salle 1"), "SAL1")
		self.assertEqual(room_code("  ter ", "Terrasse"), "TER")

	def test_a_room_that_typed_none_takes_the_one_its_name_gives(self):
		self.assertEqual(room_code("", "Salle 2"), "S02")
		self.assertEqual(room_code(None, "Terrasse"), "TER")
		self.assertEqual(room_code(None, None), "")

	def test_a_takeaway_is_emp_whatever_the_room_says(self):
		self.assertEqual(room_code("SAL1", "Salle 1", takeaway=True), "EMP")


class TestWhatTheScreensAreToldOfTheRoom(TicketCase):
	"""`area_code` beside the rooms, the tables, the kitchen's orders and the takeaway's."""

	def setUp(self):
		super().setUp()
		self.garden = self.make_room(self.a, label="Garden", short_code="gar")

	def order_at(self, table, **changes):
		order = self.save(restaurant_table=table, **changes)
		for line in frappe.get_all("Sales Invoice Item", filters={"parent": order.name}, pluck="name"):
			frappe.db.set_value(
				"Sales Invoice Item", line, {"preparation_station": self.station_a, "kds_status": "Pending"}
			)
		return order

	def test_a_code_typed_on_the_room_is_kept_in_capitals(self):
		self.assertEqual(frappe.db.get_value("Restaurant Area", self.garden, "short_code"), "GAR")

	def test_the_rooms_and_their_tables_carry_the_code(self):
		table = self.make_table(self.a, self.garden, table_name="G1")

		told = restaurant_api.get_tables(restaurant=self.a)
		codes = {area["name"]: area["area_code"] for area in told["areas"]}
		table_codes = {t["name"]: t["area_code"] for t in told["tables"]}

		self.assertEqual(codes, {self.room_a: derived_room_code("Room 1"), self.garden: "GAR"})
		self.assertEqual(table_codes[table], "GAR")
		self.assertEqual(table_codes[self.table_a], derived_room_code("Room 1"))
		# The typed value is told as it is, for the room dialog
		self.assertEqual({a["name"]: a.get("short_code") for a in told["areas"]}[self.garden], "GAR")

	def test_the_kitchen_orders_carry_the_code_of_their_table_room(self):
		garden_table = self.make_table(self.a, self.garden, table_name="G1")
		in_room = self.order_at(self.table_a)
		in_garden = self.order_at(garden_table)

		told = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}

		self.assertEqual(told[in_room.name]["area_code"], derived_room_code("Room 1"))
		self.assertEqual(told[in_garden.name]["area_code"], "GAR")

	def test_a_takeaway_order_of_the_kitchen_and_of_the_takeaway_screen_has_emp(self):
		takeaway = self.save(is_takeaway=1, takeaway_number="T-001")
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": takeaway.name},
			{"preparation_station": self.station_a, "kds_status": "Pending"},
		)

		kitchen = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		takeaway_screen = {o["name"]: o for o in restaurant_api.get_takeaway_orders(restaurant=self.a)}

		self.assertEqual(kitchen[takeaway.name]["area_code"], "EMP")
		self.assertEqual(takeaway_screen[takeaway.name]["area_code"], "EMP")

	def test_renaming_a_room_can_set_its_code_or_give_it_back_to_the_name(self):
		restaurant_api.rename_area(self.room_a, "Salle 7", short_code="rdc")
		self.assertEqual(frappe.db.get_value("Restaurant Area", self.room_a, "short_code"), "RDC")

		# Without a code in the call, the room keeps the one it has
		restaurant_api.rename_area(self.room_a, "Salle 8")
		self.assertEqual(frappe.db.get_value("Restaurant Area", self.room_a, "short_code"), "RDC")

		# An empty one gives it back to the name
		restaurant_api.rename_area(self.room_a, "Salle 8", short_code="")
		self.assertEqual(frappe.db.get_value("Restaurant Area", self.room_a, "short_code"), "")
		area = {a["name"]: a for a in restaurant_api.get_tables(restaurant=self.a)["areas"]}[self.room_a]
		self.assertEqual(area["area_code"], "S08")

	def test_a_code_longer_than_six_characters_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.rename_area(self.room_a, "Salle 1", short_code="TOOLONGCODE")
