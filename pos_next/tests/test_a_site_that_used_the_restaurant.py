# //// Neoffice — added file (no upstream equivalent).
"""Whether a site used the restaurant (NeoRestau lot 1, task 4, fix round 1).

Two patches act only on a site that used the restaurant module: the one that makes the default restaurant out of the
single `Restaurant Settings`, and the one that switches NeoRestau on. They share one criterion, `site_used_the_restaurant`:
a ticked till, a record that only a person makes (a room, a table, a card, a station, a reservation, a tip), opening hours,
an order on a table. Never the stored values of the single: a migrate writes its defaults on every site, those of a client
that never used the module included, and a default cannot be told from a choice.

The suite builds what it needs and removes what a working site (the clone) holds, inside the test transaction: nothing here
commits, and the end of each class rolls everything back.
"""

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


def a_site_that_never_used_the_restaurant():
	"""Make the site what a client that never used the restaurant is, inside the test transaction: no ticked till, no
	record, no opening hours, no order on a table. The single keeps its stored values: they are the defaults every site
	holds, and they are not use."""
	frappe.db.sql("UPDATE `tabPOS Settings` SET enable_restaurant_mode = 0 WHERE enable_restaurant_mode = 1")
	for doctype in RECORDS:
		frappe.db.delete(doctype)
	frappe.db.delete("Restaurant Opening Hours")
	if frappe.db.has_column("Sales Invoice", "restaurant_table"):
		frappe.db.sql(
			"UPDATE `tabSales Invoice` SET restaurant_table = NULL WHERE IFNULL(restaurant_table, '') != ''"
		)
	for fieldname, value in DEFAULTS_OF_THE_SINGLE.items():
		frappe.db.set_single_value("Restaurant Settings", fieldname, value)


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
		a_site_that_never_used_the_restaurant()

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


class TestAnOrderOnATableIsUse(FrappeTestCase):
	"""The proof a site leaves when it served tables through the till and ticked nothing."""

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
		a_site_that_never_used_the_restaurant()

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

	def test_an_order_that_names_no_table_is_no_use(self):
		self.an_order()
		self.assertFalse(site_used_the_restaurant())

	def test_a_draft_order_on_a_table_is_use(self):
		order = self.an_order()
		# The table itself may be gone (deleted by force, or lost in a restore): the order alone says tables were served
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", "_Test Usage T9")
		self.assertTrue(site_used_the_restaurant())
		frappe.db.set_value("Sales Invoice", order, "restaurant_table", None)
		self.assertFalse(site_used_the_restaurant())
