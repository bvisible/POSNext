# //// Neoffice — added file (no upstream equivalent).
"""The till manager role is `POSNext Manager`, not upstream's `Nexus POS Manager` (product owner, 09.11.2026).

The patch `rename_the_till_manager_role` runs before the doctype sync of every site that already exists. The suite pins what it
must do, on roles of its own (the real role of the site is never touched):

- the role takes its new name and so does everything that points at it: the accounts that hold it, the permission rows;
- the name of the role, its `role_name`, follows the rename;
- a site where both names exist ends with one role and no account loses its rights;
- run again, or on a site that never had the old role, it does nothing;
- the fixture, the constant of the till manager roles and the permission rows of the doctypes say the new name.
"""

import json
import os

import frappe
from frappe.permissions import add_permission
from frappe.tests.utils import FrappeTestCase

from pos_next.patches import rename_the_till_manager_role as patch

OLD = "_Test Old Till Manager"
NEW = "_Test New Till Manager"
USER = "till-manager-rename@yopmail.com"
OTHER = "till-manager-rename-other@yopmail.com"
DOCTYPE = "ToDo"  # any standard doctype: only the permission row matters


def _forget():
	for role in (OLD, NEW):
		frappe.db.delete("Custom DocPerm", {"role": role})
		frappe.db.delete("Has Role", {"role": role})
		if frappe.db.exists("Role", role):
			frappe.delete_doc("Role", role, ignore_permissions=True, force=True)
	for user in (USER, OTHER):
		if frappe.db.exists("User", user):
			frappe.delete_doc("User", user, ignore_permissions=True, force=True)


def _role(name):
	return frappe.get_doc({"doctype": "Role", "role_name": name, "desk_access": 1}).insert(
		ignore_permissions=True
	)


def _user(email, roles):
	frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"roles": [{"role": role} for role in roles],
		}
	).insert(ignore_permissions=True)


class TestTheTillManagerRoleIsRenamed(FrappeTestCase):
	def setUp(self):
		super().setUp()
		_forget()
		self.addCleanup(_forget)
		_role(OLD)
		_user(USER, [OLD])
		add_permission(DOCTYPE, OLD, 0)

	def roles_of(self, user):
		return frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")

	def test_the_role_takes_its_new_name_with_everything_that_points_at_it(self):
		patch.rename(OLD, NEW)

		self.assertFalse(frappe.db.exists("Role", OLD))
		self.assertTrue(frappe.db.exists("Role", NEW))
		self.assertEqual(self.roles_of(USER), [NEW])
		self.assertTrue(frappe.db.exists("Custom DocPerm", {"parent": DOCTYPE, "role": NEW}))
		self.assertFalse(frappe.db.exists("Custom DocPerm", {"role": OLD}))

	def test_the_name_of_the_role_is_its_role_name_too(self):
		patch.rename(OLD, NEW)

		self.assertEqual(frappe.db.get_value("Role", NEW, "role_name"), NEW)

	def test_a_site_that_has_both_names_ends_with_one_role_and_no_account_loses_its_rights(self):
		_role(NEW)
		_user(OTHER, [NEW, OLD])

		patch.rename(OLD, NEW)

		self.assertFalse(frappe.db.exists("Role", OLD))
		self.assertEqual(self.roles_of(USER), [NEW])
		self.assertEqual(self.roles_of(OTHER), [NEW])

	def test_run_again_it_does_nothing(self):
		patch.rename(OLD, NEW)
		patch.rename(OLD, NEW)

		self.assertEqual(self.roles_of(USER), [NEW])
		self.assertTrue(frappe.db.exists("Role", NEW))

	def test_a_site_that_never_had_the_old_role_is_left_alone(self):
		frappe.db.delete("Has Role", {"role": OLD})
		frappe.delete_doc("Role", OLD, ignore_permissions=True, force=True)
		frappe.db.delete("Custom DocPerm", {"role": OLD})

		patch.rename(OLD, NEW)

		self.assertFalse(frappe.db.exists("Role", NEW))

	def test_the_files_of_the_app_say_the_new_name(self):
		app = os.path.dirname(os.path.dirname(__file__))
		with open(os.path.join(app, "fixtures", "role.json")) as fixture:
			names = {row["name"] for row in json.load(fixture)}
		with open(os.path.join(app, "hooks.py")) as hooks:
			hooks_text = hooks.read()
		from pos_next.api.cash_entry import TILL_MANAGER_ROLES

		self.assertIn(patch.NEW, names)
		self.assertNotIn(patch.OLD, names)
		self.assertIn(patch.NEW, TILL_MANAGER_ROLES)
		self.assertNotIn(patch.OLD, TILL_MANAGER_ROLES)
		self.assertIn(patch.NEW, hooks_text)
		self.assertNotIn(patch.OLD, hooks_text)
