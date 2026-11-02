# //// Neoffice — added file (no upstream equivalent).
"""A call of the next course taken up on one kitchen screen is taken up on the others (NeoRestau lot 1, Daniel, 01.11).

A kitchen may have several tablets. When the next course of a table is ordered, the ticket blinks on each of them until a cook
starts its dishes (that is already shared: the dishes' status is the server's) or says « to do » (the ticket's button), which
only the tablet he touched knew. The tablet now tells the server which call it took up (the order and the key of the send it
was told of), and every reading of the orders carries it (`call_seen`) back to the screens that show the same thing: the same
station, or all of them. A screen of another station keeps blinking: its dishes are not taken up. It builds on the tablets'
fixture: two restaurants, a grill and a pastry station, an order at a table.
"""

from unittest.mock import patch

import frappe

from pos_next.api import restaurant
from pos_next.restaurant import call_seen, devices
from pos_next.tests.test_kitchen_copy import CopyCase, call
from pos_next.tests.test_restaurant_devices import CASHIER, MANAGER, PORTAL, as_user
from pos_next.tests.test_till_writes_need_the_till import _user

NO_ROLE = "kitchencallseen-norole@yopmail.com"

SEEN = "pos_next.api.kitchen_events.acknowledge_kitchen_call"
CALL = "ACC-SINV-NOWHERE|1790000000000"


def seen_by_a_reading(user, order, **kwargs):
	"""What a reading of the kitchen's orders, made by `user`, says of the call of `order`: the key taken up, "" for none.
	A desk account that names no station names the restaurant (its own is the till's, not the fixture's)."""
	with as_user(user):
		readings = restaurant.get_kds_orders(**kwargs)
	named = [one for one in readings if one["name"] == order]
	assert named, f"{order} is not in the reading {[one['name'] for one in readings]}"
	return named[0].get("call_seen")


class SeenCase(CopyCase):
	def setUp(self):
		super().setUp()
		# What is taken up lives in the cache, which a test's rollback does not undo: and a rolled-back naming series gives the same order names again
		call_seen.forget_all()
		self.addCleanup(call_seen.forget_all)


class TestTakingUpACall(SeenCase):
	def key(self, suffix="1790000000000"):
		return f"{self.order}|{suffix}"

	def test_a_reading_says_nothing_taken_up_until_a_screen_takes_it(self):
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, restaurant=self.bistro), "")
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.grill), "")

	def test_the_station_that_took_it_up_is_told_so_by_its_next_reading(self):
		with as_user(MANAGER):
			call(SEEN, self.order, self.key(), station=self.grill)

		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.grill), self.key())

	def test_another_tablet_of_the_same_station_reads_it_too(self):
		with as_user(MANAGER):
			call(SEEN, self.order, self.key(), station=self.grill)

		self.assertEqual(seen_by_a_reading(self.grill_tablet, self.order), self.key())

	def test_a_tablet_takes_up_for_its_own_station_whatever_it_names(self):
		with as_user(self.grill_tablet):
			call(SEEN, self.order, self.key())

		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.grill), self.key())
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.pastry), "")

	def test_a_screen_of_another_station_keeps_blinking(self):
		with as_user(MANAGER):
			call(SEEN, self.order, self.key(), station=self.grill)

		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.pastry), "")
		# and the screens of every station are another scope too: they show the dishes of all, none of them is taken up for them
		self.assertEqual(seen_by_a_reading(self.kitchen_tablet, self.order), "")
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, restaurant=self.bistro), "")

	def test_a_screen_of_every_station_takes_up_for_the_screens_of_every_station(self):
		with as_user(self.kitchen_tablet):
			call(SEEN, self.order, self.key())

		self.assertEqual(seen_by_a_reading(MANAGER, self.order, restaurant=self.bistro), self.key())
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.grill), "")

	def test_a_later_send_is_another_key_and_the_last_one_taken_up_is_kept(self):
		with as_user(MANAGER):
			call(SEEN, self.order, self.key("1790000000000"), station=self.grill)
			call(SEEN, self.order, self.key("1790000600000"), station=self.grill)

		# The screen compares it with the key of the send it was told of: an older key says nothing of a newer send
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.grill), self.key("1790000600000"))

	def test_the_other_screens_are_told_to_read_again_at_once(self):
		with patch.object(frappe, "publish_realtime") as published, as_user(MANAGER):
			call(SEEN, self.order, self.key(), station=self.grill)

		self.assertIn("kds_update", [args[0][0] for args in published.call_args_list])

	def test_it_is_asked_for_by_post_only(self):
		# a link opened on a tablet is a GET: it must take up nothing
		self.assertEqual(list(frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(SEEN)]), ["POST"])

	def test_a_tablets_session_may_reach_it(self):
		self.assertIn(SEEN, devices.TABLET_METHODS)


class TestWhoMayTakeUpACall(SeenCase):
	def key(self):
		return f"{self.order}|1790000000000"

	def test_a_desk_account_that_writes_invoices_may(self):
		for user in (MANAGER, CASHIER):
			with self.subTest(user=user), as_user(user):
				call(SEEN, self.order, self.key(), station=self.grill)

	def test_a_portal_account_and_a_visitor_are_refused(self):
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user):
				self.assert_refused(user, user, frappe.get_attr(SEEN), self.order, self.key())
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, restaurant=self.bistro), "")

	def test_a_desk_account_without_the_right_to_write_invoices_is_refused(self):
		_user(NO_ROLE, [], "System User")

		self.assert_refused(NO_ROLE, "no right", frappe.get_attr(SEEN), self.order, self.key())

	def test_the_tablet_of_another_restaurant_and_the_runners_are_refused(self):
		self.assert_refused(self.bar_tablet, "bar", frappe.get_attr(SEEN), self.order, self.key())
		self.assert_refused(self.runner_tablet, "runner", frappe.get_attr(SEEN), self.order, self.key())
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, restaurant=self.bistro), "")

	def test_a_tablet_of_one_station_cannot_take_up_for_another(self):
		self.assert_refused(
			self.grill_tablet, "pastry", frappe.get_attr(SEEN), self.order, self.key(), station=self.pastry
		)

	def test_an_order_that_is_not_open_is_refused(self):
		frappe.db.set_value("Sales Invoice", self.order, {"docstatus": 1}, update_modified=False)

		with as_user(MANAGER), self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
			call(SEEN, self.order, self.key())

	def test_a_key_that_is_not_a_short_text_is_refused(self):
		for label, key in (("empty", ""), ("none", None), ("a number", 1790000000000), ("a list", ["a"]), ("too long", "k" * 300)):
			with self.subTest(label), as_user(MANAGER), self.assertRaises((frappe.ValidationError, TypeError)):
				call(SEEN, self.order, key, station=self.grill)
		self.assertEqual(seen_by_a_reading(MANAGER, self.order, station=self.grill), "")
