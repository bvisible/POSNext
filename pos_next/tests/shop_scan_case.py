# //// Neoffice — added file (no upstream equivalent).
"""The decor of the shop-scan suites: a shop till that lets customers scan, its shift open, articles with a barcode and a
price on the till's price list. The customer acts as `Guest`, the cashier at her till; the administrator only lays the
decor. Each test rolls back to its savepoint."""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime, nowdate

from pos_next.shop_scan import session
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

SAVEPOINT = "shop_scan_case"
PRICE = 10


class ShopCase(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, [CASHIER_ROLE], "System User")
		self.fx = _till_fixture()
		self.group = frappe.db.get_value("Item", self.fx.item, "item_group")
		self.warehouse = frappe.db.get_value("POS Profile", self.fx.profile, "warehouse")
		self.settings = self.a_shop_till(self.fx.profile)
		self.opening = self.open_a_shift(self.fx.profile)
		self.key = session.shop_key(self.fx.profile)
		self.give_a_barcode(self.fx.item, "PNXT-SHOP-A")
		self.give_a_price(self.fx.item, PRICE)

	# The decor

	def a_shop_till(self, pos_profile, **values):
		for name in frappe.get_all("POS Settings", filters={"pos_profile": pos_profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": pos_profile,
				"enabled": 1,
				"enable_shop_scan": 1,
				**values,
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True).name

	def open_a_shift(self, pos_profile):
		"""The till's shift, opened by its cashier as the till opens it (a POS Opening Shift, maintenance#2473)."""
		from pos_next.api import shifts

		opened = self.as_cashier(
			shifts.create_opening_shift,
			pos_profile,
			self.fx.company,
			json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
		)
		return opened["pos_opening_shift"]["name"]

	def an_old_opening_entry(self, pos_profile):
		"""An ERPNext POS Opening Entry left « Open », as a site that sold with ERPNext's till before keeps them."""
		entry = frappe.get_doc(
			{
				"doctype": "POS Opening Entry",
				"period_start_date": now_datetime(),
				"posting_date": nowdate(),
				"company": self.fx.company,
				"pos_profile": pos_profile,
				"user": TILL,
				"status": "Open",
				"balance_details": [{"mode_of_payment": self.fx.mode, "opening_amount": 0}],
			}
		)
		entry.flags.ignore_validate = True
		entry.flags.ignore_mandatory = True
		entry.flags.ignore_links = True
		entry.insert(ignore_permissions=True)
		frappe.db.set_value("POS Opening Entry", entry.name, "docstatus", 1)
		return entry.name

	def give_a_barcode(self, item_code, barcode):
		if not frappe.db.exists("Item Barcode", {"barcode": barcode}):
			item = frappe.get_doc("Item", item_code)
			item.append("barcodes", {"barcode": barcode})
			item.save(ignore_permissions=True)

	def give_a_price(self, item_code, price):
		for name in frappe.get_all(
			"Item Price", filters={"item_code": item_code, "price_list": self.fx.price_list}, pluck="name"
		):
			frappe.delete_doc("Item Price", name, force=True, ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": item_code,
				"price_list": self.fx.price_list,
				"price_list_rate": price,
			}
		).insert(ignore_permissions=True)

	def an_item(self, item_code, barcode, price=PRICE, item_group=None, **fields):
		"""An article of the till's company with `barcode` and `price`, like the till's own article but for `fields`."""
		if not frappe.db.exists("Item", item_code):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": item_code,
					"item_name": item_code,
					"item_group": item_group or self.group,
					"stock_uom": frappe.db.get_value("Item", self.fx.item, "stock_uom"),
					"is_stock_item": 0,
					"is_sales_item": 1,
					"item_defaults": [{"company": self.fx.company, "default_warehouse": self.warehouse}],
				}
			).insert(ignore_permissions=True)
		self.give_a_barcode(item_code, barcode)
		if price is not None:
			self.give_a_price(item_code, price)
		if fields:
			frappe.db.set_value("Item", item_code, fields)
			frappe.clear_document_cache("Item", item_code)
		return item_code

	# The people

	def as_guest(self, method, *args, **kwargs):
		"""A call of the customer's phone: no account, no right."""
		frappe.set_user("Guest")
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def as_cashier(self, method, *args, user=TILL, **kwargs):
		frappe.set_user(user)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def a_session(self, key=None):
		from pos_next.api import shop_scan

		return self.as_guest(shop_scan.start_shop_session, key or self.key)["token"]

	def the_draft(self, token):
		name = frappe.db.get_value("Guest Order Token", {"token": token}, "invoice")
		return frappe.get_doc("Sales Invoice", name) if name else None
