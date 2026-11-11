# //// Neoffice — added file (no upstream equivalent).
"""The cashier sells, the till manager cancels (maintenance#852, maintenance#2078).

The POSNext Cashier role held cancel and amend on every Sales Invoice and submit on Payment Entry, from the rules the
till ships (setup/custom_docperm.json): from the desk, a cashier could take the money, then cancel the sale. The till
never used these rights. The suite pins:

- the file: the cashier's Sales Invoice rule validates, prints and e-mails but neither cancels nor amends; his Payment
  Entry rule does not validate; the till manager has a Sales Invoice rule of his own, which cancels and amends;
- the patch: a site whose cashier rule still cancels, amends or validates a payment loses exactly that, and keeps selling;
- the grant made at every migrate: a site with no rule for the till manager gets his, and one it has is left alone.

The rights are read as the cashier and the till manager hold them (frappe.tests.roles), never as Administrator, who only
prepares the scenery. Everything is rolled back.
"""

import json

import frappe
from frappe.permissions import setup_custom_perms
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase
from frappe.utils import cint

from pos_next import install
from pos_next.patches import the_cashier_no_longer_cancels_a_sale as patch

CASHIER = "POSNext Cashier"
MANAGER = "POSNext Manager"


def _file_rule(doctype, role):
	with open(frappe.get_app_path("pos_next", "setup", "custom_docperm.json")) as f:
		return next(
			rule
			for rule in json.load(f)
			if rule["parent"] == doctype and rule["role"] == role and not cint(rule.get("permlevel"))
		)


def _site_rule(doctype, role):
	return frappe.db.get_value(
		"Custom DocPerm",
		{"parent": doctype, "role": role, "permlevel": 0},
		["name", "read", "write", "create", "submit", "cancel", "amend", "print", "email"],
		as_dict=True,
	)


def _rule_as_the_old_file_gave_it(doctype, role, **granted):
	"""The site's rule of `role` on `doctype`, level 0, with `granted` set: the state of a site made from the old file."""
	setup_custom_perms(doctype)
	rule = _site_rule(doctype, role)
	if rule:
		frappe.db.set_value("Custom DocPerm", rule.name, granted, update_modified=False)
	else:
		frappe.get_doc(
			{
				"doctype": "Custom DocPerm",
				"parent": doctype,
				"parenttype": "DocType",
				"parentfield": "permissions",
				"role": role,
				"permlevel": 0,
				**granted,
			}
		).insert(ignore_permissions=True)
	frappe.clear_cache(doctype=doctype)


class TestTheCashierDoesNotCancelASale(FrappeTestCase):
	def setUp(self):
		for role in (CASHIER, MANAGER):
			if not frappe.db.exists("Role", role):
				frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(
					ignore_permissions=True
				)

	def tearDown(self):
		frappe.db.rollback()
		frappe.clear_cache(doctype="Sales Invoice")
		frappe.clear_cache(doctype="Payment Entry")

	def test_the_file_lets_the_cashier_sell_and_never_cancel(self):
		sale = _file_rule("Sales Invoice", CASHIER)
		self.assertEqual(
			(cint(sale["cancel"]), cint(sale["amend"])), (0, 0), "the cashier cancels or amends a sale"
		)
		self.assertTrue(
			all(cint(sale[right]) for right in ("read", "write", "create", "submit", "print", "email"))
		)
		self.assertEqual(
			cint(_file_rule("Payment Entry", CASHIER)["submit"]), 0, "the cashier validates a payment"
		)

	def test_the_file_gives_the_till_manager_a_rule_that_cancels(self):
		rule = _file_rule("Sales Invoice", MANAGER)
		self.assertTrue(all(cint(rule[right]) for right in ("read", "submit", "cancel", "amend")))

	def test_a_cashier_who_cancelled_no_longer_does_after_the_patch(self):
		_rule_as_the_old_file_gave_it(
			"Sales Invoice",
			CASHIER,
			read=1,
			write=1,
			create=1,
			submit=1,
			cancel=1,
			amend=1,
			print=1,
			report=1,
			export=1,
		)
		_rule_as_the_old_file_gave_it("Payment Entry", CASHIER, read=1, write=1, create=1, submit=1, export=1)

		patch.execute()

		with as_role("cashier"):
			self.assertFalse(frappe.has_permission("Sales Invoice", "cancel"), "the cashier cancels a sale")
			self.assertFalse(frappe.has_permission("Sales Invoice", "amend"), "the cashier amends a sale")
			self.assertFalse(
				frappe.has_permission("Payment Entry", "submit"), "the cashier validates a payment"
			)
			# what the till does from the cashier's own account stays his
			self.assertTrue(frappe.has_permission("Sales Invoice", "create"))
			self.assertTrue(frappe.has_permission("Sales Invoice", "submit"))
			self.assertTrue(frappe.has_permission("Sales Invoice", "email"))

	def test_the_grant_gives_the_till_manager_his_rule_once(self):
		frappe.db.delete("Custom DocPerm", {"parent": "Sales Invoice", "role": MANAGER})
		_rule_as_the_old_file_gave_it("Sales Invoice", CASHIER, read=1, write=1, create=1, submit=1)

		install.grant_cashier_permissions()

		rule = _site_rule("Sales Invoice", MANAGER)
		self.assertTrue(rule, "the till manager has no Sales Invoice rule")
		self.assertEqual((rule.cancel, rule.amend, rule.read), (1, 1, 1))
		frappe.clear_cache(doctype="Sales Invoice")
		with as_role("till_manager"):
			self.assertTrue(
				frappe.has_permission("Sales Invoice", "cancel"), "the till manager cannot cancel a sale"
			)

		# a rule the site already has is left as it is
		frappe.db.set_value("Custom DocPerm", rule.name, "cancel", 0, update_modified=False)
		install.grant_cashier_permissions()
		self.assertEqual(_site_rule("Sales Invoice", MANAGER).cancel, 0)
		self.assertEqual(frappe.db.count("Custom DocPerm", {"parent": "Sales Invoice", "role": MANAGER}), 1)
