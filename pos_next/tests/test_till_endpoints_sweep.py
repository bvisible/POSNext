# //// Neoffice — added file (no upstream equivalent).
"""Every till endpoint checks who calls it.

The till's reads and writes answer the till's users; the kitchen's screens answer desk accounts; desk
forms, search queries, a report and the promotion module follow their own rights; the customer display
takes writes from its own open shift; an endpoint that reads across every till answers a till manager;
document hooks and server helpers are not web endpoints, and still run in-process as whoever caused
them; the item endpoints check every call made while a web request is served, whatever route, name or
endpoint it comes through, except inside the scope their in-process callers open.
"""

import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
import frappe.handler
import requests
from frappe.api import v2 as api_v2
from frappe.custom.doctype.custom_field.custom_field import create_custom_field
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from pos_next import realtime_events
from pos_next.api import (
	authorization,
	cash_entry,
	credit_sales,
	customer_display,
	customers,
	email,
	gift_cards,
	invoices,
	items,
	menu_pdf,
	offers,
	promotions,
	qz,
	restaurant,
	shifts,
	wallet,
)
from pos_next.pos_next.doctype.bank_deposits import bank_deposits
from pos_next.pos_next.doctype.pos_closing_shift import pos_closing_shift
from pos_next.pos_next.doctype.wallet import wallet as wallet_doctype
from pos_next.pos_next.doctype.wallet_transaction import wallet_transaction
from pos_next.pos_next.report.sales_vs_shifts_report import sales_vs_shifts_report as shifts_report
from pos_next.tests.test_gift_card_families import _fake_invoice
from pos_next.tests.test_till_writes_need_the_till import _cash_mode, _company, _customer, _item, _user

PORTAL = "tillsweep-portal@yopmail.com"
DESK = "tillsweep-desk@yopmail.com"
TILL = "tillsweep-till@yopmail.com"
OTHER_CASHIER = "tillsweep-other-cashier@yopmail.com"
MANAGER = "tillsweep-manager@yopmail.com"
REPORTER = "tillsweep-reporter@yopmail.com"
COUNTER = "tillsweep-counter@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
MANAGER_ROLE = "Nexus POS Manager"
PROFILE = "_PNXT tillsweep till"
OTHER_PROFILE = "_PNXT tillsweep other till"
NONE = "tillsweep-no-such-name"

# Document hooks and server helpers: they run in-process, as whoever caused them, and no web client
# calls them, so none of them is whitelisted.
IN_PROCESS_HELPERS = (
	gift_cards.create_gift_card_from_invoice,
	gift_cards.process_gift_card_on_submit,
	gift_cards.process_gift_card_on_cancel,
	wallet.get_customer_wallet_balance,
	wallet.get_customer_wallet,
	wallet.get_or_create_wallet,
	wallet_transaction.create_wallet_credit,
	wallet_transaction.credit_loyalty_points_to_wallet,
	wallet_transaction.reverse_wallet_transactions_for_return,
	wallet_doctype.get_customer_wallet,
	wallet_doctype.get_customer_wallet_balance,
	wallet_doctype.create_customer_wallet,
	wallet_doctype.get_or_create_wallet,
)


def _till():
	"""A till of the test's own, paid in cash, on a company whose books are open today; the cashier
	(and, by mistake, the portal account) is assigned to it."""
	company = _company()
	currency = frappe.get_cached_value("Company", company, "default_currency")
	cost_center = frappe.get_cached_value("Company", company, "cost_center") or frappe.db.get_value(
		"Cost Center", {"company": company, "is_group": 0}, "name"
	)
	write_off_account = frappe.get_cached_value(
		"Company", company, "write_off_account"
	) or frappe.db.get_value("Account", {"company": company, "is_group": 0, "root_type": "Expense"}, "name")
	mode = _cash_mode(company)
	if frappe.db.exists("POS Profile", PROFILE):
		frappe.delete_doc("POS Profile", PROFILE, ignore_permissions=True, force=True)
	frappe.get_doc(
		{
			"doctype": "POS Profile",
			"name": PROFILE,
			"company": company,
			"currency": currency,
			"warehouse": frappe.db.get_value(
				"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name"
			),
			"selling_price_list": frappe.db.get_value(
				"Price List", {"selling": 1, "enabled": 1, "currency": currency}, "name"
			),
			"cost_center": cost_center,
			"write_off_account": write_off_account,
			"write_off_cost_center": cost_center,
			"write_off_limit": 1,
			"payments": [{"mode_of_payment": mode, "default": 1}],
			"applicable_for_users": [{"user": TILL}, {"user": PORTAL}],
		}
	).insert(ignore_permissions=True)
	return frappe._dict(
		company=company, currency=currency, mode=mode, customer=_customer(), item=_item(company)
	)


@contextmanager
def _request(path, cmd=None, **form):
	"""A web request for ``path`` around the block, its form carrying ``form`` and, when the route sets
	one (the v1 routes do), ``cmd``. What was there before is put back; a request that was not there is
	removed, not left as None."""
	had_request = hasattr(frappe.local, "request")
	saved_request = getattr(frappe.local, "request", None)
	saved_form, saved_response = frappe.local.form_dict, frappe.local.response
	frappe.local.request = SimpleNamespace(path=path, method="POST", headers={})
	frappe.local.form_dict = frappe._dict(form, **({"cmd": cmd} if cmd else {}))
	frappe.local.response = frappe._dict({"docs": []})
	try:
		yield
	finally:
		frappe.local.form_dict, frappe.local.response = saved_form, saved_response
		if had_request:
			frappe.local.request = saved_request
		else:
			del frappe.local.request


@contextmanager
def _no_request():
	"""No web request around the block, as in a background job; a request that was there is put back."""
	had_request = hasattr(frappe.local, "request")
	saved_request = getattr(frappe.local, "request", None)
	if had_request:
		del frappe.local.request
	try:
		yield
	finally:
		if had_request:
			frappe.local.request = saved_request


def _in_process(call):
	"""``call`` made the way the item endpoints' in-process callers make it: inside their scope."""
	with items.in_process_item_reads():
		return call()


def _set_user(user):
	"""frappe.set_user empties the request's form; a request keeps its form whoever sends it."""
	form = frappe.local.form_dict
	frappe.set_user(user)
	frappe.local.form_dict = form


def _past_the_gate(call, *errors):
	"""A call given a made-up name, or a fixture its own rules turn down: past its gate it fails on that
	instead (by default, the named document does not exist), which counts as served. A refusal is never
	one of these errors: frappe's PermissionError is not a ValidationError."""
	errors = errors or (frappe.DoesNotExistError,)

	def run():
		try:
			return call()
		except errors:
			return None

	return run


class TestTillEndpointsSweep(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# The till's item queries leave out internal items through a Custom Field every instance gets
		# from the hub (Item.is_internal_item); a fresh CI site never had it, so the class adds it
		# before any write (the schema change commits).
		if not frappe.db.has_column("Item", "is_internal_item"):
			create_custom_field(
				"Item",
				{"fieldname": "is_internal_item", "label": "Is Internal Item", "fieldtype": "Check", "hidden": 1},
			)

	def setUp(self):
		frappe.set_user("Administrator")
		# Nothing may outlive the test: some endpoints commit, and one rolls back on its own error, which
		# would drop the fixture halfway through. Cleanups run last in, first out, even when setUp fails
		# halfway: the patches stop, then the real rollback, bound before they start, runs.
		self.addCleanup(frappe.db.rollback)
		real_rollback = frappe.db.rollback
		for patcher in (
			patch.object(frappe.local.db, "commit"),
			patch.object(
				frappe.local.db,
				"rollback",
				side_effect=lambda *a, **kw: real_rollback(*a, **kw) if (a or kw.get("save_point")) else None,
			),
		):
			patcher.start()
			self.addCleanup(patcher.stop)
		# A portal account holding till roles: a role does not make it a desk account.
		_user(PORTAL, ["Customer", CASHIER_ROLE, MANAGER_ROLE], "Website User")
		_user(DESK, ["Blogger"], "System User")
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_CASHIER, [CASHIER_ROLE], "System User")
		_user(MANAGER, [MANAGER_ROLE], "System User")
		# Accounts User: the role that reads Sales Invoice reports in a standard ERPNext.
		_user(REPORTER, ["Sales Manager", "Accounts User"], "System User")
		self.fx = _till()
		frappe.set_user(TILL)
		opened = shifts.create_opening_shift(
			PROFILE,
			self.fx.company,
			json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 50}]),
		)
		frappe.set_user("Administrator")
		self.fx.shift = opened["pos_opening_shift"]["name"]
		self.fx.invoice = (
			frappe.get_doc(
				{
					"doctype": "Sales Invoice",
					"company": self.fx.company,
					# The company's currency, named: left blank, an invoice takes the default price
					# list's, which on a fresh CI site differs from the receivable account's.
					"currency": self.fx.currency,
					"customer": self.fx.customer,
					"pos_profile": PROFILE,
					"posa_pos_opening_shift": self.fx.shift,
					"items": [{"item_code": self.fx.item, "qty": 1, "rate": 10}],
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def tearDown(self):
		frappe.set_user("Administrator")
		# The display endpoints keep the cart and the payment QR in the cache, not in the database.
		for prefix in (customer_display.CART_CACHE_PREFIX, customer_display.PAYMENT_QR_CACHE_PREFIX):
			frappe.cache().delete_value(f"{prefix}{self.fx.shift}")

	# --- the endpoints, by the rule that now guards them ------------------------------------------------

	def _till_calls(self):
		"""Refused to a desk account with no till; answered to the till."""
		fx = self.fx
		return [
			("get_cash_entry_templates", lambda: cash_entry.get_cash_entry_templates(fx.company, PROFILE)),
			("get_cash_entries", lambda: cash_entry.get_cash_entries(fx.shift)),
			("get_wallet_info", lambda: wallet.get_wallet_info(fx.customer, fx.company, PROFILE)),
			("get_loyalty_details", lambda: wallet.get_loyalty_details(fx.customer, fx.company)),
			("get_wallet_payment_methods", lambda: wallet.get_wallet_payment_methods(PROFILE)),
			("apply_gift_card", lambda: gift_cards.apply_gift_card(NONE, 10)),
			("get_gift_cards_from_invoice", lambda: gift_cards.get_gift_cards_from_invoice(fx.invoice)),
			("get_offers", lambda: offers.get_offers(PROFILE)),
			(
				"get_customer_one_time_redemptions",
				lambda: offers.get_customer_one_time_redemptions(fx.customer),
			),
			("get_active_coupons", lambda: offers.get_active_coupons(fx.customer, fx.company)),
			("get_customers", lambda: customers.get_customers("", PROFILE)),
			("get_customer_details", lambda: customers.get_customer_details(fx.customer)),
			("get_customer_balance", lambda: credit_sales.get_customer_balance(fx.customer, fx.company)),
			(
				"get_available_credit",
				lambda: credit_sales.get_available_credit(fx.customer, fx.company, PROFILE),
			),
			("get_credit_sale_summary", lambda: credit_sales.get_credit_sale_summary(PROFILE)),
			# No QZ Tray key on a test site: past the gate, signing says so.
			("sign_message", _past_the_gate(lambda: qz.sign_message("tillsweep"), frappe.ValidationError)),
			("get_suggested_opening_balance", lambda: shifts.get_suggested_opening_balance(PROFILE)),
			("cleanup_old_drafts", lambda: invoices.cleanup_old_drafts(PROFILE)),
			("validate_cart_items", lambda: invoices.validate_cart_items("[]", PROFILE)),
			("validate_return_items", lambda: invoices.validate_return_items(fx.invoice, "[]")),
			("get_returnable_invoices", lambda: invoices.get_returnable_invoices(5, PROFILE)),
			("search_invoice_by_number", lambda: invoices.search_invoice_by_number(NONE, PROFILE)),
			("check_invoice_return_validity", lambda: invoices.check_invoice_return_validity(fx.invoice)),
			("get_invoice_for_return", lambda: invoices.get_invoice_for_return(fx.invoice)),
			# The fixture invoice is a draft: past the gate, a return of it is turned down.
			(
				"prepare_return_invoice",
				_past_the_gate(lambda: invoices.prepare_return_invoice(fx.invoice), frappe.ValidationError),
			),
			("search_invoices_for_return", lambda: invoices.search_invoices_for_return(invoice_name=NONE)),
			("get_invoice_email_context", lambda: email.get_invoice_email_context(fx.invoice)),
			("update_cart_data", lambda: customer_display.update_cart_data(fx.shift, "{}")),
			("clear_cart_cache", lambda: customer_display.clear_cart_cache(fx.shift)),
			("notify_sale_complete", lambda: customer_display.notify_sale_complete(fx.shift)),
			("push_payment_qr", lambda: customer_display.push_payment_qr(fx.shift, NONE)),
			("clear_payment_qr", lambda: customer_display.clear_payment_qr(fx.shift)),
			("get_table_payment_summary", lambda: restaurant.get_table_payment_summary(NONE)),
			("get_table_order", lambda: restaurant.get_table_order(NONE)),
			("get_tips", lambda: restaurant.get_tips()),
			("broadcast_cfd_update", lambda: restaurant.broadcast_cfd_update("{}")),
			("delete_table", _past_the_gate(lambda: restaurant.delete_table(NONE))),
			("update_station", _past_the_gate(lambda: restaurant.update_station(NONE))),
			("delete_station", lambda: restaurant.delete_station(NONE)),
			("save_product_option_group", _past_the_gate(lambda: restaurant.save_product_option_group(NONE))),
			(
				"create_product_option_group",
				lambda: restaurant.create_product_option_group("tillsweep group"),
			),
			("delete_product_option_group", lambda: restaurant.delete_product_option_group(NONE)),
			("save_preparation_workflow", _past_the_gate(lambda: restaurant.save_preparation_workflow(NONE))),
			("create_preparation_workflow", lambda: restaurant.create_preparation_workflow("tillsweep flow")),
			("delete_preparation_workflow", lambda: restaurant.delete_preparation_workflow(NONE)),
			# An address the image search does not serve: past the gate, it is not fetched.
			(
				"download_food_image",
				_past_the_gate(lambda: restaurant.download_food_image("", NONE), frappe.ValidationError),
			),
			("duplicate_card", _past_the_gate(lambda: restaurant.duplicate_card(NONE))),
			("update_item_details", _past_the_gate(lambda: restaurant.update_item_details(NONE))),
			("update_item_price", lambda: restaurant.update_item_price(NONE, 1, pos_profile=PROFILE)),
			("update_item_active", lambda: restaurant.update_item_active(NONE)),
			("update_item_badges", _past_the_gate(lambda: restaurant.update_item_badges(NONE))),
			("save_card_design", _past_the_gate(lambda: menu_pdf.save_card_design(NONE))),
		]

	def _manager_calls(self):
		"""What reads across every till: a till manager only."""
		return [("get_gift_cards_with_balance", gift_cards.get_gift_cards_with_balance)]

	def _desk_calls(self):
		"""Refused to a portal account; answered to any desk account (the till and the kitchen's
		screens, whose accounts need not work at a till)."""
		return [
			("get_opening_dialog_data", shifts.get_opening_dialog_data),
			("check_offline_invoice_synced", lambda: invoices.check_offline_invoice_synced(NONE)),
			("request_grant", lambda: authorization.request_grant(NONE, "Administrator", "0000")),
			("get_tables", restaurant.get_tables),
			("get_kds_orders", restaurant.get_kds_orders),
			("get_runner_orders", restaurant.get_runner_orders),
			("get_takeaway_orders", restaurant.get_takeaway_orders),
			("update_takeaway_status", _past_the_gate(lambda: restaurant.update_takeaway_status(NONE, "Ready"))),
		]

	def _form_calls(self):
		"""Desk forms, search queries, a report and the promotion module: the document's own rule."""
		fx = self.fx
		today = {"from_date": nowdate(), "to_date": nowdate()}
		return [
			("get_pos_invoices", lambda: pos_closing_shift.get_pos_invoices(fx.shift)),
			("get_payments_entries", lambda: pos_closing_shift.get_payments_entries(fx.shift)),
			(
				"get_cashiers",
				lambda: pos_closing_shift.get_cashiers("User", "", "name", 0, 20, {"parent": PROFILE}),
			),
			(
				"get_pos_closing_shifts",
				lambda: bank_deposits.get_pos_closing_shifts("POS Closing Shift", "", "name", 0, 20, {}),
			),
			("get_hourly_breakdown", lambda: shifts_report.get_hourly_breakdown(today)),
			("get_payment_method_breakdown", lambda: shifts_report.get_payment_method_breakdown(today)),
			("get_daily_trend", lambda: shifts_report.get_daily_trend(today)),
			("apply_referral_code", self._apply_made_up_referral_code),
			("get_referral_codes", promotions.get_referral_codes),
		]

	def _apply_made_up_referral_code(self):
		# Past the gate, the made-up code is turned down by the referral rules themselves.
		return _past_the_gate(
			lambda: promotions.apply_referral_code(NONE, self.fx.customer), frappe.ValidationError
		)()

	def _in_process_calls(self):
		"""The hooks and server helpers, called the way server code calls them: (function, call)."""
		fx = self.fx
		return [
			(
				gift_cards.create_gift_card_from_invoice,
				lambda: gift_cards.create_gift_card_from_invoice(fx.invoice),
			),
			(
				gift_cards.process_gift_card_on_submit,
				lambda: gift_cards.process_gift_card_on_submit(fx.invoice),
			),
			(
				gift_cards.process_gift_card_on_cancel,
				lambda: gift_cards.process_gift_card_on_cancel(fx.invoice),
			),
			(
				wallet_transaction.create_wallet_credit,
				_past_the_gate(lambda: wallet_transaction.create_wallet_credit(NONE, 1)),
			),
			(
				wallet_transaction.credit_loyalty_points_to_wallet,
				lambda: wallet_transaction.credit_loyalty_points_to_wallet(fx.customer, fx.company, 0),
			),
			(
				wallet_transaction.reverse_wallet_transactions_for_return,
				lambda: wallet_transaction.reverse_wallet_transactions_for_return(fx.invoice, fx.invoice),
			),
			(wallet_doctype.get_customer_wallet, lambda: wallet_doctype.get_customer_wallet(fx.customer)),
			(
				wallet_doctype.get_customer_wallet_balance,
				lambda: wallet_doctype.get_customer_wallet_balance(fx.customer),
			),
			(
				wallet_doctype.create_customer_wallet,
				lambda: wallet_doctype.create_customer_wallet(fx.customer, fx.company),
			),
			(
				wallet_doctype.get_or_create_wallet,
				lambda: wallet_doctype.get_or_create_wallet(fx.customer, fx.company),
			),
			(wallet.get_customer_wallet_balance, lambda: wallet.get_customer_wallet_balance(fx.customer)),
			(wallet.get_customer_wallet, lambda: wallet.get_customer_wallet(fx.customer)),
			(wallet.get_or_create_wallet, lambda: wallet.get_or_create_wallet(fx.customer, fx.company)),
		]

	# --- helpers ----------------------------------------------------------------------------------------

	def _refused(self, user, label, call):
		_set_user(user)
		try:
			with self.assertRaises(frappe.PermissionError, msg=f"{label} answered {user}"):
				call()
		finally:
			_set_user("Administrator")

	def _served(self, user, label, call):
		"""The call returns; anything it raises, a refusal or not, fails the test (a call given a made-up
		name says which error it expects instead: _past_the_gate)."""
		_set_user(user)
		try:
			return call()
		except Exception as e:
			self.fail(f"{label} failed for {user}: {type(e).__name__}: {e}")
		finally:
			_set_user("Administrator")

	def _written(self):
		return tuple(
			frappe.db.count(doctype)
			for doctype in ("Wallet", "Wallet Transaction", "Coupon Code", "Item Price")
		)

	def _gift_card(self, amount):
		"""A gift card as the webshop issues it (test_gift_card_families): native type, no POS flag."""
		company = self.fx.company
		code = f"TILLSWEEP-{frappe.generate_hash(length=8).upper()}"
		rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": f"Tillsweep card {code}",
				"apply_on": "Transaction",
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Amount",
				"discount_amount": amount,
				"selling": 1,
				"company": company,
				"currency": frappe.get_cached_value("Company", company, "default_currency"),
				"valid_from": nowdate(),
				"coupon_code_based": 1,
				"priority": "1",
			}
		).insert(ignore_permissions=True)
		return (
			frappe.get_doc(
				{
					"doctype": "Coupon Code",
					"coupon_name": f"Tillsweep gift card {code}",
					"coupon_type": "Gift Card",
					"coupon_code": code,
					"pricing_rule": rule.name,
					"valid_from": nowdate(),
					"maximum_use": 0,
					"used": 0,
					"gift_card_amount": amount,
					"original_gift_card_amount": amount,
					"customer": self.fx.customer,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	# --- tests ------------------------------------------------------------------------------------------

	def test_a_portal_account_is_refused_everywhere(self):
		before = self._written()
		for label, call in self._till_calls() + self._manager_calls() + self._desk_calls() + self._form_calls():
			self._refused(PORTAL, label, call)
		self.assertEqual(self._written(), before)

	def test_a_visitor_is_refused_everywhere(self):
		for label, call in self._till_calls() + self._manager_calls() + self._desk_calls() + self._form_calls():
			self._refused("Guest", label, call)

	def test_a_desk_account_with_no_till_is_refused_at_the_till(self):
		for label, call in self._till_calls() + self._manager_calls() + self._form_calls():
			self._refused(DESK, label, call)
		for label, call in self._desk_calls():
			self._served(DESK, label, call)

	def test_the_till_is_served(self):
		for label, call in self._till_calls() + self._desk_calls():
			self._served(TILL, label, call)
		frappe.set_user(TILL)
		try:
			self.assertIsInstance(customers.get_customers("", PROFILE), list)
			self.assertIsInstance(cash_entry.get_cash_entries(self.fx.shift), list)
			self.assertIsInstance(cash_entry.get_cash_entry_templates(self.fx.company, PROFILE), list)
			self.assertEqual(gift_cards.get_gift_cards_from_invoice(self.fx.invoice), [])
			# Its own shift's closing data, as the desk form and the till's closing read it.
			self.assertIsInstance(pos_closing_shift.get_pos_invoices(self.fx.shift), list)
			self.assertIsInstance(pos_closing_shift.get_payments_entries(self.fx.shift), list)
			cashiers = pos_closing_shift.get_cashiers("User", "", "name", 0, 20, {"parent": PROFILE})
			self.assertIn(TILL, [row[0] for row in cashiers])
			self.assertIsInstance(
				bank_deposits.get_pos_closing_shifts("POS Closing Shift", "", "name", 0, 20, {}),
				(list, tuple),
			)
		finally:
			frappe.set_user("Administrator")

	def test_every_gift_card_balance_is_for_a_till_manager(self):
		for label, call in self._manager_calls():
			for user in (TILL, OTHER_CASHIER):
				self._refused(user, label, call)
			for user in (MANAGER, "Administrator"):
				self.assertIsInstance(self._served(user, label, call), list)

	def test_a_till_manager_works_at_any_till(self):
		# Here nobody is assigned to the till nor reads sales invoices: only the manager's role admits.
		def at_the_till():
			return cash_entry.require_till_access(PROFILE)

		with patch("pos_next.api.partial_payments._has_pos_profile_access", return_value=False):
			for user in (MANAGER, "Administrator"):
				self._served(user, "require_till_access", at_the_till)
			for user in (TILL, DESK, PORTAL):
				self._refused(user, "require_till_access", at_the_till)
		# A till is still named: the role does not stand in for one.
		self._refused(MANAGER, "require_till_access", lambda: cash_entry.require_till_access(None))

	def test_the_customer_display_takes_writes_from_its_own_open_shift(self):
		shift = self.fx.shift
		writes = [
			("update_cart_data", lambda: customer_display.update_cart_data(shift, "{}")),
			("clear_cart_cache", lambda: customer_display.clear_cart_cache(shift)),
			("notify_sale_complete", lambda: customer_display.notify_sale_complete(shift)),
			("push_payment_qr", lambda: customer_display.push_payment_qr(shift, NONE)),
			("clear_payment_qr", lambda: customer_display.clear_payment_qr(shift)),
		]
		# Another cashier of the same till.
		profile = frappe.get_doc("POS Profile", PROFILE)
		profile.append("applicable_for_users", {"user": OTHER_CASHIER})
		profile.save(ignore_permissions=True)
		for label, write in writes:
			for user in (TILL, MANAGER):
				self._served(user, label, write)
			for user in (OTHER_CASHIER, DESK, PORTAL, "Guest"):
				self._refused(user, label, write)
		# A shift that is closed takes none of them, from anyone.
		frappe.db.set_value(
			"POS Opening Shift", shift, {"status": "Closed", "pos_closing_shift": NONE}, update_modified=False
		)
		for label, write in writes:
			for user in (TILL, MANAGER, "Administrator"):
				self._refused(user, label, write)

	def test_the_takeaway_screen_sets_an_offered_status_on_a_takeaway_draft(self):
		invoice = self.fx.invoice

		def mark(status):
			return lambda: restaurant.update_takeaway_status(invoice, status)

		frappe.db.set_value("Sales Invoice", invoice, {"is_pos": 1, "is_takeaway": 1}, update_modified=False)
		self.assertEqual(self._served(DESK, "update_takeaway_status", mark("Ready")), {"status": "success"})
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "kds_status"), "Ready")
		frappe.set_user(DESK)
		try:
			for status in ("Paid", "", None):
				with self.assertRaises(frappe.ValidationError, msg=repr(status)):
					restaurant.update_takeaway_status(invoice, status)
		finally:
			frappe.set_user("Administrator")
		# Not a takeaway order, or no longer a draft: refused, and the status stays.
		frappe.db.set_value("Sales Invoice", invoice, "is_takeaway", 0, update_modified=False)
		self._refused(DESK, "update_takeaway_status", mark("Delivered"))
		frappe.db.set_value("Sales Invoice", invoice, {"is_takeaway": 1, "docstatus": 1}, update_modified=False)
		self._refused(DESK, "update_takeaway_status", mark("Delivered"))
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "kds_status"), "Ready")

	def test_hooks_and_server_helpers_are_not_web_endpoints(self):
		for fn in IN_PROCESS_HELPERS:
			dotted = f"{fn.__module__}.{fn.__name__}"
			with self.subTest(dotted):
				self.assertNotIn(fn, frappe.whitelisted)
				# Frappe's own dispatch turns them down, on the v1 route and the v2 one, whoever asks.
				for user in (PORTAL, TILL, "Administrator"):
					with _request(f"/api/method/{dotted}", cmd=dotted):
						self._refused(user, dotted, lambda: frappe.handler.execute_cmd(dotted))
					with _request(f"/api/v2/method/{dotted}"):
						self._refused(user, dotted, lambda: api_v2.handle_rpc_call(dotted))
		for doctype, fn in (
			("Wallet", wallet_doctype.get_or_create_wallet),
			("Wallet Transaction", wallet_transaction.create_wallet_credit),
		):
			with _request(f"/api/v2/method/{doctype}/{fn.__name__}"):
				self._refused(
					PORTAL, fn.__name__, lambda: api_v2.handle_rpc_call(fn.__name__, doctype=doctype)
				)

	def test_the_hooks_still_run_in_process_as_whoever_caused_them(self):
		# A webshop customer's checkout fires the invoice hooks: a portal account runs every helper.
		for fn, call in self._in_process_calls():
			self._served(PORTAL, fn.__name__, call)
		# Through the hooks registry, as a document resolves its hooks: a gift card spent on a sale
		# loses that much of its balance.
		hooks = frappe.get_doc_hooks()["Sales Invoice"]
		for event, fn in (
			("on_submit", gift_cards.create_gift_card_from_invoice),
			("on_submit", gift_cards.process_gift_card_on_submit),
			("on_cancel", gift_cards.process_gift_card_on_cancel),
		):
			self.assertIn(f"{fn.__module__}.{fn.__name__}", hooks[event])
		on_submit = frappe.get_attr("pos_next.api.gift_cards.process_gift_card_on_submit")
		card = self._gift_card(100)
		self._served(PORTAL, "on_submit", lambda: on_submit(_fake_invoice(card, 30), "on_submit"))
		self.assertEqual(flt(frappe.db.get_value("Coupon Code", card, "gift_card_amount")), 70)

	def test_an_item_endpoint_is_gated_on_every_route_to_it(self):
		fn = items.get_stock_quantities
		dotted = f"{fn.__module__}.{fn.__name__}"
		alias = "pos_next.realtime_events.get_stock_quantities"
		form = {"item_codes": "[]", "warehouse": NONE}
		routes = (
			("canonical", f"/api/method/{dotted}", dotted, lambda: frappe.handler.execute_cmd(dotted)),
			("v2 dotted", f"/api/v2/method/{dotted}", None, lambda: api_v2.handle_rpc_call(dotted)),
			(
				"v2 doctype",
				"/api/v2/method/Wallet/get_stock_quantities",
				None,
				lambda: api_v2.handle_rpc_call("get_stock_quantities", doctype="Wallet"),
			),
			("alias", f"/api/method/{alias}", alias, lambda: frappe.handler.execute_cmd(alias)),
		)
		# A module that imports the function, a doctype controller included, gives it a second name.
		with patch.object(wallet_doctype, "get_stock_quantities", fn, create=True), patch.object(
			realtime_events, "get_stock_quantities", fn, create=True
		):
			for label, path, cmd, dispatch in routes:
				with self.subTest(label), _request(path, cmd=cmd, **form):
					self._refused(PORTAL, label, dispatch)
					self._refused(DESK, label, dispatch)
					# The till's cashier, and a till manager assigned to no till.
					for user in (TILL, MANAGER):
						self.assertEqual(self._served(user, label, dispatch), [])
		# With a till named: its cashier, and a till manager who is not assigned to it.
		groups = f"{items.get_item_groups.__module__}.get_item_groups"
		with _request(f"/api/method/{groups}", cmd=groups, pos_profile=PROFILE):
			for user in (PORTAL, DESK):
				self._refused(user, groups, lambda: frappe.handler.execute_cmd(groups))
			for user in (TILL, MANAGER):
				self.assertIsInstance(self._served(user, groups, lambda: frappe.handler.execute_cmd(groups)), list)

		# Called by server code while another request is served, it checks its caller just the same,
		# except inside the scope its in-process callers open.
		def read():
			return fn(item_codes="[]", warehouse=NONE)

		for path, cmd in (
			("/api/method/frappe.desk.form.save.savedocs", "frappe.desk.form.save.savedocs"),
			("/api/v2/method/frappe.desk.form.save.savedocs", None),
			("/api/v2/document/Sales Invoice", None),
		):
			with _request(path, cmd=cmd):
				self._refused(PORTAL, path, read)
				self._refused(DESK, path, read)
				self.assertEqual(self._served(TILL, path, read), [])
				self.assertEqual(self._served(PORTAL, path, lambda: _in_process(read)), [])
		# With no request (a background job, the console) it is not checked.
		with _no_request():
			self.assertEqual(self._served(PORTAL, "no request", read), [])

	def test_an_item_endpoint_named_as_a_search_query_is_gated(self):
		# frappe's search endpoints run the whitelisted query function they are given, positionally:
		# the item endpoint checks its caller there as on its own route. Developer mode lets frappe
		# raise the refusal; without it frappe answers it as "Method not found" with no result.
		for fn in (items.get_items_bulk, items.get_items):
			dotted = f"{fn.__module__}.{fn.__name__}"
			for search in ("frappe.desk.search.search_widget", "frappe.desk.search.search_link"):
				label = f"{search}({fn.__name__})"
				with (
					self.subTest(label),
					patch.dict(frappe.local.conf, {"developer_mode": 1}),
					_request(f"/api/method/{search}", cmd=search, doctype="Item", txt="", query=dotted),
				):
					for user in (PORTAL, DESK):
						self._refused(user, label, lambda: frappe.handler.execute_cmd(search))
			# The till's cashier still reads the catalogue on the endpoint's own route.
			with self.subTest(dotted), _request(f"/api/method/{dotted}", cmd=dotted, pos_profile=PROFILE):
				self.assertIsNotNone(self._served(TILL, dotted, lambda: frappe.handler.execute_cmd(dotted)))
				self._refused(PORTAL, dotted, lambda: frappe.handler.execute_cmd(dotted))

	def test_an_item_endpoint_checks_the_till_it_is_given_by_position_too(self):
		# frappe's search endpoints call a query function positionally, so the POS Profile is not always a
		# keyword. A desk account assigned to one till (with no cashier role: a cashier reads every till's
		# invoices) is served that till's data and refused another till's, however the till is given.
		_user(COUNTER, ["Blogger"], "System User")
		own = frappe.get_doc("POS Profile", PROFILE)
		other = frappe.copy_doc(own)
		other.name = OTHER_PROFILE
		other.set("applicable_for_users", [])
		other.insert(ignore_permissions=True)
		own.append("applicable_for_users", {"user": COUNTER})
		own.save(ignore_permissions=True)
		search = "frappe.desk.search.search_widget"
		calls = (
			("get_item_groups, by keyword", lambda profile: items.get_item_groups(pos_profile=profile)),
			("get_item_groups, by position", lambda profile: items.get_item_groups(profile)),
			# The POS Profile is not the first argument of every item endpoint.
			("search_by_barcode, by position", lambda profile: items.search_by_barcode(NONE, profile)),
		)
		with _request(f"/api/method/{search}", cmd=search):
			for label, call in calls:
				with self.subTest(label):
					self._served(COUNTER, label, lambda: call(PROFILE))
					self._refused(COUNTER, label, lambda: call(OTHER_PROFILE))

	def test_the_item_endpoints_in_process_callers_are_served(self):
		# The stock event after a sale reads the new quantities as whoever submitted the invoice: the
		# till's cashier, or a portal account (a shop checkout). Its errors are logged, not raised, so
		# what it publishes is what shows it was served.
		warehouse = frappe.db.get_value("POS Profile", PROFILE, "warehouse")
		# Not a frappe._dict: its .items would be the dict method, not the invoice's lines.
		invoice = SimpleNamespace(
			name=self.fx.invoice,
			update_stock=1,
			is_pos=1,
			items=[SimpleNamespace(item_code=self.fx.item, warehouse=warehouse, is_stock_item=1)],
		)
		savedocs = "frappe.desk.form.save.savedocs"
		for user in (TILL, PORTAL):
			with (
				self.subTest(user),
				_request(f"/api/method/{savedocs}", cmd=savedocs),
				patch("frappe.publish_realtime") as publish,
				patch("frappe.log_error") as log_error,
			):
				self._served(
					user,
					"emit_stock_update_event",
					lambda: realtime_events.emit_stock_update_event(invoice, "on_submit"),
				)
				log_error.assert_not_called()
				updates = publish.call_args.kwargs["message"]["stock_updates"]
				self.assertEqual([row["item_code"] for row in updates], [self.fx.item])
		# The till's opening data reads its item groups once get_pos_settings has checked the caller.
		data = "pos_next.api.pos_profile.get_pos_profile_data"
		with _request(f"/api/method/{data}", cmd=data, pos_profile=PROFILE):
			served = self._served(TILL, data, lambda: frappe.handler.execute_cmd(data))
			self.assertIsInstance(served["item_groups_hierarchy"], list)
			self._refused(PORTAL, data, lambda: frappe.handler.execute_cmd(data))

	def test_the_closing_form_follows_its_document_or_the_shift(self):
		shift = self.fx.shift
		for call in (pos_closing_shift.get_pos_invoices, pos_closing_shift.get_payments_entries):
			label = call.__name__
			for user in (PORTAL, "Guest", DESK):
				self._refused(user, label, lambda call=call: call(shift))
			for user in (TILL, MANAGER, "Administrator"):
				self._served(user, label, lambda call=call: call(shift))
			# Another cashier: what the desk form lets them do, they may do here.
			frappe.set_user(OTHER_CASHIER)
			desk_rights = frappe.has_permission("POS Closing Shift", "create") and frappe.has_permission(
				"POS Opening Shift", "read", shift
			)
			frappe.set_user("Administrator")
			if desk_rights:
				self._served(OTHER_CASHIER, label, lambda call=call: call(shift))
			else:
				self._refused(OTHER_CASHIER, label, lambda call=call: call(shift))

	def test_the_report_and_the_promotions_follow_their_own_rights(self):
		today = {"from_date": nowdate(), "to_date": nowdate()}
		for call in (
			shifts_report.get_hourly_breakdown,
			shifts_report.get_payment_method_breakdown,
			shifts_report.get_daily_trend,
		):
			self.assertIsInstance(self._served(REPORTER, call.__name__, lambda call=call: call(today)), list)
			for user in (TILL, DESK, PORTAL):
				self._refused(user, call.__name__, lambda call=call: call(today))
		# The promotion module's own rule: reading or writing Promotional Scheme.
		self._served(REPORTER, "get_referral_codes", promotions.get_referral_codes)
		self._served(REPORTER, "apply_referral_code", self._apply_made_up_referral_code)
		self._refused(TILL, "apply_referral_code", self._apply_made_up_referral_code)


class TestFoodImageDownload(FrappeTestCase):
	"""download_food_image fetches only what the image search offers: an https address on its provider's
	hosts, a raster image within the size cap."""

	URL = "https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&h=350"

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	@staticmethod
	def _response(status=200, headers=None, body=b""):
		response = MagicMock()
		response.status_code = status
		response.headers = headers or {}
		response.is_redirect = status in (301, 302, 303, 307, 308) and "Location" in response.headers
		response.iter_content.return_value = [body] if body else []
		if status >= 400:
			response.raise_for_status.side_effect = requests.HTTPError(str(status))
		return response

	def test_only_https_on_the_image_search_hosts_is_fetched(self):
		files = frappe.db.count("File")
		with patch("requests.get") as get:
			for url in (
				"https://example.com/a.jpg",
				"http://images.pexels.com/a.jpg",
				"ftp://images.pexels.com/a.jpg",
				"file:///etc/hostname",
				"https://images.pexels.com.example.com/a.jpg",
				"https://name:word@images.pexels.com/a.jpg",
				"https://images.pexels.com:8443/a.jpg",
				"",
				None,
			):
				with self.subTest(url), self.assertRaises(frappe.ValidationError):
					restaurant.download_food_image(url, "tillsweep dish")
		get.assert_not_called()
		self.assertEqual(frappe.db.count("File"), files)

	def test_a_redirect_is_followed_only_to_the_image_search_hosts(self):
		elsewhere = self._response(302, {"Location": "https://example.com/a.jpg"})
		with patch("requests.get", return_value=elsewhere) as get:
			with self.assertRaises(frappe.ValidationError):
				restaurant.download_food_image(self.URL, "tillsweep dish")
		self.assertEqual(get.call_count, 1)
		self.assertIs(get.call_args.kwargs["allow_redirects"], False)
		# Another address on the same host is followed.
		hop = self._response(301, {"Location": "/photos/2/pexels-photo-2.jpeg"})
		image = self._response(200, {"Content-Type": "image/jpeg"}, b"\xff\xd8\xff")
		with patch("requests.get", side_effect=[hop, image]) as get:
			self.assertEqual(restaurant._fetch_food_image(self.URL), (b"\xff\xd8\xff", "jpg"))
		self.assertEqual(get.call_args.args[0], "https://images.pexels.com/photos/2/pexels-photo-2.jpeg")

	def test_only_an_image_within_the_size_cap_is_kept(self):
		cap = restaurant.FOOD_IMAGE_MAX_BYTES
		for label, headers, body in (
			("html", {"Content-Type": "text/html"}, b"<html></html>"),
			("svg", {"Content-Type": "image/svg+xml"}, b"<svg/>"),
			("no type", {}, b"\xff\xd8\xff"),
			("declared too large", {"Content-Type": "image/jpeg", "Content-Length": str(cap + 1)}, b"\xff"),
			("too large", {"Content-Type": "image/jpeg"}, b"\xff" * (cap + 1)),
		):
			with self.subTest(label), patch("requests.get", return_value=self._response(200, headers, body)):
				with self.assertRaises(frappe.ValidationError):
					restaurant.download_food_image(self.URL, "tillsweep dish")
		webp = self._response(200, {"Content-Type": "image/webp"}, b"RIFF0000WEBP")
		with patch("requests.get", return_value=webp) as get:
			self.assertEqual(restaurant._fetch_food_image(self.URL), (b"RIFF0000WEBP", "webp"))
		self.assertEqual(get.call_args.kwargs["timeout"], restaurant.FOOD_IMAGE_TIMEOUT)
		self.assertTrue(get.call_args.kwargs["stream"])

	def test_a_visitor_is_refused_before_anything_is_fetched(self):
		frappe.set_user("Guest")
		with patch("requests.get") as get, self.assertRaises(frappe.PermissionError):
			restaurant.download_food_image(self.URL, "tillsweep dish")
		get.assert_not_called()
