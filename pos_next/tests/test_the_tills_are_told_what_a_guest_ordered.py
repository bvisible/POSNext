# //// Neoffice — added file (no upstream equivalent).
"""The alert a guest's order sends to the tills names the lines of THIS order (NeoRestau lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit
l'info »).

A guest orders from the QR code of a table and the waiter's till has to tell the waiter, with the words of the order: « Table 2 — le client commande : 3 x Verre
de vin ». The till never reads the table to name the lines, so the realtime events carry them: `items` (`item_name`, `qty`; at most `MAX_ALERT_LINES`, the
first ones), and `count` (how many lines the order added, however many are named). The keys the events always had stay (`table`, `invoice`, `items_count`,
`restaurant`): the contract only grows.

The restaurant's mode rides along (`validation_mode`): « Server Approval » holds the lines for the waiter, who must validate them, and the till says so.

The suite builds what it needs (the menu of `test_service_families`, a restaurant, a table, a till) and rolls back.
"""

import json
from unittest.mock import patch

import frappe

from pos_next.api import guest_ordering
from pos_next.tests.test_service_families import DRINKS, ServiceCase, an_item

WINE = "Verre de vin"
SOUP = "Soupe du jour"


class TheTillsAreToldWhatAGuestOrdered(ServiceCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("Item", self.cola, "item_name", WINE)
		frappe.db.set_value("Item", self.soup, "item_name", SOUP)
		self.token = self.a_token()
		self.addCleanup(frappe.set_user, frappe.session.user)

	def a_token(self):
		return frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_a,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)

	def validation(self, mode):
		frappe.db.set_value("Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": mode})
		frappe.clear_document_cache("Restaurant")

	def order(self, *lines):
		"""The guest sends `lines` ((item, qty) pairs); what the tills were told, event by event."""
		items = [{"item_code": code, "qty": qty, "rate": 5} for code, qty in lines]
		frappe.set_user("Guest")
		try:
			with patch.object(frappe, "publish_realtime") as published:
				guest_ordering.submit_guest_order(self.token.token, json.dumps(items))
		finally:
			frappe.set_user("Administrator")
		return {call.args[0]: call.args[1] for call in published.call_args_list if len(call.args) > 1}

	def test_the_tills_are_told_the_names_and_the_quantities_of_the_lines(self):
		self.validation("Direct to Kitchen")

		told = self.order((self.cola, 3), (self.soup, 1))["guest_order_submitted"]

		self.assertEqual(told["items"], [{"item_name": WINE, "qty": 3}, {"item_name": SOUP, "qty": 1}])
		self.assertEqual(told["count"], 2)

	def test_the_keys_the_alert_always_had_are_still_there(self):
		self.validation("Direct to Kitchen")

		told = self.order((self.cola, 1), (self.soup, 1))["guest_order_submitted"]

		self.assertEqual(told["restaurant"], self.a)
		self.assertEqual(told["table"], self.table_a)
		self.assertEqual(told["items_count"], 2)
		self.assertTrue(frappe.db.exists("Sales Invoice", told["invoice"]))

	def test_the_alert_says_what_the_restaurant_does_with_the_lines(self):
		self.validation("Direct to Kitchen")
		self.assertEqual(
			self.order((self.cola, 1))["guest_order_submitted"]["validation_mode"], "Direct to Kitchen"
		)

	def test_a_restaurant_that_validates_the_orders_tells_the_same_lines_in_both_alerts(self):
		self.validation("Server Approval")

		sent = self.order((self.cola, 2), (self.soup, 1))

		for event in ("guest_order_submitted", "guest_order_pending"):
			with self.subTest(event=event):
				self.assertEqual(
					sent[event]["items"], [{"item_name": WINE, "qty": 2}, {"item_name": SOUP, "qty": 1}]
				)
				self.assertEqual(sent[event]["count"], 2)
				self.assertEqual(sent[event]["validation_mode"], "Server Approval")
				self.assertEqual(sent[event]["restaurant"], self.a)

	def test_a_restaurant_that_does_not_validate_sends_no_pending_alert(self):
		self.validation("Direct to Kitchen")
		self.assertNotIn("guest_order_pending", self.order((self.cola, 1)))

	def test_only_the_first_lines_are_named_and_all_of_them_counted(self):
		self.validation("Direct to Kitchen")
		extra = [an_item(f"_Test SF Extra {n}", DRINKS, self.company) for n in range(1, 6)]
		for n, code in enumerate(extra, 1):
			frappe.db.set_value("Item", code, "item_name", f"Extra {n}")

		told = self.order((self.cola, 1), (self.soup, 1), *[(code, 1) for code in extra])[
			"guest_order_submitted"
		]

		self.assertEqual(guest_ordering.MAX_ALERT_LINES, 5)
		self.assertEqual(
			[line["item_name"] for line in told["items"]], [WINE, SOUP, "Extra 1", "Extra 2", "Extra 3"]
		)
		self.assertEqual(told["count"], 7)

	def test_only_the_lines_of_this_order_are_named_when_the_table_already_had_some(self):
		self.validation("Direct to Kitchen")
		self.order((self.cola, 1))

		told = self.order((self.soup, 2))["guest_order_submitted"]

		self.assertEqual(told["items"], [{"item_name": SOUP, "qty": 2}])
		self.assertEqual(told["count"], 1)

	def test_an_order_that_adds_nothing_says_so(self):
		# The same dish sent again is not added a second time (a double tap on « Send »): nothing new, nothing to name
		self.validation("Direct to Kitchen")
		self.order((self.cola, 1))

		told = self.order((self.cola, 1))["guest_order_submitted"]

		self.assertEqual(told["items"], [])
		self.assertEqual(told["count"], 0)

	def test_a_whole_quantity_is_a_whole_number(self):
		self.validation("Direct to Kitchen")

		told = self.order((self.cola, 2))["guest_order_submitted"]

		self.assertIsInstance(told["items"][0]["qty"], int)

	def test_the_names_of_the_lines_are_read_in_one_query(self):
		rows = [frappe._dict(item_code=self.cola, qty=1), frappe._dict(item_code=self.soup, qty=2)]

		with patch.object(frappe, "get_all", wraps=frappe.get_all) as reading:
			lines, count = guest_ordering._lines_of_this_order(rows)

		self.assertEqual(count, 2)
		self.assertEqual([line["item_name"] for line in lines], [WINE, SOUP])
		self.assertEqual([call.args[0] for call in reading.call_args_list], ["Item"])

	def test_an_item_without_a_name_is_named_by_its_code(self):
		rows = [frappe._dict(item_code="_Test SF Nobody Knows", qty=1)]

		lines, _count = guest_ordering._lines_of_this_order(rows)

		self.assertEqual(lines, [{"item_name": "_Test SF Nobody Knows", "qty": 1}])

	def test_no_line_asks_nothing_of_the_database(self):
		with patch.object(frappe, "get_all", wraps=frappe.get_all) as reading:
			self.assertEqual(guest_ordering._lines_of_this_order([]), ([], 0))

		reading.assert_not_called()
