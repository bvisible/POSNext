# //// Neoffice — added file (no upstream equivalent).
"""A station that works on paper alone has no kitchen screen (NeoResto lot 1, Daniel, 02.11.2026).

« Si on imprime un ticket cuisine, on n'a pas d'écran, on ne va pas gérer de préparation: c'est des gens qui se parlent. » A station set
`paper_only` is a kitchen whose cooks read a printed ticket: its lines are on no kitchen or runner screen (a ticket that stays « to do »
for ever on a tablet nobody looks at is noise), and the stations the screens list tell which ones they are, so that a screen draws no
chip for them. The suite builds a restaurant with two stations and a table's order with a dish for each, and rolls back.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_till_writes_need_the_till import _sale
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants


class TestAPaperOnlyStationHasNoScreen(TwoRestaurants, FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.make_till(self.fx.profile, self.a)
		self.kitchen = self.station_a
		self.bar = self.make_station(self.a, station_name="Bar")
		dish = {"item_code": self.fx.item, "qty": 1, "rate": 10, "price_list_rate": 10}
		payload = _sale(
			self.fx,
			pos_profile=self.fx.profile,
			restaurant_table=self.table_a,
			items=[dict(dish), dict(dish)],
			payments=[{"mode_of_payment": self.fx.mode, "amount": 20}],
		)
		self.order = invoices.update_invoice(json.dumps(payload))["name"]
		rows = frappe.get_all("Sales Invoice Item", filters={"parent": self.order}, order_by="idx", pluck="name")
		for row, station in zip(rows, (self.kitchen, self.bar), strict=True):
			frappe.db.set_value("Sales Invoice Item", row, {"preparation_station": station, "kds_status": "Pending"})
		frappe.db.set_value("Sales Invoice", self.order, "kds_status", "Pending")

	def paper(self, *stations):
		for station in stations:
			frappe.db.set_value("Preparation Station", station, "paper_only", 1)

	def stations_on_screen(self, **kwargs):
		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a, **kwargs)}
		if self.order not in orders:
			return None
		return {line["preparation_station"] for line in orders[self.order]["items"]}

	def test_no_station_is_paper_only_by_default(self):
		stations = {s["name"]: s for s in restaurant_api.get_preparation_stations(restaurant=self.a)}

		self.assertEqual({stations[self.kitchen]["paper_only"], stations[self.bar]["paper_only"]}, {0})
		self.assertEqual(self.stations_on_screen(), {self.kitchen, self.bar})

	def test_the_stations_say_which_ones_work_on_paper_alone(self):
		self.paper(self.kitchen)

		stations = {s["name"]: s for s in restaurant_api.get_preparation_stations(restaurant=self.a)}

		self.assertEqual(stations[self.kitchen]["paper_only"], 1)
		self.assertEqual(stations[self.bar]["paper_only"], 0)

	def test_the_lines_of_a_paper_only_station_are_on_no_screen_the_others_stay(self):
		self.paper(self.bar)

		self.assertEqual(self.stations_on_screen(), {self.kitchen})

	def test_an_order_with_nothing_but_paper_only_lines_is_not_a_ticket_of_any_screen(self):
		self.paper(self.kitchen, self.bar)

		self.assertIsNone(self.stations_on_screen())

	def test_a_screen_opened_on_a_paper_only_station_shows_nothing(self):
		self.paper(self.bar)

		self.assertIsNone(self.stations_on_screen(station=self.bar))

	def test_the_till_is_told_which_stations_work_on_paper_alone_for_the_lines_it_shows(self):
		# The table's order shows no kitchen state on a line of such a station: the till reads the flag in the map of what each station makes
		bar = frappe.get_doc("Preparation Station", self.bar)
		bar.append("items", {"item": self.fx.item})
		bar.save(ignore_permissions=True)

		before = restaurant_api.get_station_items_map(restaurant=self.a)["items"][self.fx.item]
		self.paper(self.bar)
		after = restaurant_api.get_station_items_map(restaurant=self.a)["items"][self.fx.item]

		self.assertEqual((before["station"], before["paper_only"]), (self.bar, 0))
		self.assertEqual((after["station"], after["paper_only"]), (self.bar, 1))

	def test_the_floor_plan_is_told_which_stations_work_on_paper_alone_so_that_it_draws_no_chip_for_them(self):
		self.paper(self.bar)

		stations = {s["name"]: s for s in restaurant_api.get_tables(restaurant=self.a)["stations"]}

		self.assertEqual(stations[self.bar]["paper_only"], 1)
		self.assertEqual(stations[self.kitchen]["paper_only"], 0)
