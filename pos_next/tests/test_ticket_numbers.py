# //// Neoffice — added file (no upstream equivalent).
"""The ticket number of a restaurant order (NeoResto lot 1, task 38b, rulings 122 and 124).

An order of a table or a takeaway order is a draft Sales Invoice, and the draft takes its Sales Invoice number (FA-…) at
its first save, in an order nobody chose and with a gap for each one deleted. The kitchen and the runner must not show
that number, and a house wants its own: a TICKET number, counted by the restaurant, per business day, and given by the
server at the order's first save. The suite pins:

- who gets one (an order of a table, a takeaway order of a restaurant till; never a plain counter sale), and when (once,
  at the first save: every later save of the order keeps it);
- how it is counted (per restaurant, per business day on the SITE's clock, from a day start the restaurant sets; or
  never reset; or per shift), and that two orders at the same instant never share one (two real connections);
- what the screens are told (`ticket_no` and `ticket_digits`, never the invoice's name to read).

The suite builds everything it needs and rolls back; the one test that must commit (two connections) deletes its rows.
"""

import json
import threading
from datetime import datetime
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import tickets
from pos_next.tests.test_till_writes_need_the_till import _sale
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants

NOON = datetime(2026, 10, 31, 12, 0, 0)


def at(moment):
	"""The site's clock, as the module of the tickets reads it."""
	return patch.object(tickets, "now_datetime", return_value=moment)


class TicketCase(TwoRestaurants, FrappeTestCase):
	"""Restaurant A with a table T1 and a till, restaurant B with its own, and a third till that is no restaurant's."""

	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.make_till(self.fx.profile, self.a)
		self.make_till(self.fx.other_profile, self.b)
		self.table_a2 = self.make_table(self.a, self.room_a, table_name="T2")

	def save(self, profile=None, **changes):
		"""One save of the till (update_invoice), the payload as the till sends it; the saved invoice's row."""
		payload = _sale(self.fx, pos_profile=profile or self.fx.profile, **changes)
		name = invoices.update_invoice(json.dumps(payload))["name"]
		return self.row(name)

	def row(self, name):
		return frappe.db.get_value(
			"Sales Invoice", name, ["name", "posa_ticket_no", "posa_ticket_day", "docstatus"], as_dict=True
		)


class TestWhoGetsATicketNumber(TicketCase):
	def test_an_order_of_a_table_gets_the_first_number_of_the_day(self):
		with at(NOON):
			order = self.save(restaurant_table=self.table_a)

		self.assertEqual(order.posa_ticket_no, 1)
		self.assertEqual(str(order.posa_ticket_day), "2026-10-31")

	def test_the_next_order_gets_the_next_number_whatever_the_table(self):
		with at(NOON):
			first = self.save(restaurant_table=self.table_a)
			second = self.save(restaurant_table=self.table_a2)

		self.assertEqual((first.posa_ticket_no, second.posa_ticket_no), (1, 2))

	def test_a_takeaway_order_of_a_restaurant_till_gets_one_too(self):
		with at(NOON):
			table = self.save(restaurant_table=self.table_a)
			takeaway = self.save(is_takeaway=1, takeaway_number="T-001")

		self.assertEqual((table.posa_ticket_no, takeaway.posa_ticket_no), (1, 2))

	def test_a_later_save_of_the_order_keeps_its_number(self):
		with at(NOON):
			order = self.save(restaurant_table=self.table_a)
			again = self.save(restaurant_table=self.table_a, name=order.name)
			other = self.save(restaurant_table=self.table_a2)

		self.assertEqual(again.name, order.name)
		self.assertEqual((order.posa_ticket_no, again.posa_ticket_no, other.posa_ticket_no), (1, 1, 2))

	def test_a_plain_counter_sale_of_a_restaurant_till_gets_none(self):
		with at(NOON):
			sale = self.save()
			table = self.save(restaurant_table=self.table_a)

		self.assertFalse(sale.posa_ticket_no)
		self.assertEqual(table.posa_ticket_no, 1, "the sale at the counter used no number")

	def test_a_sale_of_a_till_that_is_no_restaurant_till_gets_none(self):
		# The third till has no POS Settings at all: a plain retail till
		frappe.db.delete("POS Settings", {"pos_profile": self.fx.other_profile})
		with at(NOON):
			sale = self.save(profile=self.fx.other_profile)
			takeaway = self.save(profile=self.fx.other_profile, is_takeaway=1, takeaway_number="T-001")

		self.assertFalse(sale.posa_ticket_no)
		self.assertFalse(takeaway.posa_ticket_no, "no restaurant, nothing to count in")
		self.assertFalse(frappe.db.exists("Restaurant Ticket Counter", {"restaurant": ["in", [self.a, self.b]]}))

	def test_the_number_is_the_servers_a_till_cannot_send_its_own(self):
		with at(NOON):
			order = self.save(restaurant_table=self.table_a, posa_ticket_no=99, posa_ticket_day="2020-01-01")

		self.assertEqual(order.posa_ticket_no, 1)
		self.assertEqual(str(order.posa_ticket_day), "2026-10-31")

	def test_a_copy_of_an_order_does_not_copy_its_number(self):
		with at(NOON):
			order = self.save(restaurant_table=self.table_a)
		meta = frappe.get_meta("Sales Invoice")

		self.assertEqual(meta.get_field("posa_ticket_no").no_copy, 1)
		self.assertEqual(meta.get_field("posa_ticket_day").no_copy, 1)
		self.assertTrue(order.posa_ticket_no)


class TestHowTheNumbersAreCounted(TicketCase):
	def test_each_restaurant_counts_for_itself(self):
		self.table_b2 = self.make_table(self.b, self.room_b, table_name="T2")
		with at(NOON):
			a1 = self.save(restaurant_table=self.table_a)
			b1 = self.save(profile=self.fx.other_profile, restaurant_table=self.table_b)
			a2 = self.save(restaurant_table=self.table_a2)
			b2 = self.save(profile=self.fx.other_profile, restaurant_table=self.table_b2)

		self.assertEqual((a1.posa_ticket_no, a2.posa_ticket_no), (1, 2))
		self.assertEqual((b1.posa_ticket_no, b2.posa_ticket_no), (1, 2))

	def test_a_business_day_runs_from_five_in_the_morning_to_five_in_the_morning(self):
		evening = datetime(2026, 10, 30, 23, 30)
		after_midnight = datetime(2026, 10, 31, 0, 40)
		just_before = datetime(2026, 10, 31, 4, 59, 59)
		opening = datetime(2026, 10, 31, 5, 0, 0)
		with at(evening):
			first = self.save(restaurant_table=self.table_a)
		with at(after_midnight):
			second = self.save(restaurant_table=self.table_a2)
		with at(just_before):
			third = self.save(is_takeaway=1, takeaway_number="T-001")
		with at(opening):
			fourth = self.save(is_takeaway=1, takeaway_number="T-002")

		self.assertEqual([o.posa_ticket_no for o in (first, second, third)], [1, 2, 3])
		self.assertEqual({str(o.posa_ticket_day) for o in (first, second, third)}, {"2026-10-30"})
		self.assertEqual((fourth.posa_ticket_no, str(fourth.posa_ticket_day)), (1, "2026-10-31"))

	def test_the_day_starts_when_the_restaurant_says(self):
		frappe.db.set_value("Restaurant", self.a, "business_day_start", "03:30:00")
		with at(datetime(2026, 10, 31, 3, 29)):
			before = self.save(restaurant_table=self.table_a)
		with at(datetime(2026, 10, 31, 3, 30)):
			after = self.save(restaurant_table=self.table_a2)

		self.assertEqual((str(before.posa_ticket_day), str(after.posa_ticket_day)), ("2026-10-30", "2026-10-31"))
		self.assertEqual(after.posa_ticket_no, 1)

	def test_the_day_is_read_on_the_sites_clock_not_the_servers(self):
		# The module asks the site's clock (frappe.utils.now_datetime): nothing in it reads UTC itself
		source = open(tickets.__file__).read()

		self.assertIn("now_datetime", source)
		for server_clock in ("utcnow", "datetime.now(", "date.today("):
			self.assertNotIn(server_clock, source)

	def test_never_reset_goes_on_across_days(self):
		frappe.db.set_value("Restaurant", self.a, "ticket_number_reset", "Never")
		with at(datetime(2026, 10, 30, 12)):
			first = self.save(restaurant_table=self.table_a)
		with at(datetime(2026, 11, 2, 12)):
			second = self.save(restaurant_table=self.table_a2)

		self.assertEqual((first.posa_ticket_no, second.posa_ticket_no), (1, 2))

	def test_each_shift_starts_again_with_each_shift(self):
		frappe.db.set_value("Restaurant", self.a, "ticket_number_reset", "Each shift")
		with at(NOON):
			with patch.object(tickets, "shift_of", return_value="SHIFT-1"):
				first = self.save(restaurant_table=self.table_a)
				second = self.save(restaurant_table=self.table_a2)
			with patch.object(tickets, "shift_of", return_value="SHIFT-2"):
				third = self.save(is_takeaway=1, takeaway_number="T-001")

		self.assertEqual([o.posa_ticket_no for o in (first, second, third)], [1, 2, 1])

	def test_each_shift_without_a_shift_counts_by_business_day(self):
		frappe.db.set_value("Restaurant", self.a, "ticket_number_reset", "Each shift")
		with at(NOON), patch.object(tickets, "shift_of", return_value=None):
			first = self.save(restaurant_table=self.table_a)
			second = self.save(restaurant_table=self.table_a2)

		self.assertEqual((first.posa_ticket_no, second.posa_ticket_no), (1, 2))

	def test_an_order_that_is_given_up_gives_its_number_back(self):
		with at(NOON):
			frappe.db.savepoint("ticket_order")
			given_up = self.save(restaurant_table=self.table_a)
			frappe.db.rollback(save_point="ticket_order")
			next_order = self.save(restaurant_table=self.table_a)

		self.assertEqual(given_up.posa_ticket_no, 1)
		self.assertEqual(next_order.posa_ticket_no, 1)
		self.assertEqual(
			frappe.db.get_value("Restaurant Ticket Counter", tickets.counter_key(self.a, "2026-10-31"), "last_number"),
			1,
		)

	def test_a_deleted_order_does_not_give_its_number_back_within_the_day(self):
		with at(NOON):
			first = self.save(restaurant_table=self.table_a)
			frappe.delete_doc("Sales Invoice", first.name, force=1, ignore_permissions=True)
			self.assertFalse(frappe.db.exists("Sales Invoice", first.name))
			second = self.save(restaurant_table=self.table_a)

		self.assertEqual(second.posa_ticket_no, 2)

	def test_the_digits_and_the_reset_have_defaults_and_the_digits_are_checked(self):
		restaurant = frappe.get_doc("Restaurant", self.a)

		self.assertEqual(restaurant.ticket_number_digits, 4)
		self.assertEqual(restaurant.ticket_number_reset, "Business day")
		self.assertEqual(str(restaurant.business_day_start), "5:00:00")
		for bad in (0, 10, -1):
			restaurant.ticket_number_digits = bad
			with self.assertRaises(frappe.ValidationError):
				restaurant.validate()

	def test_a_restaurant_made_by_the_server_does_not_open_its_day_at_the_minute_it_was_made(self):
		# Frappe fills every Time field of a new document with the current time, whatever the field's default says
		kept = self.make_restaurant("_Test Restaurant Night", business_day_start="03:30:00")

		self.assertEqual(str(frappe.db.get_value("Restaurant", kept, "business_day_start")), "3:30:00")
		self.assertEqual(str(frappe.db.get_value("Restaurant", self.b, "business_day_start")), "5:00:00")

	def test_a_restaurant_that_never_set_them_counts_with_the_defaults(self):
		# A restaurant saved before the fields existed holds nothing in them (the time is NULL, the others empty or 0)
		frappe.db.sql(
			"UPDATE `tabRestaurant` SET ticket_number_digits = 0, ticket_number_reset = '',"
			" business_day_start = NULL WHERE name = %s",
			self.a,
		)
		frappe.clear_cache(doctype="Restaurant")
		settings = tickets.ticket_settings(self.a)
		with at(datetime(2026, 10, 31, 4, 0)):
			order = self.save(restaurant_table=self.table_a)

		self.assertEqual((settings.digits, settings.reset), (4, "Business day"))
		self.assertEqual(str(order.posa_ticket_day), "2026-10-30")


class TestWhatTheScreensAreTold(TicketCase):
	def setUp(self):
		super().setUp()
		# the kitchen's and the runner's lists are read as the desk user of the test
		self.station = self.station_a

	def an_order_with_a_dish_ready(self, **changes):
		with at(NOON):
			order = self.save(restaurant_table=self.table_a, **changes)
		for line in frappe.get_all("Sales Invoice Item", filters={"parent": order.name}, pluck="name"):
			frappe.db.set_value(
				"Sales Invoice Item", line, {"preparation_station": self.station, "kds_status": "Ready"}
			)
		return order

	def test_the_kitchen_is_told_the_number_and_its_digits(self):
		frappe.db.set_value("Restaurant", self.a, "ticket_number_digits", 3)
		order = self.an_order_with_a_dish_ready()

		told = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}[order.name]

		self.assertEqual((told["ticket_no"], told["ticket_digits"]), (1, 3))

	def test_the_list_of_tables_carries_the_number_of_each_open_order(self):
		order = self.an_order_with_a_dish_ready()

		tables = {t["name"]: t for t in restaurant_api.get_tables(restaurant=self.a)["tables"]}

		summary = tables[self.table_a]["order_summary"]
		self.assertEqual((summary["ticket_no"], summary["ticket_digits"]), (1, 4))
		self.assertTrue(order.name)

	def test_the_orders_screen_of_a_table_carries_it(self):
		self.an_order_with_a_dish_ready()
		with patch("pos_next.api.cash_entry.require_till_user"):
			told = restaurant_api.get_table_order(self.table_a)

		self.assertEqual((told["ticket_no"], told["ticket_digits"]), (1, 4))

	def test_opening_a_table_carries_it_too(self):
		self.an_order_with_a_dish_ready()
		told = restaurant_api.open_table(self.table_a, self.fx.profile)

		self.assertEqual((told["ticket_no"], told["ticket_digits"]), (1, 4))

	def test_the_takeaway_screen_is_told_the_number(self):
		with at(NOON):
			table = self.save(restaurant_table=self.table_a)
			takeaway = self.save(is_takeaway=1, takeaway_number="T-007")

		told = {o["name"]: o for o in restaurant_api.get_takeaway_orders(restaurant=self.a)}[takeaway.name]

		self.assertEqual((table.posa_ticket_no, told["ticket_no"], told["ticket_digits"]), (1, 2, 4))
		self.assertEqual(told["takeaway_number"], "T-007")

	def test_an_order_with_no_number_says_none_rather_than_zero(self):
		sale = self.save(restaurant_table=self.table_a)
		frappe.db.set_value("Sales Invoice", sale.name, {"posa_ticket_no": 0, "posa_ticket_day": None})

		told = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}.get(sale.name)
		rows = [{"name": sale.name}]
		tickets.stamp(rows, self.a)

		self.assertIsNone(rows[0]["ticket_no"])
		self.assertEqual(rows[0]["ticket_digits"], 4)
		self.assertIsNone((told or {}).get("ticket_no"))

	def test_the_number_is_written_with_its_digits(self):
		self.assertEqual(tickets.format_ticket_no(7, 4), "0007")
		self.assertEqual(tickets.format_ticket_no(12345, 4), "12345", "a number longer than its digits is never cut")
		self.assertEqual(tickets.format_ticket_no(7, 2), "07")
		self.assertEqual(tickets.format_ticket_no(None, 4), "")
		self.assertEqual(tickets.format_ticket_no(0, 4), "")


class TestTwoOrdersAtTheSameInstant(FrappeTestCase):
	"""The counter, on real connections: the main thread holds one, each helper thread opens its own."""

	RESTAURANT = "_Test Counter Restaurant"

	def setUp(self):
		self.site = frappe.local.site
		self.sites_path = frappe.local.sites_path
		self.addCleanup(self.clean_up)

	def clean_up(self):
		frappe.db.rollback()
		frappe.db.delete("Restaurant Ticket Counter", {"restaurant": self.RESTAURANT})
		frappe.db.commit()

	def on_a_connection_of_its_own(self, work, results, index):
		"""Run `work()` in a thread with its own database connection, commit, and keep what it returned."""
		frappe.init(site=self.site, sites_path=self.sites_path)
		frappe.connect()
		try:
			results[index] = work()
			frappe.db.commit()
		except Exception as error:  # pragma: no cover - reported by the assertions
			results[index] = error
		finally:
			frappe.destroy()

	def take(self, day):
		key = tickets.counter_key(self.RESTAURANT, day)
		return tickets.next_number(self.RESTAURANT, key, day)

	def test_a_second_connection_waits_for_the_first_and_gets_the_next_number(self):
		day = "2026-10-31"
		first = self.take(day)
		results = {}
		other = threading.Thread(target=self.on_a_connection_of_its_own, args=(lambda: self.take(day), results, 0))
		other.start()
		other.join(1.5)

		self.assertTrue(other.is_alive(), "the second order waits for the first order's number to be settled")
		frappe.db.commit()
		other.join(20)

		self.assertFalse(other.is_alive())
		self.assertEqual((first, results[0]), (1, 2))

	def test_a_day_that_already_has_its_counter_row_is_no_different(self):
		day = "2026-10-31"
		counted = [self.take(day), self.take(day)]
		frappe.db.commit()
		first = self.take(day)
		results = {}
		other = threading.Thread(target=self.on_a_connection_of_its_own, args=(lambda: self.take(day), results, 0))
		other.start()
		other.join(1.5)

		self.assertTrue(other.is_alive(), "the second order waits for the first order's number to be settled")
		frappe.db.commit()
		other.join(20)

		self.assertEqual((counted, first, results[0]), ([1, 2], 3, 4))

	def test_when_the_first_gives_up_the_second_takes_its_number(self):
		day = "2026-10-31"
		first = self.take(day)
		results = {}
		other = threading.Thread(target=self.on_a_connection_of_its_own, args=(lambda: self.take(day), results, 0))
		other.start()
		other.join(1.0)
		frappe.db.rollback()
		other.join(20)

		self.assertEqual((first, results[0]), (1, 1), "the first order was rolled back: its number is the second's")

	def test_several_orders_at_once_never_share_a_number_on_a_new_day_or_a_day_already_counted(self):
		for round_ in range(10):
			day = f"2026-11-{round_ + 1:02d}"
			# Odd rounds start from a day that has its counter row already (two numbers given and committed)
			already = 2 if round_ % 2 else 0
			for _ in range(already):
				self.take(day)
			frappe.db.commit()
			results = {}
			start = threading.Barrier(4)

			def work():
				start.wait(10)
				return tickets.next_number(self.RESTAURANT, tickets.counter_key(self.RESTAURANT, day), day)

			threads = [
				threading.Thread(target=self.on_a_connection_of_its_own, args=(work, results, i)) for i in range(4)
			]
			for thread in threads:
				thread.start()
			for thread in threads:
				thread.join(30)

			self.assertEqual(sorted(results), [0, 1, 2, 3], results)
			# Four numbers, one each, in a row from where the day was: a number shared or skipped shows here (a failed
			# connection leaves its error in `results`)
			self.assertEqual(
				sorted(str(number) for number in results.values()),
				sorted(str(number) for number in range(already + 1, already + 5)),
				f"round {round_}: {results}",
			)
