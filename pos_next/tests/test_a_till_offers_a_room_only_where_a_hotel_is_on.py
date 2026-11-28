# //// Neoffice — added file (no upstream equivalent).
"""« On the room » is offered by the hotel app, never by the till: with no hotel the till shows nothing and refuses everything.

The till reads a provider module declared in the hook `pos_next_room_charge` (`pos_next/room_charge.py`). No provider: not offered, the
two calls of the payment window answer « nothing » or refuse, and a sale that names a room is refused by `submit_invoice` before it is
written. A provider that says its hotel is off: the same. A provider that is on: what it says is what the till shows, locked with its
reason when its accounts are off. A visitor asks nothing.
"""

from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next import room_charge
from pos_next.api import room_charge as api


def a_hotel(status, stays=None):
	"""A provider module, as the hotel app declares it."""
	return SimpleNamespace(
		status=lambda: status,
		search_stays=lambda text: stays or [],
		prepare=lambda invoice, reservation: "CUST",
		post=lambda invoice, reservation: {"folio": "F", "ticket_id": "T", "amount": 1, "duplicate": False},
		room_of=lambda sale: {"room_number": "101", "released": False} if sale == "SALE-ON-ROOM" else None,
		move=lambda invoice, reservation, reason, pin=None: {
			"invoice": invoice,
			"moved_to": reservation,
			"reason": reason,
			"pin": pin,
		},
		release=lambda invoice, reason, pin=None: {
			"invoice": invoice,
			"released": True,
			"reason": reason,
			"pin": pin,
		},
	)


class TestATillOffersARoomOnlyWhereAHotelIsOn(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def with_hotel(self, module):
		return patch.object(room_charge, "provider", return_value=module)

	def test_no_hotel_app_shows_nothing(self):
		with self.with_hotel(None):
			self.assertEqual(room_charge.status(), {"offered": False, "available": False, "reason": None})
			with self.assertRaises(frappe.PermissionError):
				room_charge.require_provider()

	def test_a_hotel_that_is_off_shows_nothing_and_refuses(self):
		with self.with_hotel(a_hotel({"offered": False, "available": False, "reason": "off"})):
			self.assertFalse(room_charge.status()["offered"])
			with self.assertRaises(frappe.PermissionError):
				api.search_stays("101")

	def test_a_hotel_that_is_on_is_offered_and_locked_with_its_reason_when_its_accounts_are_off(self):
		with self.with_hotel(
			a_hotel({"offered": True, "available": False, "reason": "The hotel's accounts are off."})
		):
			self.assertEqual(
				api.status(), {"offered": True, "available": False, "reason": "The hotel's accounts are off."}
			)

	def test_a_hotel_that_is_on_answers_the_search(self):
		found = [{"reservation": "RES-1", "room_number": "101"}]
		with self.with_hotel(a_hotel({"offered": True, "available": True, "reason": None}, found)):
			self.assertEqual(api.search_stays("101"), found)

	def test_a_visitor_asks_nothing(self):
		with self.with_hotel(a_hotel({"offered": True, "available": True, "reason": None})):
			frappe.set_user("Guest")
			with self.assertRaises(frappe.PermissionError):
				api.status()
			with self.assertRaises(frappe.PermissionError):
				api.search_stays("101")

	def test_a_payload_names_its_stay_as_a_dict_or_as_a_name(self):
		self.assertEqual(room_charge.reservation_of({"reservation": "RES-1"}), "RES-1")
		self.assertEqual(room_charge.reservation_of("RES-1"), "RES-1")
		for nothing in (None, "", {}, {"reservation": ""}, ["RES-1"], 3):
			self.assertIsNone(room_charge.reservation_of(nothing))

	def test_the_hook_names_no_provider_on_a_site_without_a_hotel_app(self):
		with patch("frappe.get_hooks", return_value=[]):
			self.assertIsNone(room_charge.provider())

	# -- correcting a meal from the history of invoices ------------------------------------------------------------

	def test_the_history_knows_which_sales_are_on_a_room_and_asks_for_nothing_where_no_hotel_is_on(self):
		with self.with_hotel(a_hotel({"offered": True, "available": True, "reason": None})):
			self.assertEqual(
				api.rooms_of(frappe.as_json(["SALE-ON-ROOM", "SALE-AT-THE-TABLE"])),
				{"SALE-ON-ROOM": {"room_number": "101", "released": False}},
			)
		with self.with_hotel(a_hotel({"offered": False, "available": False, "reason": None})):
			self.assertEqual(api.rooms_of(frappe.as_json(["SALE-ON-ROOM"])), {})
		with self.with_hotel(None):
			self.assertEqual(api.rooms_of(frappe.as_json(["SALE-ON-ROOM"])), {})

	def test_a_move_and_a_release_go_to_the_hotel_with_their_reason_and_pin(self):
		with (
			self.with_hotel(a_hotel({"offered": True, "available": True, "reason": None})),
			patch("frappe.has_permission", return_value=True),
		):
			self.assertEqual(
				api.move_to_room("FA-1", "RES-2", "wrong room", "1234"),
				{"invoice": "FA-1", "moved_to": "RES-2", "reason": "wrong room", "pin": "1234"},
			)
			self.assertEqual(
				api.take_off_the_room("FA-1", "paid at the table"),
				{"invoice": "FA-1", "released": True, "reason": "paid at the table", "pin": None},
			)

	def test_a_move_and_a_release_are_refused_where_no_hotel_is_on_and_to_a_visitor(self):
		with self.with_hotel(None), patch("frappe.has_permission", return_value=True):
			with self.assertRaises(frappe.PermissionError):
				api.move_to_room("FA-1", "RES-2", "wrong room")
			with self.assertRaises(frappe.PermissionError):
				api.take_off_the_room("FA-1", "paid")
		with self.with_hotel(a_hotel({"offered": True, "available": True, "reason": None})):
			frappe.set_user("Guest")
			for call in (
				lambda: api.rooms_of("[]"),
				lambda: api.move_to_room("FA-1", "RES-2", "x"),
				lambda: api.take_off_the_room("FA-1", "x"),
			):
				with self.assertRaises(frappe.PermissionError):
					call()
