# //// Neoffice — added file (no upstream equivalent).
"""The portions a kitchen has made (NeoResto lot 1, Daniel, 02.11: « la cuisine dit tu peux encore en faire 2, 3, 5 »).

Any product of a card can be counted: a dish, a drink, a dessert. The kitchen says how many portions it made today, the
orders take them one by one, and when none is left the till says so; when the kitchen can make more, somebody adds portions.
A product whose STOCK is managed is counted by its stock: the portions do not apply to it. The suite pins:

- what is left: the portions made today less the quantities of today's orders (saved drafts and sales, every table), the orders of the
  table on screen being left out of the count so that the till can subtract its own cart;
- the day: portions made on another day limit nothing, and adding portions on a new day starts the count again;
- adding portions: a whole number above zero, only to a counted product, never to one counted by stock;
- the restaurant's choice of what a sold-out dish does at the till (grey out and refuse, or warn only), served with its settings;
- what the guest page reads.

The suite builds everything it needs and rolls back.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.api import portions as portions_api
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import portions
from pos_next.tests.test_service_families import ServiceCase


class PortionsCase(ServiceCase):
	def setUp(self):
		super().setUp()
		# Nothing of the suite is committed, nor published to the tills
		self.published = []
		original = frappe.publish_realtime
		self.addCleanup(setattr, frappe, "publish_realtime", original)
		frappe.publish_realtime = lambda event, message=None, **kwargs: self.published.append((event, message))

	def left(self, item, **kwargs):
		return portions.state([item], **kwargs).get(item, {}).get("left")


class TestWhatIsLeft(PortionsCase):
	def test_a_product_nobody_counted_has_no_state(self):
		self.assertEqual(portions.state([self.soup]), {})

	def test_the_kitchen_makes_five_and_five_are_left(self):
		portions.set_made(self.soup, counted=True, made=5)

		self.assertEqual(portions.state([self.soup])[self.soup], {"counted": True, "made": 5, "sold": 0, "left": 5})

	def test_an_order_takes_its_portions(self):
		portions.set_made(self.soup, counted=True, made=5)
		self.save([self.line(self.soup, qty=2)])

		state = portions.state([self.soup])[self.soup]
		self.assertEqual((state["sold"], state["left"]), (2, 3))

	def test_the_orders_of_every_table_count(self):
		portions.set_made(self.soup, counted=True, made=5)
		self.save([self.line(self.soup, qty=2)])
		other = self.make_table(self.a, self.room_a, "T2")
		self.save([self.line(self.soup, qty=1)], restaurant_table=other)

		self.assertEqual(self.left(self.soup), 2)

	def test_the_table_on_screen_can_be_left_out(self):
		portions.set_made(self.soup, counted=True, made=5)
		order = self.save([self.line(self.soup, qty=2)])
		other = self.make_table(self.a, self.room_a, "T2")
		self.save([self.line(self.soup, qty=1)], restaurant_table=other)

		self.assertEqual(self.left(self.soup, exclude_invoice=order), 4)

	def test_an_order_that_goes_gives_its_portions_back(self):
		portions.set_made(self.soup, counted=True, made=5)
		order = self.save([self.line(self.soup, qty=2)])
		frappe.delete_doc("Sales Invoice", order, force=1, ignore_permissions=True)

		self.assertEqual(self.left(self.soup), 5)

	def test_the_other_products_of_an_order_take_nothing(self):
		portions.set_made(self.soup, counted=True, made=5)
		self.save([self.line(self.cola, qty=3), self.line(self.soup, qty=1)])

		self.assertEqual(self.left(self.soup), 4)

	def test_more_is_sold_than_was_made_and_what_is_left_goes_below_zero(self):
		portions.set_made(self.soup, counted=True, made=1)
		self.save([self.line(self.soup, qty=3)])

		self.assertEqual(self.left(self.soup), -2)

	def test_a_product_switched_off_is_no_longer_counted(self):
		portions.set_made(self.soup, counted=True, made=5)
		portions.set_made(self.soup, counted=False, made=5)

		self.assertEqual(portions.state([self.soup]), {})

	def test_a_product_counted_by_its_stock_is_left_to_its_stock(self):
		frappe.db.set_value("Item", self.soup, "is_stock_item", 1)
		portions.set_made(self.soup, counted=True, made=5)

		self.assertEqual(portions.state([self.soup]), {})


class TestTheDay(PortionsCase):
	def test_portions_made_on_another_day_limit_nothing(self):
		portions.set_made(self.soup, counted=True, made=5)
		frappe.db.set_value("Restaurant Portion", self.soup, "service_date", add_days(nowdate(), -1))

		state = portions.state([self.soup])[self.soup]
		self.assertEqual((state["counted"], state["made"], state["left"]), (True, None, None))

	def test_the_orders_of_another_day_are_not_today_s(self):
		portions.set_made(self.soup, counted=True, made=5)
		order = self.save([self.line(self.soup, qty=2)])
		frappe.db.set_value("Sales Invoice", order, "posting_date", add_days(nowdate(), -1))

		self.assertEqual(self.left(self.soup), 5)

	def test_portions_added_on_a_new_day_start_the_count_again(self):
		portions.set_made(self.soup, counted=True, made=5)
		frappe.db.set_value("Restaurant Portion", self.soup, "service_date", add_days(nowdate(), -1))

		portions.add(self.soup, 3)

		self.assertEqual(portions.state([self.soup])[self.soup]["made"], 3)


class TestAddingPortions(PortionsCase):
	def test_the_kitchen_can_make_more(self):
		portions.set_made(self.soup, counted=True, made=5)
		self.save([self.line(self.soup, qty=5)])
		self.assertEqual(self.left(self.soup), 0)

		portions.add(self.soup, 3)

		state = portions.state([self.soup])[self.soup]
		self.assertEqual((state["made"], state["left"]), (8, 3))

	def test_adding_to_a_dish_sold_beyond_what_was_made_counts_from_what_is_owed(self):
		portions.set_made(self.soup, counted=True, made=1)
		self.save([self.line(self.soup, qty=3)])

		portions.add(self.soup, 3)

		self.assertEqual(self.left(self.soup), 1)

	def test_a_whole_number_above_zero(self):
		portions.set_made(self.soup, counted=True, made=5)
		for refused in (0, -1, 2.5, "x", None):
			with self.subTest(quantity=refused), self.assertRaises(frappe.ValidationError):
				portions.add(self.soup, refused)
		self.assertEqual(self.left(self.soup), 5)

	def test_only_a_counted_product(self):
		with self.assertRaises(frappe.ValidationError):
			portions.add(self.soup, 3)
		portions.set_made(self.soup, counted=False, made=0)
		with self.assertRaises(frappe.ValidationError):
			portions.add(self.soup, 3)

	def test_never_a_product_counted_by_its_stock(self):
		portions.set_made(self.soup, counted=True, made=5)
		frappe.db.set_value("Item", self.soup, "is_stock_item", 1)

		with self.assertRaises(frappe.ValidationError):
			portions.add(self.soup, 3)

	def test_the_tills_are_told(self):
		portions.set_made(self.soup, counted=True, made=5)
		self.published.clear()

		portions.add(self.soup, 2)

		self.assertEqual([event for event, _message in self.published], ["pos_portions_updated"])
		self.assertEqual(self.published[0][1], {"items": [self.soup]})

	def test_an_order_tells_the_tills_only_when_it_holds_a_counted_product(self):
		portions.set_made(self.soup, counted=True, made=5)
		self.published.clear()

		self.save([self.line(self.cola)])
		self.assertNotIn("pos_portions_updated", [event for event, _message in self.published])

		self.save([self.line(self.soup)], restaurant_table=self.make_table(self.a, self.room_a, "T2"))
		self.assertIn("pos_portions_updated", [event for event, _message in self.published])


class TestWhatTheTillCalls(PortionsCase):
	def test_the_till_reads_the_state_of_the_products_it_names(self):
		portions.set_made(self.soup, counted=True, made=5)

		answer = portions_api.get_portions(f'["{self.soup}", "{self.cola}"]')

		self.assertEqual(answer[self.soup]["left"], 5)
		self.assertNotIn(self.cola, answer)

	def test_the_till_leaves_out_the_order_on_its_screen(self):
		portions.set_made(self.soup, counted=True, made=5)
		order = self.save([self.line(self.soup, qty=2)])

		answer = portions_api.get_portions(f'["{self.soup}"]', exclude_invoice=order)

		self.assertEqual(answer[self.soup]["left"], 5)

	def test_whoever_manages_the_cards_counts_a_product(self):
		portions_api.set_portions(self.soup, 1, 12)

		self.assertEqual(self.left(self.soup), 12)

	def test_the_till_adds_portions(self):
		portions.set_made(self.soup, counted=True, made=5)

		portions_api.add_portions(self.soup, 2)

		self.assertEqual(self.left(self.soup), 7)

	def test_the_card_editor_reads_a_product_and_why_it_cannot_be_counted(self):
		self.assertEqual(
			portions_api.get_portion_setting(self.soup),
			{"counted": False, "made": None, "left": None, "managed_by_stock": False},
		)
		frappe.db.set_value("Item", self.soup, "is_stock_item", 1)
		self.assertTrue(portions_api.get_portion_setting(self.soup)["managed_by_stock"])


class TestWhatASoldOutDishDoes(PortionsCase):
	def test_the_restaurant_has_a_check_that_is_on_by_default(self):
		field = frappe.get_meta("Restaurant").get_field("grey_out_sold_out")

		self.assertEqual((field.fieldtype, str(field.default)), ("Check", "1"))

	def test_a_restaurant_that_never_chose_greys_out_and_refuses(self):
		self.assertTrue(restaurant_api.get_restaurant_settings(self.a)["grey_out_sold_out"])

	def test_each_restaurant_has_its_own_choice(self):
		restaurant_api.save_restaurant_settings({"grey_out_sold_out": 0}, restaurant=self.a)

		self.assertFalse(restaurant_api.get_restaurant_settings(self.a)["grey_out_sold_out"])
		self.assertTrue(restaurant_api.get_restaurant_settings(self.b)["grey_out_sold_out"])


class TestWhatTheGuestReads(PortionsCase):
	def test_a_counted_dish_carries_what_is_left(self):
		from pos_next.api import guest_ordering

		portions.set_made(self.soup, counted=True, made=2)
		self.save([self.line(self.soup, qty=2)])
		card = frappe.get_doc(
			{
				"doctype": "Restaurant Card",
				"card_name": "_Test Portions Card",
				"is_active": 1,
				"items": [{"item_type": "Item", "item": self.soup}, {"item_type": "Item", "item": self.cola}],
			}
		).insert(ignore_permissions=True)

		menu = guest_ordering._build_menu_from_card(card.name)
		dishes = {dish["item_code"]: dish for category in menu["categories"] for dish in category["menu_items"]}

		self.assertEqual(dishes[self.soup]["portions_left"], 0)
		self.assertNotIn("portions_left", dishes[self.cola])


class TestAGuestOrdersWhatIsLeft(PortionsCase):
	"""A page left open on a phone shows a dish the kitchen has no portion of left: the order is refused, whatever the page shows."""

	def setUp(self):
		super().setUp()
		frappe.db.set_value("Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": "Direct to Kitchen"})
		frappe.clear_document_cache("Restaurant")
		self.token = frappe.get_doc(
			{"doctype": "Guest Order Token", "mode": "restaurant", "table": self.table_a, "pos_profile": self.fx.profile}
		).insert(ignore_permissions=True)

	def order(self, *lines):
		from pos_next.api import guest_ordering

		items = [{"item_code": code, "qty": qty, "rate": 5} for code, qty in lines]
		frappe.set_user("Guest")
		try:
			return guest_ordering.submit_guest_order(self.token.token, frappe.as_json(items))
		finally:
			frappe.set_user("Administrator")

	def test_a_guest_orders_up_to_what_is_left_and_no_more(self):
		portions.set_made(self.soup, counted=True, made=2)

		self.order((self.soup, 2))
		self.assertEqual(self.left(self.soup), 0)
		with self.assertRaises(frappe.ValidationError):
			self.order((self.soup, 1))

		self.assertEqual(self.left(self.soup), 0)

	def test_an_order_that_asks_for_more_than_is_left_adds_nothing(self):
		portions.set_made(self.soup, counted=True, made=2)

		with self.assertRaises(frappe.ValidationError):
			self.order((self.cola, 1), (self.soup, 3))

		self.assertEqual(self.left(self.soup), 2)
		self.assertEqual(
			frappe.db.count("Sales Invoice Item", {"item_code": ["in", [self.cola, self.soup]]}), 0
		)

	def test_a_product_nobody_counts_is_never_refused(self):
		self.order((self.cola, 7))

		self.assertEqual(frappe.db.count("Sales Invoice Item", {"item_code": self.cola}), 1)
