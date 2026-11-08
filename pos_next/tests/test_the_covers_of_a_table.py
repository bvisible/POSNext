# //// Neoffice — added file (no upstream equivalent).
"""The covers of a table (NeoResto lot 1): how many people are seated, kept on the table's order and told to the screens.

A waiter opens a table and says how many people are seated (3 at a table of 4). The number lives on the table's open order, a
draft Sales Invoice, in the hidden Custom Field `restaurant_covers`. The kitchen's screens, the pass and the printed ticket show it
next to the portions the whole order holds of each service course, so that « Mains 2/3 » can be shown. A restaurant setting says
whether the till asks the number when a table is first opened. The suite pins:

- the field (hidden, read-only, Int, after the table), the setting (a Check, on by default, listed in the till's settings screen,
  read by the till) and what the till's settings call takes in;
- the till's save (`update_invoice`): a payload that carries the number stores it, one that does not leaves the stored number
  alone, a number nobody can seat is refused, and a payment (`submit_invoice`) never rewrites it;
- `set_table_covers`: the waiter changing the number of an order that exists, with the rights of the till's other table acts,
  the screens told, and nothing stored when it refuses;
- what is read back: `open_table`, `get_table_order`, the tables' `order_summary`, and the orders of the kitchen's and the pass's
  screens (`covers`, and `family_counts`: the portions of the WHOLE order per course, not the station's, tip and drinks left out).

The suite builds its own restaurants, tills, menu and orders (those of `test_service_families`) and rolls everything back. The
people it acts as are the waiter (the cashier of the till), the restaurant's administrator and the accounts that must be refused
(neoffice-maintenance#2125): never Administrator, who only prepares the scenery.
"""

import json
from unittest.mock import patch

import frappe

# //// Neoffice — the people a test acts as (neoffice-maintenance#2125).
from frappe.tests.roles import as_role
from frappe.utils import cint

from pos_next import hooks
from pos_next.api import invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import covers, devices, service_families
from pos_next.restaurant import settings as restaurant_config
from pos_next.tests.test_service_families import TARTS, ServiceCase, an_item
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, TILL, _sale, _user
from pos_next.till_settings import registry

OUTSIDER = "covers-outsider@yopmail.com"
PORTAL = "covers-portal@yopmail.com"
TIP = "_Test Covers Tip"
# What nobody can seat: negative, too many, not a number, not a whole number
NOT_A_NUMBER_OF_PEOPLE = (-1, 100, "abc", 2.5)


class CoversCase(ServiceCase):
	"""Restaurant A with its table T1, its till, and the menu of the service families: a drink, two starters, two mains, a dessert."""

	def setUp(self):
		super().setUp()
		# The waiter works at the till of restaurant A, whatever shift the site's test data leaves open for the account that runs the suite
		at_the_till = self.at_the_till_of(self.fx.profile)
		at_the_till.start()
		self.addCleanup(at_the_till.stop)
		self.table_a2 = self.make_table(self.a, self.room_a, table_name="T2")

	def waiter(self):
		"""The cashier of the till: whoever opens a table and takes its order."""
		return as_role("cashier", email=TILL)

	def save(self, lines=None, name=None, **changes):
		"""One save of the till (update_invoice) of a table's order, as the waiter; the order's name."""
		lines = [self.line(self.soup)] if lines is None else lines
		with self.waiter():
			return super().save(lines, name, **changes)

	def a_meal(self, **changes):
		"""A table's order: 2 drinks, 3 starters (a soup and 2 salads), a main, a dessert, and a pack of gum that follows no course."""
		return self.save(
			[
				self.line(self.cola, qty=2),
				self.line(self.soup),
				self.line(self.salad, qty=2),
				self.line(self.penne),
				self.line(self.tart),
				self.line(self.gum),
			],
			**changes,
		)

	def covers_of(self, order):
		# The column is an Int, NOT NULL: nobody said how many are seated is stored as 0, which every read maps back to None
		return cint(frappe.db.get_value("Sales Invoice", order, "restaurant_covers")) or None

	def modified_of(self, order):
		return frappe.db.get_value("Sales Invoice", order, "modified")

	def kitchen_order(self, order, **filters):
		with self.waiter():
			orders = restaurant_api.get_kds_orders(restaurant=self.a, **filters)
		return next((row for row in orders if row["name"] == order), None)

	def pass_order(self, order):
		with self.waiter():
			orders = restaurant_api.get_runner_orders(restaurant=self.a)
		return next((row for row in orders if row["name"] == order), None)


class TestTheFieldAndTheSetting(CoversCase):
	def test_the_order_has_a_hidden_read_only_whole_number_after_the_table(self):
		field = frappe.get_meta("Sales Invoice").get_field("restaurant_covers")

		self.assertEqual((field.fieldtype, field.hidden, field.read_only), ("Int", 1, 1))
		self.assertEqual(field.no_copy, 1, "a copy of an order is another party")
		fixtures = frappe.get_file_json(frappe.get_app_path("pos_next", "fixtures", "custom_field.json"))
		shipped = next(row for row in fixtures if row["name"] == "Sales Invoice-restaurant_covers")
		self.assertEqual(
			(shipped["dt"], shipped["fieldname"], shipped["insert_after"], shipped["label"]),
			("Sales Invoice", "restaurant_covers", "restaurant_table", "Covers"),
		)

	def test_the_field_is_listed_among_the_custom_fields_the_app_exports(self):
		self.assertIn("Sales Invoice-restaurant_covers", hooks._custom_field_names)

	def test_the_restaurant_has_a_check_that_is_on_by_default(self):
		field = frappe.get_meta("Restaurant").get_field("ask_covers_on_open")

		self.assertEqual((field.fieldtype, str(field.default)), ("Check", "1"))
		self.assertEqual(frappe.db.get_value("Restaurant", self.a, "ask_covers_on_open"), 1)

	def test_a_restaurant_that_never_chose_asks(self):
		with self.waiter():
			settings = restaurant_api.get_restaurant_settings(self.a)

		self.assertEqual(settings["ask_covers_on_open"], 1)

	def test_each_restaurant_has_its_own_choice(self):
		with as_role("client_admin"):
			restaurant_api.save_restaurant_settings({"ask_covers_on_open": 0}, restaurant=self.a)
		with self.waiter():
			one = restaurant_api.get_restaurant_settings(self.a)
			other = restaurant_api.get_restaurant_settings(self.b)

		self.assertEqual(one["ask_covers_on_open"], 0)
		self.assertEqual(other["ask_covers_on_open"], 1)
		with as_role("client_admin"):
			restaurant_api.save_restaurant_settings({"ask_covers_on_open": 1}, restaurant=self.a)
		with self.waiter():
			self.assertEqual(restaurant_api.get_restaurant_settings(self.a)["ask_covers_on_open"], 1)

	def test_the_settings_save_takes_it_among_the_restaurants_own_settings(self):
		self.assertIn("ask_covers_on_open", restaurant_config.RESTAURANT_ONLY_SETTINGS)
		self.assertNotIn(
			"ask_covers_on_open",
			restaurant_config.SETTINGS_FIELDS,
			"the former single has no such field: the patch that moved it into a restaurant has nothing to copy",
		)

	def test_it_is_listed_in_the_restaurant_tab_group_tables_for_a_restaurant_till(self):
		setting = registry.get("ask_covers_on_open")

		self.assertEqual(setting.doctype, registry.RESTAURANT)
		self.assertEqual(setting.group, "tables")
		self.assertEqual(setting.tab, "restaurant")
		self.assertEqual(setting.till, registry.RESTAURANT_TILL)
		self.assertEqual(setting.widget, "check")
		self.assertEqual(setting.applies, registry.APPLIES_RESTAURANT)
		self.assertTrue(str(setting.help))
		self.assertFalse(setting.restaurant_manager_may_edit)


class TestTheTillsSaveKeepsTheNumber(CoversCase):
	def test_an_order_saved_with_the_number_keeps_it(self):
		order = self.save(restaurant_covers=3)

		self.assertEqual(self.covers_of(order), 3)

	def test_an_order_saved_without_the_key_has_no_number(self):
		order = self.save()

		self.assertIsNone(self.covers_of(order))

	def test_a_later_save_without_the_key_leaves_the_number_alone(self):
		order = self.save(restaurant_covers=3)

		again = self.save([self.line(self.soup, "Pending"), self.line(self.penne)], name=order)

		self.assertEqual(again, order)
		self.assertEqual(self.covers_of(order), 3, "never overwritten with nothing")

	def test_a_later_save_with_a_new_number_changes_it(self):
		order = self.save(restaurant_covers=3)

		self.save(name=order, restaurant_covers=5)

		self.assertEqual(self.covers_of(order), 5)

	def test_a_number_may_be_sent_as_text_or_as_a_whole_float(self):
		order = self.save(restaurant_covers="4")
		self.assertEqual(self.covers_of(order), 4)

		self.save(name=order, restaurant_covers=6.0)
		self.assertEqual(self.covers_of(order), 6)

	def test_zero_nothing_and_an_empty_text_take_the_number_away(self):
		order = self.save(restaurant_covers=3)
		for none in (0, "0", None, ""):
			with self.subTest(sent=none):
				self.save(name=order, restaurant_covers=3)
				self.assertEqual(self.covers_of(order), 3)

				self.save(name=order, restaurant_covers=none)

				self.assertIsNone(self.covers_of(order))

	def test_a_number_nobody_can_seat_is_refused_and_the_stored_one_stays(self):
		order = self.save(restaurant_covers=3)

		for sent in NOT_A_NUMBER_OF_PEOPLE:
			with self.subTest(sent=sent):
				with self.assertRaises(frappe.ValidationError):
					self.save(name=order, restaurant_covers=sent)
				self.assertEqual(self.covers_of(order), 3)

	def test_a_number_nobody_can_seat_creates_no_order(self):
		before = frappe.db.count("Sales Invoice", {"restaurant_table": self.table_a2})

		for sent in NOT_A_NUMBER_OF_PEOPLE:
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.save(restaurant_table=self.table_a2, restaurant_covers=sent)

		self.assertEqual(frappe.db.count("Sales Invoice", {"restaurant_table": self.table_a2}), before)

	def test_the_callers_own_payload_is_not_touched(self):
		"""The save reads the number once and builds the document without it, from a copy: a payload handed in as a dict keeps its key."""
		payload = _sale(
			self.fx, items=[self.line(self.soup)], restaurant_table=self.table_a, restaurant_covers=4
		)

		with self.waiter():
			name = invoices.update_invoice(payload)["name"]

		self.assertEqual(self.covers_of(name), 4)
		self.assertEqual(payload["restaurant_covers"], 4)


class TestThePaymentKeepsTheNumber(CoversCase):
	def pay(self, order, **changes):
		"""The payment of the order as the till sends it (submit_invoice), the payload as it is built for a payment."""
		payload = _sale(
			self.fx,
			name=order,
			restaurant_table=self.table_a,
			items=[self.line(self.soup, "Pending")],
			payments=[{"mode_of_payment": self.fx.mode, "amount": 10}],
			**changes,
		)
		with as_role("cashier", email=TILL):
			return invoices.submit_invoice(invoice=json.dumps(payload), data="{}")

	def test_the_number_survives_a_payment_whose_payload_does_not_carry_it(self):
		order = self.save(restaurant_covers=3)

		self.pay(order)

		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "docstatus"), 1)
		self.assertEqual(self.covers_of(order), 3)

	def test_a_payment_never_rewrites_it(self):
		order = self.save(restaurant_covers=3)

		self.pay(order, restaurant_covers=9)

		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "docstatus"), 1)
		self.assertEqual(self.covers_of(order), 3)

	def test_an_order_paid_at_once_keeps_the_number_it_came_with(self):
		"""An order the till never saved as a draft (a sale made offline and replayed) is made by the payment itself."""
		payload = _sale(
			self.fx,
			restaurant_table=self.table_a,
			items=[self.line(self.soup, "Pending")],
			payments=[{"mode_of_payment": self.fx.mode, "amount": 10}],
			restaurant_covers=2,
		)
		with as_role("cashier", email=TILL):
			done = invoices.submit_invoice(invoice=json.dumps(payload), data="{}")

		self.assertEqual(self.covers_of(done["name"]), 2)


class TestChangingTheNumberOfAnOrder(CoversCase):
	def setUp(self):
		super().setUp()
		self.order = self.save(restaurant_covers=3)

	def set_covers(self, covers, order=...):
		"""The waiter changes the number of the order (the setUp's unless another is named, whatever it is: None and "" included)."""
		with self.waiter():
			return restaurant_api.set_table_covers(self.order if order is ... else order, covers)

	def test_it_writes_the_number_and_says_it(self):
		answer = self.set_covers(4)

		self.assertEqual(answer, {"covers": 4})
		self.assertEqual(self.covers_of(self.order), 4)

	def test_it_takes_a_number_written_as_text_as_the_web_sends_it(self):
		self.assertEqual(self.set_covers("5"), {"covers": 5})
		self.assertEqual(self.covers_of(self.order), 5)

	def test_the_same_number_again_is_no_change_and_no_error(self):
		self.assertEqual(self.set_covers(3), {"covers": 3})
		self.assertEqual(self.covers_of(self.order), 3)

	def test_zero_nothing_and_an_empty_text_take_the_number_away(self):
		for none in (0, "0", None, ""):
			with self.subTest(sent=none):
				self.set_covers(4)

				self.assertEqual(self.set_covers(none), {"covers": None})
				self.assertIsNone(self.covers_of(self.order))

	def test_the_order_is_not_touched_otherwise(self):
		"""Counting the people is no change of the order the kitchen should read as new: its modification time stays."""
		before = self.modified_of(self.order)
		lines = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": self.order},
			fields=["name", "kds_status"],
			order_by="idx asc",
		)

		self.set_covers(6)

		self.assertEqual(self.modified_of(self.order), before)
		self.assertEqual(
			frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": self.order},
				fields=["name", "kds_status"],
				order_by="idx asc",
			),
			lines,
		)

	def test_a_number_nobody_can_seat_is_refused_and_the_stored_one_stays(self):
		for sent in NOT_A_NUMBER_OF_PEOPLE:
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.set_covers(sent)
			self.assertEqual(self.covers_of(self.order), 3)

	def test_a_submitted_order_has_no_one_to_seat(self):
		frappe.db.set_value("Sales Invoice", self.order, "docstatus", 1, update_modified=False)

		with self.assertRaises(frappe.ValidationError):
			self.set_covers(4)

		self.assertEqual(self.covers_of(self.order), 3)

	def test_an_order_that_sits_at_no_table_has_no_one_to_seat(self):
		for changes in (
			{"restaurant_table": None},
			{"restaurant_table": None, "is_takeaway": 1, "takeaway_number": "T-001"},
		):
			with self.subTest(changes=changes):
				order = self.save(**changes)
				with self.assertRaises(frappe.ValidationError):
					self.set_covers(4, order)
				self.assertIsNone(self.covers_of(order))

	def test_a_name_nobody_knows_is_not_found(self):
		for name in ("_Test Covers no such invoice", "", None):
			with (
				self.subTest(name=name),
				self.assertRaises((frappe.DoesNotExistError, frappe.ValidationError)),
			):
				self.set_covers(4, name)

	def test_a_value_that_is_no_name_is_refused_and_touches_nothing(self):
		with self.assertRaises((frappe.DoesNotExistError, frappe.ValidationError, frappe.PermissionError)):
			self.set_covers(4, {"name": self.order})

		self.assertEqual(self.covers_of(self.order), 3)

	def test_it_tells_the_screens_after_it_commits(self):
		with (
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe.db, "commit") as commit,
		):
			self.set_covers(4)

		self.assertEqual(commit.call_count, 1)
		self.assertEqual({call.args[0] for call in publish.call_args_list}, {"kds_update", "table_update"})

	def test_a_refusal_tells_no_screen_and_commits_nothing(self):
		with (
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe.db, "commit") as commit,
			self.assertRaises(frappe.ValidationError),
		):
			self.set_covers(100)

		publish.assert_not_called()
		commit.assert_not_called()

	def test_it_waits_for_the_lock_a_save_of_the_till_takes_on_the_lines(self):
		"""A save of the till locks the lines of the order before it reads it and writes it back whole: the number is written after it."""
		with patch.object(service_families, "stored_lines", wraps=service_families.stored_lines) as read:
			self.set_covers(4)

		read.assert_called_once()
		self.assertEqual(read.call_args.args[0], self.order)
		self.assertTrue(read.call_args.kwargs.get("lock"))

	def test_it_is_a_post_only_endpoint_the_web_serves_and_no_tablet_calls(self):
		self.assertIn(restaurant_api.set_table_covers, frappe.whitelisted)
		self.assertEqual(
			list(frappe.allowed_http_methods_for_whitelisted_func[restaurant_api.set_table_covers]), ["POST"]
		)
		self.assertNotIn("pos_next.api.restaurant.set_table_covers", devices.TABLET_METHODS)


class TestWhoMayChangeTheNumber(CoversCase):
	def setUp(self):
		super().setUp()
		self.order = self.save(restaurant_covers=3)

	def refused_to(self, user):
		with as_role(user), self.assertRaises(frappe.PermissionError):
			restaurant_api.set_table_covers(self.order, 4)
		self.assertEqual(self.covers_of(self.order), 3)

	def test_the_waiter_of_the_till_may(self):
		with self.waiter():
			answer = restaurant_api.set_table_covers(self.order, 4)

		self.assertEqual(answer, {"covers": 4})

	def test_a_till_manager_may_at_any_till(self):
		with as_role("till_manager"):
			answer = restaurant_api.set_table_covers(self.order, 5)

		self.assertEqual(answer, {"covers": 5})

	def test_a_desk_account_that_works_at_no_till_is_refused(self):
		_user(OUTSIDER, ["Blogger"], "System User")

		self.refused_to(OUTSIDER)

	def test_a_portal_account_and_a_visitor_are_refused_before_anything_is_looked_up(self):
		_user(PORTAL, [CASHIER_ROLE], "Website User")
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user):
				self.refused_to(user)
				with as_role(user), self.assertRaises(frappe.PermissionError):
					restaurant_api.set_table_covers("_Test Covers no such invoice", 4)

	def test_a_till_of_another_restaurant_cannot_seat_the_tables_of_this_one(self):
		self.make_till(self.fx.other_profile, self.b)

		with (
			self.at_the_till_of(self.fx.other_profile),
			self.waiter(),
			self.assertRaises(frappe.PermissionError),
		):
			restaurant_api.set_table_covers(self.order, 4)

		self.assertEqual(self.covers_of(self.order), 3)


class TestWhatTheTillReadsBack(CoversCase):
	def test_a_table_reopened_gives_back_its_people(self):
		order = self.save(restaurant_covers=3)

		with self.waiter():
			opened = restaurant_api.open_table(self.table_a, self.fx.profile)

		self.assertEqual((opened["name"], opened["is_new"], opened["covers"]), (order, False, 3))

	def test_a_table_reopened_with_nobody_said_reads_none_not_zero(self):
		self.save()

		with self.waiter():
			opened = restaurant_api.open_table(self.table_a, self.fx.profile)

		self.assertIn("covers", opened)
		self.assertIsNone(opened["covers"])

	def test_a_table_with_no_order_yet_says_none_in_the_same_shape(self):
		with self.waiter():
			opened = restaurant_api.open_table(self.table_a2, self.fx.profile)

		self.assertTrue(opened["is_new"])
		self.assertIn("covers", opened)
		self.assertIsNone(opened["covers"])

	def test_the_order_of_a_table_gives_back_its_people(self):
		self.save(restaurant_covers=3)

		with self.waiter():
			order = restaurant_api.get_table_order(self.table_a)

		self.assertEqual(order["covers"], 3)

	def test_the_order_of_a_table_with_nobody_said_reads_none(self):
		self.save()

		with self.waiter():
			order = restaurant_api.get_table_order(self.table_a)

		self.assertIn("covers", order)
		self.assertIsNone(order["covers"])

	def test_the_number_changed_from_the_header_is_what_the_table_gives_back(self):
		order = self.save(restaurant_covers=3)
		with self.waiter():
			restaurant_api.set_table_covers(order, 5)

			self.assertEqual(restaurant_api.open_table(self.table_a, self.fx.profile)["covers"], 5)
			self.assertEqual(restaurant_api.get_table_order(self.table_a)["covers"], 5)

	def test_the_list_of_tables_tells_the_people_of_each_open_order(self):
		self.save(restaurant_covers=3)
		self.save(restaurant_table=self.table_a2)

		with self.waiter():
			tables = {row["name"]: row for row in restaurant_api.get_tables(restaurant=self.a)["tables"]}

		self.assertEqual(tables[self.table_a]["order_summary"]["covers"], 3)
		self.assertIn("covers", tables[self.table_a2]["order_summary"])
		self.assertIsNone(tables[self.table_a2]["order_summary"]["covers"])

	def test_a_table_with_no_order_has_no_summary_to_carry_it(self):
		with self.waiter():
			tables = {row["name"]: row for row in restaurant_api.get_tables(restaurant=self.a)["tables"]}

		self.assertIsNone(tables[self.table_a2]["order_summary"])


class TestWhatTheKitchenAndThePassRead(CoversCase):
	def test_the_kitchen_tells_the_people_and_the_portions_of_each_course(self):
		order = self.a_meal(restaurant_covers=3)

		ticket = self.kitchen_order(order)

		self.assertEqual(ticket["covers"], 3)
		# 3 starters (the soup and 2 salads), a main and a dessert: the drinks and the gum follow no course
		self.assertEqual(ticket["family_counts"], {"Starter": 3, "Main": 1, "Dessert": 1})

	def test_an_order_with_nobody_said_says_none_and_still_counts_its_courses(self):
		order = self.a_meal()

		ticket = self.kitchen_order(order)

		self.assertIn("covers", ticket)
		self.assertIsNone(ticket["covers"])
		self.assertEqual(ticket["family_counts"], {"Starter": 3, "Main": 1, "Dessert": 1})

	def test_an_order_of_drinks_alone_counts_no_course(self):
		order = self.save([self.line(self.cola, qty=2)], restaurant_covers=2)

		ticket = self.kitchen_order(order)

		self.assertEqual(ticket["covers"], 2)
		self.assertEqual(ticket["family_counts"], {})

	def test_the_count_is_the_whole_orders_not_the_stations(self):
		order = self.a_meal(restaurant_covers=3)
		# Only the soup is the kitchen station's: the screen of that station draws one line
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order, "item_code": self.soup},
			"preparation_station",
			self.station_a,
			update_modified=False,
		)

		ticket = self.kitchen_order(order, station=self.station_a)

		self.assertEqual([line["item_code"] for line in ticket["items"]], [self.soup])
		self.assertEqual(ticket["family_counts"], {"Starter": 3, "Main": 1, "Dessert": 1})
		self.assertEqual(ticket["covers"], 3)

	def test_the_count_includes_the_dishes_held_back_and_the_ones_already_delivered(self):
		order = self.a_meal(restaurant_covers=3)
		# The room's rhythm held the main and the dessert back (Waiting); the salads are delivered already
		statuses = dict(
			frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": order},
				fields=["item_code", "kds_status"],
				as_list=True,
			)
		)
		self.assertEqual((statuses[self.penne], statuses[self.tart]), ("Waiting", "Waiting"))
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order, "item_code": self.salad},
			"kds_status",
			"Delivered",
			update_modified=False,
		)

		ticket = self.kitchen_order(order)

		self.assertEqual(ticket["family_counts"], {"Starter": 3, "Main": 1, "Dessert": 1})

	def test_the_tip_is_no_dish(self):
		order = self.a_meal(restaurant_covers=3)
		tip = an_item(TIP, TARTS, self.company)
		frappe.db.set_value("Restaurant", self.a, "tip_item", tip)
		frappe.clear_document_cache("Restaurant", self.a)
		# The tip's line sits on the order like the guests' tips do: written by the payment, in a group that has a family
		frappe.get_doc(
			{
				"doctype": "Sales Invoice Item",
				"parent": order,
				"parenttype": "Sales Invoice",
				"parentfield": "items",
				"idx": 99,
				"item_code": tip,
				"item_name": tip,
				"qty": 1,
				"rate": 2,
				"service_family": "Dessert",
				"kds_status": "Pending",
			}
		).db_insert()

		ticket = self.kitchen_order(order)

		self.assertEqual(
			ticket["family_counts"],
			{"Starter": 3, "Main": 1, "Dessert": 1},
			"the tip is not a second dessert",
		)

	def test_a_line_that_was_stored_with_no_family_is_counted_by_the_group_of_its_item(self):
		order = self.a_meal(restaurant_covers=3)
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order, "item_code": self.penne},
			"service_family",
			"",
			update_modified=False,
		)

		ticket = self.kitchen_order(order)

		self.assertEqual(ticket["family_counts"]["Main"], 1)

	def test_the_waiter_who_gave_a_line_another_course_moves_it(self):
		order = self.a_meal(restaurant_covers=3)
		# « une entrée prise en plat »: the soup is eaten as a main
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order, "item_code": self.soup},
			"service_family",
			"Main",
			update_modified=False,
		)

		ticket = self.kitchen_order(order)

		self.assertEqual(ticket["family_counts"], {"Starter": 2, "Main": 2, "Dessert": 1})

	def test_the_pass_tells_the_people_and_the_portions_of_the_whole_order(self):
		order = self.a_meal(restaurant_covers=3)
		# Only the drinks are at the pass: everything else is still at the kitchen or held back
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order, "item_code": self.cola},
			{"preparation_station": self.station_a, "kds_status": "Ready"},
			update_modified=False,
		)

		ticket = self.pass_order(order)

		self.assertEqual([line["item_code"] for line in ticket["items"]], [self.cola])
		self.assertEqual(ticket["covers"], 3)
		self.assertEqual(ticket["family_counts"], {"Starter": 3, "Main": 1, "Dessert": 1})

	def test_the_pass_says_none_for_an_order_with_nobody_said(self):
		order = self.a_meal()
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order},
			{"preparation_station": self.station_a, "kds_status": "Ready"},
			update_modified=False,
		)

		ticket = self.pass_order(order)

		self.assertIn("covers", ticket)
		self.assertIsNone(ticket["covers"])
		self.assertEqual(ticket["family_counts"], {"Starter": 3, "Main": 1, "Dessert": 1})

	def test_each_order_of_a_list_has_its_own_count(self):
		one = self.save([self.line(self.soup), self.line(self.salad)], restaurant_covers=2)
		two = self.save(
			[self.line(self.soup), self.line(self.penne), self.line(self.steak)],
			restaurant_table=self.table_a2,
			restaurant_covers=5,
		)

		with self.waiter():
			tickets = {row["name"]: row for row in restaurant_api.get_kds_orders(restaurant=self.a)}

		self.assertEqual((tickets[one]["covers"], tickets[one]["family_counts"]), (2, {"Starter": 2}))
		self.assertEqual(
			(tickets[two]["covers"], tickets[two]["family_counts"]), (5, {"Starter": 1, "Main": 2})
		)

	def test_a_list_of_orders_is_read_once_not_once_per_order(self):
		for table in (self.table_a, self.table_a2, self.make_table(self.a, self.room_a, table_name="T3")):
			self.save(
				[self.line(self.soup), self.line(self.penne)], restaurant_table=table, restaurant_covers=2
			)

		with (
			patch.object(covers, "read", wraps=covers.read) as read,
			patch.object(service_families, "stamp_lines", wraps=service_families.stamp_lines) as stamp_lines,
			self.waiter(),
		):
			tickets = restaurant_api.get_kds_orders(restaurant=self.a)

		self.assertEqual(len(tickets), 3)
		read.assert_called_once()
		# The lines of every ticket are given their families together: once for the screen's own lines (as before) and once for the count
		self.assertEqual(stamp_lines.call_count, 2)
