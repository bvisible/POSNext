# //// Neoffice — added file (no upstream equivalent).
"""Whether a site used the restaurant (NeoRestau lot 1, task 4, fix rounds 1 and 2).

Three patches act only on a site that used the restaurant module: the one that makes the default restaurant out of the
single `Restaurant Settings`, the one that attaches what a site made before the restaurants to the default restaurant,
and the one that switches NeoRestau on. They share one criterion, `site_used_the_restaurant`: a ticked till, a record
that only a person makes (a room, a table, a card, a menu, a station, a reservation, a tip), opening hours, an order on
a table. Never the stored values of the single: a migrate writes its defaults on every site, those of a client that never
used the module included, and a default cannot be told from a choice.

The suite builds what it needs and removes what a working site (the clone) holds, inside the test transaction: nothing
here commits, and the end of each class rolls everything back. It never writes to the orders of the clone (no index
covers `restaurant_table`: an UPDATE would hold a lock on every invoice of the shared clone until the class ends): the
probe that looks for an order on a table is replaced for the tests that are not about it, and the tests that are about
it look at an invoice of their own.
"""

from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant.usage import site_used_the_restaurant
from pos_next.tests.test_till_writes_need_the_till import _company, _customer, _item

# What a person makes when the restaurant is used, and a migrate never: one record of each is enough to say so
RECORDS = {
	"Restaurant Area": {"area_name": "_Test Usage Room"},
	"Restaurant Table": {"table_name": "_Test Usage T1"},
	"Restaurant Card": {"card_name": "_Test Usage Card", "is_active": 1},
	"Restaurant Menu": {"menu_name": "_Test Usage Menu", "price": 20, "is_active": 1},
	"Preparation Station": {"station_name": "_Test Usage Kitchen"},
	"Restaurant Reservation": {
		"status": "Confirmed",
		"reservation_date": nowdate(),
		"reservation_time": "20:00:00",
		"duration": 5400,
		"no_of_guests": 2,
		"guest_name": "_Test Guest",
	},
	"Restaurant Tip": {"amount": 3},
}
LUNCH = {"day_of_week": "Monday", "from_time": "09:00:00", "to_time": "14:00:00", "label": "Lunch"}
# A few of the stored values a migrate writes into the single on every site, and a customised one
DEFAULTS_OF_THE_SINGLE = {
	"enable_runner": 1,
	"auto_detect_tip": 1,
	"guest_account_mode": "Not Proposed",
	"qr_order_validation": "Direct to Kitchen",
	"no_show_delay": 60,
	"token_expiry_days": 7,
	"enable_tips": 1,
}
PROBE = "pos_next.restaurant.usage.an_order_names_a_table"


def clear_the_signs_of_use():
	"""Remove, inside the test transaction, what a working site holds that says the restaurant was used: the ticks of
	its tills, its records, its opening hours. The single keeps its stored values: they are the defaults every site
	holds, and they are not use. The orders are not touched (see the module's docstring)."""
	ticked = frappe.get_all("POS Settings", filters={"enable_restaurant_mode": 1}, pluck="name")
	if ticked:
		frappe.db.sql("UPDATE `tabPOS Settings` SET enable_restaurant_mode = 0 WHERE name IN %s", (ticked,))
	for doctype in RECORDS:
		frappe.db.delete(doctype)
	frappe.db.delete("Restaurant Opening Hours")
	for fieldname, value in DEFAULTS_OF_THE_SINGLE.items():
		frappe.db.set_single_value("Restaurant Settings", fieldname, value)


def a_site_that_never_used_the_restaurant(test):
	"""Make the site what a client that never used the restaurant is, for one test: no ticked till, no record, no opening
	hours, and no order on a table (the probe that looks for one answers no, instead of the orders being written to)."""
	clear_the_signs_of_use()
	probe = patch(PROBE, return_value=False)
	probe.start()
	test.addCleanup(probe.stop)


class TestASiteThatUsedTheRestaurant(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		a_site_that_never_used_the_restaurant(self)

	def a_till(self, enabled):
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": "_Test Usage Till",
				"enabled": enabled,
				"enable_restaurant_mode": 1,
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True)

	def test_a_site_that_holds_only_the_defaults_of_the_single_has_not_used_the_restaurant(self):
		# The single holds stored values (a migrate wrote them), a customised one among them: none of them is use
		self.assertTrue(frappe.db.get_singles_dict("Restaurant Settings"))
		self.assertFalse(site_used_the_restaurant())

	def test_a_ticked_till_is_use_whether_it_is_enabled_or_not(self):
		for enabled in (1, 0):
			with self.subTest(enabled=enabled):
				till = self.a_till(enabled)
				self.assertTrue(site_used_the_restaurant())
				frappe.delete_doc("POS Settings", till.name, force=True, ignore_permissions=True)
				self.assertFalse(site_used_the_restaurant())

	def test_a_till_that_is_not_ticked_is_no_use(self):
		till = self.a_till(1)
		till.db_set("enable_restaurant_mode", 0)
		self.assertFalse(site_used_the_restaurant())

	def test_each_kind_of_record_is_use(self):
		for doctype, values in RECORDS.items():
			with self.subTest(doctype=doctype):
				record = frappe.get_doc({"doctype": doctype, **values})
				record.flags.ignore_validate = True
				record.flags.ignore_links = True
				record.flags.ignore_mandatory = True
				record.insert(ignore_permissions=True)
				self.assertTrue(site_used_the_restaurant())
				frappe.delete_doc(doctype, record.name, force=True, ignore_permissions=True)
				self.assertFalse(site_used_the_restaurant())

	def test_a_menu_is_use(self):
		# The menus a restaurant sells at a fixed price: a record the attach patch moves like the others
		menu = frappe.get_doc({"doctype": "Restaurant Menu", **RECORDS["Restaurant Menu"]})
		menu.flags.ignore_validate = True
		menu.insert(ignore_permissions=True)
		self.assertTrue(site_used_the_restaurant())

	def test_opening_hours_are_use_on_the_single_and_on_a_restaurant(self):
		single = frappe.get_single("Restaurant Settings")
		single.flags.ignore_validate = True
		# The clone's single names cards the neutral site no longer has
		single.flags.ignore_links = True
		single.set("opening_hours", [])
		single.append("opening_hours", LUNCH)
		single.save(ignore_permissions=True)
		self.assertTrue(site_used_the_restaurant())
		# Task 1's patch moves the hours of the single to the restaurant it makes: the answer must not change on the way
		frappe.db.delete("Restaurant Opening Hours")
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		frappe.get_doc(
			{
				"doctype": "Restaurant",
				"restaurant_name": "_Test Usage Restaurant",
				"company": company[0],
				"opening_hours": [LUNCH],
			}
		).insert(ignore_permissions=True)
		self.assertTrue(site_used_the_restaurant())

	def test_the_probe_of_the_orders_is_asked_last(self):
		# The one query that may read a big table: nothing asks it where a cheaper sign already answers
		with patch(PROBE) as probe:
			self.a_till(1)
			self.assertTrue(site_used_the_restaurant())
		probe.assert_not_called()


class TestAnOrderOnATableIsUse(FrappeTestCase):
	"""The proof a site leaves when it served tables through the till and ticked nothing. A working site holds orders on
	tables of its own, which must not answer for these tests: the probe is made to see the invoice of the test only, and
	nothing is written to the orders that are there."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		cls.company = _company()
		cls.currency = frappe.get_cached_value("Company", cls.company, "default_currency")
		cls.price_list = frappe.db.get_value(
			"Price List", {"selling": 1, "enabled": 1, "currency": cls.currency}, "name"
		)
		cls.item = _item(cls.company)
		cls.customer = _customer()

	def setUp(self):
		super().setUp()
		frappe.db.savepoint("usage_test")
		self.addCleanup(frappe.db.rollback, save_point="usage_test")
		clear_the_signs_of_use()

	def an_order(self):
		"""A draft order of the till's customer, on no table."""
		return (
			frappe.get_doc(
				{
					"doctype": "Sales Invoice",
					"company": self.company,
					"currency": self.currency,
					"customer": self.customer,
					"selling_price_list": self.price_list,
					"posting_date": nowdate(),
					"items": [{"item_code": self.item, "qty": 1, "rate": 10}],
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	@contextmanager
	def seeing_only(self, order):
		"""The probe sees this invoice and no other."""
		exists = frappe.db.exists

		def restricted(doctype, filters=None, *args, **kwargs):
			if doctype == "Sales Invoice" and isinstance(filters, dict):
				filters = {**filters, "name": order}
			return exists(doctype, filters, *args, **kwargs)

		with patch.object(frappe.db, "exists", side_effect=restricted):
			yield

	def test_an_order_that_names_no_table_is_no_use(self):
		order = self.an_order()
		with self.seeing_only(order):
			self.assertFalse(site_used_the_restaurant())

	def test_a_draft_order_on_a_table_is_use(self):
		order = self.an_order()
		# The table itself may be gone (deleted by force, or lost in a restore): the order alone says tables were served
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", "_Test Usage T9")
		with self.seeing_only(order):
			self.assertTrue(site_used_the_restaurant())
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", None)
		with self.seeing_only(order):
			self.assertFalse(site_used_the_restaurant())

	def test_a_site_without_the_column_of_the_table_asks_no_invoice(self):
		# The column is a custom field the restaurant adds: a site that has not got it holds no order on a table
		asked = []
		exists = frappe.db.exists

		def spy(doctype, *args, **kwargs):
			asked.append(doctype)
			return exists(doctype, *args, **kwargs)

		with (
			patch.object(frappe.db, "has_column", return_value=False),
			patch.object(frappe.db, "exists", side_effect=spy),
		):
			self.assertFalse(site_used_the_restaurant())
		self.assertNotIn("Sales Invoice", asked)
