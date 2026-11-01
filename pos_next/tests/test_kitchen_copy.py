# //// Neoffice — added file (no upstream equivalent).
"""The copy of a kitchen ticket, asked for from the kitchen's or the runner's screen (NeoRestau lot 1, task 44).

POS Next names the moment (the hook `pos_next_kitchen_reprint`) and checks who asks; an app that prints (cloudprnt) listens.
The suite stands in for that app with listeners of its own, so that it proves POS Next alone: who may ask for a copy (a desk
account that writes invoices; a paired tablet for its own screen, its own restaurant and its own station, never an order that
is not open), what the listener is handed, what the screen is told when nothing can print, and that the tablets' calls are in
the list a tablet's session may reach. It builds on the tablets' fixture: two restaurants, a grill and a pastry station, an
order at a table.
"""

from contextlib import contextmanager
from unittest.mock import patch

import frappe

from pos_next.api import kitchen_events
from pos_next.restaurant import devices
from pos_next.tests.test_restaurant_devices import CASHIER, KITCHEN, MANAGER, PORTAL, RUNNER, Tablets, as_user
from pos_next.tests.test_till_writes_need_the_till import _user

NO_ROLE = "kitchencopy-norole@yopmail.com"

COPY = "pos_next.api.kitchen_events.print_kitchen_copy"
STATUS = "pos_next.api.kitchen_events.kitchen_copy_status"
STATIONS = "pos_next.api.kitchen_events.kitchen_copy_stations"


class Listeners:
	"""The listeners of the three hooks, standing in for the app that prints."""

	def __init__(self, stations=(), tickets=None, no_printer=(), status=None):
		self.stations = list(stations)
		self.tickets = (
			tickets if tickets is not None else [{"station": "S", "job_token": "tok-1", "printer": "P"}]
		)
		self.no_printer = list(no_printer)
		self.status = status
		self.asked = []

	def reprint(self, invoice, station=None, whole_order=False, mark_copy=True):
		self.asked.append(
			frappe._dict(invoice=invoice, station=station, whole_order=whole_order, mark_copy=mark_copy)
		)
		return {
			"tickets": self.tickets,
			"no_printer": self.no_printer,
			"valid_minutes": 15,
			"duplicate": False,
		}

	def follow(self, job, invoice):
		self.asked.append(frappe._dict(job=job, invoice=invoice))
		return self.status

	def printers(self):
		return self.stations


@contextmanager
def listening(listeners):
	"""The hooks answered by `listeners` (None: no app listens)."""
	found = {
		kitchen_events.HOOK_REPRINT: [listeners.reprint] if listeners else [],
		kitchen_events.HOOK_REPRINT_STATUS: [listeners.follow] if listeners else [],
		kitchen_events.HOOK_PRINTERS: [listeners.printers] if listeners else [],
	}
	with patch.object(kitchen_events, "_listeners", lambda hook: found[hook]):
		yield listeners


def call(dotted, *args, **kwargs):
	return frappe.get_attr(dotted)(*args, **kwargs)


class CopyCase(Tablets):
	def setUp(self):
		super().setUp()
		self.grill_tablet = self.tablet(self.bistro, KITCHEN, self.grill)
		self.kitchen_tablet = self.tablet(self.bistro, KITCHEN)
		self.runner_tablet = self.tablet(self.bistro, RUNNER)
		self.bar_tablet = self.tablet(self.bar, KITCHEN)


class TestWhoMayAskForACopy(CopyCase):
	def test_a_desk_account_that_writes_invoices_asks_for_a_copy_of_an_open_order(self):
		for user in (MANAGER, CASHIER):
			with self.subTest(user=user), listening(Listeners()) as app, as_user(user):
				answer = call(COPY, self.order, station=self.grill)

				self.assertTrue(answer["printed"])
				self.assertEqual(len(app.asked), 1)
				self.assertEqual((app.asked[0].invoice, app.asked[0].station), (self.order, self.grill))

	def test_a_portal_account_and_a_visitor_are_refused(self):
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user), listening(Listeners()) as app:
				self.assert_refused(user, user, frappe.get_attr(COPY), self.order)
				self.assert_refused(user, user, frappe.get_attr(STATUS), self.order, "tok-1")
				self.assert_refused(user, user, frappe.get_attr(STATIONS))
				self.assertEqual(app.asked, [], "nothing was handed to the printing app")

	def test_a_desk_account_without_the_right_to_write_invoices_is_refused(self):
		# a staff account that holds no role: it reads no invoice, writes none
		_user(NO_ROLE, [], "System User")
		with listening(Listeners()) as app:
			self.assert_refused(NO_ROLE, "no right", frappe.get_attr(COPY), self.order)
			self.assert_refused(NO_ROLE, "no right", frappe.get_attr(STATUS), self.order, "tok-1")
		self.assertEqual(app.asked, [])

	def test_an_invoice_that_is_not_an_open_order_is_refused_to_a_desk_account(self):
		for label, change in (
			("submitted", {"docstatus": 1}),
			("no table and no takeaway", {"restaurant_table": None}),
		):
			with self.subTest(label), listening(Listeners()) as app:
				frappe.db.set_value("Sales Invoice", self.order, change, update_modified=False)
				with as_user(MANAGER), self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
					call(COPY, self.order)
				self.assertEqual(app.asked, [])

	def test_an_invoice_that_does_not_exist_is_refused_the_same_way(self):
		with (
			listening(Listeners()) as app,
			as_user(MANAGER),
			self.assertRaises((frappe.PermissionError, frappe.ValidationError)),
		):
			call(COPY, "ACC-SINV-NOWHERE")
		self.assertEqual(app.asked, [])

	def test_a_screen_that_is_neither_the_kitchen_nor_the_runner_is_refused(self):
		with listening(Listeners()) as app, as_user(MANAGER), self.assertRaises(frappe.ValidationError):
			call(COPY, self.order, screen="Till")
		self.assertEqual(app.asked, [])

	def test_a_station_that_does_not_exist_is_refused(self):
		with listening(Listeners()) as app, as_user(MANAGER), self.assertRaises(frappe.ValidationError):
			call(COPY, self.order, station="no-such-station")
		self.assertEqual(app.asked, [])

	def test_the_kitchens_tablet_asks_for_the_orders_of_its_restaurant(self):
		with listening(Listeners()) as app, as_user(self.kitchen_tablet):
			call(COPY, self.order)
		self.assertEqual(app.asked[0].invoice, self.order)

	def test_the_tablet_of_another_restaurant_is_refused(self):
		with listening(Listeners()) as app:
			self.assert_refused(self.bar_tablet, "bar", frappe.get_attr(COPY), self.order)
			self.assert_refused(self.kitchen_tablet, "bistro", frappe.get_attr(COPY), self.bar_order)
		self.assertEqual(app.asked, [])

	def test_the_tablet_of_one_station_prints_its_own_station_whatever_it_asks(self):
		with listening(Listeners()) as app, as_user(self.grill_tablet):
			call(COPY, self.order)
			call(COPY, self.order, station=self.grill)
		self.assertEqual([asked.station for asked in app.asked], [self.grill, self.grill])
		with listening(Listeners()) as app:
			self.assert_refused(
				self.grill_tablet, "pastry", frappe.get_attr(COPY), self.order, station=self.pastry
			)
		self.assertEqual(app.asked, [])

	def test_the_tablet_of_every_station_may_name_one_of_its_restaurant_not_another(self):
		with listening(Listeners()) as app, as_user(self.kitchen_tablet):
			call(COPY, self.order, station=self.pastry)
		self.assertEqual(app.asked[0].station, self.pastry)
		with listening(Listeners()) as app:
			self.assert_refused(
				self.kitchen_tablet, "bar grill", frappe.get_attr(COPY), self.order, station=self.bar_grill
			)
		self.assertEqual(app.asked, [])

	def test_the_runners_tablet_asks_with_the_runners_screen_and_the_kitchens_does_not(self):
		with listening(Listeners()) as app, as_user(self.runner_tablet):
			call(COPY, self.order, screen=RUNNER)
		self.assertEqual(len(app.asked), 1)
		with listening(Listeners()) as app:
			# a tablet is bound to ONE screen: the runner's is not the kitchen's, nor the kitchen's the runner's
			self.assert_refused(self.runner_tablet, "runner as kitchen", frappe.get_attr(COPY), self.order)
			self.assert_refused(
				self.kitchen_tablet, "kitchen as runner", frappe.get_attr(COPY), self.order, screen=RUNNER
			)
		self.assertEqual(app.asked, [])

	def test_the_copy_is_asked_for_by_post_only(self):
		# a link opened on a tablet is a GET: it must not print
		self.assertEqual(
			list(frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(COPY)]), ["POST"]
		)


class TestWhatTheListenerIsHandedAndTheScreenIsTold(CopyCase):
	def test_a_copy_is_the_stations_lines_and_marked_unless_the_screen_says_otherwise(self):
		with listening(Listeners()) as app, as_user(MANAGER):
			call(COPY, self.order, station=self.grill)
		asked = app.asked[0]
		self.assertIs(asked.whole_order, False)
		self.assertIs(asked.mark_copy, True)

	def test_the_screens_settings_reach_the_listener_whatever_form_they_come_in(self):
		for sent, whole, marked in (
			(dict(whole_order=1, mark_copy=0), True, False),
			(dict(whole_order="1", mark_copy="0"), True, False),
			(dict(whole_order=True, mark_copy=False), True, False),
			(dict(whole_order="0", mark_copy="1"), False, True),
			(dict(whole_order=None, mark_copy=None), False, True),
		):
			with self.subTest(sent), listening(Listeners()) as app, as_user(MANAGER):
				call(COPY, self.order, **sent)
				self.assertEqual((app.asked[0].whole_order, app.asked[0].mark_copy), (whole, marked))

	def test_the_answer_carries_the_tickets_to_follow(self):
		tickets = [
			{"station": self.grill, "job_token": "tok-9", "printer": "Kitchen", "printer_online": True}
		]
		with listening(Listeners(tickets=tickets)), as_user(MANAGER):
			answer = call(COPY, self.order, station=self.grill)
		self.assertEqual(answer["tickets"], tickets)
		self.assertTrue(answer["printed"])
		self.assertEqual(answer["no_printer"], [])
		self.assertEqual(answer["valid_minutes"], 15)

	def test_without_a_printer_nothing_is_printed_and_the_answer_says_so(self):
		with listening(Listeners(tickets=[], no_printer=[self.grill])), as_user(MANAGER):
			answer = call(COPY, self.order, station=self.grill)
		self.assertFalse(answer["printed"])
		self.assertEqual(answer["tickets"], [])
		self.assertEqual(answer["no_printer"], [self.grill], "the screen hides this station's button")

	def test_with_no_printing_app_at_all_the_answer_says_the_station_has_no_printer(self):
		with listening(None), as_user(MANAGER):
			answer = call(COPY, self.order, station=self.grill)
		self.assertFalse(answer["printed"])
		self.assertEqual(answer["no_printer"], [self.grill])

	def test_a_second_tap_is_told_it_is_the_same_copy(self):
		listeners = Listeners()
		reprint = listeners.reprint
		listeners.reprint = lambda *args, **kwargs: {**reprint(*args, **kwargs), "duplicate": True}
		with listening(listeners), as_user(MANAGER):
			answer = call(COPY, self.order)
		self.assertTrue(answer["duplicate"])
		self.assertTrue(answer["printed"], "the second tap follows the first one's job")

	def test_a_listener_that_fails_is_a_failure_the_screen_is_told_of(self):
		def broken(*args, **kwargs):
			raise frappe.ValidationError("printer gone")

		with patch.object(kitchen_events, "_listeners", lambda hook: [broken]), as_user(MANAGER):
			with self.assertRaises(frappe.ValidationError):
				call(COPY, self.order)

	def test_a_copy_changes_nothing_on_the_order(self):
		before = frappe.db.get_value("Sales Invoice", self.order, ["modified", "kds_status"])
		lines = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": self.order},
			fields=["name", "kds_status", "kds_batch"],
			order_by="idx",
		)
		with listening(Listeners()), as_user(MANAGER):
			call(COPY, self.order)
		self.assertEqual(frappe.db.get_value("Sales Invoice", self.order, ["modified", "kds_status"]), before)
		self.assertEqual(
			frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": self.order},
				fields=["name", "kds_status", "kds_batch"],
				order_by="idx",
			),
			lines,
		)


class TestFollowingACopy(CopyCase):
	def test_the_status_is_what_the_listener_knows_of_the_job(self):
		answer = {"status": "Printed", "printer_online": True, "reason": ""}
		with listening(Listeners(status=answer)) as app, as_user(MANAGER):
			self.assertEqual(call(STATUS, self.order, "tok-1"), answer)
		self.assertEqual((app.asked[0].job, app.asked[0].invoice), ("tok-1", self.order))

	def test_a_job_no_listener_knows_does_not_exist(self):
		with listening(Listeners(status=None)), as_user(MANAGER), self.assertRaises(frappe.DoesNotExistError):
			call(STATUS, self.order, "tok-1")
		with listening(None), as_user(MANAGER), self.assertRaises(frappe.DoesNotExistError):
			call(STATUS, self.order, "tok-1")

	def test_a_tablet_follows_the_copies_of_its_own_restaurants_orders_only(self):
		answer = {"status": "Pending", "printer_online": True, "reason": ""}
		with listening(Listeners(status=answer)), as_user(self.kitchen_tablet):
			self.assertEqual(call(STATUS, self.order, "tok-1"), answer)
		with listening(Listeners(status=answer)) as app:
			self.assert_refused(
				self.kitchen_tablet, "bar order", frappe.get_attr(STATUS), self.bar_order, "tok-1"
			)
			self.assert_refused(self.bar_tablet, "bistro order", frappe.get_attr(STATUS), self.order, "tok-1")
		self.assertEqual(app.asked, [])

	def test_a_job_name_that_is_not_a_name_reaches_no_listener(self):
		with listening(Listeners()) as app, as_user(MANAGER):
			for job in (None, "", ["a"], {"a": 1}, 7):
				with self.subTest(job=job), self.assertRaises(frappe.DoesNotExistError):
					call(STATUS, self.order, job)
		self.assertEqual(app.asked, [])


class TestWhichStationsHaveAPrinter(CopyCase):
	def test_the_screen_is_told_the_stations_of_its_restaurant_that_have_a_printer(self):
		# the printers name stations of both restaurants, and one that does not exist
		listeners = Listeners(stations=[self.grill, self.bar_grill, "gone"])
		with listening(listeners), as_user(MANAGER):
			answer = call(STATIONS, restaurant=self.bistro)
		self.assertEqual(answer["stations"], [self.grill])

	def test_a_tablet_of_one_station_is_told_about_its_own_station_only(self):
		with listening(Listeners(stations=[self.grill, self.pastry])), as_user(self.grill_tablet):
			self.assertEqual(call(STATIONS)["stations"], [self.grill])
		with listening(Listeners(stations=[self.pastry])), as_user(self.grill_tablet):
			self.assertEqual(call(STATIONS)["stations"], [])

	def test_a_tablet_of_every_station_is_told_about_its_restaurants_stations(self):
		with (
			listening(Listeners(stations=[self.grill, self.pastry, self.bar_grill])),
			as_user(self.kitchen_tablet),
		):
			self.assertEqual(sorted(call(STATIONS)["stations"]), sorted([self.grill, self.pastry]))

	def test_the_runners_tablet_asks_with_its_screen(self):
		with listening(Listeners(stations=[self.grill])), as_user(self.runner_tablet):
			self.assertEqual(call(STATIONS, screen=RUNNER)["stations"], [self.grill])
		with listening(Listeners(stations=[self.grill])):
			self.assert_refused(self.runner_tablet, "runner as kitchen", frappe.get_attr(STATIONS))

	def test_a_tablet_cannot_ask_for_another_restaurant(self):
		with listening(Listeners(stations=[self.bar_grill])):
			self.assert_refused(self.kitchen_tablet, "bar", frappe.get_attr(STATIONS), restaurant=self.bar)

	def test_no_printing_app_no_station(self):
		with listening(None), as_user(MANAGER):
			self.assertEqual(call(STATIONS, restaurant=self.bistro)["stations"], [])

	def test_a_listener_that_fails_leaves_the_button_hidden_and_the_screen_working(self):
		def broken():
			raise RuntimeError("no printers table")

		with patch.object(kitchen_events, "_listeners", lambda hook: [broken]), as_user(MANAGER):
			self.assertEqual(call(STATIONS, restaurant=self.bistro)["stations"], [])


class TestWhatATabletMayReach(CopyCase):
	def test_the_calls_of_the_copy_button_are_in_the_list_of_a_tablets_session(self):
		for method in (COPY, STATUS, STATIONS):
			self.assertIn(method, devices.TABLET_METHODS)
