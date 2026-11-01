# //// Neoffice — added file (no upstream equivalent).
"""The service families of a restaurant order (NeoRestau lot 1, the first slice of Daniel's « famille de service »).

A restaurant says, on the Item Group of its menu, which group is a drink, a starter, a main or a dessert (a sub-group with
no family takes its parent's). Each line of an order carries its family, and a table's order is sent to the kitchen in
the rhythm of the meal: the drinks and the first food family present go at « Valider », the other food waits (status
`Waiting`) until the waiter orders the next course. The suite pins:

- the rule itself, against the table of examples the till is tested against too (`service_family_cases.json`);
- where the family of a line comes from (the group tree, the waiter's own choice for one line), and that a site which sets
  no family keeps today's behaviour, every line going at once;
- the send path (`update_invoice`): a line the till did not decide is decided by the rule, a line it decided is kept, a
  takeaway or a counter order is never held, and a line added later whose family has left goes at once;
- what the till reads: the map of groups to families, the family of each line of a table's order, the plan of a send.

The suite builds everything it needs (an Item Group tree, items, a restaurant, a table, a till) and rolls back.
"""

import json
import os

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.api import service_families as service_families_api
from pos_next.restaurant import service_families
from pos_next.tests.test_two_restaurants_on_one_site import TwoRestaurants
from pos_next.tests.test_till_writes_need_the_till import _sale, _user

CASES = os.path.join(os.path.dirname(__file__), "service_family_cases.json")
PORTAL = "service-families-portal@yopmail.com"

MENU = "_Test SF Menu"
DRINKS = "_Test SF Drinks"
KITCHEN = "_Test SF Kitchen"
PASTA = "_Test SF Pasta"
STARTERS = "_Test SF Starters"
CAKES = "_Test SF Cakes"
TARTS = "_Test SF Tarts"
SHOP = "_Test SF Shop"


def the_root():
	"""The top of the Item Group tree: the site's own, or one of the test's when a fresh site has none."""
	root = frappe.db.get_value(
		"Item Group", {"is_group": 1, "parent_item_group": ["in", ["", None]]}, "name", order_by="lft"
	)
	return root or a_group("_Test SF Root", None, is_group=1)


def a_group(name, parent, family=None, is_group=0):
	values = {"doctype": "Item Group", "item_group_name": name, "is_group": is_group}
	if parent:
		values["parent_item_group"] = parent
	if family:
		values["service_family"] = family
	return frappe.get_doc(values).insert(ignore_permissions=True).name


def an_item(name, group, company):
	return (
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": name,
				"item_name": name,
				"item_group": group,
				"stock_uom": frappe.db.get_value("UOM", "Nos") or frappe.db.get_value("UOM", {}, "name"),
				"is_stock_item": 0,
				"is_sales_item": 1,
				"item_defaults": [
					{
						"company": company,
						"default_warehouse": frappe.db.get_value(
							"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
						)
						or "",
					}
				],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


class TestTheRuleOfTheSharedTable(FrappeTestCase):
	"""The rule is pure: lines in, a decision for each line out. The till's copy of it is tested against the same file."""

	def cases(self, key):
		with open(CASES, encoding="utf-8") as table:
			return json.load(table)[key]

	def test_every_example_of_the_shared_table_gives_its_plan(self):
		cases = self.cases("send_cases")

		self.assertGreaterEqual(len(cases), 20)
		for case in cases:
			with self.subTest(case=case["name"]):
				plan = service_families.plan_send(
					case["lines"], case["table_service"], sent_families=case["sent_families"]
				)
				self.assertEqual(plan, case["plan"])

	def test_every_example_of_the_shared_table_gives_its_next_course(self):
		cases = self.cases("next_cases")

		self.assertGreaterEqual(len(cases), 8)
		for case in cases:
			with self.subTest(case=case["name"]):
				released = service_families.next_release(case["lines"])
				self.assertEqual(released["family"], case["next"]["family"])
				self.assertEqual(released["indexes"], case["next"]["indexes"])
				self.assertEqual(service_families.held_lines(case["lines"]), case["all"])

	def test_the_rule_reads_the_status_of_a_line_in_any_spelling_of_nothing(self):
		for empty in ("", None):
			with self.subTest(status=empty):
				lines = [{"service_family": "Main", "kds_status": empty}]
				self.assertEqual(service_families.plan_send(lines, True), ["send"])

	def test_a_family_nobody_knows_is_no_family(self):
		lines = [{"service_family": "Cheese", "kds_status": ""}, {"service_family": "Main", "kds_status": ""}]

		self.assertEqual(service_families.plan_send(lines, True), ["send", "send"])


class TestWhereTheFamilyCameFrom(TwoRestaurants, FrappeTestCase):
	"""Item Groups of a menu: some carry a family, some inherit it, one has none anywhere."""

	def setUp(self):
		super().setUp()
		a_group(MENU, the_root(), is_group=1)
		a_group(DRINKS, MENU, "Drink")
		a_group(KITCHEN, MENU, "Main", is_group=1)
		a_group(PASTA, KITCHEN)
		a_group(STARTERS, KITCHEN, "Starter")
		a_group(CAKES, KITCHEN, "Dessert", is_group=1)
		a_group(TARTS, CAKES)
		a_group(SHOP, the_root())

	def test_the_item_group_has_a_service_family_field_with_the_four_families(self):
		field = frappe.get_meta("Item Group").get_field("service_family")

		self.assertEqual(field.fieldtype, "Select")
		self.assertEqual((field.options or "").split("\n"), ["", "Drink", "Starter", "Main", "Dessert"])

	def test_a_group_with_a_family_has_it(self):
		self.assertEqual(service_families.family_of_group(DRINKS), "Drink")
		self.assertEqual(service_families.family_of_group(STARTERS), "Starter")

	def test_a_sub_group_with_no_family_takes_its_parents(self):
		self.assertEqual(service_families.family_of_group(PASTA), "Main")

	def test_it_walks_up_as_many_levels_as_it_takes(self):
		self.assertEqual(service_families.family_of_group(TARTS), "Dessert")

	def test_the_nearest_family_wins_over_the_parents(self):
		# the Kitchen is a Main; its Starters sub-group says Starter, and Cakes says Dessert
		self.assertEqual(service_families.family_of_group(KITCHEN), "Main")
		self.assertEqual(service_families.family_of_group(STARTERS), "Starter")
		self.assertEqual(service_families.family_of_group(CAKES), "Dessert")

	def test_a_group_with_no_family_anywhere_up_the_tree_has_none(self):
		self.assertEqual(service_families.family_of_group(SHOP), "")
		self.assertEqual(service_families.family_of_group(MENU), "")
		self.assertEqual(service_families.family_of_group(the_root()), "")

	def test_no_group_at_all_has_none(self):
		self.assertEqual(service_families.family_of_group(None), "")
		self.assertEqual(service_families.family_of_group(""), "")
		self.assertEqual(service_families.family_of_group("_Test SF No Such Group"), "")

	def test_an_item_has_the_family_of_its_group(self):
		starter = an_item("_Test SF Soup", STARTERS, self.company)
		pasta = an_item("_Test SF Penne", PASTA, self.company)
		cola = an_item("_Test SF Cola", SHOP, self.company)

		self.assertEqual(service_families.family_of_item(starter), "Starter")
		self.assertEqual(service_families.family_of_item(pasta), "Main")
		self.assertEqual(service_families.family_of_item(cola), "")
		self.assertEqual(service_families.family_of_item("_Test SF No Such Item"), "")

	def test_the_map_of_the_till_holds_the_resolved_family_of_every_group_that_has_one(self):
		families = service_families.group_families()

		self.assertEqual(families[DRINKS], "Drink")
		self.assertEqual(families[PASTA], "Main")
		self.assertEqual(families[TARTS], "Dessert")
		self.assertNotIn(SHOP, families)
		self.assertNotIn(MENU, families)

	def test_the_endpoint_gives_the_till_the_same_map(self):
		self.assertEqual(service_families_api.get_group_families(), service_families.group_families())

	def test_a_value_that_is_no_family_is_not_taken_for_one(self):
		frappe.db.set_value("Item Group", SHOP, "service_family", "Cheese", update_modified=False)

		self.assertEqual(service_families.family_of_group(SHOP), "")
		self.assertNotIn(SHOP, service_families.group_families())


class ServiceCase(TwoRestaurants, FrappeTestCase):
	"""Restaurant A with a table, a till, and a menu of groups and items: a drink, two starters, two mains, a dessert."""

	def setUp(self):
		super().setUp()
		# update_invoice sets it for the rest of the request and never resets it
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		self.fx = self.two_real_tills()
		self.make_till(self.fx.profile, self.a)
		a_group(MENU, the_root(), is_group=1)
		a_group(DRINKS, MENU, "Drink")
		a_group(KITCHEN, MENU, "Main", is_group=1)
		a_group(PASTA, KITCHEN)
		a_group(STARTERS, KITCHEN, "Starter")
		a_group(CAKES, KITCHEN, "Dessert", is_group=1)
		a_group(TARTS, CAKES)
		a_group(SHOP, the_root())
		self.cola = an_item("_Test SF Cola", DRINKS, self.company)
		self.soup = an_item("_Test SF Soup", STARTERS, self.company)
		self.salad = an_item("_Test SF Salad", STARTERS, self.company)
		self.penne = an_item("_Test SF Penne", PASTA, self.company)
		self.steak = an_item("_Test SF Steak", PASTA, self.company)
		self.tart = an_item("_Test SF Tart", TARTS, self.company)
		self.gum = an_item("_Test SF Gum", SHOP, self.company)

	def line(self, item, status="", **more):
		return {
			"item_code": item,
			"qty": 1,
			"rate": 10,
			"price_list_rate": 10,
			"kds_status": status,
			**more,
		}

	def save(self, lines, name=None, **changes):
		"""One save of the till (update_invoice) of a table's order, the payload as the till sends it; the order's name."""
		changes.setdefault("restaurant_table", self.table_a)
		payload = _sale(
			self.fx,
			items=lines,
			payments=[{"mode_of_payment": self.fx.mode, "amount": 10 * len(lines)}],
			**changes,
		)
		if name:
			payload["name"] = name
		return invoices.update_invoice(json.dumps(payload))["name"]

	def lines_of(self, order):
		return frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": order},
			fields=["item_code", "kds_status", "service_family", "kds_batch"],
			order_by="idx asc",
		)

	def rows(self, order):
		"""The lines of the order, in the order the till sent them: item, status, family."""
		return [
			(r.item_code.replace("_Test SF ", ""), r.kds_status, r.service_family or "")
			for r in self.lines_of(order)
		]

	def batches(self, order):
		return [int(r.kds_batch or 0) for r in self.lines_of(order)]

	def statuses(self, order):
		return [(item, status) for item, status, _family in self.rows(order)]


class TestTheSendPath(ServiceCase):
	def test_a_table_order_sends_the_drinks_and_the_starters_and_holds_the_rest(self):
		order = self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)]
		)

		self.assertEqual(
			self.statuses(order),
			[("Cola", "Pending"), ("Soup", "Pending"), ("Penne", "Waiting"), ("Tart", "Waiting")],
		)

	def test_each_line_is_stored_with_the_family_of_its_group(self):
		order = self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)]
		)

		self.assertEqual(
			[family for _item, _status, family in self.rows(order)],
			["Drink", "Starter", "Main", "Dessert"],
		)

	def test_a_line_of_a_group_with_no_family_is_stored_with_none_and_never_held(self):
		order = self.save([self.line(self.gum), self.line(self.penne), self.line(self.tart)])

		self.assertEqual(
			self.rows(order),
			[("Gum", "Pending", ""), ("Penne", "Pending", "Main"), ("Tart", "Waiting", "Dessert")],
		)

	def test_a_site_that_sets_no_family_sends_everything_as_before(self):
		frappe.db.set_value("Item Group", DRINKS, "service_family", "")
		frappe.db.set_value("Item Group", KITCHEN, "service_family", "")
		frappe.db.set_value("Item Group", STARTERS, "service_family", "")
		frappe.db.set_value("Item Group", CAKES, "service_family", "")
		order = self.save([self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)])

		self.assertEqual([status for _item, status in self.statuses(order)], ["Pending"] * 4)
		self.assertEqual([family for _i, _s, family in self.rows(order)], [""] * 4)

	def test_no_starter_sends_the_mains_with_the_drinks(self):
		order = self.save([self.line(self.cola), self.line(self.penne), self.line(self.tart)])

		self.assertEqual(
			self.statuses(order), [("Cola", "Pending"), ("Penne", "Pending"), ("Tart", "Waiting")]
		)

	def test_a_takeaway_order_sends_everything_at_once(self):
		order = self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)],
			restaurant_table=None,
			is_takeaway=1,
			takeaway_number="T-001",
		)

		self.assertEqual([status for _item, status in self.statuses(order)], ["Pending"] * 4)

	def test_a_counter_order_sends_everything_at_once(self):
		order = self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.tart)],
			restaurant_table=None,
		)

		self.assertEqual([status for _item, status in self.statuses(order)], ["Pending"] * 4)

	def test_a_plain_counter_sale_is_left_exactly_as_the_till_sent_it(self):
		# no table, no takeaway: not a restaurant order, whatever the till is. Nothing is decided, no family is stored
		order = self.save(
			[self.line(self.cola), self.line(self.penne)],
			restaurant_table=None,
		)

		self.assertEqual(self.rows(order), [("Cola", "Pending", ""), ("Penne", "Pending", "")])

	def test_a_line_the_till_decided_is_kept(self):
		# the waiter ticked the dessert and left the starter out in the dialog: both choices are honoured
		order = self.save(
			[self.line(self.soup, "Waiting"), self.line(self.penne, "Pending"), self.line(self.tart, "Pending")]
		)

		self.assertEqual(
			self.statuses(order), [("Soup", "Waiting"), ("Penne", "Pending"), ("Tart", "Pending")]
		)

	def test_the_family_the_waiter_gave_a_line_is_the_one_stored_and_ruled(self):
		# a starter « served with the mains »: the till sends it as a Main
		order = self.save(
			[
				self.line(self.cola),
				self.line(self.soup, service_family="Main"),
				self.line(self.penne),
				self.line(self.tart),
			]
		)

		self.assertEqual(
			self.rows(order),
			[
				("Cola", "Pending", "Drink"),
				("Soup", "Pending", "Main"),
				("Penne", "Pending", "Main"),
				("Tart", "Waiting", "Dessert"),
			],
		)

	def test_a_dish_ordered_twice_in_two_families_keeps_each_family(self):
		order = self.save(
			[self.line(self.soup, service_family="Starter"), self.line(self.soup, service_family="Main")]
		)

		self.assertEqual(
			[(status, family) for _i, status, family in self.rows(order)],
			[("Pending", "Starter"), ("Waiting", "Main")],
		)

	def test_the_family_of_a_line_that_left_is_kept_as_the_till_sent_it(self):
		order = self.save([self.line(self.soup, "Pending", service_family="Starter")])

		again = self.save([self.line(self.soup, "Pending", service_family="Starter")], name=order)

		self.assertEqual(again, order)
		self.assertEqual(self.rows(order)[0][1:], ("Pending", "Starter"))

	def test_a_line_that_left_without_a_family_gets_none_from_the_server(self):
		# a guest's line, or a line from before the families: it left, it carries no family, it decides no rhythm
		order = self.save(
			[
				self.line(self.tart, "Pending", service_family=""),
				self.line(self.soup),
				self.line(self.penne),
			]
		)

		self.assertEqual(
			self.rows(order),
			[("Tart", "Pending", ""), ("Soup", "Pending", "Starter"), ("Penne", "Waiting", "Main")],
		)


class TestALineTheKitchenAlreadyHas(ServiceCase):
	"""A cart that does not carry the kitchen's state of a line (it sends no status for it) must not make it a new line."""

	def test_a_line_sent_with_no_status_keeps_what_the_stored_row_says(self):
		order = self.save([self.line(self.cola), self.line(self.soup), self.line(self.penne)])
		self.assertEqual(self.statuses(order), [("Cola", "Pending"), ("Soup", "Pending"), ("Penne", "Waiting")])
		soup_row = frappe.db.get_value("Sales Invoice Item", {"parent": order, "item_code": self.soup}, "name")
		frappe.db.set_value("Sales Invoice Item", soup_row, "kds_status", "Preparing", update_modified=False)

		# the till saves the table again, its lines with no status, and one more starter
		self.save(
			[self.line(self.cola), self.line(self.soup), self.line(self.penne), self.line(self.salad)], name=order
		)

		self.assertEqual(
			self.statuses(order),
			[("Cola", "Pending"), ("Soup", "Preparing"), ("Penne", "Waiting"), ("Salad", "Pending")],
		)
		# the family of each stored line stays
		self.assertEqual([family for _item, _status, family in self.rows(order)], ["Drink", "Starter", "Main", "Starter"])


class TestTheRhythmOfTheMeal(ServiceCase):
	def first_round(self):
		return self.save(
			[
				self.line(self.cola),
				self.line(self.soup),
				self.line(self.penne),
				self.line(self.tart),
			]
		)

	def test_a_starter_added_later_goes_at_once_and_the_held_courses_stay_held(self):
		order = self.first_round()

		self.save(
			[
				self.line(self.cola, "Pending", service_family="Drink"),
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Waiting", service_family="Main"),
				self.line(self.tart, "Waiting", service_family="Dessert"),
				self.line(self.salad),
			],
			name=order,
		)

		self.assertEqual(
			self.statuses(order),
			[
				("Cola", "Pending"),
				("Soup", "Pending"),
				("Penne", "Waiting"),
				("Tart", "Waiting"),
				("Salad", "Pending"),
			],
		)

	def test_a_main_added_while_the_mains_are_held_joins_them(self):
		order = self.first_round()

		self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Waiting", service_family="Main"),
				self.line(self.steak),
			],
			name=order,
		)

		self.assertEqual(
			self.statuses(order), [("Soup", "Pending"), ("Penne", "Waiting"), ("Steak", "Waiting")]
		)

	def test_a_drink_added_later_goes_at_once(self):
		order = self.first_round()

		self.save(
			[
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, "Waiting", service_family="Main"),
				self.line(self.cola),
			],
			name=order,
		)

		self.assertEqual(
			self.statuses(order), [("Soup", "Pending"), ("Penne", "Waiting"), ("Cola", "Pending")]
		)

	def test_the_waiter_orders_the_next_course_then_the_one_after(self):
		order = self.first_round()
		starters_left = [
			self.line(self.cola, "Pending", service_family="Drink"),
			self.line(self.soup, "Pending", service_family="Starter"),
		]

		# « Commander la suite · les plats »: the till marks the next family's lines and saves
		self.save(
			[*starters_left, self.line(self.penne, "Pending", service_family="Main"), self.line(self.tart, "Waiting", service_family="Dessert")],
			name=order,
		)
		after_the_mains = self.rows(order)

		self.save(
			[
				*starters_left,
				self.line(self.penne, "Pending", service_family="Main"),
				self.line(self.tart, "Pending", service_family="Dessert"),
			],
			name=order,
		)
		after_the_desserts = self.rows(order)

		self.assertEqual([s for _i, s, _f in after_the_mains], ["Pending", "Pending", "Pending", "Waiting"])
		self.assertEqual([s for _i, s, _f in after_the_desserts], ["Pending"] * 4)

	def test_each_send_is_numbered_so_that_the_kitchen_shows_the_next_course_as_a_send_of_its_own(self):
		order = self.first_round()
		self.assertEqual(self.batches(order), [0, 0, 0, 0], "the first send has no batch, as it always had none; the held lines have none")

		def the_cart(mains, desserts):
			return [
				self.line(self.cola, "Pending", service_family="Drink"),
				self.line(self.soup, "Pending", service_family="Starter"),
				self.line(self.penne, mains, service_family="Main"),
				self.line(self.tart, desserts, service_family="Dessert"),
			]

		self.save(the_cart("Pending", "Waiting"), name=order)
		self.assertEqual(self.batches(order), [0, 0, 1, 0], "the mains are a send of their own")

		self.save(the_cart("Pending", "Pending"), name=order)
		self.assertEqual(self.batches(order), [0, 0, 1, 2], "the desserts are another")

		self.save(the_cart("Pending", "Pending"), name=order)
		self.assertEqual(self.batches(order), [0, 0, 1, 2], "a save that sends nothing renumbers nothing")

	def test_the_stored_order_tells_that_the_starters_left_even_to_a_cart_that_did_not_know(self):
		order = self.first_round()

		# another device saves a new main from a cart that lost the sent lines: the starters left, so the main waits
		self.save([self.line(self.steak)], name=order)

		self.assertEqual(self.statuses(order), [("Steak", "Waiting")])

	def test_a_stored_order_whose_mains_left_sends_a_forgotten_starter_at_once(self):
		order = self.save([self.line(self.penne)])
		self.assertEqual(self.statuses(order), [("Penne", "Pending")])

		self.save([self.line(self.salad)], name=order)

		self.assertEqual(self.statuses(order), [("Salad", "Pending")])


class TestWhatTheTillReads(ServiceCase):
	def test_a_table_order_gives_the_till_the_family_of_each_line(self):
		order = self.save([self.line(self.cola), self.line(self.soup), self.line(self.penne)])
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", self.table_a)

		lines = restaurant_api.get_table_order(self.table_a)["items"]

		self.assertEqual(
			sorted((line.item_code.replace("_Test SF ", ""), line.service_family) for line in lines),
			[("Cola", "Drink"), ("Penne", "Main"), ("Soup", "Starter")],
		)

	def test_the_plan_of_a_send_is_asked_of_the_server(self):
		lines = [
			{"service_family": "Drink", "kds_status": ""},
			{"service_family": "Starter", "kds_status": ""},
			{"service_family": "Main", "kds_status": ""},
		]

		answer = service_families_api.plan_kitchen_send(json.dumps(lines), restaurant_table=self.table_a)

		self.assertEqual(answer["plan"], ["send", "send", "hold"])

	def test_a_takeaway_is_planned_without_holding(self):
		lines = [
			{"service_family": "Starter", "kds_status": ""},
			{"service_family": "Main", "kds_status": ""},
		]

		answer = service_families_api.plan_kitchen_send(json.dumps(lines), is_takeaway=1)

		self.assertEqual(answer["plan"], ["send", "send"])

	def test_a_counter_order_is_planned_without_holding(self):
		lines = [
			{"service_family": "Starter", "kds_status": ""},
			{"service_family": "Main", "kds_status": ""},
		]

		self.assertEqual(service_families_api.plan_kitchen_send(json.dumps(lines))["plan"], ["send", "send"])

	def test_the_next_course_and_everything_held_are_asked_of_the_server_too(self):
		lines = [
			{"service_family": "Starter", "kds_status": "Pending"},
			{"service_family": "Main", "kds_status": "Waiting"},
			{"service_family": "Main", "kds_status": "Waiting"},
			{"service_family": "Dessert", "kds_status": "Waiting"},
		]

		answer = service_families_api.plan_kitchen_send(json.dumps(lines), restaurant_table=self.table_a)

		self.assertEqual(answer["next"], {"family": "Main", "indexes": [1, 2]})
		self.assertEqual(answer["held"], [1, 2, 3])

	def test_a_portal_account_is_refused_both_calls(self):
		_user(PORTAL, ["Customer"], "Website User")
		frappe.set_user(PORTAL)

		with self.assertRaises(frappe.PermissionError):
			service_families_api.get_group_families()
		with self.assertRaises(frappe.PermissionError):
			service_families_api.plan_kitchen_send("[]")

	def test_both_calls_are_web_endpoints(self):
		self.assertIn(service_families_api.get_group_families, frappe.whitelisted)
		self.assertIn(service_families_api.plan_kitchen_send, frappe.whitelisted)


class TestTheFields(FrappeTestCase):
	def test_a_line_of_an_order_has_a_family_the_waiter_does_not_see_as_a_field(self):
		field = frappe.get_meta("Sales Invoice Item").get_field("service_family")

		self.assertEqual(field.fieldtype, "Data")
		self.assertEqual((field.hidden, field.read_only, field.no_copy), (1, 1, 1))
