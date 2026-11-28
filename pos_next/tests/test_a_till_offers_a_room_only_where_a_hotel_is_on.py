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
