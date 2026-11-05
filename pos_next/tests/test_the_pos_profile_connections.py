# //// Neoffice — added file (no upstream equivalent).
"""The Connections of the POS Profile form point at what a till of this app makes (NeoResto lot 1, task 13b; product owner,
05.11.2026: « quand on est dedans, on tape sur les bonnes factures »).

ERPNext links its profile to ITS point of sale's documents (POS Invoice, POS Opening Entry, POS Closing Entry). A till of this app
books Sales Invoices and keeps its sessions in POS Opening Shift and POS Closing Shift, each carrying `pos_profile`; its POSNext
settings are a document of their own, linked to the profile by name. The suite reads the form's own dashboard (the doctype's
links, then the hook) and changes nothing.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.pos_profile_dashboard import get_dashboard_data

# The dashboard of the doctype as ERPNext declares it (its `links`), before the hook
ERPNEXT = {
	"fieldname": "pos_profile",
	"transactions": [
		{"label": "Invoices", "items": ["Sales Invoice", "POS Invoice"]},
		{"label": "Opening & Closing", "items": ["POS Opening Entry", "POS Closing Entry"]},
	],
	"non_standard_fieldnames": {
		"Sales Invoice": "pos_profile",
		"POS Invoice": "pos_profile",
		"POS Opening Entry": "pos_profile",
		"POS Closing Entry": "pos_profile",
	},
}


def items(data):
	return {group["label"]: group["items"] for group in data["transactions"]}


class TestThePosProfileConnections(FrappeTestCase):
	def test_the_sales_invoices_stay_and_the_unused_links_go(self):
		data = get_dashboard_data(frappe._dict(ERPNEXT))

		self.assertEqual(items(data)["Invoices"], ["Sales Invoice"])
		every = [item for group in data["transactions"] for item in group["items"]]
		for unused in ("POS Invoice", "POS Opening Entry", "POS Closing Entry"):
			self.assertNotIn(unused, every)
			self.assertNotIn(unused, data["non_standard_fieldnames"])
		self.assertEqual(data["non_standard_fieldnames"], {"Sales Invoice": "pos_profile"})

	def test_the_till_s_sessions_and_settings_take_their_place(self):
		data = get_dashboard_data(frappe._dict(ERPNEXT))

		self.assertEqual(items(data)["Opening & Closing"], ["POS Opening Shift", "POS Closing Shift"])
		self.assertEqual(items(data)["Settings"], ["POS Settings"])
		self.assertEqual(
			[group["label"] for group in data["transactions"]], ["Invoices", "Opening & Closing", "Settings"]
		)

	def test_a_dashboard_without_the_sessions_group_gets_one_and_nothing_is_added_twice(self):
		bare = frappe._dict(
			{"fieldname": "pos_profile", "transactions": [{"label": "Invoices", "items": ["POS Invoice"]}]}
		)

		once = get_dashboard_data(bare)
		twice = get_dashboard_data(frappe._dict(once))

		self.assertEqual(
			items(once),
			{"Opening & Closing": ["POS Opening Shift", "POS Closing Shift"], "Settings": ["POS Settings"]},
		)
		self.assertEqual(items(twice), items(once))

	def test_what_another_app_added_is_kept(self):
		data = frappe._dict(
			dict(ERPNEXT, transactions=[*ERPNEXT["transactions"], {"label": "Mine", "items": ["Restaurant"]}])
		)

		self.assertEqual(items(get_dashboard_data(data))["Mine"], ["Restaurant"])

	def test_the_form_s_own_dashboard_goes_through_the_hook(self):
		self.assertIn(
			"pos_next.pos_profile_dashboard.get_dashboard_data",
			frappe.get_hooks("override_doctype_dashboards").get("POS Profile", []),
		)

		dashboard = frappe.get_meta("POS Profile", cached=False).get_dashboard_data()

		every = [item for group in dashboard["transactions"] for item in group["items"]]
		self.assertIn("Sales Invoice", every)
		self.assertIn("POS Opening Shift", every)
		self.assertIn("POS Closing Shift", every)
		self.assertIn("POS Settings", every)
		for unused in ("POS Invoice", "POS Opening Entry", "POS Closing Entry"):
			self.assertNotIn(unused, every)

	def test_every_connection_filters_on_a_field_its_doctype_has(self):
		dashboard = frappe.get_meta("POS Profile", cached=False).get_dashboard_data()
		for group in dashboard["transactions"]:
			for doctype in group["items"]:
				fieldname = (dashboard.get("non_standard_fieldnames") or {}).get(doctype) or dashboard[
					"fieldname"
				]
				with self.subTest(doctype=doctype, fieldname=fieldname):
					self.assertTrue(frappe.db.exists("DocType", doctype))
					self.assertTrue(frappe.get_meta(doctype).has_field(fieldname))
