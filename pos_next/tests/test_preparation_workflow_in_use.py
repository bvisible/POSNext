# //// Neoffice — added file (no upstream equivalent).
"""A preparation workflow says what uses it, and a use is told when a delete is refused (NeoResto lot 1; product owner, 05.11.2026).

The workflows' screen offered « Delete » on every workflow but the default, and a workflow that a station names could not go: the
server's link check refused it and the till said only « Failed to delete workflow ». A new workflow nobody uses goes as before.
Now each workflow of the list carries the stations that name it, and a refused delete says why (the station to change first, or
that the default stays).

The suite relies on no patch and no after_migrate (a fresh CI site runs neither): it makes the restaurant roles itself, builds a
restaurant of its own, and rolls everything back.
"""

import unittest
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant as restaurant_api
from pos_next.authorization.tests.helpers import make_user
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import permissions
from pos_next.restaurant.permissions import ensure_restaurant_roles, grant_restaurant_permissions

MANAGER = "workflow-in-use-manager@yopmail.com"
CASHIER_ROLE = "POSNext Cashier"
RESTAURANT = "_Test In Use Restaurant"


@contextmanager
def as_user(user):
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user("Administrator")


class TestAWorkflowSaysWhatUsesIt(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.changed_rules = []
		self.addCleanup(lambda: [frappe.clear_cache(doctype=doctype) for doctype in self.changed_rules or []])
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		ensure_restaurant_roles()
		self.changed_rules = grant_restaurant_permissions()
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		restaurant = (
			frappe.get_doc({"doctype": "Restaurant", "restaurant_name": RESTAURANT, "company": company[0]})
			.insert(ignore_permissions=True)
			.name
		)
		step = [{"step_name": "Pending", "color": "#EAB308", "allow_edit": 1}]
		self.used = self.insert("Preparation Workflow", workflow_name="_Test In Use Flow", steps=step)
		self.unused = self.insert("Preparation Workflow", workflow_name="_Test Free Flow", steps=step)
		self.station = self.insert(
			"Preparation Station", restaurant=restaurant, station_name="_Test In Use Kitchen", workflow=self.used
		)
		self.default = frappe.db.get_value("Preparation Workflow", {"is_default": 1}, "name")
		if not self.default:
			self.default = self.insert("Preparation Workflow", workflow_name="_Test Default Flow", steps=step, is_default=1)
		# A restaurant's manager also works at its till, as its cashiers do
		make_user(MANAGER, [permissions.MANAGER_ROLE, CASHIER_ROLE])

	def insert(self, doctype, **values):
		return frappe.get_doc({"doctype": doctype, **values}).insert(ignore_permissions=True).name

	def listed(self):
		with as_user(MANAGER):
			return {row["name"]: row for row in restaurant_api.get_preparation_workflows()}

	def test_the_list_names_the_stations_that_use_each_workflow(self):
		listed = self.listed()
		self.assertEqual(listed[self.used]["stations"], ["_Test In Use Kitchen"])
		self.assertEqual(listed[self.unused]["stations"], [])

	def test_a_workflow_a_station_names_is_not_deleted_and_the_refusal_names_the_station(self):
		with as_user(MANAGER):
			with self.assertRaises(frappe.ValidationError) as refused:
				restaurant_api.delete_preparation_workflow(self.used)
		self.assertIn("_Test In Use Kitchen", str(refused.exception))
		self.assertTrue(frappe.db.exists("Preparation Workflow", self.used))

	def test_the_default_workflow_is_not_deleted_and_the_refusal_says_so(self):
		with as_user(MANAGER):
			with self.assertRaises(frappe.ValidationError) as refused:
				restaurant_api.delete_preparation_workflow(self.default)
		self.assertIn("default", str(refused.exception).lower())
		self.assertTrue(frappe.db.exists("Preparation Workflow", self.default))

	def test_a_workflow_nobody_uses_is_deleted(self):
		with as_user(MANAGER):
			self.assertEqual(restaurant_api.delete_preparation_workflow(self.unused), {"status": "success"})
		self.assertFalse(frappe.db.exists("Preparation Workflow", self.unused))

	def test_once_the_station_is_given_another_workflow_the_first_goes(self):
		frappe.db.set_value("Preparation Station", self.station, "workflow", self.unused)
		with as_user(MANAGER):
			self.assertEqual(restaurant_api.delete_preparation_workflow(self.used), {"status": "success"})
		self.assertFalse(frappe.db.exists("Preparation Workflow", self.used))


if __name__ == "__main__":
	unittest.main()
