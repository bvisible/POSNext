# //// Neoffice — added file (no upstream equivalent).
"""Managing a restaurant needs the right, and the server checks it (NeoRestau lot 1, task 3; maintenance#1967).

Lot 0 made every till endpoint check WHO calls it: a portal account reaches nothing, a cashier works at a till of his.
What a cashier may DO there was left open: the floor plan, the preparation stations and workflows, the option groups,
the cards, their prices, items, badges and design were every cashier's to change. They are the restaurant managers'
now (Restaurant Manager, the customer's Admin, the till managers), whatever the till shows, and the till is told what
its user may manage, to show only that.

The suite relies on no patch and no after_migrate (a fresh CI site runs neither): it makes the two roles and carries
the rules over itself, builds a restaurant of its own with what each endpoint touches, and rolls everything back.
"""

import json
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.permissions import setup_custom_perms
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from pos_next import install
from pos_next.api import menu_pdf
from pos_next.api import restaurant as restaurant_api
from pos_next.api.cash_entry import require_till_user
from pos_next.api.menu_pdf import (
	generate_menu_pdf,
	generate_multi_card_pdf,
	get_design_templates,
	get_menu_preview_data,
	get_menu_preview_html,
	save_card_design,
)
from pos_next.api.reservations import check_table_availability, get_reservation_stats, get_reservations
from pos_next.api.restaurant import (
	create_area,
	create_preparation_workflow,
	create_product_option_group,
	create_station,
	create_table,
	delete_area,
	delete_preparation_workflow,
	delete_product_option_group,
	delete_station,
	delete_table,
	download_food_image,
	duplicate_card,
	get_active_cards,
	get_active_menus,
	get_all_product_option_groups,
	get_card_items_extra,
	get_card_items_stock,
	get_card_items_with_badges,
	get_item_badges,
	get_item_creation_defaults,
	get_item_edit_data,
	get_menu_badges,
	get_next_step,
	get_next_takeaway_number,
	get_or_create_permanent_card,
	get_preparation_stations,
	get_preparation_workflows,
	get_product_options,
	get_restaurant_cards,
	get_restaurant_settings,
	get_restaurant_status,
	get_station_details,
	get_station_items_map,
	get_station_workflows,
	get_tips,
	mark_table_available,
	rename_area,
	reorder_areas,
	reset_all_tables,
	save_floor_plan_bg,
	save_floor_plan_walls,
	save_preparation_workflow,
	save_product_option_group,
	save_restaurant_settings,
	save_station_positions,
	save_table_positions,
	save_tip_settings,
	search_food_images,
	search_items_for_options,
	update_item_active,
	update_item_badges,
	update_item_details,
	update_item_price,
	update_station,
	update_table_status,
)
from pos_next.authorization.tests.helpers import make_user
from pos_next.integrations import registry
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import permissions
from pos_next.restaurant import settings as restaurant_settings
from pos_next.restaurant.bootstrap import extend_bootstrap_settings
from pos_next.restaurant.permissions import ensure_restaurant_roles, grant_restaurant_permissions
from pos_next.tests.test_till_writes_need_the_till import OTHER_TILL, TILL, _item, _till_fixture, _user

CASHIER = "restaurant-rights-cashier@yopmail.com"
MANAGER = "restaurant-rights-manager@yopmail.com"
WEBSITE_USER = "restaurant-rights-website@yopmail.com"
PORTAL = "restaurant-rights-portal@yopmail.com"
KITCHEN = "restaurant-rights-kitchen@yopmail.com"
ADMIN = "restaurant-rights-admin@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
RESTAURANT = "_Test Rights Restaurant"
IMAGE = (b"\xff\xd8\xff", "jpg")
# What the till is told: the restaurant's rights, the ERP's on items and prices, the till's own settings
EVERY_RIGHT = {*permissions.RIGHTS, "manage_till_settings"}
# A restaurant's manager without the ERP's item rights, at a till he does not manage
MANAGER_IS_TOLD = {
	**dict.fromkeys(EVERY_RIGHT, True),
	"edit_items": False,
	"edit_prices": False,
	"create_items": False,
	"manage_till_settings": False,
}
# Every right a manager role holds on a management doctype
MANAGE = {"read", "write", "create", "delete"}


@contextmanager
def as_user(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


class RestaurantRights(FrappeTestCase):
	"""A restaurant of the test's own, with a room, two tables, two stations, an option group, a workflow, a card
	that lists an item, and the users the rules are about."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases. The rules a
		# grant gave inside the transaction are dropped from the cache once it is rolled back (registered first, run last)
		self.changed_rules = []
		self.addCleanup(lambda: [frappe.clear_cache(doctype=doctype) for doctype in self.changed_rules or []])
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		# A few endpoints commit: nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		ensure_restaurant_roles()
		self.changed_rules = grant_restaurant_permissions()
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		self.company = company[0]
		self.restaurant = (
			frappe.get_doc({"doctype": "Restaurant", "restaurant_name": RESTAURANT, "company": self.company})
			.insert(ignore_permissions=True)
			.name
		)
		self.room = self.insert("Restaurant Area", restaurant=self.restaurant, area_name="_Test Rights Room")
		self.empty_room = self.insert(
			"Restaurant Area", restaurant=self.restaurant, area_name="_Test Rights Cellar"
		)
		self.table = self.insert(
			"Restaurant Table",
			area=self.room,
			table_name="_Test Rights T1",
			status="Empty",
			pos_x=10,
			pos_y=10,
		)
		self.spare_table = self.insert("Restaurant Table", area=self.room, table_name="_Test Rights T9")
		self.station = self.insert(
			"Preparation Station", restaurant=self.restaurant, station_name="_Test Rights Kitchen"
		)
		self.spare_station = self.insert(
			"Preparation Station", restaurant=self.restaurant, station_name="_Test Rights Bar"
		)
		self.option_group = self.insert("Product Option Group", group_name="_Test Rights Group")
		self.workflow = self.insert(
			"Preparation Workflow",
			workflow_name="_Test Rights Flow",
			steps=[{"step_name": "Pending", "color": "#EAB308", "allow_edit": 1}],
		)
		self.item = _item(self.company)
		self.card = self.insert(
			"Restaurant Card",
			restaurant=self.restaurant,
			card_name="_Test Rights Card",
			is_active=1,
			items=[{"item_type": "Item", "item": self.item, "price": 7}],
		)
		self.cashier = make_user(CASHIER, [CASHIER_ROLE])
		# A restaurant's manager also works at its till, as its cashiers do
		self.manager = make_user(MANAGER, [permissions.MANAGER_ROLE, CASHIER_ROLE])
		self.website_user = make_user(WEBSITE_USER, [])
		# A portal account the till's and the restaurant's roles were given by mistake: a role does not make it a desk
		# account
		_user(PORTAL, [CASHIER_ROLE, permissions.MANAGER_ROLE], "Website User")
		self.portal = PORTAL
		self.kitchen = make_user(KITCHEN, [permissions.KITCHEN_ROLE])

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def management_calls(self):
		"""(callable, kwargs): every write of the restaurant's set-up, with the endpoints' real signatures."""
		return [
			(delete_table, {"name": self.spare_table}),
			(update_station, {"name": self.station, "station_name": "_Test renamed"}),
			(delete_station, {"name": self.spare_station}),
			(create_product_option_group, {"group_name": "_Test Group"}),
			(save_product_option_group, {"name": self.option_group, "group_name": "_Test renamed"}),
			(delete_product_option_group, {"name": self.option_group}),
			(create_preparation_workflow, {"workflow_name": "_Test Flow"}),
			(save_preparation_workflow, {"name": self.workflow, "workflow_name": "_Test renamed"}),
			(delete_preparation_workflow, {"name": self.workflow}),
			(duplicate_card, {"card_name": self.card}),
			(update_item_price, {"item_code": self.item, "price": 1}),
			(update_item_price, {"item_code": self.item, "price": 1, "card_name": self.card}),
			(update_item_price, {"item_code": self.item, "price": 1, "scope": "global"}),
			(update_item_active, {"item_code": self.item, "disabled": 1}),
			(update_item_active, {"item_code": self.item, "disabled": 1, "card_name": self.card}),
			(update_item_active, {"item_code": self.item, "disabled": 1, "scope": "all"}),
			(update_item_details, {"item_code": self.item, "description": "_Test"}),
			(update_item_badges, {"item_code": self.item}),
			(save_card_design, {"card_name": self.card}),
			(download_food_image, {"image_url": "https://example.invalid/x.jpg", "item_name": "_Test"}),
			# The floor plan: a cashier may write a table (its status), never lay out the floor
			(
				save_table_positions,
				{"positions": json.dumps([{"name": self.table, "pos_x": 500, "pos_y": 500}])},
			),
			(reset_all_tables, {"restaurant": self.restaurant}),
			(create_table, {"table_name": "_Test Rights T2", "area": self.room}),
			(save_station_positions, {"positions": "[]"}),
			(save_floor_plan_walls, {"area": self.room, "walls_data": "{}"}),
			(save_floor_plan_bg, {"area": self.room}),
			(create_station, {"station_name": "_Test Rights Pass", "restaurant": self.restaurant}),
			(create_area, {"area_name": "_Test Rights Terrace", "restaurant": self.restaurant}),
			(rename_area, {"name": self.room, "new_name": "_Test renamed"}),
			(reorder_areas, {"order": json.dumps([self.empty_room, self.room])}),
			(delete_area, {"name": self.empty_room}),
			# The restaurant's own settings
			(save_restaurant_settings, {"settings": {"enable_runner": 1}, "restaurant": self.restaurant}),
			(save_tip_settings, {"settings": {"auto_detect_tip": 1}, "restaurant": self.restaurant}),
		]

	def reads(self):
		"""(callable, kwargs): what the till reads of the restaurant during the service, with the endpoints' real
		signatures. A cashier reads them all; a portal account none."""
		return [
			(get_tips, {"restaurant": self.restaurant}),
			(get_restaurant_settings, {"restaurant": self.restaurant}),
			(get_restaurant_cards, {"restaurant": self.restaurant}),
			(get_preparation_stations, {"restaurant": self.restaurant}),
			(get_preparation_stations, {"station": self.station}),
			(get_station_workflows, {"restaurant": self.restaurant}),
			(
				check_table_availability,
				{"tables": json.dumps([self.table]), "date": nowdate(), "time": "12:00:00", "duration": 3600},
			),
			(get_station_items_map, {"restaurant": self.restaurant}),
			(get_station_details, {"name": self.station}),
			(get_product_options, {"item_code": self.item}),
			(get_all_product_option_groups, {}),
			(get_active_cards, {"restaurant": self.restaurant}),
			(get_active_menus, {"restaurant": self.restaurant}),
			(get_restaurant_status, {"restaurant": self.restaurant}),
			(get_preparation_workflows, {}),
			(get_next_step, {"station_name": self.station, "current_step": "Pending"}),
			(get_next_takeaway_number, {}),
			(get_card_items_extra, {"card_name": self.card}),
			(get_menu_badges, {}),
			(get_item_badges, {"item_code": self.item}),
			(get_card_items_with_badges, {"card_name": self.card}),
		]

	def card_editor_reads(self):
		"""(callable, kwargs): what only the card editor reads (the menu designer, the item panel, the image search, the
		option groups' item search): whoever manages the cards, or the option groups. A cashier reads none."""
		return [
			(get_menu_preview_data, {"card_name": self.card}),
			(get_design_templates, {}),
			(get_menu_preview_html, {"card_name": self.card}),
			(generate_menu_pdf, {"card_name": self.card}),
			(generate_multi_card_pdf, {"card_names": json.dumps([self.card])}),
			(get_item_edit_data, {"item_code": self.item}),
			(get_card_items_stock, {"card_name": self.card}),
			(search_food_images, {"query": "_test pasta"}),
			(search_items_for_options, {"query": "_PNXT"}),
		]

	@contextmanager
	def a_response(self):
		"""A response of its own for the endpoints that answer a download; the one before is put back."""
		saved = frappe.local.response
		frappe.local.response = frappe._dict()
		try:
			yield frappe.local.response
		finally:
			frappe.local.response = saved

	@contextmanager
	def no_pdf_engine_and_no_image_provider(self):
		"""The PDF engine and the image provider stand in: the test runs no wkhtmltopdf and calls no provider."""
		answer = frappe._dict(json=lambda: {"photos": [], "total_results": 0}, raise_for_status=lambda: None)
		with (
			patch("pdfkit.from_string", return_value=b"%PDF-1.4") as engine,
			patch.dict(frappe.local.conf, {"pexels_api_key": "_test"}),
			patch("requests.get", return_value=answer),
		):
			yield engine


class TestTheServerDecides(RestaurantRights):
	def test_a_cashier_works_at_the_till(self):
		# The refusals below are the restaurant's rights, not lot 0's gate: the cashier passes that one
		with as_user(self.cashier):
			require_till_user()
			for fn, kwargs in self.reads():
				with self.subTest(fn=fn.__name__, kwargs=kwargs):
					fn(**kwargs)

	def test_a_cashier_cannot_manage_the_restaurant(self):
		before = self.snapshot()
		with as_user(self.cashier):
			for fn, kwargs in self.management_calls():
				with self.subTest(fn=fn.__name__, kwargs=kwargs), self.assertRaises(frappe.PermissionError):
					fn(**kwargs)
		self.assertEqual(self.snapshot(), before)

	def test_a_cashier_cannot_use_the_card_editor(self):
		with as_user(self.cashier), self.no_pdf_engine_and_no_image_provider() as engine:
			for fn, kwargs in [*self.card_editor_reads(), (get_item_creation_defaults, {})]:
				with self.subTest(fn=fn.__name__, kwargs=kwargs), self.assertRaises(frappe.PermissionError):
					fn(**kwargs)
		engine.assert_not_called()

	def snapshot(self):
		"""What the management calls would change, among the test's own records and what they would make."""
		count, value = frappe.db.count, frappe.db.get_value
		return {
			"tables": count("Restaurant Table", {"area": self.room}),
			"table": value("Restaurant Table", self.table, ["pos_x", "pos_y", "status"]),
			"stations": count("Preparation Station", {"restaurant": self.restaurant}),
			"station": value("Preparation Station", self.station, "station_name"),
			"rooms": count("Restaurant Area", {"restaurant": self.restaurant}),
			"room": value(
				"Restaurant Area", self.room, ["area_name", "floor_plan_walls", "floor_plan_bg", "sort_order"]
			),
			"group": value("Product Option Group", self.option_group, "group_name"),
			"new group": frappe.db.exists("Product Option Group", "_Test Group"),
			"workflow": value("Preparation Workflow", self.workflow, "workflow_name"),
			"new workflow": frappe.db.exists("Preparation Workflow", "_Test Flow"),
			"cards": count("Restaurant Card", {"restaurant": self.restaurant}),
			"card": value("Restaurant Card Item", {"parent": self.card}, ["price", "disabled"]),
			"design": value("Restaurant Card", self.card, "custom_design_template"),
			"item": value("Item", self.item, ["description", "standard_rate"]),
			"prices": count("Item Price", {"item_code": self.item}),
			"files": count("File", {"owner": self.cashier}),
			"settings": value("Restaurant", self.restaurant, ["enable_runner", "auto_detect_tip"]),
		}

	def test_a_restaurant_manager_can(self):
		with as_user(self.manager):
			delete_table(name=self.spare_table)
		self.assertFalse(frappe.db.exists("Restaurant Table", self.spare_table))

	def test_a_restaurant_manager_runs_the_whole_set_up(self):
		# A manager who holds no right on the ERP's items: the item sheet and the price list are the ERP's (see the
		# next test), everything else is the restaurant's
		calls = [
			(fn, kwargs)
			for fn, kwargs in [*self.management_calls(), *self.card_editor_reads()]
			if not (fn is update_item_price and kwargs.get("scope") == "global")
			and not (fn is update_item_details and "description" in kwargs)
		]
		with (
			as_user(self.manager),
			patch.object(restaurant_api, "_fetch_food_image", return_value=IMAGE),
			self.no_pdf_engine_and_no_image_provider(),
			self.a_response(),
		):
			for fn, kwargs in calls:
				with self.subTest(fn=fn.__name__, kwargs=kwargs):
					frappe.db.savepoint("manager_call")
					try:
						fn(**kwargs)
					except Exception as error:
						self.fail(
							f"{fn.__name__}({kwargs}) refused a manager: {type(error).__name__}: {error}"
						)
					finally:
						frappe.db.rollback(save_point="manager_call")

	def test_the_item_sheet_and_the_price_list_keep_the_erps_rights(self):
		item = frappe.db.get_value("Item", self.item, ["description", "standard_rate"])
		# A restaurant's manager who may not edit items in the ERP does not edit them from the till either
		with as_user(self.manager):
			for fn, kwargs in (
				(update_item_details, {"item_code": self.item, "description": "_Test"}),
				(update_item_details, {"item_code": self.item, "color": "#ff0000", "badges": "[]"}),
				(update_item_price, {"item_code": self.item, "price": 3, "scope": "global"}),
			):
				with self.subTest(fn=fn.__name__, kwargs=kwargs), self.assertRaises(frappe.PermissionError):
					fn(**kwargs)
			# What the item panel saves of a dish for such a manager is the restaurant's: the card's price and
			# availability, the badges and spice level the card prints, the dish's option groups
			update_item_price(item_code=self.item, price=3, card_name=self.card)
			update_item_active(item_code=self.item, disabled=1, card_name=self.card)
			update_item_badges(item_code=self.item, badges="[]", spice_level=2)
			update_item_details(item_code=self.item, option_groups=json.dumps([self.option_group]))
		self.assertEqual(
			frappe.db.get_value("Restaurant Card Item", {"parent": self.card}, ["price", "disabled"]), (3, 1)
		)
		self.assertEqual(frappe.db.get_value("Item", self.item, "custom_spice_level"), 2)
		self.assertTrue(
			frappe.db.exists("Product Option Group Item", {"parent": self.option_group, "item": self.item})
		)
		self.assertEqual(frappe.db.get_value("Item", self.item, ["description", "standard_rate"]), item)
		# Given the ERP's right on items, the sheet changes, and what a call does not name stays (the spice level
		# used to fall back to 0 whenever a call did not name it)
		make_user(self.manager, ["Item Manager"])
		with as_user(self.manager):
			update_item_details(item_code=self.item, description="_Test sheet")
		# (the description is a text editor field: Frappe wraps it in HTML)
		description, spice_level = frappe.db.get_value(
			"Item", self.item, ["description", "custom_spice_level"]
		)
		self.assertIn("_Test sheet", description)
		self.assertEqual(spice_level, 2)
		# The till's price list wants the ERP's right on prices, checked before anything is written
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		till = _till_fixture()
		with as_user(self.manager), self.assertRaises(frappe.PermissionError):
			update_item_price(item_code=self.item, price=4, scope="global_only", pos_profile=till.profile)
		self.assertEqual(frappe.db.get_value("Item", self.item, "standard_rate"), item[1])
		make_user(self.manager, ["Sales Master Manager"])
		with as_user(self.manager):
			update_item_price(item_code=self.item, price=4, scope="global_only", pos_profile=till.profile)
		self.assertEqual(frappe.db.get_value("Item", self.item, "standard_rate"), 4)
		self.assertEqual(
			frappe.db.get_value(
				"Item Price", {"item_code": self.item, "price_list": till.price_list}, "price_list_rate"
			),
			4,
		)

	def every_read(self):
		"""Every read this task gates: the service's, the card editor's, the item creation dialog's, the permanent
		card's."""
		return [
			*self.reads(),
			*self.card_editor_reads(),
			(get_item_creation_defaults, {}),
			(get_or_create_permanent_card, {"restaurant": self.restaurant}),
			(get_reservations, {"restaurant": self.restaurant}),
			(
				get_reservation_stats,
				{"from_date": nowdate(), "to_date": nowdate(), "restaurant": self.restaurant},
			),
		]

	def test_a_website_user_reads_nothing(self):
		with as_user(self.website_user), self.no_pdf_engine_and_no_image_provider():
			with self.assertRaises(frappe.PermissionError):
				get_tips()
			for fn, kwargs in self.every_read():
				with self.subTest(fn=fn.__name__, kwargs=kwargs), self.assertRaises(frappe.PermissionError):
					fn(**kwargs)

	def test_a_portal_account_is_refused_whatever_roles_it_was_given(self):
		calls = [
			*self.every_read(),
			*self.management_calls(),
			(update_table_status, {"table_name": self.table, "status": "Occupied"}),
		]
		with as_user(self.portal), self.no_pdf_engine_and_no_image_provider():
			for fn, kwargs in calls:
				with self.subTest(fn=fn.__name__, kwargs=kwargs), self.assertRaises(frappe.PermissionError):
					fn(**kwargs)

	def test_a_restaurant_the_user_may_not_read_is_refused(self):
		# A user permission keeps the cashier to another restaurant: he reads that one's settings, tips, stations and
		# workflows, not this one's
		other = self.insert(
			"Restaurant", restaurant_name="_Test Rights Other Restaurant", company=self.company
		)
		self.addCleanup(frappe.clear_cache, user=self.cashier)
		self.addCleanup(frappe.db.rollback)
		self.insert("User Permission", user=self.cashier, allow="Restaurant", for_value=other)
		frappe.clear_cache(user=self.cashier)
		reads = (get_restaurant_settings, get_tips, get_preparation_stations, get_station_workflows)
		with as_user(self.cashier):
			for fn in reads:
				with self.subTest(fn=fn.__name__):
					with self.assertRaises(frappe.PermissionError):
						fn(restaurant=self.restaurant)
					fn(restaurant=other)

	def test_a_record_is_named_by_its_name(self):
		# A JSON body can carry a dict where a name is expected; frappe.get_doc would read it as filters, past the
		# record's own check: refused, whoever asks
		with as_user(self.manager):
			for name in (
				{"name": self.spare_table},
				{"table_name": "_Test Rights T9"},
				["_Test Rights T9"],
				7,
			):
				with self.subTest(name=name):
					with self.assertRaises(frappe.PermissionError):
						permissions.require("Restaurant Table", "delete", name)
					with self.assertRaises(frappe.PermissionError):
						delete_table(name=name)
		self.assertTrue(frappe.db.exists("Restaurant Table", self.spare_table))

	def test_making_the_permanent_card_is_a_managers(self):
		# None yet: the cashier may not make it, and nothing is made
		with as_user(self.cashier), self.assertRaises(frappe.PermissionError):
			get_or_create_permanent_card(restaurant=self.restaurant)
		self.assertFalse(
			frappe.db.exists("Restaurant Card", {"restaurant": self.restaurant, "is_permanent": 1})
		)
		with as_user(self.manager):
			made = get_or_create_permanent_card(restaurant=self.restaurant)
		self.assertTrue(made["created"])
		# Once it exists, the cashier reads it
		with as_user(self.cashier):
			self.assertEqual(
				get_or_create_permanent_card(restaurant=self.restaurant), {**made, "created": False}
			)


class TestATableIsTheFloorPlans(RestaurantRights):
	def test_a_cashier_sets_the_status_of_a_table(self):
		with as_user(self.cashier):
			update_table_status(table_name=self.table, status="Cleaning")
			mark_table_available(table_name=self.table)
			doc = frappe.get_doc("Restaurant Table", self.table)
			doc.status = "Occupied"
			doc.save()
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table, "status"), "Occupied")

	def test_nothing_else_of_a_table_whatever_the_route(self):
		layout = {
			"table_name": "_Test renamed",
			"capacity": 12,
			"pos_x": 500,
			"pos_y": 500,
			"width": 300,
			"height": 300,
			"shape": "Round",
		}
		with as_user(self.cashier):
			for field, value in layout.items():
				with self.subTest(field=field):
					doc = frappe.get_doc("Restaurant Table", self.table)
					doc.set(field, value)
					with self.assertRaises(frappe.PermissionError):
						doc.save()
			# The desk's own route
			with self.assertRaises(frappe.PermissionError):
				frappe.client.set_value("Restaurant Table", self.table, "pos_x", 500)
		self.assertEqual(
			frappe.db.get_value("Restaurant Table", self.table, ["pos_x", "table_name"]),
			(10, "_Test Rights T1"),
		)
		# Whoever lays out the floor moves it
		with as_user(self.manager):
			frappe.client.set_value("Restaurant Table", self.table, "pos_x", 500)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table, "pos_x"), 500)


class TestTheTillIsToldWhatItsUserMayManage(RestaurantRights):
	def told(self, user):
		with as_user(user):
			settings = {}
			extend_bootstrap_settings(settings)
		return settings["restaurant_can"]

	def test_the_till_is_told_what_the_user_may_manage(self):
		self.assertEqual(set(self.told(self.cashier)), EVERY_RIGHT)
		self.assertFalse(self.told(self.cashier)["manage_floor"])
		self.assertTrue(self.told(self.manager)["manage_floor"])

	def test_each_user_is_told_his_own_rights(self):
		self.assertEqual(
			self.told(self.cashier),
			{right: right == "view_tips" for right in EVERY_RIGHT},
		)
		self.assertEqual(self.told(self.manager), MANAGER_IS_TOLD)
		self.assertEqual(self.told("Administrator"), dict.fromkeys(EVERY_RIGHT, True))
		# The ERP's rights on items and prices, and the till's settings, are told as the server checks them
		make_user(self.manager, ["Item Manager", "Sales Master Manager", permissions.TILL_MANAGER_ROLE])
		self.assertEqual(self.told(self.manager), dict.fromkeys(EVERY_RIGHT, True))
		# A portal account is told nothing, whatever roles it holds; so is a kitchen account, which has no desk
		for user in (self.website_user, self.portal, self.kitchen):
			with self.subTest(user=user):
				self.assertEqual(self.told(user), dict.fromkeys(EVERY_RIGHT, False))

	def test_the_seam_tells_every_screen(self):
		hooks = frappe.get_hooks("pos_next_bootstrap_settings")
		# Registered beside the restaurant of the till (task 2), not instead of it
		self.assertIn("pos_next.restaurant.scope.extend_bootstrap_settings", hooks)
		self.assertIn("pos_next.restaurant.bootstrap.extend_bootstrap_settings", hooks)
		with as_user(self.manager):
			settings = {"restaurant": self.restaurant}
			registry.extend_bootstrap_settings(settings, None)
		self.assertEqual(settings["restaurant_name"], RESTAURANT)
		self.assertEqual(settings["restaurant_can"], MANAGER_IS_TOLD)


class TestTheRolesAndTheRules(RestaurantRights):
	def test_the_roles_are_made_with_their_desk_access(self):
		# The doctype sync makes every role the rules name, with desk access: the kitchen's is turned off
		frappe.db.set_value("Role", permissions.KITCHEN_ROLE, "desk_access", 1)
		ensure_restaurant_roles()
		ensure_restaurant_roles()
		self.assertEqual(frappe.db.get_value("Role", permissions.MANAGER_ROLE, "desk_access"), 1)
		self.assertEqual(frappe.db.get_value("Role", permissions.KITCHEN_ROLE, "desk_access"), 0)
		# A kitchen device account is no desk account
		self.assertEqual(frappe.db.get_value("User", self.kitchen, "user_type"), "Website User")
		self.assertEqual(frappe.db.get_value("User", self.manager, "user_type"), "System User")

	def rights_of(self, user, doctype):
		return {
			ptype
			for ptype in ("read", "write", "create", "delete")
			if frappe.has_permission(doctype, ptype, user=user)
		}

	def test_the_rules_of_the_restaurant_doctypes(self):
		admin = make_user(ADMIN, ["Admin"])
		for doctype in permissions.DOCTYPES:
			with self.subTest(doctype=doctype):
				for user in (self.manager, admin):
					self.assertTrue(MANAGE <= self.rights_of(user, doctype), user)
				self.assertEqual(
					self.rights_of(self.cashier, doctype),
					{
						"Restaurant Reservation": {"read", "write", "create"},
						"Restaurant Tip": {"read", "create"},
						"Restaurant Table": {"read", "write"},
					}.get(doctype, {"read"}),
				)
				self.assertEqual(
					self.rights_of(self.kitchen, doctype),
					{"read"} if doctype in ("Preparation Station", "Preparation Workflow") else set(),
				)
		# The JSON gives every manager role, the till manager of upstream as well, every right on every doctype. What a
		# site customized keeps its own rules, the administrator's excepted (see the next test)
		for role in (*permissions.MANAGER_ROLES, permissions.TILL_MANAGER_ROLE):
			for doctype in permissions.DOCTYPES:
				with self.subTest(role=role, doctype=doctype):
					rule = frappe.get_all(
						"DocPerm",
						filters={"parent": doctype, "parenttype": "DocType", "role": role, "permlevel": 0},
						fields=list(MANAGE),
					)
					self.assertTrue(rule and all(rule[0].values()), rule)

	def test_a_customized_doctype_gets_the_rules_too(self):
		# A site of the fleet: the doctype's rules were copied when our theme gave the customer's administrator read on
		# every doctype, before this app's JSON named its managers, its kitchen and its cashier
		doctype = "Restaurant Table"
		self.addCleanup(frappe.clear_cache, doctype=doctype)
		self.addCleanup(frappe.db.rollback)
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
			setup_custom_perms(doctype)
		granted = (
			permissions.MANAGER_ROLE,
			permissions.TILL_MANAGER_ROLE,
			permissions.KITCHEN_ROLE,
			permissions.CASHIER_ROLE,
		)
		frappe.db.delete("Custom DocPerm", {"parent": doctype, "role": ["in", [*granted, "Admin"]]})

		def rule(role, **rights):
			frappe.get_doc(
				{
					"doctype": "Custom DocPerm",
					"parent": doctype,
					"parenttype": "DocType",
					"parentfield": "permissions",
					"role": role,
					**rights,
				}
			).insert(ignore_permissions=True)

		# The administrator reads only (our theme's rule); the till manager's rule was narrowed by the customer
		rule("Admin", read=1)
		rule(permissions.TILL_MANAGER_ROLE, read=1)
		frappe.clear_cache(doctype=doctype)
		admin = make_user(ADMIN, ["Admin"])
		till_manager = make_user(
			"restaurant-rights-till-manager@yopmail.com", [permissions.TILL_MANAGER_ROLE]
		)
		self.assertEqual(self.rights_of(admin, doctype), {"read"})
		self.assertEqual(self.rights_of(self.cashier, doctype), set())

		self.assertEqual(grant_restaurant_permissions(), [doctype])

		# « Patron = Admin : tout »: the administrator's rule is widened to every right the JSON gives him
		self.assertTrue(MANAGE <= self.rights_of(admin, doctype))
		# A role with no rule gets the JSON's: the restaurant's manager, the cashier (a table's status)
		self.assertTrue(MANAGE <= self.rights_of(self.manager, doctype))
		self.assertEqual(self.rights_of(self.cashier, doctype), {"read", "write"})
		# Any other rule the site has is the site's: the narrowed till manager still only reads
		self.assertEqual(self.rights_of(till_manager, doctype), {"read"})
		# Run again, it changes nothing
		rows = frappe.get_all(
			"Custom DocPerm", filters={"parent": doctype}, fields=["name", "modified"], order_by="name"
		)
		self.assertEqual(grant_restaurant_permissions(), [])
		self.assertEqual(
			frappe.get_all(
				"Custom DocPerm", filters={"parent": doctype}, fields=["name", "modified"], order_by="name"
			),
			rows,
		)

	def test_an_administrator_without_any_rule_gets_one(self):
		doctype = "Restaurant Area"
		self.addCleanup(frappe.clear_cache, doctype=doctype)
		self.addCleanup(frappe.db.rollback)
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
			setup_custom_perms(doctype)
		frappe.db.delete("Custom DocPerm", {"parent": doctype, "role": "Admin"})
		frappe.clear_cache(doctype=doctype)

		grant_restaurant_permissions()

		self.assertTrue(MANAGE <= self.rights_of(make_user(ADMIN, ["Admin"]), doctype))

	def test_a_migrate_and_an_install_make_the_roles_and_the_rules(self):
		for hook in (install.after_migrate, install.after_install):
			with (
				self.subTest(hook=hook.__name__),
				patch.multiple(
					install,
					reclaim_pos_settings_doctype=lambda **kwargs: None,
					ensure_coupon_code_field=lambda **kwargs: None,
					setup_default_print_format=lambda **kwargs: None,
					grant_cashier_permissions=lambda: None,
				),
				patch.object(frappe, "clear_cache"),
				patch("pos_next.restaurant.permissions.ensure_restaurant_roles") as roles,
				patch("pos_next.restaurant.permissions.grant_restaurant_permissions") as rules,
			):
				hook()
				roles.assert_called_once_with()
				rules.assert_called_once_with()


class TestTheMenuDesigner(RestaurantRights):
	"""The menu designer is the card editor's (maintenance#2002): whoever manages the cards and reads the card. What it
	prints is escaped, its design is checked, and the PDF engine runs no script and reads no local file."""

	def designer_calls(self):
		return [
			(get_menu_preview_data, {"card_name": self.card}),
			(get_design_templates, {}),
			(get_menu_preview_html, {"card_name": self.card}),
			(generate_menu_pdf, {"card_name": self.card}),
			(generate_multi_card_pdf, {"card_names": json.dumps([self.card])}),
			(save_card_design, {"card_name": self.card}),
		]

	def test_a_portal_account_and_a_cashier_are_refused(self):
		for user in (self.portal, self.website_user, self.cashier):
			with as_user(user), self.no_pdf_engine_and_no_image_provider() as engine, self.a_response():
				for fn, kwargs in self.designer_calls():
					with self.subTest(user=user, fn=fn.__name__), self.assertRaises(frappe.PermissionError):
						fn(**kwargs)
			engine.assert_not_called()

	def test_a_manager_is_served(self):
		with (
			as_user(self.manager),
			self.no_pdf_engine_and_no_image_provider() as engine,
			self.a_response() as response,
		):
			self.assertEqual(
				get_menu_preview_data(card_name=self.card)["card"]["card_name"], "_Test Rights Card"
			)
			self.assertIsInstance(get_design_templates(), list)
			self.assertIn("_Test Rights Card", get_menu_preview_html(card_name=self.card))
			generate_menu_pdf(card_name=self.card)
			self.assertEqual((response.type, response.filecontent), ("download", b"%PDF-1.4"))
			generate_multi_card_pdf(card_names=json.dumps([self.card, self.card]))
			save_card_design(card_name=self.card, overrides=json.dumps({"footer_text": "_Test"}))
		self.assertEqual(engine.call_count, 2)

	def test_the_pdf_engine_runs_no_script_and_reads_no_local_file(self):
		for paper in ("A4 Portrait", "Custom"):
			with self.subTest(paper=paper):
				options = menu_pdf._get_wkhtmltopdf_options({"paper_format": paper})
				self.assertEqual(
					(options["disable-javascript"], options["disable-local-file-access"]), ("", "")
				)
		with as_user(self.manager), self.no_pdf_engine_and_no_image_provider() as engine, self.a_response():
			generate_menu_pdf(card_name=self.card)
		self.assertTrue(
			{"disable-javascript", "disable-local-file-access"} <= set(engine.call_args.kwargs["options"])
		)

	def test_an_unknown_override_is_ignored(self):
		overrides = {"unknown_key": "x", "header_text": "Chef", "style_theme": "../../hooks"}
		with (
			as_user(self.manager),
			patch.object(frappe, "render_template", wraps=frappe.render_template) as render,
		):
			get_menu_preview_html(card_name=self.card, overrides=json.dumps(overrides))
		path, context = render.call_args.args[:2]
		self.assertNotIn("unknown_key", context["design"])
		self.assertEqual(str(context["design"]["header_text"]), "Chef")
		# A theme is one of the design template's, never a path
		self.assertEqual(path, "pos_next/templates/menu/modern.html")
		# What a card saves of its design is a design's keys only
		with as_user(self.manager):
			save_card_design(
				card_name=self.card, overrides=json.dumps({"unknown_key": "x", "footer_text": "Bye"})
			)
		self.assertEqual(
			json.loads(frappe.db.get_value("Restaurant Card", self.card, "custom_design_overrides")),
			{"footer_text": "Bye"},
		)

	def test_what_the_menu_prints_is_escaped(self):
		script = "<script>alert(1)</script>"
		frappe.db.set_value("Restaurant Card", self.card, "description", f"<i>{script}</i>")
		frappe.db.set_value("Restaurant Card Item", {"parent": self.card}, "label", "<u>Dish</u>")
		overrides = {
			"header_text": "<b>Chef</b>",
			"footer_text": script,
			"font_body": "x'};</style><script>",
			"color_primary": "red;}</style>",
		}
		with as_user(self.manager):
			html = get_menu_preview_html(card_name=self.card, overrides=json.dumps(overrides))
		self.assertNotIn("<script>", html)
		self.assertNotIn("</style><script>", html)
		self.assertNotIn("red;}", html)
		for escaped in (
			"&lt;b&gt;Chef&lt;/b&gt;",
			"&lt;u&gt;Dish&lt;/u&gt;",
			"&lt;script&gt;alert(1)&lt;/script&gt;",
		):
			self.assertIn(escaped, html)

	def test_a_description_is_text_escaped_once(self):
		# As the desk's text editor stores it: HTML, its entities encoded
		frappe.db.set_value(
			"Item",
			self.item,
			"description",
			'<div class="ql-editor read-mode"><p>Fish &amp; chips&nbsp;fresh</p></div>',
			update_modified=False,
		)
		with as_user(self.manager):
			html = get_menu_preview_html(card_name=self.card, overrides=json.dumps({"show_descriptions": 1}))
			extra = get_card_items_extra(card_name=self.card)
		self.assertIn("Fish &amp; chips\xa0fresh", html)
		self.assertNotIn("&amp;amp;", html)
		self.assertNotIn("&amp;nbsp;", html)
		# The card editor's list and the item panel show text
		self.assertEqual(extra[self.item]["description"], "Fish & chips\xa0fresh")
		make_user(self.manager, ["Item Manager"])
		with as_user(self.manager):
			self.assertEqual(get_item_edit_data(item_code=self.item)["description"], "Fish & chips\xa0fresh")

	def test_a_css_that_fetches_or_leaves_its_sheet_is_refused(self):
		fetching = "body { background: url(https://example.invalid/x.png) }"
		with as_user(self.manager):
			# Escaped or not, a fetch is a fetch: the escapes are decoded before the check
			for css in (
				fetching,
				"@import 'x.css';",
				"</style><script>x</script>",
				"a { b: u\\72l(x) }",
				"b { c: \\75\\72\\6c(x) }",
				"@\\69mport 'x.css';",
			):
				with self.subTest(css=css), self.assertRaises(frappe.ValidationError):
					save_card_design(card_name=self.card, overrides=json.dumps({"custom_css": css}))
		# A design template refuses it on save
		with self.assertRaises(frappe.ValidationError):
			self.insert(
				"Menu Design Template",
				template_name="_Test Rights Fetching",
				custom_css="@import url(x.css);",
			)
		# One stored before the check prints without it; a CSS that only styles prints as it is
		template = self.insert(
			"Menu Design Template",
			template_name="_Test Rights Plain",
			style_theme="modern",
			custom_css="h1 { color: red }",
		)
		with as_user(self.manager):
			self.assertIn(
				"h1 { color: red }", get_menu_preview_html(card_name=self.card, template_name=template)
			)
		frappe.db.set_value("Menu Design Template", template, "custom_css", fetching)
		with as_user(self.manager):
			self.assertNotIn(
				"example.invalid", get_menu_preview_html(card_name=self.card, template_name=template)
			)
		# A harmless escape passes: a bullet before each dish, saved on the card (its design then overrides the
		# template's CSS)
		bullet = 'li::before { content: "\\2022"; }'
		with as_user(self.manager):
			save_card_design(card_name=self.card, overrides=json.dumps({"custom_css": bullet}))
			self.assertIn(bullet, get_menu_preview_html(card_name=self.card))


class TestTheFirstSettingsMakeTheDefaultRestaurant(RestaurantRights):
	"""A site that saves its first restaurant settings from the till has no restaurant yet: it gets the default one,
	made as the user who saves."""

	def without_any_restaurant(self):
		# Removed inside the transaction, rows only: a restaurant's logo file is not touched. The cached documents go
		# too, before and after the rollback
		names = frappe.get_all("Restaurant", pluck="name")
		forget = lambda: [frappe.clear_document_cache("Restaurant", name) for name in names]  # noqa: E731
		self.addCleanup(forget)
		self.addCleanup(frappe.db.rollback)
		frappe.db.delete("Restaurant Opening Hours", {"parenttype": "Restaurant"})
		frappe.db.delete("Restaurant")
		forget()

	def test_the_first_settings_make_the_default_restaurant_as_the_user(self):
		self.without_any_restaurant()
		with as_user(self.cashier), self.assertRaises(frappe.PermissionError):
			save_restaurant_settings(settings={"enable_runner": 1})
		self.assertEqual(frappe.db.count("Restaurant"), 0)
		with as_user(self.manager):
			save_restaurant_settings(settings={"enable_runner": 1})
		made = frappe.get_all("Restaurant", fields=["name", "owner", "enable_runner"])
		self.assertEqual([(row.owner, row.enable_runner) for row in made], [(self.manager, 1)])
		self.assertEqual(made[0].name, restaurant_settings.default_company())

	def test_settings_that_name_no_restaurant_on_a_site_that_has_some_are_refused(self):
		# Every restaurant is disabled, one of them already named after the company: none is the default, and a second
		# one named after the company would collide with the first
		self.without_any_restaurant()
		for name in (restaurant_settings.default_company(), "_Test Rights Other"):
			frappe.get_doc(
				{"doctype": "Restaurant", "restaurant_name": name, "company": self.company, "enabled": 0}
			).insert(ignore_permissions=True)
		self.assertIsNone(restaurant_settings.default_restaurant())
		with as_user(self.manager), self.assertRaises(frappe.ValidationError) as refusal:
			save_restaurant_settings(settings={"enable_runner": 1})
		self.assertNotIsInstance(refusal.exception, frappe.DuplicateEntryError)
		self.assertEqual(frappe.db.count("Restaurant"), 2)
