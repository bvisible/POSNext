# //// Neoffice — added file (no upstream equivalent).
"""A table of direct service (a bar, a counter) is never seated nor cleaned (product owner, 08.11.2026).

« Un bar, une table, un comptoir doit pouvoir encaisser sans la gestion de table, encaissement direct style je veux un café, le serveur tape et
encaisse direct […] on doit faire une option sur une table […] à la fin de la transaction on revient directement sur cette table pour pouvoir taper
le ticket suivant. »

The flag is the Check `direct_service` of the table. The suite pins what the server does with it: saving or paying a ticket leaves the table's status
alone (it stays Empty, whatever is still at the kitchen), the status hook of an invoice leaves it alone, the floor tells which tables are direct, the
floor plan's editor sets it, and the reservations do not offer it. A table without the flag behaves as it always did (the suites of the notes and of
the paid tables).

The suite builds its own restaurants, tills, menu and orders (those of the notes suite) and rolls everything back. The people it acts as are the waiter
(the cashier of the till) and the restaurant's administrator: never Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

import frappe
from frappe.tests.roles import as_role
from frappe.utils import nowdate

from pos_next.api import reservations
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import direct_service
from pos_next.tests.test_a_paid_table_stays_while_dishes_are_to_serve import ServedCase

BOOKING_ONLINE = {"enable_reservations": 1, "enable_online_reservations": 1}


class DirectCase(ServedCase):
	def setUp(self):
		super().setUp()
		# The bar is T1; T2 stays a table with guests
		frappe.db.set_value("Restaurant Table", self.table_a, direct_service.FIELD, 1)

	def the_floor_table(self, table=None):
		return self.floor()[table or self.table_a]


class TestAPayingTicketLeavesADirectTableAlone(DirectCase):
	def test_the_flag_is_a_check_off_by_default(self):
		field = frappe.get_meta("Restaurant Table").get_field(direct_service.FIELD)

		self.assertEqual((field.fieldtype, cint_default(field)), ("Check", 0))
		self.assertFalse(direct_service.is_direct(self.table_a2))
		self.assertTrue(direct_service.is_direct(self.table_a))
		self.assertFalse(direct_service.is_direct(None))
		self.assertFalse(direct_service.is_direct("a table that does not exist"))

	def test_saving_a_ticket_does_not_seat_a_direct_table(self):
		self.save()

		self.assertEqual(self.status_of_table(), "Empty")

	def test_a_table_beside_it_is_seated_as_ever(self):
		self.save(restaurant_table=self.table_a2)

		self.assertEqual(self.status_of_table(self.table_a2), "Occupied")

	def test_paying_a_ticket_leaves_a_direct_table_empty_whatever_is_still_at_the_kitchen(self):
		for statuses in (["Delivered"], ["Ready"], ["Pending", "Preparing"], [""]):
			with self.subTest(statuses=statuses):
				self.a_paid_order(statuses)

				self.assertEqual(self.status_of_table(), "Empty", "nobody is seated at a bar: nothing to clean, nothing to keep")

	def test_the_status_hook_leaves_a_direct_table_alone(self):
		order = self.a_paid_order(["Ready"])

		for docstatus in (0, 1, 2):
			with self.subTest(docstatus=docstatus):
				frappe.db.set_value("Restaurant Table", self.table_a, "status", "Empty")
				restaurant_api.on_invoice_update(
					frappe._dict(name=order, restaurant_table=self.table_a, docstatus=docstatus), "on_update"
				)
				self.assertEqual(self.status_of_table(), "Empty")

	def test_a_dish_delivered_later_does_not_clean_it(self):
		order = self.a_paid_order(["Ready"])

		self.deliver(order)

		self.assertEqual(self.status_of_table(), "Empty")

	def test_the_ticket_is_still_the_kitchens_and_the_bars(self):
		"""Direct service changes the seating, not the service: the paid ticket stays on the kitchen's screens until it is delivered."""
		order = self.a_paid_order(["Ready"])

		card = self.kitchen_order(order)

		self.assertIsNotNone(card, "the barman still sees what was paid at the counter")
		self.deliver(order)
		self.assertIsNone(self.kitchen_order(order))


class TestTheFloorTellsADirectTable(DirectCase):
	def test_the_floor_tells_which_tables_are_direct(self):
		floor = self.floor()

		self.assertEqual(floor[self.table_a][direct_service.FIELD], 1)
		self.assertEqual(floor[self.table_a2][direct_service.FIELD], 0)

	def test_a_direct_table_with_a_ticket_in_progress_is_not_an_orphan_nor_seated(self):
		self.save()

		tile = self.the_floor_table()

		self.assertEqual(tile["status"], "Empty")

	def test_the_editor_makes_a_table_direct_and_back(self):
		with as_role("client_admin"):
			made = restaurant_api.update_table(name=self.table_a2, direct_service=1)
		self.assertEqual(made["direct_service"], 1)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a2, direct_service.FIELD), 1)

		with as_role("client_admin"):
			restaurant_api.update_table(name=self.table_a2, direct_service="")
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a2, direct_service.FIELD), 1, "a blank is no change")

		with as_role("client_admin"):
			back = restaurant_api.update_table(name=self.table_a2, direct_service=0)
		self.assertEqual(back["direct_service"], 0)
		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a2, direct_service.FIELD), 0)

	def test_the_editor_reads_the_check_as_the_dialog_sends_it(self):
		for sent, stored in ((1, 1), (True, 1), ("1", 1), ("true", 1), (0, 0), ("0", 0), (False, 0), ("no", 0)):
			with self.subTest(sent=sent):
				with as_role("client_admin"):
					restaurant_api.update_table(name=self.table_a2, direct_service=sent)
				self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a2, direct_service.FIELD), stored)

	def test_a_waiter_may_not_make_a_table_direct(self):
		with self.waiter(), self.assertRaises(frappe.PermissionError):
			restaurant_api.update_table(name=self.table_a2, direct_service=1)

		self.assertEqual(frappe.db.get_value("Restaurant Table", self.table_a2, direct_service.FIELD), 0)


class TestADirectTableIsNotABookableTable(DirectCase):
	def test_the_reservations_do_not_offer_it(self):
		frappe.db.set_value("Restaurant", self.a, BOOKING_ONLINE)
		frappe.clear_document_cache("Restaurant")

		with as_role("client_admin"):
			offered = reservations.get_available_tables(nowdate(), "20:00:00", restaurant=self.a)["tables"]

		names = [table["name"] for table in offered]
		self.assertIn(self.table_a2, names)
		self.assertNotIn(self.table_a, names, "nobody books a bar")


def cint_default(field):
	return int(field.default or 0)
