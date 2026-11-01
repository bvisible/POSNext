# //// Neoffice — added file (no upstream equivalent).
"""The send path of a restaurant that prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11: « Oui, les deux modes »).

In the room's rhythm (the default) « Valider » sends the drinks and the first food course and holds the others back (`Waiting`). Where the
restaurant prepares ahead, EVERYTHING leaves: a food line that would have been held leaves marked `kds_ahead`, so that the kitchen may start it,
and the room's call (`kds_called_at`, stamped by `restaurant.call_next_course`) later tells the kitchen to serve it now. The suite pins:

- what a save does with each line in either rhythm, and that a takeaway and a counter order are never sent ahead;
- that a line sent ahead keeps its mark, and the call of its course, through every later save (the document is rebuilt from a payload that
  carries neither), and that a line of the till is never sent ahead by the till's word alone;
- where a line added later goes: with the course that is not called, ahead; at once when its course is called;
- that the time a line counts from is the call for a line sent ahead and the departure for any other, on the kitchen's and the runner's lists.

The suite builds everything it needs (the menu of `test_service_families`, two restaurants, a till) and rolls back.
"""

import json

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import CAKES, DRINKS, KITCHEN, STARTERS, ServiceCase

AHEAD = "Prepared ahead"
CALLED = "Called by the room"
CALL = "2026-11-01 19:00:00"


class RhythmCase(ServiceCase):
	rhythm = AHEAD

	def setUp(self):
		super().setUp()
		frappe.db.set_value("Restaurant", self.a, "service_rhythm", self.rhythm)

	def first_round(self):
		"""A drink, a starter, a main and a dessert at once."""
		return self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)]
		)

	def the_cart(self, mains="Pending", desserts="Pending", *more):
		"""The cart of the first round as the till holds it once the order is saved, with what is added to it."""
		return [
			self.line(self.cola, "Pending", service_family="Drink"),
			self.line(self.soup, "Pending", service_family="Starter"),
			self.line(self.penne, mains, service_family="Main"),
			self.line(self.tart, desserts, service_family="Dessert"),
			*more,
		]

	def stored(self, order):
		"""(item, status, ahead, called_at) of each line, in the order of the lines."""
		return [
			(row.item_code.replace("_Test SF ", ""), row.kds_status, int(row.kds_ahead or 0), row.kds_called_at)
			for row in frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": order},
				fields=["item_code", "kds_status", "kds_ahead", "kds_called_at"],
				order_by="idx asc",
			)
		]

	def call(self, order, *items):
		"""The room calls the course of these items (what `call_next_course` stamps), at a time of the test's own."""
		for item in items:
			frappe.db.set_value(
				"Sales Invoice Item",
				{"parent": order, "item_code": item},
				"kds_called_at",
				CALL,
				update_modified=False,
			)


class TestWhereTheKitchenPreparesAhead(RhythmCase):
	def test_everything_leaves_and_the_later_courses_are_marked_ahead(self):
		order = self.first_round()

		self.assertEqual(
			[(item, status, ahead) for item, status, ahead, _called in self.stored(order)],
			[
				("Cola", "Pending", 0),
				("Soup", "Pending", 0),
				("Penne", "Pending", 1),
				("Tart", "Pending", 1),
			],
		)

	def test_a_line_sent_ahead_has_its_departure_but_no_call(self):
		order = self.first_round()

		times = frappe.get_all(
			"Sales Invoice Item", filters={"parent": order}, fields=["kds_sent_at"], order_by="idx asc"
		)
		self.assertTrue(all(row.kds_sent_at for row in times), "every line left, so every line has its time")
		self.assertEqual(len({row.kds_sent_at for row in times}), 1, "one save, one time")
		self.assertEqual([called for *_rest, called in self.stored(order)], [None] * 4)

	def test_no_starter_sends_the_mains_with_the_drinks_and_the_dessert_ahead(self):
		order = self.save([self.line(self.cola), self.line(self.penne), self.line(self.tart)])

		self.assertEqual(
			[(item, ahead) for item, _status, ahead, _called in self.stored(order)],
			[("Cola", 0), ("Penne", 0), ("Tart", 1)],
		)

	def test_a_takeaway_and_a_counter_order_send_everything_and_none_ahead(self):
		for changes in (
			{"restaurant_table": None, "is_takeaway": 1, "takeaway_number": "T-001"},
			{"restaurant_table": None},
		):
			with self.subTest(changes=changes):
				order = self.save(
					[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)],
					**changes,
				)
				self.assertEqual(
					[(status, ahead) for _item, status, ahead, _called in self.stored(order)],
					[("Pending", 0)] * 4,
				)

	def test_a_site_that_sets_no_family_sends_everything_as_before(self):
		for group in (DRINKS, KITCHEN, STARTERS, CAKES):
			frappe.db.set_value("Item Group", group, "service_family", "")
		order = self.first_round()

		self.assertEqual(
			[(status, ahead) for _item, status, ahead, _called in self.stored(order)], [("Pending", 0)] * 4
		)

	def test_a_line_the_waiter_held_by_hand_stays_held(self):
		order = self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Waiting", service_family="Main"),
				self.line(self.tart),
			]
		)

		self.assertEqual(
			[(item, status, ahead) for item, status, ahead, _called in self.stored(order)],
			[("Soup", "Pending", 0), ("Penne", "Waiting", 0), ("Tart", "Pending", 1)],
		)


class TestTheRoomsRhythmIsUntouched(RhythmCase):
	rhythm = CALLED

	def test_the_later_courses_are_held_back_and_none_is_marked_ahead(self):
		order = self.first_round()

		self.assertEqual(
			[(item, status, ahead) for item, status, ahead, _called in self.stored(order)],
			[
				("Cola", "Pending", 0),
				("Soup", "Pending", 0),
				("Penne", "Waiting", 0),
				("Tart", "Waiting", 0),
			],
		)

	def test_the_till_cannot_send_a_line_ahead_in_the_rooms_rhythm(self):
		order = self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Pending", service_family="Main", kds_ahead=1),
			]
		)

		self.assertEqual([ahead for _item, _status, ahead, _called in self.stored(order)], [0, 0])


class TestALineKeepsItsMarkAndItsCall(RhythmCase):
	def test_a_later_save_keeps_the_mark_of_every_line_sent_ahead(self):
		order = self.first_round()

		self.save(self.the_cart(), name=order)

		self.assertEqual(
			[ahead for _item, _status, ahead, _called in self.stored(order)], [0, 0, 1, 1]
		)

	def test_a_later_save_keeps_the_call_the_cart_does_not_carry(self):
		order = self.first_round()
		self.call(order, "_Test SF Penne")

		self.save(self.the_cart(), name=order)

		self.assertEqual(
			[(item, ahead, called) for item, _status, ahead, called in self.stored(order)][2:],
			[("Penne", 1, frappe.utils.get_datetime(CALL)), ("Tart", 1, None)],
		)

	def test_the_departure_of_a_line_sent_ahead_is_kept_too(self):
		order = self.first_round()
		before = frappe.get_all(
			"Sales Invoice Item", filters={"parent": order}, pluck="kds_sent_at", order_by="idx asc"
		)

		self.save(self.the_cart(), name=order)

		after = frappe.get_all(
			"Sales Invoice Item", filters={"parent": order}, pluck="kds_sent_at", order_by="idx asc"
		)
		self.assertEqual(after, before)

	def test_a_save_that_adds_a_drink_loses_nothing(self):
		order = self.first_round()
		self.call(order, "_Test SF Penne")

		self.save(self.the_cart("Pending", "Pending", self.line(self.gum)), name=order)

		rows = self.stored(order)
		self.assertEqual([item for item, *_ in rows], ["Cola", "Soup", "Penne", "Tart", "Gum"])
		self.assertEqual([ahead for _item, _status, ahead, _called in rows], [0, 0, 1, 1, 0])
		self.assertEqual(rows[2][3], frappe.utils.get_datetime(CALL))

	def test_the_waiter_adding_a_main_to_an_uncalled_course_sends_it_ahead_with_the_others(self):
		order = self.first_round()

		self.save(self.the_cart("Pending", "Pending", self.line(self.steak)), name=order)

		self.assertEqual(
			[(item, ahead, called) for item, _status, ahead, called in self.stored(order)][4:],
			[("Steak", 1, None)],
		)

	def test_a_starter_added_late_goes_at_once_not_ahead(self):
		order = self.first_round()

		self.save(self.the_cart("Pending", "Pending", self.line(self.salad)), name=order)

		self.assertEqual(
			[(item, status, ahead) for item, status, ahead, _called in self.stored(order)][4:],
			[("Salad", "Pending", 0)],
		)

	def test_a_main_added_after_the_mains_were_called_goes_at_once(self):
		order = self.first_round()
		self.call(order, "_Test SF Penne")

		self.save(self.the_cart("Pending", "Pending", self.line(self.steak)), name=order)

		self.assertEqual(
			[(item, status, ahead, called) for item, status, ahead, called in self.stored(order)][4:],
			[("Steak", "Pending", 0, None)],
		)

	def test_a_dessert_added_after_the_mains_were_called_still_joins_the_desserts_ahead(self):
		order = self.first_round()
		self.call(order, "_Test SF Penne")

		self.save(self.the_cart("Pending", "Pending", self.line(self.tart)), name=order)

		self.assertEqual(
			[(item, ahead) for item, _status, ahead, _called in self.stored(order)][4:], [("Tart", 1)]
		)


class TestTheTillsWordAlone(RhythmCase):
	"""The kitchen dialog sends the lines it ticked; a line the till says is ahead is ahead only where the server would have sent it so."""

	def test_a_food_line_the_dialog_sent_ahead_is_ahead(self):
		order = self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Pending", service_family="Main", kds_ahead=1),
			]
		)

		self.assertEqual(
			[(item, ahead) for item, _status, ahead, _called in self.stored(order)],
			[("Soup", 0), ("Penne", 1)],
		)

	def test_a_drink_or_a_line_of_no_family_is_never_ahead(self):
		order = self.save(
			[
				self.line(self.cola, "Pending", service_family="Drink", kds_ahead=1),
				self.line(self.gum, "Pending", kds_ahead=1),
			]
		)

		self.assertEqual([ahead for _item, _status, ahead, _called in self.stored(order)], [0, 0])

	def test_a_line_held_back_is_not_sent_ahead(self):
		order = self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Waiting", service_family="Main", kds_ahead=1),
			]
		)

		self.assertEqual(
			[(status, ahead) for _item, status, ahead, _called in self.stored(order)],
			[("Pending", 0), ("Waiting", 0)],
		)

	def test_the_till_cannot_write_the_call(self):
		order = self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(
					self.penne,
					"Pending",
					service_family="Main",
					kds_ahead=1,
					kds_called_at="2026-11-01 19:30:00",
				),
			]
		)

		self.assertEqual([called for *_rest, called in self.stored(order)], [None, None])

	def test_a_line_that_left_in_the_ordinary_way_cannot_be_turned_ahead_by_a_later_save(self):
		order = self.first_round()
		cart = self.the_cart()
		cart[1] = {**cart[1], "kds_ahead": 1}

		self.save(cart, name=order)

		self.assertEqual(
			[ahead for _item, _status, ahead, _called in self.stored(order)], [0, 0, 1, 1]
		)


class TestWhatTheScreensRead(RhythmCase):
	def lines_of_the_kitchen(self, order):
		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		return {line["item_code"].replace("_Test SF ", ""): line for line in orders[order]["items"]}

	def test_the_kitchens_list_gives_every_line_its_mark_and_its_call(self):
		order = self.first_round()
		self.call(order, "_Test SF Penne")

		lines = self.lines_of_the_kitchen(order)

		self.assertEqual([lines[item]["kds_ahead"] for item in ("Cola", "Soup", "Penne", "Tart")], [0, 0, 1, 1])
		self.assertIsNone(lines["Tart"]["kds_called_at"])
		self.assertEqual(lines["Penne"]["kds_called_at"], frappe.utils.get_datetime(CALL))

	def test_the_kitchen_sees_a_course_sent_ahead_as_live_dishes_to_start(self):
		order = self.first_round()

		lines = self.lines_of_the_kitchen(order)

		self.assertEqual({lines[item]["kds_status"] for item in ("Penne", "Tart")}, {"Pending"})

	def test_a_table_reopened_gives_the_till_the_mark_and_the_call_of_each_line(self):
		order = self.first_round()
		self.call(order, "_Test SF Penne")
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", self.table_a)

		opened = restaurant_api.open_table(self.table_a, self.fx.profile)["items"]
		read = restaurant_api.get_table_order(self.table_a)["items"]

		for lines in (opened, read):
			by_item = {line["item_code"].replace("_Test SF ", ""): line for line in lines}
			self.assertEqual([int(by_item[item]["kds_ahead"] or 0) for item in ("Cola", "Penne", "Tart")], [0, 1, 1])
			self.assertEqual(by_item["Penne"]["kds_called_at"], frappe.utils.get_datetime(CALL))
			self.assertIsNone(by_item["Tart"]["kds_called_at"])


class TestTheDishesFinishedAhead(RhythmCase):
	"""« Prêt d'avance »: the kitchen finished a dish whose course the room has not called; it is not at the pass."""

	def set_status(self, order, item, status):
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": order, "item_code": item}, "kds_status", status, update_modified=False
		)

	def runner_items(self, order):
		runner = {o["name"]: o for o in restaurant_api.get_runner_orders(restaurant=self.a)}
		return sorted(line["item_code"].replace("_Test SF ", "") for line in runner[order]["items"]) if order in runner else []

	def test_a_dish_finished_ahead_is_not_offered_to_the_runner_until_it_is_called(self):
		order = self.first_round()
		self.set_status(order, "_Test SF Soup", "Ready")
		self.set_status(order, "_Test SF Penne", "Ready")

		self.assertEqual(self.runner_items(order), ["Soup"])

		self.call(order, "_Test SF Penne")

		self.assertEqual(self.runner_items(order), ["Penne", "Soup"])

	def test_the_pass_delivers_no_dish_the_room_has_not_called(self):
		order = self.first_round()
		self.set_status(order, "_Test SF Penne", "Ready")
		self.set_status(order, "_Test SF Soup", "Ready")

		restaurant_api.mark_items_delivered(order)

		self.assertEqual(
			[(item, status) for item, status, _ahead, _called in self.stored(order)],
			# the pass delivers every line that is not delivered yet (it always did), except the ones the room has not called
			[("Cola", "Delivered"), ("Soup", "Delivered"), ("Penne", "Ready"), ("Tart", "Pending")],
		)

	def test_the_pass_delivers_a_dish_by_its_name_only_when_it_is_called(self):
		order = self.first_round()
		self.set_status(order, "_Test SF Penne", "Ready")
		penne = frappe.db.get_value("Sales Invoice Item", {"parent": order, "item_code": "_Test SF Penne"}, "name")

		restaurant_api.mark_items_delivered(order, json.dumps([penne]))
		self.assertEqual(self.stored(order)[2][1], "Ready")

		self.call(order, "_Test SF Penne")
		restaurant_api.mark_items_delivered(order, json.dumps([penne]))
		self.assertEqual(self.stored(order)[2][1], "Delivered")

	def test_the_order_is_not_ready_while_only_dishes_finished_ahead_are_ready(self):
		order = self.first_round()
		for item in ("Cola", "Soup"):
			self.set_status(order, f"_Test SF {item}", "Delivered")
		for item in ("Penne", "Tart"):
			self.set_status(order, f"_Test SF {item}", "Ready")

		restaurant_api._follow_the_dishes(order)
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "kds_status"), "Preparing")

		self.call(order, "_Test SF Penne", "_Test SF Tart")
		restaurant_api._follow_the_dishes(order)
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "kds_status"), "Ready")

