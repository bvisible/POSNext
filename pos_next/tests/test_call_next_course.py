# //// Neoffice — added file (no upstream equivalent).
"""The room's call of a course, where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11: « Oui, les deux modes »).

In that rhythm the later courses of a table are already at the kitchen when the waiter presses « Commander la suite »: they left at « Valider »,
marked `kds_ahead`, and the kitchen may have started and finished them. `restaurant.call_next_course` is the waiter's gesture: it stamps
`kds_called_at` on the lines of the next course that is not called yet, and the screens take it from there. The suite pins:

- what it calls: the next course (the lowest in the order of the meal), a course the waiter names, or every course at once (« Tout commander »);
- that it is atomic: one time for the lines of a call, a course called once, a line already called never stamped again, a save of the till that
  rebuilds the lines at the same time loses nothing;
- that it tells the screens, and that the kitchen's and the runner's lists give the call back;
- what it refuses: a takeaway or a counter order, a restaurant whose rhythm is not « prepared ahead », an order that is not a table's, a
  restaurant that is not the caller's, an account that works at no till, a tablet, a name nobody knows.

The suite builds everything it needs (the menu of `test_service_families`, two restaurants, two tills) and rolls back.
"""

import json
from unittest.mock import patch

import frappe

from pos_next.api import restaurant as restaurant_api
from pos_next.tests.test_service_families import ServiceCase
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, _user

AHEAD = "Prepared ahead"
CALLED = "Called by the room"
OUTSIDER = "call-next-course-outsider@yopmail.com"
PORTAL = "call-next-course-portal@yopmail.com"


class CallCase(ServiceCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("Restaurant", self.a, "service_rhythm", AHEAD)
		# The waiter works at the till of restaurant A, whatever shift the site's test data leaves open for the account that runs the suite
		at_the_till = self.at_the_till_of(self.fx.profile)
		at_the_till.start()
		self.addCleanup(at_the_till.stop)
		self.order = self.save(
			[
				self.line(self.cola),
				self.line(self.soup),
				self.line(self.penne),
				self.line(self.steak),
				self.line(self.tart),
			]
		)

	def called(self, order=None):
		"""(item, called_at) of each line, in the order of the lines."""
		return [
			(row.item_code.replace("_Test SF ", ""), row.kds_called_at)
			for row in frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": order or self.order},
				fields=["item_code", "kds_called_at"],
				order_by="idx asc",
			)
		]

	def names_called(self, order=None):
		return [item for item, called_at in self.called(order) if called_at]


class TestWhatItCalls(CallCase):
	def test_the_next_course_is_the_lowest_one_not_called_yet(self):
		answer = restaurant_api.call_next_course(self.order)

		self.assertEqual((answer["status"], answer["called"], answer["family"]), ("success", 2, "Main"))
		self.assertEqual(self.names_called(), ["Penne", "Steak"], "both lines of the mains, and nothing else")

	def test_every_line_of_a_call_has_the_same_time(self):
		answer = restaurant_api.call_next_course(self.order)

		times = {called_at for _item, called_at in self.called() if called_at}
		self.assertEqual(len(times), 1)
		self.assertEqual(str(times.pop()), answer["called_at"])

	def test_the_next_call_is_the_following_course_then_nothing(self):
		restaurant_api.call_next_course(self.order)
		second = restaurant_api.call_next_course(self.order)
		third = restaurant_api.call_next_course(self.order)

		self.assertEqual((second["called"], second["family"]), (1, "Dessert"))
		self.assertEqual(self.names_called(), ["Penne", "Steak", "Tart"])
		self.assertEqual((third["called"], third["family"], third["called_at"]), (0, "", None))

	def test_a_course_the_waiter_names_is_called_whatever_its_place(self):
		answer = restaurant_api.call_next_course(self.order, family="Dessert")

		self.assertEqual((answer["called"], answer["family"]), (1, "Dessert"))
		self.assertEqual(self.names_called(), ["Tart"])

	def test_everything_is_called_at_once_for_a_table_in_a_hurry(self):
		answer = restaurant_api.call_next_course(self.order, everything=1)

		self.assertEqual(answer["called"], 3)
		self.assertEqual(self.names_called(), ["Penne", "Steak", "Tart"])
		self.assertEqual(len({called_at for _item, called_at in self.called() if called_at}), 1)

	def test_the_lines_that_left_in_the_ordinary_way_are_never_stamped(self):
		restaurant_api.call_next_course(self.order, everything=1)

		by_item = dict(self.called())
		self.assertIsNone(by_item["Cola"])
		self.assertIsNone(by_item["Soup"])

	def test_a_line_already_called_keeps_its_time(self):
		first = restaurant_api.call_next_course(self.order)
		again = restaurant_api.call_next_course(self.order, family="Main")

		self.assertEqual(again["called"], 0)
		self.assertEqual(
			{str(called_at) for item, called_at in self.called() if item in ("Penne", "Steak")},
			{first["called_at"]},
		)

	def test_a_line_held_by_hand_is_not_a_line_to_call(self):
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": self.order, "item_code": self.penne}, "kds_status", "Waiting"
		)

		answer = restaurant_api.call_next_course(self.order)

		self.assertEqual(
			(answer["called"], answer["family"]),
			(1, "Main"),
			"only the main left ahead, not the one held back",
		)
		self.assertEqual(self.names_called(), ["Steak"])

	def test_the_kitchens_list_and_the_runners_give_the_call_back(self):
		restaurant_api.call_next_course(self.order)
		frappe.db.set_value(
			"Sales Invoice Item", {"parent": self.order, "item_code": self.penne}, "kds_status", "Ready"
		)

		orders = {o["name"]: o for o in restaurant_api.get_kds_orders(restaurant=self.a)}
		lines = {line["item_code"].replace("_Test SF ", ""): line for line in orders[self.order]["items"]}
		self.assertTrue(lines["Penne"]["kds_called_at"])
		self.assertIsNone(lines["Tart"]["kds_called_at"])

		runner = {o["name"]: o for o in restaurant_api.get_runner_orders(restaurant=self.a)}
		self.assertTrue(runner[self.order]["items"][0]["kds_called_at"])


class TestAtomicity(CallCase):
	def test_a_save_of_the_till_made_after_the_call_keeps_it(self):
		restaurant_api.call_next_course(self.order)
		called = self.called()

		self.save(
			[
				self.line(self.cola, "Pending", service_family="Drink"),
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Pending", service_family="Main"),
				self.line(self.steak, "Pending", service_family="Main"),
				self.line(self.tart, "Pending", service_family="Dessert"),
				self.line(self.gum),
			],
			name=self.order,
		)

		self.assertEqual(self.called()[:5], called)

	def locked_reads_of(self, action):
		"""The queries `action` runs that read the stored lines of the order FOR UPDATE, with the call among the columns: what the call and the save of the till both do."""
		queries = []
		real = frappe.db.sql

		def spy(query, *args, **kwargs):
			queries.append(str(query))
			return real(query, *args, **kwargs)

		with patch.object(frappe.db, "sql", side_effect=spy):
			action()
		return [
			query
			for query in queries
			if "FOR UPDATE" in query and "tabSales Invoice Item" in query and "kds_called_at" in query
		]

	def test_the_call_and_the_save_lock_the_same_lines_before_they_write(self):
		"""That is what keeps a call from being lost to a save made at the same moment: one waits for the other, in the same order."""
		carts = [
			self.line(self.cola, "Pending", service_family="Drink"),
			self.line(self.soup, "Pending", service_family="Starter"),
		]

		self.assertTrue(self.locked_reads_of(lambda: restaurant_api.call_next_course(self.order)))
		self.assertTrue(self.locked_reads_of(lambda: self.save(carts, name=self.order)))

	def test_the_call_commits_once_and_tells_the_screens(self):
		with (
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe.db, "commit") as commit,
		):
			restaurant_api.call_next_course(self.order)

		self.assertEqual(commit.call_count, 1)
		self.assertEqual({call.args[0] for call in publish.call_args_list}, {"kds_update", "table_update"})

	def test_nothing_to_call_commits_nothing_and_says_nothing(self):
		restaurant_api.call_next_course(self.order, everything=1)

		with (
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe.db, "commit") as commit,
		):
			answer = restaurant_api.call_next_course(self.order)

		self.assertEqual(answer["called"], 0)
		publish.assert_not_called()
		commit.assert_not_called()


class TestWhatItRefuses(CallCase):
	def test_a_restaurant_that_is_called_by_the_room_has_no_course_to_call(self):
		frappe.db.set_value("Restaurant", self.a, "service_rhythm", CALLED)

		with self.assertRaises(frappe.ValidationError):
			restaurant_api.call_next_course(self.order)
		self.assertEqual(self.names_called(), [])

	def test_a_takeaway_and_a_counter_order_have_no_course_to_call(self):
		for changes in (
			{"restaurant_table": None, "is_takeaway": 1, "takeaway_number": "T-001"},
			{"restaurant_table": None},
		):
			with self.subTest(changes=changes):
				order = self.save([self.line(self.soup), self.line(self.penne)], **changes)
				with self.assertRaises(frappe.ValidationError):
					restaurant_api.call_next_course(order)

	def test_a_name_nobody_knows_is_not_found(self):
		for name in ("_Test SF no such invoice", "", None):
			with self.subTest(name=name):
				with self.assertRaises((frappe.DoesNotExistError, frappe.ValidationError)):
					restaurant_api.call_next_course(name)

	def test_a_value_that_is_no_name_is_refused_and_touches_nothing(self):
		with self.assertRaises((frappe.DoesNotExistError, frappe.ValidationError, frappe.PermissionError)):
			restaurant_api.call_next_course({"name": self.order})
		self.assertEqual(self.names_called(), [])

	def test_a_course_that_does_not_exist_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			restaurant_api.call_next_course(self.order, family="Cheese")
		self.assertEqual(self.names_called(), [])

	def test_a_submitted_order_has_nothing_to_call(self):
		frappe.db.set_value("Sales Invoice", self.order, "docstatus", 1, update_modified=False)

		with self.assertRaises(frappe.ValidationError):
			restaurant_api.call_next_course(self.order)

	def test_a_till_of_another_restaurant_cannot_call_the_courses_of_this_one(self):
		self.make_till(self.fx.other_profile, self.b)
		with self.at_the_till_of(self.fx.other_profile):
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.call_next_course(self.order)
		self.assertEqual(self.names_called(), [])

	def test_the_tills_own_restaurant_may_call(self):
		with self.at_the_till_of(self.fx.profile):
			answer = restaurant_api.call_next_course(self.order)

		self.assertEqual(answer["called"], 2)

	def test_a_portal_account_and_a_visitor_are_refused_before_anything_is_looked_up(self):
		_user(PORTAL, [CASHIER_ROLE], "Website User")
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user):
				frappe.set_user(user)
				try:
					with self.assertRaises(frappe.PermissionError):
						restaurant_api.call_next_course(self.order)
					with self.assertRaises(frappe.PermissionError):
						restaurant_api.call_next_course("_Test SF no such invoice")
				finally:
					frappe.set_user("Administrator")
		self.assertEqual(self.names_called(), [])

	def test_a_desk_account_that_works_at_no_till_is_refused(self):
		_user(OUTSIDER, ["Blogger"], "System User")
		frappe.set_user(OUTSIDER)
		try:
			with self.assertRaises(frappe.PermissionError):
				restaurant_api.call_next_course(self.order)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(self.names_called(), [])

	def test_the_cashier_of_the_till_may_call(self):
		from pos_next.tests.test_till_writes_need_the_till import TILL

		frappe.set_user(TILL)
		try:
			answer = restaurant_api.call_next_course(self.order)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(answer["called"], 2)

	def test_it_is_a_post_only_endpoint_that_the_web_serves(self):
		self.assertIn(restaurant_api.call_next_course, frappe.whitelisted)
		self.assertEqual(
			list(frappe.allowed_http_methods_for_whitelisted_func[restaurant_api.call_next_course]), ["POST"]
		)

	def test_the_payload_of_a_web_call_is_read_as_text(self):
		"""The web sends every argument as text: « 0 » is not « everything »."""
		answer = restaurant_api.call_next_course(self.order, everything="0")

		self.assertEqual(answer["called"], 2)
		restaurant_api.call_next_course(self.order, everything=json.loads("1"))
		self.assertEqual(self.names_called(), ["Penne", "Steak", "Tart"])
