# //// Neoffice — added file (no upstream equivalent).
"""A guest orders from the QR code of a table, as nobody (NeoResto lot 1, Daniel's test of 01.11: « j'ai voulu commander une boisson mais problème de
droit », a red « PermissionError » under « Send Order »).

The guest is the `Guest` user: no role, no right on any account. Saving a Sales Invoice reads the customer's receivable account, and ERPNext refuses that
read to a user who may not read accounts (`account_perm_check`), whatever `ignore_permissions` says on the document. The guest endpoints
(`submit_guest_order`) must therefore do what the order needs as the system, and give the user back afterwards. The earlier tests of the endpoint ran as
the test administrator, which is why nothing saw it.

The suite builds everything it needs (the menu of `test_service_families`, a restaurant, a table, a till) and rolls back.
"""

import json

import frappe

from pos_next.api import guest_ordering
from pos_next.tests.test_service_families import ServiceCase


class AGuestCanOrderFromTheQr(ServiceCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": "Direct to Kitchen"})
		frappe.clear_document_cache("Restaurant")
		self.token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_a,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)
		self.addCleanup(frappe.set_user, frappe.session.user)

	def order(self, *codes):
		items = [{"item_code": code, "qty": 1, "rate": 5} for code in codes]
		frappe.set_user("Guest")
		try:
			return guest_ordering.submit_guest_order(self.token.token, json.dumps(items))
		finally:
			frappe.set_user("Administrator")

	def test_a_guest_orders_a_drink_at_a_table_that_has_no_order_yet(self):
		answer = self.order(self.cola)

		self.assertEqual(answer["status"], "sent_to_kitchen")
		self.assertEqual([r.item_code for r in self.lines_of(answer["invoice"])], [self.cola])

	def test_a_guest_orders_a_drink_at_a_table_that_already_has_an_order(self):
		existing = self.save([self.line(self.soup, service_family="Starter")])
		frappe.db.set_value("Guest Order Token", self.token.name, "invoice", existing)

		answer = self.order(self.cola)

		self.assertEqual(answer["invoice"], existing)
		self.assertEqual([r.item_code for r in self.lines_of(existing)], [self.soup, self.cola])

	def test_a_guest_orders_the_same_drink_again_in_a_second_round(self):
		"""The page sends the new lines only and empties its cart after each send: a drink ordered again is a new line, never one the server skips."""
		first = self.order(self.cola)
		second = self.order(self.cola)

		self.assertEqual(first["invoice"], second["invoice"])
		self.assertEqual([r.item_code for r in self.lines_of(first["invoice"])], [self.cola, self.cola])

	def test_two_lines_of_the_same_dish_in_one_send_are_two_lines(self):
		answer = self.order(self.cola, self.cola)

		self.assertEqual([r.item_code for r in self.lines_of(answer["invoice"])], [self.cola, self.cola])

	def test_the_guest_is_the_guest_again_when_the_order_is_taken(self):
		self.order(self.cola)

		self.assertEqual(frappe.session.user, "Administrator")

	def test_the_user_is_given_back_even_when_the_order_is_refused(self):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.ValidationError):
				guest_ordering.submit_guest_order(self.token.token, json.dumps([]))
			self.assertEqual(frappe.session.user, "Guest")
		finally:
			frappe.set_user("Administrator")
