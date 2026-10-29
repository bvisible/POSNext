# //// Neoffice — added file (no upstream equivalent).
"""Closing a shift closes the caller's own shift, or any till's shift for a till manager.

submit_closing_shift (pos_next.api.shifts, and the POS Closing Shift module function it calls, both
whitelisted) and the closing data (get_closing_shift_data, make_closing_shift_from_opening) follow the
rule of the close, checked before anything is read, built or submitted. The till sends one thing
(ShiftClosingDialog.vue, useShift.js): a new POS Closing Shift built by get_closing_shift_data from the
cashier's own open POS Opening Shift, carrying that shift's POS Profile, cashier and company. A till
manager (cash_entry.TILL_MANAGER_ROLES) works on any till's shift, without needing the right to write
the documents the close updates.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime, nowdate

from pos_next.api import cash_entry, shifts
from pos_next.pos_next.doctype.pos_closing_shift import pos_closing_shift
from pos_next.tests.test_till_writes_need_the_till import _cash_mode, _company, _customer, _item, _user

PORTAL = "tillclose-portal@yopmail.com"
DESK = "tillclose-desk@yopmail.com"
TILL = "tillclose-till@yopmail.com"
OTHER_TILL = "tillclose-other-till@yopmail.com"
MANAGER = "tillclose-manager@yopmail.com"
ADMIN = "tillclose-admin@yopmail.com"
NEW_USER = "tillclose-new-user@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
MANAGER_ROLE = "Nexus POS Manager"
ADMIN_ROLE = "Admin"
PROFILE = "_PNXT tillclose till"
TODO = "tillclose"
ENTRY_POINTS = (
	("pos_next.api.shifts", shifts.submit_closing_shift),
	("POS Closing Shift module", pos_closing_shift.submit_closing_shift),
)


def _written():
	"""What a closing call could have written, counted where this test's documents would land: the
	site may be in use meanwhile."""
	return (
		frappe.db.count("POS Closing Shift", {"pos_profile": PROFILE}),
		frappe.db.count("POS Opening Shift", {"pos_profile": PROFILE}),
		frappe.db.count("Sales Invoice", {"pos_profile": PROFILE}),
		frappe.db.count("ToDo", {"description": TODO}),
		bool(frappe.db.exists("User", NEW_USER)),
		frappe.db.count("Error Log", {"method": "Submit Closing Shift Error"}),
	)


def _till():
	"""A till of the test's own, paid in cash, on a company whose books are open today. Both cashiers
	are assigned to it; the manager is not."""
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
			"applicable_for_users": [{"user": TILL}, {"user": OTHER_TILL}],
		}
	).insert(ignore_permissions=True)
	return frappe._dict(company=company, mode=mode)


def _as(user, call, *args):
	frappe.set_user(user)
	try:
		return call(*args)
	finally:
		frappe.set_user("Administrator")


def _closing(user, shift, till):
	"""What the till sends to close ``shift`` (ShiftClosingDialog.vue, submitClosing): the closing
	get_closing_shift_data builds, every payment method counted at its expected amount, no cash
	withdrawn."""
	closing = _as(user, shifts.get_closing_shift_data, shift)
	for row in closing["payment_reconciliation"]:
		row["closing_amount"] = row["expected_amount"]
	cash = next(r for r in closing["payment_reconciliation"] if r["mode_of_payment"] == till.mode)
	closing["cash_withdrawal_amount"] = 0
	closing["cash_remaining_balance"] = cash["closing_amount"]
	return closing


def _draft(shift, till):
	"""An unprinted draft sale left on ``shift``, as an abandoned cart leaves one."""
	return (
		frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": till.company,
				"customer": _customer(),
				"posa_pos_opening_shift": shift,
				"posa_is_printed": 0,
				"items": [{"item_code": _item(till.company), "qty": 1, "rate": 10}],
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


class TestTillClosingNeedsTheTill(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# Nothing may outlive the test: a commit would keep its documents past the rollback. Stopped by
		# addCleanup, which runs even when setUp fails.
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		# A portal account holding the manager role: a role does not make it a desk account.
		_user(PORTAL, ["Customer", MANAGER_ROLE], "Website User")
		_user(DESK, ["Blogger"], "System User")
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, [CASHIER_ROLE], "System User")
		_user(MANAGER, [MANAGER_ROLE], "System User")
		# The customer's own administrator, with no till role.
		_user(ADMIN, [ADMIN_ROLE], "System User")
		self.till = _till()
		# Opened the way the till opens a shift.
		opened = _as(
			TILL,
			shifts.create_opening_shift,
			PROFILE,
			self.till.company,
			json.dumps([{"mode_of_payment": self.till.mode, "opening_amount": 50}]),
		)
		self.shift = opened["pos_opening_shift"]["name"]

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def _assert_refused(self, user, payload, error=frappe.PermissionError):
		"""Both whitelisted entry points refuse ``payload`` from ``user``, and nothing is written."""
		written = _written()
		for label, endpoint in ENTRY_POINTS:
			with self.subTest(entry=label), self.assertRaises(error):
				_as(user, endpoint, json.dumps(payload))
		self.assertEqual(_written(), written)

	def _shift_status(self):
		return frappe.db.get_value("POS Opening Shift", self.shift, "status")

	def test_a_portal_account_and_a_visitor_are_refused(self):
		closing = _closing(TILL, self.shift, self.till)
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user):
				self._assert_refused(user, closing)
		self.assertEqual(self._shift_status(), "Open")

	def test_only_a_new_closing_is_accepted(self):
		closing = _closing(TILL, self.shift, self.till)
		others = (
			{"doctype": "ToDo", "description": TODO},
			{"doctype": "User", "email": NEW_USER, "first_name": "tillclose", "send_welcome_email": 0},
			{
				"doctype": "POS Opening Shift",
				"period_start_date": str(now_datetime()),
				"posting_date": nowdate(),
				"company": self.till.company,
				"pos_profile": PROFILE,
				"user": TILL,
				"balance_details": [{"mode_of_payment": self.till.mode, "amount": 0}],
			},
			{**closing, "doctype": "Sales Invoice"},
		)
		for payload in others:
			with self.subTest(doctype=payload["doctype"]):
				self._assert_refused(TILL, payload)
		# A closing already saved, or one already submitted, is not the new closing the till sends.
		for change in ({"name": "_PNXT tillclose saved closing"}, {"docstatus": 1}):
			with self.subTest(change=change):
				self._assert_refused(TILL, {**closing, **change})
		self.assertEqual(self._shift_status(), "Open")

	def test_a_cashier_closes_only_their_own_shift_at_their_till(self):
		# The closing of TILL's shift, sent by another cashier of this very till, and by a desk account.
		closing = _closing(TILL, self.shift, self.till)
		for user in (OTHER_TILL, DESK):
			with self.subTest(user=user):
				self._assert_refused(user, closing)
		self.assertEqual(self._shift_status(), "Open")
		# DESK's own shift, at a till DESK is neither assigned to nor reads the sales invoices of.
		own = frappe.get_doc(
			{
				"doctype": "POS Opening Shift",
				"period_start_date": now_datetime(),
				"posting_date": nowdate(),
				"company": self.till.company,
				"pos_profile": PROFILE,
				"user": DESK,
				"balance_details": [{"mode_of_payment": self.till.mode, "amount": 0}],
			}
		).insert(ignore_permissions=True)
		own.submit()
		with self.subTest(user=DESK, shift="own"):
			# Refused its closing data, and the closing as the till would send it.
			with self.assertRaises(frappe.PermissionError):
				_as(DESK, shifts.get_closing_shift_data, own.name)
			self._assert_refused(DESK, _closing("Administrator", own.name, self.till))

	def test_the_till_closes_its_own_shift(self):
		closing = _closing(TILL, self.shift, self.till)
		done = _as(TILL, shifts.submit_closing_shift, json.dumps(closing))
		self.assertEqual(done["status"], "success")
		self.assertEqual(
			frappe.db.get_value(
				"POS Closing Shift", done["name"], ["docstatus", "pos_opening_shift", "user", "owner"]
			),
			(1, self.shift, TILL, TILL),
		)
		self.assertEqual(
			frappe.db.get_value("POS Opening Shift", self.shift, ["status", "pos_closing_shift"]),
			("Closed", done["name"]),
		)
		# A closed shift stays closed: the same closing sent again is refused, for that reason.
		self._assert_refused(TILL, closing, error=frappe.ValidationError)

	def test_a_till_manager_closes_another_users_shift(self):
		# Neither the shift's cashier nor assigned to its till.
		closing = _closing(MANAGER, self.shift, self.till)
		done = _as(MANAGER, shifts.submit_closing_shift, json.dumps(closing))
		self.assertEqual(done["status"], "success")
		self.assertEqual(
			frappe.db.get_value("POS Closing Shift", done["name"], ["docstatus", "user", "owner"]),
			(1, TILL, MANAGER),
		)
		self.assertEqual(self._shift_status(), "Closed")

	def test_an_admin_closes_another_users_shift(self):
		# The customer's administrator holds no till role, and need not hold the right to write the
		# POS Opening Shift the close updates.
		if not frappe.db.exists("Role", ADMIN_ROLE):
			self.skipTest("No Admin role on this site")
		closing = _closing(ADMIN, self.shift, self.till)
		done = _as(ADMIN, shifts.submit_closing_shift, json.dumps(closing))
		self.assertEqual(
			frappe.db.get_value("POS Closing Shift", done["name"], ["docstatus", "user", "owner"]),
			(1, TILL, ADMIN),
		)
		self.assertEqual(
			frappe.db.get_value("POS Opening Shift", self.shift, ["status", "pos_closing_shift"]),
			("Closed", done["name"]),
		)

	def test_the_close_clears_the_shifts_drafts_without_the_right_to_delete_one(self):
		# The till's profile asks for the shift's unprinted drafts to go at closing; a cashier holds no
		# right to delete an invoice.
		if not frappe.get_meta("POS Profile").has_field("posa_allow_delete"):
			self.skipTest("No posa_allow_delete on POS Profile")
		frappe.db.set_value("POS Profile", PROFILE, "posa_allow_delete", 1)
		draft = _draft(self.shift, self.till)
		closing = _closing(TILL, self.shift, self.till)
		done = _as(TILL, shifts.submit_closing_shift, json.dumps(closing))
		self.assertEqual(frappe.db.get_value("POS Closing Shift", done["name"], "docstatus"), 1)
		self.assertFalse(frappe.db.exists("Sales Invoice", draft))

	def test_the_closing_data_follows_the_rule_of_the_close(self):
		opening = json.dumps(frappe.get_doc("POS Opening Shift", self.shift).as_dict(), default=str)
		endpoints = (
			("get_closing_shift_data", lambda: shifts.get_closing_shift_data(self.shift)),
			(
				"make_closing_shift_from_opening",
				lambda: pos_closing_shift.make_closing_shift_from_opening(opening),
			),
		)
		logged = frappe.db.count("Error Log", {"method": "Get Closing Shift Data Error"})
		with patch.object(
			pos_closing_shift, "submit_printed_invoices", wraps=pos_closing_shift.submit_printed_invoices
		) as submitted:
			# A visitor, a portal account holding the manager role, another cashier of the same till,
			# a desk account: refused before anything is read or any draft invoice submitted.
			for user in ("Guest", PORTAL, OTHER_TILL, DESK):
				for label, call in endpoints:
					with self.subTest(user=user, endpoint=label), self.assertRaises(frappe.PermissionError):
						_as(user, call)
			# The cashier's own shift, described with another till's values.
			moved = json.dumps({**json.loads(opening), "pos_profile": "_PNXT tillclose other till"})
			with self.subTest(payload="another till"), self.assertRaises(frappe.PermissionError):
				_as(TILL, pos_closing_shift.make_closing_shift_from_opening, moved)
			submitted.assert_not_called()
			self.assertEqual(frappe.db.count("Error Log", {"method": "Get Closing Shift Data Error"}), logged)
			# The cashier's own shift, and any shift for a till manager.
			for user in (TILL, MANAGER):
				for label, call in endpoints:
					with self.subTest(user=user, endpoint=label):
						self.assertEqual(_as(user, call)["pos_opening_shift"], self.shift)
		self.assertEqual(self._shift_status(), "Open")

	def test_a_till_manager_looks_up_another_users_open_shift(self):
		managers = [MANAGER] + ([ADMIN] if frappe.db.exists("Role", ADMIN_ROLE) else [])
		for user in managers:
			with self.subTest(user=user):
				found = _as(user, shifts.check_opening_shift, TILL)
				self.assertEqual(found["pos_opening_shift"].name, self.shift)
		for user in (OTHER_TILL, DESK, PORTAL, "Guest"):
			with self.subTest(user=user), self.assertRaises(frappe.PermissionError):
				_as(user, shifts.check_opening_shift, TILL)

	def test_a_closing_carries_its_shifts_till_cashier_and_company(self):
		# Even a till manager's: what the closing names must be the shift's.
		closing = _closing(MANAGER, self.shift, self.till)
		for field, value in (
			("pos_profile", "_PNXT tillclose other till"),
			("user", MANAGER),
			("company", "_PNXT tillclose other company"),
			("pos_opening_shift", "_PNXT tillclose no such shift"),
		):
			with self.subTest(field=field):
				self._assert_refused(MANAGER, {**closing, field: value})
		self.assertEqual(self._shift_status(), "Open")

	def test_who_is_a_till_manager(self):
		for index, role in enumerate(cash_entry.TILL_MANAGER_ROLES):
			if not frappe.db.exists("Role", role):
				continue
			with self.subTest(role=role):
				user = f"tillclose-manager-{index}@yopmail.com"
				_user(user, [role], "System User")
				self.assertTrue(_as(user, cash_entry.is_till_manager))
		for user in (TILL, DESK, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.assertFalse(_as(user, cash_entry.is_till_manager))
