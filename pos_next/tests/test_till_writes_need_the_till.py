# //// Neoffice — added file (no upstream equivalent).
"""A till shift and a till invoice need the till.

check_opening_shift answers a desk account about its own open shift (another user's takes a till
manager), create_opening_shift takes the till it opens a shift at, and update_invoice / submit_invoice
take the till their payload names, on the two document types the till sends.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from pos_next.api import invoices, shifts

PORTAL = "tillwrite-portal@yopmail.com"
DESK = "tillwrite-desk@yopmail.com"
TILL = "tillwrite-till@yopmail.com"
OTHER_TILL = "tillwrite-other-till@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
PROFILE = "_PNXT tillwrite till"
OTHER_PROFILE = "_PNXT tillwrite other till"
ITEM = "_PNXT tillwrite item"
CUSTOMER = "_PNXT tillwrite customer"
OFFLINE_ID = "tillwrite-offline-sale"


def _user(email, roles, user_type):
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, ignore_permissions=True, force=True)
	frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"roles": [{"role": r} for r in roles if frappe.db.exists("Role", r)],
		}
	).insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "user_type", user_type)
	frappe.clear_cache(user=email)


def _company():
	"""ERPNext's test company when its books are open today, else the first company whose are."""
	from erpnext.accounts.utils import FiscalYearError, get_fiscal_year

	for company in ["_Test Company", *frappe.get_all("Company", pluck="name", order_by="creation")]:
		if not frappe.db.exists("Company", company):
			continue
		try:
			get_fiscal_year(nowdate(), company=company, verbose=0)
		except FiscalYearError:
			continue
		return company
	raise AssertionError("No company has its books open today")


def _cash_mode(company):
	"""An enabled mode of payment the company has an account for; on a bare site, Cash is wired to
	the company's cash account."""
	found = frappe.db.sql(
		"""select mpa.parent from `tabMode of Payment Account` mpa
		join `tabMode of Payment` mp on mp.name = mpa.parent
		where mpa.company = %s and ifnull(mpa.default_account, '') != '' and mp.enabled = 1
		order by mp.type = 'Cash' desc, mpa.parent limit 1""",
		company,
	)
	if found:
		return found[0][0]
	if not frappe.db.exists("Mode of Payment", "Cash"):
		frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "Cash", "type": "Cash"}).insert(
			ignore_permissions=True
		)
	mode = frappe.get_doc("Mode of Payment", "Cash")
	mode.enabled = 1
	row = next((r for r in mode.accounts if r.company == company), None) or mode.append(
		"accounts", {"company": company}
	)
	row.default_account = frappe.get_cached_value(
		"Company", company, "default_cash_account"
	) or frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name")
	mode.save(ignore_permissions=True)
	return mode.name


def _item(company):
	return frappe.db.get_value("Item", {"item_code": ITEM}) or (
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": ITEM,
				"item_name": ITEM,
				"item_group": frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft"),
				"stock_uom": frappe.db.get_value("UOM", "Nos") or frappe.db.get_value("UOM", {}, "name"),
				"is_stock_item": 0,
				"is_sales_item": 1,
				# Its own row: an item group's defaults may list a company twice, which an item refuses.
				"item_defaults": [{"company": company}],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _customer():
	return frappe.db.get_value("Customer", {"customer_name": CUSTOMER}) or (
		frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": CUSTOMER,
				"customer_type": "Individual",
				"customer_group": invoices._leaf_customer_group(),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories",
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _till_fixture():
	"""Two tills of the test's own on a company whose books are open today: the cashier's, and
	another one assigned to OTHER_TILL only. Both are paid in cash and sell a non-stock item."""
	company = _company()
	currency = frappe.get_cached_value("Company", company, "default_currency")
	cost_center = frappe.get_cached_value("Company", company, "cost_center") or frappe.db.get_value(
		"Cost Center", {"company": company, "is_group": 0}, "name"
	)
	write_off_account = frappe.get_cached_value(
		"Company", company, "write_off_account"
	) or frappe.db.get_value("Account", {"company": company, "is_group": 0, "root_type": "Expense"}, "name")
	fx = frappe._dict(
		company=company,
		currency=currency,
		mode=_cash_mode(company),
		price_list=frappe.db.get_value(
			"Price List", {"selling": 1, "enabled": 1, "currency": currency}, "name"
		),
		item=_item(company),
		customer=_customer(),
	)
	for key, name, user in (("profile", PROFILE, TILL), ("other_profile", OTHER_PROFILE, OTHER_TILL)):
		if frappe.db.exists("POS Profile", name):
			frappe.delete_doc("POS Profile", name, ignore_permissions=True, force=True)
		fx[key] = (
			frappe.get_doc(
				{
					"doctype": "POS Profile",
					"name": name,
					"company": company,
					"currency": currency,
					"warehouse": frappe.db.get_value(
						"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
					),
					"selling_price_list": fx.price_list,
					"customer": fx.customer,
					"cost_center": cost_center,
					"write_off_account": write_off_account,
					"write_off_cost_center": cost_center,
					"write_off_limit": 1,
					"disable_rounded_total": 1,
					"payments": [{"mode_of_payment": fx.mode, "default": 1}],
					# Assigned to the till the way a cashier is: a row of the POS Profile's user table.
					"applicable_for_users": [{"user": user}],
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
	return fx


def _sale(fx, **changes):
	"""A one-line cash sale, as the till sends it."""
	sale = {
		"doctype": "Sales Invoice",
		"is_pos": 1,
		"pos_profile": fx.profile,
		"company": fx.company,
		"currency": fx.currency,
		"customer": fx.customer,
		"selling_price_list": fx.price_list,
		"items": [{"item_code": fx.item, "qty": 1, "rate": 10, "price_list_rate": 10}],
		"payments": [{"mode_of_payment": fx.mode, "amount": 10}],
	}
	sale.update(changes)
	return sale


class TestTillWritesNeedTheTill(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		# update_invoice commits (restaurant fields): a no-op here keeps the test inside the
		# transaction tearDown rolls back. Stopped by addCleanup, which runs even when setUp fails.
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(PORTAL, ["Customer"], "Website User")
		_user(DESK, ["Blogger"], "System User")
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		# update_invoice sets it for the rest of the request and never resets it.
		frappe.flags.ignore_account_permission = self.account_flag

	def _gate_refuses(self, endpoint, *args, **kwargs):
		"""Refused by the till's gate, before the endpoint reads its payload: ERPNext's own account
		checks refuse some accounts too, but later, once a draft has been loaded."""
		with patch.object(
			invoices, "_strip_server_managed_fields", wraps=invoices._strip_server_managed_fields
		) as body:
			with self.assertRaises(frappe.PermissionError):
				endpoint(*args, **kwargs)
		body.assert_not_called()

	def _assert_refused_everywhere(self, user):
		fx = self.fx
		sale = json.dumps(_sale(fx))
		# Guest ordering's invoices belong to Guest: what counts is that none is added here.
		owned = (
			frappe.db.count("POS Opening Shift", {"user": user}),
			frappe.db.count("Sales Invoice", {"owner": user}),
		)
		frappe.set_user(user)
		shift_calls = [
			("check_opening_shift, own", shifts.check_opening_shift, ()),
			("check_opening_shift, Administrator's", shifts.check_opening_shift, ("Administrator",)),
			(
				"create_opening_shift",
				shifts.create_opening_shift,
				(fx.profile, fx.company, json.dumps([{"mode_of_payment": fx.mode, "opening_amount": 0}])),
			),
		]
		for label, endpoint, args in shift_calls:
			with self.subTest(call=label), self.assertRaises(frappe.PermissionError):
				endpoint(*args)
		with self.subTest(call="update_invoice"):
			self._gate_refuses(invoices.update_invoice, sale)
		with self.subTest(call="submit_invoice"):
			self._gate_refuses(invoices.submit_invoice, invoice=sale, data="{}")
		with self.subTest(call="submit_invoice, offline replay"):
			replay = {"invoice": _sale(fx, offline_id=OFFLINE_ID), "data": {"sales_team": []}}
			self._gate_refuses(invoices.submit_invoice, data=json.dumps(replay))
		frappe.set_user("Administrator")
		self.assertEqual(
			(
				frappe.db.count("POS Opening Shift", {"user": user}),
				frappe.db.count("Sales Invoice", {"owner": user}),
			),
			owned,
		)
		self.assertFalse(frappe.db.exists("Offline Invoice Sync", {"offline_id": OFFLINE_ID}))

	def test_a_portal_account_is_refused_everywhere(self):
		self._assert_refused_everywhere(PORTAL)

	def test_a_visitor_is_refused_everywhere(self):
		self._assert_refused_everywhere("Guest")

	def test_a_desk_account_with_no_till_right_is_refused_at_the_till(self):
		fx = self.fx
		frappe.set_user(DESK)
		# The desk half still answers: its own shift (none).
		self.assertIsNone(shifts.check_opening_shift())
		with self.assertRaises(frappe.PermissionError):
			shifts.check_opening_shift("Administrator")
		with self.assertRaises(frappe.PermissionError):
			shifts.create_opening_shift(
				fx.profile, fx.company, json.dumps([{"mode_of_payment": fx.mode, "opening_amount": 0}])
			)
		self._gate_refuses(invoices.update_invoice, json.dumps(_sale(fx)))
		self._gate_refuses(invoices.submit_invoice, invoice=json.dumps(_sale(fx)), data="{}")

	def test_the_till_opens_and_sees_its_own_shift(self):
		fx = self.fx
		frappe.set_user(TILL)
		opened = shifts.create_opening_shift(
			fx.profile, fx.company, json.dumps([{"mode_of_payment": fx.mode, "opening_amount": 50}])
		)
		shift = opened["pos_opening_shift"]["name"]
		self.assertEqual(opened["pos_opening_shift"]["docstatus"], 1)
		self.assertEqual(opened["pos_profile"].name, fx.profile)
		self.assertEqual(shifts.check_opening_shift()["pos_opening_shift"].name, shift)
		self.assertEqual(shifts.check_opening_shift(TILL)["pos_opening_shift"].name, shift)
		with self.assertRaises(frappe.PermissionError):
			shifts.check_opening_shift("Administrator")
		# A System Manager may look at a cashier's shift.
		frappe.set_user("Administrator")
		self.assertEqual(shifts.check_opening_shift(TILL)["pos_opening_shift"].name, shift)

	def test_the_till_saves_and_submits_its_invoice(self):
		fx = self.fx
		frappe.set_user(TILL)
		draft = invoices.update_invoice(json.dumps(_sale(fx)))
		self.assertEqual((draft["docstatus"], draft["pos_profile"], draft["owner"]), (0, fx.profile, TILL))
		done = invoices.submit_invoice(invoice=json.dumps(_sale(fx, name=draft["name"])), data="{}")
		self.assertEqual((done["name"], done["status"]), (draft["name"], 1))
		self.assertEqual(frappe.db.get_value("Sales Invoice", draft["name"], "docstatus"), 1)

	def test_a_sale_made_offline_still_syncs_for_its_cashier(self):
		# The offline queue replays the sale later, in the shape of utils/offline/sync.js.
		frappe.set_user(TILL)
		replay = {"invoice": _sale(self.fx, offline_id=OFFLINE_ID), "data": {"sales_team": []}}
		synced = invoices.submit_invoice(data=json.dumps(replay))
		self.assertEqual((synced["status"], synced["offline_id"]), (1, OFFLINE_ID))
		self.assertEqual(frappe.db.get_value("Sales Invoice", synced["name"], "owner"), TILL)
		self.assertEqual(
			frappe.db.get_value("Offline Invoice Sync", {"offline_id": OFFLINE_ID}, "status"), "Synced"
		)

	def test_the_till_writes_only_its_documents(self):
		fx = self.fx
		frappe.set_user(TILL)
		for doctype in ("Quotation", "Purchase Invoice", "Journal Entry", "User"):
			with self.subTest(doctype=doctype):
				other = json.dumps(_sale(fx, doctype=doctype))
				self._gate_refuses(invoices.update_invoice, other)
				self._gate_refuses(invoices.submit_invoice, invoice=other, data="{}")
		with self.subTest(payload="no POS Profile"):
			self._gate_refuses(invoices.update_invoice, json.dumps(_sale(fx, pos_profile=None)))

	def test_a_draft_stays_with_its_till(self):
		fx = self.fx
		frappe.set_user(TILL)
		draft = invoices.update_invoice(json.dumps(_sale(fx)))["name"]
		# Assigned to the other till only, and reading no sales invoice.
		frappe.set_user(OTHER_TILL)
		invoices._require_till_document(_sale(fx, pos_profile=fx.other_profile))
		moved = json.dumps(_sale(fx, pos_profile=fx.other_profile, name=draft))
		self._gate_refuses(invoices.update_invoice, moved)
		self._gate_refuses(
			invoices.submit_invoice, invoice=json.dumps(_sale(fx, pos_profile=None, name=draft)), data="{}"
		)
		frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", draft, ["pos_profile", "docstatus", "owner"]),
			(fx.profile, 0, TILL),
		)
